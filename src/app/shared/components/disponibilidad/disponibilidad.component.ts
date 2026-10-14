import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, of } from 'rxjs';
import { BarberoPublico } from '../../../core/models/barbero.model';
import { AjustesService } from '../../../core/services/ajustes.service';
import { BarberosService } from '../../../core/services/barberos.service';
import { CitasService, MOTIVOS_BLOQUEO, MotivoBloqueo } from '../../../core/services/citas.service';
import { ConfirmarService } from '../../../core/services/confirmar.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  Slot, aperturaDe, claveDia, estaCerrado, fechaDesdeClave, formatearHora12, opcionesDeHora, parsearHora, rangosDe,
} from '../../../core/utils/horario';
import { IconoComponent } from '../icono/icono.component';

interface BloqueoDelDia {
  dia: string;
  fecha: Date;
  motivo: string;
  rangos: { desde: number; hasta: number; texto: string; ids: string[] }[];
  ids: string[];
}

const DIAS = [
  { valor: 1, corto: 'Lun' }, { valor: 2, corto: 'Mar' }, { valor: 3, corto: 'Mié' }, { valor: 4, corto: 'Jue' },
  { valor: 5, corto: 'Vie' }, { valor: 6, corto: 'Sáb' }, { valor: 0, corto: 'Dom' },
];

/**
 * Cuándo atiende un barbero: su día libre de cada semana, su descanso fijo y las horas o días que cierra
 * (almuerzo, permiso, vacaciones). Lo usa el propio barbero en su panel y el admin en "Staff & Barberos".
 * Lo que se cierra aquí deja de ofrecerse en la reserva al instante.
 */
