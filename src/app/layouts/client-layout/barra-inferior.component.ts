import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { NgClass } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { CLIENTE } from '../../config/cliente';
import { AjustesService } from '../../core/services/ajustes.service';
import { AuthService } from '../../core/services/auth.service';
import { estadoDelNegocio, resumenHorario } from '../../core/utils/horario';
import { IconoComponent } from '../../shared/components/icono/icono.component';
import { RedSocialComponent } from '../../shared/components/red-social/red-social.component';

/**
 * Accesos rápidos fijos abajo en celular (respeta la zona segura del iPhone): servicios, reservar, horario y
 * el contacto directo. "Horario" abre una hoja con el estado de hoy, la semana y hasta cuándo está abierta la
 * agenda, sin sacar a nadie de donde está (por ejemplo, a mitad de una reserva).
 * Al equipo (admin y barberos) le aparece además "Panel" en el centro, para entrar a su panel de un toque.
 */
@Component({
  selector: 'app-barra-inferior',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgClass, IconoComponent, RedSocialComponent],
  host: { class: 'block md:hidden', '(document:keydown.escape)': 'cerrar()' },
  template: `
    <!-- Guarda el alto de la barra al final de la página, para que no tape el pie -->
    <div class="h-[calc(4rem+env(safe-area-inset-bottom))] bg-black" aria-hidden="true"></div>

    <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-neutral-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl" aria-label="Accesos rápidos">
      <ul class="mx-auto grid max-w-md" [ngClass]="panel() ? 'grid-cols-5' : 'grid-cols-4'">
        <li>
          <a routerLink="/servicios" routerLinkActive="activo" ariaCurrentWhenActive="page" class="acceso">
            <span class="acceso-icono"><app-icono nombre="tijeras" class="h-6 w-6" [grosor]="1.7" /></span>
            Servicios
          </a>
        </li>
        <li>
          <a routerLink="/reservar" routerLinkActive="activo" ariaCurrentWhenActive="page" class="acceso">
            <span class="acceso-icono acceso-principal"><app-icono nombre="calendario" class="h-[18px] w-[18px]" [grosor]="2.2" /></span>
            Reservar
          </a>
        </li>
        @if (panel(); as ruta) {
          <!-- Solo el equipo: su panel, en el centro de la barra -->
          <li>
            <a [routerLink]="ruta" class="acceso acceso-equipo">
              <span class="acceso-icono acceso-panel"><app-icono nombre="tablero" class="h-[18px] w-[18px]" [grosor]="2" /></span>
              Panel
            </a>
          </li>
        }
        <li>
          <button #botonHorario type="button" class="acceso w-full" (click)="abierta.set(true)" aria-haspopup="dialog" [attr.aria-expanded]="abierta()">
            <span class="acceso-icono relative">
              <app-icono nombre="reloj" class="h-6 w-6" [grosor]="1.7" />
              <!-- Punto verde: abierto en este momento -->
              <span class="absolute right-0 top-0.5 h-2 w-2 rounded-full ring-2 ring-neutral-950" [ngClass]="estado().abierto ? 'bg-emerald-400' : 'bg-neutral-500'"></span>
            </span>
            Horario
          </button>
        </li>
        <li>
          @if (whatsapp) {
            <a [href]="whatsapp" target="_blank" rel="noopener" class="acceso">
              <span class="acceso-icono"><app-red-social red="whatsapp" class="h-6 w-6" /></span>
              WhatsApp
            </a>
          } @else {
            <a [href]="cliente.instagram.url" target="_blank" rel="noopener" class="acceso">
              <span class="acceso-icono"><app-red-social red="instagram" class="h-6 w-6" /></span>
              Instagram
            </a>
          }
        </li>
      </ul>
    </nav>

    @if (abierta()) {
      <div class="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="horario-titulo">
        <div class="absolute inset-0 touch-none bg-black/75 backdrop-blur-sm animate-in fade-in duration-200" (click)="cerrar()"></div>
        <div class="relative max-h-[88svh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-b-0 border-white/10 bg-neutral-950 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-300">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="rotulo">{{ cliente.nombre }}</p>
              <h2 id="horario-titulo" class="mt-1 font-display text-2xl font-black text-white">Horario</h2>
            </div>
            <button #botonCerrar type="button" (click)="cerrar()" class="boton-icono !rounded-full" aria-label="Cerrar el horario">
              <app-icono nombre="cerrar" class="h-5 w-5" [grosor]="2" />
            </button>
          </div>

          <p class="mt-4 inline-flex items-center gap-2.5 rounded-full border px-4 py-2 text-sm font-bold"
             [ngClass]="estado().abierto ? 'border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-200' : 'border-white/10 bg-white/[0.03] text-neutral-300'">
            <span class="h-2.5 w-2.5 rounded-full" [ngClass]="estado().abierto ? 'bg-emerald-400' : 'bg-neutral-500'"></span>
            {{ estado().texto }}
          </p>

          <ul class="mt-5 divide-y divide-white/5 rounded-2xl border border-white/10">
            @for (fila of horario(); track fila.dias) {
              <li class="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span class="font-medium" [ngClass]="fila.incluye.includes(estado().dia) ? 'text-white' : 'text-neutral-400'">
                  {{ fila.dias }}
                  @if (fila.incluye.includes(estado().dia)) { <span class="chip-oro ml-2 !py-0.5">Hoy</span> }
                </span>
                <span class="font-bold" [ngClass]="fila.abierto ? 'text-white' : 'text-neutral-500'">{{ fila.horas }}</span>
              </li>
            }
          </ul>

          @if (periodo().porPeriodo) {
            <p class="mt-4 flex items-start gap-2.5 text-sm" [ngClass]="periodo().abierta ? 'text-detalle-200' : 'text-neutral-400'">
              <app-icono nombre="calendario" class="mt-0.5 h-4 w-4 shrink-0" [grosor]="2" />
              <span>{{ periodo().texto }}.@if (!periodo().abierta) { Pronto abrimos nuevas fechas. }</span>
            </p>
          }

          @if (cliente.ubicacion; as ubicacion) {
            <a [href]="ubicacion.mapaUrl" target="_blank" rel="noopener" (click)="cerrar()" class="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <app-icono nombre="pin" class="h-5 w-5 shrink-0 text-detalle-300" [grosor]="2" />
              <span class="flex-1 text-sm text-neutral-300">{{ ubicacion.direccion }}</span>
              <span class="shrink-0 text-xs font-bold text-detalle-200">Cómo llegar</span>
            </a>
          }

          <a routerLink="/reservar" (click)="cerrar()" class="boton-acento mt-5 w-full !py-3.5">
            Reservar turno
            <app-icono nombre="calendario" class="h-4 w-4" [grosor]="2.2" />
          </a>
        </div>
      </div>
    }
  `,
  styles: `
    .acceso {
      position: relative;
      display: flex;
      height: 4rem;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.125rem;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: rgb(212 212 212);
      transition: color 0.2s;
    }
    .acceso:active,
    .acceso.activo {
      color: rgb(var(--detalle-200));
    }
    /* Filete dorado sobre el acceso de la página en la que se está. */
    .acceso.activo::before {
      content: '';
      position: absolute;
      top: -1px;
      left: 30%;
      right: 30%;
      height: 1px;
      background: rgb(var(--detalle-400));
    }
    .acceso-icono {
      display: grid;
      height: 2rem;
      width: 2rem;
      place-items: center;
    }
    /* Reservar es lo que más se busca: va en plata, como los botones principales. */
    .acceso-principal {
      border-radius: 9999px;
      background: rgb(var(--acento-500));
      color: rgb(var(--sobre-acento));
    }
    /* El panel del equipo va en dorado, como el botón "Panel" del encabezado. */
    .acceso-equipo {
      color: rgb(var(--detalle-200));
    }
    .acceso-panel {
      border-radius: 9999px;
      border: 1px solid rgb(var(--detalle-400) / 0.7);
      background: rgb(var(--detalle-500) / 0.14);
    }
  `,
})
export class BarraInferiorComponent {
  private ajustes = inject(AjustesService);
  /** Ruta del panel de quien tiene la sesión: el del admin o el del barbero. null para clientes y visitantes. */
  readonly panel = toSignal(inject(AuthService).currentUserProfile$.pipe(
    map(perfil => (perfil?.rol === 'admin' ? '/admin' : perfil?.rol === 'barbero' ? '/barbero' : null)),
  ), { initialValue: null });
  private botonHorario = viewChild<ElementRef<HTMLButtonElement>>('botonHorario');
  private botonCerrar = viewChild<ElementRef<HTMLButtonElement>>('botonCerrar');

