import { Component, HostListener, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, RouterOutlet, RouterLink, Router } from '@angular/router';
import { AsyncPipe, NgClass } from '@angular/common';
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CLIENTE } from '../../config/cliente';
import { MarcaComponent } from '../../shared/components/marca/marca.component';
import { IconoComponent } from '../../shared/components/icono/icono.component';
import { RedSocialComponent } from '../../shared/components/red-social/red-social.component';
import { resumenHorario } from '../../core/utils/horario';
import { DesplazamientoService } from '../../core/services/desplazamiento.service';
import { AjustesService } from '../../core/services/ajustes.service';
import { ConsentimientoService } from '../../core/services/consentimiento.service';
import { InstalacionService } from '../../core/services/instalacion.service';
import { MarcoService } from '../../core/services/marco.service';
import { BarraInferiorComponent } from './barra-inferior.component';

interface EnlaceNav {
  texto: string;
  ruta?: string;
  fragmento?: string;
  /** Enlace a otra página (se abre en una pestaña nueva). */
  externo?: string;
}

@Component({
  selector: 'app-client-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, AsyncPipe, NgClass, MarcaComponent, IconoComponent, RedSocialComponent, BarraInferiorComponent],
  template: `
    <a href="#contenido" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-acento-500 focus:px-5 focus:py-3 focus:text-sm focus:font-extrabold focus:text-sobre-acento">Saltar al contenido</a>

    <header class="sticky top-0 z-50 w-full backdrop-blur-xl transition-all duration-500 border-b"
            [ngClass]="isMobileMenuOpen ? 'bg-neutral-950 border-white/10'
              : conScroll ? 'bg-neutral-950/90 border-white/10 shadow-2xl shadow-black/40' : 'bg-neutral-950/60 border-transparent'">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-20 gap-3">

          <!-- Marca -->
          <a routerLink="/" (click)="alNavegar({ texto: 'Inicio', ruta: '/' })" class="flex-shrink-0 hover:opacity-80 transition-opacity duration-300"
             [class.marca-compacta]="!!(auth.currentUserProfile$ | async)" [attr.aria-label]="cliente.nombre + ', ir al inicio'">
            <span class="text-lg sm:text-xl md:text-2xl text-white"><app-marca claseLogo="w-10 h-10" /></span>
          </a>

          <!-- Navegación (escritorio) -->
          <nav class="hidden xl:flex items-center gap-7" aria-label="Principal">
            @for (link of links(); track link.texto) {
              @if (link.externo) {
                <a [href]="link.externo" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-[13px] font-bold text-neutral-400 hover:text-white tracking-wide transition-colors">
                  {{ link.texto }}
                  <app-icono nombre="externo" class="h-3 w-3" [grosor]="2.4" />
                </a>
              } @else {
                <a [routerLink]="link.ruta" [fragment]="link.fragmento" (click)="alNavegar(link)" class="relative text-[13px] font-bold text-neutral-400 hover:text-white tracking-wide transition-colors after:absolute after:left-0 after:-bottom-1.5 after:h-px after:w-0 after:bg-detalle-400 after:transition-all hover:after:w-full">{{ link.texto }}</a>
              }
            }
          </nav>

          <!-- Cuenta, reservar y menú -->
          <div class="flex items-center gap-2 sm:gap-3">
            @if (auth.currentUserProfile$ | async; as user) {
              <div class="hidden md:flex items-center gap-2">
                @if (user.rol === 'admin') {
                  <a routerLink="/admin" class="boton-oro boton-chico">Panel</a>
                }
                @if (user.rol === 'barbero') {
                  <a routerLink="/barbero" class="boton-oro boton-chico">Mi panel</a>
                }
                <a routerLink="/mis-citas" class="px-2 text-right">
                  <span class="block text-xs font-bold text-white leading-tight">{{ user.nombre.split(' ')[0] }}</span>
                  <span class="block text-[11px] font-semibold text-neutral-400 hover:text-white transition-colors">Mis reservas</span>
                </a>
                <button type="button" (click)="logout()" title="Cerrar sesión" aria-label="Cerrar sesión" class="boton-icono !border-transparent">
                  <app-icono nombre="salir" class="h-5 w-5" [grosor]="1.8" />
                </button>
              </div>
              <!-- Celular: las reservas siempre a un toque -->
              <a routerLink="/mis-citas" class="boton-linea boton-chico !px-3 md:hidden">Mis reservas</a>
            } @else {
              <a routerLink="/login" (pointerdown)="auth.prepararGoogle()" class="enlace-toque text-sm font-bold text-neutral-300 hover:text-white transition-colors px-2">Ingresar</a>
            }

            <a routerLink="/reservar" class="boton-acento hidden sm:inline-flex !py-2.5 !px-5">
              Reservar
              <app-icono nombre="calendario" class="h-4 w-4" [grosor]="2.2" />
            </a>

            <button type="button" (click)="isMobileMenuOpen = !isMobileMenuOpen" class="boton-icono !h-11 !w-11 !rounded-full xl:hidden" [attr.aria-expanded]="isMobileMenuOpen" aria-controls="menu-movil" [attr.aria-label]="isMobileMenuOpen ? 'Cerrar el menú' : 'Abrir el menú'">
              <app-icono [nombre]="isMobileMenuOpen ? 'cerrar' : 'menu'" class="h-5 w-5 text-white" [grosor]="2" />
            </button>
          </div>
        </div>
      </div>

      <!-- Menú desplegable (celular y tableta). Fondo sólido: se abre encima de la página y nada debe traslucirse. -->
      @if (isMobileMenuOpen) {
        <div id="menu-movil" class="xl:hidden absolute left-0 w-full max-h-[calc(100svh-5rem)] overflow-y-auto overscroll-contain border-y border-white/10 bg-neutral-950 shadow-2xl shadow-black animate-in fade-in slide-in-from-top-2 duration-200">
          <div class="flex flex-col px-4 pt-2 pb-6">
            @if (auth.currentUserProfile$ | async; as user) {
              <div class="my-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-4">
                <p class="text-sm font-bold text-white">Hola, {{ user.nombre }}</p>
                @if (user.email) { <p class="text-xs text-neutral-400 truncate">{{ user.email }}</p> }
                <div class="mt-3 flex flex-wrap gap-2">
                  <a routerLink="/mis-citas" (click)="isMobileMenuOpen = false" class="boton-linea boton-chico">Mis reservas</a>
                  @if (user.rol === 'admin') {
                    <a routerLink="/admin" (click)="isMobileMenuOpen = false" class="boton-oro boton-chico">Panel</a>
                  }
                  @if (user.rol === 'barbero') {
                    <a routerLink="/barbero" (click)="isMobileMenuOpen = false" class="boton-oro boton-chico">Mi panel</a>
                  }
                  <button type="button" (click)="logout(); isMobileMenuOpen = false" class="boton-linea boton-chico">Salir</button>
                </div>
              </div>
            }
            @for (link of links(); track link.texto) {
              @if (link.externo) {
                <a [href]="link.externo" target="_blank" rel="noopener" (click)="isMobileMenuOpen = false" class="flex min-h-[3.25rem] items-center justify-between border-b border-white/10 px-4 text-base font-bold text-white active:bg-white/[0.06]">
                  {{ link.texto }}
                  <app-icono nombre="externo" class="h-4 w-4 text-neutral-400" [grosor]="2" />
                </a>
              } @else {
                <a [routerLink]="link.ruta" [fragment]="link.fragmento" (click)="alNavegar(link)" class="flex min-h-[3.25rem] items-center justify-between border-b border-white/10 px-4 text-base font-bold text-white active:bg-white/[0.06]">
                  {{ link.texto }}
                  <app-icono nombre="atras" class="h-4 w-4 rotate-180 text-neutral-500" [grosor]="2" />
                </a>
              }
            }
            <a routerLink="/reservar" (click)="isMobileMenuOpen = false" class="boton-acento mt-5 !py-3.5">Reservar turno</a>
            @if (!instalacion.instalada()) {
              <a routerLink="/instalar" (click)="isMobileMenuOpen = false" class="boton-linea mt-3 !py-3">
                <app-icono nombre="descargar" class="h-4 w-4" [grosor]="2" /> Instalar la app
              </a>
            }
          </div>
        </div>
      }
    </header>

    <!-- Con el menú abierto, la página queda oscurecida detrás y un toque fuera lo cierra.
         Va fuera del encabezado: dentro de él no cubriría la pantalla (el desenfoque lo convierte en su marco). -->
    @if (isMobileMenuOpen) {
      <div class="fixed inset-0 z-[45] touch-none bg-black/75 animate-in fade-in duration-200 xl:hidden" (click)="isMobileMenuOpen = false" aria-hidden="true"></div>
    }

    <main id="contenido" class="flex-grow">
      <router-outlet></router-outlet>
    </main>

    <footer class="relative overflow-hidden bg-black border-t border-white/10 mt-auto">
      @if (cliente.simbolo) {
        <div class="marca-de-agua absolute -right-10 -top-6 h-80 w-80" [style.--simbolo]="'url(' + cliente.simbolo + ')'"></div>
      }
      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid grid-cols-1 md:grid-cols-3 gap-10">
        <div>
          <span class="text-2xl text-white"><app-marca claseLogo="w-12 h-12" /></span>
          <p class="text-neutral-400 text-sm mt-4 max-w-xs leading-relaxed">{{ cliente.hero.subtitulo }}</p>
          <a [href]="cliente.instagram.url" target="_blank" rel="noopener" class="enlace-toque mt-4 text-sm font-bold text-detalle-200 hover:text-white transition-colors">
            <app-red-social red="instagram" class="h-4 w-4" /> &#64;{{ cliente.instagram.usuario }}
          </a>
        </div>
        <nav aria-label="Pie de página">
          <h2 class="rotulo mb-4">Explora</h2>
          <ul class="text-sm">
            @for (link of links(); track link.texto) {
              @if (link.externo) {
                <li><a [href]="link.externo" target="_blank" rel="noopener" class="enlace-toque sm:py-1 text-neutral-300 hover:text-white transition-colors">{{ link.texto }} <app-icono nombre="externo" class="h-3.5 w-3.5" [grosor]="2.2" /></a></li>
              } @else {
                <li><a [routerLink]="link.ruta" [fragment]="link.fragmento" (click)="alNavegar(link)" class="enlace-toque sm:py-1 text-neutral-300 hover:text-white transition-colors">{{ link.texto }}</a></li>
              }
            }
            <li><a routerLink="/reservar" class="enlace-toque sm:py-1 text-neutral-300 hover:text-white transition-colors">Reservar turno</a></li>
            @if (!instalacion.instalada()) {
              <li><a routerLink="/instalar" class="enlace-toque sm:py-1 text-neutral-300 hover:text-white transition-colors">Instalar la app</a></li>
            }
          </ul>
        </nav>
        <div>
          <h2 class="rotulo mb-4">Visítanos</h2>
          <ul class="space-y-2.5 text-sm text-neutral-300">
            @if (cliente.ubicacion; as ubicacion) {
              <li><a [href]="ubicacion.mapaUrl" target="_blank" rel="noopener" class="hover:text-white transition-colors">{{ ubicacion.direccion }}</a></li>
            }
            @for (fila of horario(); track fila.dias) {
              <li class="grid grid-cols-[4.5rem_1fr] gap-3 max-w-xs"><span class="text-neutral-500">{{ fila.dias }}</span><span [class.text-neutral-500]="!fila.abierto">{{ fila.horas }}</span></li>
            }
          </ul>
        </div>
      </div>
      <div class="relative border-t border-white/5 py-5 px-4 flex flex-col md:flex-row flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs text-neutral-500">
        <span>&copy; {{ anio }} {{ cliente.nombre }}</span>
        <a routerLink="/politica-de-datos" class="enlace-toque hover:text-neutral-200 transition-colors">Política de tratamiento de datos</a>
        <button type="button" (click)="consentimiento.abrirPreferencias()" class="enlace-toque hover:text-neutral-200 transition-colors">Preferencias de cookies</button>
        @if (cliente.firma; as firma) {
          <span>Diseño y desarrollo ·
            @if (firma.url) { <a [href]="firma.url" target="_blank" rel="noopener" class="font-bold text-neutral-400 hover:text-white transition-colors">{{ firma.texto }}</a> }
            @else { <span class="font-bold text-neutral-400">{{ firma.texto }}</span> }
          </span>
        }
      </div>
    </footer>

    <!-- Accesos rápidos (celular). Fuera del encabezado: dentro de él no quedarían fijos a la pantalla. -->
    @if (barraVisible()) {
      <app-barra-inferior />
    }
  `,
  host: {
    class: 'flex flex-col min-h-screen bg-neutral-950'
  }
})
export class ClientLayoutComponent {
  readonly cliente = CLIENTE;
  readonly anio = new Date().getFullYear();
  private ajustesService = inject(AjustesService);
  private ajustes = this.ajustesService.ajustes;
  readonly horario = computed(() => resumenHorario(this.ajustesService.horario()));
  readonly consentimiento = inject(ConsentimientoService);
  readonly instalacion = inject(InstalacionService);
  private marco = inject(MarcoService);

