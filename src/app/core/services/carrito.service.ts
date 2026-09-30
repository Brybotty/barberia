import { Injectable, computed, effect, signal } from '@angular/core';
import { CLIENTE } from '../../config/cliente';
import { Producto, estaDisponible, precioDe, stockDe } from '../models/producto.model';

export interface ItemCarrito {
  productoId: string;
  opcion: string | null;
  nombre: string;
  precio: number;
  cantidad: number;
}

/** Línea del carrito cruzada con el catálogo actual. */
export interface LineaCarrito extends ItemCarrito {
  producto?: Producto;
  /** Se puede comprar tal cual (existe, no está agotado y hay unidades suficientes). */
  disponible: boolean;
  /** Cuántas se pueden pedir como máximo (inventario o tope por producto). */
  maximo: number;
  /** Aviso para el cliente si no está disponible ("Agotado", "Solo quedan 2"). */
  aviso: string;
}

export const MAX_POR_PRODUCTO = 20;

export function subtotalDe(lineas: LineaCarrito[]): number {
  return lineas.filter(l => l.disponible).reduce((total, l) => total + l.precio * l.cantidad, 0);
}

/** Máximo que se puede pedir de una opción: el inventario, si lo hay, o el tope general. */
export function maximoDe(producto: Producto, opcion: string | null): number {
  const stock = stockDe(producto, opcion);
  return stock === null ? MAX_POR_PRODUCTO : Math.min(MAX_POR_PRODUCTO, stock);
}

const mismaLinea = (a: Pick<ItemCarrito, 'productoId' | 'opcion'>, b: Pick<ItemCarrito, 'productoId' | 'opcion'>) =>
  a.productoId === b.productoId && a.opcion === b.opcion;

/** Carrito de la tienda. Vive en el navegador (localStorage), no requiere iniciar sesión. */
@Injectable({ providedIn: 'root' })
export class CarritoService {
  private readonly clave = `carrito-${CLIENTE.id}`;

  readonly items = signal<ItemCarrito[]>(this.leer());
  /** Panel lateral del carrito. */
  readonly abierto = signal(false);

  readonly cantidad = computed(() => this.items().reduce((total, i) => total + i.cantidad, 0));

  constructor() {
    effect(() => this.escribir(this.items()));
    // Mantiene el carrito igual en todas las pestañas abiertas.
    window.addEventListener('storage', e => {
      if (e.key === this.clave) this.items.set(this.leer());
    });
  }

  /** Cuántas unidades de esa opción hay ya en el carrito. */
  enCarrito(productoId: string, opcion: string | null): number {
    return this.items().find(i => mismaLinea(i, { productoId, opcion }))?.cantidad ?? 0;
  }

  agregar(producto: Producto, opcion: string | null, cantidad = 1) {
    const precio = precioDe(producto, opcion);
    if (precio === null || !producto.id) return;
    const maximo = maximoDe(producto, opcion);
    const linea = { productoId: producto.id, opcion };
    this.items.update(items => {
      const existente = items.find(i => mismaLinea(i, linea));
      if (existente) {
        return items.map(i => i === existente ? { ...i, precio, cantidad: Math.min(maximo, i.cantidad + cantidad) } : i);
      }
      return [...items, { ...linea, nombre: producto.nombre, precio, cantidad: Math.min(maximo, cantidad) }];
    });
  }

  cambiarCantidad(linea: Pick<ItemCarrito, 'productoId' | 'opcion'>, cantidad: number) {
    if (cantidad <= 0) return this.quitar(linea);
    this.items.update(items => items.map(i => mismaLinea(i, linea) ? { ...i, cantidad: Math.min(MAX_POR_PRODUCTO, cantidad) } : i));
  }

  quitar(linea: Pick<ItemCarrito, 'productoId' | 'opcion'>) {
    this.items.update(items => items.filter(i => !mismaLinea(i, linea)));
  }

  vaciar() {
    this.items.set([]);
  }

  /**
   * Cruza el carrito con el catálogo: toma nombres y precios actuales (el precio guardado puede
   * estar desactualizado) y marca lo que ya no se puede comprar.
   */
  lineas(productos: Producto[]): LineaCarrito[] {
    const porId = new Map(productos.map(p => [p.id, p]));
    return this.items().map(item => {
      const producto = porId.get(item.productoId);
      const precio = producto ? precioDe(producto, item.opcion) : null;
      const existe = !!producto && estaDisponible(producto, item.opcion);
      const maximo = producto && existe ? maximoDe(producto, item.opcion) : 0;
      return {
        ...item,
        producto,
        nombre: producto?.nombre ?? item.nombre,
        precio: precio ?? item.precio,
        maximo,
        disponible: existe && item.cantidad <= maximo,
        aviso: !existe ? 'Ya no está disponible' : item.cantidad > maximo ? `Solo quedan ${maximo}` : '',
      };
    });
  }

  private leer(): ItemCarrito[] {
    try {
      const guardado = JSON.parse(localStorage.getItem(this.clave) ?? '[]');
      return Array.isArray(guardado) ? guardado.filter(i => i?.productoId && i.cantidad > 0) : [];
    } catch {
      return [];
    }
  }

  private escribir(items: ItemCarrito[]) {
    try {
      localStorage.setItem(this.clave, JSON.stringify(items));
    } catch {
      // Modo privado o almacenamiento lleno: el carrito sigue funcionando en memoria.
    }
  }
}
