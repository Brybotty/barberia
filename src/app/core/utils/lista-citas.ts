import { Cita } from '../models/cita.model';
import { limpiarCelular } from './colombia';
import { claveDia, compararCitas, diaDeCita } from './horario';

/** Qué días muestra la lista de citas del panel. La semana va de lunes a domingo. */
export type PeriodoLista = 'hoy' | 'manana' | 'semana' | 'proximas' | 'pasadas' | 'todas';

export const PERIODOS_LISTA: { valor: PeriodoLista; nombre: string }[] = [
  { valor: 'hoy', nombre: 'Hoy' },
  { valor: 'manana', nombre: 'Mañana' },
  { valor: 'semana', nombre: 'Esta semana' },
  { valor: 'proximas', nombre: 'Próximas' },
  { valor: 'pasadas', nombre: 'Pasadas' },
  { valor: 'todas', nombre: 'Todas' },
];

/** Días (claves 'YYYY-MM-DD', inclusive) del período. Sin `desde` o sin `hasta`: sin límite por ese lado. */
export function rangoLista(periodo: PeriodoLista, hoy = new Date()): { desde?: string; hasta?: string } {
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const corrido = (dias: number) => claveDia(new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias));
  switch (periodo) {
    case 'hoy':
      return { desde: corrido(0), hasta: corrido(0) };
    case 'manana':
      return { desde: corrido(1), hasta: corrido(1) };
    case 'semana': {
      const lunes = -((base.getDay() + 6) % 7);
      return { desde: corrido(lunes), hasta: corrido(lunes + 6) };
    }
    case 'proximas':
      return { desde: corrido(0) };
    case 'pasadas':
      return { hasta: corrido(-1) };
    case 'todas':
      return {};
  }
}

const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Por nombre del cliente (sin importar tildes ni mayúsculas) o por celular (desde 3 dígitos, aunque lleve espacios). */
export function coincideBusqueda(cita: Pick<Cita, 'userName' | 'phone'>, busqueda: string): boolean {
  const q = normalizar(busqueda);
  if (!q) return true;
  const digitos = limpiarCelular(busqueda);
  return normalizar(cita.userName ?? '').includes(q) || (digitos.length >= 3 && limpiarCelular(cita.phone ?? '').includes(digitos));
}

export interface FiltroLista {
  periodo: PeriodoLista;
  /** ID del barbero. Vacío: las de todos. */
  barberoId?: string;
  busqueda?: string;
  /** Las canceladas (y las que cambiaron de horario) se ocultan salvo que se pidan. */
  canceladas?: boolean;
}

/** Las citas que pasan el filtro, sin ordenar. */
export function filtrarCitas(citas: Cita[], filtro: FiltroLista, hoy = new Date()): Cita[] {
  const { desde, hasta } = rangoLista(filtro.periodo, hoy);
  return citas.filter(c => {
    const dia = diaDeCita(c);
    return (!desde || dia >= desde) && (!hasta || dia <= hasta)
      && (!filtro.barberoId || c.barberoId === filtro.barberoId)
      && (filtro.canceladas || c.estado !== 'cancelada')
      && coincideBusqueda(c, filtro.busqueda ?? '');
  });
}

export interface DiaDeLista {
  dia: string;
  citas: Cita[];
}

/**
 * Las citas por día. Dentro de cada día, por hora. Los días, del más cercano al más lejano; con `recientesPrimero`
 * (las pasadas), de ayer hacia atrás.
 */
export function agruparPorDia(citas: Cita[], recientesPrimero = false): DiaDeLista[] {
  const porDia = new Map<string, Cita[]>();
  for (const cita of [...citas].sort(compararCitas)) {
    const dia = diaDeCita(cita);
    porDia.set(dia, [...(porDia.get(dia) ?? []), cita]);
  }
  const dias = [...porDia].map(([dia, suyas]) => ({ dia, citas: suyas }));
  return recientesPrimero ? dias.reverse() : dias;
}
