import { Injectable, NgZone, inject } from '@angular/core';
import {
  Firestore, WriteBatch, collection, doc, getDocs, query, updateDoc, where, writeBatch,
} from '@angular/fire/firestore';
import { Observable, map, of, shareReplay } from 'rxjs';
import { CUPOS_POR_DIA, Cita, EstadoCita, NuevaCita, RESERVAS_POR_DIA, esActiva } from '../models/cita.model';
import { escuchar } from '../utils/firestore';
import {
  BLOQUE, Slot, claveDia, diaDeCita, duracionDe, fechaDesdeClave, formatearHora12, idDeSlot, minutosAHora24, minutosDeCita,
  normalizarEstado, parsearHora, slotsDeCita,
} from '../utils/horario';

/** El horario ya está tomado: otro documento de `slots` ocupa alguno de los bloques. */
export class HorarioNoDisponibleError extends Error {
  constructor() {
    super('El horario seleccionado ya no está disponible.');
  }
}

/** El cliente ya tiene el máximo de reservas activas para ese día. */
export class CupoAgotadoError extends Error {
  constructor() {
    super(`Ya tienes ${RESERVAS_POR_DIA} reservas para ese día.`);
  }
}

/** Motivos de un bloqueo de agenda (los mismos que aceptan las reglas). */
export const MOTIVOS_BLOQUEO = ['Descanso', 'Almuerzo', 'Permiso', 'Vacaciones', 'Otro'] as const;
export type MotivoBloqueo = (typeof MOTIVOS_BLOQUEO)[number];

/** Escrituras por batch al bloquear o desbloquear: las reglas leen un documento por cada bloque y hay un tope por batch. */
const BLOQUES_POR_LOTE = 8;

@Injectable({ providedIn: 'root' })
export class CitasService {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private citasRef = collection(this.firestore, 'citas');
  private slotsRef = collection(this.firestore, 'slots');
  private cuposRef = collection(this.firestore, 'cupos');

  private readonly todas$ = this.escucharCitas(this.citasRef).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  // --- Lecturas ---

  /** Todas las citas. Solo para staff (las reglas lo exigen). */
  todas(): Observable<Cita[]> {
    return this.todas$;
  }

  deUsuario(uid: string): Observable<Cita[]> {
    return this.escucharCitas(query(this.citasRef, where('userId', '==', uid)));
  }

  /** Citas de uno o varios barberos (máx. 30 IDs por consulta 'in'). */
  deBarberos(ids: string[]): Observable<Cita[]> {
    return this.escucharCitas(query(this.citasRef, where('barberoId', 'in', ids.slice(0, 30))));
  }

  creadasDesde(isoFecha: string): Observable<Cita[]> {
    return this.escucharCitas(query(this.citasRef, where('creadoEn', '>', isoFecha)));
  }

  /** IDs de los bloques ocupados en un día (citas y bloqueos). No expone datos de clientes. */
  slotsOcupados(dia: string): Observable<Set<string>> {
    return escuchar<Slot>(this.zone, query(this.slotsRef, where('dia', '==', dia))).pipe(
      map(slots => new Set(slots.map(s => s.id))),
    );
  }

  /**
   * Bloques ocupados de varios días a la vez (hasta 30): los turnos que tendrá una agenda recurrente.
   * Como `slotsOcupados`, sin datos de clientes; quien los pide filtra los del barbero.
   */
  slotsDeDias(dias: string[]): Observable<Slot[]> {
    if (dias.length === 0) return of([]);
    return escuchar<Slot>(this.zone, query(this.slotsRef, where('dia', 'in', dias.slice(0, 30))));
  }

  /** Bloqueos de agenda de hoy en adelante (de todos los barberos; quien los pide filtra los suyos). */
  bloqueosVigentes(): Observable<Slot[]> {
    const hoy = claveDia(new Date());
    return escuchar<Slot>(this.zone, query(this.slotsRef, where('bloqueo', '==', true), where('dia', '>=', hoy)));
  }

  // --- Escrituras ---

  /**
   * Crea la cita, sus bloques y su cupo en un único batch. Los IDs de bloque son deterministas
   * (barbero_dia_hora): si alguno ya existe, las reglas rechazan el batch completo y
   * no se crea nada, lo que evita la doble reserva incluso entre dos clientes simultáneos.
   */
  async reservar(datos: NuevaCita): Promise<Cita> {
    const cupoId = await this.cupoLibre(datos.userId, datos.dia);
    const { ref, cita, slots } = this.prepararCita(datos, cupoId);

    const batch = writeBatch(this.firestore);
    batch.set(ref, cita);
    this.crearSlots(batch, ref.id, slots);
    batch.set(doc(this.cuposRef, cupoId), { userId: datos.userId, dia: datos.dia, citaId: ref.id });
    await this.commit(batch);
    return { ...cita, id: ref.id };
  }

