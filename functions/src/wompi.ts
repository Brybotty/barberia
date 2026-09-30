import { createHash, timingSafeEqual } from 'node:crypto';

/** Estados de pago del pedido (igual que EstadoPago en src/app/core/models/pedido.model.ts). */
export type EstadoPago = 'pendiente' | 'aprobado' | 'rechazado' | 'anulado' | 'error';

/** Datos de una transacción de Wompi que usamos. */
export interface TransaccionWompi {
  id: string;
  status: string;
  reference: string;
  amount_in_cents: number;
  currency: string;
  payment_method_type?: string;
}

export interface EventoWompi {
  event: string;
  data: Record<string, unknown>;
  signature: { properties: string[]; checksum: string };
  timestamp: number;
  environment?: string;
  sent_at?: string;
}

export const ESTADO_WOMPI: Record<string, EstadoPago> = {
  APPROVED: 'aprobado',
  DECLINED: 'rechazado',
  VOIDED: 'anulado',
  ERROR: 'error',
  PENDING: 'pendiente',
};

export function sha256(texto: string): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

/**
 * Firma de integridad del checkout: SHA256("<referencia><monto en centavos><moneda>[<expiración>]<secreto>").
 * https://docs.wompi.co/docs/colombia/widget-checkout-web/
 */
export function firmaIntegridad(referencia: string, montoCentavos: number, moneda: string, secreto: string, expiracion = ''): string {
  return sha256(`${referencia}${montoCentavos}${moneda}${expiracion}${secreto}`);
}

/**
 * Comprueba que un evento (webhook) viene de Wompi: SHA256 de los valores de `signature.properties`
 * (en orden) + `timestamp` + secreto de eventos, comparado con `signature.checksum`.
 * https://docs.wompi.co/docs/colombia/eventos/
 */
export function eventoValido(evento: EventoWompi, secretoEventos: string): boolean {
  const propiedades = evento?.signature?.properties;
  const checksum = evento?.signature?.checksum;
  if (!Array.isArray(propiedades) || typeof checksum !== 'string' || evento.timestamp === undefined) return false;

  const valores = propiedades.map(ruta =>
    ruta.split('.').reduce<unknown>((objeto, clave) => (objeto as Record<string, unknown> | undefined)?.[clave], evento.data),
  );
  const esperado = Buffer.from(sha256(`${valores.join('')}${evento.timestamp}${secretoEventos}`), 'hex');
  const recibido = Buffer.from(checksum.toLowerCase(), 'hex');
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

/** API pública de Wompi según el tipo de llave (pruebas o producción). */
export function urlApi(llavePublica: string): string {
  return llavePublica.startsWith('pub_prod_') ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1';
}

export interface DatosCheckout {
  llavePublica: string;
  referencia: string;
  montoCentavos: number;
  firma: string;
  redirectUrl: string;
  cliente?: { email?: string; nombre?: string; telefono?: string; documento?: string };
}

/** Enlace al Web Checkout de Wompi (equivale a enviar su formulario GET). */
export function urlCheckout(datos: DatosCheckout): string {
  const params = new URLSearchParams({
    'public-key': datos.llavePublica,
    currency: 'COP',
    'amount-in-cents': String(datos.montoCentavos),
    reference: datos.referencia,
    'signature:integrity': datos.firma,
    'redirect-url': datos.redirectUrl,
  });
  const { email, nombre, telefono, documento } = datos.cliente ?? {};
  if (email) params.set('customer-data:email', email);
  if (nombre) params.set('customer-data:full-name', nombre);
  if (telefono) {
    params.set('customer-data:phone-number', telefono);
    params.set('customer-data:phone-number-prefix', '+57');
  }
  if (documento) {
    params.set('customer-data:legal-id', documento);
    params.set('customer-data:legal-id-type', 'CC');
  }
  return `https://checkout.wompi.co/p/?${params}`;
}

/** Las referencias son "<pedidoId>-<intento>". Los IDs de Firestore no tienen guiones. */
export function pedidoDeReferencia(referencia: string): string | null {
  const coincidencia = /^([A-Za-z0-9]{10,40})-\d+$/.exec(referencia ?? '');
  return coincidencia ? coincidencia[1] : null;
}
