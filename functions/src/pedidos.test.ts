import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AJUSTES_TIENDA_DEFECTO, ErrorPedido, Producto, conDefectos, costoEnvio, entregaActiva, metodosPara, moverStock,
  prepararItems, validarSolicitud,
} from './pedidos';

const catalogo = new Map<string, Producto | undefined>([
  ['cera', { nombre: 'Cera', precio: 35000, visible: true, agotado: false }],
  ['talco', { nombre: 'Talco', precio: 0, visible: true, agotado: false, opciones: [{ nombre: '200 g', precio: 18000 }, { nombre: '400 g', precio: 30000, agotado: true }] }],
  ['oculto', { nombre: 'Oculto', precio: 10000, visible: false, agotado: false }],
  ['gel', { nombre: 'Gel', precio: 22000, visible: true, agotado: false, controlStock: true, stock: 3 }],
  ['aceite', { nombre: 'Aceite', precio: 0, visible: true, agotado: false, controlStock: true, opciones: [{ nombre: '30 ml', precio: 25000, stock: 1 }, { nombre: '60 ml', precio: 40000, stock: 0 }] }],
]);

const item = (productoId: string, cantidad = 1, opcion: string | null = null) => ({ productoId, opcion, cantidad });

test('prepararItems usa los precios del catálogo', () => {
  const r = prepararItems([item('cera', 2), item('talco', 1, '200 g')], catalogo);
  assert.deepEqual(r.items.map(i => i.precio), [35000, 18000]);
  assert.equal(r.subtotal, 88000);
  assert.deepEqual(r.descuentos, [], 'sin control de inventario no se descuenta nada');
});

test('prepararItems descuenta inventario y junta líneas repetidas', () => {
  const r = prepararItems([item('gel', 1), item('gel', 2), item('aceite', 1, '30 ml')], catalogo);
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].cantidad, 3);
  assert.deepEqual(r.descuentos, [{ productoId: 'gel', opcion: null, cantidad: 3 }, { productoId: 'aceite', opcion: '30 ml', cantidad: 1 }]);
});

test('prepararItems no vende más de lo que hay', () => {
  assert.throws(() => prepararItems([item('gel', 4)], catalogo), /Solo quedan 3/);
  assert.throws(() => prepararItems([item('gel', 2), item('gel', 2)], catalogo), /Solo quedan 3/);
  assert.throws(() => prepararItems([item('aceite', 1, '60 ml')], catalogo), /agotar/);
});

test('prepararItems rechaza agotados, ocultos, inexistentes y opciones inválidas', () => {
  for (const pedido of [[item('talco', 1, '400 g')], [item('talco')], [item('oculto')], [item('no-existe')], [item('cera', 1, 'x')]]) {
    assert.throws(() => prepararItems(pedido, catalogo), ErrorPedido);
  }
});

test('moverStock resta al vender y suma al devolver, sin bajar de 0', () => {
  assert.deepEqual(moverStock(catalogo.get('gel')!, [{ opcion: null, delta: -2 }]).campos, { stock: 1 });
  assert.deepEqual(moverStock(catalogo.get('gel')!, [{ opcion: null, delta: -9 }]).campos, { stock: 0 });
  const conOpciones = moverStock(catalogo.get('aceite')!, [{ opcion: '30 ml', delta: -1 }, { opcion: '60 ml', delta: 5 }, { opcion: 'no-existe', delta: 1 }]);
  assert.deepEqual(conOpciones.campos.opciones!.map(o => o.stock), [0, 5]);
  assert.equal(conOpciones.resultados.length, 2);
  assert.equal(catalogo.get('aceite')!.opciones![0].stock, 1, 'no modifica el producto original');
});

test('envío, entregas y métodos de pago', () => {
  const tienda = conDefectos({ entrega: { ...AJUSTES_TIENDA_DEFECTO.entrega, gratisDesde: 50000 } });
  assert.equal(costoEnvio('local', 70000, tienda), 0);
  assert.equal(costoEnvio('local', 20000, tienda), 8000);
  assert.equal(costoEnvio('recoger', 1000, tienda), 0);
  assert.ok(!entregaActiva('nacional', tienda));
  assert.deepEqual(metodosPara('local', tienda), ['contraentrega']);
  assert.deepEqual(metodosPara('recoger', tienda), ['en-tienda']);
  assert.deepEqual(metodosPara('nacional', conDefectos({ pagos: { enLinea: true, contraentrega: true, enTienda: true } })), ['en-linea']);
});

const solicitud = (extra: Record<string, unknown> = {}) => ({
  cliente: { nombre: 'Ana Pérez', telefono: '310 123 4567', email: 'Ana@Correo.co', documento: '' },
  entrega: { tipo: 'local', direccion: 'Calle 1 # 2-3', barrio: '', ciudad: 'Cali', departamento: 'Valle del Cauca', notas: '' },
  items: [{ productoId: 'cera', opcion: null, cantidad: 1 }],
  metodo: 'contraentrega',
  aceptaPolitica: true,
  ...extra,
});

test('validarSolicitud limpia los datos que llegan del navegador', () => {
  const v = validarSolicitud(solicitud());
  assert.equal(v.cliente.telefono, '3101234567');
  assert.equal(v.cliente.email, 'ana@correo.co');
  const recoger = validarSolicitud(solicitud({ entrega: { tipo: 'recoger', direccion: 'no debería guardarse' } }));
  assert.equal(recoger.entrega.direccion, '');
});

test('validarSolicitud rechaza solicitudes incompletas o manipuladas', () => {
  const malas = [
    solicitud({ aceptaPolitica: false }),
    solicitud({ cliente: { nombre: 'Ana', telefono: '123', email: 'a@b.co' } }),
    solicitud({ entrega: { tipo: 'local', direccion: '' } }),
    solicitud({ entrega: { tipo: 'avion', direccion: 'Calle 1 # 2-3' } }),
    solicitud({ metodo: 'regalo' }),
    solicitud({ items: [] }),
    solicitud({ items: [{ productoId: 'cera', cantidad: 0 }] }),
    solicitud({ items: [{ productoId: 'cera', cantidad: 1.5 }] }),
    solicitud({ items: [{ productoId: '../x', cantidad: 1 }] }),
    null,
  ];
  for (const mala of malas) assert.throws(() => validarSolicitud(mala), ErrorPedido);
});
