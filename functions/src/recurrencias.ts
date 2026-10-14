/**
 * Agendas recurrentes: el plan de cada serie (qué días, qué bloques, qué cita) sin tocar la base de datos.
 * Lo que escribe en Firestore está en agenda-recurrente.ts; los disparadores, en index.ts.
 *
 * Debe coincidir con la página: src/app/core/models/recurrencia.model.ts (días de la serie) y
 * src/app/core/utils/horario.ts (bloques de 20 min, IDs de `slots`, hora de 12 h y estaLibre).
 */

export type Frecuencia = 'semanal' | 'quincenal' | 'mensual';

/** Semanas entre un turno y el siguiente. "Mensual" es cada 4 semanas: así cae siempre el mismo día de la semana. */
export const SEMANAS: Record<Frecuencia, number> = { semanal: 1, quincenal: 2, mensual: 4 };

/**
 * Hasta cuántos días adelante quedan apartados los turnos. Es lo más lejos que puede reservar un cliente
 * (las reglas no aceptan una reserva a más de 62 días): así nadie toma antes la hora de un cliente fijo.
 */
export const HORIZONTE_DIAS = 62;

/** Duración de cada documento de `slots`, en minutos (BLOQUE en la página y en las reglas). */
export const BLOQUE = 20;

/** Lo que guarda el panel en `recurrencias/{id}` (y lo que anota la función al apartar los turnos). */
export interface Recurrencia {
  clienteNombre: string;
  /** Celular de 10 dígitos, o vacío. */
  clienteTelefono: string;
  servicioId: string;
  serviceName: string;
  precio: number;
  /** La elige el admin (múltiplo de 20): puede ser distinta de la del catálogo. */
  duracionMinutos: number;
  barberoId: string;
  barberoNombre: string;
  frecuencia: Frecuencia;
  /** 'HH:mm', en la rejilla de 20 min. */
  hora: string;
  /** Primer día de la serie ('YYYY-MM-DD'). Los demás salen de sumarle 1, 2 o 4 semanas. */
  desde: string;
  activa: boolean;
  creadoEn?: string;
  /** Cambia con cada edición del panel: la función agenda cada versión una sola vez. */
  actualizadoEn: string;
  // --- Lo anota la función ---
  /** Último día que ya se revisó (agendado u omitido). */
  generadaHasta?: string;
  /** `actualizadoEn` de la versión que ya quedó agendada. */
  procesadaEn?: string;
  /** Días por venir que no se pudieron agendar, y por qué. */
  omitidas?: Omitida[];
}

export interface Omitida {
  dia: string;
  motivo: string;
}

/** Lo que se usa del horario guardado en `ajustes/sitio`. */
export interface HorarioGuardado {
  diasCerrados?: number[];
  cierres?: string[];
}

/** Lo que se usa del perfil público del barbero (`barberos/{id}`). */
export interface BarberoGuardado {
  nombre?: string;
  diasLibres?: number[] | null;
  descanso?: { desde: number; hasta: number } | null;
}

const ES_DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ES_HORA = /^([01]\d|2[0-3]):(00|20|40)$/;

// --- Fechas 'YYYY-MM-DD' como días de calendario (en UTC, para que ninguna zona horaria las mueva) ---

const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const pad = (n: number) => String(n).padStart(2, '0');

export function sumarDias(dia: string, dias: number): string {
  return new Date(aFecha(dia).getTime() + dias * 86_400_000).toISOString().slice(0, 10);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000);
}

/** 0 = domingo ... 6 = sábado (como en la página). */
export function diaDeLaSemana(dia: string): number {
  return aFecha(dia).getUTCDay();
}

