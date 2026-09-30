import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Servicio, iconoDe } from '../../../core/models/servicio.model';
import { IconoComponent } from '../icono/icono.component';
import { CurrencyPipe } from '@angular/common';
import { DuracionPipe } from '../../pipes/duracion.pipe';

@Component({
  selector: 'app-service-card',
  standalone: true,
  imports: [CurrencyPipe, DuracionPipe, IconoComponent],
  template: `
    <button type="button" (click)="onSelect.emit(servicio)"
            class="group relative w-full text-left vidrio rounded-3xl p-6 flex flex-col h-full hover:border-acento-500/40 hover:-translate-y-1 hover:shadow-2xl hover:shadow-acento-500/10 transition-all duration-300">

      <div class="flex items-start justify-between mb-6">
        <div class="w-12 h-12 rounded-2xl bg-acento-500/10 text-acento-500 flex items-center justify-center group-hover:bg-detalle-400 group-hover:text-neutral-950 transition-colors duration-300">
          <app-icono [nombre]="icono" class="w-6 h-6" />
        </div>
        <span class="flex items-center gap-1.5 text-xs font-bold text-neutral-500">
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {{ servicio.duracionMinutos | duracion }}
        </span>
      </div>

      <h3 class="text-lg font-bold text-white mb-2 leading-snug">{{ servicio.nombre }}</h3>
      <p class="text-sm text-neutral-400 leading-relaxed line-clamp-2 mb-6">{{ servicio.descripcion }}</p>

      <div class="mt-auto flex items-end justify-between gap-3">
        <div>
          <span class="block text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 mb-0.5">{{ servicio.precioDesde ? 'Desde' : 'Precio' }}</span>
          <span class="text-2xl font-black text-white">{{ servicio.precio | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
        </div>
        <span class="flex items-center gap-1 text-sm font-bold text-acento-500 group-hover:gap-2 transition-all">
          Reservar
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
        </span>
      </div>
    </button>
  `
})
export class ServiceCardComponent {
  @Input({ required: true }) servicio!: Servicio;

  @Output() onSelect = new EventEmitter<Servicio>();

  get icono() {
    return iconoDe(this.servicio);
  }
}
