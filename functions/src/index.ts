/**
 * Cloud Functions de la tienda.
 *
 * Pedidos e inventario:
 * - crearPedido (callable): arma el pedido con los precios del catálogo, calcula el envío y
 *   descuenta el inventario, todo en una transacción (no se vende lo que no hay).
 * - cancelarPedido (callable): cancela y devuelve las unidades al inventario.
 *
 * Pagos en línea con Wompi (Bancolombia):
 * - iniciarPagoWompi (callable): firma el monto del pedido y devuelve el enlace del checkout.
 * - confirmarPagoWompi (callable): al volver del checkout consulta la transacción en Wompi
 *   (por si el webhook tarda).
 * - webhookWompi (HTTP): recibe los eventos de Wompi. Es la fuente de verdad del estado del pago.
 * - simularPagoWompi (callable): SOLO en los emuladores, para la demo sin llaves reales.
 *
 * Configuración (ver README): WOMPI_PUBLIC_KEY en functions/.env y los secretos
 * WOMPI_INTEGRITY_SECRET y WOMPI_EVENTS_SECRET con `firebase functions:secrets:set`.
 */
import { initializeApp } from 'firebase-admin/app';
import { DocumentReference, FieldValue, Transaction, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import {
  ESTADO_WOMPI, EstadoPago, EventoWompi, TransaccionWompi, eventoValido, firmaIntegridad, pedidoDeReferencia, urlApi,
  urlCheckout,
} from './wompi';
import {
  Descuento, ErrorPedido, ItemPedido, Producto, conDefectos, costoEnvio, entregaActiva, metodosPara, moverStock,
  prepararItems, validarSolicitud,
} from './pedidos';

initializeApp();
const db = getFirestore();

// Tope de instancias: evita sorpresas en la factura si alguien abusa de las funciones.
// invoker 'public': las callable y el webhook deben poder llamarse desde internet (cada función
// valida por dentro la sesión o la firma). Explícito para que cada deploy lo vuelva a aplicar.
setGlobalOptions({ maxInstances: 5, invoker: 'public' });

// Mientras no sea una llave real (pub_test_... o pub_prod_...), el pago en línea responde "aún no está configurado".
const WOMPI_PUBLIC_KEY = defineString('WOMPI_PUBLIC_KEY', { description: 'Llave pública de Wompi (pub_test_... o pub_prod_...)', default: '' });
const WOMPI_INTEGRITY_SECRET = defineSecret('WOMPI_INTEGRITY_SECRET');
const WOMPI_EVENTS_SECRET = defineSecret('WOMPI_EVENTS_SECRET');

/** Pago simulado: solo con los emuladores y WOMPI_SIMULADO=true (functions/.env.demo-acicale). */
const pagoSimulado = () => process.env.FUNCTIONS_EMULATOR === 'true' && process.env.WOMPI_SIMULADO === 'true';

interface Pedido {
  userId: string;
  cliente: { nombre: string; telefono: string; email: string; documento?: string };
  entrega: { tipo: 'recoger' | 'local' | 'nacional' };
  items: ItemPedido[];
  total: number;
  estado: string;
  stockDescontado?: Descuento[];
  stockDevuelto?: boolean;
  pago: { metodo: string; estado: EstadoPago; referencia?: string; intentos?: number; transaccionId?: string };
}

const ID_VALIDO = /^[A-Za-z0-9]{10,40}$/;
const ahora = () => new Date().toISOString();

async function esAdmin(uid: string): Promise<boolean> {
  const perfil = await db.doc(`usuarios/${uid}`).get();
  return perfil.get('rol') === 'admin';
}

/** Convierte los errores de negocio en mensajes para el cliente. */
function comoHttps(error: unknown): never {
  if (error instanceof ErrorPedido) throw new HttpsError('failed-precondition', error.message);
  throw error;
}

/** Mueve el stock de varios productos dentro de una transacción y registra los movimientos. */
function aplicarInventario(
  tx: Transaction,
  productos: Map<string, { ref: DocumentReference; datos?: Producto }>,
  cambios: Descuento[],
  signo: 1 | -1,
  movimiento: { tipo: 'venta' | 'cancelacion'; pedidoId: string },
) {
  const porProducto = new Map<string, Descuento[]>();
  for (const c of cambios) porProducto.set(c.productoId, [...(porProducto.get(c.productoId) ?? []), c]);

  for (const [productoId, lista] of porProducto) {
    const producto = productos.get(productoId);
    if (!producto?.datos?.controlStock) continue;
    const { campos, resultados } = moverStock(producto.datos, lista.map(c => ({ opcion: c.opcion, delta: signo * c.cantidad })));
    tx.update(producto.ref, campos);
    for (const r of resultados) {
      tx.set(db.collection('movimientosInventario').doc(), {
        productoId, producto: producto.datos.nombre, opcion: r.opcion, cantidad: r.delta, stockResultante: r.stockResultante,
        tipo: movimiento.tipo, pedidoId: movimiento.pedidoId, usuario: 'Tienda en línea', fecha: ahora(),
      });
    }
  }
}

async function leerProductos(tx: Transaction, ids: string[]) {
  const refs = [...new Set(ids)].filter(id => /^[A-Za-z0-9]{1,40}$/.test(id)).map(id => db.doc(`productos/${id}`));
  const snaps = refs.length ? await tx.getAll(...refs) : [];
  return new Map(snaps.map(s => [s.id, { ref: s.ref, datos: s.exists ? (s.data() as Producto) : undefined }]));
}

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

export const crearPedido = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Inicia sesión para hacer tu pedido.');

  try {
    const solicitud = validarSolicitud(request.data);
    const pedidoRef = db.collection('pedidos').doc();

    await db.runTransaction(async tx => {
      const ajustes = await tx.get(db.doc('ajustes/sitio'));
      const productos = await leerProductos(tx, solicitud.items.map(i => i.productoId));

      const tienda = conDefectos(ajustes.get('tienda'));
      if (!tienda.activa) throw new ErrorPedido('La tienda está cerrada en este momento.');
      if (!entregaActiva(solicitud.entrega.tipo, tienda)) throw new ErrorPedido('Esa forma de entrega ya no está disponible.');
      if (!metodosPara(solicitud.entrega.tipo, tienda).includes(solicitud.metodo)) {
        throw new ErrorPedido('Ese método de pago no está disponible para esta forma de entrega.');
      }

      const { items, subtotal, descuentos } = prepararItems(solicitud.items, new Map([...productos].map(([id, p]) => [id, p.datos])));
      const envio = costoEnvio(solicitud.entrega.tipo, subtotal, tienda);

      aplicarInventario(tx, productos, descuentos, -1, { tipo: 'venta', pedidoId: pedidoRef.id });
      tx.set(pedidoRef, {
        userId: uid,
        cliente: solicitud.cliente,
        entrega: solicitud.entrega,
        items,
        subtotal,
        envio,
        total: subtotal + envio,
        pago: { metodo: solicitud.metodo, estado: 'pendiente' },
        estado: 'pendiente',
        stockDescontado: descuentos,
        creadoEn: ahora(),
        autorizacionDatos: ahora(),
      });
    });

    logger.info('Pedido creado', { pedidoId: pedidoRef.id });
    return { pedidoId: pedidoRef.id };
  } catch (error) {
    comoHttps(error);
  }
});

