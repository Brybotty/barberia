/** Íconos propios de la marca para los servicios (ver app-icono). */
export type IconoServicio = 'tijeras' | 'navaja' | 'barba' | 'poste' | 'diamante' | 'color' | 'peine' | 'hoja' | 'corona';

export const ICONOS_SERVICIO: { valor: IconoServicio; nombre: string }[] = [
  { valor: 'tijeras', nombre: 'Corte' },
  { valor: 'barba', nombre: 'Barba' },
  { valor: 'navaja', nombre: 'Afeitado' },
  { valor: 'diamante', nombre: 'Premium' },
  { valor: 'color', nombre: 'Color' },
  { valor: 'peine', nombre: 'Peinado' },
  { valor: 'hoja', nombre: 'Facial' },
  { valor: 'poste', nombre: 'Clásico' },
  { valor: 'corona', nombre: 'VIP' },
];

export interface Servicio {
  id?: string;
  nombre: string;
  descripcion: string;
  precio: number;
  /** El precio es un mínimo ("Desde $300.000"). */
  precioDesde?: boolean;
  duracionMinutos: number;
  categoria: string;
  destacado: boolean;
  /** Ícono del servicio. Si falta, se elige por el nombre (ver iconoDe). */
  icono?: IconoServicio;
}

/** Ícono del servicio: el elegido en el panel o uno deducido del nombre y la categoría. */
export function iconoDe(servicio: Pick<Servicio, 'icono' | 'nombre' | 'categoria'>): IconoServicio {
  if (servicio.icono) return servicio.icono;
  const texto = `${servicio.nombre} ${servicio.categoria}`.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (/color|tinte|mecha|decolor|platin/.test(texto)) return 'color';
  if (/premium|vip|completo|experiencia/.test(texto)) return 'diamante';
  if (/facial|limpieza|mascarilla|cejas/.test(texto)) return 'hoja';
  if (/afeit|navaja/.test(texto)) return 'navaja';
  if (/barba/.test(texto)) return 'barba';
  if (/peinad|styling|ondul/.test(texto)) return 'peine';
  return 'tijeras';
}
