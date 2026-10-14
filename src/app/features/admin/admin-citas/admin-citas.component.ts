import { Component, DestroyRef, inject } from '@angular/core';
import { DatePipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { CitasService, HorarioNoDisponibleError } from '../../../core/services/citas.service';
import { AjustesService } from '../../../core/services/ajustes.service';
import { BarberosService } from '../../../core/services/barberos.service';
import { ServiciosService } from '../../../core/services/servicios.service';
import { ConfirmarService } from '../../../core/services/confirmar.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Cita, NuevaCita, esActiva, etiquetaEstado } from '../../../core/models/cita.model';
import { BarberoPublico } from '../../../core/models/barbero.model';
import { Servicio } from '../../../core/models/servicio.model';
import {
  aperturaDe, claveDia, compararCitas, diaDeCita, duracionDe, estaCerrado, estaLibre, fechaDesdeClave, formatearHora12,
  inicioDeCita, minutosAHora24, minutosDeCita, opcionesDeHora, trabaja,
} from '../../../core/utils/horario';
import { enlaceWhatsApp, esCelularValido, formatoCelular, limpiarCelular } from '../../../core/utils/colombia';

const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
import { CompletarCitaComponent } from '../../../shared/components/completar-cita/completar-cita.component';
import { IconoComponent } from '../../../shared/components/icono/icono.component';
import { RedSocialComponent } from '../../../shared/components/red-social/red-social.component';
import { RecurrenteComponent } from '../../../shared/components/recurrente/recurrente.component';

interface DiaCalendario {
  fecha: Date;
  clave: string;
  esOtroMes: boolean;
  esHoy: boolean;
  citas: Cita[];
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

@Component({
  selector: 'app-admin-citas',
  standalone: true,
  imports: [DatePipe, NgClass, FormsModule, CompletarCitaComponent, IconoComponent, RedSocialComponent, RecurrenteComponent],
  template: `
    <div class="animate-in fade-in duration-500">
      <div class="mb-8 flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h2 class="titulo-panel">Citas</h2>
          <p class="mt-1 text-neutral-400">Las reservas de tus clientes, por día o en lista.</p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button type="button" (click)="abrirNuevaCita()" class="boton-acento">
            <app-icono nombre="mas" class="h-4 w-4" [grosor]="2.4" /> Nueva cita
          </button>
          <div class="flex rounded-xl border border-white/10 p-1" role="group" aria-label="Cómo ver las citas">
            <button type="button" (click)="vista = 'calendario'" [attr.aria-pressed]="vista === 'calendario'" class="min-h-10 rounded-lg px-4 text-sm font-bold transition-colors"
                    [ngClass]="vista === 'calendario' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'">Calendario</button>
            <button type="button" (click)="vista = 'lista'" [attr.aria-pressed]="vista === 'lista'" class="min-h-10 rounded-lg px-4 text-sm font-bold transition-colors"
                    [ngClass]="vista === 'lista' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'">Lista</button>
          </div>

          @if (vista === 'calendario') {
            <div class="flex items-center gap-1 rounded-xl border border-white/10 p-1">
              <button type="button" (click)="cambiarMes(-1)" class="boton-icono !border-transparent" aria-label="Mes anterior"><app-icono nombre="atras" class="h-4 w-4" [grosor]="2.2" /></button>
              <span class="w-36 text-center font-display text-sm font-bold tracking-wide">{{ nombreMesActual }} {{ anioActual }}</span>
              <button type="button" (click)="cambiarMes(1)" class="boton-icono !border-transparent" aria-label="Mes siguiente"><app-icono nombre="atras" class="h-4 w-4 rotate-180" [grosor]="2.2" /></button>
            </div>
          }
        </div>
      </div>

      @if (vista === 'calendario') {
        <div class="flex flex-col gap-6 xl:flex-row">
          <!-- Mes -->
          <div class="tarjeta h-fit flex-grow overflow-hidden">
            <div class="grid grid-cols-7 border-b border-white/10">
              @for (d of ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']; track d) {
                <div class="py-3 text-center text-[11px] font-extrabold uppercase tracking-widest text-neutral-500">{{ d }}</div>
              }
            </div>
            <div class="grid auto-rows-[72px] grid-cols-7 gap-px bg-white/5 md:auto-rows-[96px]">
              @for (dia of diasCalendario; track dia.clave) {
                <button type="button" (click)="seleccionarDia(dia.clave)" [attr.aria-pressed]="dia.clave === diaSeleccionado"
                        [attr.aria-label]="(dia.fecha | date:'EEEE d MMMM') + ', ' + activasDe(dia) + ' citas'"
                        class="relative overflow-hidden bg-neutral-950 p-1.5 text-left transition-colors hover:bg-white/[0.04] md:p-2"
                        [ngClass]="{ 'opacity-40': dia.esOtroMes, 'z-10 ring-2 ring-inset ring-detalle-400': dia.clave === diaSeleccionado }">
                  <span class="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold"
                        [ngClass]="dia.esHoy ? 'bg-acento-500 text-sobre-acento' : 'text-white'">{{ dia.fecha.getDate() }}</span>
                  @if (!dia.esOtroMes && activasDe(dia) > 0) {
                    <span class="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1 md:bottom-2 md:left-2">
                      <span class="h-1.5 w-1.5 rounded-full bg-detalle-400"></span>
                      <span class="text-[11px] font-bold text-neutral-300">{{ activasDe(dia) }}<span class="hidden md:inline"> {{ activasDe(dia) === 1 ? 'cita' : 'citas' }}</span></span>
                    </span>
                  }
                </button>
              }
            </div>
          </div>

          <!-- Día elegido -->
          <div class="tarjeta h-fit w-full p-5 xl:w-[26rem]">
            <div class="mb-5 flex items-start justify-between gap-3">
              <div>
                <p class="rotulo mb-1">Agenda del día</p>
                <h3 class="font-display text-xl font-black capitalize">{{ fechaSeleccionada | date:'EEEE d MMMM' }}</h3>
              </div>
              <button type="button" (click)="abrirNuevaCita(diaSeleccionado)" class="boton-icono" aria-label="Agendar una cita este día" title="Agendar este día">
                <app-icono nombre="mas" class="h-4 w-4" [grosor]="2.2" />
              </button>
            </div>

            @if (citasDelDiaSeleccionado.length === 0) {
              <div class="rounded-xl border border-dashed border-white/10 py-10 text-center text-neutral-500">No hay citas este día.</div>
            } @else {
              <ul class="space-y-3">
                @for (cita of citasDelDiaSeleccionado; track cita.id) {
                  <li class="rounded-xl border border-white/10 bg-black/30 p-4" [ngClass]="{ 'opacity-55': cita.estado === 'cancelada' || cita.estado === 'no-asistio' }">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="font-display text-lg font-bold text-detalle-200">{{ cita.horaStr }}</p>
                        <p class="truncate font-bold">{{ cita.userName || 'Cliente' }}</p>
                        <p class="truncate text-sm text-neutral-500">{{ cita.serviceName || 'Sin servicio' }} · {{ cita.barberoNombre || 'Cualquiera' }}</p>
                        @if (cita.recurrenciaId) { <app-recurrente class="mt-2" [frecuencia]="cita.frecuencia" /> }
                      </div>
                      <span [class]="claseEstado(cita)">{{ etiqueta(cita) }}</span>
                    </div>
                    <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                      @if (esActiva(cita.estado)) {
                        <button type="button" (click)="completando = cita" class="boton-linea boton-chico !border-emerald-500/30 !text-emerald-300 hover:!bg-emerald-500/10">
                          <app-icono nombre="check" class="h-4 w-4" [grosor]="2.4" /> Hecho
                        </button>
                        <button type="button" (click)="marcarNoAsistio(cita)" class="boton-linea boton-chico">No asistió</button>
                      }
                      <span class="ml-auto flex gap-2">
                        @if (cita.phone) {
                          <a [href]="whatsapp(cita.phone)" target="_blank" rel="noopener" class="boton-icono !text-emerald-300" [attr.aria-label]="'Escribirle a ' + cita.userName + ' por WhatsApp'" [title]="telefono(cita.phone)">
                            <app-red-social red="whatsapp" class="h-4 w-4" />
                          </a>
                        }
                        <button type="button" (click)="abrirModalEditar(cita)" class="boton-icono" aria-label="Editar o mover la cita" title="Editar o mover"><app-icono nombre="editar" class="h-4 w-4" [grosor]="1.8" /></button>
                        <button type="button" (click)="eliminarCita(cita)" class="boton-icono peligro" aria-label="Eliminar la cita" title="Eliminar"><app-icono nombre="papelera" class="h-4 w-4" [grosor]="1.8" /></button>
                      </span>
                    </div>
                  </li>
                }
              </ul>
            }
          </div>
        </div>
      }

      @if (vista === 'lista') {
        <!-- Celular: tarjetas. Escritorio: tabla. -->
        <ul class="space-y-3 md:hidden">
          @for (cita of citasOrdenadas; track cita.id) {
            <li class="tarjeta p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-xs font-bold uppercase tracking-widest text-detalle-300">{{ cita.fecha | date:'EEE d MMM' }} · {{ cita.horaStr }}</p>
                  <p class="mt-1 truncate font-bold">{{ cita.userName }}</p>
                  <p class="truncate text-sm text-neutral-500">{{ cita.serviceName }} · {{ cita.barberoNombre || 'Cualquiera' }}</p>
                  @if (cita.recurrenciaId) { <app-recurrente class="mt-2" [frecuencia]="cita.frecuencia" /> }
                </div>
                <span [class]="claseEstado(cita)">{{ etiqueta(cita) }}</span>
              </div>
              <div class="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
                @if (esActiva(cita.estado)) {
                  <button type="button" (click)="completando = cita" class="boton-linea boton-chico !border-emerald-500/30 !text-emerald-300">Hecho</button>
                  <button type="button" (click)="marcarNoAsistio(cita)" class="boton-linea boton-chico">No asistió</button>
                }
                <span class="ml-auto flex gap-2">
                  <button type="button" (click)="abrirModalEditar(cita)" class="boton-icono" aria-label="Editar o mover la cita"><app-icono nombre="editar" class="h-4 w-4" [grosor]="1.8" /></button>
                  <button type="button" (click)="eliminarCita(cita)" class="boton-icono peligro" aria-label="Eliminar la cita"><app-icono nombre="papelera" class="h-4 w-4" [grosor]="1.8" /></button>
                </span>
              </div>
            </li>
          } @empty {
            <li class="tarjeta border-dashed px-6 py-10 text-center text-neutral-500">No hay citas registradas.</li>
          }
        </ul>

        <div class="tarjeta hidden overflow-hidden md:block">
          <div class="overflow-x-auto">
            <table class="tabla">
              <thead>
                <tr><th>Fecha y hora</th><th>Cliente</th><th>Servicio</th><th>Barbero</th><th>Estado</th><th class="text-right">Acciones</th></tr>
              </thead>
              <tbody>
                @for (cita of citasOrdenadas; track cita.id) {
                  <tr class="transition-colors hover:bg-white/[0.02]">
                    <td class="whitespace-nowrap">
                      <p class="font-bold capitalize">{{ cita.fecha | date:'EEE d MMM' }}</p>
                      <p class="text-xs font-bold text-detalle-300">{{ cita.horaStr }}</p>
                    </td>
                    <td>
                      <p class="flex items-center gap-2 font-bold">{{ cita.userName }} @if (cita.recurrenciaId) { <app-recurrente [frecuencia]="cita.frecuencia" [corto]="true" /> }</p>
                      <p class="text-xs text-neutral-500">{{ cita.phone ? telefono(cita.phone) : 'Sin celular' }}</p>
                    </td>
                    <td class="text-neutral-300">{{ cita.serviceName || 'Sin servicio' }}</td>
                    <td class="text-neutral-300">{{ cita.barberoNombre || 'Cualquiera' }}</td>
                    <td><span [class]="claseEstado(cita)">{{ etiqueta(cita) }}</span></td>
                    <td>
                      <div class="flex justify-end gap-2">
                        @if (esActiva(cita.estado)) {
                          <button type="button" (click)="completando = cita" class="boton-icono !text-emerald-300 hover:!border-emerald-500/40" aria-label="Marcar como hecho" title="Hecho"><app-icono nombre="check" class="h-4 w-4" [grosor]="2.4" /></button>
                          <button type="button" (click)="marcarNoAsistio(cita)" class="boton-icono" aria-label="Marcar que no asistió" title="No asistió"><app-icono nombre="ausente" class="h-4 w-4" [grosor]="1.8" /></button>
                        }
                        <button type="button" (click)="abrirModalEditar(cita)" class="boton-icono" aria-label="Editar o mover la cita" title="Editar o mover"><app-icono nombre="editar" class="h-4 w-4" [grosor]="1.8" /></button>
                        <button type="button" (click)="eliminarCita(cita)" class="boton-icono peligro" aria-label="Eliminar la cita" title="Eliminar"><app-icono nombre="papelera" class="h-4 w-4" [grosor]="1.8" /></button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="!py-10 text-center text-neutral-500">No hay citas registradas.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>

    <!-- Editar o mover una cita -->
    @if (modalCitaVisible && citaEditando) {
      <div class="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="editar-cita">
        <div class="absolute inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200" (click)="cerrarModal()"></div>
        <form (ngSubmit)="guardarCita()" class="relative w-full rounded-t-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-300 sm:max-w-md sm:rounded-3xl sm:p-7">
          <p class="rotulo mb-2">{{ citaEditando.serviceName }}</p>
          <h3 id="editar-cita" class="text-xl font-black">Editar o mover la cita</h3>
          <div class="mt-6 space-y-4">
            <label class="block">
              <span class="etiqueta">Cliente</span>
              <input type="text" name="userName" [(ngModel)]="edicion.userName" maxlength="120" class="campo">
            </label>
            <label class="block">
              <span class="etiqueta">Celular</span>
              <input type="tel" name="phone" [(ngModel)]="edicion.phone" maxlength="25" inputmode="numeric" class="campo">
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="etiqueta">Fecha</span>
                <input type="date" name="dia" [(ngModel)]="edicion.dia" class="campo [color-scheme:dark]">
              </label>
              <label class="block">
                <span class="etiqueta">Hora</span>
                <select name="minutos" [(ngModel)]="edicion.minutos" class="campo [color-scheme:dark]">
                  @for (opcion of opcionesHora(); track opcion.minutos) {
                    <option [ngValue]="opcion.minutos">{{ opcion.etiqueta }}</option>
                  }
                </select>
              </label>
            </div>
            @if (citaEditando.recurrenciaId) {
              <p class="ayuda">Es un turno de una agenda recurrente: solo cambia este día y no se envían correos. Para cambiar todos sus turnos, edita la agenda en Recurrentes.</p>
            } @else {
              <p class="ayuda">Si cambias el día o la hora, al cliente y al barbero les llega el aviso por correo.</p>
            }
          </div>
          <div class="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" (click)="cerrarModal()" class="boton-linea">Cancelar</button>
            <button type="submit" [disabled]="guardando" class="boton-acento">{{ guardando ? 'Guardando…' : 'Guardar cambios' }}</button>
          </div>
        </form>
      </div>
    }

    <!-- Registrar una cita que llegó por WhatsApp, por teléfono o en el local -->
    @if (nuevaVisible) {
      <div class="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="nueva-cita">
        <div class="absolute inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200" (click)="cerrarNuevaCita()"></div>
        <form (ngSubmit)="guardarNuevaCita()" class="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-300 sm:max-w-lg sm:rounded-3xl sm:p-7">
          <p class="rotulo mb-2">Agenda</p>
          <h3 id="nueva-cita" class="text-xl font-black">Nueva cita</h3>
          <p class="mt-1 text-sm text-neutral-400">Para las citas que te piden por WhatsApp, por teléfono o en el local.</p>

          <div class="mt-6 space-y-4">
            <label class="block">
              <span class="etiqueta">Cliente</span>
              <input type="text" name="nuevaNombre" [(ngModel)]="nueva.userName" maxlength="120" required autocomplete="off" class="campo"
                     [class.campo-error]="intentoNueva && !nueva.userName.trim()" placeholder="Nombre y apellido">
            </label>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block">
                <span class="etiqueta">Celular (opcional)</span>
                <input type="tel" name="nuevaCelular" [(ngModel)]="nueva.phone" maxlength="25" inputmode="numeric" autocomplete="off" class="campo"
                       [class.campo-error]="intentoNueva && !celularNuevoValido" placeholder="300 123 4567">
                @if (intentoNueva && !celularNuevoValido) { <span class="texto-error">10 dígitos, empezando por 3.</span> }
              </label>
              <label class="block">
                <span class="etiqueta">Correo (opcional)</span>
                <input type="email" name="nuevaCorreo" [(ngModel)]="nueva.userEmail" maxlength="120" autocomplete="off" class="campo"
                       [class.campo-error]="intentoNueva && !correoNuevoValido" placeholder="cliente@correo.com">
                @if (intentoNueva && !correoNuevoValido) { <span class="texto-error">Revisa el correo.</span> }
              </label>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block">
                <span class="etiqueta">Barbero</span>
                <select name="nuevaBarbero" [(ngModel)]="nueva.barberoId" (ngModelChange)="calcularHorasNuevas()" class="campo [color-scheme:dark]">
                  @for (b of barberos; track b.id) {
                    <option [ngValue]="b.id">{{ b.nombre }}</option>
                  }
                </select>
              </label>
              <label class="block">
                <span class="etiqueta">Servicio</span>
                <select name="nuevaServicio" [(ngModel)]="nueva.servicioId" (ngModelChange)="calcularHorasNuevas()" class="campo [color-scheme:dark]">
                  @for (s of servicios; track s.id) {
                    <option [ngValue]="s.id">{{ s.nombre }} · {{ duracion(s) }} min</option>
                  }
                </select>
              </label>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="etiqueta">Fecha</span>
                <input type="date" name="nuevaDia" [(ngModel)]="nueva.dia" (ngModelChange)="escucharDiaNuevo()" required class="campo [color-scheme:dark]">
              </label>
              <label class="block">
                <span class="etiqueta">Hora</span>
                <select name="nuevaMinutos" [(ngModel)]="nueva.minutos" [disabled]="horasNuevas.length === 0" class="campo [color-scheme:dark]"
                        [class.campo-error]="intentoNueva && nueva.minutos === null">
                  @if (nueva.minutos === null) { <option [ngValue]="null" disabled>{{ cargandoHorasNuevas ? 'Cargando…' : 'Elige' }}</option> }
                  @for (opcion of horasNuevas; track opcion.minutos) {
                    <option [ngValue]="opcion.minutos">{{ opcion.etiqueta }}</option>
                  }
                </select>
              </label>
            </div>
            @if (!cargandoHorasNuevas && horasNuevas.length === 0 && nueva.dia) {
              <p class="texto-error !mt-0">{{ barberoNuevo?.nombre ?? 'El barbero' }} no tiene horas libres ese día para este servicio.</p>
            }
            @for (aviso of avisosNuevaCita; track aviso) {
              <p class="flex items-start gap-2 text-xs font-semibold text-detalle-200"><app-icono nombre="alerta" class="mt-px h-4 w-4 shrink-0" [grosor]="1.8" /> {{ aviso }}</p>
            }
            <p class="ayuda">Solo se ofrecen las horas en que el barbero no tiene otra cita ni un rato cerrado. Al barbero le llega el aviso por correo{{ correoNuevoLleno ? ', y al cliente la confirmación' : '' }}.</p>
          </div>

          <div class="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" (click)="cerrarNuevaCita()" class="boton-linea">Cancelar</button>
            <button type="submit" [disabled]="guardandoNueva" class="boton-acento">{{ guardandoNueva ? 'Agendando…' : 'Agendar cita' }}</button>
          </div>
        </form>
      </div>
    }

    @if (completando) {
      <app-completar-cita [cita]="completando" (cerrar)="completando = null" />
    }
  `,
})
export class AdminCitasComponent {
  private citasService = inject(CitasService);
  private ajustes = inject(AjustesService);
  private notificaciones = inject(NotificationService);
  private confirmar = inject(ConfirmarService);

  readonly esActiva = esActiva;
  /** Horas del selector: las del horario vigente y, si la cita está fuera de él, también la suya. */
  opcionesHora() {
    const opciones = opcionesDeHora(this.ajustes.horario());
    const actual = this.edicion.minutos;
    if (opciones.some(o => o.minutos === actual)) return opciones;
    return [...opciones, { minutos: actual, etiqueta: formatearHora12(actual) }].sort((a, b) => a.minutos - b.minutos);
  }
  /** Cita que se está marcando como completada (pide el valor cobrado). */
  completando: Cita | null = null;

  vista: 'calendario' | 'lista' = 'calendario';
  fechaActual = new Date();
  diaSeleccionado = claveDia(new Date());

  private todasLasCitas: Cita[] = [];
  citasOrdenadas: Cita[] = [];
  citasDelDiaSeleccionado: Cita[] = [];
  diasCalendario: DiaCalendario[] = [];

  // Para edición
  modalCitaVisible = false;
  guardando = false;
  citaEditando: Cita | null = null;
  edicion = { userName: '', phone: '', dia: '', minutos: 0 };

  // Para agendar una cita desde el panel
  barberos: BarberoPublico[] = [];
  servicios: Servicio[] = [];
  nuevaVisible = false;
  guardandoNueva = false;
  intentoNueva = false;
  cargandoHorasNuevas = false;
  nueva = this.nuevaVacia();
  horasNuevas: { minutos: number; etiqueta: string }[] = [];
  private ocupadosNuevo: ReadonlySet<string> = new Set();
  private escuchaSlots?: Subscription;

  constructor() {
    this.diasCalendario = this.construirCalendario();
    this.citasService.todas().pipe(takeUntilDestroyed()).subscribe({
      next: citas => {
        this.todasLasCitas = citas;
        this.recalcular();
      },
      error: error => console.error('Error cargando citas', error),
    });
    inject(BarberosService).listar().pipe(takeUntilDestroyed()).subscribe(barberos => {
      this.barberos = barberos;
      if (this.nuevaVisible) this.calcularHorasNuevas();
    });
    inject(ServiciosService).actuales().pipe(takeUntilDestroyed()).subscribe(servicios => {
      this.servicios = servicios;
      if (this.nuevaVisible) this.calcularHorasNuevas();
    });
    inject(DestroyRef).onDestroy(() => this.escuchaSlots?.unsubscribe());
  }

  get fechaSeleccionada(): Date {
    return fechaDesdeClave(this.diaSeleccionado);
  }

  get nombreMesActual(): string {
    return MESES[this.fechaActual.getMonth()];
  }

  get anioActual(): number {
    return this.fechaActual.getFullYear();
  }

  activasDe(dia: DiaCalendario): number {
    return dia.citas.filter(c => c.estado !== 'cancelada').length;
  }

  etiqueta(cita: Cita): string {
    return etiquetaEstado(cita, 'equipo');
  }

  claseEstado(cita: Cita): string {
    switch (cita.estado) {
      case 'completada': return 'chip-ok';
      case 'no-asistio': return 'chip-mal';
      case 'cancelada': return 'chip-neutro';
      default: return 'chip-activa';
    }
  }

  whatsapp(telefono: string): string {
    return enlaceWhatsApp(telefono);
  }

  telefono(telefono: string): string {
    return formatoCelular(telefono);
  }

  seleccionarDia(clave: string) {
    this.diaSeleccionado = clave;
    this.citasDelDiaSeleccionado = this.citasOrdenadas.filter(c => diaDeCita(c) === clave);
  }

  cambiarMes(delta: number) {
    this.fechaActual = new Date(this.fechaActual.getFullYear(), this.fechaActual.getMonth() + delta, 1);
    this.diasCalendario = this.construirCalendario();
  }

  /** Se recalcula solo cuando cambian las citas o el mes, no en cada ciclo de detección de cambios. */
  private recalcular() {
    this.citasOrdenadas = [...this.todasLasCitas].sort(compararCitas);
    this.seleccionarDia(this.diaSeleccionado);
    this.diasCalendario = this.construirCalendario();
  }

  private construirCalendario(): DiaCalendario[] {
    const year = this.fechaActual.getFullYear();
    const month = this.fechaActual.getMonth();
    const primerDia = new Date(year, month, 1);
    const hoy = claveDia(new Date());

    const porDia = new Map<string, Cita[]>();
    for (const cita of this.citasOrdenadas) {
      const clave = diaDeCita(cita);
      porDia.set(clave, [...(porDia.get(clave) ?? []), cita]);
    }

    // 6 semanas completas, empezando el domingo anterior al día 1.
    return Array.from({ length: 42 }, (_, i) => {
      const fecha = new Date(year, month, 1 - primerDia.getDay() + i);
      const clave = claveDia(fecha);
      const esOtroMes = fecha.getMonth() !== month;
      return {
        fecha,
        clave,
        esOtroMes,
        esHoy: clave === hoy,
        citas: esOtroMes ? [] : porDia.get(clave) ?? [],
      };
    });
  }

  async eliminarCita(cita: Cita) {
    const seguro = await this.confirmar.preguntar(cita.recurrenciaId
      ? {
          titulo: '¿Quitar este turno recurrente?',
          texto: `${cita.userName}, ${cita.horaStr}. Solo se quita este día (la hora queda libre); la agenda recurrente sigue con los demás. Si el cliente no vino, es mejor marcar "No asistió".`,
          aceptar: 'Sí, quitarlo',
          peligro: true,
        }
      : {
          titulo: '¿Eliminar esta cita?',
          texto: `${cita.userName}, ${cita.horaStr}. Se borra del todo y no cuenta en cortes ni ganancias. Si el cliente canceló, es mejor dejarla como cancelada.`,
          aceptar: 'Sí, eliminar',
          peligro: true,
        });
    if (!seguro) return;
    try {
      await this.citasService.eliminar(cita);
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo eliminar la cita');
    }
  }

  abrirModalEditar(cita: Cita) {
    this.citaEditando = cita;
    this.edicion = {
      userName: cita.userName ?? '',
      phone: cita.phone ?? '',
      dia: diaDeCita(cita),
      minutos: minutosDeCita(cita),
    };
    this.modalCitaVisible = true;
  }

  cerrarModal() {
    this.modalCitaVisible = false;
    this.citaEditando = null;
  }

  async guardarCita() {
    if (!this.citaEditando || !this.edicion.dia) return;
    try {
      this.guardando = true;
      await this.citasService.actualizar(this.citaEditando, this.edicion);
      this.cerrarModal();
    } catch (e) {
      if (e instanceof HorarioNoDisponibleError) {
        this.notificaciones.error('Horario ocupado', 'El barbero ya tiene otra cita o cerró ese rato.');
      } else {
        console.error(e);
        this.notificaciones.error('No se pudo actualizar la cita');
      }
    } finally {
      this.guardando = false;
    }
  }

  // --- Nueva cita desde el panel ---

  private nuevaVacia() {
    return { userName: '', phone: '', userEmail: '', barberoId: '', servicioId: '', dia: '', minutos: null as number | null };
  }

  duracion(servicio: Servicio): number {
    return duracionDe(servicio);
  }

  get barberoNuevo(): BarberoPublico | undefined {
    return this.barberos.find(b => b.id === this.nueva.barberoId);
  }

  get servicioNuevo(): Servicio | undefined {
    return this.servicios.find(s => s.id === this.nueva.servicioId);
  }

  get celularNuevoValido(): boolean {
    return !this.nueva.phone.trim() || esCelularValido(this.nueva.phone);
  }

  get correoNuevoLleno(): boolean {
    return !!this.nueva.userEmail.trim();
  }

  get correoNuevoValido(): boolean {
    return !this.correoNuevoLleno || CORREO_VALIDO.test(this.nueva.userEmail.trim());
  }

  /** Lo que conviene saber antes de agendar, sin impedirlo: el admin puede atender fuera del horario. */
  get avisosNuevaCita(): string[] {
    const { dia, minutos } = this.nueva;
    if (!DIA_VALIDO.test(dia)) return [];
    const horario = this.ajustes.horario();
    const avisos: string[] = [];
    if (dia < claveDia(new Date())) avisos.push('Es un día que ya pasó. La cita queda registrada, sin avisos por correo.');
    if (estaCerrado(dia, horario)) avisos.push('La barbería está cerrada ese día.');
    else if (minutos !== null && minutos < aperturaDe(horario, fechaDesdeClave(dia).getDay())) avisos.push('Es antes de la hora en que abre la barbería ese día.');
    const barbero = this.barberoNuevo;
    if (barbero && barbero.diasLibres?.includes(fechaDesdeClave(dia).getDay())) {
      avisos.push(`Es el día libre de ${barbero.nombre}.`);
    } else if (barbero && minutos !== null && this.servicioNuevo && !trabaja(barbero, dia, minutos, duracionDe(this.servicioNuevo))) {
      avisos.push(`Se cruza con el descanso de ${barbero.nombre}.`);
    }
    return avisos;
  }

  abrirNuevaCita(dia = claveDia(new Date())) {
    this.nueva = {
      ...this.nuevaVacia(),
      dia,
      barberoId: this.barberos[0]?.id ?? '',
      servicioId: this.servicios[0]?.id ?? '',
    };
    this.intentoNueva = false;
    this.nuevaVisible = true;
    this.escucharDiaNuevo();
  }

  cerrarNuevaCita() {
    this.nuevaVisible = false;
    this.escuchaSlots?.unsubscribe();
    this.escuchaSlots = undefined;
  }

  /** Escucha los bloques ocupados del día elegido: si alguien reserva mientras el admin llena el formulario, esa hora desaparece. */
  escucharDiaNuevo() {
    this.escuchaSlots?.unsubscribe();
    this.ocupadosNuevo = new Set();
    const dia = this.nueva.dia;
    this.cargandoHorasNuevas = DIA_VALIDO.test(dia);
    this.calcularHorasNuevas();
    if (!this.cargandoHorasNuevas) return;
    this.escuchaSlots = this.citasService.slotsOcupados(dia).subscribe({
      next: ocupados => {
        this.ocupadosNuevo = ocupados;
        this.cargandoHorasNuevas = false;
        this.calcularHorasNuevas();
      },
      error: error => {
        console.error('Error cargando la agenda del día', error);
        this.cargandoHorasNuevas = false;
        this.calcularHorasNuevas();
      },
    });
  }

  /** Horas cada 20 min del horario en que el barbero tiene libres todos los bloques del servicio. */
  calcularHorasNuevas() {
    const { barberoId, dia } = this.nueva;
    const servicio = this.servicioNuevo;
    const horario = this.ajustes.horario();
    if (this.cargandoHorasNuevas || !barberoId || !servicio || !DIA_VALIDO.test(dia)) {
      this.horasNuevas = [];
    } else {
      const duracion = duracionDe(servicio);
      this.horasNuevas = opcionesDeHora(horario).filter(o =>
        o.minutos + duracion <= horario.cierre && estaLibre(barberoId, dia, o.minutos, duracion, this.ocupadosNuevo));
    }
    if (!this.horasNuevas.some(o => o.minutos === this.nueva.minutos)) this.nueva.minutos = null;
  }

  async guardarNuevaCita() {
    this.intentoNueva = true;
    const { dia, minutos } = this.nueva;
    const servicio = this.servicioNuevo;
    const barbero = this.barberoNuevo;
    if (!this.nueva.userName.trim() || !this.celularNuevoValido || !this.correoNuevoValido
      || !servicio || !barbero || !DIA_VALIDO.test(dia) || minutos === null) {
      this.notificaciones.error('Revisa la cita', 'Completa el cliente, el barbero, el servicio, la fecha y la hora.');
      return;
    }
    const datos: NuevaCita = {
      userId: '',
      userName: this.nueva.userName.trim().slice(0, 120),
      userEmail: this.nueva.userEmail.trim(),
      phone: this.nueva.phone.trim() ? limpiarCelular(this.nueva.phone) : '',
      servicioId: servicio.id!,
      serviceName: servicio.nombre,
      precio: servicio.precio,
      duracionMinutos: duracionDe(servicio),
      barberoId: barbero.id!,
      barberoNombre: barbero.nombre.slice(0, 80),
      dia,
      hora: minutosAHora24(minutos),
      horaStr: formatearHora12(minutos),
      fecha: fechaDesdeClave(dia, minutos).toISOString(),
    };
    try {
      this.guardandoNueva = true;
      await this.citasService.registrarDesdePanel(datos);
      this.cerrarNuevaCita();
      // Deja a la vista el día de la cita nueva.
      this.fechaActual = fechaDesdeClave(dia);
      this.diasCalendario = this.construirCalendario();
      this.seleccionarDia(dia);
      this.notificaciones.exito('Cita agendada', `${datos.userName}, ${datos.horaStr} con ${datos.barberoNombre}.`);
    } catch (e) {
      if (e instanceof HorarioNoDisponibleError) {
        this.notificaciones.error('Horario ocupado', 'Esa hora se acaba de ocupar. Elige otra.');
      } else {
        console.error(e);
        this.notificaciones.error('No se pudo agendar la cita');
      }
    } finally {
      this.guardandoNueva = false;
    }
  }

  async marcarNoAsistio(cita: Cita) {
    if (new Date() < inicioDeCita(cita)) {
      this.notificaciones.error('Aún no es la hora', `No se puede marcar "No asistió" antes de la hora de la cita (${cita.horaStr}).`);
      return;
    }
    const seguro = await this.confirmar.preguntar({ titulo: '¿El cliente no asistió?', texto: `${cita.userName}, ${cita.horaStr}.`, aceptar: 'Sí, no asistió' });
    if (!seguro) return;
    try {
      await this.citasService.cambiarEstado(cita, 'no-asistio');
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo actualizar el estado');
    }
  }
}
