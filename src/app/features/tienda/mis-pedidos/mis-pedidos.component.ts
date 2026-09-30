import { Component, inject } from '@angular/core';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { Pedido, codigoPedido, etiquetaEstado, etiquetaPago } from '../../../core/models/pedido.model';
import { AuthService } from '../../../core/services/auth.service';
import { PedidosService } from '../../../core/services/pedidos.service';
import { COLOR_ESTADO, COLOR_PAGO } from '../pedido-estilos';

@Component({
  selector: 'app-mis-pedidos',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgClass, RouterLink],
  template: `
    <div class="max-w-4xl mx-auto px-4 sm:px-6 py-12 md:py-16">
      <h1 class="font-display text-4xl font-black text-white mb-2">Mis pedidos</h1>
      <p class="text-neutral-400 mb-10">Sigue el estado de tus compras en la tienda.</p>

      @if (pedidos() === undefined) {
        <div class="space-y-4">
          @for (i of [1, 2]; track i) { <div class="vidrio rounded-3xl h-28 animate-pulse"></div> }
        </div>
      } @else if (pedidos()!.length === 0) {
        <div class="vidrio rounded-3xl py-16 px-6 text-center">
          <h2 class="text-xl font-bold text-white mb-2">Aún no tienes pedidos</h2>
          <p class="text-neutral-400 mb-8">Descubre los productos que usamos en la barbería.</p>
          <a routerLink="/tienda" class="inline-flex bg-acento-500 hover:bg-acento-400 text-sobre-acento font-black px-8 py-3.5 rounded-full transition-colors">Ir a la tienda</a>
        </div>
      } @else {
        <ul class="space-y-4">
          @for (p of pedidos(); track p.id) {
            <li>
              <a [routerLink]="['/tienda/pedido', p.id]" class="group vidrio rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-white/25 transition-colors">
                <div class="flex-1 min-w-0">
                  <div class="flex flex-wrap items-center gap-2 mb-2">
                    <span class="font-black text-white">#{{ codigo(p) }}</span>
                    <span class="text-xs font-bold px-2.5 py-1 rounded-full border" [ngClass]="colorEstado[p.estado]">{{ etiquetaEstado(p) }}</span>
                    <span class="text-xs font-bold px-2.5 py-1 rounded-full border" [ngClass]="colorPago[p.pago.estado]">{{ etiquetaPago(p.pago) }}</span>
                  </div>
                  <p class="text-sm text-neutral-400 truncate">{{ resumen(p) }}</p>
                  <p class="text-xs text-neutral-600 mt-1">{{ p.creadoEn | date:'d MMM y, h:mm a' }}</p>
                </div>
                <div class="flex items-center justify-between sm:justify-end gap-4">
                  <span class="text-lg font-black text-white">{{ p.total | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                  <svg class="w-5 h-5 text-neutral-500 group-hover:translate-x-1 group-hover:text-white transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </div>
              </a>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class MisPedidosComponent {
  private pedidosService = inject(PedidosService);
  readonly colorEstado = COLOR_ESTADO;
  readonly colorPago = COLOR_PAGO;
  readonly etiquetaEstado = etiquetaEstado;
  readonly etiquetaPago = etiquetaPago;
  readonly codigo = codigoPedido;

  readonly pedidos = toSignal(
    inject(AuthService).user$.pipe(
      switchMap(user => user ? this.pedidosService.delUsuario(user.uid) : of([] as Pedido[])),
      catchError(error => {
        console.error('Error cargando pedidos', error);
        return of([] as Pedido[]);
      }),
    ),
  );

  resumen(p: Pedido): string {
    return p.items.map(i => `${i.cantidad}× ${i.nombre}`).join(', ');
  }
}
