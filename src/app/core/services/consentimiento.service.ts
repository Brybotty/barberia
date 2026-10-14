import { Injectable, computed, signal } from '@angular/core';

/** Contenido de otras empresas que la página solo carga con permiso: usa las cookies de esas empresas. */
export type ContenidoExterno = 'instagram';

export interface Preferencias {
  instagram: boolean;
  /** Cuándo se guardó la elección (ISO). */
  fecha: string;
}

const CLAVE = 'preferencias-cookies-v1';

/**
 * Permiso del visitante para el contenido de terceros que lo pide: las publicaciones de Instagram.
 * (El mapa de Google de cómo llegar se muestra siempre: así lo decidió el negocio. Lo cuentan el aviso y la política.)
 *
 * La página no usa cookies de publicidad ni de medición. Lo necesario para funcionar (la sesión, la protección
 * contra robots y esta misma preferencia) no pide permiso; lo que sí lo pide es lo que hace que otra empresa
 * guarde cookies en el navegador. Hasta que el visitante lo acepta, en su lugar se muestra un botón.
 */
@Injectable({ providedIn: 'root' })
export class ConsentimientoService {
  /** null: todavía no ha elegido (se muestra el aviso). */
  readonly preferencias = signal<Preferencias | null>(leer());
  /** El visitante abrió "Preferencias de cookies" desde el pie de página. */
  readonly configurando = signal(false);

  readonly decidido = computed(() => this.preferencias() !== null);
  readonly instagram = computed(() => this.preferencias()?.instagram === true);

  permitido(contenido: ContenidoExterno): boolean {
    return this.preferencias()?.[contenido] === true;
  }

  aceptarTodo() {
    this.guardar({ instagram: true });
  }

  soloNecesarias() {
    this.guardar({ instagram: false });
  }

  /** Permite un contenido desde su propio botón ("Ver las publicaciones aquí"). */
  permitir(contenido: ContenidoExterno) {
    this.guardar({ [contenido]: true } as Pick<Preferencias, ContenidoExterno>);
  }

  guardar(eleccion: Pick<Preferencias, 'instagram'>) {
    const preferencias: Preferencias = { ...eleccion, fecha: new Date().toISOString() };
    this.preferencias.set(preferencias);
    this.configurando.set(false);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(preferencias));
    } catch {
      // Navegación privada o almacenamiento bloqueado: la elección vale mientras dure la visita.
    }
  }

  abrirPreferencias() {
    this.configurando.set(true);
  }
}

function leer(): Preferencias | null {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
    return guardado && typeof guardado.instagram === 'boolean' ? guardado : null;
  } catch {
    return null;
  }
}
