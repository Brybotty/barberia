import { Component, input } from '@angular/core';

/**
 * Foto del producto, o un marcador con la inicial si aún no tiene.
 * El tamaño y la posición los pone quien lo usa (w-20 h-20, absolute inset-0, aspect-square...).
 */
@Component({
  selector: 'app-producto-imagen',
  standalone: true,
  host: { class: 'block overflow-hidden bg-neutral-800' },
  template: `
    <div class="relative w-full h-full">
      @if (src()) {
        <img [src]="src()" [alt]="nombre()" loading="lazy" decoding="async"
             class="absolute inset-0 w-full h-full object-cover" [class]="claseImagen()">
      } @else {
        <div class="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgb(var(--acento-500)/0.16),transparent_70%)]">
          <span class="font-display font-black text-white/15 leading-none" [style.font-size]="tamanoInicial()">{{ nombre().charAt(0) }}</span>
        </div>
      }
    </div>
  `,
})
export class ProductoImagenComponent {
  src = input<string | undefined>('');
  nombre = input('');
  claseImagen = input('');
  tamanoInicial = input('5rem');
}
