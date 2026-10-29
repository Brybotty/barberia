import { Component, OnInit, inject, input } from '@angular/core';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { CLIENTE } from '../../../config/cliente';
import { AuthService } from '../../../core/services/auth.service';
import { CitasService, HorarioNoDisponibleError } from '../../../core/services/citas.service';
import { AjustesService } from '../../../core/services/ajustes.service';
import { BarberosService } from '../../../core/services/barberos.service';
import { ServiciosService } from '../../../core/services/servicios.service';
import { ConfirmarService } from '../../../core/services/confirmar.service';
import { NotificationService } from '../../../core/services/notification.service';
import { BARBERO_CUALQUIERA, Cita, esActiva, etiquetaEstado } from '../../../core/models/cita.model';
import { BarberoPublico, avatarDe } from '../../../core/models/barbero.model';
import { Servicio } from '../../../core/models/servicio.model';
import {
  LIMITE_DEL_EQUIPO, claveDia, compararCitas, diaDeCita, duracionDe, fechaDesdeClave, formatearHora12, inicioDeCita,
  minutosDeCita, opcionesDeHora,
} from '../../../core/utils/horario';
import { DiaDeLista, PERIODOS_LISTA, PeriodoLista, agruparPorDia, filtrarCitas, rangoLista } from '../../../core/utils/lista-citas';
import { MARCA } from '../../../core/utils/ocupacion';
import { enlaceWhatsApp, formatoCelular } from '../../../core/utils/colombia';
import { ENLACE_RESENA, pedirResenaPorWhatsApp } from '../../../core/utils/resenas';
import { CARITAS, ResumenAsistencia, claveCliente, multaParaCobrarEn, resumirAsistencia } from '../../../core/utils/asistencia';
import { nombresDeServicios, serviciosDelDia } from '../../../core/utils/servicios-del-dia';

import { CompletarCitaComponent } from '../../../shared/components/completar-cita/completar-cita.component';
import { IconoComponent } from '../../../shared/components/icono/icono.component';
import { NuevaCitaComponent } from '../../../shared/components/nueva-cita/nueva-cita.component';
import { RedSocialComponent } from '../../../shared/components/red-social/red-social.component';
import { RecurrenteComponent } from '../../../shared/components/recurrente/recurrente.component';
import { CaritaComponent } from '../../../shared/components/carita/carita.component';
import { NoAsistioComponent } from '../../../shared/components/no-asistio/no-asistio.component';
import { ServiciosDelDiaComponent } from './servicios-del-dia.component';

interface CitasDeBarbero {
  id: string;
  nombre: string;
  avatar: string;
  citas: number;
}

interface DiaCalendario {
  fecha: Date;
  clave: string;
  esOtroMes: boolean;
  esHoy: boolean;
  citas: Cita[];
  /** Las activas de cada barbero (solo viendo las de todos). */
  porBarbero: CitasDeBarbero[];
}

