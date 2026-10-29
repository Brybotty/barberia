import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { Barbero, avatarDe } from '../../../core/models/barbero.model';
import { Cita } from '../../../core/models/cita.model';
import { AuthService } from '../../../core/services/auth.service';
import { BarberosService } from '../../../core/services/barberos.service';
import { CitasService } from '../../../core/services/citas.service';
import { compararCitas, inicioDeCita } from '../../../core/utils/horario';
import { PERIODOS, Periodo, ResumenCortes, comisionDe, enPeriodo, rangoDe, resumir, valorCobrado } from '../../../core/utils/ganancias';
import { multaPendiente, resumirAsistencia } from '../../../core/utils/asistencia';
import { IconoComponent } from '../../../shared/components/icono/icono.component';
import { RecurrenteComponent } from '../../../shared/components/recurrente/recurrente.component';

interface FilaBarbero {
  barbero: Barbero;
  comision: number;
  resumen: ResumenCortes;
  cortes: Cita[];
  /** La cuenta del admin está enlazada a este perfil (p. ej. el dueño que también corta). */
  esTuyo: boolean;
}

@Component({
  selector: 'app-admin-rendimiento',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgClass, RouterLink, IconoComponent, RecurrenteComponent],
  template: `
    <div class="animate-in fade-in duration-500">
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 class="titulo-panel">Cortes y ganancias</h2>
          <p class="mt-1 text-neutral-400">Lo que hizo cada barbero y cuánto le corresponde.</p>
        </div>
        @if (tuFila()) {
          <a routerLink="/barbero" class="boton-oro boton-chico">
            Mi agenda de barbero
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
          </a>
        }
      </div>

      <div class="flex gap-2 overflow-x-auto pb-2 mb-6">
        @for (p of periodos; track p.valor) {
          <button (click)="periodo.set(p.valor)" class="shrink-0 min-h-10 px-4 rounded-full text-sm font-bold border transition-colors"
                  [ngClass]="periodo() === p.valor ? 'bg-acento-500 border-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-400 hover:text-white'">{{ p.nombre }}</button>
        }
      </div>

      <!-- Totales del equipo -->
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-8">
        <div class="placa p-5">
          <p class="text-neutral-400 text-sm font-bold">Cortes del equipo</p>
          <p class="font-display text-3xl md:text-4xl font-black text-white mt-1">{{ total().cortes }}</p>
        </div>
        <div class="placa p-5">
          <p class="text-neutral-400 text-sm font-bold">Generado</p>
          <p class="font-display text-2xl md:text-3xl font-black text-white mt-1 tabular-nums">{{ total().generado | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
        </div>
        <div class="placa p-5">
          <p class="text-neutral-400 text-sm font-bold">Pago a barberos</p>
          <p class="font-display text-2xl md:text-3xl font-black text-white mt-1 tabular-nums">{{ total().ganancia | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
        </div>
        <div class="placa !border-detalle-400/30 p-5">
          <p class="text-detalle-300 text-sm font-bold">Queda para la barbería</p>
          <p class="font-display text-2xl md:text-3xl font-black text-white mt-1 tabular-nums">{{ total().barberia | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
        </div>
      </div>

      <!-- Clientes fijos: lo que dejan sus turnos y cuántas veces faltaron -->
      @if (recurrentes(); as r) {
        <div class="tarjeta mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-detalle-400/40 text-detalle-200">
            <app-icono nombre="repetir" class="h-5 w-5" [grosor]="1.8" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="font-black text-white">Agendas recurrentes</p>
            <p class="text-sm text-neutral-400">Turnos de clientes fijos en este período.</p>
          </div>
          <dl class="grid grid-cols-3 gap-4 text-center sm:text-right">
            <div><dt class="text-[11px] font-bold uppercase text-neutral-500">Hechos</dt><dd class="text-lg font-black text-white">{{ r.cortes }}</dd></div>
            <div><dt class="text-[11px] font-bold uppercase text-neutral-500">Generado</dt><dd class="text-lg font-black tabular-nums text-white">{{ r.generado | currency:'COP':'symbol-narrow':'1.0-0' }}</dd></div>
            <div><dt class="text-[11px] font-bold uppercase text-neutral-500">No vinieron</dt><dd class="text-lg font-black" [ngClass]="r.noAsistio ? 'text-red-300' : 'text-white'">{{ r.noAsistio }}</dd></div>
          </dl>
        </div>
      }

      <!-- Multas por no asistir: son de la barbería (no cuentan en lo de cada barbero) -->
      @if (multas(); as m) {
        <div class="tarjeta mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center" data-resumen-multas>
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-400/40 text-red-200">
            <app-icono nombre="ausente" class="h-5 w-5" [grosor]="1.8" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="font-black text-white">Multas por no asistir</p>
            <p class="text-sm text-neutral-400">Puestas y cobradas en este período. Son de la barbería: no cuentan en lo de cada barbero.</p>
          </div>
          <dl class="grid grid-cols-3 gap-4 text-center sm:text-right">
            <div><dt class="text-[11px] font-bold uppercase text-neutral-500">Puestas</dt><dd class="text-lg font-black tabular-nums text-white">{{ m.puestas | currency:'COP':'symbol-narrow':'1.0-0' }}</dd></div>
            <div><dt class="text-[11px] font-bold uppercase text-neutral-500">Cobradas</dt><dd class="text-lg font-black tabular-nums text-emerald-300">{{ m.cobradas | currency:'COP':'symbol-narrow':'1.0-0' }}</dd></div>
            <div><dt class="text-[11px] font-bold uppercase text-neutral-500">Por cobrar</dt><dd class="text-lg font-black tabular-nums" [ngClass]="m.pendiente ? 'text-red-300' : 'text-white'">{{ m.pendiente | currency:'COP':'symbol-narrow':'1.0-0' }}</dd></div>
          </dl>
        </div>
      }

      @if (filas().length === 0) {
        <div class="tarjeta border-dashed px-6 py-14 text-center text-neutral-500">Aún no hay barberos registrados en Staff &amp; Barberos.</div>
      } @else {
        <div class="space-y-3">
          @for (f of filas(); track f.barbero.id) {
            <div class="rounded-2xl border bg-white/[0.03] overflow-hidden" [ngClass]="f.esTuyo ? 'border-detalle-400/30' : 'border-white/10'">
              <button type="button" (click)="abierto.set(abierto() === f.barbero.id ? null : f.barbero.id!)"
                      class="w-full text-left p-5 grid grid-cols-2 md:grid-cols-[1.6fr_repeat(4,1fr)_auto] items-center gap-4 hover:bg-white/[0.03] transition-colors">
                <div class="col-span-2 md:col-span-1 flex items-center gap-3 min-w-0">
                  <img [src]="avatarDe(f.barbero)" [alt]="f.barbero.nombre" class="w-11 h-11 rounded-full object-cover object-[50%_25%] border border-white/15">
                  <div class="min-w-0">
                    <p class="font-bold text-white truncate">{{ f.barbero.nombre }}
                      @if (f.esTuyo) { <span class="ml-1 text-[11px] font-black uppercase tracking-widest text-neutral-950 bg-detalle-400 px-1.5 py-0.5 rounded">Tú</span> }
                    </p>
                    <p class="text-xs text-neutral-500">Comisión {{ f.comision }} %</p>
                  </div>
                </div>
                <div><p class="text-[11px] text-neutral-500 font-bold uppercase">Cortes</p><p class="text-lg font-black text-white">{{ f.resumen.cortes }}</p></div>
                <div><p class="text-[11px] text-neutral-500 font-bold uppercase">Generado</p><p class="text-lg font-black text-white">{{ f.resumen.generado | currency:'COP':'symbol-narrow':'1.0-0' }}</p></div>
                <div><p class="text-[11px] text-neutral-500 font-bold uppercase">Para el barbero</p><p class="text-lg font-black text-detalle-300">{{ f.resumen.ganancia | currency:'COP':'symbol-narrow':'1.0-0' }}</p></div>
                <div><p class="text-[11px] text-neutral-500 font-bold uppercase">Barbería</p><p class="text-lg font-black text-white">{{ f.resumen.barberia | currency:'COP':'symbol-narrow':'1.0-0' }}</p></div>
                <svg class="hidden md:block w-5 h-5 text-neutral-500 transition-transform" [class.rotate-180]="abierto() === f.barbero.id" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>

              @if (abierto() === f.barbero.id) {
                <div class="border-t border-white/10 animate-in fade-in duration-200">
                  @if (f.cortes.length === 0) {
                    <p class="px-5 py-8 text-center text-sm text-neutral-500">Sin cortes en este período.</p>
                  } @else {
                    <div class="overflow-x-auto">
                      <table class="w-full text-sm">
                        <thead class="text-[11px] uppercase tracking-widest text-neutral-500 border-b border-white/10">
                          <tr><th class="text-left font-bold px-5 py-3">Fecha</th><th class="text-left font-bold px-5 py-3">Cliente</th><th class="text-left font-bold px-5 py-3">Servicio</th><th class="text-right font-bold px-5 py-3">Valor</th></tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                          @for (c of f.cortes; track c.id) {
                            <tr>
                              <td class="px-5 py-3 whitespace-nowrap text-neutral-400">{{ inicio(c) | date:'d MMM' }} · {{ c.horaStr }}</td>
                              <td class="px-5 py-3 whitespace-nowrap text-white">{{ c.userName }} @if (c.recurrenciaId) { <app-recurrente class="ml-1" [frecuencia]="c.frecuencia" [corto]="true" /> }</td>
                              <td class="px-5 py-3 text-neutral-400">{{ c.serviceName }}</td>
                              <td class="px-5 py-3 text-right font-bold text-white whitespace-nowrap">
                                {{ valorCobrado(c) | currency:'COP':'symbol-narrow':'1.0-0' }}
                                @if (c.precioFinal !== undefined && c.precioFinal !== c.precio) {
                                  <span class="block text-[11px] font-normal text-neutral-500">reservado {{ c.precio | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                                }
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                  @if (f.resumen.noAsistio) {
                    <p class="px-5 py-3 text-xs text-red-300/80 border-t border-white/10">{{ f.resumen.noAsistio }} cliente(s) no asistieron en este período.</p>
                  }
                </div>
              }
            </div>
          }
        </div>
        <p class="text-xs text-neutral-600 mt-4">La comisión de cada barbero se configura en Staff &amp; Barberos. Sin comisión definida, el barbero se lleva el 100 %.</p>
      }
    </div>
  `,
})
export class AdminRendimientoComponent {
  private auth = inject(AuthService);
  readonly periodos = PERIODOS;
  readonly avatarDe = avatarDe;
  readonly valorCobrado = valorCobrado;

