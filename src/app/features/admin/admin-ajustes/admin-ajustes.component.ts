import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';
import { AjustesSitio, MULTA_MAXIMA } from '../../../core/models/ajustes.model';
import { AjustesService } from '../../../core/services/ajustes.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  Agenda, PASO_HORARIO, DIAS_RESERVABLES, INTERVALO, MAX_DIAS_AGENDA, aperturaDe, claveDia, diaLargo, diasEntre, extenderAgenda,
  fechaDesdeClave, formatearHora12, periodoDeAgenda, resumenHorario, sumarDias, topeDeAgenda, turnosDelDia,
} from '../../../core/utils/horario';
import { IconoComponent } from '../../../shared/components/icono/icono.component';

const DIAS = [
  { valor: 1, nombre: 'Lun' }, { valor: 2, nombre: 'Mar' }, { valor: 3, nombre: 'Mié' }, { valor: 4, nombre: 'Jue' },
  { valor: 5, nombre: 'Vie' }, { valor: 6, nombre: 'Sáb' }, { valor: 0, nombre: 'Dom' },
];

@Component({
  selector: 'app-admin-ajustes',
  standalone: true,
  imports: [FormsModule, DatePipe, IconoComponent],
  template: `
    <div class="max-w-4xl animate-in fade-in duration-500">
      <div class="mb-8">
        <h2 class="titulo-panel">Ajustes</h2>
        <p class="mt-1 text-neutral-400">La agenda de reservas, el horario de la barbería, la multa por no asistir y la sección de cursos.</p>
      </div>

      @if (form(); as f) {
        <form (ngSubmit)="guardar()" class="space-y-6" novalidate>

          <!-- ============ AGENDA ============ -->
          <section class="tarjeta p-5 sm:p-6">
            <h3 class="text-lg font-black">Agenda de reservas</h3>
            <p class="ayuda !mt-1">Hasta qué día pueden reservar tus clientes desde la página. Las citas que registras tú en Citas no tienen este límite.</p>

            <div class="mt-5 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Cómo se abre la agenda">
              <button type="button" role="radio" [attr.aria-checked]="f.agenda.modo === 'periodo'" (click)="usarPeriodos()"
                      class="rounded-2xl border p-4 text-left transition-colors"
                      [class]="f.agenda.modo === 'periodo' ? 'border-detalle-400/60 bg-detalle-500/10' : 'border-white/10 hover:border-white/25'">
                <span class="block text-sm font-black" [class]="f.agenda.modo === 'periodo' ? 'text-detalle-200' : 'text-white'">Por periodos</span>
                <span class="mt-1 block text-xs leading-relaxed text-neutral-400">Solo se reserva entre las fechas que abras. Cuando se acaben, habilitas las siguientes.</span>
              </button>
              <button type="button" role="radio" [attr.aria-checked]="f.agenda.modo === 'continua'" (click)="f.agenda.modo = 'continua'"
                      class="rounded-2xl border p-4 text-left transition-colors"
                      [class]="f.agenda.modo === 'continua' ? 'border-detalle-400/60 bg-detalle-500/10' : 'border-white/10 hover:border-white/25'">
                <span class="block text-sm font-black" [class]="f.agenda.modo === 'continua' ? 'text-detalle-200' : 'text-white'">Siempre abierta</span>
                <span class="mt-1 block text-xs leading-relaxed text-neutral-400">Se puede reservar para los próximos {{ diasContinua }} días, sin que tengas que hacer nada.</span>
              </button>
            </div>

            @if (f.agenda.modo === 'periodo') {
              <div class="mt-6 grid gap-4 sm:grid-cols-2">
                <label class="block">
                  <span class="etiqueta">Abierta desde</span>
                  <input type="date" name="agendaDesde" [(ngModel)]="f.agenda.desde" [max]="tope" class="campo [color-scheme:dark]">
                </label>
                <label class="block">
                  <span class="etiqueta">Hasta (último día)</span>
                  <input type="date" name="agendaHasta" [(ngModel)]="f.agenda.hasta" [min]="f.agenda.desde" [max]="tope" class="campo [color-scheme:dark]">
                </label>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button type="button" (click)="abrirDesdeHoy(15)" class="boton-linea boton-chico">15 días desde hoy</button>
                <button type="button" (click)="extender(15)" class="boton-linea boton-chico"><app-icono nombre="mas" class="h-4 w-4" [grosor]="2.4" /> 15 días más</button>
                <button type="button" (click)="extender(7)" class="boton-linea boton-chico"><app-icono nombre="mas" class="h-4 w-4" [grosor]="2.4" /> 7 días más</button>
              </div>
              @if (revisarAgenda(f.agenda); as r) {
                <p class="mt-4 rounded-xl border p-3 text-sm leading-relaxed" role="status"
                   [class]="r.tipo === 'error' ? 'border-red-500/30 bg-red-500/[0.06] text-red-200'
                            : r.tipo === 'aviso' ? 'border-detalle-400/30 bg-detalle-500/[0.06] text-detalle-200'
                            : 'border-white/10 bg-white/[0.03] text-neutral-300'">{{ r.texto }}</p>
              }
            }
          </section>

          <!-- ============ HORARIO ============ -->
          <section class="tarjeta p-5 sm:p-6">
            <h3 class="text-lg font-black">Horario de atención</h3>
            <p class="ayuda !mt-1">Es el que se muestra en la página y el que usa la reserva. El día libre y el descanso de cada barbero se cambian en Equipo.</p>

            <div class="mt-6 grid gap-4 sm:grid-cols-2">
              <label class="block">
                <span class="etiqueta">Abre a las</span>
                <select name="apertura" [(ngModel)]="f.horario.apertura" class="campo [color-scheme:dark]">
                  @for (h of horas; track h.minutos) { <option [ngValue]="h.minutos">{{ h.etiqueta }}</option> }
                </select>
              </label>
              <label class="block">
                <span class="etiqueta">Cierra a las</span>
                <select name="cierre" [(ngModel)]="f.horario.cierre" class="campo [color-scheme:dark]">
                  @for (h of horas; track h.minutos) { <option [ngValue]="h.minutos">{{ h.etiqueta }}</option> }
                </select>
              </label>
            </div>
            @if (horasMal(f)) { <p class="texto-error">La hora de cierre debe ser después de la de apertura, todos los días.</p> }

            <p class="etiqueta mt-6">Días que abre</p>
            <div class="flex flex-wrap gap-2">
              @for (d of dias; track d.valor) {
                <button type="button" (click)="alternarDia(d.valor)" [attr.aria-pressed]="!f.horario.diasCerrados.includes(d.valor)"
                        class="h-11 min-w-[3.25rem] rounded-xl border px-3 text-sm font-bold transition-colors"
                        [class]="f.horario.diasCerrados.includes(d.valor)
                          ? 'border-white/10 text-neutral-600 line-through'
                          : 'border-detalle-400/60 bg-detalle-500/15 text-detalle-200'">{{ d.nombre }}</button>
              }
            </div>

            <p class="etiqueta mt-6">¿Algún día abre a otra hora?</p>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              @for (d of dias; track d.valor) {
                @if (!f.horario.diasCerrados.includes(d.valor)) {
                  <label class="block">
                    <span class="mb-1.5 block text-xs font-bold text-neutral-400">{{ d.nombre }}</span>
                    <select [name]="'apertura' + d.valor" [attr.name]="'apertura' + d.valor" [ngModel]="aperturaPropia(d.valor)" (ngModelChange)="ponerApertura(d.valor, $event)" class="campo [color-scheme:dark]">
                      <option [ngValue]="null">Igual ({{ hora(f.horario.apertura) }})</option>
                      @for (h of horas; track h.minutos) { <option [ngValue]="h.minutos">{{ h.etiqueta }}</option> }
                    </select>
                  </label>
                }
              }
            </div>

            <!-- Lo que resulta: los turnos van cada 40 minutos desde la hora en que abre cada día -->
            @if (!horasMal(f)) {
              <div class="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4" role="status">
                <p class="text-sm font-bold text-white">Así queda la agenda (un turno cada {{ turno }} minutos)</p>
                <ul class="mt-2 space-y-1 text-sm text-neutral-300">
                  @for (fila of turnosPorDia(f); track fila.dias) {
                    <li><span class="font-bold text-detalle-200">{{ fila.dias }}:</span> {{ fila.texto }}</li>
                  }
                </ul>
                <p class="ayuda">El último turno es el que alcanza a terminar antes del cierre. Un servicio más largo que un turno ocupa los que necesite.</p>
              </div>
            }

            <p class="etiqueta mt-6">Fechas cerradas (festivos, vacaciones)</p>
            <div class="flex flex-wrap items-end gap-3">
              <label class="block">
                <span class="sr-only">Fecha a cerrar</span>
                <input type="date" name="nuevoCierre" [(ngModel)]="nuevoCierre" [min]="hoy" class="campo [color-scheme:dark]">
              </label>
              <button type="button" (click)="agregarCierre()" [disabled]="!nuevoCierre" class="boton-linea boton-chico"><app-icono nombre="mas" class="h-4 w-4" [grosor]="2.4" /> Agregar fecha</button>
            </div>
            @if (f.horario.cierres.length > 0) {
              <ul class="mt-3 flex flex-wrap gap-2">
                @for (c of f.horario.cierres; track c) {
                  <li class="chip-oro !normal-case !tracking-normal">
                    <span class="capitalize">{{ fecha(c) | date:'EEE d MMM y' }}</span>
                    <button type="button" (click)="quitarCierre(c)" class="-mr-1 flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10" [attr.aria-label]="'Quitar el ' + (fecha(c) | date:'d MMMM')">
                      <app-icono nombre="cerrar" class="h-3 w-3" [grosor]="2.6" />
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <p class="ayuda">Ninguna. En una fecha cerrada no se ofrecen turnos (las citas que ya existan siguen en pie).</p>
            }
          </section>

          <!-- ============ MULTA ============ -->
          <section class="tarjeta p-5 sm:p-6" data-ajuste-multa>
            <div class="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 class="text-lg font-black">Multa por no asistir</h3>
                <p class="ayuda !mt-1">Para quien no llega a su turno. Se pone al marcar "No asistió" y se cobra en su próxima visita, al marcarla "Hecho". Tus clientes lo ven antes de confirmar su reserva.</p>
              </div>
              <label class="flex shrink-0 cursor-pointer items-center gap-3">
                <span class="text-sm font-bold" [class]="f.multa.activa ? 'text-detalle-200' : 'text-neutral-500'">{{ f.multa.activa ? 'Activa' : 'Sin multa' }}</span>
                <input type="checkbox" name="multaActiva" [(ngModel)]="f.multa.activa" class="peer sr-only">
                <span class="interruptor"></span>
              </label>
            </div>
            @if (f.multa.activa) {
              <div class="grid gap-4 md:grid-cols-[13rem_1fr]">
                <label class="block">
                  <span class="etiqueta">Valor (COP) *</span>
                  <input name="multaValor" type="number" min="1000" [max]="multaMaxima" step="1000" inputmode="numeric" [(ngModel)]="f.multa.valor" placeholder="10000" class="campo font-bold">
                  @if (!multaValida(f.multa.valor)) { <span class="texto-error">Escribe un valor mayor que cero.</span> }
                </label>
                <div>
                  <span class="etiqueta">¿Cómo se pone?</span>
                  <div class="grid gap-2 sm:grid-cols-2" role="group" aria-label="Cómo se pone la multa">
                    <button type="button" (click)="f.multa.automatica = true" [attr.aria-pressed]="f.multa.automatica" class="min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-bold transition-colors"
                            [class]="f.multa.automatica ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-300 hover:text-white'">
                      Sola, al marcar "No asistió"
                      <span class="block text-xs font-normal opacity-80">Viene puesta; se puede quitar en ese momento.</span>
                    </button>
                    <button type="button" (click)="f.multa.automatica = false" [attr.aria-pressed]="!f.multa.automatica" class="min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-bold transition-colors"
                            [class]="!f.multa.automatica ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-300 hover:text-white'">
                      La decido cada vez
                      <span class="block text-xs font-normal opacity-80">Al marcar "No asistió" eliges si se la pones.</span>
                    </button>
                  </div>
                </div>
              </div>
            }
          </section>

          <!-- ============ CURSOS ============ -->
          <section class="tarjeta p-5 sm:p-6">
            <div class="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 class="text-lg font-black">Cursos</h3>
                <p class="ayuda !mt-1">Botón en el menú y banner en el inicio que llevan a la página de tus cursos.</p>
              </div>
              <label class="flex shrink-0 cursor-pointer items-center gap-3">
                <span class="text-sm font-bold" [class]="f.cursos.activo ? 'text-detalle-200' : 'text-neutral-500'">{{ f.cursos.activo ? 'Visible' : 'Oculto' }}</span>
                <input type="checkbox" name="cursosActivo" [(ngModel)]="f.cursos.activo" class="peer sr-only">
                <span class="interruptor"></span>
              </label>
            </div>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label class="block md:col-span-2">
                <span class="etiqueta">Enlace de la página de cursos *</span>
                <input name="cursosUrl" type="url" [(ngModel)]="f.cursos.url" placeholder="https://…" maxlength="300" class="campo">
                @if (f.cursos.url && !urlValida(f.cursos.url)) { <span class="texto-error">Debe empezar por https://</span> }
              </label>
              <label class="block">
                <span class="etiqueta">Título</span>
                <input name="cursosTitulo" [(ngModel)]="f.cursos.titulo" maxlength="80" class="campo">
              </label>
              <label class="block">
                <span class="etiqueta">Texto del botón</span>
                <input name="cursosBoton" [(ngModel)]="f.cursos.textoBoton" placeholder="Ver cursos" maxlength="30" class="campo">
              </label>
              <label class="block md:col-span-2">
                <span class="etiqueta">Descripción</span>
                <textarea name="cursosDescripcion" [(ngModel)]="f.cursos.descripcion" rows="3" maxlength="300" class="campo resize-none"></textarea>
              </label>
            </div>
            @if (f.cursos.url && urlValida(f.cursos.url)) {
              <a [href]="f.cursos.url" target="_blank" rel="noopener" class="enlace-toque mt-4 text-sm font-bold text-detalle-200 hover:text-white">Probar el enlace <app-icono nombre="externo" class="h-3.5 w-3.5" [grosor]="2.2" /></a>
            }
          </section>

          <!-- Barra de guardar: siempre a la vista, con su propio fondo (un botón suelto flotaba sobre el formulario).
               En celular queda pegada justo encima de la barra de secciones del panel. -->
          <div class="sticky bottom-[calc(3.25rem+max(0.75rem,env(safe-area-inset-bottom)))] z-10 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-neutral-950 px-4 py-3 shadow-2xl shadow-black md:bottom-0">
            <p class="text-xs leading-snug text-neutral-400">Los cambios se ven en la página al guardar.</p>
            <button type="submit" [disabled]="guardando()" class="boton-acento shrink-0 !px-7">
              {{ guardando() ? 'Guardando…' : 'Guardar ajustes' }}
            </button>
          </div>
        </form>
      } @else {
        <div class="tarjeta h-96 animate-pulse"></div>
      }
    </div>
  `,
})
export class AdminAjustesComponent {
  private ajustesService = inject(AjustesService);
  private notificaciones = inject(NotificationService);

