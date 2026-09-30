import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { BarberosService } from '../../../core/services/barberos.service';
import { CitasService } from '../../../core/services/citas.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Barbero } from '../../../core/models/barbero.model';
import { BARBERO_CUALQUIERA, Cita, EstadoCita, esActiva } from '../../../core/models/cita.model';
import { Usuario } from '../../../core/models/usuario.model';
import { claveDia, compararCitas, diaDeCita, inicioDeCita } from '../../../core/utils/horario';
import { PERIODOS, Periodo, comisionDe, enPeriodo, rangoDe, resumir, valorCobrado } from '../../../core/utils/ganancias';
import { enlaceWhatsApp } from '../../../core/utils/colombia';
import { CompletarCitaComponent } from '../../../shared/components/completar-cita/completar-cita.component';

interface Datos {
  perfil: Usuario | null;
  /** Perfiles de `barberos` enlazados a la cuenta (normalmente 0 o 1). */
  barberos: Barbero[];
  citas: Cita[];
}

@Component({
  selector: 'app-barbero-dashboard',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgClass, RouterLink, CompletarCitaComponent],
  template: `
    <div class="min-h-screen bg-neutral-950 text-white">
      <header class="sticky top-0 z-40 border-b border-white/10 bg-neutral-950/90 backdrop-blur-xl">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a routerLink="/" class="inline-flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            Volver a la página
          </a>
          @if (datos()?.perfil?.rol === 'admin') {
            <a routerLink="/admin" class="text-xs font-bold text-acento-500 border border-acento-500/30 hover:bg-acento-500/10 px-3 py-2 rounded-lg transition-colors">Panel de admin</a>
          }
        </div>
      </header>

      <main class="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <p class="text-[11px] font-extrabold uppercase tracking-[0.25em] text-detalle-400 mb-2">{{ hoy | date:"EEEE d 'de' MMMM" }}</p>
        <h1 class="font-display text-3xl md:text-4xl font-black">{{ saludo() }}</h1>
        @if (barbero(); as b) {
          <p class="text-neutral-400 mt-1">{{ b.nombre }}@if (comision() < 100) { · ganas el {{ comision() }} % de cada servicio }</p>
        }

        @if (datos() && !barbero()) {
          <div class="mt-6 rounded-2xl border border-detalle-400/25 bg-detalle-500/5 text-sm text-neutral-300 p-4">
            @if (datos()!.perfil?.rol === 'admin') {
              Tu cuenta no está vinculada a un perfil de barbero, así que ves la agenda y los cortes de <strong class="text-white">toda la barbería</strong>.
              Para ver solo los tuyos, agrega tu email a tu perfil en Admin → Staff &amp; Barberos.
            } @else {
              Tu cuenta no está vinculada a un perfil del staff. Pide al administrador que registre tu email en "Staff &amp; Barberos" para ver tus citas y tus ganancias.
            }
          </div>
        }

        <!-- ============ RESUMEN ============ -->
        <section class="mt-8">
          <div class="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 mb-5">
            @for (p of periodos; track p.valor) {
              <button (click)="periodo.set(p.valor)" class="shrink-0 px-4 py-2 rounded-full text-sm font-bold border transition-colors"
                      [ngClass]="periodo() === p.valor ? 'bg-acento-500 border-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-400 hover:text-white'">{{ p.nombre }}</button>
            }
          </div>
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div class="rounded-2xl border border-white/10 bg-neutral-900 p-4 md:p-5">
              <p class="text-xs md:text-sm font-bold text-neutral-400">{{ barbero() ? 'Cortes realizados' : 'Cortes (barbería)' }}</p>
              <p class="text-3xl md:text-4xl font-black mt-1">{{ resumen().cortes }}</p>
              @if (resumen().noAsistio) { <p class="text-xs text-red-300/80 mt-1">{{ resumen().noAsistio }} no asistieron</p> }
            </div>
            <div class="rounded-2xl border border-white/10 bg-neutral-900 p-4 md:p-5">
              <p class="text-xs md:text-sm font-bold text-neutral-400">Generado</p>
              <p class="text-2xl md:text-3xl font-black mt-1 tabular-nums">{{ resumen().generado | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
              <p class="text-xs text-neutral-500 mt-1">Total cobrado por los cortes</p>
            </div>
            <div class="rounded-2xl border border-detalle-400/30 bg-gradient-to-br from-detalle-500/10 to-transparent p-4 md:p-5">
              <p class="text-xs md:text-sm font-bold text-detalle-300">{{ barbero() ? 'Tu ganancia' : 'Ganancia' }}</p>
              <p class="text-2xl md:text-3xl font-black mt-1 tabular-nums">{{ resumen().ganancia | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
              <p class="text-xs text-neutral-500 mt-1">{{ comision() < 100 ? comision() + ' % de lo generado' : 'Todo lo generado' }}</p>
            </div>
            <div class="rounded-2xl border border-white/10 bg-neutral-900 p-4 md:p-5">
              <p class="text-xs md:text-sm font-bold text-neutral-400">Próximas citas</p>
              <p class="text-3xl md:text-4xl font-black mt-1">{{ proximas().length }}</p>
              <p class="text-xs text-neutral-500 mt-1">Desde mañana</p>
            </div>
          </div>
        </section>

        <!-- ============ AGENDA DE HOY ============ -->
        <section class="mt-12">
          <h2 class="text-xl font-black mb-5">Tus turnos de hoy <span class="text-neutral-500 font-bold">({{ citasHoy().length }})</span></h2>
          @if (datos() === undefined) {
            <div class="h-40 rounded-3xl bg-neutral-900 animate-pulse"></div>
          } @else if (citasHoy().length === 0) {
            <div class="rounded-3xl border border-dashed border-white/10 py-12 text-center text-neutral-500">No tienes turnos para hoy.</div>
          } @else {
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              @for (cita of citasHoy(); track cita.id) {
                <div class="rounded-2xl border bg-neutral-900 p-5 relative"
                     [ngClass]="{
                       'border-white/10': esActiva(cita.estado),
                       'border-emerald-500/30': cita.estado === 'completada',
                       'border-red-500/20 opacity-60': cita.estado === 'no-asistio' || cita.estado === 'cancelada'
                     }">
                  <span class="absolute top-4 right-4 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded"
                        [ngClass]="{
                          'bg-white/5 text-neutral-300': esActiva(cita.estado),
                          'bg-red-500/10 text-red-400': cita.estado === 'no-asistio' || cita.estado === 'cancelada',
                          'bg-emerald-500/10 text-emerald-400': cita.estado === 'completada'
                        }">{{ etiquetaEstado(cita.estado) }}</span>
                  <p class="text-2xl font-black">{{ cita.horaStr }}</p>
                  <p class="text-neutral-300 font-bold mt-1">{{ cita.userName }}</p>
                  <p class="text-sm text-neutral-500 mt-3">{{ cita.serviceName }} · <span class="text-neutral-300">{{ valorCobrado(cita) | currency:'COP':'symbol-narrow':'1.0-0' }}</span></p>
                  @if (cita.phone) {
                    <a [href]="whatsapp(cita.phone)" target="_blank" rel="noopener" class="inline-block text-xs font-bold text-neutral-400 hover:text-white mt-1">{{ cita.phone }}</a>
                  }
                  @if (esActiva(cita.estado)) {
                    <div class="flex gap-2 mt-5">
                      <button (click)="completando.set(cita)" class="flex-1 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-neutral-950 border border-emerald-500/20 font-bold py-2.5 rounded-xl transition-all text-sm">Hecho</button>
                      <button (click)="marcarNoAsistio(cita)" class="flex-1 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 font-bold py-2.5 rounded-xl transition-all text-sm">No asistió</button>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </section>

        <!-- ============ PRÓXIMAS ============ -->
        @if (proximas().length > 0) {
          <section class="mt-12">
            <h2 class="text-xl font-black mb-5">Próximas citas</h2>
            <ul class="rounded-3xl border border-white/10 bg-neutral-900 divide-y divide-white/5 overflow-hidden">
              @for (cita of proximas().slice(0, 10); track cita.id) {
                <li class="flex items-center gap-4 px-5 py-4">
                  <div class="w-16 shrink-0 text-center">
                    <p class="text-[11px] font-bold uppercase text-detalle-400">{{ inicio(cita) | date:'EEE' }}</p>
                    <p class="text-lg font-black leading-tight">{{ inicio(cita) | date:'d MMM' }}</p>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-bold truncate">{{ cita.horaStr }} · {{ cita.userName }}</p>
                    <p class="text-sm text-neutral-500 truncate">{{ cita.serviceName }}</p>
                  </div>
                  <span class="text-sm font-bold text-neutral-300 shrink-0">{{ cita.precio | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                </li>
              }
            </ul>
          </section>
        }

        <!-- ============ HISTORIAL DE CORTES ============ -->
        <section class="mt-12">
          <div class="flex items-end justify-between gap-4 mb-5">
            <h2 class="text-xl font-black">Cortes realizados <span class="text-neutral-500 font-bold">· {{ nombrePeriodo() }}</span></h2>
            <span class="text-sm text-neutral-400">{{ historial().length }} cortes</span>
          </div>
          @if (historial().length === 0) {
            <div class="rounded-3xl border border-dashed border-white/10 py-12 text-center text-neutral-500">Aún no hay cortes en este período.</div>
          } @else {
            <div class="rounded-3xl border border-white/10 bg-neutral-900 overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="text-[11px] uppercase tracking-widest text-neutral-500 border-b border-white/10">
                    <tr><th class="text-left font-bold px-5 py-3">Fecha</th><th class="text-left font-bold px-5 py-3">Cliente</th><th class="text-left font-bold px-5 py-3">Servicio</th><th class="text-right font-bold px-5 py-3">Valor</th></tr>
                  </thead>
                  <tbody class="divide-y divide-white/5">
                    @for (cita of historial(); track cita.id) {
                      <tr>
                        <td class="px-5 py-3 whitespace-nowrap text-neutral-400">{{ inicio(cita) | date:'d MMM' }} · {{ cita.horaStr }}</td>
                        <td class="px-5 py-3 whitespace-nowrap">{{ cita.userName }}</td>
                        <td class="px-5 py-3 text-neutral-400">{{ cita.serviceName }}</td>
                        <td class="px-5 py-3 text-right font-bold whitespace-nowrap">{{ valorCobrado(cita) | currency:'COP':'symbol-narrow':'1.0-0' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        </section>
      </main>

      @if (completando(); as cita) {
        <app-completar-cita [cita]="cita" (cerrar)="completando.set(null)" />
      }
    </div>
  `,
})
export class BarberoDashboardComponent {
  private authService = inject(AuthService);
  private barberosService = inject(BarberosService);
  private citasService = inject(CitasService);
  private notificaciones = inject(NotificationService);

