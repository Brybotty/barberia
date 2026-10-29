import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARCAS_DIA, armarOcupacion, cerrar, liberar, mapaVacio, ocupar, tieneCierre, tramo, tramoLibre } from './ocupacion';

// Los mismos casos que src/app/core/utils/ocupacion.spec.ts: la función y la página deben ver el mismo mapa.
const rato = (mapa: string, desde: number, hasta: number) => mapa.slice(desde / 5, hasta / 5);

test('el día tiene 288 marcas de 5 minutos y un rato ocupa las que le tocan', () => {
  assert.equal(MARCAS_DIA, 288);
  assert.equal(mapaVacio().length, 288);
  assert.deepEqual(tramo(600, 25), [120, 5]);
  assert.deepEqual(tramo(560, 40), [112, 8]);
});

test('un fijo de 25 min a las 9:20 deja libre las 9:45 en punto (sin tiempo muerto)', () => {
  const [k, n] = tramo(560, 25);
  const mapa = ocupar(mapaVacio(), k, n);
  assert.equal(rato(mapa, 560, 585), 'ccccc');
  assert.equal(tramoLibre(mapa, ...tramo(585, 40)), true);
  assert.equal(tramoLibre(mapa, ...tramo(580, 40)), false);
  assert.equal(tramoLibre(mapa, ...tramo(1420, 40)), false, 'no se sale del día');
});

test('soltar una cita no abre un cierre, y cerrar no pisa una cita', () => {
  let mapa = ocupar(mapaVacio(), ...tramo(600, 40));
  mapa = cerrar(mapa, 124, 136, 'Almuerzo'); // de 10:20 a 11:20
  // 10:20 a 11:20 cerrado por almuerzo: lo que ya era de la cita (hasta las 10:40) se queda.
  assert.equal(rato(mapa, 600, 680), 'c'.repeat(8) + 'A'.repeat(8));
  assert.equal(tieneCierre(mapa, ...tramo(640, 40)), true);
  mapa = liberar(mapa, ...tramo(600, 40));
  assert.equal(rato(mapa, 600, 680), '0'.repeat(8) + 'A'.repeat(8));
  assert.equal(tieneCierre(mapa, ...tramo(600, 20)), false);
});

test('el día se arma con lo que había: citas activas exactas y cierres de la agenda vieja', () => {
  const dia = '2026-10-17';
  const citas = [
    { id: 'A', barberoId: 'B', dia, hora: '10:00', duracionMinutos: 60, estado: 'pendiente' },
    { id: 'Z', barberoId: 'B', dia, hora: '11:30', duracionMinutos: 30, estado: 'confirmada' },
    { id: 'X', barberoId: 'B', dia, hora: '12:00', duracionMinutos: 40, estado: 'cancelada' },
    { id: 'O', barberoId: 'OTRO', dia, hora: '12:00', duracionMinutos: 40, estado: 'pendiente' },
  ];
  const cierres = [
    // De la agenda de 20 min: 13:00, 13:20 y 13:40 (una hora de almuerzo).
    { hora: '13:00', motivo: 'Almuerzo' }, { hora: '13:20', motivo: 'Almuerzo' }, { hora: '13:40', motivo: 'Almuerzo' },
    // De la de 30 min: 15:00 y 15:30 (una hora), y un 17:00 suelto (media hora, por las dudas).
    { hora: '15:00', motivo: 'Permiso' }, { hora: '15:30', motivo: 'Permiso' }, { hora: '17:00', motivo: 'texto libre' },
  ];
  const o = armarOcupacion('B', dia, citas, cierres);
  assert.deepEqual(o.citas, { A: [120, 12], Z: [138, 6] });
  assert.equal(rato(o.mapa, 600, 660), 'c'.repeat(12));
  assert.equal(rato(o.mapa, 690, 720), 'c'.repeat(6));
  assert.equal(rato(o.mapa, 720, 780), '0'.repeat(12), 'la cancelada y la de otro barbero no ocupan');
  assert.equal(rato(o.mapa, 780, 840), 'A'.repeat(12));
  assert.equal(rato(o.mapa, 900, 960), 'P'.repeat(12));
  assert.equal(rato(o.mapa, 1020, 1050), 'X'.repeat(6), 'un motivo que no es de la lista queda sin motivo');
  assert.equal(rato(o.mapa, 1050, 1060), '00');
});

test('lee la hora como la página: con o sin cero adelante, en 12 h, o de horaStr si falta', () => {
  const dia = '2026-10-17';
  const o = armarOcupacion('B', dia, [
    { id: 'A', barberoId: 'B', dia, hora: '9:00', duracionMinutos: 30, estado: 'pendiente' },
    { id: 'Z', barberoId: 'B', dia, horaStr: '2:30 PM', duracionMinutos: 30, estado: 'confirmada' },
  ], []);
  assert.deepEqual(o.citas, { A: [108, 6], Z: [174, 6] });
});