  readonly dias = DIAS;
  readonly hoy = claveDia(new Date());
  readonly tope = topeDeAgenda(this.hoy);
  readonly diasContinua = DIAS_RESERVABLES;
  readonly turno = INTERVALO;
  /** De 5:00 a. m. a medianoche, cada 20 minutos (el bloque de la agenda). */
  readonly horas = Array.from({ length: (1440 - 300) / PASO_HORARIO + 1 }, (_, i) => 300 + i * PASO_HORARIO).map(minutos => ({ minutos, etiqueta: minutos === 1440 ? '12:00 AM (medianoche)' : formatearHora12(minutos) }));
  nuevoCierre = '';

  readonly multaMaxima = MULTA_MAXIMA;

  /** Copia editable. Se toma una sola vez para no pisar lo que el admin está escribiendo. */
  readonly form = signal<AjustesSitio | null>(null);
  readonly guardando = signal(false);

  constructor() {
    // Lo que hay guardado de verdad (no la copia local de la última visita, que es solo para pintar rápido).
    this.ajustesService.guardados$.pipe(take(1), takeUntilDestroyed(inject(DestroyRef))).subscribe({
      next: ajustes => this.form.set(structuredClone(ajustes)),
      error: error => console.error('No se pudieron leer los ajustes guardados', error),
    });
  }

