import { CompletarCitaComponent } from '../../../shared/components/completar-cita/completar-cita.component';
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CitasService, HorarioNoDisponibleError } from '../../../core/services/citas.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Cita, EstadoCita, esActiva } from '../../../core/models/cita.model';
import {
  claveDia, compararCitas, diaDeCita, fechaDesdeClave, inicioDeCita, minutosDeCita, opcionesDeHora,
} from '../../../core/utils/horario';

interface DiaCalendario {
  fecha: Date;
  clave: string;
  esOtroMes: boolean;
  esHoy: boolean;
  citas: Cita[];
}

@Component({
  selector: 'app-admin-citas',
  standalone: true,
  imports: [CommonModule, FormsModule, CompletarCitaComponent],
  template: `
    <div class="animate-in fade-in duration-500 pb-20">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 class="text-3xl md:text-4xl font-black text-white">Gestión de Citas</h2>
          <p class="text-neutral-400 mt-2 text-lg">Visualiza y gestiona las reservas de tus clientes.</p>
        </div>
        
        <!-- Toggle View & Calendar Controls -->
        <div class="flex flex-col sm:flex-row items-center gap-4">
          <!-- Vista Toggle -->
          <div class="flex bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden p-1">
            <button (click)="vista = 'calendario'" [class.bg-neutral-700]="vista === 'calendario'" [class.text-white]="vista === 'calendario'" class="px-4 py-2 rounded-lg text-neutral-400 font-medium transition-colors text-sm">
              Calendario
            </button>
            <button (click)="vista = 'lista'" [class.bg-neutral-700]="vista === 'lista'" [class.text-white]="vista === 'lista'" class="px-4 py-2 rounded-lg text-neutral-400 font-medium transition-colors text-sm">
              Lista
            </button>
          </div>

          @if (vista === 'calendario') {
            <div class="flex items-center gap-4 bg-neutral-900 border border-neutral-800 p-1.5 rounded-xl">
              <button (click)="cambiarMes(-1)" class="p-2 text-neutral-400 hover:text-acento-500 transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
              </button>
              <span class="text-white font-bold w-32 text-center uppercase tracking-widest text-sm">{{ nombreMesActual }} {{ anioActual }}</span>
              <button (click)="cambiarMes(1)" class="p-2 text-neutral-400 hover:text-acento-500 transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
              </button>
            </div>
          }
        </div>
      </div>

      @if (vista === 'calendario') {
        <div class="flex flex-col xl:flex-row gap-6">
          <!-- Calendario Grid -->
          <div class="flex-grow bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl h-fit">
            
            <!-- Días de la semana -->
            <div class="grid grid-cols-7 border-b border-neutral-800 bg-neutral-950">
              @for (d of ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']; track d) {
                <div class="py-3 text-center text-[10px] font-black uppercase tracking-widest text-neutral-500">{{ d }}</div>
              }
            </div>
            
            <!-- Días del mes -->
            <div class="grid grid-cols-7 auto-rows-[80px] md:auto-rows-[100px] bg-neutral-800 gap-[1px]">
              @for (dia of diasCalendario; track dia.clave) {
                <div 
                  class="bg-neutral-900 p-1 md:p-2 transition-colors cursor-pointer relative group overflow-hidden"
                  [class.opacity-50]="dia.esOtroMes"
                  [class.bg-neutral-800]="dia.esHoy && dia.clave !== diaSeleccionado"
                  [class.ring-2]="dia.clave === diaSeleccionado"
                  [class.ring-acento-500]="dia.clave === diaSeleccionado"
                  [class.z-10]="dia.clave === diaSeleccionado"
                  (click)="seleccionarDia(dia.clave)"
                >
                  <span 
                    class="inline-flex w-6 h-6 md:w-7 md:h-7 items-center justify-center rounded-full text-sm font-bold mb-1"
                    [class.bg-acento-500]="dia.esHoy || dia.clave === diaSeleccionado"
                    [class.text-black]="dia.esHoy || dia.clave === diaSeleccionado"
                    [class.text-white]="!dia.esHoy && dia.clave !== diaSeleccionado"
                  >
                    {{ dia.fecha.getDate() }}
                  </span>
                  
                  <!-- Citas Reales Dots -->
                  @if (!dia.esOtroMes && dia.citas.length > 0) {
                    <div class="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
                      @for (cita of dia.citas; track cita.id) {
                        <div class="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full" [class.bg-acento-500]="cita.estado !== 'cancelada'" [class.bg-neutral-600]="cita.estado === 'cancelada'" title="{{ cita.horaStr }}"></div>
                      }
                    </div>
                    <div class="absolute bottom-1 right-2 text-[10px] text-neutral-500 font-bold block md:hidden">{{ dia.citas.length }}</div>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Panel Lateral de Citas del Día -->
          <div class="w-full xl:w-96 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl h-fit">
            <h3 class="text-xl font-black text-white mb-4">Citas: {{ fechaSeleccionada | date:'dd/MM/yyyy' }}</h3>
            
            @if (citasDelDiaSeleccionado.length === 0) {
              <div class="text-center py-10 bg-neutral-950 rounded-xl border border-neutral-800">
                <p class="text-neutral-500 font-medium">No hay citas para este día.</p>
              </div>
            } @else {
              <div class="space-y-4">
                @for (cita of citasDelDiaSeleccionado; track cita.id) {
                  <div class="bg-neutral-950 border border-neutral-800 rounded-xl p-4 hover:border-neutral-700 transition-colors">
                    <div class="flex justify-between items-start mb-2">
                      <div>
                        <span class="inline-block bg-acento-500/10 text-acento-500 text-xs font-black px-2 py-1 rounded mb-2">{{ cita.horaStr }}</span>
                        <h4 class="text-white font-bold">{{ cita.userName || 'Cliente' }}</h4>
                        <p class="text-neutral-400 text-sm flex items-center gap-1 mt-1">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                          {{ cita.phone || 'Sin teléfono' }}
                        </p>
                      </div>
                      <div class="flex flex-col gap-2">
                        @if (esActiva(cita.estado)) {
                          <div class="flex gap-2">
                            <button (click)="completando = cita" class="text-green-400 hover:text-green-300 bg-green-400/10 p-2 rounded-lg transition-colors flex-1" title="Completado">
                              <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                            </button>
                            <button (click)="marcarNoAsistio(cita)" class="text-neutral-400 hover:text-red-500 bg-neutral-400/10 hover:bg-red-500/10 p-2 rounded-lg transition-colors flex-1" title="No Asistió">
                              <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
                            </button>
                          </div>
                        } @else {
                          <span class="text-[10px] font-black uppercase text-center px-2 py-1 rounded w-full"
                             [ngClass]="{
                               'bg-red-500/10 text-red-500': cita.estado === 'no-asistio',
                               'bg-green-500/10 text-green-500': cita.estado === 'completada',
                               'bg-neutral-500/10 text-neutral-400': cita.estado === 'cancelada'
                             }">
                            {{ cita.estado }}
                          </span>
                        }
                        <div class="flex gap-2">
                          <button (click)="abrirModalEditar(cita)" class="text-blue-400 hover:text-blue-300 bg-blue-400/10 p-2 rounded-lg transition-colors flex-1">
                            <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                          </button>
                          <button (click)="eliminarCita(cita)" class="text-red-400 hover:text-red-300 bg-red-400/10 p-2 rounded-lg transition-colors flex-1">
                            <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div class="mt-3 pt-3 border-t border-neutral-800 text-sm">
                      <p class="text-neutral-400"><strong>Servicio:</strong> <span class="text-white">{{ cita.serviceName || 'No especificado' }}</span></p>
                      <p class="text-neutral-400"><strong>Barbero:</strong> <span class="text-acento-500">{{ cita.barberoNombre || 'Cualquiera' }}</span></p>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }

      @if (vista === 'lista') {
        <!-- Vista de Lista Completa -->
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm text-neutral-400">
              <thead class="text-xs uppercase bg-neutral-950 text-neutral-500 font-black tracking-wider">
                <tr>
                  <th class="px-6 py-4">Fecha y Hora</th>
                  <th class="px-6 py-4">Cliente</th>
                  <th class="px-6 py-4">Servicio</th>
                  <th class="px-6 py-4">Barbero</th>
                  <th class="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-neutral-800">
                @for (cita of citasOrdenadas; track cita.id) {
                  <tr class="hover:bg-neutral-800/50 transition-colors">
                    <td class="px-6 py-4 whitespace-nowrap">
                      <div class="text-white font-bold">{{ cita.fecha | date:'dd/MM/yyyy' }}</div>
                      <div class="text-acento-500 font-medium text-xs">{{ cita.horaStr }}</div>
                    </td>
                    <td class="px-6 py-4">
                      <div class="text-white font-bold">{{ cita.userName }}</div>
                      <div class="text-neutral-500 text-xs">{{ cita.phone || '-' }}</div>
                    </td>
                    <td class="px-6 py-4">
                      <span class="bg-neutral-800 px-2 py-1 rounded text-xs text-white">{{ cita.serviceName || 'N/A' }}</span>
                    </td>
                    <td class="px-6 py-4">
                      <span class="text-acento-500">{{ cita.barberoNombre || 'Cualquiera' }}</span>
                    </td>
                    <td class="px-6 py-4 text-right">
                      <div class="flex justify-end gap-2">
                        @if (esActiva(cita.estado)) {
                          <button (click)="completando = cita" class="text-green-400 hover:text-green-300 bg-green-400/10 p-2 rounded-lg transition-colors" title="Marcar como Completado">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                          </button>
                          <button (click)="marcarNoAsistio(cita)" class="text-neutral-400 hover:text-red-500 bg-neutral-400/10 hover:bg-red-500/10 p-2 rounded-lg transition-colors" title="No Asistió">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
                          </button>
                        } @else {
                          <span class="text-xs px-2 py-1 rounded"
                             [ngClass]="{
                               'bg-red-500/10 text-red-500': cita.estado === 'no-asistio',
                               'bg-green-500/10 text-green-500': cita.estado === 'completada',
                               'bg-neutral-500/10 text-neutral-400': cita.estado === 'cancelada'
                             }">
                            {{ cita.estado }}
                          </span>
                        }
                        <button (click)="abrirModalEditar(cita)" class="text-blue-400 hover:text-blue-300 bg-blue-400/10 p-2 rounded-lg transition-colors">
                          Editar
                        </button>
                        <button (click)="eliminarCita(cita)" class="text-red-400 hover:text-red-300 bg-red-400/10 p-2 rounded-lg transition-colors">
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                }
                @if (citasOrdenadas.length === 0) {
                  <tr>
                    <td colspan="5" class="px-6 py-8 text-center text-neutral-500">
                      No hay citas registradas.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>

    <!-- Modal para Editar Cita -->
    @if (modalCitaVisible && citaEditando) {
      <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
          <div class="p-6 border-b border-neutral-800 flex justify-between items-center">
            <h3 class="text-xl font-black text-white">Editar Reserva</h3>
            <button (click)="cerrarModal()" class="text-neutral-400 hover:text-white">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-bold text-neutral-400 uppercase mb-2">Cliente</label>
              <input type="text" [(ngModel)]="edicion.userName" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white focus:border-acento-500 outline-none">
            </div>
            <div>
              <label class="block text-xs font-bold text-neutral-400 uppercase mb-2">Teléfono</label>
              <input type="text" [(ngModel)]="edicion.phone" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white focus:border-acento-500 outline-none">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-neutral-400 uppercase mb-2">Fecha</label>
                <input type="date" [(ngModel)]="edicion.dia" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white focus:border-acento-500 outline-none [color-scheme:dark]">
              </div>
              <div>
                <label class="block text-xs font-bold text-neutral-400 uppercase mb-2">Hora</label>
                <select [(ngModel)]="edicion.minutos" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white focus:border-acento-500 outline-none [color-scheme:dark]">
                  @for (opcion of opcionesHora; track opcion.minutos) {
                    <option [ngValue]="opcion.minutos">{{ opcion.etiqueta }}</option>
                  }
                </select>
              </div>
            </div>
          </div>
          <div class="p-6 bg-neutral-950 border-t border-neutral-800 flex justify-end gap-3">
            <button (click)="cerrarModal()" class="px-6 py-2.5 rounded-xl font-bold text-neutral-300 hover:bg-neutral-800 transition-colors">Cancelar</button>
            <button (click)="guardarCita()" [disabled]="guardando" class="disabled:opacity-50 px-6 py-2.5 rounded-xl font-bold text-black bg-acento-500 hover:bg-acento-400 transition-colors">Guardar Cambios</button>
          </div>
        </div>
      </div>
    }

    @if (completando) {
      <app-completar-cita [cita]="completando" (cerrar)="completando = null" />
    }
  `,
  styles: [`
    .scrollbar-hide::-webkit-scrollbar { display: none; }
    .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
  `]
})
export class AdminCitasComponent {
  private citasService = inject(CitasService);
  private notificaciones = inject(NotificationService);

