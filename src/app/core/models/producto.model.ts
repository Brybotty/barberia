/** Variante de un producto con su propio precio (presentación, fijación, aroma...). */
export interface OpcionProducto {
  nombre: string;
  precio: number;
  agotado?: boolean;
  /** Unidades en inventario, si el producto controla inventario. */
  stock?: number;
}

export interface Producto {
  id?: string;
  nombre: string;
  descripcion: string;
  marca: string;
  categoria: string;
  /** URL, ruta en /public o foto subida desde el panel (data URL comprimida). */
  imagen: string;
  /** Precio del producto. Si tiene opciones, se usa el de cada opción. */
  precio: number;
  /** Precio anterior, tachado, para mostrar una oferta. */
  precioAntes?: number | null;
  opciones?: OpcionProducto[];
  destacado: boolean;
  /** Si es false, no aparece en la tienda (sin borrarlo). */
  visible: boolean;
  /** Agotado a mano (sirve también sin control de inventario). */
  agotado: boolean;
  /** Orden manual en el catálogo: menor primero. */
  orden?: number;
  /**
   * Lleva la cuenta de unidades: se descuentan al vender y vuelven al cancelar.
   * El stock está en `stock` o, si hay opciones, en cada opción.
   */
  controlStock?: boolean;
  stock?: number;
}

/** Desde cuántas unidades se avisa "¡Últimas unidades!" y se marca como stock bajo en el panel. */
export const STOCK_BAJO = 3;

export function tieneOpciones(producto: Producto): boolean {
  return (producto.opciones?.length ?? 0) > 0;
}

/** Unidades de una opción (o del producto). null si el producto no controla inventario. */
export function stockDe(producto: Producto, opcion: string | null): number | null {
  if (!producto.controlStock) return null;
  if (!tieneOpciones(producto)) return producto.stock ?? 0;
  return producto.opciones!.find(o => o.nombre === opcion)?.stock ?? 0;
}

/** Unidades en total (sumando opciones). null si no controla inventario. */
export function stockTotal(producto: Producto): number | null {
  if (!producto.controlStock) return null;
  if (!tieneOpciones(producto)) return producto.stock ?? 0;
  return producto.opciones!.reduce((total, o) => total + (o.stock ?? 0), 0);
}

/** Una opción (o el producto sin opciones) que se puede vender ahora. */
function opcionVendible(producto: Producto, opcion: { agotado?: boolean; stock?: number }): boolean {
  return !opcion.agotado && (!producto.controlStock || (opcion.stock ?? 0) > 0);
}

/** No queda nada que vender: agotado a mano, sin unidades o con todas las opciones agotadas. */
export function sinExistencias(producto: Producto): boolean {
  if (producto.agotado) return true;
  if (tieneOpciones(producto)) return !producto.opciones!.some(o => opcionVendible(producto, o));
  return !opcionVendible(producto, producto);
}

/** Precio a mostrar en la tarjeta: el menor de las opciones disponibles ("Desde"). */
export function precioMinimo(producto: Producto): number {
  if (!tieneOpciones(producto)) return producto.precio;
  const disponibles = producto.opciones!.filter(o => opcionVendible(producto, o));
  return Math.min(...(disponibles.length ? disponibles : producto.opciones!).map(o => o.precio));
}

/** Las opciones tienen precios distintos: la tarjeta muestra "Desde". */
export function preciosVariables(producto: Producto): boolean {
  return tieneOpciones(producto) && new Set(producto.opciones!.map(o => o.precio)).size > 1;
}

/** Precio de una opción concreta (o del producto si no tiene opciones). null si la opción ya no existe. */
export function precioDe(producto: Producto, opcion: string | null): number | null {
  if (!tieneOpciones(producto)) return opcion ? null : producto.precio;
  return producto.opciones!.find(o => o.nombre === opcion)?.precio ?? null;
}

export function estaDisponible(producto: Producto, opcion: string | null): boolean {
  if (!producto.visible || producto.agotado) return false;
  if (!tieneOpciones(producto)) return !opcion && opcionVendible(producto, producto);
  const encontrada = producto.opciones!.find(o => o.nombre === opcion);
  return !!encontrada && opcionVendible(producto, encontrada);
}

/** Pocas unidades de un producto sin opciones (para el aviso en la tarjeta). */
export function ultimasUnidades(producto: Producto): number | null {
  const total = stockTotal(producto);
  return total !== null && !tieneOpciones(producto) && total > 0 && total <= STOCK_BAJO ? total : null;
}

/** Porcentaje de descuento frente a precioAntes, o null si no hay oferta. */
export function descuento(producto: Producto): number | null {
  const antes = producto.precioAntes ?? 0;
  const ahora = precioMinimo(producto);
  if (!antes || antes <= ahora) return null;
  return Math.round((1 - ahora / antes) * 100);
}
