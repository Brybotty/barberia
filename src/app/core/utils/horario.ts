import { Cita, EstadoCita } from '../models/cita.model';
import { HorarioAtencion } from '../../config/cliente.model';
import { CLIENTE } from '../../config/cliente';

/** Cada cuánto empieza un turno en la agenda, en minutos, contando desde la hora de apertura del día. */
export const INTERVALO = 40;
/**
 * Duración de cada bloque que se guarda en `slots`, en minutos. Las reglas de Firestore suponen lo mismo.
 * Es más corto que el turno porque no todos los días abren a la misma hora (9:20 unos, 9:00 otros): con
 * bloques de 20 min, dos citas que se cruzan comparten siempre algún bloque, empiecen en la rejilla que empiecen.
 * Las horas de apertura y de cierre deben ser múltiplos de este valor.
 */
export const BLOQUE = 20;
/** Cuántos días hacia adelante se puede reservar con la agenda continua. Las reglas de Firestore suponen lo mismo. */
export const DIAS_RESERVABLES = 14;
/** Lo más lejos que puede llegar un periodo de agenda, en días desde hoy (las reglas rechazan una reserva más lejana). */
export const MAX_DIAS_AGENDA = 60;
/** Bloques que puede ocupar una reserva en línea (las reglas no dejan pasar de aquí): 2 h 20 min. */
export const MAX_BLOQUES_EN_LINEA = 7;
/** Bloques de una cita que el cliente puede cambiar de horario por su cuenta (ver MisCitasComponent.sePuedeCambiar). */
export const MAX_BLOQUES_REAGENDAR = 4;

export interface Horario extends HorarioAtencion {
  intervalo: number;
  diasReservables: number;
}

export function horarioCompleto(horario: HorarioAtencion): Horario {
  return { ...horario, cierres: horario.cierres ?? [], intervalo: INTERVALO, diasReservables: DIAS_RESERVABLES };
}

/** Hora de apertura de un día de la semana (0 = domingo): la suya si abre a otra hora, o la general. */
export function aperturaDe(horario: HorarioAtencion, diaSemana: number): number {
  return horario.aperturas?.[diaSemana] ?? horario.apertura;
}

/** Horas a las que empieza un turno ese día de la semana, para un servicio de esa duración. */
export function turnosDelDia(horario: HorarioAtencion, diaSemana: number, duracion = INTERVALO): number[] {
  const turnos: number[] = [];
  for (let t = aperturaDe(horario, diaSemana); t + duracion <= horario.cierre; t += INTERVALO) turnos.push(t);
  return turnos;
}

/** La apertura más temprana de la semana, entre los días que abre. */
export function primeraApertura(horario: HorarioAtencion): number {
  const abiertos = [0, 1, 2, 3, 4, 5, 6].filter(d => !horario.diasCerrados.includes(d));
  return abiertos.length ? Math.min(...abiertos.map(d => aperturaDe(horario, d))) : horario.apertura;
}

/**
 * Horario de la configuración del cliente, en minutos desde medianoche. Es el punto de partida:
 * el vigente lo cambia el admin en Ajustes (ver AjustesService.horario).
 */
export const HORARIO: Horario = horarioCompleto(CLIENTE.horario);

/** Cuándo no trabaja un barbero, además del horario de la barbería. */
export interface Disponibilidad {
  /** Días de la semana libres (0 = domingo ... 6 = sábado). */
  diasLibres?: number[] | null;
  /** Descanso fijo de cada día (almuerzo), en minutos desde medianoche. */
  descanso?: { desde: number; hasta: number } | null;
}

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
  const h = Math.floor(minutos / 60) % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(minutos % 60)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Acepta '2:30 PM', '2:30pm', '14:30' o '1430'. Devuelve minutos desde medianoche, o null si no es válida. */
export function parsearHora(texto: string | null | undefined): number | null {
  const limpio = texto?.trim().replace(/^(\d{2})(\d{2})$/, '$1:$2');
  const match = limpio?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
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
  return c.duracionMinutos && c.duracionMinutos > 0 ? c.duracionMinutos : INTERVALO;
}

/** Bloques de agenda que ocupa una duración (40 min ocupan 2; una hora, 3). */
export function bloquesDe(duracion: number): number {
  return Math.ceil(duracion / BLOQUE);
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
  /** 'HH:mm' */
  hora: string;
  /** Cita que lo ocupa. Los bloqueos del barbero no tienen. */
  citaId?: string;
  /** El barbero cerró este bloque (almuerzo, permiso, día libre). */
  bloqueo?: boolean;
  motivo?: string;
}

export function idDeSlot(barberoId: string, dia: string, minutos: number): string {
  return `${barberoId}_${dia}_${minutosAHora24(minutos).replace(':', '')}`;
}