  fecha(dia: string): Date {
    return fechaDesdeClave(dia);
  }

  urlValida(url: string): boolean {
    return /^https:\/\/[^\s]+\.[^\s]+/.test(url.trim());
  }

  // ---------- Agenda ----------

  /** Al pasar a periodos sin fechas vigentes, se propone abrir 15 días desde hoy. */
  usarPeriodos() {
    const f = this.form()!;
    f.agenda = periodoDeAgenda({ ...f.agenda, modo: 'periodo' }).abierta
      ? { ...f.agenda, modo: 'periodo' }
      : { modo: 'periodo', desde: this.hoy, hasta: sumarDias(this.hoy, 15) };
  }

  abrirDesdeHoy(dias: number) {
    this.form()!.agenda = { modo: 'periodo', desde: this.hoy, hasta: sumarDias(this.hoy, dias) };
  }

  extender(dias: number) {
    const f = this.form()!;
    f.agenda = extenderAgenda(f.agenda, dias);
  }

  /** Lo que significan las fechas elegidas, dicho en claro (o el motivo por el que no se pueden guardar). */
  revisarAgenda(agenda: Agenda): { tipo: 'ok' | 'aviso' | 'error'; texto: string } {
    if (!agenda.desde || !agenda.hasta) return { tipo: 'error', texto: 'Elige desde qué día y hasta cuál se puede reservar.' };
    if (agenda.hasta < agenda.desde) return { tipo: 'error', texto: 'El último día debe ser igual o posterior al primero.' };
    if (agenda.hasta > this.tope) return { tipo: 'error', texto: `El último día no puede pasar del ${diaLargo(this.tope)} (${MAX_DIAS_AGENDA} días desde hoy).` };
    if (agenda.hasta < this.hoy) return { tipo: 'aviso', texto: 'Estas fechas ya pasaron: con ellas la agenda queda cerrada y nadie puede reservar desde la página.' };
    const primero = agenda.desde > this.hoy ? agenda.desde : this.hoy;
    const dias = diasEntre(primero, agenda.hasta) + 1;
    return {
      tipo: 'ok',
      texto: `Tus clientes pueden reservar ${agenda.desde > this.hoy ? `del ${diaLargo(agenda.desde)} al` : 'hasta el'} ${diaLargo(agenda.hasta)} `
        + `(${dias === 1 ? 'queda 1 día' : `${dias} días`}). Después la agenda queda cerrada hasta que abras otro periodo.`,
    };
  }

