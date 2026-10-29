import { Component, computed, inject, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { Servicio } from '../../../core/models/servicio.model';
import { AjustesService } from '../../../core/services/ajustes.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ServiciosService } from '../../../core/services/servicios.service';
import { ServiciosDelDiaService } from '../../../core/services/servicios-del-dia.service';
import { claveDia, fechaDesdeClave } from '../../../core/utils/horario';
import { diasLimitados, nombresDeServicios } from '../../../core/utils/servicios-del-dia';
import { IconoComponent } from '../../../shared/components/icono/icono.component';

/**
 * Los días que el admin dejó solo para algunos servicios (se eligen en Citas, tocando el día), todos juntos: para
 * verlos de un vistazo y quitarlos. Ver utils/servicios-del-dia.ts.
 */
@Component({
  selector: 'app-dias-con-servicios',
  standalone: true,
  imports: [DatePipe, IconoComponent],
  template: `
    <section class="tarjeta mb-8 p-5 sm:p-6" aria-labelledby="dias-servicios-titulo" data-dias-con-servicios>
      <div class="flex items-start gap-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-detalle-400/40 text-detalle-200">
          <app-icono nombre="estrella" class="h-5 w-5" [grosor]="1.8" />
        </span>
        <div class="min-w-0 flex-1">
          <h3 id="dias-servicios-titulo" class="text-lg font-black">Días con servicios limitados</h3>
          <p class="mt-1 text-sm text-neutral-400">
            Un día solo para algunos servicios (por ejemplo, solo Premium). Se elige en
            <button type="button" (click)="irACitas.emit()" class="font-bold text-detalle-200 underline underline-offset-4 hover:text-white">Citas</button>:
            toca el día en el calendario y luego "Limitar".
          </p>
        </div>
      </div>
      @if (dias().length > 0) {
        <ul class="mt-5 divide-y divide-white/5 rounded-2xl border border-white/10 bg-black/30">
          @for (d of dias(); track d.dia) {
            <li class="flex items-center gap-3 px-4 py-3">
              <div class="min-w-0 flex-1">
                <p class="font-bold capitalize">{{ fecha(d.dia) | date:'EEEE d MMMM' }}</p>
                <p class="text-sm text-detalle-200">Solo {{ nombres(d.servicios) }}</p>
              </div>
              <button type="button" (click)="quitar(d.dia)" [disabled]="quitando() === d.dia" class="boton-linea boton-chico shrink-0" [attr.aria-label]="'Abrir todos los servicios el ' + (fecha(d.dia) | date:'EEEE d MMMM')">Abrir todos</button>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class DiasConServiciosComponent {
  private ajustes = inject(AjustesService);
  private notificaciones = inject(NotificationService);
  private serviciosDelDiaService = inject(ServiciosDelDiaService);

  /** El panel cambia a la pestaña de Citas. */
  readonly irACitas = output<void>();

  private readonly servicios = toSignal(inject(ServiciosService).actuales().pipe(catchError(() => of<Servicio[]>([]))), { initialValue: [] as Servicio[] });
  readonly dias = computed(() => diasLimitados(this.ajustes.serviciosPorDia(), claveDia(new Date())));
  readonly quitando = signal<string | null>(null);

  fecha(dia: string): Date {
    return fechaDesdeClave(dia);
  }

  nombres(ids: string[]): string {
    return nombresDeServicios(ids, this.servicios());
  }

  async quitar(dia: string) {
    this.quitando.set(dia);
    try {
      await this.serviciosDelDiaService.guardar(dia, null);
    } catch (error) {
      console.error('Error abriendo los servicios del día', error);
      this.notificaciones.error('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.quitando.set(null);
    }
  }
}