  readonly periodo = signal<Periodo>('mes');
  readonly abierto = signal<string | null>(null);

  private barberos = toSignal(inject(BarberosService).listarCompleto().pipe(catchError(() => of([] as Barbero[]))), { initialValue: [] });
  private citas = toSignal(inject(CitasService).todas().pipe(catchError(() => of([] as Cita[]))), { initialValue: [] });
  private perfil = toSignal(this.auth.currentUserProfile$);

  readonly filas = computed<FilaBarbero[]>(() => {
    const rango = rangoDe(this.periodo());
    const email = this.perfil()?.email?.toLowerCase();
    return this.barberos()
      .map(barbero => {
        const suyas = this.citas().filter(c => c.barberoId === barbero.id && enPeriodo(c, rango));
        const comision = comisionDe(barbero);
        return {
          barbero,
          comision,
          resumen: resumir(suyas, comision),
          cortes: suyas.filter(c => c.estado === 'completada').sort((a, b) => compararCitas(b, a)),
          esTuyo: !!email && barbero.emailAsociado === email,
        };
      })
      .sort((a, b) => b.resumen.generado - a.resumen.generado || a.barbero.nombre.localeCompare(b.barbero.nombre));
  });

  readonly tuFila = computed(() => this.filas().find(f => f.esTuyo) ?? null);

