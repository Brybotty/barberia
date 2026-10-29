import type { Frecuencia } from './recurrencia.model';

export type EstadoCita = 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no-asistio';

/** Estados en los que la cita sigue ocupando el horario del barbero. */
export const ESTADOS_ACTIVOS: readonly EstadoCita[] = ['pendiente', 'confirmada'];

/**
 * Valor de barberoId cuando no hay barberos registrados en la colección `barberos`.
 * Si hay staff, al reservar con "Cualquiera" se asigna un barbero concreto.
 */
export const BARBERO_CUALQUIERA = 'cualquiera';

/** Reservas activas que la página deja tener a un cliente para un mismo día. */
export const RESERVAS_POR_DIA = 2;
/** Cupos por día que aceptan las reglas (uno más que RESERVAS_POR_DIA: lo usa el reagendar). */
export const CUPOS_POR_DIA = 3;

export interface Cita {
  id?: string;
  userId: string;
  userName: string;
  userEmail: string;
  phone: string;
  servicioId: string;
  serviceName: string;
  precio: number;
  duracionMinutos: number;
  barberoId: string;
  barberoNombre: string;
  /** ISO del inicio de la cita. En citas antiguas solo la fecha es confiable, no la hora. */
  fecha: string;
  /** Día local 'YYYY-MM-DD'. No existe en citas antiguas: usar diaDeCita(). */
  dia?: string;
  /** Hora de inicio 'HH:mm' (24h). No existe en citas antiguas: usar minutosDeCita(). */
  hora?: string;
  /** Hora para mostrar, p. ej. '2:30 PM'. */
  horaStr: string;
  estado: EstadoCita;
  /** Valor realmente cobrado al completar (servicios "Desde", extras...). Si falta, se usa `precio`. */
  precioFinal?: number;
  creadoEn: string;
  /** IDs de los documentos de `slots` que bloquea esta cita. */
  slotIds?: string[];
  /** Documento de `cupos` que ocupa ({uid}_{dia}_{n}): limita las reservas de un cliente por día. */
  cupoId?: string;
  /** Al reagendar: la cita anterior que esta reemplaza. */
  reemplazaA?: string;
  /** Al reagendar: la cita nueva que reemplazó a esta (queda cancelada). */
  reemplazadaPor?: string;
  /**
   * Turno de una agenda recurrente (`recurrencias/{id}`): lo apartó la Cloud Function, no es de ninguna cuenta
   * y no envía correos. Su ID es `{recurrenciaId}_{AAAAMMDD}`.
   */
  recurrenciaId?: string;
  /** Cada cuánto viene el cliente (para marcarlo en la agenda sin leer la serie). */
  frecuencia?: Frecuencia;
  /**
   * 'barbero': se la agendó el propio barbero desde su panel. No es de ninguna cuenta, no lleva correo del cliente y
   * a él no le llega aviso por correo de su propia cita.
   */
  origen?: 'barbero';
  /** Multa (en pesos) por no asistir: solo en una cita "No asistió". Se cobra en la siguiente visita del cliente. */
  multa?: number;
  /** Multa que el cliente pagó en esta cita (una "Hecho"): salda lo que debía de citas anteriores. */
  multaCobrada?: number;
}

export type NuevaCita = Omit<Cita, 'id' | 'estado' | 'creadoEn' | 'slotIds' | 'dia' | 'hora' | 'cupoId' | 'reemplazaA' | 'reemplazadaPor' | 'precioFinal' | 'recurrenciaId' | 'frecuencia' | 'origen' | 'multa' | 'multaCobrada'> & {
  dia: string;
  hora: string;
};

export function esActiva(estado: EstadoCita): boolean {
  return ESTADOS_ACTIVOS.includes(estado);
}

/**
 * Cómo se le dice a cada quien el estado de la cita. Al cliente no se le muestra "pendiente":
 * la reserva queda en firme al hacerla, no espera la confirmación de nadie.
 */
export function etiquetaEstado(cita: Pick<Cita, 'estado' | 'reemplazadaPor'>, para: 'cliente' | 'equipo' = 'equipo'): string {
  switch (cita.estado) {
    case 'pendiente':
    case 'confirmada':
      return 'Agendada';
    case 'completada':
      return para === 'cliente' ? 'Atendida' : 'Hecho';
    case 'no-asistio':
      return para === 'cliente' ? 'No asististe' : 'No asistió';
    case 'cancelada':
      return cita.reemplazadaPor ? 'Reagendada' : 'Cancelada';
  }
}
