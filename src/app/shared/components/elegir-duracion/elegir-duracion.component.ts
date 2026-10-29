import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DURACION_MAXIMA, DURACION_MINIMA, PASO_DURACION, duracionRecurrente, duracionesHasta } from '../../../core/models/recurrencia.model';
import { DuracionPipe } from '../../pipes/duracion.pipe';
import { IconoComponent } from '../icono/icono.component';

/**
 * Duración del servicio para un cliente que tarda más o menos que lo normal: − y + de 5 en 5 y, en el medio, una
 * lista (de "5 min" a "4 h") para saltar directo. Arranca en la del catálogo y ofrece volver a ella. La usan las
 * agendas recurrentes y las citas que agenda el equipo desde el panel.
 * Uso: <app-elegir-duracion [(duracion)]="duracion" [catalogo]="duracionDelServicio" />
 */
@Component({
  selector: 'app-elegir-duracion',
  standalone: true,
  imports: [FormsModule, IconoComponent, DuracionPipe],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-3 rounded-2xl border border-white/10 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <label [for]="campoId()" class="block text-sm font-bold">Duración del servicio</label>
        <p class="text-xs text-neutral-500">
          {{ duracion() !== catalogo() ? 'Normalmente dura ' + (catalogo() | duracion) + '.' : 'La del catálogo. Cámbiala de 5 en 5 minutos si este cliente tarda más o menos.' }}
        </p>
        @if (duracion() !== sugerida()) {
          <button type="button" (click)="duracion.set(sugerida())" class="enlace-toque text-xs font-bold text-detalle-200 hover:text-white">Volver a {{ sugerida() | duracion }}</button>
        }
      </div>
      <div class="flex items-center gap-1 sm:shrink-0">
        <button type="button" (click)="cambiar(-paso)" [disabled]="duracion() <= minima" class="boton-icono disabled:opacity-30" aria-label="5 minutos menos">
          <app-icono nombre="menos" class="h-4 w-4" [grosor]="2.4" />
        </button>
        <!-- Tocarla abre la lista (5 min, 10 min... 4 h) para saltar directo a cualquier duración. -->
        <select [id]="campoId()" [attr.name]="nombre()" [ngModel]="duracion()" (ngModelChange)="elegir($event)"
                class="h-10 min-w-0 flex-1 cursor-pointer rounded-xl border border-white/10 bg-black/40 px-2 text-center font-display text-base font-black tabular-nums text-white [color-scheme:dark] [text-align-last:center] focus:border-detalle-400/70 focus:outline-none focus:ring-1 focus:ring-detalle-400/30 sm:w-32 sm:flex-none">
          @for (d of duraciones(); track d) { <option [ngValue]="d">{{ d | duracion }}</option> }
        </select>
        <button type="button" (click)="cambiar(paso)" [disabled]="duracion() >= maxima()" class="boton-icono disabled:opacity-30" aria-label="5 minutos más">
          <app-icono nombre="mas" class="h-4 w-4" [grosor]="2.4" />
        </button>
      </div>
    </div>
  `,
})
export class ElegirDuracionComponent {
  /** En minutos, de 5 en 5. */
  readonly duracion = model.required<number>();
  /** La del catálogo para el servicio elegido (puede no ir de 5 en 5). */
  readonly catalogo = input.required<number>();
  /** Hasta dónde llega la lista (4 horas, salvo que el catálogo diga más). */
  readonly maxima = input(DURACION_MAXIMA);
  readonly campoId = input('duracion');
  /** El `name` de la lista (lo buscan las pruebas). */
  readonly nombre = input('duracion');

  readonly paso = PASO_DURACION;
  readonly minima = DURACION_MINIMA;
  readonly duraciones = computed(() => duracionesHasta(this.maxima()));
  /** La del catálogo llevada a una que se puede elegir: con la que arranca. */
  readonly sugerida = computed(() => duracionRecurrente(this.catalogo(), this.maxima()));

  /** Con − y +: 5 minutos menos o más. */
  cambiar(delta: number) {
    this.duracion.set(duracionRecurrente(this.duracion() + delta, this.maxima()));
  }

  /** De la lista: cualquier duración de 5 en 5. */
  elegir(minutos: number) {
    this.duracion.set(duracionRecurrente(minutos, this.maxima()));
  }
}
