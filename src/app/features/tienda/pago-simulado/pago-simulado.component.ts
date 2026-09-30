import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe, NgClass } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { CLIENTE } from '../../../config/cliente';
import { codigoPedido } from '../../../core/models/pedido.model';
import { NotificationService } from '../../../core/services/notification.service';
import { PagosService } from '../../../core/services/pagos.service';
import { PedidosService } from '../../../core/services/pedidos.service';
import { environment } from '../../../../environments/environment';

/**
 * Checkout de pago SIMULADO para la demo con emuladores (sin llaves de Wompi).
 * En producción este paso lo hace el checkout de Wompi y esta página redirige al pedido.
 */
@Component({
  selector: 'app-pago-simulado',
  standalone: true,
  imports: [CurrencyPipe, NgClass],
  template: `
    <div class="min-h-screen bg-neutral-200 flex flex-col items-center justify-center px-4 py-10">
      <div class="w-full max-w-md">
        <p class="mb-4 text-center text-xs font-bold text-amber-900 bg-amber-200 border border-amber-300 rounded-xl px-4 py-2.5">
          Modo demostración: en producción aquí se abre el checkout seguro de Wompi (Bancolombia).
        </p>

        <div class="bg-white rounded-3xl shadow-2xl overflow-hidden text-neutral-900">
          <div class="bg-neutral-900 text-white px-7 py-6">
            <p class="text-xs font-bold uppercase tracking-widest text-neutral-400">Pagas a</p>
            <p class="text-xl font-black">{{ cliente.nombre }}</p>
            @if (pedido(); as p) {
              <div class="flex items-end justify-between mt-4">
                <span class="text-sm text-neutral-400">Pedido #{{ codigo }}</span>
                <span class="text-3xl font-black">{{ p.total | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
              </div>
            }
          </div>

          <div class="p-7">
            <p class="text-sm font-bold text-neutral-500 mb-3">¿Cómo quieres pagar?</p>
            <div class="grid grid-cols-2 gap-2 mb-6">
              @for (m of medios; track m.valor) {
                <button type="button" (click)="medio.set(m.valor)" class="rounded-2xl border-2 px-4 py-3.5 text-left transition-colors"
                        [ngClass]="medio() === m.valor ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-400'">
                  <span class="block font-black text-sm">{{ m.nombre }}</span>
                  <span class="block text-xs text-neutral-500">{{ m.detalle }}</span>
                </button>
              }
            </div>

            @switch (medio()) {
              @case ('CARD') {
                <div class="space-y-2 mb-6">
                  <div class="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-500">4242 4242 4242 4242</div>
                  <div class="grid grid-cols-2 gap-2">
                    <div class="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-500">12 / 30</div>
                    <div class="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-500">CVC 123</div>
                  </div>
                </div>
              }
              @case ('NEQUI') {
                <div class="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-500 mb-6">Celular Nequi · {{ pedido()?.cliente?.telefono }}</div>
              }
              @case ('PSE') {
                <div class="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-500 mb-6">Banco · Persona natural</div>
              }
              @default {
                <div class="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-500 mb-6">Te llevamos a la app de Bancolombia</div>
              }
            }

            <button type="button" (click)="pagar(true)" [disabled]="procesando() || !pedido()"
                    class="w-full bg-neutral-900 hover:bg-black disabled:opacity-50 text-white font-black py-4 rounded-2xl transition-colors">
              {{ procesando() ? 'Procesando…' : 'Pagar ' + ((pedido()?.total ?? 0) | currency:'COP':'symbol-narrow':'1.0-0') }}
            </button>
            <button type="button" (click)="pagar(false)" [disabled]="procesando() || !pedido()" class="w-full mt-3 text-xs font-bold text-neutral-400 hover:text-red-600 transition-colors">
              Simular un pago rechazado
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PagoSimuladoComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private pagos = inject(PagosService);
  private notificaciones = inject(NotificationService);

  readonly cliente = CLIENTE;
  readonly pedidoId = this.route.snapshot.paramMap.get('pedidoId')!;
  readonly codigo = codigoPedido({ id: this.pedidoId });
  readonly pedido = toSignal(inject(PedidosService).porId(this.pedidoId).pipe(catchError(() => of(null))));
  readonly medios = [
    { valor: 'CARD', nombre: 'Tarjeta', detalle: 'Crédito o débito' },
    { valor: 'NEQUI', nombre: 'Nequi', detalle: 'Desde tu celular' },
    { valor: 'PSE', nombre: 'PSE', detalle: 'Cuenta de ahorros o corriente' },
    { valor: 'BANCOLOMBIA_TRANSFER', nombre: 'Bancolombia', detalle: 'Botón de pago' },
  ];
  readonly medio = signal('CARD');
  readonly procesando = signal(false);

  constructor() {
    // Fuera de los emuladores esta página no existe: el pago real lo hace Wompi.
    if (!environment.emuladores) this.router.navigate(['/tienda/pedido', this.pedidoId], { replaceUrl: true });
  }

  async pagar(aprobar: boolean) {
    this.procesando.set(true);
    try {
      const transaccionId = await this.pagos.simular(this.pedidoId, aprobar, this.medio());
      // Como Wompi: vuelve a la página del pedido con ?id=<transacción>.
      await this.router.navigate(['/tienda/pedido', this.pedidoId], { queryParams: { id: transaccionId } });
    } catch (error: any) {
      console.error(error);
      this.notificaciones.error('No se pudo simular el pago', error?.message ?? '');
      this.procesando.set(false);
    }
  }
}