/** Bloques de 20 min que ocupa un servicio. Uno de 60 min que empieza a las 10:00 ocupa 10:00, 10:20 y 10:40. */
export function slotsDeCita(barberoId: string, dia: string, inicio: number, duracion: number): Slot[] {
  const slots: Slot[] = [];
  for (let t = inicio; t < inicio + duracion; t += BLOQUE) {
    slots.push({ id: idDeSlot(barberoId, dia, t), barberoId, dia, hora: minutosAHora24(t) });
  }
  return slots;
}

/**
 * ¿El barbero tiene libre ese rato? Mira los bloques de 20 min y, además, los de media hora que dejaron las
 * citas y cierres guardados antes del cambio a turnos de 40 min. Esos bloques viejos duran 30 min y los que
 * empiezan "a y media" no caen en la rejilla nueva, así que se comparan por horario y no por su ID. El bloque
 * en punto que sigue a uno de y media es la continuación de esa cita vieja: también cuenta como de 30 min.
 */
export function estaLibre(barberoId: string, dia: string, inicio: number, duracion: number, ocupados: ReadonlySet<string>): boolean {
  if (slotsDeCita(barberoId, dia, inicio, duracion).some(s => ocupados.has(s.id))) return false;
  const fin = inicio + bloquesDe(duracion) * BLOQUE;
  for (let yMedia = Math.floor(inicio / 60) * 60 - 90; yMedia < fin; yMedia += 60) {
    if (!ocupados.has(idDeSlot(barberoId, dia, yMedia))) continue;
    if (yMedia + 30 > inicio) return false;
    if (yMedia + 60 > inicio && ocupados.has(idDeSlot(barberoId, dia, yMedia + 30))) return false;
  }
  return true;
}

/** ¿El barbero trabaja ese día y a esa hora? (sin mirar las citas: solo su día libre y su descanso). */
export function trabaja(disponibilidad: Disponibilidad | undefined, dia: string, inicio: number, duracion: number): boolean {
  if (!disponibilidad) return true;
  if (disponibilidad.diasLibres?.includes(fechaDesdeClave(dia).getDay())) return false;
  const descanso = disponibilidad.descanso;
  return !descanso || inicio >= descanso.hasta || inicio + duracion <= descanso.desde;
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
  /** Día libre y descanso de cada barbero (por id). */
  disponibilidad?: Record<string, Disponibilidad | undefined>;
  ahora?: Date;
  horario?: Horario;
}): HorarioDisponible[] {
  const { dia, duracion, barberos, ocupados, disponibilidad = {}, ahora = new Date(), horario = HORARIO } = opciones;
  const hoy = claveDia(ahora);
  if (dia < hoy || estaCerrado(dia, horario)) return [];
  const minutosAhora = dia === hoy ? ahora.getHours() * 60 + ahora.getMinutes() : -1;

  // Los turnos se cuentan desde la apertura de ese día: 9:20, 10:00, 10:40... o 9:00, 9:40, 10:20...
  const apertura = aperturaDe(horario, fechaDesdeClave(dia).getDay());
  const resultado: HorarioDisponible[] = [];
  for (let inicio = apertura; inicio + duracion <= horario.cierre; inicio += horario.intervalo) {
    if (inicio <= minutosAhora) continue;
    const barberosLibres = barberos.filter((b) =>
      trabaja(disponibilidad[b], dia, inicio, duracion) && estaLibre(b, dia, inicio, duracion, ocupados),
    );
    if (barberosLibres.length > 0) {
      resultado.push({ minutos: inicio, etiqueta: formatearHora12(inicio), barberosLibres });
    }
  }
  return resultado;
}

/** La barbería no abre ese día: es un día cerrado de la semana o una fecha de cierre (festivo, vacaciones). */
export function estaCerrado(dia: string, horario: HorarioAtencion = HORARIO): boolean {
  return horario.diasCerrados.includes(fechaDesdeClave(dia).getDay()) || !!horario.cierres?.includes(dia);
}

/**
 * Próximos días en que se puede reservar (excluye los días cerrados). Con la agenda continua son los
 * siguientes 14; por periodos, solo los que caen entre las fechas que abrió el admin.
 */
export function diasReservables(desde = new Date(), horario: Horario = HORARIO, agenda: Agenda = AGENDA_CONTINUA): Date[] {
  const porPeriodo = agenda.modo === 'periodo';
  const total = porPeriodo ? MAX_DIAS_AGENDA + 1 : horario.diasReservables;
  const dias: Date[] = [];
  for (let i = 0; i < total; i++) {
    const fecha = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + i);
    const clave = claveDia(fecha);
    if (porPeriodo && (clave < agenda.desde || clave > agenda.hasta)) continue;
    if (!estaCerrado(clave, horario)) dias.push(fecha);
  }
  return dias;
}