/** Un día de la lista, con su título ("Hoy · sábado 17 oct."). */
interface GrupoLista extends DiaDeLista {
  fecha: Date;
  esHoy: boolean;
  prefijo: string;
  formato: string;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * Las citas en calendario (mes y agenda del día) o en lista. En el panel del admin, las de toda la barbería, con
 * editar, mover y eliminar. En el del barbero (`barberoFijo`), solo las suyas y lo que las reglas le dejan: "Hecho",
 * "No asistió", escribirle al cliente y agendarse una cita nueva.
 */
@Component({
  selector: 'app-admin-citas',
  standalone: true,
  imports: [
    CurrencyPipe, DatePipe, NgClass, FormsModule, CompletarCitaComponent, IconoComponent, RedSocialComponent, RecurrenteComponent, NuevaCitaComponent,
    CaritaComponent, ServiciosDelDiaComponent, NoAsistioComponent,
  ],
  template: `
    <div class="animate-in fade-in duration-500">
      <div class="mb-8 flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h2 class="titulo-panel">{{ barberoFijo() ? 'Tus citas' : 'Citas' }}</h2>
          <p class="mt-1 text-neutral-400">{{ barberoFijo() ? 'Tus turnos, por día o en lista.' : 'Las reservas de tus clientes, por día o en lista.' }}</p>
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

      <!-- De quién son las citas que se ven (solo el admin: el barbero ya ve solo las suyas). Vale para las dos vistas. -->
      @if (!barberoFijo() && barberos.length > 1) {
        <div class="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 scrollbar-hide md:mx-0 md:px-0" role="group" aria-label="Ver las citas de">
          <button type="button" (click)="elegirBarbero('')" [attr.aria-pressed]="!filtroBarbero" class="min-h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition-colors"
                  [ngClass]="!filtroBarbero ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-400 hover:text-white'">Todos</button>
          @for (b of barberos; track b.id) {
            <button type="button" (click)="elegirBarbero(b.id!)" [attr.aria-pressed]="filtroBarbero === b.id"
                    class="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border py-1 pl-1.5 pr-4 text-sm font-bold transition-colors"
                    [ngClass]="filtroBarbero === b.id ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-400 hover:text-white'">
              <img [src]="avatarDe(b)" alt="" width="28" height="28" class="h-7 w-7 rounded-full object-cover">
              {{ b.nombre }}
              @if (b.id === miBarberoId) {
                <span class="rounded px-1.5 py-0.5 text-[11px] font-black uppercase tracking-widest"
                      [ngClass]="filtroBarbero === b.id ? 'bg-neutral-950 text-detalle-200' : 'bg-detalle-400 text-neutral-950'">Tú</span>
              }
            </button>
          }
        </div>
      }

      <!-- Qué significan las caritas que salen junto a cada cliente. -->
      <details class="group mb-5" data-leyenda-caritas>
        <summary class="inline-flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-bold text-neutral-400 transition-colors hover:text-white [&::-webkit-details-marker]:hidden">
          <app-carita [nivel]="1" /> ¿Qué dicen las caritas?
          <app-icono nombre="atras" class="h-3.5 w-3.5 -rotate-90 transition-transform group-open:rotate-90" [grosor]="2.4" />
        </summary>
        <div class="tarjeta mt-2 max-w-xl p-4">
          <ul class="grid gap-2 sm:grid-cols-2">
            @for (c of caritas; track c.nivel) {
              <li class="flex items-center gap-2 text-sm text-neutral-300"><app-carita [nivel]="c.nivel" /> {{ c.significado }}</li>
            }
          </ul>
          <p class="ayuda mt-3">Cuentan los turnos marcados "Hecho" y "No asistió" de cada cliente (lo reconoce por su celular). Si marcaste "No asistió" por error, toca "Sí vino" en esa cita.</p>
        </div>
      </details>

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
                        [attr.aria-label]="(dia.fecha | date:'EEEE d MMMM') + ', ' + activasDe(dia) + ' citas' + (limitado(dia.clave) ? ', solo algunos servicios' : '')"
                        class="relative overflow-hidden bg-neutral-950 p-1.5 text-left transition-colors hover:bg-white/[0.04] md:p-2"
                        [ngClass]="{ 'opacity-40': dia.esOtroMes, 'z-10 ring-2 ring-inset ring-detalle-400': dia.clave === diaSeleccionado }">
                  <span class="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold"
                        [ngClass]="dia.esHoy ? 'bg-acento-500 text-sobre-acento' : 'text-white'">{{ dia.fecha.getDate() }}</span>
                  @if (!dia.esOtroMes && limitado(dia.clave)) {
                    <span class="absolute right-1.5 top-1.5 text-detalle-300 md:right-2 md:top-2" [title]="'Solo se reserva ' + nombresDelDia(dia.clave)" data-dia-limitado>
                      <app-icono nombre="estrella" class="h-3.5 w-3.5 md:h-4 md:w-4" [grosor]="1.8" />
                    </span>
                  }
                  @if (!dia.esOtroMes && activasDe(dia) > 0) {
                    <span class="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1 md:bottom-2 md:left-2"
                          [ngClass]="{ 'md:hidden': dia.porBarbero.length > 0 }">
                      <span class="h-1.5 w-1.5 rounded-full bg-detalle-400"></span>
                      <span class="text-[11px] font-bold text-neutral-300">{{ activasDe(dia) }}<span class="hidden md:inline"> {{ activasDe(dia) === 1 ? 'cita' : 'citas' }}</span></span>
                    </span>
                    <!-- Con "Todos", en pantalla ancha: cuántas le tocan a cada barbero ese día. -->
                    @if (dia.porBarbero.length > 0) {
                      <span class="absolute bottom-2 left-2 right-1 hidden flex-wrap gap-x-2 gap-y-1 md:flex">
                        @for (p of dia.porBarbero; track p.id) {
                          <span class="inline-flex items-center gap-1 text-[11px] font-bold text-neutral-300" [title]="p.nombre + ': ' + p.citas">
                            <img [src]="p.avatar" alt="" width="20" height="20" class="h-5 w-5 rounded-full object-cover">{{ p.citas }}
                          </span>
                        }
                      </span>
                    }
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
                @if (barberoElegido; as b) {
                  <p class="mt-1 text-sm text-neutral-500">Solo las de {{ b.nombre }}</p>
                }
              </div>
              <button type="button" (click)="abrirNuevaCita(diaSeleccionado)" class="boton-icono" aria-label="Agendar una cita este día" title="Agendar este día">
                <app-icono nombre="mas" class="h-4 w-4" [grosor]="2.2" />
              </button>
            </div>

            <!-- Qué se reserva en línea ese día: el admin lo cambia; el barbero solo lo ve si está limitado. -->
            @if (limitado(diaSeleccionado) || (!barberoFijo() && diaSeleccionado >= hoy)) {
              <div class="mb-5 flex items-center justify-between gap-3 rounded-xl border px-3 py-2" data-servicios-del-dia
                   [ngClass]="limitado(diaSeleccionado) ? 'border-detalle-400/40 bg-detalle-500/[0.06]' : 'border-white/10'">
                <p class="flex min-w-0 items-start gap-2 text-sm">
                  <app-icono nombre="estrella" class="mt-0.5 h-4 w-4 shrink-0" [ngClass]="limitado(diaSeleccionado) ? 'text-detalle-300' : 'text-neutral-600'" [grosor]="1.8" />
                  <span [ngClass]="limitado(diaSeleccionado) ? 'text-detalle-100' : 'text-neutral-400'">
                    {{ limitado(diaSeleccionado) ? 'En línea solo se reserva ' + nombresDelDia(diaSeleccionado) : 'En línea se reservan todos los servicios' }}
                  </span>
                </p>
                @if (!barberoFijo() && diaSeleccionado >= hoy) {
                  <button type="button" (click)="serviciosDelDiaVisible = true" class="boton-linea boton-chico shrink-0">{{ limitado(diaSeleccionado) ? 'Cambiar' : 'Limitar' }}</button>
                }
              </div>
            }

            @if (citasDelDiaSeleccionado.length === 0) {
              <div class="rounded-xl border border-dashed border-white/10 py-10 text-center text-neutral-500">
                {{ barberoElegido ? barberoElegido.nombre + ' no tiene citas este día.' : 'No hay citas este día.' }}
              </div>
            } @else {
              <ul class="space-y-3">
                @for (cita of citasDelDiaSeleccionado; track cita.id) {
                  <li class="rounded-xl border border-white/10 bg-black/30 p-4" [ngClass]="{ 'opacity-55': cita.estado === 'cancelada' || cita.estado === 'no-asistio' }">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="font-display text-lg font-bold text-detalle-200">{{ cita.horaStr }}</p>
                        <p class="flex min-w-0 items-center gap-2"><span class="truncate font-bold">{{ cita.userName || 'Cliente' }}</span> <app-carita [resumen]="asistenciaDe(cita)" [conTexto]="true" /></p>
                        <p class="truncate text-sm text-neutral-500">{{ cita.serviceName || 'Sin servicio' }}</p>
                        @if (mostrarBarbero) {
                          <p class="mt-2 flex items-center gap-1.5 text-xs font-bold text-neutral-300">
                            <img [src]="avatarDeCita(cita)" alt="" width="20" height="20" class="h-5 w-5 rounded-full object-cover">{{ cita.barberoNombre || 'Cualquiera' }}
                          </p>
                        }
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
                      @if (cita.estado === 'no-asistio') {
                        <button type="button" (click)="completando = cita" class="boton-linea boton-chico" title="Si lo marcaste por error: queda como hecho">Sí vino</button>
                        @if (cita.multa) {
                          <span class="chip-mal">Multa {{ cita.multa | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                          <button type="button" (click)="quitarMulta(cita)" class="boton-linea boton-chico">Quitar multa</button>
                        }
                      }
                      @if (cita.estado === 'completada' && cita.phone && enlaceResena) {
                        <a [href]="pedirResena(cita)" target="_blank" rel="noopener" class="boton-linea boton-chico" title="Abre WhatsApp con el mensaje ya escrito">
                          <app-icono nombre="estrella" class="h-4 w-4" [grosor]="1.8" /> Pedir reseña
                        </a>
                      }
                      <span class="ml-auto flex gap-2">
                        @if (cita.phone) {
                          <a [href]="whatsapp(cita.phone)" target="_blank" rel="noopener" class="boton-icono !text-emerald-300" [attr.aria-label]="'Escribirle a ' + cita.userName + ' por WhatsApp'" [title]="telefono(cita.phone)">
                            <app-red-social red="whatsapp" class="h-4 w-4" />
                          </a>
                        }
                        @if (!barberoFijo()) {
                          <button type="button" (click)="abrirModalEditar(cita)" class="boton-icono" aria-label="Editar o mover la cita" title="Editar o mover"><app-icono nombre="editar" class="h-4 w-4" [grosor]="1.8" /></button>
                          <button type="button" (click)="eliminarCita(cita)" class="boton-icono peligro" aria-label="Eliminar la cita" title="Eliminar"><app-icono nombre="papelera" class="h-4 w-4" [grosor]="1.8" /></button>
                        }
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
        <!-- Qué días ver y a quién buscar -->
        <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="-mx-4 overflow-x-auto px-4 scrollbar-hide md:mx-0 md:px-0">
            <div class="flex w-max rounded-xl border border-white/10 p-1" role="group" aria-label="Qué días ver">
              @for (p of periodos; track p.valor) {
                <button type="button" (click)="elegirPeriodo(p.valor)" [attr.aria-pressed]="periodo === p.valor"
                        class="min-h-10 whitespace-nowrap rounded-lg px-4 text-sm font-bold transition-colors"
                        [ngClass]="periodo === p.valor ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'">{{ p.nombre }}</button>
              }
            </div>
          </div>
          <label class="relative block lg:w-80">
            <span class="sr-only">Buscar por cliente o celular</span>
            <app-icono nombre="buscar" class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" [grosor]="2" />
            <input type="search" name="buscarCita" [(ngModel)]="busqueda" (ngModelChange)="filtrarLista()" autocomplete="off" enterkeyhint="search"
                   maxlength="60" placeholder="Buscar cliente o celular" class="campo !rounded-full !py-2.5 !pl-11">
          </label>
        </div>

        <div class="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <p class="text-neutral-400" aria-live="polite">
            <span class="font-bold text-white">{{ totalLista }} {{ totalLista === 1 ? 'cita' : 'citas' }}</span>@if (barberoElegido; as b) { de {{ b.nombre }}}@if (porAtender > 0) { · {{ porAtender }} {{ periodo === 'pasadas' ? 'sin marcar' : 'por atender' }}}
          </p>
          @if (canceladas > 0) {
            <button type="button" (click)="alternarCanceladas()" [attr.aria-pressed]="verCanceladas" class="min-h-10 font-bold text-neutral-400 transition-colors hover:text-white">
              {{ verCanceladas ? 'Ocultar las canceladas' : 'Ver las canceladas (' + canceladas + ')' }}
            </button>
          }
        </div>

        @if (diasLista.length === 0) {
          <div class="tarjeta border-dashed px-6 py-10 text-center text-neutral-500">{{ mensajeVacio }}</div>
        } @else {
          <!-- Por día. Celular: tarjetas. Escritorio: tabla. -->
          <div class="space-y-6 md:hidden">
            @for (grupo of diasLista; track grupo.dia) {
              <section>
                <h3 class="mb-3 flex items-baseline justify-between gap-3 border-b border-white/10 pb-2">
                  <span class="font-display text-sm font-black capitalize tracking-wide" [ngClass]="grupo.esHoy ? 'text-detalle-200' : 'text-white'">{{ grupo.prefijo }}{{ grupo.fecha | date:grupo.formato }} </span>
                  <span class="shrink-0 text-xs font-bold text-neutral-500">{{ grupo.citas.length }} {{ grupo.citas.length === 1 ? 'cita' : 'citas' }}</span>
                </h3>
                <ul class="space-y-3">
                  @for (cita of grupo.citas; track cita.id) {
                    <li class="tarjeta p-4" [ngClass]="{ 'opacity-55': cita.estado === 'cancelada' || cita.estado === 'no-asistio' }">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <p class="font-display text-lg font-bold text-detalle-200">{{ cita.horaStr }}</p>
                          <p class="flex min-w-0 items-center gap-2"><span class="truncate font-bold">{{ cita.userName || 'Cliente' }}</span> <app-carita [resumen]="asistenciaDe(cita)" [conTexto]="true" /></p>
                          <p class="truncate text-sm text-neutral-500">{{ cita.serviceName || 'Sin servicio' }}</p>
                          @if (mostrarBarbero) {
                            <p class="mt-2 flex items-center gap-1.5 text-xs font-bold text-neutral-300">
                              <img [src]="avatarDeCita(cita)" alt="" width="20" height="20" class="h-5 w-5 rounded-full object-cover">{{ cita.barberoNombre || 'Cualquiera' }}
                            </p>
                          }
                          @if (cita.recurrenciaId) { <app-recurrente class="mt-2" [frecuencia]="cita.frecuencia" /> }
                        </div>
                        <span [class]="claseEstado(cita)">{{ etiqueta(cita) }}</span>
                      </div>
                      <div class="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
                        @if (esActiva(cita.estado)) {
                          <button type="button" (click)="completando = cita" class="boton-linea boton-chico !border-emerald-500/30 !text-emerald-300">Hecho</button>
                          <button type="button" (click)="marcarNoAsistio(cita)" class="boton-linea boton-chico">No asistió</button>
                        }
                        @if (cita.estado === 'no-asistio') {
                          <button type="button" (click)="completando = cita" class="boton-linea boton-chico">Sí vino</button>
                          @if (cita.multa) {
                            <span class="chip-mal">Multa {{ cita.multa | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                            <button type="button" (click)="quitarMulta(cita)" class="boton-linea boton-chico">Quitar multa</button>
                          }
                        }
                        <span class="ml-auto flex gap-2">
                          @if (cita.phone) {
                            <a [href]="whatsapp(cita.phone)" target="_blank" rel="noopener" class="boton-icono !text-emerald-300" [attr.aria-label]="'Escribirle a ' + cita.userName + ' por WhatsApp'" [title]="telefono(cita.phone)">
                              <app-red-social red="whatsapp" class="h-4 w-4" />
                            </a>
                          }
                          @if (!barberoFijo()) {
                            <button type="button" (click)="abrirModalEditar(cita)" class="boton-icono" aria-label="Editar o mover la cita"><app-icono nombre="editar" class="h-4 w-4" [grosor]="1.8" /></button>
                            <button type="button" (click)="eliminarCita(cita)" class="boton-icono peligro" aria-label="Eliminar la cita"><app-icono nombre="papelera" class="h-4 w-4" [grosor]="1.8" /></button>
                          }
                        </span>
                      </div>
                    </li>
                  }
                </ul>
              </section>
            }
          </div>

          <div class="tarjeta hidden overflow-hidden md:block">
            <div class="overflow-x-auto">
              <table class="tabla">
                <thead>
                  <tr><th>Hora</th><th>Cliente</th><th>Servicio</th>@if (mostrarBarbero) { <th>Barbero</th> }<th>Estado</th><th class="text-right">Acciones</th></tr>
                </thead>
                @for (grupo of diasLista; track grupo.dia) {
                  <tbody>
                    <tr class="border-t border-white/10 bg-white/[0.03]">
                      <th [attr.colspan]="mostrarBarbero ? 6 : 5" scope="colgroup" class="!py-3">
                        <span class="font-display text-sm font-black capitalize tracking-wide" [ngClass]="grupo.esHoy ? 'text-detalle-200' : 'text-white'">{{ grupo.prefijo }}{{ grupo.fecha | date:grupo.formato }} </span>
                        <span class="ml-1 text-xs font-bold text-neutral-500">· {{ grupo.citas.length }} {{ grupo.citas.length === 1 ? 'cita' : 'citas' }}</span>
                      </th>
                    </tr>
                    @for (cita of grupo.citas; track cita.id) {
                      <tr data-cita class="transition-colors hover:bg-white/[0.02]" [ngClass]="{ 'opacity-55': cita.estado === 'cancelada' || cita.estado === 'no-asistio' }">
                        <td class="whitespace-nowrap font-display font-bold text-detalle-200">{{ cita.horaStr }}</td>
                        <td>
                          <p class="flex items-center gap-2 font-bold">{{ cita.userName }} <app-carita [resumen]="asistenciaDe(cita)" /> @if (cita.recurrenciaId) { <app-recurrente [frecuencia]="cita.frecuencia" [corto]="true" /> }</p>
                          <p class="text-xs text-neutral-500">{{ cita.phone ? telefono(cita.phone) : 'Sin celular' }}</p>
                        </td>
                        <td class="text-neutral-300">{{ cita.serviceName || 'Sin servicio' }}</td>
                        @if (mostrarBarbero) {
                          <td class="text-neutral-300">
                            <span class="flex items-center gap-2 whitespace-nowrap">
                              <img [src]="avatarDeCita(cita)" alt="" width="24" height="24" class="h-6 w-6 rounded-full object-cover">{{ cita.barberoNombre || 'Cualquiera' }}
                            </span>
                          </td>
                        }
                        <td>
                          <span [class]="claseEstado(cita)">{{ etiqueta(cita) }}</span>
                          @if (cita.estado === 'no-asistio' && cita.multa) { <span class="mt-1 block whitespace-nowrap text-xs font-bold text-red-300">Multa {{ cita.multa | currency:'COP':'symbol-narrow':'1.0-0' }}</span> }
                        </td>
                        <td>
                          <div class="flex justify-end gap-2">
                            @if (esActiva(cita.estado)) {
                              <button type="button" (click)="completando = cita" class="boton-icono !text-emerald-300 hover:!border-emerald-500/40" aria-label="Marcar como hecho" title="Hecho"><app-icono nombre="check" class="h-4 w-4" [grosor]="2.4" /></button>
                              <button type="button" (click)="marcarNoAsistio(cita)" class="boton-icono" aria-label="Marcar que no asistió" title="No asistió"><app-icono nombre="ausente" class="h-4 w-4" [grosor]="1.8" /></button>
                            }
                            @if (cita.estado === 'no-asistio') {
                              <button type="button" (click)="completando = cita" class="boton-linea boton-chico" title="Si lo marcaste por error: queda como hecho">Sí vino</button>
                              @if (cita.multa) {
                                <button type="button" (click)="quitarMulta(cita)" class="boton-linea boton-chico">Quitar multa</button>
                              }
                            }
                            @if (cita.phone) {
                              <a [href]="whatsapp(cita.phone)" target="_blank" rel="noopener" class="boton-icono !text-emerald-300" [attr.aria-label]="'Escribirle a ' + cita.userName + ' por WhatsApp'" [title]="telefono(cita.phone)">
                                <app-red-social red="whatsapp" class="h-4 w-4" />
                              </a>
                            }
                            @if (!barberoFijo()) {
                              <button type="button" (click)="abrirModalEditar(cita)" class="boton-icono" aria-label="Editar o mover la cita" title="Editar o mover"><app-icono nombre="editar" class="h-4 w-4" [grosor]="1.8" /></button>
                              <button type="button" (click)="eliminarCita(cita)" class="boton-icono peligro" aria-label="Eliminar la cita" title="Eliminar"><app-icono nombre="papelera" class="h-4 w-4" [grosor]="1.8" /></button>
                            }
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                }
              </table>
            </div>
          </div>
        }
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
      @if (barberoFijo(); as fijo) {
        <app-nueva-cita [barberoFijo]="fijo" [servicios]="servicios" [dia]="diaNueva" (cerrar)="nuevaVisible = false" (agendada)="alAgendar($event)" />
      } @else {
        <app-nueva-cita [barberos]="barberos" [servicios]="servicios" [citas]="todasLasCitas" [dia]="diaNueva" [barberoInicial]="filtroBarbero"
                        (cerrar)="nuevaVisible = false" (agendada)="alAgendar($event)" />
      }
    }

    @if (completando) {
      <app-completar-cita [cita]="completando" [multaPendiente]="multaParaCobrar(completando)" (cerrar)="completando = null" />
    }

    @if (noAsistiendo) {
      <app-no-asistio [cita]="noAsistiendo" (cerrar)="noAsistiendo = null" />
    }

    @if (serviciosDelDiaVisible) {
      <app-servicios-del-dia [dia]="diaSeleccionado" [servicios]="servicios" (cerrar)="serviciosDelDiaVisible = false" />
    }
  `,
})
export class AdminCitasComponent implements OnInit {
  private citasService = inject(CitasService);
  private ajustes = inject(AjustesService);
  private notificaciones = inject(NotificationService);
  private confirmar = inject(ConfirmarService);

