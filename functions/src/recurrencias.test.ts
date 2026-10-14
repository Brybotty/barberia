import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Recurrencia, bloquesAConsultar, bloquesDelTurno, citaDeLaSerie, esValida, estaLibre, fechasDeLaSerie, hora12, hoyEnColombia, idDeCita,
  inicioDelTurno, motivoOcupado, motivoParaOmitir, sumarDias,
} from './recurrencias';

// El 17 de octubre de 2026 es sábado.
const serie = (extra: Partial<Recurrencia> = {}): Recurrencia => ({
  clienteNombre: 'Juan Camilo', clienteTelefono: '3001234567',
  servicioId: 'S1', serviceName: 'Acicale sencillo', precio: 30000, duracionMinutos: 40,
  barberoId: 'JoseJulian', barberoNombre: 'José Julián',
  frecuencia: 'semanal', hora: '17:20', desde: '2026-10-17', activa: true,
  creadoEn: '2026-10-14T15:00:00.000Z', actualizadoEn: '2026-10-14T15:00:00.000Z', ...extra,
});

test('semanal, quincenal y mensual caen siempre el mismo día de la semana', () => {
  assert.deepEqual(fechasDeLaSerie(serie(), '2026-10-14', '2026-11-14'), ['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14']);
  assert.deepEqual(fechasDeLaSerie(serie({ frecuencia: 'quincenal' }), '2026-10-14', '2026-11-14'), ['2026-10-17', '2026-10-31', '2026-11-14']);
  // Mensual es cada 4 semanas.
  assert.deepEqual(fechasDeLaSerie(serie({ frecuencia: 'mensual' }), '2026-10-14', '2026-12-31'), ['2026-10-17', '2026-11-14', '2026-12-12']);
});

test('una serie vieja sigue su paso: el primer turno es el que le toca, no el primer sábado', () => {
  // Quincenal desde el 5 de septiembre: 19 sep, 3 oct, 17 oct, 31 oct...
  assert.deepEqual(fechasDeLaSerie(serie({ frecuencia: 'quincenal', desde: '2026-09-05' }), '2026-10-04', '2026-11-01'), ['2026-10-17', '2026-10-31']);
  // Si el rango empieza justo en un turno, ese cuenta.
  assert.deepEqual(fechasDeLaSerie(serie({ frecuencia: 'quincenal', desde: '2026-09-05' }), '2026-10-03', '2026-10-03'), ['2026-10-03']);
  // Nada antes del primer día de la serie.
  assert.deepEqual(fechasDeLaSerie(serie(), '2026-10-01', '2026-10-20'), ['2026-10-17']);
});

test('las fechas pasan bien de mes y de año', () => {
  assert.deepEqual(fechasDeLaSerie(serie({ desde: '2026-12-26' }), '2026-12-20', '2027-01-16'), ['2026-12-26', '2027-01-02', '2027-01-09', '2027-01-16']);
  assert.equal(sumarDias('2026-10-14', 62), '2026-12-15');
  assert.equal(sumarDias('2028-02-27', 2), '2028-02-29');
});

test('una serie dañada no da fechas', () => {
  assert.deepEqual(fechasDeLaSerie(serie({ desde: '17/10/2026' }), '2026-10-14', '2026-11-14'), []);
  assert.deepEqual(fechasDeLaSerie(serie({ frecuencia: 'diaria' as never }), '2026-10-14', '2026-11-14'), []);
});

test('hoy y la hora del turno son los de Colombia', () => {
  // Las 10 de la noche del 14 en Colombia ya son el 15 en UTC.
  assert.equal(hoyEnColombia(new Date('2026-10-15T03:00:00Z')), '2026-10-14');
  assert.equal(inicioDelTurno('2026-10-17', '17:20').toISOString(), '2026-10-17T22:20:00.000Z');
  assert.equal(hora12('17:20'), '5:20 PM');
  assert.equal(hora12('09:00'), '9:00 AM');
  assert.equal(hora12('12:00'), '12:00 PM');
  assert.equal(hora12('00:20'), '12:20 AM');
});

test('el turno ocupa sus bloques de 20 min con los IDs de la agenda', () => {
  assert.deepEqual(bloquesDelTurno('Trip', '2026-10-17', '17:20', 60), [
    { id: 'Trip_2026-10-17_1720', hora: '17:20' },
    { id: 'Trip_2026-10-17_1740', hora: '17:40' },
    { id: 'Trip_2026-10-17_1800', hora: '18:00' },
  ]);
  assert.equal(idDeCita('abc123', '2026-10-17'), 'abc123_20261017');
});