  /**
   * Cita que el admin registra desde el panel (la pidieron por WhatsApp, por teléfono o en el local). No es de
   * ninguna cuenta (`userId` vacío) ni gasta cupo de cliente, pero ocupa sus bloques igual que una reserva:
   * si alguno ya está tomado, las reglas rechazan todo.
   */
  async registrarDesdePanel(datos: NuevaCita): Promise<Cita> {
    const { ref, cita, slots } = this.prepararCita({ ...datos, userId: '' });
    const batch = writeBatch(this.firestore);
    batch.set(ref, cita);
    this.crearSlots(batch, ref.id, slots);
    await this.commit(batch);
    return { ...cita, id: ref.id };
  }

  /**
   * Cambia una cita del cliente a otro día u hora: cancela la anterior y crea la nueva en un solo batch
   * (o pasan las dos cosas o ninguna). La nueva anota a cuál reemplaza, y así llega un solo correo de
   * "cambió de horario" en vez de uno de cancelación y otro de reserva.
   */
  async reagendar(anterior: Cita, datos: NuevaCita): Promise<Cita> {
    const cupoId = await this.cupoLibre(datos.userId, datos.dia, anterior);
    const { ref, cita, slots } = this.prepararCita(datos, cupoId, anterior.id);
    const anteriores = anterior.slotIds ?? [];
    const nuevosIds = slots.map(s => s.id);

    const batch = writeBatch(this.firestore);
    batch.update(doc(this.citasRef, anterior.id!), { estado: 'cancelada', reemplazadaPor: ref.id });
    batch.set(ref, cita);
    // Los bloques que coinciden pasan a la cita nueva; no se pueden borrar y crear en el mismo batch.
    for (const id of anteriores.filter(id => nuevosIds.includes(id))) {
      batch.update(doc(this.slotsRef, id), { citaId: ref.id });
    }
    this.borrarSlots(batch, anteriores.filter(id => !nuevosIds.includes(id)));
    this.crearSlots(batch, ref.id, slots.filter(s => !anteriores.includes(s.id)));
    if (anterior.cupoId) batch.delete(doc(this.cuposRef, anterior.cupoId));
    batch.set(doc(this.cuposRef, cupoId), { userId: datos.userId, dia: datos.dia, citaId: ref.id });
    await this.commit(batch);
    return { ...cita, id: ref.id };
  }