  /** En el panel del barbero: el suyo. Ve solo sus citas y no edita, mueve ni elimina (eso es del admin). */
  readonly barberoFijo = input<BarberoPublico | null>(null);

  readonly esActiva = esActiva;
  readonly caritas = CARITAS;
  readonly hoy = claveDia(new Date());
  readonly enlaceResena = ENLACE_RESENA;
  readonly pedirResena = pedirResenaPorWhatsApp;
  /**
   * Horas del selector (de 5 en 5): las del horario vigente y las de después del cierre hasta que la cita termine a
   * LIMITE_DEL_EQUIPO (10:00 p. m.) y, si la cita está fuera de eso, también la suya.
   */
  opcionesHora() {
    const duracion = this.citaEditando ? duracionDe(this.citaEditando) : 0;
    const opciones = opcionesDeHora({ ...this.ajustes.horario(), cierre: LIMITE_DEL_EQUIPO }, false, MARCA)
      .filter(o => o.minutos + duracion <= LIMITE_DEL_EQUIPO);
    const actual = this.edicion.minutos;
    if (opciones.some(o => o.minutos === actual)) return opciones;
    return [...opciones, { minutos: actual, etiqueta: formatearHora12(actual) }].sort((a, b) => a.minutos - b.minutos);
  }
  /** Cita que se está marcando como completada (pide el valor cobrado). */
  completando: Cita | null = null;
  /** Cita que se está marcando "No asistió" (con la multa, si el admin la activó). */
  noAsistiendo: Cita | null = null;
  /** La ventana de "¿Qué se reserva este día?" (solo el admin). */
  serviciosDelDiaVisible = false;
  /** Cuántas veces vino y faltó cada cliente (por claveCliente): las caritas. */
  private asistencia = new Map<string, ResumenAsistencia>();
  /** Los "No asistió" de toda la barbería: el barbero ve también las faltas que el cliente tuvo con otro. */
  private faltas: Cita[] = [];

