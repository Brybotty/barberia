import { Disponibilidad } from '../utils/horario';

/** Lo que ve cualquiera en la página (`barberos/{id}`): nada personal. */
export interface BarberoPublico extends Disponibilidad {
  id?: string;
  nombre: string;
  /** Rol o especialidad que se muestra bajo el nombre ("CEO & Barbero"). */
  especialidad: string;
  /** Foto: archivo de /public o URL de descarga de Storage. Vacío: se dibujan sus iniciales. */
  avatar: string;
  /** Usuario de Instagram, sin '@'. */
  instagram?: string;
  /** Orden en la página (menor primero). */
  orden?: number;
}

/** Datos privados (`barberosPrivado/{id}`, mismo id): solo los lee el admin y el propio barbero. */
export interface DatosPrivadosBarbero {
  /** Email (en minúsculas) de la cuenta del barbero. Enlaza este perfil con su usuario. */
  emailAsociado: string;
  /** Porcentaje de cada servicio que gana el barbero (0 a 100). Sin definir: 100 (p. ej. el dueño). */
  comision?: number | null;
}

/** Perfil completo: lo que ven el admin y el propio barbero. */
export interface Barbero extends BarberoPublico, DatosPrivadosBarbero {}

export function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
}

const ESCAPE_XML: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };

/**
 * Foto del barbero o, si no tiene, sus iniciales sobre negro con borde dorado.
 * Se dibuja aquí mismo: un servicio externo de avatares recibiría el nombre de cada barbero.
 */
export function avatarDe(barbero: Pick<BarberoPublico, 'avatar' | 'nombre'>): string {
  if (barbero.avatar) return barbero.avatar;
  const texto = iniciales(barbero.nombre).replace(/[<>&"']/g, c => ESCAPE_XML[c]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#0a0a0a"/>`
    + `<rect x="3" y="3" width="90" height="90" fill="none" stroke="#c29a4e" stroke-width="1.5"/>`
    + `<text x="48" y="51" font-family="Georgia,'Times New Roman',serif" font-size="34" font-weight="700" fill="#e4e4e7" text-anchor="middle" dominant-baseline="middle">${texto}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Barberos en el orden de la página: por `orden` y, a igualdad, por nombre. */
export function ordenarBarberos<T extends BarberoPublico>(barberos: T[]): T[] {
  return [...barberos].sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || a.nombre.localeCompare(b.nombre));
}
