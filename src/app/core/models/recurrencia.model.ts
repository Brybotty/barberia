import { diasEntre, fechaDesdeClave, sumarDias } from '../utils/horario';

/**
 * Agendas recurrentes: clientes que vienen cada semana, cada 2 semanas o cada 4 semanas, siempre el mismo día y a
 * la misma hora. El panel guarda el plan en `recurrencias/{id}`; la Cloud Function programarRecurrencia aparta los
 * turnos (citas y bloques, como una reserva) hasta HORIZONTE_RECURRENTES días adelante y cada noche suma el siguiente.
 */
export type Frecuencia = 'semanal' | 'quincenal' | 'mensual';

export interface OpcionFrecuencia {
  valor: Frecuencia;
  nombre: string;
  /** Cada cuánto, en claro. */
  detalle: string;
  semanas: number;
}

/** "Mensual" es cada 4 semanas: así cae siempre el mismo día de la semana (SEMANAS en functions/src/recurrencias.ts). */
export const FRECUENCIAS: readonly OpcionFrecuencia[] = [
  { valor: 'semanal', nombre: 'Semanal', detalle: 'Cada semana', semanas: 1 },
  { valor: 'quincenal', nombre: 'Quincenal', detalle: 'Cada 2 semanas', semanas: 2 },
  { valor: 'mensual', nombre: 'Mensual', detalle: 'Cada 4 semanas', semanas: 4 },
];

/** Días hacia adelante que quedan apartados (HORIZONTE_DIAS en functions/src/recurrencias.ts). */
export const HORIZONTE_RECURRENTES = 62;

/**
 * Duración de un turno recurrente: de 5 en 5 minutos, hasta 4 horas (lo mismo que aceptan las reglas y la función).
 * En la agenda ocupa justo ese rato (va al minuto, de 5 en 5): el turno siguiente entra cuando termina. Las citas que
 * agenda el equipo desde el panel también eligen su duración así (NuevaCitaComponent).
 */
export const PASO_DURACION = 5;
export const DURACION_MINIMA = PASO_DURACION;
export const DURACION_MAXIMA = 240;

/** Las duraciones que se pueden elegir, de 5 en 5 hasta `maxima`: 5, 10, 15... */
export function duracionesHasta(maxima: number): number[] {
  return Array.from({ length: Math.floor(maxima / PASO_DURACION) }, (_, i) => (i + 1) * PASO_DURACION);
}

/** Las de un turno recurrente: 5, 10, 15... 240. */
export const DURACIONES: readonly number[] = duracionesHasta(DURACION_MAXIMA);

/** La duración válida más cercana (p. ej. a la del catálogo): de 5 en 5 hacia arriba, entre 5 min y `maxima` (4 horas). */
export function duracionRecurrente(minutos: number, maxima = DURACION_MAXIMA): number {
  const redondeada = Math.ceil((Number(minutos) || 0) / PASO_DURACION) * PASO_DURACION;
  return Math.min(maxima, Math.max(DURACION_MINIMA, redondeada));
}

export interface OmitidaRecurrente {
  dia: string;
  motivo: string;
}

export interface Recurrencia {
  id?: string;
  clienteNombre: string;
  /** Celular de 10 dígitos, o vacío. */
  clienteTelefono: string;
  /**
   * Correo del cliente (en minúsculas), o vacío. Con él (o con el celular) el cliente ve sus turnos en "Mis reservas"
   * si entra a la página con ese correo. No se le envían correos por sus turnos.
   */
  clienteCorreo?: string;
  servicioId: string;
  serviceName: string;
  precio: number;
  /** La elige el admin al crearla (de 5 en 5): puede ser distinta de la del catálogo. */
  duracionMinutos: number;
  barberoId: string;
  barberoNombre: string;
  frecuencia: Frecuencia;
  /** 'HH:mm', en la rejilla de 20 min. */
  hora: string;
  /** Primer día de la serie ('YYYY-MM-DD'); el día de la semana sale de aquí. */
  desde: string;
  /** En pausa no aparta turnos (y se quitan los que tenía por venir). */
  activa: boolean;
  creadoEn: string;
  /** Cambia con cada edición: así la función sabe que debe volver a apartar los turnos. */
  actualizadoEn: string;
  // --- Lo anota la Cloud Function ---
  /** Último día que ya revisó (agendado u omitido). */
  generadaHasta?: string;
  /** `actualizadoEn` de la versión que ya quedó agendada. */
  procesadaEn?: string;
  /** Días por venir que no pudo agendar, y por qué (ocupado, festivo, día libre...). */
  omitidas?: OmitidaRecurrente[];
}

/** Lo que escribe el panel. */
export type DatosRecurrencia = Omit<Recurrencia, 'id' | 'creadoEn' | 'actualizadoEn' | 'generadaHasta' | 'procesadaEn' | 'omitidas'>;

export function opcionDe(frecuencia: Frecuencia | undefined): OpcionFrecuencia | undefined {
  return FRECUENCIAS.find(f => f.valor === frecuencia);
}

/**
 * Días de la serie (uno cada 1, 2 o 4 semanas desde `desde`) entre `inicio` y `fin`, los dos incluidos.
 * Igual que fechasDeLaSerie en functions/src/recurrencias.ts: lo que muestra el panel es lo que se aparta.
 */
export function fechasDeLaSerie(desde: string, frecuencia: Frecuencia, inicio: string, fin: string): string[] {
  const semanas = opcionDe(frecuencia)?.semanas;
  if (!semanas || !desde || !inicio || !fin) return [];
  const paso = semanas * 7;
  const saltos = Math.max(0, Math.ceil(diasEntre(desde, inicio) / paso));
  const fechas: string[] = [];
  for (let dia = sumarDias(desde, saltos * paso); dia <= fin; dia = sumarDias(dia, paso)) fechas.push(dia);
  return fechas;
}

/** Los próximos `cuantas` días que caen en ese día de la semana, desde `hoy` (incluido). */
export function proximosDias(diaSemana: number, hoy: string, cuantas: number): string[] {
  const primero = sumarDias(hoy, (diaSemana - fechaDesdeClave(hoy).getDay() + 7) % 7);
  return Array.from({ length: cuantas }, (_, i) => sumarDias(primero, i * 7));
}

/** ¿La Cloud Function ya apartó los turnos de la versión actual? */
export function estaAlDia(recurrencia: Pick<Recurrencia, 'procesadaEn' | 'actualizadoEn'>): boolean {
  return recurrencia.procesadaEn === recurrencia.actualizadoEn;
}
