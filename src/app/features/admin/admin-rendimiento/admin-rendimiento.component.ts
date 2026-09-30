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
  imports: [CurrencyPipe, DatePipe, NgClass, RouterLink],
  template: `
    <div class="animate-in fade-in duration-500">
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 class="text-3xl md:text-4xl font-black text-white">Cortes y ganancias</h2>
          <p class="text-neutral-400 mt-2 text-lg">Lo que hizo cada barbero y cuánto le corresponde.</p>
        </div>
        @if (tuFila()) {
          <a routerLink="/barbero" class="inline-flex items-center gap-2 text-sm font-bold text-detalle-300 border border-detalle-400/40 hover:bg-detalle-500/10 px-4 py-2.5 rounded-xl transition-colors">
            Mi agenda de barbero
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
          </a>
        }
      </div>

      <div class="flex gap-2 overflow-x-auto pb-2 mb-6">
        @for (p of periodos; track p.valor) {
          <button (click)="periodo.set(p.valor)" class="shrink-0 px-4 py-2 rounded-xl text-sm font-bold border transition-colors"
                  [ngClass]="periodo() === p.valor ? 'bg-acento-500 border-acento-500 text-sobre-acento' : 'border-neutral-800 text-neutral-400 hover:text-white'">{{ p.nombre }}</button>
        }
      </div>

      <!-- Totales del equipo -->
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-8">
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
          <p class="text-neutral-400 text-sm font-bold">Cortes del equipo</p>
          <p class="text-3xl md:text-4xl font-black text-white mt-1">{{ total().cortes }}</p>
        </div>
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
          <p class="text-neutral-400 text-sm font-bold">Generado</p>
          <p class="text-2xl md:text-3xl font-black text-white mt-1">{{ total().generado | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
        </div>
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
          <p class="text-neutral-400 text-sm font-bold">Pago a barberos</p>
          <p class="text-2xl md:text-3xl font-black text-white mt-1">{{ total().ganancia | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
        </div>
        <div class="bg-neutral-900 border border-detalle-400/30 rounded-2xl p-5">
          <p class="text-detalle-300 text-sm font-bold">Queda para la barbería</p>
          <p class="text-2xl md:text-3xl font-black text-white mt-1">{{ total().barberia | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
        </div>
      </div>

      @if (filas().length === 0) {
        <div class="text-center py-16 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl">Aún no hay barberos registrados en Staff &amp; Barberos.</div>
      } @else {
        <div class="space-y-3">
          @for (f of filas(); track f.barbero.id) {
            <div class="bg-neutral-900 border rounded-2xl overflow-hidden" [ngClass]="f.esTuyo ? 'border-detalle-400/30' : 'border-neutral-800'">
              <button type="button" (click)="abierto.set(abierto() === f.barbero.id ? null : f.barbero.id!)"
                      class="w-full text-left p-5 grid grid-cols-2 md:grid-cols-[1.6fr_repeat(4,1fr)_auto] items-center gap-4 hover:bg-neutral-800/40 transition-colors">
                <div class="col-span-2 md:col-span-1 flex items-center gap-3 min-w-0">
                  <img [src]="avatarDe(f.barbero)" [alt]="f.barbero.nombre" class="w-11 h-11 rounded-full object-cover border border-neutral-700">
                  <div class="min-w-0">
                    <p class="font-bold text-white truncate">{{ f.barbero.nombre }}
                      @if (f.esTuyo) { <span class="ml-1 text-[10px] font-black uppercase tracking-widest text-neutral-950 bg-detalle-400 px-1.5 py-0.5 rounded">Tú</span> }
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
                <div class="border-t border-neutral-800 animate-in fade-in duration-200">
                  @if (f.cortes.length === 0) {
                    <p class="px-5 py-8 text-center text-sm text-neutral-500">Sin cortes en este período.</p>
                  } @else {
                    <div class="overflow-x-auto">
                      <table class="w-full text-sm">
                        <thead class="text-[11px] uppercase tracking-widest text-neutral-500 border-b border-neutral-800">
                          <tr><th class="text-left font-bold px-5 py-3">Fecha</th><th class="text-left font-bold px-5 py-3">Cliente</th><th class="text-left font-bold px-5 py-3">Servicio</th><th class="text-right font-bold px-5 py-3">Valor</th></tr>
                        </thead>
                        <tbody class="divide-y divide-neutral-800/60">
                          @for (c of f.cortes; track c.id) {
                            <tr>
                              <td class="px-5 py-3 whitespace-nowrap text-neutral-400">{{ inicio(c) | date:'d MMM' }} · {{ c.horaStr }}</td>
                              <td class="px-5 py-3 whitespace-nowrap text-white">{{ c.userName }}</td>
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
                    <p class="px-5 py-3 text-xs text-red-300/80 border-t border-neutral-800">{{ f.resumen.noAsistio }} cliente(s) no asistieron en este período.</p>
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

  private barberos = toSignal(inject(BarberosService).listar().pipe(catchError(() => of([] as Barbero[]))), { initialValue: [] });
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