  vista: 'calendario' | 'lista' = 'calendario';
  fechaActual = new Date();
  diaSeleccionado = claveDia(new Date());

  todasLasCitas: Cita[] = [];
  /** Las del barbero elegido arriba (o todas), por día y hora: las del calendario. */
  citasOrdenadas: Cita[] = [];
  citasDelDiaSeleccionado: Cita[] = [];
  diasCalendario: DiaCalendario[] = [];

  // Filtros (el de barbero, solo el admin). Se recuerdan en este navegador.
  readonly periodos = PERIODOS_LISTA;
  readonly avatarDe = avatarDe;
  /** ID del barbero cuyas citas se ven. Vacío: las de todos. */
  filtroBarbero = '';
  /** El perfil de barbero de quien mira (un admin que también corta, como Jose): sale marcado "Tú". */
  miBarberoId = '';
  periodo: PeriodoLista = 'proximas';
  busqueda = '';
  verCanceladas = false;
  diasLista: GrupoLista[] = [];
  totalLista = 0;
  porAtender = 0;
  /** Canceladas (o cambiadas de horario) que hay en lo filtrado. */
  canceladas = 0;
  private avatares = new Map<string, string>();

  // Para edición
  modalCitaVisible = false;
  guardando = false;
  citaEditando: Cita | null = null;
  edicion = { userName: '', phone: '', dia: '', minutos: 0 };