// --- Agenda de reservas: continua o por periodos que abre el admin (ajustes/sitio.agenda) ---

export interface Agenda {
  /** 'continua': siempre los próximos 14 días. 'periodo': solo entre `desde` y `hasta`. */
  modo: 'continua' | 'periodo';
  /** Primer y último día en que se puede reservar ('YYYY-MM-DD'). Solo cuentan en modo 'periodo'. */
  desde: string;
  hasta: string;
}

export const AGENDA_CONTINUA: Agenda = { modo: 'continua', desde: '', hasta: '' };

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-10-16' -> '16 de octubre'. */
export function diaLargo(dia: string): string {
  const fecha = fechaDesdeClave(dia);
  return `${fecha.getDate()} de ${MESES_LARGOS[fecha.getMonth()]}`;
}

/** Suma días a una clave de día: ('2026-10-01', 15) -> '2026-10-16'. */
export function sumarDias(dia: string, dias: number): string {
  const fecha = fechaDesdeClave(dia);
  return claveDia(new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias));
}

/** Días que van de un día a otro: ('2026-10-01', '2026-10-16') -> 15. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((fechaDesdeClave(hasta).getTime() - fechaDesdeClave(desde).getTime()) / 86_400_000);
}

export interface PeriodoAgenda {
  porPeriodo: boolean;
  /** Queda al menos un día por delante dentro de la agenda. */
  abierta: boolean;
  /** Días que faltan para el último día del periodo (0 = hoy es el último). null con la agenda continua o cerrada. */
  diasRestantes: number | null;
  /** 'Agenda abierta hasta el 16 de octubre', 'Agenda abierta del 17 al 31 de octubre' o 'Agenda cerrada por ahora'. Vacío con la continua. */
  texto: string;
}

/** Cómo está la agenda hoy, para avisarle al cliente (y al admin, cuando le falta poco para cerrar). */
export function periodoDeAgenda(agenda: Agenda, hoy = claveDia(new Date())): PeriodoAgenda {
  if (agenda.modo !== 'periodo') return { porPeriodo: false, abierta: true, diasRestantes: null, texto: '' };
  if (!agenda.desde || !agenda.hasta || agenda.hasta < hoy || agenda.hasta < agenda.desde) {
    return { porPeriodo: true, abierta: false, diasRestantes: null, texto: 'Agenda cerrada por ahora' };
  }
  const mismoMes = agenda.desde.slice(0, 7) === agenda.hasta.slice(0, 7);
  const texto = agenda.desde > hoy
    ? `Agenda abierta del ${mismoMes ? fechaDesdeClave(agenda.desde).getDate() : diaLargo(agenda.desde)} al ${diaLargo(agenda.hasta)}`
    : `Agenda abierta hasta el ${diaLargo(agenda.hasta)}`;
  return { porPeriodo: true, abierta: true, diasRestantes: diasEntre(hoy, agenda.hasta), texto };
}

/** Último día que puede tener un periodo abierto hoy. */
export function topeDeAgenda(hoy = claveDia(new Date())): string {
  return sumarDias(hoy, MAX_DIAS_AGENDA);
}

/**
 * El periodo que resulta de abrir `dias` días más: se cuentan desde el último día abierto o, si el periodo
 * ya terminó (o no había), desde hoy. Nunca pasa del tope.
 */
export function extenderAgenda(agenda: Agenda, dias: number, hoy = claveDia(new Date())): Agenda {
  const vigente = periodoDeAgenda(agenda, hoy).porPeriodo && periodoDeAgenda(agenda, hoy).abierta;
  const hasta = sumarDias(vigente ? agenda.hasta : hoy, dias);
  const tope = topeDeAgenda(hoy);
  return { modo: 'periodo', desde: vigente ? agenda.desde : hoy, hasta: hasta > tope ? tope : hasta };
}

/**
 * Las horas del día cada 20 minutos, para selectores (descansos, cierres, mover una cita): desde la apertura
 * más temprana de la semana. Con `hastaElCierre` incluye la hora de cierre (fin de un rango).
 */
export function opcionesDeHora(horario: HorarioAtencion = HORARIO, hastaElCierre = false): { minutos: number; etiqueta: string }[] {
  const opciones = [];
  for (let t = primeraApertura(horario); hastaElCierre ? t <= horario.cierre : t < horario.cierre; t += BLOQUE) {
    opciones.push({ minutos: t, etiqueta: formatearHora12(t) });
  }
  return opciones;
}