export const cancelarPedido = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const { pedidoId } = (request.data ?? {}) as { pedidoId?: string };
  if (!pedidoId || !ID_VALIDO.test(pedidoId)) throw new HttpsError('invalid-argument', 'Pedido no válido.');
  const admin = await esAdmin(uid);
  const pedidoRef = db.doc(`pedidos/${pedidoId}`);

  await db.runTransaction(async tx => {
    const snap = await tx.get(pedidoRef);
    if (!snap.exists) throw new HttpsError('not-found', 'No encontramos el pedido.');
    const pedido = snap.data() as Pedido;
    if (pedido.estado === 'cancelado') return;
    if (!admin) {
      if (pedido.userId !== uid) throw new HttpsError('permission-denied', 'Este pedido no es tuyo.');
      if (pedido.estado !== 'pendiente' || pedido.pago.estado === 'aprobado') {
        throw new HttpsError('failed-precondition', 'Ya estamos preparando tu pedido. Escríbenos para cancelarlo.');
      }
    }
    if (pedido.estado === 'entregado') throw new HttpsError('failed-precondition', 'Un pedido entregado no se puede cancelar.');

    const devolver = pedido.stockDevuelto ? [] : pedido.stockDescontado ?? [];
    const productos = await leerProductos(tx, devolver.map(d => d.productoId));
    aplicarInventario(tx, productos, devolver, 1, { tipo: 'cancelacion', pedidoId });
    tx.update(pedidoRef, { estado: 'cancelado', stockDevuelto: true, canceladoEn: ahora(), canceladoPor: admin ? 'admin' : 'cliente' });
  });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Pagos con Wompi
// ---------------------------------------------------------------------------

