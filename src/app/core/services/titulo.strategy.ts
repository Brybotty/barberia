import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { CLIENTE } from '../../config/cliente';

/** Título de la página de inicio (el mismo de src/index.html, que es el que leen los buscadores sin JavaScript). */
const TITULO_INICIO = `${CLIENTE.nombre} · Barbería en Cali`;

/**
 * Título de la pestaña por ruta ("Reservar turno · El Acicale") y, en las páginas privadas o de error,
 * la etiqueta para que los buscadores no las guarden.
 */
@Injectable({ providedIn: 'root' })
export class TituloStrategy extends TitleStrategy {
  private titulo = inject(Title);
  private meta = inject(Meta);

  override updateTitle(estado: RouterStateSnapshot): void {
    const titulo = this.buildTitle(estado);
    this.titulo.setTitle(titulo ? `${titulo} · ${CLIENTE.nombre}` : TITULO_INICIO);

    let ruta = estado.root;
    while (ruta.firstChild) ruta = ruta.firstChild;
    if (ruta.data['sinIndexar']) this.meta.updateTag({ name: 'robots', content: 'noindex' });
    else this.meta.removeTag('name="robots"');
  }
}
