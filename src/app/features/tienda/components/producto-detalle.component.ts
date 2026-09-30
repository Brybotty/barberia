import { Component, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Producto, STOCK_BAJO, estaDisponible, precioDe, sinExistencias, stockDe, tieneOpciones } from '../../../core/models/producto.model';
import { CarritoService, maximoDe } from '../../../core/services/carrito.service';
import { ProductoImagenComponent } from '../../../shared/components/producto-imagen/producto-imagen.component';
import { bloquearScroll } from '../../../shared/utils/scroll';

/** Ventana con el detalle del producto: opciones, cantidad y "Agregar al carrito". */
@Component({
  selector: 'app-producto-detalle',
  standalone: true,
  imports: [CurrencyPipe, ProductoImagenComponent],
  host: { '(document:keydown.escape)': 'cerrar.emit()' },
  template: `
    @let p = producto();
    <div class="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" [attr.aria-label]="p.nombre">
      <div class="absolute inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200" (click)="cerrar.emit()"></div>

      <div class="relative w-full sm:max-w-4xl max-h-[92svh] overflow-y-auto bg-neutral-950 border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl grid grid-cols-1 md:grid-cols-2 animate-in fade-in slide-in-from-bottom-8 sm:zoom-in-95 duration-300">
        <button type="button" (click)="cerrar.emit()" aria-label="Cerrar"
                class="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/60 backdrop-blur border border-white/15 text-white flex items-center justify-center hover:bg-black/80 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>

        <app-producto-imagen class="aspect-square md:aspect-auto md:min-h-[520px]" [src]="p.imagen" [nombre]="p.nombre" tamanoInicial="9rem" />

        <div class="p-6 sm:p-8 flex flex-col">
          <p class="text-[11px] font-extrabold uppercase tracking-[0.25em] text-detalle-400 mb-3">{{ p.marca ? p.marca + ' · ' : '' }}{{ p.categoria }}</p>
          <h2 class="font-display text-3xl sm:text-4xl font-black text-white leading-tight mb-4 pr-10">{{ p.nombre }}</h2>

          <div class="flex items-baseline gap-3 mb-6">
            <span class="text-3xl font-black text-white">{{ precio() | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
            @if (porcentaje()) {
              <span class="text-neutral-500 line-through">{{ p.precioAntes | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
              <span class="text-xs font-black text-sobre-acento bg-acento-500 px-2 py-0.5 rounded-full">-{{ porcentaje() }}%</span>
            }
          </div>

          <p class="text-neutral-300 leading-relaxed whitespace-pre-line mb-8">{{ p.descripcion }}</p>

          @if (conOpciones()) {
            <p class="text-xs font-extrabold uppercase tracking-widest text-neutral-500 mb-3">Elige una opción</p>
            <div class="flex flex-wrap gap-2 mb-8">
              @for (o of p.opciones; track o.nombre) {
                <button type="button" (click)="elegir(o.nombre)" [disabled]="!disponible(o.nombre)"
                        class="px-4 py-2.5 rounded-xl border text-sm font-bold transition-all disabled:opacity-35 disabled:line-through disabled:cursor-not-allowed"
                        [class]="opcion() === o.nombre ? 'bg-acento-500 border-acento-500 text-sobre-acento' : 'border-white/15 text-neutral-200 hover:border-white/40'">
                  {{ o.nombre }}
                  <span class="ml-1 font-semibold opacity-70">{{ o.precio | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                </button>
              }
            </div>
          }

          @if (restantes(); as texto) {
            <p class="-mt-4 mb-6 text-sm font-bold" [class]="agotadoAhora() ? 'text-red-400' : 'text-amber-300'">{{ texto }}</p>
          }

          <!-- En móvil queda fija abajo para no tener que desplazarse hasta el botón -->
          <div class="mt-auto flex items-center gap-3 sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-neutral-950/95 backdrop-blur border-t border-white/10 sm:static sm:m-0 sm:p-0 sm:bg-transparent sm:backdrop-blur-none sm:border-0">
            <div class="flex items-center rounded-full border border-white/15">
              <button type="button" (click)="cantidad.set(cantidad() - 1)" [disabled]="cantidad() <= 1" aria-label="Menos" class="w-11 h-12 text-xl text-white disabled:opacity-30">−</button>
              <span class="w-8 text-center font-bold text-white">{{ cantidad() }}</span>
              <button type="button" (click)="cantidad.set(cantidad() + 1)" [disabled]="cantidad() >= maximo()" aria-label="Más" class="w-11 h-12 text-xl text-white disabled:opacity-30">+</button>
            </div>
            <button type="button" (click)="agregar()" [disabled]="!puedeAgregar()"
                    class="flex-1 inline-flex items-center justify-center gap-2 bg-acento-500 hover:bg-acento-400 disabled:opacity-40 disabled:cursor-not-allowed text-sobre-acento font-black h-12 rounded-full transition-all active:scale-[0.98]">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
              {{ agotadoAhora() ? 'Agotado' : conOpciones() && !opcion() ? 'Elige una opción' : 'Agregar al carrito' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ProductoDetalleComponent implements OnInit, OnDestroy {
  private carrito = inject(CarritoService);

  producto = input.required<Producto>();
  cerrar = output<void>();

  opcion = signal<string | null>(null);
  cantidad = signal(1);

  conOpciones = computed(() => tieneOpciones(this.producto()));
  precio = computed(() => {
    const p = this.producto();
    return (this.opcion() && precioDe(p, this.opcion())) || (this.conOpciones() ? Math.min(...p.opciones!.map(o => o.precio)) : p.precio);
  });
  /** Descuento frente al precio de la opción elegida (una opción más cara puede no estar en oferta). */
  porcentaje = computed(() => {
    const antes = this.producto().precioAntes ?? 0;
    return antes > this.precio() ? Math.round((1 - this.precio() / antes) * 100) : null;
  });
  /** Lo que aún se puede agregar: inventario (o tope) menos lo que ya está en el carrito. */
  maximo = computed(() => {
    const opcion = this.conOpciones() ? this.opcion() : null;
    if (this.conOpciones() && !opcion) return 1;
    return Math.max(0, maximoDe(this.producto(), opcion) - this.carrito.enCarrito(this.producto().id!, opcion));
  });
  agotadoAhora = computed(() => {
    const p = this.producto();
    if (this.conOpciones()) return this.opcion() ? !this.disponible(this.opcion()!) : sinExistencias(p);
    return !estaDisponible(p, null);
  });
  /** "Quedan 2 unidades", "Ya tienes todas las unidades disponibles en tu carrito"... */
  restantes = computed(() => {
    const p = this.producto();
    const opcion = this.conOpciones() ? this.opcion() : null;
    if (this.conOpciones() && !opcion) return '';
    const stock = stockDe(p, opcion);
    if (stock === null || this.agotadoAhora()) return this.agotadoAhora() && p.controlStock ? 'Sin unidades por ahora' : '';
    if (this.maximo() === 0) return 'Ya tienes en tu carrito todas las unidades disponibles';
    return stock <= STOCK_BAJO ? `¡${stock === 1 ? 'Queda 1 unidad' : 'Quedan ' + stock + ' unidades'}!` : '';
  });
  puedeAgregar = computed(() => !this.agotadoAhora() && (!this.conOpciones() || !!this.opcion()) && this.maximo() > 0);

  disponible(opcion: string): boolean {
    return estaDisponible(this.producto(), opcion);
  }

  elegir(opcion: string) {
    this.opcion.set(opcion);
    this.cantidad.set(1);
  }

  private liberarScroll?: () => void;

  ngOnInit() {
    // Preselecciona la primera opción disponible.
    const primera = this.producto().opciones?.find(o => this.disponible(o.nombre));
    if (primera) this.opcion.set(primera.nombre);
    this.liberarScroll = bloquearScroll();
  }

  ngOnDestroy() {
    this.liberarScroll?.();
  }

  agregar() {
    if (!this.puedeAgregar()) return;
    this.carrito.agregar(this.producto(), this.conOpciones() ? this.opcion() : null, Math.min(this.cantidad(), this.maximo()));
    this.carrito.abierto.set(true);
    this.cerrar.emit();
  }
}
