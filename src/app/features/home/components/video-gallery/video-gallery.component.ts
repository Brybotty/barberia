import { Component, ElementRef, NgZone, OnDestroy, effect, inject, viewChild } from '@angular/core';
import { DecimalPipe, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { enNavegador } from '../../../../core/utils/plataforma';
import { CLIENTE } from '../../../../config/cliente';
import { ConsentimientoService } from '../../../../core/services/consentimiento.service';
import { RevelarDirective } from '../../../../shared/directives/revelar.directive';
import { IconoComponent } from '../../../../shared/components/icono/icono.component';
import { RedSocialComponent } from '../../../../shared/components/red-social/red-social.component';

const SCRIPT_INSTAGRAM = 'https://www.instagram.com/embed.js';

interface VentanaConInstagram extends Window {
  instgrm?: { Embeds: { process(): void } };
}

@Component({
  selector: 'app-video-gallery',
  standalone: true,
  imports: [RouterLink, DecimalPipe, NgClass, RevelarDirective, IconoComponent, RedSocialComponent],
  template: `
    <section class="py-20 sm:py-24 bg-neutral-950 overflow-hidden">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12" appRevelar>
          <p class="rotulo rotulo-centro mb-4">Galería</p>
          <h2 class="font-display text-4xl md:text-6xl font-black text-white mb-5 tracking-tight">Nuestro arte en acción</h2>
          <p class="text-lg text-neutral-400 max-w-2xl mx-auto">Los trabajos más recientes del equipo, tal como salen de la silla.</p>
        </div>
      </div>

      @if (consentimiento.instagram()) {
        <!-- Carrusel -->
        <div class="relative" appRevelar [retraso]="150">
          <div #pista (scroll)="alDesplazar()"
               class="flex items-start gap-6 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-6 px-[calc(50%-170px)] scroll-smooth">
            @for (reel of cliente.reels; track reel; let i = $index) {
              <div class="snap-center shrink-0 w-[340px] origin-top transition-all duration-500 ease-out"
                   [ngClass]="i !== activo ? 'opacity-40 scale-[0.92]' : ''">
                <!-- Altura fija: el embed de Instagram crece al cargar y desplazaría el resto de la página -->
                <div class="relative h-[620px] rounded-2xl overflow-hidden border border-white/10 bg-neutral-900 shadow-2xl shadow-black/60">
                  <!-- Mientras carga Instagram -->
                  <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-neutral-600">
                    <app-red-social red="instagram" class="h-9 w-9 animate-pulse" />
                    <span class="text-xs font-semibold">Cargando publicación…</span>
                  </div>
                  <blockquote class="instagram-media relative" [attr.data-instgrm-permalink]="reel + '?utm_source=ig_embed&utm_campaign=loading'" data-instgrm-version="14"
                              style="background:transparent; border:0; margin:0; max-width:540px; min-width:326px; padding:0; width:100%;">
                    <a [href]="reel" target="_blank" rel="noopener" class="sr-only">Ver esta publicación en Instagram</a>
                  </blockquote>
                </div>
              </div>
            }
          </div>

          <!-- Flechas (escritorio) -->
          <button type="button" (click)="irA(activo - 1)" [disabled]="activo === 0" aria-label="Publicación anterior"
                  class="hidden md:flex absolute left-6 top-72 w-12 h-12 items-center justify-center rounded-full vidrio backdrop-blur-xl text-white hover:border-detalle-400/50 disabled:opacity-30 transition-all">
            <app-icono nombre="atras" class="h-5 w-5" [grosor]="2" />
          </button>
          <button type="button" (click)="irA(activo + 1)" [disabled]="activo === cliente.reels.length - 1" aria-label="Publicación siguiente"
                  class="hidden md:flex absolute right-6 top-72 w-12 h-12 items-center justify-center rounded-full vidrio backdrop-blur-xl text-white hover:border-detalle-400/50 disabled:opacity-30 transition-all">
            <app-icono nombre="atras" class="h-5 w-5 rotate-180" [grosor]="2" />
          </button>
        </div>

        <!-- Indicadores -->
        <div class="flex items-center justify-center gap-5 mt-4">
          <div class="flex items-center">
            @for (reel of cliente.reels; track reel; let i = $index) {
              <button type="button" (click)="irA(i)" [attr.aria-label]="'Ir a la publicación ' + (i + 1)" [attr.aria-current]="i === activo ? 'true' : null" class="flex h-10 items-center px-1">
                <span class="block h-1.5 rounded-full transition-all duration-300" [ngClass]="i === activo ? 'w-8 bg-detalle-400' : 'w-1.5 bg-white/25'"></span>
              </button>
            }
          </div>
          <span class="font-display text-xs font-bold text-neutral-500 tabular-nums">{{ activo + 1 | number:'2.0-0' }} / {{ cliente.reels.length | number:'2.0-0' }}</span>
        </div>
      } @else {
        <!-- Sin permiso para el contenido de Instagram: se carga al pedirlo -->
        <div class="px-4" appRevelar [retraso]="150">
          <div class="placa relative mx-auto flex max-w-3xl flex-col items-center overflow-hidden px-6 py-14 text-center">
            @if (cliente.simbolo) {
              <img [src]="cliente.simbolo" alt="" loading="lazy" class="pointer-events-none absolute inset-0 m-auto h-[85%] w-auto opacity-[0.05]">
            }
            <div class="relative z-[1] flex flex-col items-center">
              <span class="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-detalle-400/40 bg-detalle-500/10 text-detalle-200">
                <app-red-social red="instagram" class="h-6 w-6" />
              </span>
              <p class="font-display text-2xl font-bold text-white">{{ cliente.reels.length }} publicaciones de &#64;{{ cliente.instagram.usuario }}</p>
              <p class="mt-2 max-w-md text-sm text-neutral-400">Los videos son de Instagram y usan sus cookies. Se cargan solo si lo pides.</p>
              <div class="mt-7 flex flex-col gap-3 sm:flex-row">
                <button type="button" (click)="consentimiento.permitir('instagram')" class="boton-acento">Ver las publicaciones aquí</button>
                <a [href]="cliente.instagram.url" target="_blank" rel="noopener" class="boton-oro">Abrir Instagram <app-icono nombre="externo" class="h-4 w-4" [grosor]="2" /></a>
              </div>
            </div>
          </div>
        </div>
      }

      <div class="text-center flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center mt-12 px-4" appRevelar>
        <a routerLink="/reservar" class="boton-acento group !px-9 !py-4 !text-base">
          Quiero un corte así
          <app-icono nombre="flecha" class="h-5 w-5 transition-transform group-hover:translate-x-1" [grosor]="2" />
        </a>
        @if (consentimiento.instagram()) {
          <a [href]="cliente.instagram.url" target="_blank" rel="noopener" class="boton-oro !px-9 !py-4 !text-base">
            <app-red-social red="instagram" class="h-5 w-5" />
            Síguenos en Instagram
          </a>
        }
      </div>
    </section>
  `
})
export class VideoGalleryComponent implements OnDestroy {
  readonly cliente = CLIENTE;
  readonly consentimiento = inject(ConsentimientoService);
  private el = inject(ElementRef<HTMLElement>);
  private zona = inject(NgZone);
  private pista = viewChild<ElementRef<HTMLElement>>('pista');
  private observador?: IntersectionObserver;

  activo = 0;

  constructor() {
    // Con permiso, el script de Instagram (pesado) se pide solo cuando la galería está por aparecer.
    effect(() => {
      if (!enNavegador || !this.consentimiento.instagram() || !this.pista()) return;
      this.observador?.disconnect();
      if (!('IntersectionObserver' in window)) {
        this.cargarInstagram();
        return;
      }
      this.zona.runOutsideAngular(() => {
        this.observador = new IntersectionObserver(entradas => {
          if (entradas.some(e => e.isIntersecting)) {
            this.observador?.disconnect();
            this.cargarInstagram();
          }
        }, { rootMargin: '600px 0px' });
        this.observador.observe(this.el.nativeElement);
      });
    });
  }

  ngOnDestroy() {
    this.observador?.disconnect();
  }

  private cargarInstagram() {
    const ventana = window as VentanaConInstagram;
    // Si ya estaba cargado (p. ej. al volver al inicio), solo procesa los nuevos embeds.
    if (ventana.instgrm) {
      ventana.instgrm.Embeds.process();
      return;
    }
    if (document.querySelector(`script[src="${SCRIPT_INSTAGRAM}"]`)) return;
    const script = document.createElement('script');
    script.src = SCRIPT_INSTAGRAM;
    script.async = true;
    script.onload = () => ventana.instgrm?.Embeds.process();
    document.body.appendChild(script);
  }

  /** Ancho de una tarjeta más el espacio entre tarjetas. */
  private get paso(): number {
    const tarjeta = this.pista()?.nativeElement.firstElementChild as HTMLElement | null;
    return tarjeta ? tarjeta.offsetWidth + 24 : 1;
  }

  alDesplazar() {
    const pista = this.pista()?.nativeElement;
    if (!pista) return;
    const indice = Math.round(pista.scrollLeft / this.paso);
    this.activo = Math.max(0, Math.min(indice, this.cliente.reels.length - 1));
  }

  irA(indice: number) {
    const destino = Math.max(0, Math.min(indice, this.cliente.reels.length - 1));
    this.pista()?.nativeElement.scrollTo({ left: destino * this.paso, behavior: 'smooth' });
    this.activo = destino;
  }
}
