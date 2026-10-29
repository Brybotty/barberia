import { ConfigCliente } from './cliente.model';
import { ACICALE } from './clientes/acicale';

/**
 * Cliente activo de este build. Para otra barbería, crea su archivo en ./clientes y cambia esta línea.
 */
export const CLIENTE: ConfigCliente = ACICALE;

/**
 * Aplica el tema del cliente al documento: en el navegador antes de arrancar Angular (main.ts) y, al compilar, en
 * las páginas que se entregan ya armadas (app.config.server.ts). Las variables van en el atributo `style` de <html>
 * (así quedan escritas en ese HTML).
 */
export function aplicarCliente(cliente: ConfigCliente = CLIENTE, documento: Document = document): void {
  const variables: Record<string, string> = {};
  for (const [tono, rgb] of Object.entries(cliente.tema.acento)) variables[`--acento-${tono}`] = rgb;
  for (const tono of [200, 300, 400, 500, 600] as const) {
    variables[`--detalle-${tono}`] = cliente.tema.detalle?.[tono] ?? cliente.tema.acento[tono];
  }
  variables['--sobre-acento'] = cliente.tema.sobreAcento;
  variables['--fuente-display'] = cliente.tema.fuenteDisplay;
  documento.documentElement.setAttribute('style', Object.entries(variables).map(([nombre, valor]) => `${nombre}: ${valor}`).join('; '));

  if (cliente.tema.fuenteUrl && !documento.querySelector(`link[href="${cliente.tema.fuenteUrl}"]`)) {
    const fuente = documento.createElement('link');
    fuente.rel = 'stylesheet';
    fuente.href = cliente.tema.fuenteUrl;
    documento.head.appendChild(fuente);
  }

  // El título de la pestaña lo pone cada ruta (TituloStrategy) y el favicon está en src/index.html.
}