// --- ¿Está abierto ahora? (en la hora de la barbería, sin importar dónde esté quien mira) ---

const ZONA_NEGOCIO = 'America/Bogota';
const DIAS_INGLES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Fecha ('YYYY-MM-DD'), día de la semana (0 = domingo) y minutos desde medianoche en la hora de Colombia. */
export function relojDelNegocio(ahora = new Date()): { fecha: string; dia: number; minutos: number } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_NEGOCIO, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(ahora);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find(p => p.type === tipo)?.value ?? '';
  return {
    fecha: `${valor('year')}-${valor('month')}-${valor('day')}`,
    dia: DIAS_INGLES.indexOf(valor('weekday')),
    minutos: Number(valor('hour')) * 60 + Number(valor('minute')),
  };
}

export interface EstadoNegocio {
  abierto: boolean;
  /** 'Abierto ahora · cierra a las 8:00 PM' o 'Cerrado · abre mañana a las 10:00 AM'. */
  texto: string;
  /** Día de la semana en Colombia (0 = domingo), para resaltar el horario de hoy. */
  dia: number;
}

export function estadoDelNegocio(ahora = new Date(), horario: HorarioAtencion = HORARIO): EstadoNegocio {
  const { fecha, dia, minutos } = relojDelNegocio(ahora);
  const abreHoy = !estaCerrado(fecha, horario);
  const aperturaHoy = aperturaDe(horario, dia);
  if (abreHoy && minutos >= aperturaHoy && minutos < horario.cierre) {
    return { abierto: true, dia, texto: `Abierto ahora · cierra a las ${formatearHora12(horario.cierre)}` };
  }
  if (abreHoy && minutos < aperturaHoy) {
    return { abierto: false, dia, texto: `Cerrado · abre hoy a las ${formatearHora12(aperturaHoy)}` };
  }
  const hoy = fechaDesdeClave(fecha);
  for (let i = 1; i <= 14; i++) {
    const siguiente = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
    if (!estaCerrado(claveDia(siguiente), horario)) {
      const cuando = i === 1 ? 'mañana' : i < 7 ? `el ${DIAS_LARGOS[siguiente.getDay()]}` : `el ${siguiente.getDate()}/${siguiente.getMonth() + 1}`;
      return { abierto: false, dia, texto: `Cerrado · abre ${cuando} a las ${formatearHora12(aperturaDe(horario, siguiente.getDay()))}` };
    }
  }
  return { abierto: false, dia, texto: 'Cerrado' };
}

const NOMBRES_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export interface FilaHorario {
  dias: string;
  horas: string;
  abierto: boolean;
  /** Días de la semana que agrupa (0 = domingo). */
  incluye: number[];
}

/**
 * Resumen legible del horario semanal, agrupando los días seguidos que tienen el mismo horario:
 * [{ dias: 'Lun – Jue', horas: '9:20 AM – 7:40 PM' }, { dias: 'Vie – Sáb', horas: '9:00 AM – 7:40 PM' }, { dias: 'Dom', horas: 'Cerrado' }]
 */
export function resumenHorario(horario: HorarioAtencion = HORARIO): FilaHorario[] {
  const semana = [1, 2, 3, 4, 5, 6, 0]; // de lunes a domingo
  const grupos: { desde: number; hasta: number; horas: string; incluye: number[] }[] = [];
  for (const dia of semana) {
    const horas = horario.diasCerrados.includes(dia)
      ? 'Cerrado'
      : `${formatearHora12(aperturaDe(horario, dia))} – ${formatearHora12(horario.cierre)}`;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.horas === horas) {
      ultimo.hasta = dia;
      ultimo.incluye.push(dia);
    } else {
      grupos.push({ desde: dia, hasta: dia, horas, incluye: [dia] });
    }
  }
  return grupos.map(g => ({
    dias: g.desde === g.hasta ? NOMBRES_DIA[g.desde] : `${NOMBRES_DIA[g.desde]} – ${NOMBRES_DIA[g.hasta]}`,
    horas: g.horas,
    abierto: g.horas !== 'Cerrado',
    incluye: g.incluye,
  }));
}

/** Junta bloques seguidos en rangos: [600, 620, 640, 780] -> [{ desde: 600, hasta: 660 }, { desde: 780, hasta: 800 }]. */
export function rangosDe(minutos: number[]): { desde: number; hasta: number }[] {
  const rangos: { desde: number; hasta: number }[] = [];
  for (const m of [...minutos].sort((a, b) => a - b)) {
    const ultimo = rangos[rangos.length - 1];
    if (ultimo && ultimo.hasta === m) ultimo.hasta = m + BLOQUE;
    else rangos.push({ desde: m, hasta: m + BLOQUE });
  }
  return rangos;
}
