import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CLIENTE } from '../../config/cliente';

/** Dirección que no existe: en vez de mandar al inicio sin explicar, se dice y se ofrece a dónde ir. */
@Component({
  selector: 'app-no-encontrada',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-4 py-20 text-center">
      @if (cliente.simbolo) {
        <img [src]="cliente.simbolo" alt="" class="pointer-events-none absolute inset-0 m-auto h-[70%] w-auto opacity-[0.05]">
      }
      <div class="relative">
        <p class="rotulo rotulo-centro mb-4">Error CDIV</p>
        <h1 class="font-display text-4xl font-black tracking-tight text-white md:text-5xl">Esta página no existe</h1>
        <p class="mx-auto mt-4 max-w-md text-neutral-400">Puede que el enlace esté mal escrito o que la página se haya movido.</p>
        <div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a routerLink="/reservar" class="boton-acento">Reservar turno</a>
          <a routerLink="/" class="boton-linea">Ir al inicio</a>
        </div>
      </div>
    </section>
  `,
})
export class NoEncontradaComponent {
  readonly cliente = CLIENTE;
}