  // Para agendar una cita desde el panel
  barberos: BarberoPublico[] = [];
  servicios: Servicio[] = [];
  nuevaVisible = false;
  diaNueva = claveDia(new Date());

  constructor() {
    this.diasCalendario = this.construirCalendario();
    // Las del barbero fijo (y las viejas de "cualquiera", como su agenda), o todas para el admin.
    toObservable(this.barberoFijo).pipe(
      map(b => b?.id ?? ''),
      distinctUntilChanged(),
      switchMap(id => (id ? this.citasService.deBarberos([id, BARBERO_CUALQUIERA]) : this.citasService.todas())),
      takeUntilDestroyed(),
    ).subscribe({
      next: citas => {
        this.todasLasCitas = citas;
        this.recalcular();
      },
      error: error => console.error('Error cargando citas', error),
    });
    const barberosService = inject(BarberosService);
    barberosService.listar().pipe(takeUntilDestroyed()).subscribe(barberos => {
      this.barberos = barberos;
      this.avatares = new Map(barberos.map(b => [b.id!, avatarDe(b)]));
      // Un barbero recordado que ya no está en el equipo: se vuelve a ver a todos.
      if (this.filtroBarbero && !barberos.some(b => b.id === this.filtroBarbero)) this.elegirBarbero('');
      else this.recalcular();
    });
    // Solo el admin: si también corta, su perfil de barbero sale marcado "Tú" (el del barbero ya está en barberoFijo).
    const auth = inject(AuthService);
    toObservable(this.barberoFijo).pipe(
      switchMap(fijo => (fijo ? of([]) : auth.currentUserProfile$.pipe(
        switchMap(perfil => (perfil?.email ? barberosService.delEmail(perfil.email) : of([]))),
        catchError(() => of([])),
      ))),
      takeUntilDestroyed(),
    ).subscribe(suyos => this.miBarberoId = suyos[0]?.id ?? '');
    inject(ServiciosService).actuales().pipe(takeUntilDestroyed()).subscribe(servicios => this.servicios = servicios);
    this.citasService.noAsistieron().pipe(catchError(() => of<Cita[]>([])), takeUntilDestroyed()).subscribe(faltas => {
      this.faltas = faltas;
      this.asistencia = resumirAsistencia(this.todasLasCitas, this.faltas);
    });
  }

