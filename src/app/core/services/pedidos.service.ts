import { Injectable, NgZone, inject } from '@angular/core';
import { Firestore, collection, doc, orderBy, query, updateDoc, where } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, map } from 'rxjs';
import { Pedido, SolicitudPedido } from '../models/pedido.model';
import { escuchar, escucharDoc } from '../utils/firestore';

const masRecientes = (pedidos: Pedido[]) => [...pedidos].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private zone = inject(NgZone);
  private pedidosRef = collection(this.firestore, 'pedidos');

  /**
   * Crea el pedido en el servidor: precios del catálogo, costo de envío e inventario se
   * resuelven allí en una sola operación. Devuelve el ID del pedido.
   * Si algo ya no está disponible, falla con un mensaje para el cliente.
   */
  async crear(solicitud: SolicitudPedido): Promise<string> {
    const crear = httpsCallable<SolicitudPedido, { pedidoId: string }>(this.functions, 'crearPedido');
    const { data } = await crear(solicitud);
    return data.pedidoId;
  }

  /** Cancela el pedido y devuelve sus unidades al inventario (cliente con su pedido pendiente, o admin). */
  async cancelar(id: string): Promise<void> {
    await httpsCallable<{ pedidoId: string }, unknown>(this.functions, 'cancelarPedido')({ pedidoId: id });
  }

  porId(id: string): Observable<Pedido | null> {
    return escucharDoc<Pedido>(this.zone, doc(this.firestore, `pedidos/${id}`));
  }

  /** Pedidos de un cliente, del más reciente al más antiguo. */
  delUsuario(uid: string): Observable<Pedido[]> {
    return escuchar<Pedido>(this.zone, query(this.pedidosRef, where('userId', '==', uid))).pipe(map(masRecientes));
  }

  /** Todos los pedidos (panel de admin). */
  todos(): Observable<Pedido[]> {
    return escuchar<Pedido>(this.zone, query(this.pedidosRef, orderBy('creadoEn', 'desc')));
  }

  /** Pedidos creados desde una fecha ISO (avisos al admin). */
  creadosDesde(desdeIso: string): Observable<Pedido[]> {
    return escuchar<Pedido>(this.zone, query(this.pedidosRef, where('creadoEn', '>=', desdeIso)));
  }

  /** Cambios del admin (estado, pago). Para cancelar usa cancelar(), que devuelve el inventario. */
  actualizar(id: string, cambios: Partial<Pedido> | Record<string, unknown>): Promise<void> {
    return updateDoc(doc(this.firestore, `pedidos/${id}`), cambios);
  }
}
