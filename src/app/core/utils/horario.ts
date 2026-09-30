import { Cita, EstadoCita } from '../models/cita.model';
import { HorarioAtencion } from '../../config/cliente.model';
import { CLIENTE } from '../../config/cliente';

export interface Horario extends HorarioAtencion {
  /** Duración de cada bloque de agenda, en minutos. */
  intervalo: number;
  /** Cuántos días hacia adelante se puede reservar. */
  diasReservables: number;
}

/** Horario del cliente activo, en minutos desde medianoche. */
export const HORARIO: Horario = { ...CLIENTE.horario, intervalo: 30, diasReservables: 14 };

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' en hora local. */
export function claveDia(fecha: Date): string {
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

export function fechaDesdeClave(dia: string, minutos = 0): Date {
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(minutos / 60), minutos % 60);
}

export function minutosAHora24(minutos: number): string {
  return `${pad(Math.floor(minutos / 60))}:${pad(minutos % 60)}`;
}

/** 870 -> '2:30 PM' (mismo formato que usaban las citas existentes). */
export function formatearHora12(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(minutos % 60)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Acepta '2:30 PM', '2:30pm' o '14:30'. Devuelve minutos desde medianoche, o null si no es válida. */
export function parsearHora(texto: string | null | undefined): number | null {
  const match = texto?.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let h = Number(match[1]);
  const m = Number(match[2]);
  const ampm = match[3]?.toUpperCase();
  if (m > 59) return null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return h * 60 + m;
}

// --- Lectura de citas (soporta citas antiguas sin `dia`/`hora`) ---

export function diaDeCita(c: Pick<Cita, 'dia' | 'fecha'>): string {
  return c.dia ?? claveDia(new Date(c.fecha));
}

export function minutosDeCita(c: Pick<Cita, 'hora' | 'horaStr'>): number {
  return parsearHora(c.hora) ?? parsearHora(c.horaStr) ?? 0;
}

export function inicioDeCita(c: Pick<Cita, 'dia' | 'fecha' | 'hora' | 'horaStr'>): Date {
  return fechaDesdeClave(diaDeCita(c), minutosDeCita(c));
}

export function duracionDe(c: { duracionMinutos?: number }): number {
  return c.duracionMinutos && c.duracionMinutos > 0 ? c.duracionMinutos : HORARIO.intervalo;
}

export function compararCitas(a: Cita, b: Cita): number {
  return diaDeCita(a).localeCompare(diaDeCita(b)) || minutosDeCita(a) - minutosDeCita(b);
}

/** Las primeras versiones guardaban 'completado'. */
export function normalizarEstado(estado: string): EstadoCita {
  return (estado === 'completado' ? 'completada' : estado) as EstadoCita;
}

// --- Bloques de agenda (colección `slots`) ---

export interface Slot {
  id: string;
  barberoId: string;
  dia: string;
  hora: string;
}

/** Bloques de 30 min que ocupa un servicio. Un servicio de 90 min que empieza a las 10:00 ocupa 10:00, 10:30 y 11:00. */
export function slotsDeCita(barberoId: string, dia: string, inicio: number, duracion: number): Slot[] {
  const slots: Slot[] = [];
  for (let t = inicio; t < inicio + duracion; t += HORARIO.intervalo) {
    const hora = minutosAHora24(t);
    slots.push({ id: `${barberoId}_${dia}_${hora.replace(':', '')}`, barberoId, dia, hora });
  }
  return slots;
}

export interface HorarioDisponible {
  minutos: number;
  etiqueta: string;
  /** Barberos (de los candidatos) que tienen libres todos los bloques del servicio a esa hora. */
  barberosLibres: string[];
}

export function horariosDisponibles(opciones: {
  dia: string;
  duracion: number;
  barberos: string[];
  ocupados: ReadonlySet<string>;
  ahora?: Date;
  horario?: Horario;
}): HorarioDisponible[] {
  const { dia, duracion, barberos, ocupados, ahora = new Date(), horario = HORARIO } = opciones;
  const hoy = claveDia(ahora);
  if (dia < hoy) return [];
  const minutosAhora = dia === hoy ? ahora.getHours() * 60 + ahora.getMinutes() : -1;

  const resultado: HorarioDisponible[] = [];
  for (let inicio = horario.apertura; inicio + duracion <= horario.cierre; inicio += horario.intervalo) {
    if (inicio <= minutosAhora) continue;
    const barberosLibres = barberos.filter((b) =>
      slotsDeCita(b, dia, inicio, duracion).every((s) => !ocupados.has(s.id)),
    );
    if (barberosLibres.length > 0) {
      resultado.push({ minutos: inicio, etiqueta: formatearHora12(inicio), barberosLibres });
    }
  }
  return resultado;
}

/** Próximos días en que se puede reservar (excluye los días cerrados). */
export function diasReservables(desde = new Date(), horario: Horario = HORARIO): Date[] {
  const dias: Date[] = [];
  for (let i = 0; i < horario.diasReservables; i++) {
    const fecha = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + i);
    if (!horario.diasCerrados.includes(fecha.getDay())) dias.push(fecha);
  }
  return dias;
}

/** Todas las horas de inicio del día, para selectores. */
export function opcionesDeHora(horario: Horario = HORARIO): { minutos: number; etiqueta: string }[] {
  const opciones = [];
  for (let t = horario.apertura; t < horario.cierre; t += horario.intervalo) {
    opciones.push({ minutos: t, etiqueta: formatearHora12(t) });
  }
  return opciones;
}

const NOMBRES_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Resumen legible del horario semanal, agrupando días consecutivos:
 * [{ dias: 'Lun – Sáb', horas: '10:00 AM – 8:00 PM' }, { dias: 'Dom', horas: 'Cerrado' }]
 */
export function resumenHorario(horario: HorarioAtencion = HORARIO): { dias: string; horas: string; abierto: boolean }[] {
  const semana = [1, 2, 3, 4, 5, 6, 0]; // de lunes a domingo
  const horas = `${formatearHora12(horario.apertura)} – ${formatearHora12(horario.cierre)}`;
  const grupos: { desde: number; hasta: number; abierto: boolean }[] = [];
  for (const dia of semana) {
    const abierto = !horario.diasCerrados.includes(dia);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.abierto === abierto) ultimo.hasta = dia;
    else grupos.push({ desde: dia, hasta: dia, abierto });
  }
  return grupos.map(g => ({
    dias: g.desde === g.hasta ? NOMBRES_DIA[g.desde] : `${NOMBRES_DIA[g.desde]} – ${NOMBRES_DIA[g.hasta]}`,
    horas: g.abierto ? horas : 'Cerrado',
    abierto: g.abierto,
  }));
}