test('mira también los bloques de media hora que dejaron las citas viejas', () => {
  const dia = '2026-10-17';
  const ids = bloquesAConsultar('B', dia, '11:20', 40);
  assert.ok(ids.includes('B_2026-10-17_1120') && ids.includes('B_2026-10-17_1140'));
  assert.ok(ids.includes('B_2026-10-17_1030') && ids.includes('B_2026-10-17_1100'));
  // Una cita vieja de 10:30 a 11:00 choca con un turno de 10:20 pero no con uno de 11:00.
  const vieja = new Set(['B_2026-10-17_1030']);
  assert.equal(estaLibre('B', dia, '10:20', 40, vieja), false);
  assert.equal(estaLibre('B', dia, '11:00', 40, vieja), true);
  // Una vieja de una hora (10:30 y 11:00) llega hasta las 11:30: choca con el de 11:20.
  assert.equal(estaLibre('B', dia, '11:20', 40, new Set(['B_2026-10-17_1030', 'B_2026-10-17_1100'])), false);
  assert.equal(estaLibre('B', dia, '11:40', 40, new Set(['B_2026-10-17_1030', 'B_2026-10-17_1100'])), true);
  // Y un bloque nuevo, como siempre.
  assert.equal(estaLibre('B', dia, '17:00', 40, new Set(['B_2026-10-17_1720'])), false);
});

test('no agenda cuando la barbería cierra, en el día libre ni en el descanso del barbero', () => {
  const barbero = { nombre: 'Luis Pérez', diasLibres: [1], descanso: { desde: 780, hasta: 840 } };
  assert.equal(motivoParaOmitir('2026-10-17', serie(), { cierres: ['2026-10-17'] }, barbero), 'La barbería cierra ese día');
  assert.equal(motivoParaOmitir('2026-10-17', serie(), { diasCerrados: [6] }, barbero), 'La barbería no abre ese día');
  assert.equal(motivoParaOmitir('2026-10-19', serie({ desde: '2026-10-19' }), { diasCerrados: [0] }, barbero), 'Es el día libre de Luis');
  assert.equal(motivoParaOmitir('2026-10-17', serie({ hora: '12:40' }), undefined, barbero), 'Se cruza con el descanso de Luis');
  assert.equal(motivoParaOmitir('2026-10-17', serie({ hora: '12:20' }), undefined, barbero), null);
  assert.equal(motivoParaOmitir('2026-10-17', serie(), undefined, undefined), 'José Julián ya no está en el equipo');
  assert.equal(motivoOcupado(serie(), barbero, true), 'Luis cerró ese rato');
  assert.equal(motivoOcupado(serie(), barbero, false), 'Ya hay otra cita a esa hora');
});

test('la cita de cada día es como una del panel, sin cuenta ni correo, y dice de qué serie es', () => {
  const cita = citaDeLaSerie(serie({ duracionMinutos: 60 }), 'abc123', '2026-10-24', new Date('2026-10-14T15:00:00Z'));
  assert.deepEqual(cita, {
    userId: '', userName: 'Juan Camilo', userEmail: '', phone: '3001234567',
    servicioId: 'S1', serviceName: 'Acicale sencillo', precio: 30000, duracionMinutos: 60,
    barberoId: 'JoseJulian', barberoNombre: 'José Julián',
    dia: '2026-10-24', hora: '17:20', horaStr: '5:20 PM', fecha: '2026-10-24T22:20:00.000Z',
    estado: 'pendiente', creadoEn: '2026-10-14T15:00:00.000Z',
    slotIds: ['JoseJulian_2026-10-24_1720', 'JoseJulian_2026-10-24_1740', 'JoseJulian_2026-10-24_1800'],
    recurrenciaId: 'abc123', frecuencia: 'semanal',
  });
});

test('solo agenda series completas y en la rejilla de 20 minutos', () => {
  assert.equal(esValida(serie()), true);
  assert.equal(esValida(serie({ hora: '17:30' })), false);
  assert.equal(esValida(serie({ duracionMinutos: 30 })), false);
  assert.equal(esValida(serie({ duracionMinutos: 0 })), false);
  assert.equal(esValida(serie({ desde: '2026-13-01' })), false);
  assert.equal(esValida(serie({ frecuencia: 'diaria' as never })), false);
  assert.equal(esValida(serie({ clienteNombre: '  ' })), false);
  assert.equal(esValida(serie({ hora: '23:40', duracionMinutos: 40 })), false);
  assert.equal(esValida(undefined), false);
});