/** Hoy en Colombia ('YYYY-MM-DD'). */
export function hoyEnColombia(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

export function minutosDe(hora: string): number {
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
}

const hora24 = (minutos: number) => `${pad(Math.floor(minutos / 60))}:${pad(minutos % 60)}`;

/** '17:20' -> '5:20 PM' (lo mismo que formatearHora12 en la página). */
export function hora12(hora: string): string {
  const minutos = minutosDe(hora);
  const h = Math.floor(minutos / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(minutos % 60)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Inicio del turno ese día. Colombia no tiene horario de verano: siempre UTC-5. */
export function inicioDelTurno(dia: string, hora: string): Date {
  return new Date(`${dia}T${hora}:00-05:00`);
}

/**
 * Días de la serie (uno cada 1, 2 o 4 semanas desde `desde`) entre `inicio` y `fin`, los dos incluidos.
 * Igual que fechasDeLaSerie en src/app/core/models/recurrencia.model.ts.
 */
export function fechasDeLaSerie(serie: Pick<Recurrencia, 'desde' | 'frecuencia'>, inicio: string, fin: string): string[] {
  const semanas = SEMANAS[serie.frecuencia];
  if (!semanas || !ES_DIA.test(serie.desde) || !ES_DIA.test(inicio) || !ES_DIA.test(fin)) return [];
  const paso = semanas * 7;
  // El primer turno que cae en `inicio` o después.
  const saltos = Math.max(0, Math.ceil(diasEntre(serie.desde, inicio) / paso));
  const fechas: string[] = [];
  for (let dia = sumarDias(serie.desde, saltos * paso); dia <= fin; dia = sumarDias(dia, paso)) fechas.push(dia);
  return fechas;
}

// --- Bloques de la agenda (colección `slots`) ---

export function idDeSlot(barberoId: string, dia: string, minutos: number): string {
  return `${barberoId}_${dia}_${hora24(minutos).replace(':', '')}`;
}

/** Bloques de 20 min que ocupa el turno: uno de 60 min a las 10:00 ocupa 10:00, 10:20 y 10:40. */
export function bloquesDelTurno(barberoId: string, dia: string, hora: string, duracion: number): { id: string; hora: string }[] {
  const inicio = minutosDe(hora);
  const bloques: { id: string; hora: string }[] = [];
  for (let t = inicio; t < inicio + duracion; t += BLOQUE) bloques.push({ id: idDeSlot(barberoId, dia, t), hora: hora24(t) });
  return bloques;
}

/**
 * Los bloques que hay que mirar para saber si el turno está libre: los suyos y los "de y media" que dejaron las
 * citas guardadas antes del cambio a bloques de 20 min (con la hora en punto que les sigue). Ver estaLibre.
 */
export function bloquesAConsultar(barberoId: string, dia: string, hora: string, duracion: number): string[] {
  const inicio = minutosDe(hora);
  const fin = inicio + Math.ceil(duracion / BLOQUE) * BLOQUE;
  const ids = bloquesDelTurno(barberoId, dia, hora, duracion).map(b => b.id);
  for (let yMedia = Math.floor(inicio / 60) * 60 - 90; yMedia < fin; yMedia += 60) {
    if (yMedia < 0) continue;
    ids.push(idDeSlot(barberoId, dia, yMedia), idDeSlot(barberoId, dia, yMedia + 30));
  }
  return [...new Set(ids)];
}

/** ¿El turno está libre, dados los bloques que ya existen? Copia de estaLibre en src/app/core/utils/horario.ts. */
export function estaLibre(barberoId: string, dia: string, hora: string, duracion: number, ocupados: ReadonlySet<string>): boolean {
  if (bloquesDelTurno(barberoId, dia, hora, duracion).some(b => ocupados.has(b.id))) return false;
  const inicio = minutosDe(hora);
  const fin = inicio + Math.ceil(duracion / BLOQUE) * BLOQUE;
  for (let yMedia = Math.floor(inicio / 60) * 60 - 90; yMedia < fin; yMedia += 60) {
    if (!ocupados.has(idDeSlot(barberoId, dia, yMedia))) continue;
    if (yMedia + 30 > inicio) return false;
    if (yMedia + 60 > inicio && ocupados.has(idDeSlot(barberoId, dia, yMedia + 30))) return false;
  }
  return true;
}

// --- La cita de cada día ---

/** ID fijo de la cita de un día de la serie: así una serie nunca agenda dos veces el mismo día. */
export function idDeCita(recurrenciaId: string, dia: string): string {
  return `${recurrenciaId}_${dia.replace(/-/g, '')}`;
}

const primerNombre = (nombre: string | undefined) => (nombre ?? '').trim().split(/\s+/)[0] || 'el barbero';

/**
 * Por qué ese día no se agenda, o null si se puede. Aquí solo lo que se sabe sin mirar la agenda: la barbería
 * cerrada, el día libre o el descanso del barbero. Lo ya ocupado se mira al agendar (en una transacción).
 */
export function motivoParaOmitir(dia: string, serie: Recurrencia, horario: HorarioGuardado | undefined, barbero: BarberoGuardado | undefined): string | null {
  if (!barbero) return `${serie.barberoNombre || 'El barbero'} ya no está en el equipo`;
  if (horario?.cierres?.includes(dia)) return 'La barbería cierra ese día';
  const semana = diaDeLaSemana(dia);
  if (horario?.diasCerrados?.includes(semana)) return 'La barbería no abre ese día';
  const nombre = primerNombre(barbero.nombre ?? serie.barberoNombre);
  if (barbero.diasLibres?.includes(semana)) return `Es el día libre de ${nombre}`;
  const inicio = minutosDe(serie.hora);
  const descanso = barbero.descanso;
  if (descanso && inicio < descanso.hasta && inicio + serie.duracionMinutos > descanso.desde) return `Se cruza con el descanso de ${nombre}`;
  return null;
}

/** Por qué no se pudo agendar un día que ya estaba ocupado: un rato que cerró el barbero o la cita de otra persona. */
export function motivoOcupado(serie: Recurrencia, barbero: BarberoGuardado | undefined, esCierre: boolean): string {
  return esCierre ? `${primerNombre(barbero?.nombre ?? serie.barberoNombre)} cerró ese rato` : 'Ya hay otra cita a esa hora';
}

/**
 * La cita de ese día: lo mismo que guarda el panel al agendar una cita (sin cuenta ni cupo), más la serie.
 * Sin correo del cliente: los turnos recurrentes no envían correos.
 */
export function citaDeLaSerie(serie: Recurrencia, recurrenciaId: string, dia: string, ahora = new Date()) {
  return {
    userId: '',
    userName: serie.clienteNombre,
    userEmail: '',
    phone: serie.clienteTelefono,
    servicioId: serie.servicioId,
    serviceName: serie.serviceName,
    precio: serie.precio,
    duracionMinutos: serie.duracionMinutos,
    barberoId: serie.barberoId,
    barberoNombre: serie.barberoNombre,
    dia,
    hora: serie.hora,
    horaStr: hora12(serie.hora),
    fecha: inicioDelTurno(dia, serie.hora).toISOString(),
    estado: 'pendiente',
    creadoEn: ahora.toISOString(),
    slotIds: bloquesDelTurno(serie.barberoId, dia, serie.hora, serie.duracionMinutos).map(b => b.id),
    recurrenciaId,
    frecuencia: serie.frecuencia,
  };
}

/** ¿El documento trae lo necesario para agendar? (las reglas ya lo exigen; esto cubre uno dañado o a medias). */
export function esValida(serie: Partial<Recurrencia> | undefined): serie is Recurrencia {
  return !!serie
    && typeof serie.clienteNombre === 'string' && serie.clienteNombre.trim() !== ''
    && typeof serie.barberoId === 'string' && serie.barberoId !== ''
    && typeof serie.frecuencia === 'string' && serie.frecuencia in SEMANAS
    && typeof serie.hora === 'string' && ES_HORA.test(serie.hora)
    && typeof serie.desde === 'string' && ES_DIA.test(serie.desde)
    && Number.isInteger(serie.duracionMinutos) && serie.duracionMinutos! >= BLOQUE && serie.duracionMinutos! % BLOQUE === 0
    && minutosDe(serie.hora) + serie.duracionMinutos! <= 24 * 60
    && typeof serie.actualizadoEn === 'string';
}
