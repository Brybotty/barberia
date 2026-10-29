import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Recurrencia, citaDeLaSerie, esValida, fechasDeLaSerie, hora12, hoyEnColombia, idDeCita, inicioDelTurno, motivoOcupado, motivoParaOmitir,
  sumarDias,
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

test('cada día de la serie tiene un ID fijo', () => {
  assert.equal(idDeCita('abc123', '2026-10-17'), 'abc123_20261017');
});

test('no agenda cuando la barbería cierra, en el día libre ni en el descanso del barbero', () => {
  const barbero = { nombre: 'Luis Pérez', diasLibres: [1], descanso: { desde: 780, hasta: 840 } };
  assert.equal(motivoParaOmitir('2026-10-17', serie(), { cierres: ['2026-10-17'] }, barbero), 'La barbería cierra ese día');
  assert.equal(motivoParaOmitir('2026-10-17', serie(), { diasCerrados: [6] }, barbero), 'La barbería no abre ese día');
  assert.equal(motivoParaOmitir('2026-10-19', serie({ desde: '2026-10-19' }), { diasCerrados: [0] }, barbero), 'Es el día libre de Luis');
  assert.equal(motivoParaOmitir('2026-10-17', serie({ hora: '12:40' }), undefined, barbero), 'Se cruza con el descanso de Luis');
  assert.equal(motivoParaOmitir('2026-10-17', serie({ hora: '12:20' }), undefined, barbero), null);
  // Con la duración exacta: 12:20 + 45 min llega a la 1:05, dentro del descanso; + 35 min, no.
  assert.equal(motivoParaOmitir('2026-10-17', serie({ hora: '12:20', duracionMinutos: 45 }), undefined, barbero), 'Se cruza con el descanso de Luis');
  assert.equal(motivoParaOmitir('2026-10-17', serie({ hora: '12:20', duracionMinutos: 35 }), undefined, barbero), null);
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
    recurrenciaId: 'abc123', frecuencia: 'semanal',
  });
});

test('el turno lleva el correo del cliente (en minúsculas) para que lo vea en su cuenta', () => {
  const cita = citaDeLaSerie(serie({ clienteCorreo: ' Juan.Camilo@Correo.com ' }), 'abc123', '2026-10-24');
  assert.equal(cita.userEmail, 'juan.camilo@correo.com');
  assert.equal(citaDeLaSerie(serie(), 'abc123', '2026-10-24').userEmail, '');
});

test('solo agenda series completas, a una hora de la rejilla de 5 y con una duración de 5 en 5', () => {
  assert.equal(esValida(serie()), true);
  for (const hora of ['17:30', '10:25', '09:05']) assert.equal(esValida(serie({ hora })), true, hora);
  for (const hora of ['17:03', '10:31', '9:20', '24:00']) assert.equal(esValida(serie({ hora })), false, hora);
  for (const duracion of [5, 25, 30, 45, 85, 240]) assert.equal(esValida(serie({ duracionMinutos: duracion })), true, `${duracion} min`);
  for (const duracion of [0, -5, 7, 22.5, 245, 300]) assert.equal(esValida(serie({ duracionMinutos: duracion })), false, `${duracion} min`);
  assert.equal(esValida(serie({ desde: '2026-13-01' })), false);
  assert.equal(esValida(serie({ frecuencia: 'diaria' as never })), false);
  assert.equal(esValida(serie({ clienteNombre: '  ' })), false);
  assert.equal(esValida(serie({ hora: '23:40', duracionMinutos: 40 })), false);
  assert.equal(esValida(undefined), false);
});