  // ---------- Multa ----------

  multaValida(valor: number): boolean {
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 && n <= MULTA_MAXIMA;
  }

  // ---------- Horario ----------

  alternarDia(dia: number) {
    const horario = this.form()!.horario;
    horario.diasCerrados = horario.diasCerrados.includes(dia) ? horario.diasCerrados.filter(d => d !== dia) : [...horario.diasCerrados, dia].sort();
  }

  hora(minutos: number): string {
    return formatearHora12(minutos);
  }

  /** La apertura propia de ese día, o null si abre a la hora general. */
  aperturaPropia(dia: number): number | null {
    const aperturas: Partial<Record<number, number>> = this.form()!.horario.aperturas;
    return aperturas[dia] ?? null;
  }

  /** Apertura propia de un día; con `null` vuelve a la general. */
  ponerApertura(dia: number, minutos: number | null) {
    const horario = this.form()!.horario;
    const { [dia]: _anterior, ...resto } = horario.aperturas;
    horario.aperturas = minutos === null ? resto : { ...resto, [dia]: minutos };
  }

  /** Algún día abriría a la hora del cierre o después. */
  horasMal(f: AjustesSitio): boolean {
    return [0, 1, 2, 3, 4, 5, 6].some(d => !f.horario.diasCerrados.includes(d) && aperturaDe(f.horario, d) >= f.horario.cierre);
  }

