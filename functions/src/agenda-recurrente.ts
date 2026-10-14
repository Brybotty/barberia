/**
 * Agendas recurrentes en Firestore: aparta los turnos de cada serie (citas y bloques, igual que una reserva) y los
 * quita cuando la serie cambia, se pausa o se borra. El plan de cada serie está en recurrencias.ts.
 *
 * Cada día se agenda en una transacción: la cita y sus bloques se crean juntos y solo si ningún bloque existe.
 * Si un cliente reserva esa hora al mismo tiempo, gana uno de los dos (al otro las reglas o la transacción se
 * lo impiden): nunca hay doble reserva.
 */
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import {
  BarberoGuardado, HORIZONTE_DIAS, HorarioGuardado, Omitida, Recurrencia, bloquesAConsultar, bloquesDelTurno, citaDeLaSerie, esValida,
  estaLibre, fechasDeLaSerie, hoyEnColombia, idDeCita, inicioDelTurno, motivoOcupado, motivoParaOmitir, sumarDias,
} from './recurrencias';

/** Días omitidos que se guardan en la serie (los más próximos). */
const MAX_OMITIDAS = 30;

/** Estados de un turno que se puede quitar: los que aún no se atienden. Los atendidos y "no asistió" son historia (y plata). */
const QUITABLES = ['pendiente', 'confirmada', 'cancelada'];

export interface Resultado {
  creadas: number;
  omitidas: Omitida[];
  quitadas: number;
  /** La serie cambió mientras se agendaba: lo termina el disparador de la versión nueva. */
  interrumpida?: boolean;
}

/**
 * Deja la serie al día: aparta sus turnos hasta HORIZONTE_DIAS adelante y anota los días que no pudo agendar.
 * - Con `regenerar` (la serie cambió) primero quita los turnos por venir que ya tenía y los vuelve a crear.
 *   También regenera si la versión actual nunca se terminó de agendar (un disparador que falló).
 * - Sin `regenerar` (la revisión de cada noche) solo agrega los días nuevos, después de `generadaHasta`.
 * - Si la serie está en pausa o ya no existe, solo quita los turnos por venir.
 * Se puede repetir sin miedo: cada día de la serie tiene un ID fijo y se crea una sola vez.
 */
export async function programarSerie(
  db: Firestore,
  recurrenciaId: string,
  opciones: { ahora?: Date; regenerar?: boolean } = {},
): Promise<Resultado> {
  const ahora = opciones.ahora ?? new Date();
  const ref = db.doc(`recurrencias/${recurrenciaId}`);
  const snap = await ref.get();
  const serie = snap.exists ? (snap.data() as Partial<Recurrencia>) : undefined;

  if (!serie || serie.activa !== true || !esValida(serie)) {
    const quitadas = await quitarTurnosPorVenir(db, recurrenciaId, ahora);
    if (serie?.actualizadoEn) await anotar(db, ref, serie.actualizadoEn, { generadaHasta: '', omitidas: [] });
    return { creadas: 0, omitidas: [], quitadas };
  }

  const version = serie.actualizadoEn;
  const regenerar = !!opciones.regenerar || serie.procesadaEn !== version || !serie.generadaHasta;
  const quitadas = regenerar ? await quitarTurnosPorVenir(db, recurrenciaId, ahora) : 0;

  const hoy = hoyEnColombia(ahora);
  const hasta = sumarDias(hoy, HORIZONTE_DIAS);
  const desde = [hoy, serie.desde, regenerar ? '' : sumarDias(serie.generadaHasta!, 1)].sort().pop()!;

  const [sitio, perfil] = await Promise.all([db.doc('ajustes/sitio').get(), db.doc(`barberos/${serie.barberoId}`).get()]);
  const horario = sitio.get('horario') as HorarioGuardado | undefined;
  const barbero = perfil.exists ? (perfil.data() as BarberoGuardado) : undefined;

  const omitidas: Omitida[] = [];
  let creadas = 0;
  for (const dia of fechasDeLaSerie(serie, desde, hasta)) {
    // Un turno que ya pasó no se agenda (p. ej. la serie empieza hoy, a una hora que ya fue).
    if (inicioDelTurno(dia, serie.hora) <= ahora) continue;
    const motivo = motivoParaOmitir(dia, serie, horario, barbero);
    if (motivo) {
      omitidas.push({ dia, motivo });
      continue;
    }
    const resultado = await agendarDia(db, ref, version, recurrenciaId, serie, dia, barbero, ahora);
    if (resultado === 'cambio') return { creadas, omitidas, quitadas, interrumpida: true };
    if (resultado === 'creada') creadas++;
    else if (resultado !== 'existe') omitidas.push(resultado);
  }

  // Al alargar la serie se conservan los avisos de días que aún no llegan; al regenerar empiezan de cero.
  const previas = regenerar ? [] : (serie.omitidas ?? []).filter(o => o.dia >= hoy && !omitidas.some(n => n.dia === o.dia));
  const todas = [...previas, ...omitidas].sort((a, b) => a.dia.localeCompare(b.dia)).slice(0, MAX_OMITIDAS);
  await anotar(db, ref, version, { generadaHasta: hasta, omitidas: todas });
  return { creadas, omitidas, quitadas };
}

