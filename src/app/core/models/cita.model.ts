export type EstadoCita = 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no-asistio';

/** Estados en los que la cita sigue ocupando el horario del barbero. */
export const ESTADOS_ACTIVOS: readonly EstadoCita[] = ['pendiente', 'confirmada'];

/**
 * Valor de barberoId cuando no hay barberos registrados en la colección `barberos`.
 * Si hay staff, al reservar con "Cualquiera" se asigna un barbero concreto.
 */
export const BARBERO_CUALQUIERA = 'cualquiera';

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
}

export type NuevaCita = Omit<Cita, 'id' | 'estado' | 'creadoEn' | 'slotIds' | 'dia' | 'hora'> & {
  dia: string;
  hora: string;
};

export function esActiva(estado: EstadoCita): boolean {
  return ESTADOS_ACTIVOS.includes(estado);
}
