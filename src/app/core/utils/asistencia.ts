import { Cita } from '../models/cita.model';
import { limpiarCelular } from './colombia';

/**
 * Caritas de asistencia: cuántas veces faltó cada cliente a sus turnos (las citas marcadas "No asistió"). Salen de
 * las citas que el panel ya tiene, sin colecciones nuevas ni correos. Solo las ve el equipo.
 *
 * 1 verde feliz: nunca ha faltado · 2 amarilla, normal: faltó 1 vez · 3, 4 y 5 rojas, cada vez más tristes: faltó 2,
 * 3, o 4 veces o más. Un cliente sin turnos marcados ("Hecho" o "No asistió") es nuevo: carita gris.
 *
 * También lleva la cuenta de las multas: las que se le pusieron al marcar "No asistió" y las que pagó en sus visitas
 * siguientes. Lo que falta por pagar sale junto a la carita.
 */
export interface ResumenAsistencia {
  /** Turnos marcados "Hecho". */
  vino: number;
  /** Turnos marcados "No asistió". */
  falto: number;
  /** Día ('YYYY-MM-DD') de la última vez que faltó. */
  ultimaFalta?: string;
  /** Suma de las multas que se le pusieron (en pesos). */
  multas?: number;
  /** Suma de las multas que ya pagó. */
  cobradas?: number;
}

/** Lo que el cliente debe en multas (nunca negativo). */
export function multaPendiente(resumen: ResumenAsistencia | undefined): number {
  return Math.max(0, (resumen?.multas ?? 0) - (resumen?.cobradas ?? 0));
}

/**
 * Lo que se le puede cobrar al marcar esa cita "Hecho". Si la cita era un "No asistió" con multa (marcado por error),
 * esa multa se quita al completarla: no cuenta.
 */
export function multaParaCobrarEn(cita: Cita, resumen: ResumenAsistencia | undefined): number {
  return Math.max(0, multaPendiente(resumen) - (cita.estado === 'no-asistio' ? cita.multa ?? 0 : 0));
}

/** 0 = cliente nuevo (sin turnos marcados); de 1 (siempre viene) a 5 (faltó 4 veces o más). */
export type NivelAsistencia = 0 | 1 | 2 | 3 | 4 | 5;

export interface Carita {
  nivel: NivelAsistencia;
  /** Lo que se lee junto a la carita. */
  corto: string;
  /** Para la leyenda. */
  significado: string;
  /** Relleno de la carita. */
  color: string;
}

/** De la más feliz a la más triste (y la del cliente nuevo al final). Verde, amarilla y rojas cada vez más fuertes. */
export const CARITAS: readonly Carita[] = [
  { nivel: 1, corto: 'Siempre viene', significado: 'Ha venido a todos sus turnos', color: '#22c55e' },
  { nivel: 2, corto: 'Faltó 1 vez', significado: 'Faltó a 1 turno', color: '#facc15' },
  { nivel: 3, corto: 'Faltó 2 veces', significado: 'Faltó a 2 turnos', color: '#f97316' },
  { nivel: 4, corto: 'Faltó 3 veces', significado: 'Faltó a 3 turnos', color: '#ef4444' },
  { nivel: 5, corto: 'Faltó 4+ veces', significado: 'Faltó a 4 turnos o más', color: '#b91c1c' },
  { nivel: 0, corto: 'Nuevo', significado: 'Cliente nuevo: aún no tiene turnos marcados', color: '#525252' },
];

const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Quién es el cliente de una cita: su celular (así se junta lo que reservó en la página con lo que le agendaron por
 * WhatsApp), o su cuenta, o su nombre si no hay nada más (citas del panel sin celular). null: no se sabe.
 */
export function claveCliente(cita: Partial<Pick<Cita, 'userId' | 'phone' | 'userName'>>): string | null {
  const celular = limpiarCelular(cita.phone ?? '');
  if (/^3\d{9}$/.test(celular)) return `tel:${celular}`;
  if (cita.userId) return `uid:${cita.userId}`;
  const nombre = normalizar(cita.userName ?? '');
  return nombre ? `nom:${nombre}` : null;
}

/** Cuenta los turnos marcados de cada cliente. Una cita que llega en dos listas (mismo id) cuenta una vez. */
export function resumirAsistencia(...listas: Cita[][]): Map<string, ResumenAsistencia> {
  const vistas = new Set<string>();
  const resumen = new Map<string, ResumenAsistencia>();
  for (const cita of listas.flat()) {
    if (cita.estado !== 'completada' && cita.estado !== 'no-asistio') continue;
    if (cita.id) {
      if (vistas.has(cita.id)) continue;
      vistas.add(cita.id);
    }
    const clave = claveCliente(cita);
    if (!clave) continue;
    const suyo = resumen.get(clave) ?? { vino: 0, falto: 0 };
    if (cita.estado === 'completada') {
      suyo.vino++;
      if (cita.multaCobrada) suyo.cobradas = (suyo.cobradas ?? 0) + cita.multaCobrada;
    } else {
      suyo.falto++;
      if (cita.multa) suyo.multas = (suyo.multas ?? 0) + cita.multa;
      const dia = cita.dia ?? cita.fecha?.slice(0, 10) ?? '';
      if (dia && (!suyo.ultimaFalta || dia > suyo.ultimaFalta)) suyo.ultimaFalta = dia;
    }
    resumen.set(clave, suyo);
  }
  return resumen;
}

export function nivelAsistencia(resumen: ResumenAsistencia | undefined): NivelAsistencia {
  if (!resumen || (resumen.vino === 0 && resumen.falto === 0)) return 0;
  return Math.min(resumen.falto + 1, 5) as NivelAsistencia;
}

export function caritaDe(resumen: ResumenAsistencia | undefined): Carita {
  const nivel = nivelAsistencia(resumen);
  return CARITAS.find(c => c.nivel === nivel)!;
}

/** "Ha venido a sus 6 turnos", "Faltó 2 veces de 9 turnos". */
export function textoAsistencia(resumen: ResumenAsistencia | undefined): string {
  if (nivelAsistencia(resumen) === 0) return 'Cliente nuevo: aún no tiene turnos marcados';
  const { vino, falto } = resumen!;
  const total = vino + falto;
  if (falto === 0) return vino === 1 ? 'Vino a su turno' : `Ha venido a sus ${vino} turnos`;
  return `Faltó ${falto === 1 ? '1 vez' : `${falto} veces`} de ${total} ${total === 1 ? 'turno' : 'turnos'}`;
}
