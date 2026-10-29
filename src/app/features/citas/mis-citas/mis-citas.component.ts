import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { CitasService } from '../../../core/services/citas.service';
import { ConfirmarService } from '../../../core/services/confirmar.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Cita, esActiva, etiquetaEstado } from '../../../core/models/cita.model';
import { compararCitas, inicioDeCita } from '../../../core/utils/horario';
import { CLIENTE } from '../../../config/cliente';
import { opcionDe } from '../../../core/models/recurrencia.model';
import { ENLACE_RESENA } from '../../../core/utils/resenas';
import { IconoComponent } from '../../../shared/components/icono/icono.component';
import { RecurrenteComponent } from '../../../shared/components/recurrente/recurrente.component';
import { RedSocialComponent } from '../../../shared/components/red-social/red-social.component';

@Component({
  selector: 'app-mis-citas',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink, IconoComponent, RecurrenteComponent, RedSocialComponent],
  template: `
    <div class="relative min-h-[calc(100vh-80px)] overflow-hidden bg-neutral-950 px-4 py-12 md:py-16">
      <div class="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,rgb(var(--detalle-500)/0.07),transparent_70%)]"></div>

      <div class="relative mx-auto max-w-4xl">
        <header class="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="rotulo mb-3">Tu cuenta</p>
            <h1 class="font-display text-4xl font-black tracking-tight text-white md:text-5xl">Mis reservas</h1>
          </div>
          <a routerLink="/reservar" class="boton-acento self-start sm:self-auto">
            Reservar turno <app-icono nombre="flecha" class="h-4 w-4" [grosor]="2.4" />
          </a>
        </header>

        @if (citas() === undefined) {
          <div class="space-y-4">
            <div class="placa h-44 animate-pulse"></div>
            <div class="tarjeta h-24 animate-pulse"></div>
          </div>
        } @else if (citas()!.length === 0) {
          <div class="placa relative overflow-hidden px-6 py-14 text-center">
            @if (cliente.simbolo) {
              <img [src]="cliente.simbolo" alt="" class="pointer-events-none absolute inset-0 m-auto h-[80%] w-auto opacity-[0.05]">
            }
            <div class="relative">
              <h2 class="font-display text-2xl font-black text-white">Aún no tienes reservas</h2>
              <p class="mx-auto mt-2 max-w-sm text-neutral-400">Elige tu barbero, tu servicio y tu hora. Toma menos de un minuto.</p>
              <a routerLink="/reservar" class="boton-acento mt-7">Agendar mi primera cita</a>
            </div>
          </div>
        } @else {
          <!-- Próximas -->
          <section aria-labelledby="proximas">
            <h2 id="proximas" class="mb-4 text-sm font-extrabold uppercase tracking-widest text-neutral-400">Próximas <span class="text-neutral-600">({{ proximas().length }})</span></h2>
            @if (proximas().length === 0) {
              <div class="tarjeta border-dashed px-6 py-10 text-center text-neutral-500">
                No tienes citas por venir.
                <a routerLink="/reservar" class="font-bold text-detalle-200 underline underline-offset-4 hover:text-white">Reservar una</a>
              </div>
            }
            <div class="space-y-4">
              @for (cita of proximas(); track cita.id) {
                <article class="placa grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:gap-7 sm:p-7">
                  <!-- Fecha, como en una entrada -->
                  <div class="flex items-center gap-4 border-b border-white/10 pb-4 sm:w-28 sm:flex-col sm:justify-center sm:gap-0 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-7 sm:text-center">
                    <p class="text-[11px] font-extrabold uppercase tracking-[0.25em] text-detalle-300">{{ inicio(cita) | date:'EEE' }}</p>
                    <p class="font-display text-4xl font-black leading-none text-white sm:my-1 sm:text-5xl">{{ inicio(cita) | date:'d' }}</p>
                    <p class="text-xs font-bold uppercase tracking-widest text-neutral-400">{{ inicio(cita) | date:'MMMM' }}</p>
                    <span class="chip-activa ml-auto sm:ml-0 sm:mt-3">{{ etiqueta(cita) }}</span>
                  </div>

                  <div class="min-w-0">
                    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 class="text-xl font-black text-white">{{ cita.serviceName }}</h3>
                      <p class="font-display text-2xl font-black text-detalle-200">{{ cita.horaStr }}</p>
                    </div>
                    <p class="mt-1 text-sm text-neutral-400">
                      con <span class="font-semibold text-neutral-200">{{ cita.barberoNombre }}</span>
                      · {{ cita.precio | currency:'COP':'symbol-narrow':'1.0-0' }}
                    </p>
                    @if (delEquipo(cita)) {
                      <p class="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-400" data-registrada-por-el-equipo>
                        @if (cita.recurrenciaId) {
                          <app-recurrente [frecuencia]="cita.frecuencia" />
                          Es tu turno fijo{{ frecuencia(cita) ? ' (' + frecuencia(cita) + ')' : '' }}.
                        } @else {
                          Te la agendó la barbería.
                        }
                      </p>
                    }

                    <div class="relative z-[1] mt-5 flex flex-wrap gap-2.5">
                      @if (!delEquipo(cita)) {
                        <button (click)="reagendar(cita)" class="boton-linea boton-chico">
                          <app-icono nombre="repetir" class="h-4 w-4" [grosor]="2" /> Cambiar horario
                        </button>
                      } @else if (cliente.whatsapp) {
                        <!-- La agendó el equipo: el cambio de hora se pide (la mueve el equipo, como la registró). -->
                        <a [href]="pedirCambio(cita)" target="_blank" rel="noopener" class="boton-linea boton-chico">
                          <app-red-social red="whatsapp" class="h-4 w-4" /> Pedir otro horario
                        </a>
                      }
                      @if (cliente.ubicacion; as ubicacion) {
                        <a [href]="ubicacion.mapaUrl" target="_blank" rel="noopener" class="boton-linea boton-chico">
                          <app-icono nombre="pin" class="h-4 w-4" [grosor]="2" /> Cómo llegar
                        </a>
                      }
                      <button (click)="cancelar(cita)" [disabled]="cancelando() === cita.id" class="boton-peligro boton-chico sm:ml-auto">
                        {{ cancelando() === cita.id ? 'Cancelando…' : 'Cancelar' }}
                      </button>
                    </div>
                  </div>
                </article>
              }
            </div>
          </section>

          <!-- Historial -->
          @if (pasadas().length > 0) {
            <section class="mt-14" aria-labelledby="historial">
              <h2 id="historial" class="mb-4 text-sm font-extrabold uppercase tracking-widest text-neutral-400">Historial</h2>
              @if (enlaceResena && atendidoAlgunaVez()) {
                <div class="mb-4 flex flex-col gap-3 rounded-2xl border border-detalle-400/25 bg-detalle-500/[0.05] p-4 sm:flex-row sm:items-center">
                  <p class="min-w-0 flex-1 text-sm text-neutral-300"><strong class="text-white">¿Te gustó tu corte?</strong> Una reseña en Google nos ayuda a que más personas nos encuentren.</p>
                  <a [href]="enlaceResena" target="_blank" rel="noopener" class="boton-oro boton-chico shrink-0">
                    <app-icono nombre="estrella" class="h-4 w-4" [grosor]="1.8" /> Califícanos en Google
                  </a>
                </div>
              }
              @if (multaPendiente() > 0) {
                <p class="mb-4 rounded-2xl border border-red-400/30 bg-red-500/[0.06] p-4 text-sm text-neutral-300" data-multa-pendiente>
                  Tienes una multa pendiente de <strong class="text-white">{{ multaPendiente() | currency:'COP':'symbol-narrow':'1.0-0' }}</strong> por no asistir a un turno. Se paga en tu próxima visita.
                </p>
              }
              <ul class="tarjeta divide-y divide-white/5 overflow-hidden">
                @for (cita of pasadas(); track cita.id) {
                  <li class="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                    <div class="w-14 shrink-0 text-center">
                      <p class="font-display text-xl font-black leading-none text-neutral-300">{{ inicio(cita) | date:'d' }}</p>
                      <p class="mt-1 text-[11px] font-bold uppercase tracking-widest text-neutral-500">{{ inicio(cita) | date:'MMM' }}</p>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate font-bold text-white">{{ cita.serviceName }}@if (cita.recurrenciaId) { <app-recurrente class="ml-1 align-middle" [frecuencia]="cita.frecuencia" [corto]="true" />}</p>
                      <p class="truncate text-sm text-neutral-500">{{ cita.horaStr }} · {{ cita.barberoNombre }}</p>
                    </div>
                    <span [class]="claseEstado(cita)">{{ etiqueta(cita) }}</span>
                    @if (cita.estado === 'no-asistio' && cita.multa) {
                      <span class="text-xs font-bold text-red-300">Multa {{ cita.multa | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                    }
                    <button (click)="reservarDeNuevo(cita)" class="boton-oro boton-chico w-full sm:w-auto">
                      <app-icono nombre="repetir" class="h-4 w-4" [grosor]="2" /> Reservar de nuevo
                    </button>
                  </li>
                }
              </ul>
            </section>
          }
        }
      </div>
    </div>
  `
})
export class MisCitasComponent {
  private authService = inject(AuthService);
  private citasService = inject(CitasService);
  private notificaciones = inject(NotificationService);
  private confirmar = inject(ConfirmarService);
  private router = inject(Router);