  /** Primer y último turno de cada grupo de días, para que se vea qué resulta antes de guardar. */
  turnosPorDia(f: AjustesSitio): { dias: string; texto: string }[] {
    return resumenHorario(f.horario).filter(fila => fila.abierto).map(fila => {
      const turnos = turnosDelDia(f.horario, fila.incluye[0]);
      return {
        dias: fila.dias,
        texto: turnos.length === 0 ? 'no alcanza ningún turno antes del cierre.'
          : `primer turno ${formatearHora12(turnos[0])}, último ${formatearHora12(turnos[turnos.length - 1])} (${turnos.length} al día).`,
      };
    });
  }

  /** Solo se guardan las aperturas de días abiertos que de verdad son distintas de la general. */
  private aperturasPropias(f: AjustesSitio): Record<number, number> {
    return Object.fromEntries(Object.entries(f.horario.aperturas)
      .filter(([dia, minutos]) => !f.horario.diasCerrados.includes(Number(dia)) && minutos !== f.horario.apertura));
  }

  agregarCierre() {
    const horario = this.form()!.horario;
    if (this.nuevoCierre && !horario.cierres.includes(this.nuevoCierre)) horario.cierres = [...horario.cierres, this.nuevoCierre].sort();
    this.nuevoCierre = '';
  }