  asistenciaDe(cita: Cita): ResumenAsistencia | undefined {
    const clave = claveCliente(cita);
    return clave ? this.asistencia.get(clave) : undefined;
  }

  /** La multa que el cliente debe de antes: se ofrece cobrarla al marcar esta cita "Hecho". */
  multaParaCobrar(cita: Cita): number {
    return multaParaCobrarEn(cita, this.asistenciaDe(cita));
  }

  async quitarMulta(cita: Cita) {
    const seguro = await this.confirmar.preguntar({
      titulo: '¿Quitarle la multa?',
      texto: `${cita.userName} ya no la deberá. La cita sigue como "No asistió".`,
      aceptar: 'Sí, quitarla',
    });
    if (!seguro) return;
    try {
      await this.citasService.quitarMulta(cita);
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo quitar la multa');
    }
  }

  /** El admin dejó ese día solo para algunos servicios. */
  limitado(dia: string): boolean {
    return !!serviciosDelDia(this.ajustes.serviciosPorDia(), dia);
  }

  nombresDelDia(dia: string): string {
    return nombresDeServicios(serviciosDelDia(this.ajustes.serviciosPorDia(), dia) ?? [], this.servicios);
  }

  ngOnInit() {
    try {
      const guardado = JSON.parse(localStorage.getItem(this.claveFiltros) ?? 'null');
      if (PERIODOS_LISTA.some(p => p.valor === guardado?.periodo)) this.periodo = guardado.periodo;
      if (!this.barberoFijo() && typeof guardado?.barbero === 'string') this.filtroBarbero = guardado.barbero;
    } catch { /* sin almacenamiento o dañado: los de siempre */ }
  }