@Component({
  selector: 'app-disponibilidad',
  standalone: true,
  imports: [FormsModule, DatePipe, IconoComponent],
  template: `
    <div class="grid gap-5 lg:grid-cols-2">
      <!-- ============ Semana y descanso ============ -->
      <section class="tarjeta p-5 sm:p-6">
        <h3 class="text-lg font-black text-white">Cada semana</h3>
        <p class="ayuda !mt-1">Los días que no atiendes y tu descanso fijo. Los días que la barbería no abre ya están cerrados.</p>

        <p class="etiqueta mt-6">Días libres</p>
        <div class="flex flex-wrap gap-2">
          @for (d of dias; track d.valor) {
            <button type="button" (click)="alternarDia(d.valor)" [disabled]="cerradoPorLaBarberia(d.valor)" [attr.aria-pressed]="diasLibres().includes(d.valor)"
                    class="h-11 min-w-[3.25rem] rounded-xl border px-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-35"
                    [class]="diasLibres().includes(d.valor) || cerradoPorLaBarberia(d.valor)
                      ? 'border-detalle-400/60 bg-detalle-500/15 text-detalle-200'
                      : 'border-white/10 text-neutral-300 hover:border-white/30'">{{ d.corto }}</button>
          }
        </div>
        <p class="ayuda">{{ resumenDias() }}</p>

        <label class="mt-6 flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span class="block text-sm font-bold text-white">Descanso todos los días</span>
            <span class="block text-xs text-neutral-500">Por ejemplo, el almuerzo. No se ofrecen turnos en ese rato.</span>
          </span>
          <input type="checkbox" class="peer sr-only" [ngModel]="conDescanso()" (ngModelChange)="conDescanso.set($event)" name="conDescanso">
          <span class="interruptor"></span>
        </label>
        @if (conDescanso()) {
          <div class="mt-4 grid grid-cols-2 gap-3">
            <label class="block">
              <span class="etiqueta">Desde</span>
              <select class="campo [color-scheme:dark]" [ngModel]="descansoDesde()" (ngModelChange)="descansoDesde.set($event)" name="descansoDesde">
                @for (o of con(horasInicio(), descansoDesde()); track o.minutos) { <option [ngValue]="o.minutos">{{ o.etiqueta }}</option> }
              </select>
            </label>
            <label class="block">
              <span class="etiqueta">Hasta</span>
              <select class="campo [color-scheme:dark]" [ngModel]="descansoHasta()" (ngModelChange)="descansoHasta.set($event)" name="descansoHasta">
                @for (o of con(horasFin(), descansoHasta()); track o.minutos) { <option [ngValue]="o.minutos">{{ o.etiqueta }}</option> }
              </select>
            </label>
          </div>
          @if (descansoHasta() <= descansoDesde()) { <p class="texto-error">La hora final debe ser después de la inicial.</p> }
        }

        <div class="mt-6 flex justify-end">
          <button type="button" (click)="guardarSemana()" [disabled]="guardando() || !semanaCambio()" class="boton-acento boton-chico">
            {{ guardando() ? 'Guardando…' : semanaCambio() ? 'Guardar' : 'Guardado' }}
          </button>
        </div>
      </section>

      <!-- ============ Cerrar un día o unas horas ============ -->
      <section class="tarjeta p-5 sm:p-6">
        <h3 class="text-lg font-black text-white">Cerrar un día o unas horas</h3>
        <p class="ayuda !mt-1">Para un permiso, una cita médica o vacaciones. Las citas que ya estén agendadas no se tocan.</p>

        <form (ngSubmit)="cerrar()" class="mt-6 space-y-4" novalidate>
          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="etiqueta">Fecha</span>
              <input type="date" name="dia" class="campo [color-scheme:dark]" [(ngModel)]="dia" [min]="hoy" [max]="limite">
            </label>
            <label class="block">
              <span class="etiqueta">Motivo</span>
              <select name="motivo" class="campo [color-scheme:dark]" [(ngModel)]="motivo">
                @for (m of motivos; track m) { <option [ngValue]="m">{{ m }}</option> }
              </select>
            </label>
          </div>
          <label class="flex cursor-pointer items-center justify-between gap-4">
            <span class="text-sm font-bold text-white">Todo el día</span>
            <input type="checkbox" class="peer sr-only" name="todoElDia" [(ngModel)]="todoElDia">
            <span class="interruptor"></span>
          </label>
          @if (!todoElDia) {
            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="etiqueta">Desde</span>
                <select name="desde" class="campo [color-scheme:dark]" [(ngModel)]="desde">
                  @for (o of horasInicio(); track o.minutos) { <option [ngValue]="o.minutos">{{ o.etiqueta }}</option> }
                </select>
              </label>
              <label class="block">
                <span class="etiqueta">Hasta</span>
                <select name="hasta" class="campo [color-scheme:dark]" [(ngModel)]="hasta">
                  @for (o of horasFin(); track o.minutos) { <option [ngValue]="o.minutos">{{ o.etiqueta }}</option> }
                </select>
              </label>
            </div>
          }
          <div class="flex justify-end">
            <button type="submit" [disabled]="cerrando()" class="boton-linea boton-chico">
              <app-icono nombre="pausa" class="h-4 w-4" [grosor]="2" /> {{ cerrando() ? 'Cerrando…' : 'Cerrar ese horario' }}
            </button>
          </div>
        </form>

        <p class="etiqueta mt-7">Horarios cerrados</p>
        @if (bloqueos().length === 0) {
          <p class="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-neutral-500">No hay nada cerrado de hoy en adelante.</p>
        } @else {
          <ul class="divide-y divide-white/5 rounded-xl border border-white/10">
            @for (b of bloqueos(); track b.dia) {
              <li class="flex items-center gap-3 px-4 py-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-bold capitalize text-white">{{ b.fecha | date:'EEE d MMM' }} @if (b.motivo) { <span class="font-semibold normal-case text-detalle-300">· {{ b.motivo }}</span> }</p>
                  <p class="text-xs text-neutral-500">
                    @for (r of b.rangos; track r.desde; let ultimo = $last) { {{ r.texto }}{{ ultimo ? '' : ', ' }} }
                  </p>
                </div>
                <button type="button" (click)="abrir(b)" class="boton-icono peligro" [attr.aria-label]="'Volver a abrir el ' + (b.fecha | date:'EEEE d MMMM')" title="Volver a abrir">
                  <app-icono nombre="cerrar" class="h-4 w-4" [grosor]="2" />
                </button>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
})
export class DisponibilidadComponent {
  private barberos = inject(BarberosService);
  private citas = inject(CitasService);
  private ajustes = inject(AjustesService);
  private notificaciones = inject(NotificationService);
  private confirmar = inject(ConfirmarService);

  barbero = input.required<BarberoPublico>();

  readonly dias = DIAS;
  readonly motivos = MOTIVOS_BLOQUEO;
  readonly hoy = claveDia(new Date());
  /** Las reglas aceptan cierres hasta 60 días adelante. */
  readonly limite = claveDia(new Date(Date.now() + 60 * 86_400_000));

  readonly horasInicio = computed(() => opcionesDeHora(this.ajustes.horario()));
  readonly horasFin = computed(() => opcionesDeHora(this.ajustes.horario(), true).slice(1));

  // --- Semana ---
  readonly diasLibres = signal<number[]>([]);
  readonly conDescanso = signal(false);
  readonly descansoDesde = signal(13 * 60);
  readonly descansoHasta = signal(14 * 60);
  readonly guardando = signal(false);

  // --- Cierre puntual ---
  dia = this.hoy;
  motivo: MotivoBloqueo = 'Permiso';
  todoElDia = true;
  desde = 13 * 60;
  hasta = 14 * 60;
  readonly cerrando = signal(false);

  private readonly todos = toSignal(
    this.citas.bloqueosVigentes().pipe(catchError(error => {
      console.error('Error cargando los horarios cerrados', error);
      return of<Slot[]>([]);
    })),
    { initialValue: [] as Slot[] },
  );

  /** Horarios cerrados de este barbero, por día, con los bloques seguidos juntos ("1:00 PM – 2:00 PM"). */
  readonly bloqueos = computed<BloqueoDelDia[]>(() => {
    const porDia = new Map<string, Slot[]>();
    for (const s of this.todos().filter(s => s.barberoId === this.barbero().id)) {
      porDia.set(s.dia, [...(porDia.get(s.dia) ?? []), s]);
    }
    return [...porDia].sort(([a], [b]) => a.localeCompare(b)).map(([dia, slots]) => {
      const minutos = slots.map(s => parsearHora(s.hora) ?? 0);
      const idDe = (m: number) => slots.find(s => (parsearHora(s.hora) ?? 0) === m)!.id;
      return {
        dia,
        fecha: fechaDesdeClave(dia),
        motivo: slots.find(s => s.motivo)?.motivo ?? '',
        ids: slots.map(s => s.id),
        rangos: rangosDe(minutos).map(r => ({
          ...r,
          texto: `${formatearHora12(r.desde)} – ${formatearHora12(r.hasta)}`,
          ids: minutos.filter(m => m >= r.desde && m < r.hasta).map(idDe),
        })),
      };
    });
  });

  /** ¿Lo que está en pantalla es distinto de lo guardado? */
  readonly semanaCambio = computed(() => {
    const b = this.barbero();
    const guardado = JSON.stringify({ dias: [...(b.diasLibres ?? [])].sort(), descanso: b.descanso ?? null });
    return guardado !== JSON.stringify({ dias: [...this.diasLibres()].sort(), descanso: this.descansoElegido() });
  });

  readonly resumenDias = computed(() => {
    const libres = this.dias.filter(d => this.diasLibres().includes(d.valor) && !this.cerradoPorLaBarberia(d.valor));
    return libres.length === 0 ? 'Atiendes todos los días que abre la barbería.' : `No atiendes: ${libres.map(d => d.corto).join(', ')}.`;
  });

  constructor() {
    // Carga lo guardado cuando llega (o cambia) el barbero, sin pisar lo que se está editando de otro.
    let cargado: string | undefined;
    effect(() => {
      const b = this.barbero();
      if (b.id === cargado) return;
      cargado = b.id;
      untracked(() => {
        this.diasLibres.set([...(b.diasLibres ?? [])]);
        this.conDescanso.set(!!b.descanso);
        if (b.descanso) {
          this.descansoDesde.set(b.descanso.desde);
          this.descansoHasta.set(b.descanso.hasta);
        }
      });
    });
  }

  /** Las opciones más la hora ya guardada, si no está entre ellas (un descanso de antes, a y media). */
  con(opciones: { minutos: number; etiqueta: string }[], guardada: number): { minutos: number; etiqueta: string }[] {
    if (opciones.some(o => o.minutos === guardada)) return opciones;
    return [...opciones, { minutos: guardada, etiqueta: formatearHora12(guardada) }].sort((a, b) => a.minutos - b.minutos);
  }

  cerradoPorLaBarberia(dia: number): boolean {
    return this.ajustes.horario().diasCerrados.includes(dia);
  }

  alternarDia(dia: number) {
    this.diasLibres.update(dias => (dias.includes(dia) ? dias.filter(d => d !== dia) : [...dias, dia]));
  }

  private descansoElegido(): { desde: number; hasta: number } | null {
    return this.conDescanso() ? { desde: this.descansoDesde(), hasta: this.descansoHasta() } : null;
  }

  async guardarSemana() {
    const descanso = this.descansoElegido();
    if (descanso && descanso.hasta <= descanso.desde) {
      this.notificaciones.error('Revisa el descanso', 'La hora final debe ser después de la inicial.');
      return;
    }
    this.guardando.set(true);
    try {
      await this.barberos.guardarDisponibilidad(this.barbero().id!, { diasLibres: this.diasLibres(), descanso });
      this.notificaciones.exito('Disponibilidad guardada', 'La reserva ya solo ofrece los días y horas que atiendes.');
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.guardando.set(false);
    }
  }

  async cerrar() {
    const horario = this.ajustes.horario();
    if (!this.dia || this.dia < this.hoy || this.dia > this.limite) {
      this.notificaciones.error('Revisa la fecha', 'Elige un día de hoy en adelante (hasta 60 días).');
      return;
    }
    if (estaCerrado(this.dia, horario)) {
      this.notificaciones.error('Ese día la barbería no abre', 'No hace falta cerrarlo.');
      return;
    }
    const desde = this.todoElDia ? aperturaDe(horario, fechaDesdeClave(this.dia).getDay()) : this.desde;
    const hasta = this.todoElDia ? horario.cierre : this.hasta;
    if (hasta <= desde) {
      this.notificaciones.error('Revisa las horas', 'La hora final debe ser después de la inicial.');
      return;
    }
    this.cerrando.set(true);
    try {
      const ocupados = await firstValueFrom(this.citas.slotsOcupados(this.dia));
      const resultado = await this.citas.bloquear({ barberoId: this.barbero().id!, dia: this.dia, desde, hasta, motivo: this.motivo, ocupados });
      if (resultado.cerrados === 0) {
        this.notificaciones.error('No había nada que cerrar', 'Ese horario ya estaba cerrado o tiene citas agendadas.');
      } else {
        this.notificaciones.exito('Horario cerrado', resultado.ocupados
          ? 'Ojo: hay citas agendadas en ese rato, y siguen en pie. Si no puedes atenderlas, avísales.'
          : 'Ya no se ofrecen turnos en ese rato.');
      }
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo cerrar el horario', 'Puede que alguien acabe de reservar ahí. Inténtalo de nuevo.');
    } finally {
      this.cerrando.set(false);
    }
  }

  async abrir(bloqueo: BloqueoDelDia) {
    const fecha = bloqueo.fecha.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!(await this.confirmar.preguntar({ titulo: '¿Volver a abrir este horario?', texto: `El ${fecha} se podrán reservar turnos en ese rato otra vez.`, aceptar: 'Sí, abrirlo' }))) return;
    try {
      await this.citas.desbloquear(bloqueo.ids);
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo abrir el horario', 'Inténtalo de nuevo.');
    }
  }
}
