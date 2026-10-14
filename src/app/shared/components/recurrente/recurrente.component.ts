import { Component, computed, input } from '@angular/core';
import { Frecuencia, opcionDe } from '../../../core/models/recurrencia.model';
import { IconoComponent } from '../icono/icono.component';

/**
 * Marca de un turno que viene de una agenda recurrente ("Recurrente · Semanal"), para verlo de un vistazo en la
 * agenda. Uso: @if (cita.recurrenciaId) { <app-recurrente [frecuencia]="cita.frecuencia" /> }
 */
@Component({
  selector: 'app-recurrente',
  standalone: true,
  imports: [IconoComponent],
  host: { class: 'chip-oro !gap-1 !px-2 !py-0.5 !tracking-wide whitespace-nowrap', '[attr.title]': 'titulo()' },
  template: `<app-icono nombre="repetir" class="h-3 w-3" [grosor]="2.2" />Recurrente@if (!corto() && nombre()) {<span class="font-bold opacity-80">· {{ nombre() }}</span>}`,
})
export class RecurrenteComponent {
  frecuencia = input<Frecuencia | undefined>();
  /** Solo "Recurrente" (para filas angostas). */
  corto = input(false);
  readonly nombre = computed(() => opcionDe(this.frecuencia())?.nombre ?? '');
  readonly titulo = computed(() => `Turno de una agenda recurrente${this.nombre() ? ` (${opcionDe(this.frecuencia())!.detalle.toLowerCase()})` : ''}`);
}