  readonly cliente = CLIENTE;
  readonly cancelando = signal<string | null>(null);

  private readonly usuario = toSignal(this.authService.user$);

  /**
   * undefined mientras carga. Las que reservó y las que el equipo le registró con el celular con que entró o con su
   * correo verificado (citas del panel y turnos de sus agendas recurrentes).
   */
  readonly citas = toSignal(
    this.authService.user$.pipe(
      switchMap(user => (user ? this.citasService.delCliente(user) : of([]))),
      catchError(error => {
        console.error('Error cargando tus reservas', error);
        return of<Cita[]>([]);
      }),
    ),
  );

  /** Las que aún no pasan, de la más cercana a la más lejana. */
  readonly proximas = computed(() =>
    (this.citas() ?? []).filter(c => esActiva(c.estado) && inicioDeCita(c) > new Date()).sort(compararCitas),
  );
  /** Todo lo demás, de lo más reciente a lo más viejo (sin las que quedaron reemplazadas al reagendar). */
  readonly enlaceResena = ENLACE_RESENA;
  /** Multas por no asistir que aún no pagó (se pagan en la siguiente visita y quedan anotadas en esa cita). */
  readonly multaPendiente = computed(() => {
    const citas = this.citas() ?? [];
    const puestas = citas.reduce((total, c) => total + (c.estado === 'no-asistio' ? c.multa ?? 0 : 0), 0);
    const pagadas = citas.reduce((total, c) => total + (c.estado === 'completada' ? c.multaCobrada ?? 0 : 0), 0);
    return Math.max(0, puestas - pagadas);
  });
  /** Ya lo atendieron alguna vez: tiene sentido pedirle una reseña. */
  readonly atendidoAlgunaVez = computed(() => this.pasadas().some(c => c.estado === 'completada'));