  /** Uno por panel: el admin y el barbero no se pisan si comparten el navegador. */
  private get claveFiltros(): string {
    return `filtros-citas-v1:${CLIENTE.id}:${this.barberoFijo() ? 'barbero' : 'admin'}`;
  }

  private guardarFiltros() {
    try {
      localStorage.setItem(this.claveFiltros, JSON.stringify({ periodo: this.periodo, barbero: this.filtroBarbero }));
    } catch { /* almacenamiento bloqueado: se elige otra vez la próxima */ }
  }

  elegirBarbero(id: string) {
    this.filtroBarbero = id;
    this.guardarFiltros();
    this.recalcular();
  }

  elegirPeriodo(periodo: PeriodoLista) {
    this.periodo = periodo;
    this.guardarFiltros();
    this.filtrarLista();
  }

  alternarCanceladas() {
    this.verCanceladas = !this.verCanceladas;
    this.filtrarLista();
  }

  get barberoElegido(): BarberoPublico | null {
    return (this.filtroBarbero && this.barberos.find(b => b.id === this.filtroBarbero)) || null;
  }

  /** El barbero de cada cita se muestra solo si se ven las de todos (al admin). */
  get mostrarBarbero(): boolean {
    return !this.barberoFijo() && !this.filtroBarbero;
  }

