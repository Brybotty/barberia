import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Las páginas públicas se arman al compilar y se publican ya escritas (`dist/barberia/browser/servicios/index.html`):
 * Google y las redes las leen sin ejecutar JavaScript, y en el celular se ven antes de que cargue la aplicación.
 * Lo que viene de Firestore (servicios, equipo) no va en ese HTML: lo carga el navegador al abrir, como siempre.
 * Las demás rutas (reservar, paneles, ingreso) se arman solo en el navegador, desde `index.csr.html`.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'servicios', renderMode: RenderMode.Prerender },
  { path: 'politica-de-datos', renderMode: RenderMode.Prerender },
  { path: 'instalar', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