  readonly cliente = CLIENTE;
  readonly whatsapp = CLIENTE.whatsapp
    ? `https://wa.me/${CLIENTE.whatsapp}?text=${encodeURIComponent(`Hola ${CLIENTE.nombre}, tengo una pregunta.`)}`
    : null;

  /** Hoja del horario. */
  readonly abierta = signal(false);

  // "Abierto ahora" se revisa cada minuto (en la hora de Colombia, esté donde esté quien mira).
  private readonly ahora = signal(new Date());
  readonly horario = computed(() => resumenHorario(this.ajustes.horario()));
  readonly estado = computed(() => estadoDelNegocio(this.ahora(), this.ajustes.horario()));
  readonly periodo = this.ajustes.periodo;

  constructor() {
    const reloj = setInterval(() => this.ahora.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
    // Al cambiar de página la hoja no se queda encima.
    inject(Router).events.pipe(filter(e => e instanceof NavigationStart), takeUntilDestroyed()).subscribe(() => this.abierta.set(false));
    // El teclado entra a la hoja al abrirla.
    effect(() => {
      if (this.abierta()) setTimeout(() => this.botonCerrar()?.nativeElement.focus());
    });
  }

  cerrar() {
    if (!this.abierta()) return;
    this.abierta.set(false);
    this.botonHorario()?.nativeElement.focus();
  }
}
