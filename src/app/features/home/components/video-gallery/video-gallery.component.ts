import { Component, AfterViewInit, ElementRef, viewChild } from '@angular/core';
import { DecimalPipe, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CLIENTE } from '../../../../config/cliente';
import { RevelarDirective } from '../../../../shared/directives/revelar.directive';

@Component({
  selector: 'app-video-gallery',
  standalone: true,
  imports: [RouterLink, DecimalPipe, NgClass, RevelarDirective],
  template: `
    <section class="py-24 bg-neutral-950 overflow-hidden">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-14" appRevelar>
          <p class="text-detalle-400 text-xs font-extrabold uppercase tracking-[0.3em] mb-4">Galería</p>
          <h2 class="font-display text-4xl md:text-6xl font-black text-white mb-5 tracking-tight">Nuestro arte en acción</h2>
          <p class="text-lg text-neutral-400 max-w-2xl mx-auto">
            Cada corte cuenta una historia. Desliza para ver los trabajos más recientes de nuestro equipo.
          </p>
        </div>
      </div>

      <!-- Carrusel -->
      <div class="relative" appRevelar [retraso]="150">
        <div #pista (scroll)="alDesplazar()"
             class="flex items-start gap-6 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-6 px-[calc(50%-170px)] scroll-smooth">
          @for (reel of cliente.reels; track reel; let i = $index) {
            <div class="snap-center shrink-0 w-[340px] origin-top transition-all duration-500 ease-out"
                 [ngClass]="i !== activo ? 'opacity-40 scale-[0.92]' : ''">
              <!-- Altura fija: el embed de Instagram crece al cargar y desplazaría el resto de la página -->
              <div class="h-[620px] rounded-2xl overflow-hidden bg-white shadow-2xl shadow-black/60">
                <blockquote class="instagram-media" data-instgrm-captioned [attr.data-instgrm-permalink]="reel + '?utm_source=ig_embed&utm_campaign=loading'" data-instgrm-version="14" style=" background:#FFF; border:0; border-radius:3px; margin: 0; max-width:540px; min-width:326px; padding:0; width:100%;"><div style="padding:16px;"> <a [href]="reel" style=" background:#FFFFFF; line-height:0; padding:0 0; text-align:center; text-decoration:none; width:100%;" target="_blank" rel="noopener"> Ver esta publicación en Instagram</a></div></blockquote>
              </div>
            </div>
          }
        </div>

        <!-- Flechas (escritorio) -->
        <button (click)="irA(activo - 1)" [disabled]="activo === 0" aria-label="Anterior"
                class="hidden md:flex absolute left-6 top-72 w-12 h-12 items-center justify-center rounded-full vidrio text-white hover:bg-white/10 disabled:opacity-30 transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>
        <button (click)="irA(activo + 1)" [disabled]="activo === cliente.reels.length - 1" aria-label="Siguiente"
                class="hidden md:flex absolute right-6 top-72 w-12 h-12 items-center justify-center rounded-full vidrio text-white hover:bg-white/10 disabled:opacity-30 transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
        </button>
      </div>

      <!-- Indicadores -->
      <div class="flex items-center justify-center gap-5 mt-4">
        <div class="flex items-center gap-2">
          @for (reel of cliente.reels; track reel; let i = $index) {
            <button (click)="irA(i)" [attr.aria-label]="'Ir al video ' + (i + 1)"
                    class="h-1.5 rounded-full transition-all duration-300"
                    [ngClass]="i === activo ? 'w-8 bg-detalle-400' : 'w-1.5 bg-white/25 hover:bg-white/50'"></button>
          }
        </div>
        <span class="text-xs font-bold text-neutral-500 tabular-nums">{{ activo + 1 | number:'2.0-0' }} / {{ cliente.reels.length | number:'2.0-0' }}</span>
      </div>

      <!-- Call to Action -->
      <div class="text-center flex flex-col sm:flex-row gap-4 justify-center items-center mt-14 px-4" appRevelar>
        <a routerLink="/reservar" class="group inline-flex items-center justify-center gap-3 px-9 py-4 font-black text-sobre-acento bg-acento-500 rounded-full hover:bg-acento-400 hover:shadow-2xl hover:shadow-acento-500/30 hover:-translate-y-0.5 transition-all duration-300">
          Agendar mi cita
          <svg class="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
        </a>
        <a [href]="cliente.instagram.url" target="_blank" rel="noopener" class="inline-flex items-center justify-center gap-3 px-9 py-4 font-black text-white bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 rounded-full hover:shadow-2xl hover:shadow-pink-500/20 hover:-translate-y-0.5 transition-all duration-300">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
          Síguenos en Instagram
        </a>
      </div>
    </section>
  `
})
export class VideoGalleryComponent implements AfterViewInit {
  readonly cliente = CLIENTE;
  private pista = viewChild.required<ElementRef<HTMLElement>>('pista');

  activo = 0;

  ngAfterViewInit() {
    // Si embed.js ya estaba cargado (p. ej. al volver al inicio), procesa los nuevos reels.
    (window as any).instgrm?.Embeds.process();
  }

  /** Ancho de una tarjeta más el espacio entre tarjetas. */
  private get paso(): number {
    const tarjeta = this.pista().nativeElement.firstElementChild as HTMLElement | null;
    return tarjeta ? tarjeta.offsetWidth + 24 : 1;
  }

  alDesplazar() {
    const indice = Math.round(this.pista().nativeElement.scrollLeft / this.paso);
    this.activo = Math.max(0, Math.min(indice, this.cliente.reels.length - 1));
  }

  irA(indice: number) {
    const destino = Math.max(0, Math.min(indice, this.cliente.reels.length - 1));
    this.pista().nativeElement.scrollTo({ left: destino * this.paso, behavior: 'smooth' });
    this.activo = destino;
  }
}
