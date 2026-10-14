import { Component, effect, inject } from '@angular/core';
import { ConfirmarService } from '../../../core/services/confirmar.service';
import { IconoComponent } from '../icono/icono.component';

/** Ventana de confirmación de toda la app (va una sola vez, en la raíz). La abre ConfirmarService. */
@Component({
  selector: 'app-confirmar',
  standalone: true,
  imports: [IconoComponent],
  host: { '(document:keydown.escape)': 'cerrar()' },
  template: `
    @if (servicio.pregunta(); as p) {
      <div class="fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-6" role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo">
        <div class="absolute inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200" (click)="servicio.responder(false)"></div>
        <div class="relative w-full rounded-t-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-300 sm:max-w-md sm:rounded-3xl sm:p-7">
          <span class="mb-4 flex h-11 w-11 items-center justify-center rounded-full border"
                [class]="p.peligro ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-detalle-400/30 bg-detalle-500/10 text-detalle-300'">
            <app-icono [nombre]="p.peligro ? 'alerta' : 'campana'" class="h-5 w-5" [grosor]="2" />
          </span>
          <h3 id="confirmar-titulo" class="text-xl font-black text-white">{{ p.titulo }}</h3>
          @if (p.texto) {
            <p class="mt-2 text-sm leading-relaxed text-neutral-400">{{ p.texto }}</p>
          }
          <div class="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" id="confirmar-no" (click)="servicio.responder(false)" class="boton-linea">{{ p.rechazar ?? 'Volver' }}</button>
            <button type="button" id="confirmar-si" (click)="servicio.responder(true)" [class]="p.peligro ? 'boton-peligro' : 'boton-acento'">{{ p.aceptar }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmarComponent {
  readonly servicio = inject(ConfirmarService);

  constructor() {
    // Al abrirse, el teclado queda en la ventana: en "Sí" si es una pregunta normal y en "No" si la acción
    // no se puede deshacer (un Enter por reflejo no borra nada).
    effect(() => {
      const pregunta = this.servicio.pregunta();
      if (pregunta) setTimeout(() => document.getElementById(pregunta.peligro ? 'confirmar-no' : 'confirmar-si')?.focus());
    });
  }

  cerrar() {
    if (this.servicio.pregunta()) this.servicio.responder(false);
  }
}
