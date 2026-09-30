import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventoWompi, eventoValido, firmaIntegridad, pedidoDeReferencia, sha256, urlApi, urlCheckout } from './wompi';

test('firma de integridad: ejemplo de la documentación de Wompi', () => {
  assert.equal(
    firmaIntegridad('sk8-438k4-xmxm392-sn2m', 2490000, 'COP', 'prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6'),
    '37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5',
  );
});

// Ejemplo de https://docs.wompi.co/docs/colombia/eventos/. El checksum que muestra la documentación
// (3476DDA5...) es ilustrativo: no es el SHA256 real de su propia cadena de ejemplo. Por eso aquí se
// comprueba que eventoValido arma exactamente la cadena que describe la documentación.
const CADENA_DOCS = '1234-1610641025-49201APPROVED44900001530291411prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z';
const CHECKSUM = sha256(CADENA_DOCS).toUpperCase();

const evento = (checksum: string): EventoWompi => ({
  event: 'transaction.updated',
  data: { transaction: { id: '1234-1610641025-49201', status: 'APPROVED', amount_in_cents: 4490000 } },
  signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'], checksum },
  timestamp: 1530291411,
});
const SECRETO = 'prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z';

test('eventoValido acepta la firma correcta (en mayúsculas o minúsculas)', () => {
  assert.ok(eventoValido(evento(CHECKSUM), SECRETO));
  assert.ok(eventoValido(evento(CHECKSUM.toLowerCase()), SECRETO));
});

test('eventoValido rechaza firmas alteradas, otro secreto o eventos mal formados', () => {
  assert.ok(!eventoValido(evento(CHECKSUM.slice(0, -1) + (CHECKSUM.endsWith('0') ? '1' : '0')), SECRETO));
  assert.ok(!eventoValido(evento(CHECKSUM), 'otro_secreto'));
  const alterado = evento(CHECKSUM);
  (alterado.data['transaction'] as { amount_in_cents: number }).amount_in_cents = 100;
  assert.ok(!eventoValido(alterado, SECRETO));
  assert.ok(!eventoValido({} as EventoWompi, SECRETO));
  assert.ok(!eventoValido(evento('corto'), SECRETO));
});

test('referencias y API', () => {
  assert.equal(pedidoDeReferencia('Ab12Cd34Ef56Gh78Ij90-3'), 'Ab12Cd34Ef56Gh78Ij90');
  assert.equal(pedidoDeReferencia('sin-intento'), null);
  assert.equal(pedidoDeReferencia('../x-1'), null);
  assert.equal(urlApi('pub_prod_abc'), 'https://production.wompi.co/v1');
  assert.equal(urlApi('pub_test_abc'), 'https://sandbox.wompi.co/v1');
});

test('urlCheckout lleva los campos del formulario de Wompi', () => {
  const url = new URL(urlCheckout({
    llavePublica: 'pub_test_x', referencia: 'P1-1', montoCentavos: 6200000, firma: 'abc',
    redirectUrl: 'https://tienda.co/tienda/pedido/P1', cliente: { email: 'a@b.co', telefono: '3001234567' },
  }));
  assert.equal(url.origin + url.pathname, 'https://checkout.wompi.co/p/');
  assert.equal(url.searchParams.get('public-key'), 'pub_test_x');
  assert.equal(url.searchParams.get('amount-in-cents'), '6200000');
  assert.equal(url.searchParams.get('signature:integrity'), 'abc');
  assert.equal(url.searchParams.get('customer-data:phone-number-prefix'), '+57');
  assert.equal(url.searchParams.get('customer-data:legal-id'), null);
});