  readonly pasadas = computed(() => {
    const proximas = new Set(this.proximas().map(c => c.id));
    return (this.citas() ?? []).filter(c => !proximas.has(c.id) && !c.reemplazadaPor).sort((a, b) => compararCitas(b, a));
  });

  inicio(cita: Cita): Date {
    return inicioDeCita(cita);
  }

  /** Se la registró el equipo (con su celular o su correo): no es de su cuenta, así que no la cambia de horario él. */
  delEquipo(cita: Cita): boolean {
    return cita.userId !== this.usuario()?.uid;
  }

  /** "cada semana", "cada 2 semanas"… */
  frecuencia(cita: Cita): string {
    return opcionDe(cita.frecuencia)?.detalle.toLowerCase() ?? '';
  }

  /** WhatsApp a la barbería con el turno que quiere mover. */
  pedirCambio(cita: Cita): string {
    const fecha = inicioDeCita(cita).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
    const mensaje = `Hola ${this.cliente.nombre}, soy ${cita.userName}. Quisiera cambiar mi turno de ${cita.serviceName} con ${cita.barberoNombre} del ${fecha} a las ${cita.horaStr}.`;
    return `https://wa.me/${this.cliente.whatsapp}?text=${encodeURIComponent(mensaje)}`;
  }

  etiqueta(cita: Cita): string {
    return etiquetaEstado(cita, 'cliente');
  }

  claseEstado(cita: Cita): string {
    switch (cita.estado) {
      case 'completada': return 'chip-oro';
      case 'no-asistio': return 'chip-mal';
      case 'cancelada': return 'chip-neutro';
      default: return 'chip-neutro'; // activa pero ya pasó la hora: el barbero aún no la marcó
    }
  }

  reagendar(cita: Cita) {
    this.router.navigate(['/reservar'], { queryParams: { reagendar: cita.id } });
  }

  reservarDeNuevo(cita: Cita) {
    this.router.navigate(['/reservar'], { state: { servicioId: cita.servicioId, barberoId: cita.barberoId } });
  }

  async cancelar(cita: Cita) {
    const fecha = inicioDeCita(cita).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
    const otraHora = this.delEquipo(cita) ? (this.cliente.whatsapp ? 'pídela con "Pedir otro horario"' : 'escríbenos') : 'usa "Cambiar horario"';
    const seguro = await this.confirmar.preguntar({
      titulo: cita.recurrenciaId ? '¿Cancelar este turno?' : '¿Cancelar esta reserva?',
      texto: `${cita.serviceName}, ${fecha} a las ${cita.horaStr}. El horario queda libre para otra persona.`
        + (cita.recurrenciaId ? ' Solo se cancela este día: tus demás turnos fijos siguen.' : '')
        + ` Si solo quieres otra hora, ${otraHora}.`,
      aceptar: 'Sí, cancelar',
      rechazar: 'Conservarla',
      peligro: true,
    });
    if (!seguro) return;
    try {
      this.cancelando.set(cita.id!);
      await this.citasService.cancelar(cita);
      this.notificaciones.exito('Reserva cancelada', 'El horario quedó libre para otros clientes.');
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo cancelar', 'Inténtalo de nuevo en unos segundos.');
    } finally {
      this.cancelando.set(null);
    }
  }
}
