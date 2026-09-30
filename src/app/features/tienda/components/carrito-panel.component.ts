import { Component, computed, effect, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Router } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { Producto } from '../../../core/models/producto.model';
import { CarritoService, subtotalDe } from '../../../core/services/carrito.service';
import { ProductosService } from '../../../core/services/productos.service';
import { ProductoImagenComponent } from '../../../shared/components/producto-imagen/producto-imagen.component';
import { bloquearScroll } from '../../../shared/utils/scroll';

/** Carrito lateral. Vive en el layout para abrirse desde cualquier página. */
@Component({
  selector: 'app-carrito-panel',
  standalone: true,
  imports: [CurrencyPipe, ProductoImagenComponent],
  host: { '(document:keydown.escape)': 'carrito.abierto.set(false)' },
  template: `
    @if (carrito.abierto()) {
      <div class="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Carrito">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" (click)="carrito.abierto.set(false)"></div>

        <aside class="absolute right-0 top-0 h-full w-full max-w-md bg-neutral-950 border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
          <header class="flex items-center justify-between px-6 h-20 border-b border-white/10 shrink-0">
            <h2 class="text-lg font-black text-white">Tu carrito <span class="text-neutral-500 font-bold">({{ carrito.cantidad() }})</span></h2>
            <button type="button" (click)="carrito.abierto.set(false)" aria-label="Cerrar carrito" class="w-10 h-10 rounded-full border border-white/15 text-white flex items-center justify-center hover:bg-white/10 transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </header>

          @if (lineas().length === 0) {
            <div class="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div class="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                <svg class="w-9 h-9 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
              </div>
              <p class="text-white font-bold mb-2">Tu carrito está vacío</p>
              <p class="text-neutral-500 text-sm mb-8">Descubre los productos que usamos en la barbería.</p>
              <button type="button" (click)="ir('/tienda')" class="bg-acento-500 hover:bg-acento-400 text-sobre-acento font-black px-7 py-3.5 rounded-full transition-colors">Ir a la tienda</button>
            </div>
          } @else {
            <ul class="flex-1 overflow-y-auto divide-y divide-white/5 px-6">
              @for (l of lineas(); track l.productoId + (l.opcion ?? '')) {
                <li class="flex gap-4 py-5">
                  <app-producto-imagen class="w-20 h-20 shrink-0 rounded-2xl" [class.opacity-50]="!l.disponible" [src]="l.producto?.imagen" [nombre]="l.nombre" tamanoInicial="2rem" />
                  <div class="flex-1 min-w-0">
                    <p class="font-bold text-white text-sm leading-snug line-clamp-2">{{ l.nombre }}</p>
                    @if (l.opcion) {
                      <p class="text-xs text-neutral-500 mt-0.5">{{ l.opcion }}</p>
                    }
                    @if (l.aviso) {
                      <p class="text-xs font-bold text-red-400 mt-1">{{ l.aviso }}</p>
                    }
                    <div class="flex items-center justify-between mt-3">
                      <div class="flex items-center rounded-full border border-white/15">
                        <button type="button" (click)="carrito.cambiarCantidad(l, l.cantidad - 1)" aria-label="Menos" class="w-8 h-8 text-white">−</button>
                        <span class="w-6 text-center text-sm font-bold text-white">{{ l.cantidad }}</span>
                        <button type="button" (click)="carrito.cambiarCantidad(l, l.cantidad + 1)" [disabled]="l.cantidad >= l.maximo" aria-label="Más" class="w-8 h-8 text-white disabled:opacity-30">+</button>
                      </div>
                      <span class="font-black text-white text-sm">{{ l.precio * l.cantidad | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                    </div>
                  </div>
                  <button type="button" (click)="carrito.quitar(l)" aria-label="Quitar" class="self-start p-1 text-neutral-600 hover:text-red-400 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </li>
              }
            </ul>

            <footer class="border-t border-white/10 p-6 space-y-4 shrink-0">
              <div class="flex items-center justify-between">
                <span class="text-neutral-400">Subtotal</span>
                <span class="text-xl font-black text-white">{{ subtotal() | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
              </div>
              @if (hayAvisos()) {
                <p class="text-xs font-bold text-red-400">Ajusta los productos marcados para continuar.</p>
              } @else {
                <p class="text-xs text-neutral-500">El envío se calcula al finalizar la compra.</p>
              }
              <button type="button" (click)="ir('/tienda/pagar')" [disabled]="subtotal() === 0 || hayAvisos()"
                      class="w-full inline-flex items-center justify-center gap-2 bg-acento-500 hover:bg-acento-400 disabled:opacity-40 text-sobre-acento font-black py-4 rounded-full transition-all active:scale-[0.98]">
                Finalizar compra
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
              </button>
              <button type="button" (click)="carrito.abierto.set(false)" class="w-full text-sm font-bold text-neutral-400 hover:text-white py-2 transition-colors">Seguir comprando</button>
            </footer>
          }
        </aside>
      </div>
    }
  `,
})
export class CarritoPanelComponent {
  readonly carrito = inject(CarritoService);
  private router = inject(Router);
  private productosService = inject(ProductosService);

  // El catálogo solo se consulta con el carrito abierto: el panel está en todas las páginas.
  private productos = toSignal(
    toObservable(this.carrito.abierto).pipe(
      switchMap(abierto => abierto ? this.productosService.todos().pipe(catchError(() => of([] as Producto[]))) : of([])),
    ),
    { initialValue: [] as Producto[] },
  );

  readonly lineas = computed(() => this.carrito.lineas(this.productos()));
  readonly subtotal = computed(() => subtotalDe(this.lineas()));
  readonly hayAvisos = computed(() => this.lineas().some(l => !l.disponible));

  constructor() {
    // Sin scroll de fondo mientras el carrito está abierto.
    effect(onCleanup => {
      if (this.carrito.abierto()) onCleanup(bloquearScroll());
    });
  }

  ir(ruta: string) {
    this.carrito.abierto.set(false);
    this.router.navigateByUrl(ruta);
  }
}
