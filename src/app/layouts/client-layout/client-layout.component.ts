import { Component, HostListener, computed, inject } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { CLIENTE } from '../../config/cliente';
import { MarcaComponent } from '../../shared/components/marca/marca.component';
import { resumenHorario } from '../../core/utils/horario';
import { DesplazamientoService } from '../../core/services/desplazamiento.service';
import { AjustesService } from '../../core/services/ajustes.service';

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
  imports: [RouterOutlet, RouterLink, CommonModule, MarcaComponent],
  template: `
    <header class="sticky top-0 z-50 w-full backdrop-blur-xl transition-all duration-500 border-b"
            [ngClass]="conScroll ? 'bg-neutral-950/90 border-white/10 shadow-2xl shadow-black/40' : 'bg-neutral-950/60 border-transparent'">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-20 gap-4">

          <!-- Logo -->
          <a routerLink="/" class="flex-shrink-0 hover:opacity-80 transition-opacity duration-300">
            <span class="text-xl md:text-2xl text-white"><app-marca claseLogo="w-10 h-10" /></span>
          </a>

          <!-- Navegación Central (Desktop) -->
          <nav class="hidden xl:flex items-center gap-7">
            @for (link of links(); track link.texto) {
              @if (link.externo) {
                <a [href]="link.externo" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-[13px] font-bold text-neutral-400 hover:text-white tracking-wide transition-colors">
                  {{ link.texto }}
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M7 17L17 7M8 7h9v9"/></svg>
                </a>
              } @else {
                <a [routerLink]="link.ruta" [fragment]="link.fragmento" (click)="alNavegar(link)" class="relative text-[13px] font-bold text-neutral-400 hover:text-white tracking-wide transition-colors after:absolute after:left-0 after:-bottom-1.5 after:h-px after:w-0 after:bg-detalle-400 after:transition-all hover:after:w-full">{{ link.texto }}</a>
              }
            }
          </nav>

          <!-- Acciones (Auth + Reservar + Hamburguesa) -->
          <div class="flex items-center gap-3">
            @if (auth.currentUserProfile$ | async; as user) {
              <div class="hidden md:flex items-center gap-2">
                @if (user.rol === 'admin') {
                  <a routerLink="/admin" class="text-xs font-bold text-acento-500 border border-acento-500/30 hover:bg-acento-500/10 px-3 py-2 rounded-lg transition-colors">Panel</a>
                }
                @if (user.rol === 'barbero') {
                  <a routerLink="/barbero" class="text-xs font-bold text-acento-500 border border-acento-500/30 hover:bg-acento-500/10 px-3 py-2 rounded-lg transition-colors">Mi Panel</a>
                }
                <div class="text-right px-2">
                  <span class="block text-xs font-bold text-white leading-tight">{{ user.nombre.split(' ')[0] }}</span>
                  <span class="block text-[10px] font-semibold text-neutral-500">
                    <a routerLink="/mis-citas" class="hover:text-neutral-200 transition-colors">Reservas</a>
                  </span>
                </div>
                <button (click)="logout()" title="Cerrar sesión" class="p-2 text-neutral-500 hover:text-white transition-colors">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                </button>
              </div>
            } @else {
              <a routerLink="/login" class="hidden md:inline-block text-sm font-bold text-neutral-400 hover:text-white transition-colors px-2">Ingresar</a>
            }

            <a routerLink="/reservar" class="hidden sm:inline-flex items-center gap-2 bg-acento-500 hover:bg-acento-400 text-sobre-acento font-black text-sm py-2.5 px-5 rounded-full transition-all duration-300 hover:shadow-lg hover:shadow-acento-500/25 active:scale-95">
              Reservar
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            </a>

            <button (click)="isMobileMenuOpen = !isMobileMenuOpen" class="p-2 border border-white/15 rounded-full hover:bg-white/10 transition-colors active:scale-95 xl:hidden text-white" aria-label="Menú">
              @if (isMobileMenuOpen) {
                <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              } @else {
                <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
              }
            </button>
          </div>
        </div>
      </div>

      <!-- Menú Desplegable (Móvil) -->
      @if (isMobileMenuOpen) {
        <div class="xl:hidden bg-neutral-950/95 backdrop-blur-xl border-t border-white/10 absolute w-full left-0 max-h-[calc(100svh-5rem)] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
          <div class="flex flex-col px-4 pt-2 pb-6">
            @if (auth.currentUserProfile$ | async; as user) {
              <div class="px-4 py-4 vidrio rounded-2xl my-3">
                <p class="text-sm font-bold text-white">Hola, {{ user.nombre }}</p>
                <p class="text-xs text-neutral-500 mb-3">{{ user.email }}</p>
                <div class="flex flex-wrap gap-2">
                  <a routerLink="/mis-citas" (click)="isMobileMenuOpen = false" class="text-xs font-bold text-neutral-200 border border-white/15 px-3 py-1.5 rounded-lg">Mis reservas</a>
                  @if (user.rol === 'admin') {
                    <a routerLink="/admin" (click)="isMobileMenuOpen = false" class="text-xs font-bold text-acento-500 border border-acento-500/30 px-3 py-1.5 rounded-lg">Panel</a>
                  }
                  @if (user.rol === 'barbero') {
                    <a routerLink="/barbero" (click)="isMobileMenuOpen = false" class="text-xs font-bold text-acento-500 border border-acento-500/30 px-3 py-1.5 rounded-lg">Mi Panel</a>
                  }
                  <button (click)="logout(); isMobileMenuOpen = false" class="text-xs font-bold text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg">Salir</button>
                </div>
              </div>
            } @else {
              <a routerLink="/login" (click)="isMobileMenuOpen = false" class="block px-4 py-3.5 text-sm font-bold text-acento-500 border-b border-white/5">Ingresar a mi cuenta</a>
            }
            @for (link of links(); track link.texto) {
              @if (link.externo) {
                <a [href]="link.externo" target="_blank" rel="noopener" (click)="isMobileMenuOpen = false" class="flex items-center justify-between px-4 py-3.5 text-sm font-bold text-neutral-200 border-b border-white/5">
                  {{ link.texto }}
                  <svg class="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 17L17 7M8 7h9v9"/></svg>
                </a>
              } @else {
                <a [routerLink]="link.ruta" [fragment]="link.fragmento" (click)="alNavegar(link)" class="block px-4 py-3.5 text-sm font-bold text-neutral-200 border-b border-white/5">{{ link.texto }}</a>
              }
            }
            <a routerLink="/reservar" (click)="isMobileMenuOpen = false" class="block mt-5 text-center bg-acento-500 text-sobre-acento font-black text-sm py-3.5 px-8 rounded-full">Reservar turno</a>
          </div>
        </div>
      }
    </header>

    <main class="flex-grow">
      <router-outlet></router-outlet>
    </main>

    <footer class="bg-black border-t border-white/10 mt-auto">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid grid-cols-1 md:grid-cols-3 gap-10">
        <div>
          <span class="text-2xl text-white"><app-marca claseLogo="w-12 h-12" /></span>
          <p class="text-neutral-500 text-sm mt-4 max-w-xs leading-relaxed">{{ cliente.hero.subtitulo }}</p>
        </div>
        <div>
          <h4 class="text-xs font-extrabold uppercase tracking-widest text-detalle-400/90 mb-4">Explora</h4>
          <ul class="space-y-2.5 text-sm">
            @for (link of links(); track link.texto) {
              @if (link.externo) {
                <li><a [href]="link.externo" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-neutral-300 hover:text-white transition-colors">{{ link.texto }} <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M7 17L17 7M8 7h9v9"/></svg></a></li>
              } @else {
                <li><a [routerLink]="link.ruta" [fragment]="link.fragmento" (click)="alNavegar(link)" class="text-neutral-300 hover:text-white transition-colors">{{ link.texto }}</a></li>
              }
            }
            <li><a routerLink="/reservar" class="text-neutral-300 hover:text-white transition-colors">Reservar turno</a></li>
          </ul>
        </div>
        <div>
          <h4 class="text-xs font-extrabold uppercase tracking-widest text-detalle-400/90 mb-4">Visítanos</h4>
          <ul class="space-y-2.5 text-sm text-neutral-300">
            @if (cliente.ubicacion; as ubicacion) {
              <li><a [href]="ubicacion.mapaUrl" target="_blank" rel="noopener" class="hover:text-white transition-colors">{{ ubicacion.direccion }}</a></li>
            }
            @for (fila of horario; track fila.dias) {
              <li class="grid grid-cols-[4.5rem_1fr] gap-3 max-w-xs"><span class="text-neutral-500">{{ fila.dias }}</span><span [class.text-neutral-500]="!fila.abierto">{{ fila.horas }}</span></li>
            }
            <li><a [href]="cliente.instagram.url" target="_blank" rel="noopener" class="hover:text-white transition-colors">&#64;{{ cliente.instagram.usuario }}</a></li>
          </ul>
        </div>
      </div>
      <div class="border-t border-white/5 py-6 px-4 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 text-xs text-neutral-600">
        <span>&copy; {{ anio }} {{ cliente.nombre }}. Todos los derechos reservados.</span>
        <a routerLink="/politica-de-datos" class="hover:text-neutral-300 transition-colors">Política de tratamiento de datos</a>
      </div>
    </footer>
  `,
  host: {
    class: 'flex flex-col min-h-screen bg-neutral-950'
  }
})
export class ClientLayoutComponent {
  readonly cliente = CLIENTE;
  readonly anio = new Date().getFullYear();
  readonly horario = resumenHorario();
  private ajustes = inject(AjustesService).ajustes;

  readonly links = computed<EnlaceNav[]>(() => {
    const { cursos } = this.ajustes();
    return [
      { texto: 'Inicio', ruta: '/' },
      { texto: 'Servicios', ruta: '/servicios' },
      { texto: 'Galería', ruta: '/', fragmento: 'galeria' },
      ...(CLIENTE.equipo.length > 0 ? [{ texto: 'Equipo', ruta: '/', fragmento: 'equipo' }] : []),
      { texto: 'Contacto', ruta: '/', fragmento: 'contacto' },
      ...(cursos.activo && cursos.url ? [{ texto: 'Cursos', externo: cursos.url }] : []),
    ];
  });

  isMobileMenuOpen = false;
  conScroll = false;
  auth = inject(AuthService);
  router = inject(Router);
  private desplazamiento = inject(DesplazamientoService);

  @HostListener('window:scroll')
  alDesplazar() {
    this.conScroll = window.scrollY > 24;
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
