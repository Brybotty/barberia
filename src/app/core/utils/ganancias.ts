import { Barbero } from '../models/barbero.model';
import { Cita } from '../models/cita.model';
import { claveDia, diaDeCita } from './horario';

/** Períodos para ver cortes y ganancias. La semana empieza el lunes. */
export type Periodo = 'hoy' | 'semana' | 'mes' | 'mes-anterior' | 'todo';

export const PERIODOS: { valor: Periodo; nombre: string }[] = [
  { valor: 'hoy', nombre: 'Hoy' },
  { valor: 'semana', nombre: 'Esta semana' },
  { valor: 'mes', nombre: 'Este mes' },
  { valor: 'mes-anterior', nombre: 'Mes anterior' },
  { valor: 'todo', nombre: 'Todo' },
];

/** Días (claves 'YYYY-MM-DD', inclusive) que abarca el período. null = sin límite. */
export function rangoDe(periodo: Periodo, hoy = new Date()): { desde: string; hasta: string } | null {
  const dia = (d: Date) => claveDia(d);
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  switch (periodo) {
    case 'hoy':
      return { desde: dia(base), hasta: dia(base) };
    case 'semana': {
      const lunes = new Date(base);
      lunes.setDate(base.getDate() - ((base.getDay() + 6) % 7));
      return { desde: dia(lunes), hasta: dia(base) };
    }
    case 'mes':
      return { desde: dia(new Date(base.getFullYear(), base.getMonth(), 1)), hasta: dia(base) };
    case 'mes-anterior':
      return {
        desde: dia(new Date(base.getFullYear(), base.getMonth() - 1, 1)),
        hasta: dia(new Date(base.getFullYear(), base.getMonth(), 0)),
      };
    case 'todo':
      return null;
  }
}

export function enPeriodo(cita: Cita, rango: { desde: string; hasta: string } | null): boolean {
  if (!rango) return true;
  const dia = diaDeCita(cita);
  return dia >= rango.desde && dia <= rango.hasta;
}

/** Lo que se cobró por la cita: el valor registrado al completarla o, si no hay, el precio reservado. */
export function valorCobrado(cita: Cita): number {
  return Number(cita.precioFinal ?? cita.precio) || 0;
}

/** % del servicio que gana el barbero. Sin definir se toma 100 (p. ej. el dueño que también corta). */
export function comisionDe(barbero: Pick<Barbero, 'comision'> | null | undefined): number {
  const valor = barbero?.comision as unknown;
  if (valor === undefined || valor === null || valor === '') return 100;
  const comision = Number(valor);
  return Number.isFinite(comision) ? Math.min(100, Math.max(0, comision)) : 100;
}

export interface ResumenCortes {
  /** Cortes hechos (citas completadas). */
  cortes: number;
  /** Total cobrado por esos cortes. */
  generado: number;
  /** Parte del barbero según su comisión. */
  ganancia: number;
  /** Lo que queda para la barbería. */
  barberia: number;
  /** Citas en las que el cliente no llegó. */
  noAsistio: number;
}

/** Resume las citas de un período (solo cuentan como cortes las completadas). */
export function resumir(citas: Cita[], comision = 100): ResumenCortes {
  const completadas = citas.filter(c => c.estado === 'completada');
  const generado = completadas.reduce((total, c) => total + valorCobrado(c), 0);
  const ganancia = Math.round(generado * comision / 100);
  return {
    cortes: completadas.length,
    generado,
    ganancia,
    barberia: generado - ganancia,
    noAsistio: citas.filter(c => c.estado === 'no-asistio').length,
  };
}
