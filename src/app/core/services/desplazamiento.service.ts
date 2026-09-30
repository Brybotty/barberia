import { Injectable, NgZone, inject } from '@angular/core';
import { Router, Scroll } from '@angular/router';
import { filter } from 'rxjs';

/** Tiempo durante el que se corrige la posición mientras la página termina de cargar. */
const SEGUIMIENTO_MS = 5000;
const EVENTOS_DEL_USUARIO = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

/**
 * Lleva a las secciones del inicio (#galeria, #equipo, #contacto...).
 *
 * El scroll de anclas del router no basta: salta antes de que carguen los servicios (Firestore)
 * y los reels de Instagram, que empujan la sección hacia abajo, y además ignora la altura del
 * header fijo. Aquí se usa scrollIntoView (respeta scroll-margin-top) y se corrige la posición
 * durante unos segundos, salvo que el usuario empiece a desplazarse por su cuenta.
 */
@Injectable({ providedIn: 'root' })
export class DesplazamientoService {
  private router = inject(Router);
  private zone = inject(NgZone);
  private cancelarActual?: () => void;

  constructor() {
    this.router.events
      .pipe(filter((e): e is Scroll => e instanceof Scroll && !!e.anchor))
      .subscribe(e => setTimeout(() => this.irASeccion(e.anchor!)));
  }

  irASeccion(id: string) {
    this.cancelarActual?.();

    this.zone.runOutsideAngular(() => {
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const inicio = Date.now();
      // Mientras dura nuestra animación, los cambios de scrollY son nuestros.
      let animandoHasta = 0;
      let ultimoY: number | null = null;
      // Posición de la sección dentro del documento cuando la llevamos a pantalla.
      let referencia: number | null = null;

      const posicionEnDocumento = (el: HTMLElement) => el.getBoundingClientRect().top + window.scrollY;

      const desplazar = () => {
        const el = document.getElementById(id);
        if (!el) return;
        referencia = posicionEnDocumento(el);
        animandoHasta = Date.now() + 1500;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };

      const detener = () => {
        clearTimeout(temporizador);
        EVENTOS_DEL_USUARIO.forEach(ev => window.removeEventListener(ev, detener));
        if (this.cancelarActual === detener) this.cancelarActual = undefined;
      };

      const revisar = () => {
        // Si la página se movió sin que la moviéramos, fue el usuario (p. ej. con la rueda
        // sobre el mapa o un reel: esos iframes no avisan a la página).
        if (ultimoY !== null && Date.now() > animandoHasta && Math.abs(window.scrollY - ultimoY) > 2) {
          detener();
          return;
        }
        ultimoY = window.scrollY;

        // Solo se corrige si la sección cambió de lugar en el documento (algo cargó encima y la
        // empujó). Si solo cambió scrollY, es nuestra animación o el usuario: no se toca.
        const el = document.getElementById(id);
        if (el && (referencia === null || Math.abs(posicionEnDocumento(el) - referencia) > 4)) {
          desplazar();
        }
        if (Date.now() - inicio < SEGUIMIENTO_MS) temporizador = setTimeout(revisar, 400);
        else detener();
      };

      this.cancelarActual = detener;
      EVENTOS_DEL_USUARIO.forEach(ev => window.addEventListener(ev, detener, { passive: true }));
      desplazar();
      temporizador = setTimeout(revisar, 700);
    });
  }

  irArriba() {
    this.cancelarActual?.();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
