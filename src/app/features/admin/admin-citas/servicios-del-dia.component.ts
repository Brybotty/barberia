import { Component, OnInit, computed, inject, input, output } from '@angular/core';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { Servicio } from '../../../core/models/servicio.model';
import { AjustesService } from '../../../core/services/ajustes.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ServiciosDelDiaService } from '../../../core/services/servicios-del-dia.service';
import { fechaDesdeClave } from '../../../core/utils/horario';
import { nombresDeServicios, serviciosDelDia } from '../../../core/utils/servicios-del-dia';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';

/**
 * Qué se puede reservar en línea un día (pedido del cliente: "el 23 de noviembre solo turnos Premium"). Se abre desde
 * el calendario de Citas. Todos los servicios, o solo los que se marquen; se guarda en `ajustes/sitio.serviciosPorDia`
 * y la reserva lo ve al instante (las reglas exigen lo mismo).
 */
@Component({
  selector: 'app-servicios-del-dia',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgClass, DuracionPipe],
  template: `
    <div class="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="servicios-dia-titulo">
      <div class="absolute inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200" (click)="cerrar.emit()"></div>
      <form (submit)="$event.preventDefault(); guardar()" class="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-300 sm:max-w-md sm:rounded-3xl sm:p-7">
        <p class="rotulo mb-2 capitalize">{{ fecha() | date:'EEEE d MMMM' }}</p>
        <h3 id="servicios-dia-titulo" class="text-xl font-black">¿Qué se reserva este día?</h3>
        <p class="mt-2 text-sm text-neutral-400">Lo que tus clientes pueden reservar en la página ese día. Los demás días siguen igual.</p>

        <div class="mt-5 grid grid-cols-2 gap-2" role="group" aria-label="Servicios de este día">
          <button type="button" (click)="todos = true" [attr.aria-pressed]="todos" class="min-h-11 rounded-xl border px-3 text-sm font-bold transition-colors"
                  [ngClass]="todos ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-400 hover:text-white'">Todos los servicios</button>
          <button type="button" (click)="soloAlgunos()" [attr.aria-pressed]="!todos" class="min-h-11 rounded-xl border px-3 text-sm font-bold transition-colors"
                  [ngClass]="!todos ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-400 hover:text-white'">Solo algunos</button>
        </div>

        @if (!todos) {
          <ul class="mt-4 space-y-2">
            @for (s of catalogo(); track s.id) {
              <li>
                <label class="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-2.5 transition-colors"
                       [ngClass]="elegidos.has(s.id!) ? 'border-emerald-500/40 bg-emerald-500/[0.07]' : 'border-white/10'">
                  <span class="min-w-0">
                    <span class="block truncate font-bold">{{ s.nombre }}</span>
                    <span class="block text-xs text-neutral-500">{{ s.precio | currency:'COP':'symbol-narrow':'1.0-0' }} · {{ s.duracionMinutos | duracion }}</span>
                  </span>
                  <input type="checkbox" [name]="'servicio-' + s.id"[checked]="elegidos.has(s.id!)" (change)="alternar(s.id!)" class="peer sr-only">
                  <span class="interruptor"></span>
                </label>
              </li>
            }
          </ul>
          <p class="mt-3 text-sm font-semibold" [ngClass]="elegidos.size ? 'text-detalle-200' : 'text-red-300'" aria-live="polite">
            {{ elegidos.size ? 'Ese día solo se reserva ' + resumen + '.' : 'Elige al menos un servicio (para no abrir nada, cierra el día en Ajustes).' }}
          </p>
        }

        <p class="ayuda mt-5">No cambia las citas que ya están agendadas ni los turnos de las agendas recurrentes. Tú y tu equipo pueden agendar cualquier servicio desde el panel (sale un aviso).</p>

        <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" (click)="cerrar.emit()" class="boton-linea">Cancelar</button>
          <button type="submit" [disabled]="guardando || (!todos && elegidos.size === 0)" class="boton-acento">{{ guardando ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </div>
  `,
})
export class ServiciosDelDiaComponent implements OnInit {
  private ajustes = inject(AjustesService);
  private notificaciones = inject(NotificationService);
  private serviciosDelDiaService = inject(ServiciosDelDiaService);

  readonly dia = input.required<string>();
  readonly servicios = input<Servicio[]>([]);
  readonly cerrar = output<void>();

  readonly fecha = computed(() => fechaDesdeClave(this.dia()));
  /** Del más caro al más barato, como en Servicios. */
  readonly catalogo = computed(() => [...this.servicios()].sort((a, b) => b.precio - a.precio));

  todos = true;
  elegidos = new Set<string>();
  guardando = false;

  ngOnInit() {
    const actuales = serviciosDelDia(this.ajustes.serviciosPorDia(), this.dia());
    this.todos = !actuales;
    // Sin los IDs de servicios que ya se borraron del menú.
    this.elegidos = new Set((actuales ?? []).filter(id => this.servicios().some(s => s.id === id)));
  }

  get resumen(): string {
    return nombresDeServicios([...this.elegidos], this.catalogo());
  }

  soloAlgunos() {
    this.todos = false;
  }

  alternar(id: string) {
    const elegidos = new Set(this.elegidos);
    if (elegidos.has(id)) elegidos.delete(id);
    else elegidos.add(id);
    this.elegidos = elegidos;
  }

  async guardar() {
    if (!this.todos && this.elegidos.size === 0) return;
    // En el orden del menú (del más caro al más barato).
    const servicios = this.todos ? null : this.catalogo().map(s => s.id!).filter(id => this.elegidos.has(id));
    this.guardando = true;
    try {
      await this.serviciosDelDiaService.guardar(this.dia(), servicios);
      const dia = this.fecha().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
      this.notificaciones.exito('Listo', servicios ? `El ${dia} solo se reserva ${this.resumen}.` : `El ${dia} se reservan todos los servicios.`);
      this.cerrar.emit();
    } catch (error) {
      console.error('Error guardando los servicios del día', error);
      this.notificaciones.error('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.guardando = false;
    }
  }
}