  avatarDeCita(cita: Cita): string {
    return this.avatares.get(cita.barberoId) ?? avatarDe({ avatar: '', nombre: cita.barberoNombre || '?' });
  }

  get mensajeVacio(): string {
    if (this.busqueda.trim()) return 'Nadie con ese nombre o celular en estas fechas.';
    const cuando: Record<PeriodoLista, string> = {
      hoy: 'hoy', manana: 'mañana', semana: 'esta semana', proximas: 'por venir', pasadas: 'pasadas', todas: 'registradas',
    };
    const quien = this.barberoElegido?.nombre;
    return `${quien ? `${quien} no tiene` : 'No hay'} citas ${cuando[this.periodo]}${this.canceladas ? ' (sin contar las canceladas)' : ''}.`;
  }

  /** La lista: el período, el barbero y la búsqueda, por día. */
  filtrarLista() {
    const filtro = { periodo: this.periodo, barberoId: this.filtroBarbero, busqueda: this.busqueda };
    const visibles = filtrarCitas(this.todasLasCitas, { ...filtro, canceladas: this.verCanceladas });
    this.canceladas = filtrarCitas(this.todasLasCitas, { ...filtro, canceladas: true }).filter(c => c.estado === 'cancelada').length;
    this.totalLista = visibles.length;
    this.porAtender = visibles.filter(c => esActiva(c.estado)).length;
    const hoy = claveDia(new Date());
    const manana = rangoLista('manana').desde;
    const ayer = rangoLista('pasadas').hasta;
    const anio = new Date().getFullYear();
    this.diasLista = agruparPorDia(visibles, this.periodo === 'pasadas').map(({ dia, citas }) => {
      const fecha = fechaDesdeClave(dia);
      return {
        dia,
        citas,
        fecha,
        esHoy: dia === hoy,
        prefijo: dia === hoy ? 'Hoy · ' : dia === manana ? 'Mañana · ' : dia === ayer ? 'Ayer · ' : '',
        formato: fecha.getFullYear() === anio ? 'EEEE d MMM' : 'EEEE d MMM y',
      };
    });
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
    this.asistencia = resumirAsistencia(this.todasLasCitas, this.faltas);
    const barbero = this.filtroBarbero;
    this.citasOrdenadas = this.todasLasCitas.filter(c => !barbero || c.barberoId === barbero).sort(compararCitas);
    this.seleccionarDia(this.diaSeleccionado);
    this.diasCalendario = this.construirCalendario();
    this.filtrarLista();
  }

  private construirCalendario(): DiaCalendario[] {
    const year = this.fechaActual.getFullYear();
    const month = this.fechaActual.getMonth();
    const primerDia = new Date(year, month, 1);
    const hoy = claveDia(new Date());
    // Viendo las de todos, cada día dice cuántas le tocan a cada barbero (en pantalla ancha).
    const desglosar = this.mostrarBarbero && this.barberos.length > 1;
    const orden = new Map(this.barberos.map((b, i) => [b.id!, i]));

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
      const citas = esOtroMes ? [] : porDia.get(clave) ?? [];
      const porBarbero = new Map<string, CitasDeBarbero>();
      if (desglosar) {
        for (const cita of citas) {
          if (cita.estado === 'cancelada') continue;
          const suyo = porBarbero.get(cita.barberoId);
          if (suyo) suyo.citas++;
          else porBarbero.set(cita.barberoId, { id: cita.barberoId, nombre: cita.barberoNombre || 'Cualquiera', avatar: this.avatarDeCita(cita), citas: 1 });
        }
      }
      return {
        fecha,
        clave,
        esOtroMes,
        esHoy: clave === hoy,
        citas,
        porBarbero: [...porBarbero.values()].sort((a, b) => (orden.get(a.id) ?? 99) - (orden.get(b.id) ?? 99)),
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

  // --- Nueva cita desde el panel (formulario en shared/components/nueva-cita) ---

  abrirNuevaCita(dia = claveDia(new Date())) {
    // El barbero no se agenda en días que ya pasaron (su formulario empieza en hoy).
    const hoy = claveDia(new Date());
    this.diaNueva = this.barberoFijo() && dia < hoy ? hoy : dia;
    this.nuevaVisible = true;
  }

  /** Deja a la vista el día de la cita nueva. */
  alAgendar(cita: Cita) {
    this.nuevaVisible = false;
    const dia = diaDeCita(cita);
    this.fechaActual = fechaDesdeClave(dia);
    this.diasCalendario = this.construirCalendario();
    this.seleccionarDia(dia);
  }

  marcarNoAsistio(cita: Cita) {
    if (new Date() < inicioDeCita(cita)) {
      this.notificaciones.error('Aún no es la hora', `No se puede marcar "No asistió" antes de la hora de la cita (${cita.horaStr}).`);
      return;
    }
    this.noAsistiendo = cita;
  }
}
