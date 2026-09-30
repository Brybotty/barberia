import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

/**
 * Pago en línea con Wompi. La firma de integridad usa un secreto, así que el enlace de pago
 * lo arma una Cloud Function (functions/src/index.ts), que además recalcula el total con los
 * precios del catálogo para que nadie pueda pagar menos desde el navegador.
 */
@Injectable({ providedIn: 'root' })
export class PagosService {
  private functions = inject(Functions);

  /** Lleva al cliente al checkout de Wompi. Al terminar, Wompi lo devuelve a la página del pedido. */
  async irAPagar(pedidoId: string): Promise<void> {
    const iniciar = httpsCallable<{ pedidoId: string; origen: string }, { url: string }>(this.functions, 'iniciarPagoWompi');
    const { data } = await iniciar({ pedidoId, origen: window.location.origin });
    window.location.assign(data.url);
  }

  /**
   * Solo con los emuladores (demo sin llaves de Wompi): aprueba o rechaza el pago como lo haría
   * Wompi. Devuelve el ID de la transacción simulada.
   */
  async simular(pedidoId: string, aprobar: boolean, medio: string): Promise<string> {
    const simular = httpsCallable<{ pedidoId: string; aprobar: boolean; medio: string }, { transaccionId: string }>(this.functions, 'simularPagoWompi');
    const { data } = await simular({ pedidoId, aprobar, medio });
    return data.transaccionId;
  }

  /** Consulta la transacción en Wompi y actualiza el pedido (por si el webhook aún no ha llegado). */
  async confirmar(pedidoId: string, transaccionId: string): Promise<void> {
    const confirmar = httpsCallable<{ pedidoId: string; transaccionId: string }, unknown>(this.functions, 'confirmarPagoWompi');
    await confirmar({ pedidoId, transaccionId });
  }
}
