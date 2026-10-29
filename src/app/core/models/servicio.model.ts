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
  /**
   * Precio propio de algún barbero (id → pesos): el admin sube (o baja) el suyo sin tocar el de los demás, que siguen
   * con `precio`. Sin entrada para un barbero: el general. Las reglas cobran lo mismo (ver precioCon en firestore.rules).
   */
  precios?: Record<string, number>;
  /** Servicio propio de un barbero (su id): solo se reserva con él y a los demás no les aparece. Vacío: de todos. */
  soloDe?: string;
}

/** Lo que cuesta el servicio con ese barbero: su precio propio, si tiene, o el general. */
export function precioCon(servicio: Pick<Servicio, 'precio' | 'precios'>, barberoId?: string | null): number {
  const propio = barberoId ? servicio.precios?.[barberoId] : undefined;
  return typeof propio === 'number' && propio > 0 ? propio : servicio.precio;
}

/** ¿Está en el menú de ese barbero? (los de todos, y los propios de él; no los propios de otro). */
export function esDelMenuDe(servicio: Pick<Servicio, 'soloDe'>, barberoId?: string | null): boolean {
  return !servicio.soloDe || servicio.soloDe === barberoId;
}

/** Los barberos que cobran otro precio por el servicio (para mostrarlo junto al general), del más barato al más caro. */
export function preciosPropios<B extends { id?: string; nombre: string }>(servicio: Pick<Servicio, 'precio' | 'precios' | 'soloDe'>, barberos: B[]): { barbero: B; precio: number }[] {
  if (servicio.soloDe) return [];
  return barberos
    .filter(b => !!b.id && precioCon(servicio, b.id) !== servicio.precio)
    .map(b => ({ barbero: b, precio: precioCon(servicio, b.id) }))
    .sort((a, b) => a.precio - b.precio);
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