export const iniciarPagoWompi = onCall({ secrets: [WOMPI_INTEGRITY_SECRET] }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Inicia sesión para pagar.');

  const { pedidoId, origen } = (request.data ?? {}) as { pedidoId?: string; origen?: string };
  if (!pedidoId || !ID_VALIDO.test(pedidoId)) throw new HttpsError('invalid-argument', 'Pedido no válido.');
  if (!origen || !/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(origen)) throw new HttpsError('invalid-argument', 'Origen no válido.');

  const llavePublica = WOMPI_PUBLIC_KEY.value();
  if (!llavePublica.startsWith('pub_')) throw new HttpsError('failed-precondition', 'El pago en línea aún no está configurado.');

  const pedidoRef = db.doc(`pedidos/${pedidoId}`);
  const datos = await db.runTransaction(async tx => {
    const snap = await tx.get(pedidoRef);
    if (!snap.exists) throw new HttpsError('not-found', 'No encontramos el pedido.');
    const pedido = snap.data() as Pedido;
    if (pedido.userId !== uid) throw new HttpsError('permission-denied', 'Este pedido no es tuyo.');
    if (pedido.pago.metodo !== 'en-linea') throw new HttpsError('failed-precondition', 'Este pedido no se paga en línea.');
    if (pedido.estado === 'cancelado') throw new HttpsError('failed-precondition', 'El pedido está cancelado.');
    if (pedido.pago.estado === 'aprobado') throw new HttpsError('failed-precondition', 'Este pedido ya está pagado.');

    const tienda = conDefectos((await tx.get(db.doc('ajustes/sitio'))).get('tienda'));
    if (!tienda.pagos.enLinea) throw new HttpsError('failed-precondition', 'El pago en línea está desactivado.');

    // Cada intento lleva su referencia: Wompi no admite repetirla.
    const intentos = (pedido.pago.intentos ?? 0) + 1;
    const referencia = `${pedidoId}-${intentos}`;
    tx.update(pedidoRef, {
      'pago.estado': 'pendiente',
      'pago.referencia': referencia,
      'pago.intentos': intentos,
      'pago.actualizadoEn': ahora(),
    });
    return { referencia, total: pedido.total, cliente: pedido.cliente };
  });

  if (pagoSimulado()) {
    return { url: `${origen}/tienda/pago-simulado/${pedidoId}` };
  }

  // El total lo calculó crearPedido con el catálogo: el navegador no puede cambiarlo.
  const montoCentavos = Math.round(datos.total * 100);
  return {
    url: urlCheckout({
      llavePublica,
      referencia: datos.referencia,
      montoCentavos,
      firma: firmaIntegridad(datos.referencia, montoCentavos, 'COP', WOMPI_INTEGRITY_SECRET.value()),
      redirectUrl: `${origen}/tienda/pedido/${pedidoId}`,
      cliente: {
        email: datos.cliente.email,
        nombre: datos.cliente.nombre,
        telefono: datos.cliente.telefono,
        documento: datos.cliente.documento,
      },
    }),
  };
});

export const confirmarPagoWompi = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const { pedidoId, transaccionId } = (request.data ?? {}) as { pedidoId?: string; transaccionId?: string };
  if (!pedidoId || !ID_VALIDO.test(pedidoId) || !transaccionId || !/^[\w-]{5,60}$/.test(transaccionId)) {
    throw new HttpsError('invalid-argument', 'Datos no válidos.');
  }

  const pedido = await db.doc(`pedidos/${pedidoId}`).get();
  if (!pedido.exists) throw new HttpsError('not-found', 'No encontramos el pedido.');
  if (pedido.get('userId') !== uid && !(await esAdmin(uid))) throw new HttpsError('permission-denied', 'Este pedido no es tuyo.');

  // Los pagos simulados ya quedaron aplicados; no existen en Wompi.
  if (pagoSimulado() && transaccionId.startsWith('SIM-')) return { estado: pedido.get('pago.estado') };

  // La consulta de una transacción en Wompi es pública (no usa llaves privadas).
  const respuesta = await fetch(`${urlApi(WOMPI_PUBLIC_KEY.value())}/transactions/${encodeURIComponent(transaccionId)}`);
  if (!respuesta.ok) throw new HttpsError('unavailable', 'No pudimos consultar el pago en Wompi.');
  const { data } = (await respuesta.json()) as { data: TransaccionWompi };
  if (pedidoDeReferencia(data?.reference) !== pedidoId) throw new HttpsError('invalid-argument', 'La transacción no es de este pedido.');

  return { estado: await aplicarTransaccion(data) };
});

