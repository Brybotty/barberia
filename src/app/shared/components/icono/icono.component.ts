import { Component, computed, input } from '@angular/core';

/**
 * Íconos de línea propios de la barbería (en lugar de emojis o íconos genéricos).
 * Toman el color del texto (currentColor). Uso: <app-icono nombre="tijeras" class="w-6 h-6" />
 */
const TRAZOS: Record<string, string> = {
  // Tijeras abiertas, hojas hacia arriba
  tijeras: 'M6.2 20.2a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4Zm11.6 0a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4ZM8.1 15.4 16.4 3.2M15.9 15.4 7.6 3.2M12 9.3l.01.01',
  // Navaja clásica abierta: mango en diagonal y hoja con lomo recto
  navaja: 'M3.4 19.1 10.9 11.6a1.3 1.3 0 0 1 1.8 0l.1.1a1.3 1.3 0 0 1 0 1.8L5.3 21a1.3 1.3 0 0 1-1.8 0l-.1-.1a1.3 1.3 0 0 1 0-1.8ZM12.2 11.5 13.4 5h7.1a.6.6 0 0 1 .5.9l-2.2 4c-.3.5-.8.8-1.4.8h-4.6M15.5 7.6h3',
  // Bigote de manubrio (barba y bigote)
  barba: 'M12 10.45c-1.2 -2.10 -2.8 -3.15 -4.4 -2.55 -1.9 0.60 -2.9 3.15 -4.4 3.45 -0.6 0.15 -1 -0.45 -1 -0.45s0.5 4.50 3.5 5.10c2.3 0.60 4.6 -0.90 6.3 -3.90 1.7 3.00 4 4.50 6.3 3.90 3 -0.60 3.5 -5.10 3.5 -5.10s-0.4 0.60 -1 0.45c-1.5 -0.30 -2.5 -2.85 -4.4 -3.45 -1.6 -0.60 -3.2 0.45 -4.4 2.55Z',
  // Poste de barbería
  poste: 'M9 5.5h6v13H9zM8 5.5h8M8 18.5h8M10.5 3.5h3M10.5 20.5h3M9 9.5l6-2.4M9 13.2l6-2.4M9 16.9l6-2.4',
  // Diamante facetado
  diamante: 'M7 4h10l3.5 5L12 20.5 3.5 9 7 4ZM3.5 9h17M9.6 4 8 9l4 11.5L16 9l-1.6-5',
  // Gota de color con reflejo
  color: 'M12 3.2c3.2 4.1 5.8 7.2 5.8 10.4a5.8 5.8 0 1 1-11.6 0c0-3.2 2.6-6.3 5.8-10.4ZM9.3 14.1a2.8 2.8 0 0 0 2.7 2.7',
  // Peine
  peine: 'M3.5 8.5h17a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1ZM5.5 12.5v5M8.5 12.5v5M11.5 12.5v5M14.5 12.5v5M17.5 12.5v5',
  // Hoja (cuidado facial / tratamientos)
  hoja: 'M5 19.5C5 11 10.4 5 19.5 4.5 19 13.6 13 19 5 19.5ZM5 19.5l8.2-8.2',
  // Corona
  corona: 'M4 8.5l4.2 3.8L12 5l3.8 7.3L20 8.5 18.4 18H5.6L4 8.5ZM5.6 20.5h12.8',
  // Destello (reemplaza al ✦)
  destello: 'M12 3.5c.6 4.4 2.1 5.9 6.5 6.5-4.4.6-5.9 2.1-6.5 6.5-.6-4.4-2.1-5.9-6.5-6.5 4.4-.6 5.9-2.1 6.5-6.5ZM18.5 16.5c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2Z',
  // Estrella (reemplaza al ★)
  estrella: 'm12 3.6 2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.6l-5.1 2.6 1-5.6-4.1-4 5.7-.8L12 3.6Z',
};

@Component({
  selector: 'app-icono',
  standalone: true,
  host: { class: 'inline-block shrink-0', '[attr.aria-hidden]': 'true' },
  template: `
    <svg class="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" [attr.stroke-width]="grosor()"
         stroke-linecap="round" stroke-linejoin="round" [class.fill-current]="relleno()">
      <path [attr.d]="trazo()" />
    </svg>
  `,
})
export class IconoComponent {
  nombre = input.required<string>();
  grosor = input(1.6);
  /** Rellena la figura (para estrellas y destellos). */
  relleno = input(false);
  readonly trazo = computed(() => TRAZOS[this.nombre()] ?? TRAZOS['tijeras']);
}
