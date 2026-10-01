import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Cita, Negocio, archivoIcs, debeAvisar, emailValido, escaparHtml, fechaLarga, inicioDeCita, mananaEnColombia, necesitaRecordatorio,
  tipoDeCambio,
} from './correo';
import {
  correoBarbero, correoCanceladaBarbero, correoCanceladaCliente, correoCliente, correoRecordatorio, correoReprogramadaBarbero,
  correoReprogramadaCliente,
} from './mensajes';

const negocio: Negocio = {
  nombre: 'El Acicale',
  direccion: 'Cl. 68 Nte. #4a - 52, Calima, Cali',
  mapaUrl: 'https://www.google.com/maps?cid=1',
  instagram: 'el_acicale__',
  urlSitio: 'https://elacicale.com',
};

const cita = (extra: Partial<Cita> = {}): Cita => ({
  userName: 'Mateo Rincón', userEmail: 'mateo@correo.com', phone: '300 123 4567',
  serviceName: 'Acicale sencillo', precio: 30000, duracionMinutos: 40,
  barberoId: 'Trip', barberoNombre: 'Juan Sebastián "Trip"',
  dia: '2026-10-06', hora: '14:30', horaStr: '2:30 PM', estado: 'pendiente', ...extra,
});

test('la hora de la cita es la de Colombia (UTC-5), sin importar el navegador', () => {
  assert.equal(inicioDeCita(cita())!.toISOString(), '2026-10-06T19:30:00.000Z');
  // Citas antiguas sin dia/hora usan el ISO guardado
  assert.equal(inicioDeCita({ fecha: '2026-10-06T19:30:00.000Z' })!.toISOString(), '2026-10-06T19:30:00.000Z');
  assert.equal(inicioDeCita({}), null);
});

test('fecha larga en español', () => {
  assert.equal(fechaLarga(inicioDeCita(cita())!), 'Martes 6 de octubre');
});

test('solo avisa de citas activas que aún no pasan', () => {
  const antes = new Date('2026-10-05T12:00:00Z');
  assert.equal(debeAvisar(cita(), antes), true);
  assert.equal(debeAvisar(cita({ estado: 'confirmada' }), antes), true);
  assert.equal(debeAvisar(cita({ estado: 'completada' }), antes), false);
  assert.equal(debeAvisar(cita(), new Date('2026-10-07T00:00:00Z')), false);
});

test('valida correos', () => {
  assert.equal(emailValido('a@b.co'), true);
  assert.equal(emailValido(''), false);
  assert.equal(emailValido('sin-arroba'), false);
  assert.equal(emailValido(undefined), false);
});

test('escapa lo que escribe el cliente', () => {
  assert.equal(escaparHtml('<b>"Hola" & \'chao\'</b>'), '&lt;b&gt;&quot;Hola&quot; &amp; &#39;chao&#39;&lt;/b&gt;');
  const correo = correoBarbero(cita({ userName: '<script>alert(1)</script>' }), 'c1', negocio, 'trip@correo.com');
  assert.ok(!correo.html.includes('<script>'));
});

test('correo del cliente: datos, botones y .ics', () => {
  const correo = correoCliente(cita(), 'c1', negocio);
  assert.equal(correo.para, 'mateo@correo.com');
  assert.equal(correo.asunto, 'Tu cita en El Acicale: Martes 6 de octubre, 2:30 PM');
  assert.ok(correo.html.includes('¡Listo, Mateo!'));
  assert.ok(correo.html.includes('$30.000'));
  assert.ok(correo.html.includes('https://elacicale.com/mis-citas'));
  assert.ok(correo.html.includes('calendar.google.com'));
  assert.equal(correo.clave, 'cita-c1-cliente');
  const ics = Buffer.from(correo.adjuntos![0].content, 'base64').toString();
  assert.ok(ics.includes('DTSTART:20261006T193000Z'));
  assert.ok(ics.includes('DTEND:20261006T201000Z'));
  assert.ok(ics.includes('LOCATION:Cl. 68 Nte. #4a - 52\\, Calima\\, Cali'));
});

test('correo del barbero: contacto del cliente y responder al cliente', () => {
  const correo = correoBarbero(cita(), 'c1', negocio, 'trip@correo.com');
  assert.equal(correo.para, 'trip@correo.com');
  assert.equal(correo.responderA, 'mateo@correo.com');
  assert.ok(correo.html.includes('https://wa.me/573001234567'));
  assert.ok(correo.html.includes('https://elacicale.com/barbero'));
  assert.ok(correo.asunto.startsWith('Nueva cita: Mateo Rincón'));
  // Sin correo del cliente no ofrece responderle
  assert.equal(correoBarbero(cita({ userEmail: '' }), 'c1', negocio, 'trip@correo.com').responderA, undefined);
});

