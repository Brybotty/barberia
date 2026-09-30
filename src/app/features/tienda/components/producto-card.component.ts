import { Component, computed, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Producto, descuento, precioMinimo, preciosVariables, sinExistencias, tieneOpciones, ultimasUnidades } from '../../../core/models/producto.model';
import { ProductoImagenComponent } from '../../../shared/components/producto-imagen/producto-imagen.component';

@Component({
  selector: 'app-producto-card',
  standalone: true,
  imports: [CurrencyPipe, ProductoImagenComponent],
  host: { class: 'block h-full' },
  template: `
    @let p = producto();
    <article class="group h-full flex flex-col rounded-3xl overflow-hidden bg-neutral-900/70 border border-white/10 hover:border-white/25 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/60 transition-all duration-300">
      <button type="button" (click)="ver.emit(p)" class="relative block aspect-square w-full" [attr.aria-label]="'Ver ' + p.nombre">
        <app-producto-imagen class="absolute inset-0" [src]="p.imagen" [nombre]="p.nombre"
                             claseImagen="group-hover:scale-105 transition-transform duration-700" />
        <span class="absolute top-3 left-3 max-w-[calc(100%-1.5rem)] truncate text-[10px] sm:text-[11px] font-bold text-white bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full">
          {{ p.marca ? p.marca + ' • ' : '' }}{{ p.categoria }}
        </span>
        @if (porcentaje(); as d) {
          <span class="absolute top-3 right-3 text-[11px] font-black text-sobre-acento bg-acento-500 px-2 py-1 rounded-full">-{{ d }}%</span>
        }
        @if (!agotado() && ultimas(); as n) {
          <span class="absolute bottom-3 left-3 text-[10px] sm:text-[11px] font-black text-amber-200 bg-amber-500/20 backdrop-blur-md border border-amber-400/30 px-2.5 py-1 rounded-full">¡{{ n === 1 ? 'Última unidad' : 'Últimas ' + n + ' unidades' }}!</span>
        }
        @if (agotado()) {
          <span class="absolute inset-0 flex items-center justify-center bg-black/55">
            <span class="text-xs font-black uppercase tracking-widest text-white border border-white/30 px-3 py-1.5 rounded-full">Agotado</span>
          </span>
        }
      </button>

      <div class="flex flex-col flex-1 p-4 sm:p-5">
        <h3 class="font-bold text-white text-sm sm:text-base leading-snug line-clamp-2 sm:line-clamp-1">{{ p.nombre }}</h3>
        <p class="hidden sm:block text-sm text-neutral-400 leading-relaxed line-clamp-2 mt-1.5">{{ p.descripcion }}</p>

        <div class="mt-auto pt-4 sm:mt-5 sm:border-t sm:border-white/10 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div class="leading-tight min-w-0">
            <span class="block text-[10px] sm:text-[11px] font-semibold text-neutral-500 whitespace-nowrap">
              {{ variable() ? 'Desde' : 'Precio' }}
              @if (porcentaje()) { <span class="ml-1 line-through">{{ p.precioAntes | currency:'COP':'symbol-narrow':'1.0-0' }}</span> }
            </span>
            <span class="text-base sm:text-lg font-black text-white whitespace-nowrap">{{ precio() | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
          </div>
          <button type="button" (click)="alPulsar()" [disabled]="agotado()"
                  class="shrink-0 text-xs sm:text-sm font-bold rounded-full px-4 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  [class]="conOpciones() ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-acento-500 text-sobre-acento hover:bg-acento-400'">
            {{ agotado() ? 'Agotado' : conOpciones() ? 'Ver opciones' : 'Agregar' }}
          </button>
        </div>
      </div>
    </article>
  `,
})
export class ProductoCardComponent {
  producto = input.required<Producto>();
  ver = output<Producto>();
  agregar = output<Producto>();

  conOpciones = computed(() => tieneOpciones(this.producto()));
  precio = computed(() => precioMinimo(this.producto()));
  variable = computed(() => preciosVariables(this.producto()));
  porcentaje = computed(() => descuento(this.producto()));
  agotado = computed(() => sinExistencias(this.producto()));
  ultimas = computed(() => ultimasUnidades(this.producto()));

  alPulsar() {
    if (this.conOpciones()) this.ver.emit(this.producto());
    else this.agregar.emit(this.producto());
  }
}