  /** Marca la cita como cancelada y libera sus bloques y su cupo. */
  async cancelar(cita: Cita): Promise<void> {
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.citasRef, cita.id!), { estado: 'cancelada' });
    this.borrarSlots(batch, cita.slotIds ?? []);
    if (cita.cupoId) batch.delete(doc(this.cuposRef, cita.cupoId));
    await batch.commit();
  }

  /** Marca el corte como hecho con el valor que se cobró (para las ganancias del barbero). */
  async completar(cita: Cita, precioFinal: number): Promise<void> {
    await updateDoc(doc(this.citasRef, cita.id!), { estado: 'completada', precioFinal: Math.max(0, Math.round(precioFinal)) });
  }

  async cambiarEstado(cita: Cita, estado: EstadoCita): Promise<void> {
    if (estado === 'cancelada') return this.cancelar(cita);
    await updateDoc(doc(this.citasRef, cita.id!), { estado });
  }

  /** Edición desde el panel de admin. Si cambia día u hora, mueve los bloques de la cita. */
  async actualizar(cita: Cita, cambios: { userName: string; phone: string; dia: string; minutos: number }): Promise<void> {
    const anteriores = cita.slotIds ?? [];
    // Si solo cambian el nombre o el celular, los bloques se quedan como están.
    const seMueve = cambios.dia !== diaDeCita(cita) || cambios.minutos !== minutosDeCita(cita);
    const nuevos = cita.estado === 'cancelada'
      ? []
      : slotsDeCita(cita.barberoId, cambios.dia, cambios.minutos, duracionDe(cita));
    const nuevosIds = seMueve || cita.estado === 'cancelada' ? nuevos.map(s => s.id) : anteriores;

    const batch = writeBatch(this.firestore);
    // Los bloques que se conservan no se tocan: escribir y borrar el mismo documento en un batch no es válido.
    this.borrarSlots(batch, anteriores.filter(id => !nuevosIds.includes(id)));
    this.crearSlots(batch, cita.id!, nuevos.filter(s => nuevosIds.includes(s.id) && !anteriores.includes(s.id)));
    batch.update(doc(this.citasRef, cita.id!), {
      userName: cambios.userName,
      phone: cambios.phone,
      dia: cambios.dia,
      hora: minutosAHora24(cambios.minutos),
      horaStr: formatearHora12(cambios.minutos),
      fecha: fechaDesdeClave(cambios.dia, cambios.minutos).toISOString(),
      slotIds: nuevosIds,
    });
    await this.commit(batch);
  }

  /** Borrado físico (solo admin). */
  async eliminar(cita: Cita): Promise<void> {
    const batch = writeBatch(this.firestore);
    this.borrarSlots(batch, cita.slotIds ?? []);
    if (cita.cupoId) batch.delete(doc(this.cuposRef, cita.cupoId));
    batch.delete(doc(this.citasRef, cita.id!));
    await batch.commit();
  }

  // --- Bloqueos de agenda (el barbero cierra horas en las que no atiende) ---

  /**
   * Cierra los bloques de 20 min entre `desde` y `hasta` (minutos) que estén libres.
   * Devuelve cuántos cerró y cuántos ya estaban ocupados por una cita u otro bloqueo.
   */
  async bloquear(opciones: {
    barberoId: string; dia: string; desde: number; hasta: number; motivo: MotivoBloqueo | ''; ocupados: ReadonlySet<string>;
  }): Promise<{ cerrados: number; ocupados: number }> {
    const { barberoId, dia, desde, hasta, motivo, ocupados } = opciones;
    const libres: Slot[] = [];
    let yaOcupados = 0;
    for (let t = desde; t < hasta; t += BLOQUE) {
      const id = idDeSlot(barberoId, dia, t);
      if (ocupados.has(id)) yaOcupados++;
      else libres.push({ id, barberoId, dia, hora: minutosAHora24(t) });
    }
    for (let i = 0; i < libres.length; i += BLOQUES_POR_LOTE) {
      const batch = writeBatch(this.firestore);
      for (const { id, ...datos } of libres.slice(i, i + BLOQUES_POR_LOTE)) {
        batch.set(doc(this.slotsRef, id), { ...datos, bloqueo: true, motivo });
      }
      await this.commit(batch);
    }
    return { cerrados: libres.length, ocupados: yaOcupados };
  }

  async desbloquear(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += BLOQUES_POR_LOTE) {
      const batch = writeBatch(this.firestore);
      this.borrarSlots(batch, ids.slice(i, i + BLOQUES_POR_LOTE));
      await batch.commit();
    }
  }

  // --- Internos ---

  private prepararCita(datos: NuevaCita, cupoId?: string, reemplazaA?: string) {
    const ref = doc(this.citasRef);
    const inicio = parsearHora(datos.hora) ?? 0;
    const slots = slotsDeCita(datos.barberoId, datos.dia, inicio, duracionDe(datos));
    const cita: Cita = {
      ...datos,
      estado: 'pendiente',
      creadoEn: new Date().toISOString(),
      slotIds: slots.map(s => s.id),
      ...(cupoId ? { cupoId } : {}),
      ...(reemplazaA ? { reemplazaA } : {}),
    };
    return { ref, cita, slots };
  }

  /**
   * Primer cupo libre del cliente para ese día. La página deja RESERVAS_POR_DIA reservas activas por día;
   * las reglas, una más, que es la que usa el reagendar dentro del mismo día.
   */
  private async cupoLibre(uid: string, dia: string, reagendando?: Cita): Promise<string> {
    const usados = await getDocs(query(this.cuposRef, where('userId', '==', uid), where('dia', '==', dia)));
    const ids = new Set(usados.docs.map(d => d.id));
    const queSiguen = usados.docs.filter(d => d.id !== reagendando?.cupoId).length;
    if (queSiguen >= RESERVAS_POR_DIA) throw new CupoAgotadoError();
    for (let n = 1; n <= CUPOS_POR_DIA; n++) {
      const id = `${uid}_${dia}_${n}`;
      if (!ids.has(id)) return id;
    }
    throw new CupoAgotadoError();
  }

  private escucharCitas(consulta: Parameters<typeof escuchar>[1]): Observable<Cita[]> {
    return escuchar<Cita>(this.zone, consulta).pipe(
      map(citas => citas.map(c => ({ ...c, estado: normalizarEstado(c.estado) }))),
    );
  }

  private crearSlots(batch: WriteBatch, citaId: string, slots: Slot[]): void {
    for (const { id, ...datos } of slots) {
      batch.set(doc(this.slotsRef, id), { ...datos, citaId });
    }
  }

  private borrarSlots(batch: WriteBatch, ids: string[]): void {
    for (const id of ids) batch.delete(doc(this.slotsRef, id));
  }

  private async commit(batch: WriteBatch): Promise<void> {
    try {
      await batch.commit();
    } catch (error: any) {
      // Escribir sobre un bloque existente cuenta como 'update', que las reglas prohíben.
      if (error?.code === 'permission-denied') throw new HorarioNoDisponibleError();
      throw error;
    }
  }
}

/** ¿Sigue ocupando un cupo? (para avisar al cliente antes de intentar la reserva). */
export function reservasActivasDelDia(citas: Cita[], dia: string): number {
  return citas.filter(c => esActiva(c.estado) && c.dia === dia).length;
}