  readonly esActiva = esActiva;
  readonly valorCobrado = valorCobrado;
  readonly periodos = PERIODOS;
  readonly hoy = new Date();
  private readonly diaHoy = claveDia(this.hoy);

  readonly periodo = signal<Periodo>('semana');
  /** Cita que se está marcando como hecha. */
  readonly completando = signal<Cita | null>(null);

  /** undefined mientras carga. */
  readonly datos = toSignal(
    this.authService.currentUserProfile$.pipe(
      switchMap(perfil => this.cargar(perfil)),
      catchError(error => {
        console.error('Error cargando la agenda', error);
        return of<Datos>({ perfil: null, barberos: [], citas: [] });
      }),
    ),
  );

  readonly barbero = computed(() => this.datos()?.barberos[0] ?? null);
  readonly comision = computed(() => (this.barbero() ? comisionDe(this.barbero()) : 100));
  readonly saludo = computed(() => {
    const nombre = this.datos()?.perfil?.nombre?.split(' ')[0];
    return nombre ? `Hola, ${nombre}` : 'Mi panel';
  });

  /** Citas que cuentan para las estadísticas: las asignadas a este barbero (o todas si no hay perfil). */
  private readonly propias = computed(() => {
    const datos = this.datos();
    if (!datos) return [];
    if (datos.barberos.length === 0) return datos.citas;
    const ids = new Set(datos.barberos.map(b => b.id));
    return datos.citas.filter(c => ids.has(c.barberoId));
  });
  private readonly delPeriodo = computed(() => {
    const rango = rangoDe(this.periodo(), this.hoy);
    return this.propias().filter(c => enPeriodo(c, rango));
  });

