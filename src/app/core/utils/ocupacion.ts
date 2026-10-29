import { Cita, esActiva } from '../models/cita.model';
import {
  Disponibilidad, HORARIO, Horario, INTERVALO, aperturaDe, claveDia, duracionDe, estaCerrado, fechaDesdeClave, formatearHora12,
  minutosDeCita, parsearHora,
} from './horario';

/**
 * Ocupación de la agenda de cada barbero, al minuto (de 5 en 5).
 *
 * Cada barbero tiene un documento por día, `ocupacion/{barberoId}_{dia}`:
 * - `mapa`: 288 caracteres, uno por cada 5 minutos del día. '0' es libre, 'c' una cita y cada motivo de cierre del
 *   barbero tiene su letra (D, A, P, V, O; X sin motivo).
 * - `citas`: el tramo que ocupa cada cita activa, `{citaId: [primeraMarca, marcas]}`. Así se sabe de quién es cada
 *   rato, y al cancelar se suelta solo el suyo.
 *
 * Las reglas de Firestore comprueban cada cambio de un golpe (antes era un documento por cada bloque de 20 min), así
 * que una cita empieza cada 5 minutos y dura lo que dure: el turno siguiente entra justo cuando termina el anterior,
 * sin tiempo muerto. Lo mismo hace la Cloud Function (functions/src/ocupacion.ts): deben dar lo mismo.
 */
export const MARCA = 5;
/** Marcas de 5 minutos en un día. */
export const MARCAS_DIA = 1440 / MARCA;
export const LIBRE = '0';
export const CITA = 'c';

/** Motivos de un cierre de agenda (los mismos que aceptan las reglas) y la letra que los guarda en el mapa. */
export const MOTIVOS_BLOQUEO = ['Descanso', 'Almuerzo', 'Permiso', 'Vacaciones', 'Otro'] as const;
export type MotivoBloqueo = (typeof MOTIVOS_BLOQUEO)[number];
const LETRA_DE_MOTIVO: Record<MotivoBloqueo | '', string> = { '': 'X', Descanso: 'D', Almuerzo: 'A', Permiso: 'P', Vacaciones: 'V', Otro: 'O' };
const MOTIVO_DE_LETRA = Object.fromEntries(Object.entries(LETRA_DE_MOTIVO).map(([m, l]) => [l, m])) as Record<string, MotivoBloqueo | ''>;

export function letraDeMotivo(motivo: MotivoBloqueo | ''): string {
  return LETRA_DE_MOTIVO[motivo] ?? LETRA_DE_MOTIVO[''];
}

export interface Ocupacion {
  id?: string;
  barberoId: string;
  dia: string;
  mapa: string;
  /** Tramo de cada cita activa: [primera marca, cuántas marcas]. */
  citas: Record<string, [number, number]>;
}

export function idOcupacion(barberoId: string, dia: string): string {
  return `${barberoId}_${dia}`;
}

export function mapaVacio(): string {
  return LIBRE.repeat(MARCAS_DIA);
}

/** Marcas que ocupa un rato: [primera, cuántas]. 10:00 por 25 min -> [120, 5]. */
export function tramo(inicio: number, duracion: number): [number, number] {
  return [Math.floor(inicio / MARCA), Math.ceil(duracion / MARCA)];
}

/** ¿Está libre ese rato en el mapa? (sin salirse del día). */
export function estaLibreEn(mapa: string, inicio: number, duracion: number): boolean {
  const [k, n] = tramo(inicio, duracion);
  return k >= 0 && n > 0 && k + n <= MARCAS_DIA && /^0+$/.test(mapa.slice(k, k + n));
}

function cambiarTramo(mapa: string, k: number, n: number, cambio: (marca: string) => string): string {
  return mapa.slice(0, k) + [...mapa.slice(k, k + n)].map(cambio).join('') + mapa.slice(k + n);
}

/** Aparta un tramo para una cita (debe estar libre: eso lo revisa quien llama). */
export function ocupar(mapa: string, k: number, n: number): string {
  return mapa.slice(0, k) + CITA.repeat(n) + mapa.slice(k + n);
}