  /** Los turnos de las agendas recurrentes del período (null si no hay ninguno). */
  readonly recurrentes = computed(() => {
    const rango = rangoDe(this.periodo());
    const fijas = this.citas().filter(c => c.recurrenciaId && enPeriodo(c, rango));
    return fijas.length ? resumir(fijas) : null;
  });

  /**
   * Las multas del período (puestas al marcar "No asistió" y cobradas en la visita siguiente) y lo que los clientes
   * deben hoy, de cualquier fecha. null si nunca se ha puesto una.
   */
  readonly multas = computed(() => {
    const rango = rangoDe(this.periodo());
    const citas = this.citas();
    if (!citas.some(c => c.multa || c.multaCobrada)) return null;
    const enElPeriodo = citas.filter(c => enPeriodo(c, rango));
    return {
      puestas: enElPeriodo.reduce((t, c) => t + (c.estado === 'no-asistio' ? c.multa ?? 0 : 0), 0),
      cobradas: enElPeriodo.reduce((t, c) => t + (c.estado === 'completada' ? c.multaCobrada ?? 0 : 0), 0),
      pendiente: [...resumirAsistencia(citas).values()].reduce((t, r) => t + multaPendiente(r), 0),
    };
  });

  readonly total = computed(() =>
    this.filas().reduce(
      (t, f) => ({
        cortes: t.cortes + f.resumen.cortes,
        generado: t.generado + f.resumen.generado,
        ganancia: t.ganancia + f.resumen.ganancia,
        barberia: t.barberia + f.resumen.barberia,
      }),
      { cortes: 0, generado: 0, ganancia: 0, barberia: 0 },
    ),
  );

  inicio(cita: Cita): Date {
    return inicioDeCita(cita);
  }
}
