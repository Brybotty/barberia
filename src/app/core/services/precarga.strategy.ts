import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { EMPTY, Observable } from 'rxjs';

/** Lo que dice el navegador de la conexión (no está en todos: Safari no lo trae). */
interface Conexion {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Baja por adelantado, cuando el navegador ya está libre, las pantallas marcadas con `data.precargar` (reservar y
 * servicios, a donde va casi todo el que entra): al tocar "Reservar" la pantalla abre de una, sin esperar la descarga.
 * No precarga nada si el visitante pidió ahorrar datos o su conexión es muy lenta, ni los paneles del equipo.
 */
@Injectable({ providedIn: 'root' })
export class PrecargaSelectiva implements PreloadingStrategy {
  preload(ruta: Route, cargar: () => Observable<unknown>): Observable<unknown> {
    const conexion = (navigator as Navigator & { connection?: Conexion }).connection;
    if (!ruta.data?.['precargar'] || conexion?.saveData || /2g/.test(conexion?.effectiveType ?? '')) return EMPTY;
    return new Observable(suscriptor => {
      let descarga: { unsubscribe(): void } | undefined;
      const empezar = () => (descarga = cargar().subscribe(suscriptor));
      const conReposo = typeof requestIdleCallback === 'function';
      const espera = conReposo ? requestIdleCallback(empezar, { timeout: 4000 }) : setTimeout(empezar, 2500);
      return () => {
        if (conReposo) cancelIdleCallback(espera as number);
        else clearTimeout(espera as ReturnType<typeof setTimeout>);
        descarga?.unsubscribe();
      };
    });
  }
}