  /**
   * Los accesos rápidos se quitan mientras hay otra cosa fija abajo: el aviso de cookies o la barra de
   * confirmar la reserva.
   */
  readonly barraVisible = computed(() =>
    !this.marco.barraPropia() && this.consentimiento.decidido() && !this.consentimiento.configurando());

  readonly links = computed<EnlaceNav[]>(() => {
    const { cursos } = this.ajustes();
    return [
      { texto: 'Inicio', ruta: '/' },
      { texto: 'Servicios', ruta: '/servicios' },
      { texto: 'Equipo', ruta: '/', fragmento: 'equipo' },
      { texto: 'Galería', ruta: '/', fragmento: 'galeria' },
      { texto: 'Contacto', ruta: '/', fragmento: 'contacto' },
      ...(cursos.activo && cursos.url ? [{ texto: 'Cursos', externo: cursos.url }] : []),
    ];
  });

  isMobileMenuOpen = false;
  conScroll = false;
  auth = inject(AuthService);
  router = inject(Router);
  private desplazamiento = inject(DesplazamientoService);

  constructor() {
    // Al cambiar de página el menú no se queda abierto encima.
    this.router.events.pipe(filter(e => e instanceof NavigationStart), takeUntilDestroyed()).subscribe(() => (this.isMobileMenuOpen = false));
  }

  @HostListener('window:scroll')
  alDesplazar() {
    this.conScroll = window.scrollY > 24;
  }

  @HostListener('document:keydown.escape')
  cerrarMenu() {
    this.isMobileMenuOpen = false;
  }

  /**
   * El routerLink navega; si ya estamos en el inicio y el enlace apunta a él, la URL
   * puede no cambiar (mismo #fragmento), así que el desplazamiento se hace aquí.
   */
  alNavegar(link: EnlaceNav) {
    this.isMobileMenuOpen = false;
    const enInicio = this.router.url.split(/[?#]/)[0] === '/';
    if (!enInicio || link.ruta !== '/') return;
    if (link.fragmento) this.desplazamiento.irASeccion(link.fragmento);
    else this.desplazamiento.irArriba();
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/']);
  }
}
