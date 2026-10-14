import { Injectable, signal } from '@angular/core';

export interface Pregunta {
  titulo: string;
  texto?: string;
  /** Texto del botón que confirma ("Cancelar reserva", "Eliminar"). */
  aceptar: string;
  /** Texto del botón que no hace nada. */
  rechazar?: string;
  /** La acción no se puede deshacer: el botón de confirmar va en rojo. */
  peligro?: boolean;
}

/**
 * Preguntas de confirmación con el estilo de la página (en vez de la ventana gris del navegador).
 * Uso: `if (!(await this.confirmar.preguntar({ titulo: '¿Cancelar la reserva?', aceptar: 'Sí, cancelar' }))) return;`
 */
@Injectable({ providedIn: 'root' })
export class ConfirmarService {
  /** La pregunta que está en pantalla (la pinta app-confirmar, en la raíz de la app). */
  readonly pregunta = signal<Pregunta | null>(null);
  private resolver?: (respuesta: boolean) => void;

  preguntar(pregunta: Pregunta): Promise<boolean> {
    // Si había otra pregunta abierta, se toma como "no".
    this.resolver?.(false);
    this.pregunta.set(pregunta);
    return new Promise(resolver => (this.resolver = resolver));
  }

  responder(respuesta: boolean) {
    this.pregunta.set(null);
    this.resolver?.(respuesta);
    this.resolver = undefined;
  }
}
