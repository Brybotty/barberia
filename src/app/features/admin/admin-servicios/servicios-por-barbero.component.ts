import { Component, computed, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { Barbero, avatarDe, ofreceServicio } from '../../../core/models/barbero.model';
import { Servicio, esDelMenuDe } from '../../../core/models/servicio.model';
import { BarberosService } from '../../../core/services/barberos.service';
import { ConfirmarService } from '../../../core/services/confirmar.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ServiciosService } from '../../../core/services/servicios.service';
import { IconoComponent } from '../../../shared/components/icono/icono.component';

/**
 * Qué servicios se pueden reservar en línea con cada barbero. Sirve para abrir primero unos (por ejemplo, los
 * Premium de la semana siguiente) y habilitar los demás cuando el admin quiera. Se guarda al tocar
 * (`barberos/{id}.serviciosCerrados`) y la reserva lo ve al instante; las reglas exigen lo mismo.
 */
@Component({
  selector: 'app-servicios-por-barbero',
  standalone: true,
  imports: [NgClass, IconoComponent],
  template: `
    <section class="tarjeta mb-8 p-5 sm:p-6" aria-labelledby="habilitar-titulo">
      <div class="flex items-start gap-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-detalle-400/40 text-detalle-200">
          <app-icono nombre="candado" class="h-5 w-5" [grosor]="1.8" />
        </span>
        <div class="min-w-0">
          <h3 id="habilitar-titulo" class="text-lg font-black">Qué se puede reservar con cada barbero</h3>
          <p class="mt-1 text-sm text-neutral-400">
            Habilita solo los servicios que quieres que tus clientes reserven en la página (por ejemplo, primero los Premium) y
            habilita los demás cuando quieras. Los que no estén habilitados se ven como "Disponible más adelante". Desde Citas tú
            puedes agendar cualquiera.
          </p>
        </div>
      </div>

      @if (barberos() === undefined) {
        <div class="mt-5 h-28 animate-pulse rounded-2xl bg-white/[0.04]"></div>
      } @else if (barberos()!.length === 0) {
        <p class="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-neutral-500">Aún no hay barberos. Agrégalos en Equipo.</p>
      } @else if (enLinea().length === 0) {
        <p class="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-neutral-500">Aún no hay servicios que se reserven en línea.</p>
      } @else {
        <ul class="mt-5 space-y-3">
          @for (b of barberos(); track b.id) {
            <li class="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div class="flex flex-wrap items-center gap-3">
                <img [src]="avatarDe(b)" alt="" class="h-10 w-10 shrink-0 rounded-full border border-white/15 object-cover object-[50%_25%]">
                <div class="min-w-0 flex-1">
                  <p class="truncate font-bold">{{ b.nombre }}</p>
                  <p class="text-xs font-semibold" [ngClass]="claseResumen(b)">{{ resumen(b) }}</p>
                </div>
                @if (cerrados(b).length) {
                  <button type="button" (click)="habilitarTodos(b)" [disabled]="guardando() === b.id" class="boton-linea boton-chico shrink-0">Habilitar todos</button>
                }
              </div>
              <div class="mt-3 flex flex-wrap gap-2" role="group" [attr.aria-label]="'Servicios que se reservan con ' + b.nombre">
                @for (s of menuDe(b); track s.id) {
                  <button type="button" (click)="cambiar(b, s)" [disabled]="guardando() === b.id" [attr.aria-pressed]="ofrece(b, s)"
                          [attr.title]="ofrece(b, s) ? 'Habilitado: tocar para quitarlo' : 'Sin habilitar: tocar para habilitarlo'"
                          class="inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors disabled:opacity-60"
                          [ngClass]="ofrece(b, s) ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400/70' : 'border-white/10 text-neutral-500 hover:border-white/30 hover:text-neutral-300'">
                    <app-icono [nombre]="ofrece(b, s) ? 'check' : 'candado'" class="h-4 w-4" [grosor]="ofrece(b, s) ? 2.6 : 1.8" />
                    {{ s.nombre }}
                  </button>
                }
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class ServiciosPorBarberoComponent {
  private barberosService = inject(BarberosService);
  private confirmar = inject(ConfirmarService);
  private notificaciones = inject(NotificationService);

  readonly avatarDe = avatarDe;
  /** undefined mientras carga. Sin la copia local: aquí se edita sobre lo que hay de verdad. */
  readonly barberos = toSignal(this.barberosService.listarCompleto().pipe(catchError(error => {
    console.error('Error cargando el equipo', error);
    return of<Barbero[]>([]);
  })));
  private readonly servicios = toSignal(inject(ServiciosService).actuales().pipe(catchError(() => of<Servicio[]>([]))), { initialValue: [] as Servicio[] });
  /** Barbero que se está guardando (sus botones esperan). */
  readonly guardando = signal<string | null>(null);

  /** Los servicios del catálogo, del más caro al más barato (todos se pueden reservar en línea). */
  readonly enLinea = computed(() => [...this.servicios()].sort((a, b) => b.precio - a.precio));

  /** Los servicios de su menú: los de todos y los suyos propios (los propios de otro barbero no le aparecen). */
  menuDe(barbero: Barbero): Servicio[] {
    return this.enLinea().filter(s => esDelMenuDe(s, barbero.id));
  }

  ofrece(barbero: Barbero, servicio: Servicio): boolean {
    return ofreceServicio(barbero, servicio);
  }

  /** Los servicios de su menú que no se reservan con ese barbero (sin los IDs de servicios que ya se borraron). */
  cerrados(barbero: Barbero): Servicio[] {
    return this.menuDe(barbero).filter(s => !ofreceServicio(barbero, s));
  }

  resumen(barbero: Barbero): string {
    const menu = this.menuDe(barbero);
    const abiertos = menu.filter(s => ofreceServicio(barbero, s));
    if (abiertos.length === menu.length) return 'Se reservan todos los servicios';
    if (abiertos.length === 0) return 'Nadie puede reservar con él en la página';
    return `Solo se reserva: ${abiertos.map(s => s.nombre).join(', ')}`;
  }

  claseResumen(barbero: Barbero): string {
    const menu = this.menuDe(barbero);
    const abiertos = menu.filter(s => ofreceServicio(barbero, s)).length;
    return abiertos === menu.length ? 'text-neutral-500' : abiertos === 0 ? 'text-red-300' : 'text-detalle-200';
  }

  async cambiar(barbero: Barbero, servicio: Servicio) {
    const cerrados = new Set(barbero.serviciosCerrados ?? []);
    if (cerrados.has(servicio.id!)) cerrados.delete(servicio.id!);
    else cerrados.add(servicio.id!);
    // Quitar el último que quedaba deja al barbero sin reservas en la página: mejor preguntar.
    if (this.menuDe(barbero).every(s => cerrados.has(s.id!))) {
      const seguro = await this.confirmar.preguntar({
        titulo: `¿Quitar todos los servicios de ${barbero.nombre}?`,
        texto: 'Nadie podrá reservar con él desde la página hasta que habilites alguno. Las citas que ya tiene no cambian.',
        aceptar: 'Sí, quitarlos',
      });
      if (!seguro) return;
    }
    await this.guardar(barbero, [...cerrados]);
  }

  async habilitarTodos(barbero: Barbero) {
    if (await this.guardar(barbero, [])) {
      this.notificaciones.exito('Servicios habilitados', `Tus clientes ya pueden reservar cualquier servicio con ${barbero.nombre}.`);
    }
  }

  /** Devuelve si se guardó. */
  private async guardar(barbero: Barbero, cerrados: string[]): Promise<boolean> {
    this.guardando.set(barbero.id!);
    try {
      await this.barberosService.guardarServiciosCerrados(barbero.id!, cerrados);
      return true;
    } catch (error) {
      console.error('Error guardando los servicios del barbero', error);
      this.notificaciones.error('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
      return false;
    } finally {
      this.guardando.set(null);
    }
  }
}
