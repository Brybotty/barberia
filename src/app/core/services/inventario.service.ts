import { Injectable, NgZone, inject } from '@angular/core';
import {
  DocumentReference, Firestore, Transaction, collection, doc, limit, orderBy, query, runTransaction,
} from '@angular/fire/firestore';
import { Observable, firstValueFrom } from 'rxjs';
import { MovimientoInventario, TipoMovimiento } from '../models/inventario.model';
import { Producto, stockDe, tieneOpciones } from '../models/producto.model';
import { escuchar } from '../utils/firestore';
import { AuthService } from './auth.service';

/** Unidades de un producto (o de una de sus opciones). */
export interface Existencia {
  opcion: string | null;
  stock: number;
}

/** Todas las existencias de un producto que controla inventario. */
export function existencias(producto: Producto): Existencia[] {
  if (!producto.controlStock) return [];
  return tieneOpciones(producto)
    ? producto.opciones!.map(o => ({ opcion: o.nombre, stock: o.stock ?? 0 }))
    : [{ opcion: null, stock: producto.stock ?? 0 }];
}

/** Campos a guardar en el producto con el stock de una opción cambiado. */
export function conStock(producto: Producto, opcion: string | null, stock: number): Partial<Producto> {
  if (!tieneOpciones(producto)) return { stock };
  return { opciones: producto.opciones!.map(o => (o.nombre === opcion ? { ...o, stock } : o)) };
}

@Injectable({ providedIn: 'root' })
export class InventarioService {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private auth = inject(AuthService);
  private movimientosRef = collection(this.firestore, 'movimientosInventario');

  /** Últimos movimientos (panel de admin). */
  movimientos(cantidad = 40): Observable<MovimientoInventario[]> {
    return escuchar<MovimientoInventario>(this.zone, query(this.movimientosRef, orderBy('fecha', 'desc'), limit(cantidad)));
  }

  /**
   * Suma o resta unidades a un producto y deja el movimiento registrado, en una transacción
   * (si justo entra una venta, no se pisa). No deja el stock por debajo de 0.
   */
  async ajustar(productoId: string, opcion: string | null, cantidad: number, tipo: TipoMovimiento, nota = ''): Promise<number> {
    const usuario = await this.usuarioActual();
    const ref = doc(this.firestore, `productos/${productoId}`) as DocumentReference<Producto>;
    return runTransaction(this.firestore, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('El producto ya no existe.');
      const producto = { ...snap.data(), id: snap.id };
      const antes = stockDe(producto, opcion) ?? 0;
      const despues = Math.max(0, antes + cantidad);
      tx.update(ref, conStock(producto, opcion, despues));
      this.registrar(tx, { productoId, producto: producto.nombre, opcion, cantidad: despues - antes, stockResultante: despues, tipo, nota, usuario });
      return despues;
    });
  }

  /** Deja un movimiento dentro de una transacción ya abierta. */
  registrar(tx: Transaction, movimiento: Omit<MovimientoInventario, 'id' | 'fecha'>) {
    if (movimiento.cantidad === 0) return;
    tx.set(doc(this.movimientosRef), { ...movimiento, fecha: new Date().toISOString() });
  }

  async usuarioActual(): Promise<string> {
    const perfil = await firstValueFrom(this.auth.currentUserProfile$);
    return perfil?.nombre ?? 'Admin';
  }
}
