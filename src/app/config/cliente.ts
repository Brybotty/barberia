import { ConfigCliente } from './cliente.model';
import { ACICALE } from './clientes/acicale';

/**
 * Cliente activo de este build. Para cambiar de barbería, cambia esta línea
 * (p. ej. `import { BARBERCALI } from './clientes/barbercali'` y `CLIENTE = BARBERCALI`).
 */
export const CLIENTE: ConfigCliente = ACICALE;

/** Aplica el tema del cliente al documento. Se llama antes de arrancar Angular. */
export function aplicarCliente(cliente: ConfigCliente = CLIENTE): void {
  const raiz = document.documentElement;
  for (const [tono, rgb] of Object.entries(cliente.tema.acento)) {
    raiz.style.setProperty(`--acento-${tono}`, rgb);
  }
  for (const tono of [200, 300, 400, 500, 600] as const) {
    raiz.style.setProperty(`--detalle-${tono}`, cliente.tema.detalle?.[tono] ?? cliente.tema.acento[tono]);
  }
  raiz.style.setProperty('--sobre-acento', cliente.tema.sobreAcento);
  raiz.style.setProperty('--fuente-display', cliente.tema.fuenteDisplay);

  if (cliente.tema.fuenteUrl) {
    const fuente = document.createElement('link');
    fuente.rel = 'stylesheet';
    fuente.href = cliente.tema.fuenteUrl;
    document.head.appendChild(fuente);
  }

  document.title = cliente.nombre;
  const icono = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icono) {
    icono.href = cliente.favicon;
    icono.type = cliente.favicon.endsWith('.ico') ? 'image/x-icon' : 'image/jpeg';
  }
}
