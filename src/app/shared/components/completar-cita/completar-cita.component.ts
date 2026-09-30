import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Cita } from '../../../core/models/cita.model';
import { CitasService } from '../../../core/services/citas.service';
import { NotificationService } from '../../../core/services/notification.service';

/**
 * Ventana para marcar un corte como hecho y registrar lo que se cobró.
 * El valor viene con el precio reservado; se puede cambiar (servicios "Desde", adicionales).
 */
@Component({
  selector: 'app-completar-cita',
  standalone: true,
  imports: [CurrencyPipe, FormsModule],
  host: { '(document:keydown.escape)': 'cerrar.emit()' },
  template: `
    <div class="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true">
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" (click)="cerrar.emit()"></div>
      <form (ngSubmit)="guardar()" class="relative w-full sm:max-w-md bg-neutral-950 border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 sm:p-7 shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-300">
        <p class="text-[11px] font-extrabold uppercase tracking-[0.25em] text-detalle-400 mb-2">Corte realizado</p>
        <h3 class="text-xl font-black text-white">{{ cita().serviceName }}</h3>
        <p class="text-sm text-neutral-400 mt-1">{{ cita().userName }} · {{ cita().horaStr }}</p>

        <label class="block mt-6">
          <span class="etiqueta">Valor cobrado (COP)</span>
          <input name="valor" type="number" min="0" step="1000" [(ngModel)]="valor" class="campo text-lg font-bold" autofocus>
          <span class="block text-xs text-neutral-500 mt-1.5">
            Precio reservado: {{ cita().precio | currency:'COP':'symbol-narrow':'1.0-0' }}. Cámbialo si cobraste otro valor.
          </span>
        </label>

        <div class="flex gap-3 mt-7">
          <button type="button" (click)="cerrar.emit()" class="flex-1 py-3 rounded-xl text-sm font-bold text-neutral-400 border border-white/10 hover:text-white transition-colors">Cancelar</button>
          <button type="submit" [disabled]="guardando()" class="flex-1 py-3 rounded-xl text-sm font-black bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-neutral-950 transition-colors">
            {{ guardando() ? 'Guardando…' : 'Marcar como hecho' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class CompletarCitaComponent implements OnInit {
  private citas = inject(CitasService);
  private notificaciones = inject(NotificationService);

  cita = input.required<Cita>();
  cerrar = output<void>();

  valor: number | null = null;
  readonly guardando = signal(false);

  ngOnInit() {
    this.valor = this.cita().precioFinal ?? this.cita().precio;
  }

  async guardar() {
    const valor = Number(this.valor);
    if (!Number.isFinite(valor) || valor < 0) {
      this.notificaciones.error('Escribe un valor válido');
      return;
    }
    this.guardando.set(true);
    try {
      await this.citas.completar(this.cita(), valor);
      this.cerrar.emit();
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo marcar el corte', 'Revisa tu conexión e inténtalo de nuevo.');
      this.guardando.set(false);
    }
  }
}
