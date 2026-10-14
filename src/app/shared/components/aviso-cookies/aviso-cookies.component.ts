import { Component, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConsentimientoService } from '../../../core/services/consentimiento.service';

/**
 * Aviso de cookies (va una sola vez, en la raíz). Sale hasta que el visitante elige, y vuelve a abrirse
 * desde "Preferencias de cookies" en el pie de página. Rechazar es tan fácil como aceptar.
 */
@Component({
  selector: 'app-aviso-cookies',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (!consentimiento.decidido() || consentimiento.configurando()) {
      <section class="pointer-events-none fixed inset-x-0 bottom-0 z-[80] p-3 sm:p-5 animate-in fade-in slide-in-from-bottom-6 duration-500" role="dialog" aria-labelledby="cookies-titulo" aria-describedby="cookies-texto">
        <div class="pointer-events-auto mx-auto max-w-2xl rounded-3xl border border-white/10 bg-neutral-950/95 p-5 shadow-2xl shadow-black backdrop-blur-xl sm:p-6 lg:mr-0 lg:max-w-[27rem]">
          <h2 id="cookies-titulo" class="rotulo">Cookies y contenido de terceros</h2>
          <p id="cookies-texto" class="mt-2 text-sm leading-relaxed text-neutral-400">
            Usamos solo lo necesario para que la página funcione: tu sesión y la protección contra robots. No hay publicidad ni seguimiento.
            El <strong class="text-neutral-200">mapa de cómo llegar</strong> es de Google y se muestra siempre. Con tu permiso mostramos además las
            <strong class="text-neutral-200">publicaciones de Instagram</strong>, que guardan sus propias cookies.
            <a routerLink="/politica-de-datos" fragment="cookies" class="font-bold text-neutral-200 underline underline-offset-4 hover:text-white">Más información</a>
          </p>

          @if (detalle) {
            <ul class="mt-5 divide-y divide-white/5 rounded-2xl border border-white/10">
              <li class="flex items-center justify-between gap-4 p-4">
                <div>
                  <p class="text-sm font-bold text-white">Necesarias</p>
                  <p class="text-xs text-neutral-500">Sesión, seguridad y esta elección. Siempre activas.</p>
                </div>
                <span class="chip-neutro">Siempre</span>
              </li>
              <li class="flex items-center justify-between gap-4 p-4">
                <div>
                  <p class="text-sm font-bold text-white">Mapa de Google</p>
                  <p class="text-xs text-neutral-500">Para que veas cómo llegar. Lo sirve Google, con sus propias cookies.</p>
                </div>
                <span class="chip-neutro">Siempre</span>
              </li>
              <li>
                <label class="flex cursor-pointer items-center justify-between gap-4 p-4">
                  <span>
                    <span class="block text-sm font-bold text-white">Publicaciones de Instagram</span>
                    <span class="block text-xs text-neutral-500">Los videos de la galería.</span>
                  </span>
                  <!-- Casilla nativa a propósito (sin ngModel): así el aviso no carga el paquete de formularios en cada página -->
                  <input type="checkbox" class="peer sr-only" [checked]="instagram" (change)="instagram = $any($event.target).checked">
                  <span class="interruptor"></span>
                </label>
              </li>
            </ul>
          }

          <div class="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
            @if (detalle) {
              <button type="button" (click)="guardar()" class="boton-acento sm:order-last sm:ml-auto lg:order-first lg:ml-0">Guardar mi elección</button>
            } @else {
              <button type="button" (click)="consentimiento.aceptarTodo()" class="boton-acento sm:order-last sm:ml-auto lg:order-first lg:ml-0">Aceptar todo</button>
              <button type="button" (click)="consentimiento.soloNecesarias()" class="boton-linea sm:order-2">Solo las necesarias</button>
            }
            <button type="button" (click)="detalle = !detalle" class="enlace-toque justify-center text-sm font-bold text-neutral-400 underline underline-offset-4 hover:text-white sm:order-first lg:order-last">
              {{ detalle ? 'Ocultar opciones' : 'Elegir una por una' }}
            </button>
          </div>
        </div>
      </section>
    }
  `,
})
export class AvisoCookiesComponent {
  readonly consentimiento = inject(ConsentimientoService);

  detalle = false;
  instagram = false;

  constructor() {
    // Al abrirlo desde el pie de página se muestran las opciones con lo que el visitante ya eligió.
    effect(() => {
      if (!this.consentimiento.configurando()) return;
      const actual = this.consentimiento.preferencias();
      this.instagram = actual?.instagram ?? false;
      this.detalle = true;
    });
  }

  guardar() {
    this.consentimiento.guardar({ instagram: this.instagram });
    this.detalle = false;
  }
}