export const webhookWompi = onRequest({ secrets: [WOMPI_EVENTS_SECRET] }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Método no permitido');
    return;
  }
  const evento = req.body as EventoWompi;
  if (!eventoValido(evento, WOMPI_EVENTS_SECRET.value())) {
    logger.warn('Evento de Wompi con firma inválida', { event: evento?.event });
    res.status(401).send('Firma inválida');
    return;
  }
  if (evento.event !== 'transaction.updated') {
    res.status(200).send('Ignorado');
    return;
  }
  try {
    const estado = await aplicarTransaccion(evento.data['transaction'] as TransaccionWompi);
    res.status(200).json({ estado });
  } catch (error) {
    // Un 500 hace que Wompi reintente más tarde.
    logger.error('Error procesando el evento de Wompi', error);
    res.status(500).send('Error');
  }
});

/** Demo sin llaves reales: aprueba o rechaza el pago como lo haría Wompi. Solo en los emuladores. */
export const simularPagoWompi = onCall(async request => {
  if (!pagoSimulado()) throw new HttpsError('failed-precondition', 'El pago simulado solo existe en los emuladores.');
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const { pedidoId, aprobar, medio } = (request.data ?? {}) as { pedidoId?: string; aprobar?: boolean; medio?: string };
  if (!pedidoId || !ID_VALIDO.test(pedidoId)) throw new HttpsError('invalid-argument', 'Pedido no válido.');

  const snap = await db.doc(`pedidos/${pedidoId}`).get();
  const pedido = snap.data() as Pedido | undefined;
  if (!pedido || pedido.userId !== uid) throw new HttpsError('permission-denied', 'Este pedido no es tuyo.');
  if (!pedido.pago.referencia) throw new HttpsError('failed-precondition', 'Primero inicia el pago.');

  const transaccion: TransaccionWompi = {
    id: `SIM-${Date.now()}`,
    status: aprobar ? 'APPROVED' : 'DECLINED',
    reference: pedido.pago.referencia,
    amount_in_cents: Math.round(pedido.total * 100),
    currency: 'COP',
    payment_method_type: ['CARD', 'NEQUI', 'PSE', 'BANCOLOMBIA_TRANSFER'].includes(medio ?? '') ? medio : 'CARD',
  };
  return { transaccionId: transaccion.id, estado: await aplicarTransaccion(transaccion) };
});

/**
 * Lleva el estado de una transacción de Wompi al pedido. Es idempotente: el webhook y la
 * consulta al volver del checkout pueden aplicar la misma transacción sin problema.
 */
async function aplicarTransaccion(transaccion: TransaccionWompi): Promise<EstadoPago | null> {
  const pedidoId = pedidoDeReferencia(transaccion?.reference);
  if (!pedidoId) {
    logger.warn('Transacción con referencia desconocida', { referencia: transaccion?.reference });
    return null;
  }
  const pedidoRef = db.doc(`pedidos/${pedidoId}`);

  return db.runTransaction(async tx => {
    const snap = await tx.get(pedidoRef);
    if (!snap.exists) {
      logger.warn('Transacción de un pedido que no existe', { pedidoId, transaccion: transaccion.id });
      return null;
    }
    const pedido = snap.data() as Pedido;

    // Ya pagado con otra transacción: no dejar que un intento viejo lo cambie.
    if (pedido.pago.estado === 'aprobado' && pedido.pago.transaccionId && pedido.pago.transaccionId !== transaccion.id) {
      return pedido.pago.estado;
    }

    let estado = ESTADO_WOMPI[transaccion.status] ?? 'error';
    // Un rechazo de un intento anterior no debe pisar el intento en curso.
    if (estado !== 'aprobado' && pedido.pago.referencia && pedido.pago.referencia !== transaccion.reference) {
      return pedido.pago.estado;
    }
    const montoEsperado = Math.round(pedido.total * 100);
    if (estado === 'aprobado' && (transaccion.currency !== 'COP' || transaccion.amount_in_cents !== montoEsperado)) {
      logger.error('El monto pagado no coincide con el pedido', { pedidoId, pagado: transaccion.amount_in_cents, esperado: montoEsperado });
      estado = 'error';
    }

    tx.update(pedidoRef, {
      'pago.estado': estado,
      'pago.transaccionId': transaccion.id,
      'pago.medio': transaccion.payment_method_type ?? FieldValue.delete(),
      'pago.actualizadoEn': ahora(),
      // Pagado = confirmado; el admin lo ve listo para preparar.
      ...(estado === 'aprobado' && pedido.estado === 'pendiente' ? { estado: 'confirmado' } : {}),
    });
    return estado;
  });
}
