import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subscription, catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { AjustesService } from '../../../core/services/ajustes.service';
import { BarberosService } from '../../../core/services/barberos.service';
import { CitasService } from '../../../core/services/citas.service';
import { ConfirmarService } from '../../../core/services/confirmar.service';
import { NotificationService } from '../../../core/services/notification.service';
import { RecurrenciasService } from '../../../core/services/recurrencias.service';
import { ServiciosService } from '../../../core/services/servicios.service';
import { UsuariosService } from '../../../core/services/usuarios.service';
import { BarberoPublico, avatarDe } from '../../../core/models/barbero.model';
import { Cita, esActiva } from '../../../core/models/cita.model';
import {
  DURACION_MAXIMA, DURACION_MINIMA, DatosRecurrencia, FRECUENCIAS, Frecuencia, HORIZONTE_RECURRENTES, OmitidaRecurrente, OpcionFrecuencia,
  Recurrencia, estaAlDia, fechasDeLaSerie, opcionDe, proximosDias,
} from '../../../core/models/recurrencia.model';
import { Servicio, iconoDe } from '../../../core/models/servicio.model';
import { Usuario } from '../../../core/models/usuario.model';
import {
  BLOQUE, INTERVALO, Slot, aperturaDe, claveDia, compararCitas, diaDeCita, duracionDe, estaCerrado, estaLibre, fechaCorta, fechaDesdeClave,
  formatearHora12, inicioDeCita, minutosAHora24, parsearHora, sumarDias,
} from '../../../core/utils/horario';
import { enlaceWhatsApp, esCelularValido, formatoCelular, limpiarCelular } from '../../../core/utils/colombia';
import { IconoComponent } from '../../../shared/components/icono/icono.component';
import { RedSocialComponent } from '../../../shared/components/red-social/red-social.component';

type Paso = 'cliente' | 'servicio' | 'detalles';

/** Un cliente para elegir: sale de las citas, de las cuentas registradas y de las agendas recurrentes. */
interface Contacto {
  /** Su celular o, si no tiene, su nombre normalizado: así no sale dos veces. */
  clave: string;
  nombre: string;
  /** 10 dígitos, o vacío. */
  telefono: string;
  /** Correo de su cuenta, si no hay celular. */
  detalle: string;
  /** Agendas recurrentes activas que ya tiene. */
  fijas: number;
  reciente: string;
}

interface HoraOpcion {
  minutos: number;
  etiqueta: string;
  estado: 'libre' | 'parcial' | 'ocupada' | 'descanso';
  /** Se puede elegir: libre, o con algunas fechas ocupadas (esas no se apartan). */
  elegible: boolean;
  /** Días de la serie en que esa hora ya está tomada. */
  choques: string[];
  nota: string;
}

