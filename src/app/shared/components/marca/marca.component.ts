import { Component, input } from '@angular/core';
import { CLIENTE } from '../../../config/cliente';

/** Logo y nombre del cliente activo. El tamaño y color del texto los hereda del contenedor. */
@Component({
  selector: 'app-marca',
  standalone: true,
  template: `
    <span class="inline-flex items-center gap-3 align-middle">
      @if (cliente.logo && conLogo()) {
        <img [src]="cliente.logo" [alt]="cliente.nombre" class="rounded-xl object-cover shrink-0 shadow-sm" [class]="claseLogo()">
      }
      <span class="font-display font-black tracking-tight">{{ cliente.marca.texto }}<span class="text-acento-500">{{ cliente.marca.destacado }}</span></span>
    </span>
  `
})
export class MarcaComponent {
  readonly cliente = CLIENTE;
  conLogo = input(true);
  claseLogo = input('w-10 h-10');
}