  readonly esActiva = esActiva;
  readonly opcionesHora = opcionesDeHora();
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

  constructor() {
    this.diasCalendario = this.construirCalendario();
    this.citasService.todas().pipe(takeUntilDestroyed()).subscribe({
      next: citas => {
        this.todasLasCitas = citas;
        this.recalcular();
      },
      error: error => console.error('Error cargando citas', error),
    });
  }

  get fechaSeleccionada(): Date {
    return fechaDesdeClave(this.diaSeleccionado);
  }

  get nombreMesActual(): string {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[this.fechaActual.getMonth()];
  }

  get anioActual(): number {
    return this.fechaActual.getFullYear();
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
    if (!confirm('¿Estás seguro de que deseas eliminar esta reserva?')) return;
    try {
      await this.citasService.eliminar(cita);
    } catch (e) {
      console.error(e);
      this.notificaciones.error('Error al eliminar la cita');
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
        this.notificaciones.error('Horario ocupado', 'El barbero ya tiene otra cita en ese horario.');
      } else {
        console.error(e);
        this.notificaciones.error('Error al actualizar la cita');
      }
    } finally {
      this.guardando = false;
    }
  }

  async marcarEstado(cita: Cita, estado: EstadoCita) {
    if (!confirm(`¿Confirmar marcar este turno como ${estado}?`)) return;
    try {
      await this.citasService.cambiarEstado(cita, estado);
    } catch (e) {
      console.error(e);
      this.notificaciones.error('Error al actualizar el estado');
    }
  }

  marcarNoAsistio(cita: Cita) {
    if (new Date() < inicioDeCita(cita)) {
      this.notificaciones.error('Aún no es la hora', `No puedes marcar "No asistió" antes de la hora estipulada (${cita.horaStr}).`);
      return;
    }
    this.marcarEstado(cita, 'no-asistio');
  }
}