/** Suelta el tramo de una cita: solo sus marcas de cita (un cierre que hubiera ahí se queda). */
export function liberar(mapa: string, k: number, n: number): string {
  return cambiarTramo(mapa, k, n, m => (m === CITA ? LIBRE : m));
}

/** Cierra lo libre entre dos marcas con la letra del motivo: las citas que ya estén ahí no se tocan. */
export function cerrar(mapa: string, desde: number, hasta: number, motivo: MotivoBloqueo | ''): string {
  const letra = letraDeMotivo(motivo);
  return cambiarTramo(mapa, desde, hasta - desde, m => (m === LIBRE ? letra : m));
}

/** Vuelve a abrir lo cerrado entre dos marcas (las citas siguen en su sitio). */
export function abrir(mapa: string, desde: number, hasta: number): string {
  return cambiarTramo(mapa, desde, hasta - desde, m => (m === LIBRE || m === CITA ? m : LIBRE));
}

/** El mapa sin las citas que cumplan `soltar` (para mover una cita, o volver a apartar una serie, sin chocar consigo misma). */
export function sinCitas(ocupacion: Pick<Ocupacion, 'mapa' | 'citas'>, soltar: (citaId: string) => boolean): string {
  let mapa = ocupacion.mapa;
  for (const [id, [k, n]] of Object.entries(ocupacion.citas ?? {})) if (soltar(id)) mapa = liberar(mapa, k, n);
  return mapa;
}

/** Cuántas marcas de cita tiene el día (para repartir "Cualquier barbero" al que esté menos ocupado). */
export function cargaDe(mapa: string): number {
  let total = 0;
  for (const m of mapa) if (m === CITA) total++;
  return total;
}

/** ¿El rato tiene algo cerrado por el barbero? (para decir por qué no se pudo agendar). */
export function tieneCierre(mapa: string, inicio: number, duracion: number): boolean {
  const [k, n] = tramo(inicio, duracion);
  return [...mapa.slice(k, k + n)].some(m => m !== LIBRE && m !== CITA);
}

export interface Cierre {
  /** Minutos desde medianoche. */
  desde: number;
  hasta: number;
  motivo: MotivoBloqueo | '';
}

/** Los ratos cerrados por el barbero, seguidos y con su motivo: 13:00 a 14:00 · Almuerzo. */
export function cierresDe(mapa: string): Cierre[] {
  const cierres: Cierre[] = [];
  for (let i = 0; i < mapa.length; i++) {
    const letra = mapa[i];
    if (letra === LIBRE || letra === CITA) continue;
    const ultimo = cierres[cierres.length - 1];
    const motivo = MOTIVO_DE_LETRA[letra] ?? '';
    if (ultimo && ultimo.hasta === i * MARCA && ultimo.motivo === motivo) ultimo.hasta += MARCA;
    else cierres.push({ desde: i * MARCA, hasta: (i + 1) * MARCA, motivo });
  }
  return cierres;
}

/**
 * Horas a las que puede empezar un servicio de `duracion` minutos ese día. En cada rato libre (desde que abre, o
 * desde que termina la cita, el cierre o el descanso de antes) va un turno cada `paso` minutos mientras quepa entero.
 * Así el siguiente cliente entra justo cuando sale el anterior: si un cliente fijo va de 10:00 a 10:30, el turno
 * siguiente es a las 10:30 (no a las 10:40), y tras un Barba2 de 10:00 a 11:00, a las 11:00.
 */
