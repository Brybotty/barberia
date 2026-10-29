import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MULTA_MAXIMA } from '../../../core/models/ajustes.model';
import { Cita } from '../../../core/models/cita.model';
import { AjustesService } from '../../../core/services/ajustes.service';
import { CitasService } from '../../../core/services/citas.service';
import { NotificationService } from '../../../core/services/notification.service';

/**
 * Marcar que el cliente no llegó. Si el admin activó la multa en Ajustes, aquí se pone: sola (viene marcada y se
 * puede quitar, por ejemplo si avisó a tiempo) o decidiendo cada vez. El valor se puede cambiar para este caso.
 * La multa se cobra en la siguiente visita del cliente (al marcarla "Hecho").
 */
@Component({
  selector: 'app-no-asistio',
  standalone: true,
  imports: [CurrencyPipe, FormsModule],
  host: { '(document:keydown.escape)': 'cerrar.emit()' },
  template: `
    <div class="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="no-asistio-titulo">
      <div class="absolute inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200" (click)="cerrar.emit()"></div>
      <form (ngSubmit)="guardar()" class="relative w-full rounded-t-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-300 sm:max-w-md sm:rounded-3xl sm:p-7">
        <p class="rotulo mb-2">{{ cita().serviceName }}</p>
        <h3 id="no-asistio-titulo" class="text-xl font-black">¿El cliente no asistió?</h3>
        <p class="mt-1 text-sm text-neutral-400">{{ cita().userName }} · {{ cita().horaStr }}</p>

        @if (multa().activa) {
          <div class="mt-6 rounded-2xl border p-4 transition-colors" [class]="ponerMulta ? 'border-red-400/40 bg-red-500/[0.06]' : 'border-white/10'">
            <label class="flex cursor-pointer items-center justify-between gap-3">
              <span class="font-bold">Ponerle multa</span>
              <input type="checkbox" name="ponerMulta" [(ngModel)]="ponerMulta" class="peer sr-only">
              <span class="interruptor"></span>
            </label>
            @if (ponerMulta) {
              <label class="mt-4 block">
                <span class="etiqueta">Valor de la multa (COP)</span>
                <input name="valorMulta" type="number" min="0" [max]="maxima" step="1000" inputmode="numeric" [(ngModel)]="valor" class="campo font-bold">
              </label>
              <p class="ayuda">Queda pendiente junto a su carita y se cobra en su próxima visita, al marcarla "Hecho".</p>
            } @else {
              <p class="ayuda">{{ multa().automatica ? 'Quítala si avisó a tiempo o tuvo una buena razón.' : 'Actívala si quieres cobrarle ' + (multa().valor | currency:'COP':'symbol-narrow':'1.0-0') + ' en su próxima visita.' }}</p>
            }
          </div>
        }

        <div class="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" (click)="cerrar.emit()" class="boton-linea">Cancelar</button>
          <button type="submit" [disabled]="guardando()" class="boton-acento">
            {{ guardando() ? 'Guardando…' : ponerMulta && multa().activa ? 'No asistió, con multa' : 'Sí, no asistió' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class NoAsistioComponent implements OnInit {
  private citas = inject(CitasService);
  private notificaciones = inject(NotificationService);

  readonly cita = input.required<Cita>();
  readonly cerrar = output<void>();

  readonly multa = inject(AjustesService).multa;
  readonly maxima = MULTA_MAXIMA;
  readonly guardando = signal(false);

  ponerMulta = false;
  /** Lo que se le cobra si se le pone la multa: el de los ajustes, y se puede cambiar para este caso. */
  valor: number | null = null;

  ngOnInit() {
    this.ponerMulta = this.multa().activa && this.multa().automatica;
    this.valor = this.multa().valor;
  }

  async guardar() {
    const conMulta = this.multa().activa && this.ponerMulta;
    const valor = Math.round(Number(this.valor));
    if (conMulta && (!Number.isFinite(valor) || valor <= 0 || valor > MULTA_MAXIMA)) {
      this.notificaciones.error('Revisa la multa', 'Escribe un valor mayor que cero (o quita la multa).');
      return;
    }
    this.guardando.set(true);
    try {
      await this.citas.marcarNoAsistio(this.cita(), conMulta ? valor : 0);
      this.cerrar.emit();
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo actualizar el estado', 'Revisa tu conexión e inténtalo de nuevo.');
      this.guardando.set(false);
    }
  }
}
