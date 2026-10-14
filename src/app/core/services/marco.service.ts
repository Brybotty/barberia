import { Injectable, signal } from '@angular/core';

/** Lo que una página le avisa al marco que la rodea (encabezado, pie y accesos rápidos de ClientLayout). */
@Injectable({ providedIn: 'root' })
export class MarcoService {
  /**
   * La página puso su propia barra fija abajo (el total y "Confirmar reserva" en celular):
   * mientras esté, los accesos rápidos se quitan para que no queden una encima de la otra.
   */
  readonly barraPropia = signal(false);
}
