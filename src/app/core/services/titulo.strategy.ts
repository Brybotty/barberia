import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { CLIENTE } from '../../config/cliente';

/** Título de la página de inicio (el mismo de src/index.html). */
const TITULO_INICIO = `${CLIENTE.nombre} · ${CLIENTE.descripcion} en ${CLIENTE.ubicacion?.zona ?? 'Cali'}`;
/** Descripción por defecto (la misma de src/index.html): la que muestra Google bajo el título. */
const DESCRIPCION_INICIO = `${CLIENTE.descripcion} en ${CLIENTE.ubicacion?.zona ?? 'Cali'}. Cortes y barba con asesoría personalizada. `
  + 'Elige tu barbero y reserva tu turno en línea en un minuto.';

/**
 * Por ruta: el título de la pestaña ("Reservar turno · El Acicale"), la descripción que muestra Google
 * (`data.descripcion`) y la dirección canónica de la página. En las páginas privadas o de error, la etiqueta para
 * que los buscadores no las guarden. Con el prerender, todo esto queda escrito en el HTML de las páginas públicas.
 */
@Injectable({ providedIn: 'root' })
export class TituloStrategy extends TitleStrategy {
  private titulo = inject(Title);
  private meta = inject(Meta);
  private documento = inject(DOCUMENT);

  override updateTitle(estado: RouterStateSnapshot): void {
    const titulo = this.buildTitle(estado);
    this.titulo.setTitle(titulo ? `${titulo} · ${CLIENTE.nombre}` : TITULO_INICIO);

    let ruta = estado.root;
    while (ruta.firstChild) ruta = ruta.firstChild;
    const privada = !!ruta.data['sinIndexar'];
    if (privada) this.meta.updateTag({ name: 'robots', content: 'noindex' });
    else this.meta.removeTag('name="robots"');
    this.meta.updateTag({ name: 'description', content: ruta.data['descripcion'] ?? DESCRIPCION_INICIO });
    this.canonica(privada ? null : estado.url);
  }

  /** <link rel="canonical">: la dirección "oficial" de la página, sin ?parámetros ni #secciones. */
  private canonica(url: string | null) {
    const actual = this.documento.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!url || !CLIENTE.urlSitio) {
      actual?.remove();
      return;
    }
    const ruta = url.split(/[?#]/)[0].replace(/\/+$/, '');
    const enlace = actual ?? this.documento.createElement('link');
    enlace.setAttribute('rel', 'canonical');
    enlace.setAttribute('href', `${CLIENTE.urlSitio}${ruta || '/'}`);
    if (!actual) this.documento.head.appendChild(enlace);
  }
}
