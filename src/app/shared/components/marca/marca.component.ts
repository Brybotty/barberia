import { Component, input } from '@angular/core';
import { CLIENTE } from '../../../config/cliente';

/** Logo y nombre del cliente activo. El tamaño y color del texto los hereda del contenedor. */
@Component({
  selector: 'app-marca',
  standalone: true,
  template: `
    <span class="inline-flex items-center gap-3 align-middle">
      @if (cliente.logo && conLogo()) {
        <img [src]="cliente.logo" alt="" width="96" height="96" class="rounded-xl object-cover shrink-0 ring-1 ring-white/10" [class]="claseLogo()">
      }
      <span class="marca-texto font-display font-bold tracking-[0.08em]">{{ cliente.marca.texto }}<span class="text-acento-500">{{ cliente.marca.destacado }}</span></span>
    </span>
  `
})
export class MarcaComponent {
  readonly cliente = CLIENTE;
  conLogo = input(true);
  claseLogo = input('w-10 h-10');
}