/**
 * Agenda un día de la serie: la cita y sus bloques, solo si la serie sigue igual y la hora está libre.
 * Devuelve 'creada', 'existe' (ese día ya estaba agendado, o se quitó a mano), 'cambio' (la serie cambió o se
 * pausó) o el motivo por el que no se pudo.
 */
export async function agendarDia(
  db: Firestore,
  ref: DocumentReference,
  version: string,
  recurrenciaId: string,
  serie: Recurrencia,
  dia: string,
  barbero: BarberoGuardado | undefined,
  ahora = new Date(),
): Promise<'creada' | 'existe' | 'cambio' | Omitida> {
  return db.runTransaction(async tx => {
    const actual = await tx.get(ref);
    if (!actual.exists || actual.get('actualizadoEn') !== version || actual.get('activa') !== true) return 'cambio';

    const citaRef = db.doc(`citas/${idDeCita(recurrenciaId, dia)}`);
    if ((await tx.get(citaRef)).exists) return 'existe';

    const bloques = bloquesDelTurno(serie.barberoId, dia, serie.hora, serie.duracionMinutos);
    const consultados = await tx.getAll(...bloquesAConsultar(serie.barberoId, dia, serie.hora, serie.duracionMinutos).map(id => db.doc(`slots/${id}`)));
    const existentes = consultados.filter(s => s.exists);
    if (!estaLibre(serie.barberoId, dia, serie.hora, serie.duracionMinutos, new Set(existentes.map(s => s.id)))) {
      return { dia, motivo: motivoOcupado(serie, barbero, existentes.some(s => s.get('bloqueo') === true)) };
    }

    tx.create(citaRef, citaDeLaSerie(serie, recurrenciaId, dia, ahora));
    for (const bloque of bloques) {
      tx.create(db.doc(`slots/${bloque.id}`), { barberoId: serie.barberoId, dia, hora: bloque.hora, citaId: citaRef.id });
    }
    return 'creada';
  });
}

/**
 * Quita los turnos de la serie que aún no llegan (pendientes, o cancelados a mano) y suelta sus bloques.
 * Los que ya pasaron o ya se marcaron (hecho, no asistió) se quedan: son el historial y las ganancias.
 */
export async function quitarTurnosPorVenir(db: Firestore, recurrenciaId: string, ahora = new Date()): Promise<number> {
  const citas = await db.collection('citas').where('recurrenciaId', '==', recurrenciaId).get();
  let quitadas = 0;
  for (const doc of citas.docs) {
    const cita = doc.data();
    if (!QUITABLES.includes(cita['estado']) || !(inicioDelTurno(cita['dia'], cita['hora']) > ahora)) continue;
    const quitada = await db.runTransaction(async tx => {
      const actual = await tx.get(doc.ref);
      // Entre la consulta y ahora el barbero pudo marcarla: entonces se queda.
      if (!actual.exists || !QUITABLES.includes(actual.get('estado'))) return false;
      const ids = (actual.get('slotIds') as string[] | undefined) ?? [];
      const bloques = ids.length ? await tx.getAll(...ids.map(id => db.doc(`slots/${id}`))) : [];
      // Solo los bloques que siguen siendo suyos (si estaba cancelada, otra cita pudo tomarlos).
      for (const bloque of bloques) if (bloque.exists && bloque.get('citaId') === doc.id) tx.delete(bloque.ref);
      tx.delete(doc.ref);
      return true;
    });
    if (quitada) quitadas++;
  }
  return quitadas;
}

/** Anota el avance en la serie, solo si sigue siendo la misma versión (si la editaron, lo anota la siguiente pasada). */
async function anotar(db: Firestore, ref: DocumentReference, version: string, campos: { generadaHasta: string; omitidas: Omitida[] }): Promise<void> {
  await db.runTransaction(async tx => {
    const actual = await tx.get(ref);
    if (!actual.exists || actual.get('actualizadoEn') !== version) return;
    tx.update(ref, { ...campos, procesadaEn: version });
  });
}