test('el .ics usa saltos CRLF', () => {
  assert.ok(archivoIcs(cita(), 'c1', negocio).includes('BEGIN:VEVENT\r\nUID:c1@reservas'));
});

test('detecta cancelaciones y cambios de horario de citas por venir', () => {
  const antes = new Date('2026-10-05T12:00:00Z');
  assert.equal(tipoDeCambio(cita(), cita({ estado: 'cancelada' }), antes), 'cancelada');
  assert.equal(tipoDeCambio(cita(), cita({ hora: '16:00', horaStr: '4:00 PM' }), antes), 'reprogramada');
  assert.equal(tipoDeCambio(cita(), cita({ dia: '2026-10-07' }), antes), 'reprogramada');
  // Completar, confirmar o editar el nombre no avisa
  assert.equal(tipoDeCambio(cita(), cita({ estado: 'confirmada' }), antes), null);
  assert.equal(tipoDeCambio(cita(), cita({ userName: 'Otro' }), antes), null);
  assert.equal(tipoDeCambio(cita({ estado: 'completada' }), cita({ estado: 'cancelada' }), antes), null);
  // Cancelar una cita que ya pasó no avisa
  assert.equal(tipoDeCambio(cita(), cita({ estado: 'cancelada' }), new Date('2026-10-07T00:00:00Z')), null);
});

test('mañana en Colombia aunque en UTC ya sea otro día', () => {
  // 8:30 p. m. en Bogotá = 01:30 UTC del día siguiente
  assert.equal(mananaEnColombia(new Date('2026-10-06T01:30:00Z')), '2026-10-06');
  assert.equal(mananaEnColombia(new Date('2026-10-05T23:00:00Z')), '2026-10-06');
});

test('el recordatorio no se manda si la reserva es reciente o no hay correo', () => {
  const seisPm = new Date('2026-10-05T23:00:00Z');
  assert.equal(necesitaRecordatorio(cita({ creadoEn: '2026-10-01T15:00:00Z' }), seisPm), true);
  assert.equal(necesitaRecordatorio(cita({ creadoEn: '2026-10-05T20:00:00Z' }), seisPm), false);
  assert.equal(necesitaRecordatorio(cita({ creadoEn: '2026-10-01T15:00:00Z', userEmail: '' }), seisPm), false);
  assert.equal(necesitaRecordatorio(cita({ creadoEn: '2026-10-01T15:00:00Z', estado: 'cancelada' }), seisPm), false);
});

test('correos de cancelación, cambio y recordatorio', () => {
  const cancelada = correoCanceladaCliente(cita(), 'c1', negocio);
  assert.equal(cancelada.asunto, 'Cita cancelada: Martes 6 de octubre, 2:30 PM');
  assert.ok(cancelada.html.includes('https://elacicale.com/reservar'));
  assert.equal(correoCanceladaBarbero(cita(), 'c1', negocio, 't@x.co').asunto, 'Cancelada: Mateo Rincón · Martes 6 de octubre, 2:30 PM');

  const movida = cita({ dia: '2026-10-07', hora: '10:00', horaStr: '10:00 AM' });
  const cambio = correoReprogramadaCliente(cita(), movida, 'c1', negocio);
  assert.equal(cambio.asunto, 'Tu cita cambió de horario: Miércoles 7 de octubre, 10:00 AM');
  assert.ok(cambio.html.includes('Antes era el Martes 6 de octubre, 2:30 PM'));
  assert.ok(Buffer.from(cambio.adjuntos![0].content, 'base64').toString().includes('DTSTART:20261007T150000Z'));
  assert.notEqual(cambio.clave, correoReprogramadaCliente(cita(), cita({ hora: '11:00' }), 'c1', negocio).clave);
  assert.equal(correoReprogramadaBarbero(cita(), movida, 'c1', negocio, 't@x.co').responderA, 'mateo@correo.com');

  const recordatorio = correoRecordatorio(cita(), 'c1', negocio);
  assert.equal(recordatorio.asunto, 'Recordatorio: mañana a las 2:30 PM en El Acicale');
  assert.ok(recordatorio.html.includes('Mateo, tu cita es mañana'));
});

test('el texto plano no muestra entidades HTML', () => {
  const correo = correoBarbero(cita({ userName: 'Ana & "Leo"' }), 'c1', negocio, 't@x.co');
  assert.ok(correo.texto.includes('Cliente: Ana & "Leo"'));
});
