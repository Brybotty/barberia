import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { CLIENTE } from '../../../config/cliente';
import {
  NOMBRE_ENTREGA, NOMBRE_METODO, PASOS_PEDIDO, Pedido, codigoPedido, etiquetaEstado, etiquetaPago,
} from '../../../core/models/pedido.model';
import { Producto } from '../../../core/models/producto.model';
import { NotificationService } from '../../../core/services/notification.service';
import { PagosService } from '../../../core/services/pagos.service';
import { PedidosService } from '../../../core/services/pedidos.service';
import { ProductosService } from '../../../core/services/productos.service';
import { enlaceWhatsApp } from '../../../core/utils/colombia';
import { ProductoImagenComponent } from '../../../shared/components/producto-imagen/producto-imagen.component';
import { COLOR_ESTADO, COLOR_PAGO } from '../pedido-estilos';

/** Confirmación y seguimiento de un pedido. Wompi devuelve aquí al cliente con ?id=<transacción>. */
@Component({
  selector: 'app-pedido',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgClass, RouterLink, ProductoImagenComponent],
  templateUrl: './pedido.component.html',
})
export class PedidoComponent {
  private route = inject(ActivatedRoute);
  private pedidos = inject(PedidosService);
  private pagos = inject(PagosService);
  private notificaciones = inject(NotificationService);

  readonly cliente = CLIENTE;
  readonly pedidoId = this.route.snapshot.paramMap.get('pedidoId')!;
  readonly colorEstado = COLOR_ESTADO;
  readonly colorPago = COLOR_PAGO;
  readonly nombreMetodo = NOMBRE_METODO;
  readonly nombreEntrega = NOMBRE_ENTREGA;
  readonly etiquetaEstado = etiquetaEstado;
  readonly etiquetaPago = etiquetaPago;

  /** undefined mientras carga; null si no existe o no es de este usuario. */
  readonly pedido = toSignal(
    this.pedidos.porId(this.pedidoId).pipe(
      catchError(error => {
        console.error('Error cargando el pedido', error);
        return of(null);
      }),
    ),
  );

  private productos = toSignal(inject(ProductosService).todos().pipe(catchError(() => of([] as Producto[]))), { initialValue: [] });
  readonly imagenes = computed(() => new Map(this.productos().map(p => [p.id, p.imagen])));

  readonly codigo = codigoPedido({ id: this.pedidoId });
  readonly pagando = signal(false);
  /** Consultando a Wompi el resultado del pago al volver del checkout. */
  readonly verificandoPago = signal(false);

  readonly pasos = computed(() => {
    const pedido = this.pedido();
    if (!pedido) return [];
    const actual = PASOS_PEDIDO.indexOf(pedido.estado);
    return PASOS_PEDIDO.map((estado, i) => ({
      etiqueta: etiquetaEstado({ estado, entrega: pedido.entrega }),
      hecho: pedido.estado !== 'cancelado' && i <= actual,
    }));
  });

  readonly puedePagar = computed(() => {
    const p = this.pedido();
    return !!p && p.pago.metodo === 'en-linea' && p.estado !== 'cancelado' && ['pendiente', 'rechazado', 'error', 'anulado'].includes(p.pago.estado);
  });

  readonly puedeCancelar = computed(() => {
    const p = this.pedido();
    return !!p && p.estado === 'pendiente' && p.pago.estado !== 'aprobado';
  });

  constructor() {
    const transaccionId = this.route.snapshot.queryParamMap.get('id');
    if (transaccionId) {
      this.verificandoPago.set(true);
      this.pagos.confirmar(this.pedidoId, transaccionId)
        .catch(error => console.error('No se pudo verificar el pago', error))
        .finally(() => this.verificandoPago.set(false));
    }
  }

  titulo(p: Pedido): string {
    if (p.estado === 'cancelado') return 'Pedido cancelado';
    if (p.pago.metodo === 'en-linea') {
      if (p.pago.estado === 'aprobado') return '¡Pago recibido!';
      if (p.pago.estado === 'pendiente') return this.verificandoPago() ? 'Verificando tu pago…' : 'Pago pendiente';
      return 'El pago no se completó';
    }
    return p.estado === 'entregado' ? '¡Pedido entregado!' : '¡Pedido recibido!';
  }

  mensaje(p: Pedido): string {
    if (p.estado === 'cancelado') return 'Este pedido fue cancelado. Si tienes dudas, escríbenos.';
    if (p.pago.metodo === 'en-linea' && p.pago.estado === 'pendiente') {
      return 'Si ya pagaste (por ejemplo con PSE), la confirmación puede tardar unos minutos. Esta página se actualiza sola.';
    }
    if (p.pago.metodo === 'en-linea' && p.pago.estado !== 'aprobado') {
      return 'Tu pedido sigue guardado. Puedes intentar pagar de nuevo con otro medio.';
    }
    if (p.entrega.tipo === 'recoger') return 'Te avisaremos cuando esté listo para recoger en la barbería.';
    return 'Te contactaremos por WhatsApp para coordinar la entrega.';
  }

  whatsapp(p: Pedido): string | null {
    if (!CLIENTE.whatsapp) return null;
    return enlaceWhatsApp(CLIENTE.whatsapp, `Hola, hice el pedido #${this.codigo} en la tienda (${p.items.length} producto(s), total $${p.total.toLocaleString('es-CO')}).`);
  }

  async pagar() {
    this.pagando.set(true);
    try {
      await this.pagos.irAPagar(this.pedidoId);
    } catch (error) {
      console.error(error);
      this.notificaciones.error('No pudimos abrir el pago', 'Inténtalo de nuevo en unos minutos.');
      this.pagando.set(false);
    }
  }

  async cancelar() {
    if (!confirm('¿Seguro que quieres cancelar este pedido?')) return;
    try {
      await this.pedidos.cancelar(this.pedidoId);
    } catch (error) {
      console.error(error);
      this.notificaciones.error('No se pudo cancelar', 'Es posible que ya lo estemos preparando. Escríbenos.');
    }
  }
}