  readonly resumen = computed(() => resumir(this.delPeriodo(), this.comision()));
  readonly historial = computed(() =>
    this.delPeriodo().filter(c => c.estado === 'completada').sort((a, b) => compararCitas(b, a)),
  );
  readonly citasHoy = computed(() =>
    (this.datos()?.citas ?? []).filter(c => diaDeCita(c) === this.diaHoy).sort(compararCitas),
  );
  readonly proximas = computed(() =>
    (this.datos()?.citas ?? []).filter(c => esActiva(c.estado) && diaDeCita(c) > this.diaHoy).sort(compararCitas),
  );
  readonly nombrePeriodo = computed(() => PERIODOS.find(p => p.valor === this.periodo())!.nombre.toLowerCase());

  /**
   * Las citas guardan el ID del perfil en `barberos`, no el uid de Auth.
   * El perfil se encuentra por el email de la cuenta (campo emailAsociado).
   * Un admin sin perfil de barbero ve la agenda de toda la barbería.
   */
  private cargar(perfil: Usuario | null): Observable<Datos> {
    if (!perfil) return of({ perfil: null, barberos: [], citas: [] });
    return this.barberosService.delEmail(perfil.email).pipe(
      switchMap(barberos => {
        let citas$: Observable<Cita[]>;
        if (barberos.length > 0) citas$ = this.citasService.deBarberos([...barberos.map(b => b.id!), BARBERO_CUALQUIERA]);
        else if (perfil.rol === 'admin') citas$ = this.citasService.todas();
        else citas$ = of([]);
        return citas$.pipe(map(citas => ({ perfil, barberos, citas })));
      }),
    );
  }

  whatsapp(telefono: string): string {
    return enlaceWhatsApp(telefono);
  }

  inicio(cita: Cita): Date {
    return inicioDeCita(cita);
  }

  etiquetaEstado(estado: EstadoCita): string {
    return { pendiente: 'Pendiente', confirmada: 'Confirmada', completada: 'Hecho', 'no-asistio': 'No asistió', cancelada: 'Cancelada' }[estado];
  }

  async marcarNoAsistio(cita: Cita) {
    if (new Date() < inicioDeCita(cita)) {
      this.notificaciones.error('Aún no es la hora', `No puedes marcar "No asistió" antes de la hora acordada (${cita.horaStr}).`);
      return;
    }
    if (!confirm('¿Marcar que el cliente no asistió?')) return;
    try {
      await this.citasService.cambiarEstado(cita, 'no-asistio');
    } catch (e) {
      console.error(e);
      this.notificaciones.error('Error al actualizar el estado');
    }
  }
}