interface Tarjeta {
  r: Recurrencia;
  frecuencia: OpcionFrecuencia;
  dia: string;
  horaStr: string;
  /** Próximo turno apartado (día), si hay. */
  proximo: string | null;
  apartados: number;
  omitidas: OmitidaRecurrente[];
  alDia: boolean;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ROMANOS = { cliente: 'I', servicio: 'II', detalles: 'III' } as const;
/** Contactos que se pintan a la vez (el resto aparece al buscar). */
const CONTACTOS_A_LA_VISTA = 40;

const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Agendas recurrentes: clientes que vienen cada semana, cada 2 semanas o cada 4 semanas, el mismo día y a la misma
 * hora. El admin las crea con el botón flotante (cliente → servicio → barbero, frecuencia, día, duración y hora) y
 * la Cloud Function programarRecurrencia aparta sus turnos en la agenda, como cualquier reserva: los clientes ya no
 * pueden tomar esas horas, y cada turno se marca como hecho o "no asistió" para que cuente en las ganancias.
 */
@Component({
  selector: 'app-admin-recurrentes',
  standalone: true,
  imports: [CurrencyPipe, NgClass, FormsModule, IconoComponent, RedSocialComponent],
  host: { '(document:keydown.escape)': 'abierto() && cerrar()' },
  template: `
    <div class="animate-in fade-in duration-500 pb-20 md:pb-0">
      <div class="mb-8 flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h2 class="titulo-panel">Agendas recurrentes</h2>
          <p class="mt-1 max-w-2xl text-neutral-400">Para los clientes que vienen cada semana, cada 2 semanas o cada 4 semanas, el mismo día y a la misma hora. Sus turnos quedan apartados solos en la agenda.</p>
        </div>
        <button type="button" (click)="abrirNueva()" class="boton-acento hidden md:inline-flex">
          <app-icono nombre="mas" class="h-4 w-4" [grosor]="2.4" /> Nueva agenda recurrente
        </button>
      </div>

      @if (barberos().length > 1 && (lista()?.length ?? 0) > 0) {
        <div class="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 scrollbar-hide md:mx-0 md:px-0" role="group" aria-label="Ver las agendas de">
          <button type="button" (click)="filtroBarbero.set('')" [attr.aria-pressed]="!filtroBarbero()" class="min-h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition-colors"
                  [ngClass]="!filtroBarbero() ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-400 hover:text-white'">Todas</button>
          @for (b of barberos(); track b.id) {
            <button type="button" (click)="filtroBarbero.set(b.id!)" [attr.aria-pressed]="filtroBarbero() === b.id" class="min-h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition-colors"
                    [ngClass]="filtroBarbero() === b.id ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-400 hover:text-white'">{{ b.nombre }}</button>
          }
        </div>
      }

      @if (lista() === undefined) {
        <div class="grid gap-4 md:grid-cols-2"><div class="tarjeta h-56 animate-pulse"></div><div class="tarjeta h-56 animate-pulse"></div></div>
      } @else if (tarjetas().length === 0) {
        <div class="tarjeta border-dashed px-6 py-12 text-center">
          <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-detalle-400/40 text-detalle-200">
            <app-icono nombre="repetir" class="h-6 w-6" [grosor]="1.8" />
          </span>
          @if (filtroBarbero()) {
            <p class="mt-4 font-bold text-white">Este barbero no tiene agendas recurrentes</p>
          } @else {
            <p class="mt-4 font-bold text-white">Aún no hay agendas recurrentes</p>
            <p class="mx-auto mt-1 max-w-md text-sm text-neutral-500">Crea una para cada cliente fijo: elige el corte, el barbero, cada cuánto viene, el día y la hora. Un mismo cliente puede tener varias.</p>
            <button type="button" (click)="abrirNueva()" class="boton-acento mt-6">
              <app-icono nombre="mas" class="h-4 w-4" [grosor]="2.4" /> Crear la primera
            </button>
          }
        </div>
      } @else {
        <ul class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          @for (t of tarjetas(); track t.r.id) {
            <li class="tarjeta flex flex-col p-5" [class.opacity-75]="!t.r.activa">
              <div class="flex-1">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="flex flex-wrap items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.25em] text-detalle-300">
                      <app-icono nombre="repetir" class="h-4 w-4" [grosor]="2" /> {{ t.frecuencia.nombre }}
                      @if (!t.r.activa) { <span class="chip-neutro">En pausa</span> }
                    </p>
                    <h3 class="mt-2 truncate text-lg font-black">{{ t.r.clienteNombre }}</h3>
                    @if (t.r.clienteTelefono) {
                      <a [href]="whatsapp(t.r.clienteTelefono)" target="_blank" rel="noopener" class="enlace-toque text-sm font-semibold text-emerald-300 hover:text-emerald-200"
                         [attr.aria-label]="'Escribirle a ' + t.r.clienteNombre + ' por WhatsApp'">
                        <app-red-social red="whatsapp" class="h-4 w-4" /> {{ celular(t.r.clienteTelefono) }}
                      </a>
                    } @else {
                      <p class="text-sm text-neutral-500">Sin celular</p>
                    }
                  </div>
                  <div class="flex shrink-0 gap-2">
                    <button type="button" (click)="editar(t.r)" class="boton-icono" [attr.aria-label]="'Editar la agenda de ' + t.r.clienteNombre" title="Editar">
                      <app-icono nombre="editar" class="h-4 w-4" [grosor]="1.8" />
                    </button>
                    <button type="button" (click)="eliminar(t)" class="boton-icono peligro" [attr.aria-label]="'Eliminar la agenda de ' + t.r.clienteNombre" title="Eliminar">
                      <app-icono nombre="papelera" class="h-4 w-4" [grosor]="1.8" />
                    </button>
                  </div>
                </div>

                <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div class="col-span-2">
                    <dt class="text-[11px] font-extrabold uppercase tracking-widest text-neutral-500">Servicio</dt>
                    <dd class="font-bold">{{ t.r.serviceName }} <span class="font-semibold text-neutral-500">· {{ t.r.duracionMinutos }} min</span></dd>
                  </div>
                  <div>
                    <dt class="text-[11px] font-extrabold uppercase tracking-widest text-neutral-500">Día</dt>
                    <dd class="font-bold">{{ t.dia }}</dd>
                  </div>
                  <div>
                    <dt class="text-[11px] font-extrabold uppercase tracking-widest text-neutral-500">Hora</dt>
                    <dd class="font-bold">{{ t.horaStr }}</dd>
                  </div>
                  <div class="col-span-2">
                    <dt class="text-[11px] font-extrabold uppercase tracking-widest text-neutral-500">Barbero</dt>
                    <dd class="font-bold">{{ t.r.barberoNombre }}</dd>
                  </div>
                </dl>

                @if (t.omitidas.length) {
                  <div class="mt-4 rounded-xl border border-detalle-400/25 bg-detalle-500/[0.06] p-3 text-xs">
                    <p class="flex items-center gap-1.5 font-bold text-detalle-200">
                      <app-icono nombre="alerta" class="h-4 w-4 shrink-0" [grosor]="1.8" />
                      {{ t.omitidas.length === 1 ? '1 fecha sin apartar' : t.omitidas.length + ' fechas sin apartar' }}
                    </p>
                    <ul class="mt-1.5 space-y-0.5 text-neutral-300">
                      @for (o of t.omitidas.slice(0, 3); track o.dia) { <li><span class="font-bold">{{ corta(o.dia) }}</span>: {{ o.motivo }}</li> }
                      @if (t.omitidas.length > 3) { <li class="text-neutral-500">y {{ t.omitidas.length - 3 }} más</li> }
                    </ul>
                  </div>
                }
              </div>

              <div class="mt-4 flex items-center justify-between gap-3 border-t border-white/5 pt-3">
                <p class="min-w-0 text-xs text-neutral-400" role="status">
                  @if (!t.r.activa) {
                    Sus horas quedan libres mientras esté en pausa.
                  } @else if (!t.alDia) {
                    <span class="inline-flex items-center gap-2"><span class="h-2 w-2 animate-pulse rounded-full bg-detalle-400"></span> Apartando sus turnos…</span>
                  } @else if (t.proximo) {
                    Próximo: <strong class="text-white">{{ corta(t.proximo) }}</strong> · {{ t.apartados === 1 ? '1 turno apartado' : t.apartados + ' turnos apartados' }}
                  } @else {
                    Sin turnos por venir.
                  }
                </p>
                <button type="button" (click)="pausar(t.r)" class="boton-linea boton-chico shrink-0">
                  <app-icono [nombre]="t.r.activa ? 'pausa' : 'repetir'" class="h-4 w-4" [grosor]="1.8" /> {{ t.r.activa ? 'Pausar' : 'Reanudar' }}
                </button>
              </div>
            </li>
          }
        </ul>
      }
    </div>

    <!-- Botón flotante (celular): nueva agenda recurrente -->
    @if (!abierto()) {
      <button type="button" (click)="abrirNueva()" aria-label="Nueva agenda recurrente" title="Nueva agenda recurrente"
              class="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-acento-500 text-sobre-acento shadow-xl shadow-black/60 ring-1 ring-white/15 transition-transform active:scale-95 md:hidden"
              style="bottom: calc(max(0.75rem, env(safe-area-inset-bottom)) + 4.75rem)">
        <app-icono nombre="calendario" class="h-6 w-6" [grosor]="1.9" />
        <span class="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-detalle-400 text-neutral-950 ring-2 ring-neutral-950">
          <app-icono nombre="mas" class="h-3 w-3" [grosor]="3.2" />
        </span>
      </button>
    }

    <!-- Crear o editar una agenda recurrente -->
    @if (abierto()) {
      <div class="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="recurrente-titulo">
        <div class="absolute inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200" (click)="cerrar()"></div>
        <div class="relative flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-neutral-950 shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-300 sm:h-auto sm:max-h-[92dvh] sm:max-w-xl sm:rounded-3xl">

          <div class="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-3 sm:px-5">
            @if (puedeVolver()) {
              <button type="button" (click)="atras()" class="boton-icono !border-transparent" aria-label="Volver al paso anterior">
                <app-icono nombre="atras" class="h-5 w-5" [grosor]="2.2" />
              </button>
            }
            <div class="min-w-0 flex-1 px-1">
              <p class="text-[11px] font-extrabold uppercase tracking-[0.25em] text-detalle-400">{{ romano() }} · {{ nombrePaso() }}</p>
              <h3 id="recurrente-titulo" class="truncate text-lg font-black">{{ editando() ? 'Editar agenda recurrente' : 'Nueva agenda recurrente' }}</h3>
            </div>
            <button type="button" (click)="cerrar()" class="boton-icono" aria-label="Cerrar">
              <app-icono nombre="cerrar" class="h-5 w-5" [grosor]="2" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">

            <!-- I. Cliente -->
            @if (paso() === 'cliente') {
              <div class="flex items-center gap-2">
                <label class="relative min-w-0 flex-1">
                  <span class="sr-only">Buscar por nombre o celular</span>
                  <app-icono nombre="buscar" class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" [grosor]="2" />
                  <input type="search" name="buscarCliente" [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" autocomplete="off" enterkeyhint="search"
                         placeholder="Buscar por nombre o celular" class="campo !rounded-full !py-3 !pl-11">
                </label>
                <button type="button" (click)="crearCliente()" class="flex min-h-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-bold leading-tight text-detalle-200 hover:text-white">
                  <app-icono nombre="agregar" class="h-6 w-6" [grosor]="1.8" /> Crear cliente
                </button>
              </div>

              @if (creandoCliente()) {
                <div class="mt-4 rounded-2xl border border-detalle-400/25 bg-detalle-500/[0.05] p-4">
                  <p class="font-bold text-white">Cliente nuevo</p>
                  <div class="mt-3 grid gap-3 sm:grid-cols-2">
                    <label class="block">
                      <span class="etiqueta">Nombre y apellido</span>
                      <input type="text" name="nuevoNombre" [ngModel]="nombre()" (ngModelChange)="nombre.set($event)" maxlength="120" autocomplete="off" class="campo"
                             [class.campo-error]="intentoCliente() && !nombre().trim()" placeholder="Juan Camilo Rojas">
                      @if (intentoCliente() && !nombre().trim()) { <span class="texto-error">Escribe su nombre.</span> }
                    </label>
                    <label class="block">
                      <span class="etiqueta">Celular (opcional)</span>
                      <input type="tel" name="nuevoCelular" [ngModel]="telefono()" (ngModelChange)="telefono.set($event)" maxlength="25" inputmode="numeric" autocomplete="off" class="campo"
                             [class.campo-error]="intentoCliente() && !celularValido()" placeholder="300 123 4567">
                      @if (intentoCliente() && !celularValido()) { <span class="texto-error">10 dígitos, empezando por 3.</span> }
                    </label>
                  </div>
                  <div class="mt-4 flex justify-end gap-2">
                    <button type="button" (click)="creandoCliente.set(false)" class="boton-linea boton-chico">Cancelar</button>
                    <button type="button" (click)="usarClienteNuevo()" class="boton-acento boton-chico">Continuar</button>
                  </div>
                </div>
              } @else {
                <button type="button" (click)="sinCliente()" class="mt-3 flex min-h-11 items-center gap-2 text-sm font-bold text-detalle-200 hover:text-white">
                  <app-icono nombre="sinUsuario" class="h-5 w-5" [grosor]="1.8" /> Continuar sin agregar cliente
                </button>
              }

              <p class="mb-1 mt-5 text-[11px] font-extrabold uppercase tracking-widest text-neutral-500">Tus clientes</p>
              @if (contactosFiltrados().length === 0) {
                <p class="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-neutral-500">
                  {{ busqueda().trim() ? 'Nadie con ese nombre o celular. Agrégalo con "Crear cliente".' : 'Aún no hay clientes. Agrega el primero con "Crear cliente".' }}
                </p>
              } @else {
                <ul class="divide-y divide-white/5">
                  @for (c of contactosFiltrados().slice(0, aLaVista); track c.clave) {
                    <li>
                      <button type="button" (click)="elegirContacto(c)" class="flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left transition-colors hover:bg-white/[0.03]">
                        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] font-display text-sm font-bold uppercase text-neutral-300">{{ c.nombre.charAt(0) }}</span>
                        <span class="min-w-0 flex-1">
                          <span class="block truncate font-bold text-white">{{ c.nombre }} </span>
                          <span class="block truncate text-sm text-neutral-500">{{ c.telefono ? '+57 ' + celular(c.telefono) : (c.detalle || 'Sin celular') }}</span>
                        </span>
                        @if (c.fijas) { <span class="chip-oro shrink-0">{{ c.fijas === 1 ? 'Fijo' : c.fijas + ' fijas' }}</span> }
                      </button>
                    </li>
                  }
                </ul>
                @if (contactosFiltrados().length > aLaVista) {
                  <p class="ayuda text-center">Se ven {{ aLaVista }} de {{ contactosFiltrados().length }}. Escribe para encontrar a los demás.</p>
                }
              }
            }

            <!-- II. Servicio -->
            @if (paso() === 'servicio') {
              <p class="text-sm text-neutral-400">
                @if (nombre().trim()) { Para <strong class="text-white">{{ nombre().trim() }}</strong>. } ¿Qué servicio se hace en cada turno?
              </p>
              @if (servicios().length === 0) {
                <p class="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-neutral-500">Aún no hay servicios. Agrégalos en Servicios y precios.</p>
              }
              <ul class="mt-4 space-y-2">
                @for (s of servicios(); track s.id) {
                  <li>
                    <button type="button" (click)="elegirServicio(s)" [attr.aria-pressed]="s.id === servicioId()"
                            class="flex w-full items-center gap-4 rounded-2xl border bg-white/[0.03] p-4 text-left transition-colors hover:border-detalle-400/50"
                            [ngClass]="s.id === servicioId() ? 'border-detalle-400/60' : 'border-white/10'">
                      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-detalle-200">
                        <app-icono [nombre]="iconoDe(s)" class="h-6 w-6" [grosor]="1.6" />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-bold text-white">{{ s.nombre }}</span>
                        <span class="block text-sm text-neutral-500">{{ duracionDe(s) }} minutos aprox.</span>
                      </span>
                      <span class="shrink-0 font-bold tabular-nums text-neutral-200">{{ s.precio | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                    </button>
                  </li>
                }
              </ul>
            }

            <!-- III. Agenda -->
            @if (paso() === 'detalles') {
              <div class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-detalle-200">
                  <app-icono [nombre]="servicio() ? iconoDe(servicio()!) : 'tijeras'" class="h-6 w-6" [grosor]="1.6" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-bold">{{ servicio()?.nombre ?? 'Sin servicio' }}</p>
                  <p class="text-xs text-neutral-500">{{ duracionCatalogo() }} minutos aprox.@if (servicio()) { · {{ servicio()!.precio | currency:'COP':'symbol-narrow':'1.0-0' }} }</p>
                </div>
                <button type="button" (click)="paso.set('servicio')" class="boton-linea boton-chico shrink-0">Cambiar</button>
              </div>

              <fieldset class="mt-6">
                <legend class="etiqueta">Barbero</legend>
                @if (barberos().length === 0) {
                  <p class="text-sm text-neutral-500">Aún no hay barberos. Agrégalos en Equipo.</p>
                }
                <div class="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide">
                  @for (b of barberos(); track b.id) {
                    <button type="button" (click)="elegirBarbero(b.id!)" [attr.aria-pressed]="b.id === barberoId()" class="flex w-20 shrink-0 flex-col items-center gap-1.5 text-center">
                      <img [src]="avatarDe(b)" alt="" class="h-16 w-16 rounded-full border-2 object-cover object-[50%_25%] transition-all"
                           [ngClass]="b.id === barberoId() ? 'border-detalle-400 ring-2 ring-detalle-400/30' : 'border-white/10 opacity-60'">
                      <span class="line-clamp-2 text-xs font-bold" [ngClass]="b.id === barberoId() ? 'text-detalle-200' : 'text-neutral-400'">{{ b.nombre }}</span>
                    </button>
                  }
                </div>
              </fieldset>

              <fieldset class="mt-6">
                <legend class="etiqueta">Tipo de recurrencia</legend>
                <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Cada cuánto se repite">
                  @for (f of frecuencias; track f.valor) {
                    <button type="button" role="radio" [attr.aria-checked]="f.valor === frecuencia()" (click)="frecuencia.set(f.valor)"
                            class="flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 py-2 text-center transition-colors"
                            [ngClass]="f.valor === frecuencia() ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-300 hover:border-white/25'">
                      <span class="text-sm font-black">{{ f.nombre }} </span>
                      <span class="text-[11px] font-semibold opacity-80">{{ f.detalle }}</span>
                    </button>
                  }
                </div>
              </fieldset>

              <fieldset class="mt-6">
                <legend class="etiqueta">Día</legend>
                <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide sm:flex-wrap sm:overflow-visible">
                  @for (d of diasAbiertos(); track d.numero) {
                    <button type="button" (click)="elegirDia(d.numero)" [disabled]="d.libre" [attr.aria-pressed]="d.numero === diaSemana()"
                            [attr.title]="d.libre ? 'Día libre de ' + (barbero()?.nombre ?? 'el barbero') : null"
                            class="min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-35"
                            [ngClass]="d.numero === diaSemana() ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-300 hover:border-white/25'">{{ d.nombre }}</button>
                  }
                </div>
                @if (diasLibres()) { <p class="ayuda">{{ diasLibres() }}</p> }
              </fieldset>

              @if (diaSemana() !== null) {
                <fieldset class="mt-6">
                  <legend class="etiqueta">Primer turno</legend>
                  <div class="grid grid-cols-4 gap-2">
                    @for (f of fechasInicio(); track f) {
                      <button type="button" (click)="desde.set(f)" [attr.aria-pressed]="f === desde()"
                              class="flex min-h-12 flex-col items-center justify-center rounded-xl border px-1 text-center transition-colors"
                              [ngClass]="f === desde() ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-300 hover:border-white/25'">
                        <!-- El espacio al final separa el día de la fecha para quien lee el texto (lectores de pantalla). -->
                        <span class="text-[11px] font-bold uppercase tracking-wider opacity-80">{{ f === hoy ? 'Hoy' : corta(f).split(' ')[0] }} </span>
                        <span class="text-sm font-black">{{ corta(f).split(' ').slice(1).join(' ') }}</span>
                      </button>
                    }
                  </div>
                  @if (frecuencia() !== 'semanal') { <p class="ayuda">Desde ese día se cuentan {{ frecuencia() === 'quincenal' ? 'las 2 semanas' : 'las 4 semanas' }} de cada turno.</p> }
                </fieldset>
              }

              <div class="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-white/10 p-3">
                <div class="min-w-0">
                  <p class="text-sm font-bold">Duración del servicio</p>
                  <p class="text-xs text-neutral-500">
                    {{ duracion() !== duracionCatalogo() ? 'Normalmente dura ' + duracionCatalogo() + ' min.' : 'La del catálogo. Cámbiala si este cliente tarda más o menos.' }}
                  </p>
                  @if (duracion() !== duracionCatalogo()) {
                    <button type="button" (click)="duracion.set(duracionCatalogo())" class="enlace-toque text-xs font-bold text-detalle-200 hover:text-white">Volver a {{ duracionCatalogo() }} min</button>
                  }
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <button type="button" (click)="cambiarDuracion(-bloque)" [disabled]="duracion() <= duracionMinima" class="boton-icono disabled:opacity-30" aria-label="20 minutos menos">
                    <app-icono nombre="menos" class="h-4 w-4" [grosor]="2.4" />
                  </button>
                  <span class="w-16 text-center font-display text-base font-black tabular-nums" aria-live="polite">{{ duracion() }} min</span>
                  <button type="button" (click)="cambiarDuracion(bloque)" [disabled]="duracion() >= duracionMaxima" class="boton-icono disabled:opacity-30" aria-label="20 minutos más">
                    <app-icono nombre="mas" class="h-4 w-4" [grosor]="2.4" />
                  </button>
                </div>
              </div>

              @if (diaSemana() !== null && desde()) {
                <fieldset class="mt-6">
                  <legend class="etiqueta">Hora</legend>
                  @if (ocupados() === null) {
                    <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      @for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="h-14 animate-pulse rounded-xl bg-white/[0.04]"></div> }
                    </div>
                  } @else if (horas().length === 0) {
                    <p class="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-neutral-500">No hay horas ese día para un servicio de {{ duracion() }} min.</p>
                  } @else {
                    <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      @for (h of horas(); track h.minutos) {
                        <button type="button" (click)="minutos.set(h.minutos)" [disabled]="!h.elegible" [attr.aria-pressed]="h.minutos === minutos()"
                                class="flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 text-center transition-colors disabled:cursor-not-allowed"
                                [ngClass]="claseHora(h)">
                          <span class="text-sm font-black" [class.line-through]="!h.elegible">{{ h.etiqueta }} </span>
                          <span class="text-[11px] font-semibold">{{ h.nota }}</span>
                        </button>
                      }
                    </div>
                    <p class="ayuda">"Ocupada" es que el barbero ya tiene otra cita o cerró ese rato en todas las fechas. Si solo algunas están ocupadas, esas no se apartan.</p>
                    <button type="button" (click)="masHoras.set(!masHoras())" class="enlace-toque text-xs font-bold text-detalle-200 hover:text-white">
                      {{ masHoras() ? 'Ver solo los turnos de la agenda (cada 40 min)' : 'Ver más horas (cada 20 min)' }}
                    </button>
                  }
                </fieldset>
              }

              <div class="mt-6 grid gap-4 sm:grid-cols-2">
                <label class="block">
                  <span class="etiqueta">Nombre del cliente</span>
                  <input type="text" name="clienteNombre" [ngModel]="nombre()" (ngModelChange)="nombre.set($event)" maxlength="120" autocomplete="off" class="campo"
                         [class.campo-error]="intento() && !nombre().trim()" placeholder="Nombres y apellidos del cliente">
                </label>
                <label class="block">
                  <span class="etiqueta">Celular (opcional)</span>
                  <input type="tel" name="clienteCelular" [ngModel]="telefono()" (ngModelChange)="telefono.set($event)" maxlength="25" inputmode="numeric" autocomplete="off" class="campo"
                         [class.campo-error]="intento() && !celularValido()" placeholder="300 123 4567">
                </label>
              </div>

              @if (vistaPrevia(); as v) {
                <div class="mt-6 rounded-2xl border border-detalle-400/25 bg-detalle-500/[0.05] p-4 text-sm" role="status">
                  @if (v.agendadas.length) {
                    <p class="font-bold text-white">
                      Se {{ v.agendadas.length === 1 ? 'aparta 1 turno' : 'apartan ' + v.agendadas.length + ' turnos' }}:
                      <span class="font-semibold text-neutral-300">{{ v.lista }}</span>
                    </p>
                    <p class="mt-1 text-neutral-400">Después se siguen apartando solos, {{ opcion().detalle.toLowerCase() }}, a las {{ v.hora }}.</p>
                  } @else {
                    <p class="font-bold text-white">Por ahora no se aparta ningún turno.</p>
                  }
                  @for (o of v.omitidas; track o.dia) {
                    <p class="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-detalle-200">
                      <app-icono nombre="alerta" class="mt-px h-4 w-4 shrink-0" [grosor]="1.8" /> <span>{{ corta(o.dia) }}: {{ o.motivo }}. Ese día no se aparta.</span>
                    </p>
                  }
                  @for (aviso of v.avisos; track aviso) {
                    <p class="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-detalle-200"><app-icono nombre="alerta" class="mt-px h-4 w-4 shrink-0" [grosor]="1.8" /> {{ aviso }}</p>
                  }
                </div>
              }
              @if (editando()) {
                <p class="ayuda">Al guardar, los turnos que aún no llegan se vuelven a apartar con estos datos (también los que hayas quitado a mano de la agenda). Los que ya pasaron no cambian.</p>
              }
            }
          </div>

          @if (paso() === 'detalles') {
            <div class="shrink-0 border-t border-white/10 bg-neutral-950 px-4 pt-3 pb-seguro sm:px-6 sm:pb-5">
              <p class="mb-2 text-center text-xs font-semibold" [ngClass]="intento() && faltante() ? 'text-red-400' : 'text-neutral-500'">
                {{ faltante() ? '*' + faltante() : 'No se envían correos: los turnos aparecen en la agenda marcados como recurrentes.' }}
              </p>
              <button type="button" (click)="guardar()" [disabled]="guardando()" class="boton-acento w-full">
                {{ guardando() ? 'Guardando…' : editando() ? 'Guardar cambios' : 'Crear cita recurrente' }}
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class AdminRecurrentesComponent {
  private recurrencias = inject(RecurrenciasService);
  private citasService = inject(CitasService);
  private ajustes = inject(AjustesService);
  private usuariosService = inject(UsuariosService);
  private notificaciones = inject(NotificationService);
  private confirmar = inject(ConfirmarService);

  readonly frecuencias = FRECUENCIAS;
  readonly avatarDe = avatarDe;
  readonly iconoDe = iconoDe;
  readonly duracionDe = duracionDe;
  readonly corta = fechaCorta;
  readonly bloque = BLOQUE;
  readonly duracionMinima = DURACION_MINIMA;
  readonly duracionMaxima = DURACION_MAXIMA;
  readonly aLaVista = CONTACTOS_A_LA_VISTA;
  readonly hoy = claveDia(new Date());
  /** Último día que la función deja apartado. */
  private readonly fin = sumarDias(this.hoy, HORIZONTE_RECURRENTES);

  /** undefined mientras carga. */
  readonly lista = toSignal(this.recurrencias.listar().pipe(catchError(error => {
    console.error('Error cargando las agendas recurrentes', error);
    return of<Recurrencia[]>([]);
  })));
  private readonly citas = toSignal(this.citasService.todas().pipe(catchError(() => of<Cita[]>([]))), { initialValue: [] as Cita[] });
  readonly barberos = toSignal(inject(BarberosService).listar().pipe(catchError(() => of<BarberoPublico[]>([]))), { initialValue: [] as BarberoPublico[] });
  readonly servicios = toSignal(inject(ServiciosService).actuales().pipe(catchError(() => of<Servicio[]>([]))), { initialValue: [] as Servicio[] });
  /** Las cuentas registradas se piden solo al buscar un cliente (cada una es una lectura). */
  private readonly usuarios = signal<Usuario[]>([]);
  private escuchaUsuarios?: Subscription;

  readonly filtroBarbero = signal('');

  readonly tarjetas = computed<Tarjeta[]>(() => {
    const ahora = new Date();
    // Turnos por venir de cada serie, para decir cuál es el próximo.
    const turnos = new Map<string, Cita[]>();
    for (const c of this.citas()) {
      if (!c.recurrenciaId || !esActiva(c.estado) || inicioDeCita(c) <= ahora) continue;
      turnos.set(c.recurrenciaId, [...(turnos.get(c.recurrenciaId) ?? []), c]);
    }
    const filtro = this.filtroBarbero();
    const orden = (r: Recurrencia) => (fechaDesdeClave(r.desde).getDay() + 6) % 7; // de lunes a domingo
    return (this.lista() ?? [])
      .filter(r => !filtro || r.barberoId === filtro)
      .map(r => {
        const suyos = (turnos.get(r.id!) ?? []).sort(compararCitas);
        return {
          r,
          frecuencia: opcionDe(r.frecuencia) ?? FRECUENCIAS[0],
          dia: DIAS[fechaDesdeClave(r.desde).getDay()],
          horaStr: formatearHora12(parsearHora(r.hora) ?? 0),
          proximo: suyos.length ? diaDeCita(suyos[0]) : null,
          apartados: suyos.length,
          omitidas: r.activa ? (r.omitidas ?? []).filter(o => o.dia >= this.hoy) : [],
          alDia: estaAlDia(r),
        };
      })
      .sort((a, b) => Number(b.r.activa) - Number(a.r.activa) || orden(a.r) - orden(b.r)
        || a.r.hora.localeCompare(b.r.hora) || a.r.clienteNombre.localeCompare(b.r.clienteNombre, 'es'));
  });

  // --- Ventana de crear o editar ---

  readonly abierto = signal(false);
  readonly paso = signal<Paso>('cliente');
  readonly editando = signal<Recurrencia | null>(null);
  readonly busqueda = signal('');
  readonly creandoCliente = signal(false);
  readonly intentoCliente = signal(false);
  readonly nombre = signal('');
  readonly telefono = signal('');
  readonly servicioId = signal('');
  readonly barberoId = signal('');
  readonly frecuencia = signal<Frecuencia>('semanal');
  readonly diaSemana = signal<number | null>(null);
  /** Primer turno de la serie. */
  readonly desde = signal('');
  readonly duracion = signal(INTERVALO);
  readonly minutos = signal<number | null>(null);
  /** Además de los turnos de 40 min, las horas intermedias (cada 20). */
  readonly masHoras = signal(false);
  readonly intento = signal(false);
  readonly guardando = signal(false);

  readonly romano = computed(() => ROMANOS[this.paso()]);
  readonly nombrePaso = computed(() => ({ cliente: 'Cliente', servicio: 'Servicio', detalles: 'Agenda' })[this.paso()]);
  readonly puedeVolver = computed(() => this.paso() === 'servicio' || (this.paso() === 'detalles' && !this.editando()));

  readonly servicio = computed(() => this.servicios().find(s => s.id === this.servicioId()));
  readonly barbero = computed(() => this.barberos().find(b => b.id === this.barberoId()));
  readonly opcion = computed(() => opcionDe(this.frecuencia()) ?? FRECUENCIAS[0]);
  readonly duracionCatalogo = computed(() => (this.servicio() ? duracionDe(this.servicio()!) : INTERVALO));
  readonly celularValido = computed(() => !this.telefono().trim() || esCelularValido(this.telefono()));

  /** Clientes para elegir: de las citas, de las cuentas registradas y de las agendas recurrentes, sin repetir. */
  readonly contactos = computed<Contacto[]>(() => {
    const porClave = new Map<string, Contacto>();
    const clave = (nombre: string, telefono: string) => telefono || normalizar(nombre);
    const agregar = (nombre: string | undefined, telefono: string | undefined, reciente: string, detalle = '') => {
      const limpio = (nombre ?? '').trim().replace(/\s+/g, ' ');
      if (!limpio) return;
      const numero = limpiarCelular(telefono ?? '');
      const celular = /^3\d{9}$/.test(numero) ? numero : '';
      const id = clave(limpio, celular);
      const previo = porClave.get(id);
      // Se queda el nombre más reciente (puede que lo hayan corregido).
      if (!previo || reciente > previo.reciente) porClave.set(id, { clave: id, nombre: limpio, telefono: celular, detalle: detalle || previo?.detalle || '', fijas: 0, reciente });
      else if (detalle && !previo.detalle) previo.detalle = detalle;
    };
    for (const c of this.citas()) agregar(c.userName, c.phone, c.fecha ?? c.creadoEn ?? '');
    for (const u of this.usuarios()) if ((u.rol ?? 'cliente') === 'cliente') agregar(u.nombre, u.telefono, '', u.email ?? '');
    const recurrentes = this.lista() ?? [];
    for (const r of recurrentes) agregar(r.clienteNombre, r.clienteTelefono, r.actualizadoEn);
    for (const r of recurrentes) {
      const contacto = porClave.get(clave(r.clienteNombre.trim().replace(/\s+/g, ' '), r.clienteTelefono));
      if (contacto && r.activa) contacto.fijas++;
    }
    return [...porClave.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  readonly contactosFiltrados = computed(() => {
    const texto = this.busqueda().trim();
    if (!texto) return this.contactos();
    const q = normalizar(texto);
    const digitos = limpiarCelular(texto);
    return this.contactos().filter(c => normalizar(c.nombre).includes(q) || (digitos.length >= 3 && c.telefono.includes(digitos)));
  });

  /** Días que abre la barbería (de lunes a domingo), y si son el día libre del barbero elegido. */
  readonly diasAbiertos = computed(() => {
    const cerrados = this.ajustes.horario().diasCerrados;
    const libres = this.barbero()?.diasLibres ?? [];
    return [1, 2, 3, 4, 5, 6, 0].filter(d => !cerrados.includes(d)).map(d => ({ numero: d, nombre: DIAS[d], libre: libres.includes(d) }));
  });

  readonly diasLibres = computed(() => {
    const libres = this.diasAbiertos().filter(d => d.libre).map(d => d.nombre.toLowerCase());
    if (!libres.length) return '';
    return `${this.barbero()?.nombre ?? 'El barbero'} no atiende los ${libres.join(' ni los ')}.`;
  });

  /** Para elegir el primer turno: las próximas 4 fechas de ese día (y, al editar, la que le toca a la serie). */
  readonly fechasInicio = computed(() => {
    const dia = this.diaSemana();
    if (dia === null) return [];
    const fechas = proximosDias(dia, this.hoy, 4);
    const actual = this.desde();
    return actual && !fechas.includes(actual) && fechaDesdeClave(actual).getDay() === dia ? [...fechas, actual].sort() : fechas;
  });

  /** Los días que tendrá la serie con lo elegido: los que la Cloud Function intentará apartar. */
  readonly fechasSerie = computed(() => {
    const desde = this.desde();
    if (!desde || !this.abierto()) return [];
    return fechasDeLaSerie(desde, this.frecuencia(), desde > this.hoy ? desde : this.hoy, this.fin);
  });

  /** Bloques ocupados en esos días, en vivo: si alguien reserva mientras tanto, la hora se marca ocupada. null mientras llegan. */
  readonly ocupados = toSignal(
    toObservable(this.fechasSerie).pipe(
      map(dias => dias.join(',')),
      distinctUntilChanged(),
      switchMap(clave => (clave
        ? this.citasService.slotsDeDias(clave.split(',')).pipe(
            startWith(null),
            catchError(error => {
              console.error('Error cargando la agenda de esos días', error);
              return of<Slot[]>([]);
            }),
          )
        : of<Slot[]>([]))),
    ),
    { initialValue: null as Slot[] | null },
  );

  /**
   * Las horas de ese día de la semana (los turnos de 40 min desde la apertura, o cada 20 con "ver más") y cómo
   * están en las fechas de la serie: libre, ocupada en algunas (se apartan las demás), ocupada en todas o en el
   * descanso del barbero.
   */
  readonly horas = computed<HoraOpcion[]>(() => {
    const barbero = this.barbero();
    const dia = this.diaSemana();
    const ocupados = this.ocupados();
    if (!barbero?.id || dia === null || !this.desde() || ocupados === null) return [];
    const horario = this.ajustes.horario();
    const duracion = this.duracion();
    const paso = this.masHoras() ? BLOQUE : INTERVALO;
    const candidatos = new Set<number>();
    for (let t = aperturaDe(horario, dia); t + duracion <= horario.cierre; t += paso) candidatos.add(t);
    // La hora elegida se queda a la vista aunque no caiga en la rejilla (al editar, o tras cambiar la duración).
    const elegida = this.minutos();
    if (elegida !== null) candidatos.add(elegida);

    // Bloques del barbero por día, sin los de esta misma serie: al editarla, sus turnos se vuelven a apartar.
    const propia = this.editando()?.id;
    const porDia = new Map<string, Set<string>>();
    for (const s of ocupados) {
      if (s.barberoId !== barbero.id || (propia && s.citaId?.startsWith(`${propia}_`))) continue;
      if (!porDia.has(s.dia)) porDia.set(s.dia, new Set());
      porDia.get(s.dia)!.add(s.id);
    }
    const fechas = this.fechasSerie().filter(f => !estaCerrado(f, horario));
    const ahora = new Date();
    const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
    const descanso = barbero.descanso;

    return [...candidatos].sort((a, b) => a - b).map((t): HoraOpcion => {
      const etiqueta = formatearHora12(t);
      if (descanso && t < descanso.hasta && t + duracion > descanso.desde) {
        return { minutos: t, etiqueta, estado: 'descanso', elegible: false, choques: [], nota: 'Descanso' };
      }
      // Hoy, una hora que ya pasó no cuenta: la serie empieza en la fecha siguiente.
      const validas = fechas.filter(f => f !== this.hoy || t > minutosAhora);
      const choques = validas.filter(f => !estaLibre(barbero.id!, f, t, duracion, porDia.get(f) ?? new Set()));
      const estado: HoraOpcion['estado'] = choques.length === 0 ? 'libre' : choques.length < validas.length ? 'parcial' : 'ocupada';
      const nota = estado === 'libre' ? 'Libre' : estado === 'ocupada' ? 'Ocupada' : choques.length === 1 ? '1 fecha ocupada' : `${choques.length} ocupadas`;
      return { minutos: t, etiqueta, estado, elegible: estado !== 'ocupada' && validas.length > 0, choques, nota };
    });
  });

  readonly horaElegida = computed(() => this.horas().find(h => h.minutos === this.minutos()) ?? null);

  /** Qué turnos se van a apartar con lo elegido, cuáles no y por qué. */
  readonly vistaPrevia = computed(() => {
    const hora = this.horaElegida();
    if (!hora || !hora.elegible) return null;
    const horario = this.ajustes.horario();
    const ahora = new Date();
    const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
    const agendadas: string[] = [];
    const omitidas: OmitidaRecurrente[] = [];
    for (const f of this.fechasSerie()) {
      if (f === this.hoy && hora.minutos <= minutosAhora) continue;
      if (estaCerrado(f, horario)) omitidas.push({ dia: f, motivo: 'la barbería cierra' });
      else if (hora.choques.includes(f)) omitidas.push({ dia: f, motivo: 'esa hora ya está ocupada' });
      else agendadas.push(f);
    }
    const avisos: string[] = [];
    const dia = this.diaSemana();
    if (dia !== null && hora.minutos < aperturaDe(horario, dia)) avisos.push('Empieza antes de que abra la barbería.');
    if (hora.minutos + this.duracion() > horario.cierre) avisos.push(`Termina a las ${formatearHora12(hora.minutos + this.duracion())}, después del cierre.`);
    const lista = agendadas.slice(0, 4).map(fechaCorta).join(', ') + (agendadas.length > 4 ? ` y ${agendadas.length - 4} más, hasta el ${fechaCorta(agendadas[agendadas.length - 1])}` : '');
    return { agendadas, omitidas, avisos, lista, hora: hora.etiqueta };
  });

  /** Lo que falta para poder guardar ('' si está completo). */
  readonly faltante = computed(() => {
    if (!this.servicio()) return 'Elige el servicio.';
    if (!this.barbero()) return 'Elige el barbero.';
    if (this.diaSemana() === null) return 'Elige el día.';
    if (!this.desde()) return 'Elige la fecha del primer turno.';
    if (this.minutos() === null) return 'Elige la hora.';
    if (this.ocupados() === null) return 'Revisando las horas libres…';
    if (!this.horaElegida()?.elegible) return 'Esa hora ya no está libre: elige otra.';
    if (!this.nombre().trim()) return 'Escribe el nombre del cliente.';
    if (!this.celularValido()) return 'El celular debe tener 10 dígitos y empezar por 3.';
    return '';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.escuchaUsuarios?.unsubscribe());
  }

  whatsapp(telefono: string): string {
    return enlaceWhatsApp(telefono);
  }

  celular(telefono: string): string {
    return formatoCelular(telefono);
  }

  claseHora(h: HoraOpcion): string {
    if (h.minutos === this.minutos() && h.elegible) return 'border-acento-500 bg-acento-500 text-sobre-acento';
    switch (h.estado) {
      case 'libre': return 'border-white/10 text-white hover:border-white/30';
      case 'parcial': return 'border-detalle-400/40 text-detalle-200 hover:border-detalle-400/70';
      default: return 'border-white/5 bg-white/[0.02] text-neutral-600';
    }
  }

  // --- Abrir, pasos y cerrar ---

  abrirNueva() {
    this.limpiar();
    this.editando.set(null);
    this.paso.set('cliente');
    this.abierto.set(true);
    this.cargarUsuarios();
  }

  editar(r: Recurrencia) {
    this.limpiar();
    this.editando.set(r);
    this.nombre.set(r.clienteNombre);
    this.telefono.set(r.clienteTelefono ? formatoCelular(r.clienteTelefono) : '');
    this.servicioId.set(r.servicioId);
    this.barberoId.set(r.barberoId);
    this.frecuencia.set(r.frecuencia);
    const dia = fechaDesdeClave(r.desde).getDay();
    this.diaSemana.set(dia);
    // El próximo turno que le toca a la serie: así no se corre la quincena ni el mes.
    const siguiente = r.desde >= this.hoy ? r.desde : fechasDeLaSerie(r.desde, r.frecuencia, this.hoy, sumarDias(this.hoy, 28))[0];
    this.desde.set(siguiente ?? proximosDias(dia, this.hoy, 1)[0]);
    this.duracion.set(r.duracionMinutos);
    this.minutos.set(parsearHora(r.hora));
    this.paso.set('detalles');
    this.abierto.set(true);
  }

  cerrar() {
    this.abierto.set(false);
  }

  atras() {
    const paso = this.paso();
    if (paso === 'servicio') this.paso.set(this.editando() ? 'detalles' : 'cliente');
    else if (paso === 'detalles' && !this.editando()) this.paso.set('servicio');
    else this.cerrar();
  }

  // --- I. Cliente ---

  elegirContacto(contacto: Contacto) {
    this.nombre.set(contacto.nombre);
    this.telefono.set(contacto.telefono ? formatoCelular(contacto.telefono) : '');
    this.paso.set('servicio');
  }

  sinCliente() {
    this.nombre.set('');
    this.telefono.set('');
    this.paso.set('servicio');
  }

  /** Abre el formulario de cliente nuevo con lo que ya se escribió en la búsqueda (un nombre o un celular). */
  crearCliente() {
    const texto = this.busqueda().trim();
    const esNumero = /^[\d\s()+-]+$/.test(texto);
    this.nombre.set(esNumero ? '' : texto);
    this.telefono.set(esNumero ? texto : '');
    this.intentoCliente.set(false);
    this.creandoCliente.set(true);
  }

  usarClienteNuevo() {
    this.intentoCliente.set(true);
    if (!this.nombre().trim() || !this.celularValido()) return;
    this.creandoCliente.set(false);
    this.paso.set('servicio');
  }

  // --- II. Servicio ---

  elegirServicio(servicio: Servicio) {
    if (servicio.id !== this.servicioId()) this.duracion.set(duracionDe(servicio));
    this.servicioId.set(servicio.id!);
    if (!this.barbero()) this.barberoId.set(this.barberos()[0]?.id ?? '');
    this.paso.set('detalles');
  }

  // --- III. Agenda ---

  elegirBarbero(id: string) {
    this.barberoId.set(id);
    // Si el día elegido es su día libre, hay que elegir otro.
    const dia = this.diaSemana();
    if (dia !== null && this.barbero()?.diasLibres?.includes(dia)) {
      this.diaSemana.set(null);
      this.desde.set('');
    }
  }

  elegirDia(dia: number) {
    this.diaSemana.set(dia);
    if (!this.desde() || fechaDesdeClave(this.desde()).getDay() !== dia) this.desde.set(proximosDias(dia, this.hoy, 1)[0]);
    // Una hora que ese día queda fuera del horario (abre más tarde) se suelta.
    const minutos = this.minutos();
    const horario = this.ajustes.horario();
    if (minutos !== null && (minutos < aperturaDe(horario, dia) || minutos + this.duracion() > horario.cierre)) this.minutos.set(null);
  }

  cambiarDuracion(delta: number) {
    this.duracion.update(d => Math.min(DURACION_MAXIMA, Math.max(DURACION_MINIMA, d + delta)));
  }

  async guardar() {
    this.intento.set(true);
    if (this.faltante()) return;
    const servicio = this.servicio()!;
    const barbero = this.barbero()!;
    const minutos = this.minutos()!;
    const editando = this.editando();
    const datos: DatosRecurrencia = {
      clienteNombre: this.nombre().trim().replace(/\s+/g, ' ').slice(0, 120),
      clienteTelefono: this.telefono().trim() ? limpiarCelular(this.telefono()) : '',
      servicioId: servicio.id!,
      serviceName: servicio.nombre.slice(0, 120),
      precio: Number(servicio.precio) || 0,
      duracionMinutos: this.duracion(),
      barberoId: barbero.id!,
      barberoNombre: barbero.nombre.slice(0, 80),
      frecuencia: this.frecuencia(),
      hora: minutosAHora24(minutos),
      desde: this.desde(),
      activa: editando?.activa ?? true,
    };
    this.guardando.set(true);
    try {
      if (editando) await this.recurrencias.actualizar(editando.id!, datos);
      else await this.recurrencias.crear(datos);
      this.cerrar();
      const cuando = `${this.opcion().detalle.toLowerCase()}, los ${DIAS[this.diaSemana()!].toLowerCase()} a las ${formatearHora12(minutos)}`;
      this.notificaciones.exito(editando ? 'Agenda actualizada' : 'Agenda recurrente creada', `${datos.clienteNombre}: ${cuando}. Sus turnos se están apartando en la agenda.`);
    } catch (error) {
      console.error('Error guardando la agenda recurrente', error);
      this.notificaciones.error('No se pudo guardar la agenda', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.guardando.set(false);
    }
  }

  // --- Desde la lista ---

  async pausar(r: Recurrencia) {
    if (r.activa) {
      const seguro = await this.confirmar.preguntar({
        titulo: `¿Pausar la agenda de ${r.clienteNombre}?`,
        texto: 'Se sueltan sus turnos por venir y esas horas quedan libres para otros clientes. Cuando la reanudes, se vuelven a apartar.',
        aceptar: 'Sí, pausar',
      });
      if (!seguro) return;
    }
    try {
      await this.recurrencias.pausar(r.id!, !r.activa);
      this.notificaciones.exito(r.activa ? 'Agenda en pausa' : 'Agenda reanudada', r.activa ? 'Sus horas quedan libres.' : 'Sus turnos se están apartando otra vez.');
    } catch (error) {
      console.error('Error pausando la agenda recurrente', error);
      this.notificaciones.error('No se pudo cambiar la agenda', 'Revisa tu conexión e inténtalo de nuevo.');
    }
  }

  async eliminar(t: Tarjeta) {
    const seguro = await this.confirmar.preguntar({
      titulo: `¿Eliminar la agenda recurrente de ${t.r.clienteNombre}?`,
      texto: `${t.apartados ? `Se quitan sus ${t.apartados === 1 ? 'turno' : t.apartados + ' turnos'} por venir y esas horas quedan libres.` : 'No tiene turnos por venir.'} Los que ya pasaron se quedan en la agenda y en las ganancias.`,
      aceptar: 'Sí, eliminar',
      peligro: true,
    });
    if (!seguro) return;
    try {
      await this.recurrencias.eliminar(t.r.id!);
      this.notificaciones.exito('Agenda eliminada', 'Sus turnos por venir se están quitando de la agenda.');
    } catch (error) {
      console.error('Error eliminando la agenda recurrente', error);
      this.notificaciones.error('No se pudo eliminar la agenda', 'Revisa tu conexión e inténtalo de nuevo.');
    }
  }

  // --- Internos ---

  private limpiar() {
    this.busqueda.set('');
    this.creandoCliente.set(false);
    this.intentoCliente.set(false);
    this.nombre.set('');
    this.telefono.set('');
    this.servicioId.set('');
    this.barberoId.set(this.barberos()[0]?.id ?? '');
    this.frecuencia.set('semanal');
    this.diaSemana.set(null);
    this.desde.set('');
    this.duracion.set(INTERVALO);
    this.minutos.set(null);
    this.masHoras.set(false);
    this.intento.set(false);
    this.guardando.set(false);
  }

  private cargarUsuarios() {
    if (this.escuchaUsuarios) return;
    this.escuchaUsuarios = this.usuariosService.listar().subscribe({
      next: usuarios => this.usuarios.set(usuarios),
      error: error => console.error('Error cargando los clientes registrados', error),
    });
  }
}
