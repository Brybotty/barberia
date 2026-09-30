import { Injectable, NgZone, inject } from '@angular/core';
import {
  DocumentReference, Firestore, collection, deleteDoc, doc, runTransaction, updateDoc,
} from '@angular/fire/firestore';
import { Observable, map, shareReplay } from 'rxjs';
import { Producto, stockDe } from '../models/producto.model';
import { escuchar } from '../utils/firestore';
import { InventarioService, existencias } from './inventario.service';

function ordenar(productos: Producto[]): Producto[] {
  return [...productos].sort((a, b) =>
    (a.orden ?? 999) - (b.orden ?? 999)
    || Number(b.destacado) - Number(a.destacado)
    || a.nombre.localeCompare(b.nombre),
  );
}

@Injectable({ providedIn: 'root' })
export class ProductosService {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private inventario = inject(InventarioService);
  private productosRef = collection(this.firestore, 'productos');

  private readonly todos$ = escuchar<Producto>(this.zone, this.productosRef).pipe(
    map(ordenar),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /** Todo el catálogo, incluidos los ocultos (panel de admin). */
  todos(): Observable<Producto[]> {
    return this.todos$;
  }

  /** Lo que se ve en la tienda. */
  visibles(): Observable<Producto[]> {
    return this.todos$.pipe(map(productos => productos.filter(p => p.visible)));
  }

  /**
   * Crea o actualiza un producto. Si controla inventario, los cambios de stock hechos en el
   * formulario quedan como movimientos. Se aplica la diferencia frente a lo que había al abrir
   * el formulario (`original`), así una venta hecha mientras tanto no se pierde.
   */
  async guardar(producto: Producto, original: Producto | null = null): Promise<void> {
    const { id, ...datos } = producto;
    // Firestore no acepta undefined.
    const limpio: Omit<Producto, 'id'> = {
      ...datos,
      precioAntes: datos.precioAntes || null,
      opciones: (datos.opciones ?? []).map(o => ({ ...o, stock: datos.controlStock ? Math.max(0, Math.round(o.stock ?? 0)) : 0 })),
      orden: datos.orden ?? 999,
      controlStock: !!datos.controlStock,
      stock: datos.controlStock ? Math.max(0, Math.round(datos.stock ?? 0)) : 0,
    };
    const ref = (id ? doc(this.firestore, `productos/${id}`) : doc(this.productosRef)) as DocumentReference<Producto>;
    const usuario = await this.inventario.usuarioActual();

    await runTransaction(this.firestore, async tx => {
      const actualSnap = id ? await tx.get(ref) : null;
      const actual = actualSnap?.exists() ? actualSnap.data() : null;
      const final = { ...limpio };

      for (const { opcion, stock: pedido } of existencias(limpio as Producto)) {
        const alAbrir = original ? stockDe(original, opcion) ?? 0 : 0;
        const ahora = actual ? stockDe(actual, opcion) ?? 0 : 0;
        // Lo que el admin cambió en el formulario, sobre el stock actual.
        const nuevo = Math.max(0, ahora + (pedido - alAbrir));
        if (final.opciones?.length) {
          final.opciones = final.opciones.map(o => (o.nombre === opcion ? { ...o, stock: nuevo } : o));
        } else {
          final.stock = nuevo;
        }
        this.inventario.registrar(tx, {
          productoId: ref.id, producto: final.nombre, opcion, cantidad: nuevo - ahora, stockResultante: nuevo,
          tipo: actual?.controlStock ? 'ajuste' : 'entrada', nota: actual?.controlStock ? 'Editado en el producto' : 'Inventario inicial', usuario,
        });
      }

      if (actual) tx.update(ref, final);
      else tx.set(ref, final as Producto);
    });
  }

  actualizar(id: string, cambios: Partial<Producto>): Promise<void> {
    return updateDoc(doc(this.firestore, `productos/${id}`), cambios);
  }

  eliminar(id: string): Promise<void> {
    return deleteDoc(doc(this.firestore, `productos/${id}`));
  }
}