export function turnosEncadenados(opciones: {
  mapa: string;
  apertura: number;
  cierre: number;
  duracion: number;
  descanso?: { desde: number; hasta: number } | null;
  paso?: number;
}): number[] {
  const { mapa, apertura, cierre, duracion, descanso, paso = INTERVALO } = opciones;
  const libre = (i: number) => mapa[i] === LIBRE && !(descanso && i * MARCA < descanso.hasta && (i + 1) * MARCA > descanso.desde);
  const fin = Math.min(MARCAS_DIA, Math.floor(cierre / MARCA));
  const turnos: number[] = [];
  let i = Math.max(0, Math.ceil(apertura / MARCA));
  while (i < fin) {
    if (!libre(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < fin && libre(j)) j++;
    for (let t = i * MARCA; t + duracion <= j * MARCA; t += paso) turnos.push(t);
    i = j;
  }
  return turnos;
}

export interface HorarioDisponible {
  minutos: number;
  etiqueta: string;
  /** Barberos (de los candidatos) para quienes esa hora es un turno libre. */
  barberosLibres: string[];
}

/**
 * Horas que se ofrecen para reservar: los turnos encadenados de cada barbero (los que no tienen el día preparado, o
 * no trabajan ese día, no ofrecen nada). Con varios barberos ("Cualquier barbero"), una hora vale para quienes la
 * tienen como turno propio: así a nadie se le abre un hueco por asignarle una hora que no encaja con su agenda.
 */
export function horariosDisponibles(opciones: {
  dia: string;
  duracion: number;
  barberos: string[];
  /** Mapa de cada barbero ese día (por id). */
  mapas: Record<string, string | undefined>;
  /** Día libre y descanso de cada barbero (por id). */
  disponibilidad?: Record<string, Disponibilidad | undefined>;
  ahora?: Date;
  horario?: Horario;
}): HorarioDisponible[] {
  const { dia, duracion, barberos, mapas, disponibilidad = {}, ahora = new Date(), horario = HORARIO } = opciones;
  const hoy = claveDia(ahora);
  if (dia < hoy || estaCerrado(dia, horario)) return [];
  const minutosAhora = dia === hoy ? ahora.getHours() * 60 + ahora.getMinutes() : -1;
  const diaSemana = fechaDesdeClave(dia).getDay();
  const apertura = aperturaDe(horario, diaSemana);

  const porHora = new Map<number, string[]>();
  for (const barbero of barberos) {
    const mapa = mapas[barbero];
    const suya = disponibilidad[barbero];
    if (!mapa || suya?.diasLibres?.includes(diaSemana)) continue;
    for (const t of turnosEncadenados({ mapa, apertura, cierre: horario.cierre, duracion, descanso: suya?.descanso, paso: horario.intervalo })) {
      if (t > minutosAhora) porHora.set(t, [...(porHora.get(t) ?? []), barbero]);
    }
  }
  return [...porHora].sort(([a], [b]) => a - b).map(([minutos, barberosLibres]) => ({ minutos, etiqueta: formatearHora12(minutos), barberosLibres }));
}

/**
 * El día de un barbero armado con lo que había antes de que existiera su documento: sus citas activas (con su hora y
 * su duración exactas) y los cierres de la agenda vieja (documentos de `slots` con `bloqueo`). Esos cierres duraban
 * 20 minutos; los de antes del 2026-10-12, 30 (van a y media, o en punto sin el de "y 20" al lado: ante la duda se
 * cierra de más, nunca de menos). Igual que armarOcupacion en functions/src/ocupacion.ts.
 */
export function armarOcupacion(
  barberoId: string,
  dia: string,
  citas: Pick<Cita, 'id' | 'hora' | 'horaStr' | 'duracionMinutos' | 'estado' | 'barberoId' | 'dia'>[],
  cierresViejos: { hora: string; motivo?: string }[],
): Ocupacion {
  let mapa = mapaVacio();
  const ocupadas: Record<string, [number, number]> = {};
  for (const c of citas) {
    if (!c.id || c.barberoId !== barberoId || c.dia !== dia || !esActiva(c.estado)) continue;
    const [k, n] = tramo(minutosDeCita(c), duracionDe(c));
    if (k < 0 || n <= 0 || k + n > MARCAS_DIA) continue;
    mapa = ocupar(mapa, k, n);
    ocupadas[c.id] = [k, n];
  }
  const horas = new Set(cierresViejos.map(s => parsearHora(s.hora)).filter((m): m is number => m !== null));
  for (const s of cierresViejos) {
    const inicio = parsearHora(s.hora);
    if (inicio === null) continue;
    const minuto = inicio % 60;
    const duracion = minuto === 30 || (minuto === 0 && !horas.has(inicio + 20)) ? 30 : 20;
    const motivo = (MOTIVOS_BLOQUEO as readonly string[]).includes(s.motivo ?? '') ? (s.motivo as MotivoBloqueo) : '';
    const [k, n] = tramo(inicio, duracion);
    mapa = cerrar(mapa, k, Math.min(MARCAS_DIA, k + n), motivo);
  }
  return { barberoId, dia, mapa, citas: ocupadas };
}