  quitarCierre(dia: string) {
    const horario = this.form()!.horario;
    horario.cierres = horario.cierres.filter(c => c !== dia);
  }

  async guardar() {
    const f = this.form();
    if (!f) return;
    if (f.horario.diasCerrados.length >= 7) {
      this.notificaciones.error('Revisa el horario', 'Debe abrir al menos un día de la semana.');
      return;
    }
    if (this.horasMal(f)) {
      this.notificaciones.error('Revisa el horario', 'La hora de cierre debe ser después de la de apertura, todos los días.');
      return;
    }
    if (f.cursos.activo && !this.urlValida(f.cursos.url)) {
      this.notificaciones.error('Revisa el enlace de los cursos', 'Debe ser una dirección completa que empiece por https://');
      return;
    }
    if (f.multa.activa && !this.multaValida(f.multa.valor)) {
      this.notificaciones.error('Revisa la multa', 'Escribe un valor mayor que cero, o desactívala.');
      return;
    }
    if (f.agenda.modo === 'periodo') {
      const revision = this.revisarAgenda(f.agenda);
      if (revision.tipo === 'error') {
        this.notificaciones.error('Revisa las fechas de la agenda', revision.texto);
        return;
      }
    }
    const ajustes: AjustesSitio = {
      agenda: { ...f.agenda },
      cursos: { ...f.cursos, url: f.cursos.url.trim(), titulo: f.cursos.titulo.trim(), descripcion: f.cursos.descripcion.trim(), textoBoton: f.cursos.textoBoton.trim() },
      // Las fechas cerradas que ya pasaron se sueltan solas.
      horario: { ...f.horario, aperturas: this.aperturasPropias(f), cierres: f.horario.cierres.filter(c => c >= this.hoy) },
      multa: { activa: f.multa.activa, valor: Math.round(Number(f.multa.valor)) || 0, automatica: f.multa.automatica },
      // No se guarda desde aquí (se elige en Citas): va solo para que el formulario quede completo.
      serviciosPorDia: f.serviciosPorDia,
    };
    this.guardando.set(true);
    try {
      await this.ajustesService.guardar(ajustes);
      this.form.set(structuredClone(ajustes));
      this.notificaciones.exito('Ajustes guardados', 'Los cambios ya se ven en la página.');
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudieron guardar los ajustes', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.guardando.set(false);
    }
  }
}
