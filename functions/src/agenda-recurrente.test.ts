// Agendas recurrentes contra el emulador de Firestore: transacciones, choques, regenerar, pausar y borrar.
// Sin el emulador se saltan. Se corren con `npm run test:recurrentes` (desde la raíz del repositorio).
import { after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { agendarDia, programarSerie, quitarTurnosPorVenir } from './agenda-recurrente';
import { Recurrencia } from './recurrencias';

const EMULADOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROYECTO = 'demo-recurrentes';

// Miércoles 14 de octubre de 2026, 10:00 a. m. en Colombia. El horizonte llega al 15 de diciembre.
const AHORA = new Date('2026-10-14T15:00:00Z');
// Sábados a las 5:20 p. m. desde el 17 de octubre: 9 turnos hasta el 15 de diciembre.
const SABADOS = ['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28', '2026-12-05', '2026-12-12'];

describe('agendas recurrentes en Firestore', { skip: !EMULADOR && 'sin el emulador de Firestore (npm run test:recurrentes)' }, () => {
  const db = getFirestore(initializeApp({ projectId: PROYECTO }, 'pruebas-recurrentes'));
  let version = 0;

  const serie = (extra: Partial<Recurrencia> = {}): Recurrencia => ({
    clienteNombre: 'Juan Camilo', clienteTelefono: '3001234567',
    servicioId: 'S1', serviceName: 'Acicale sencillo', precio: 30000, duracionMinutos: 40,
    barberoId: 'B1', barberoNombre: 'Luis', frecuencia: 'semanal', hora: '17:20', desde: '2026-10-17', activa: true,
    creadoEn: AHORA.toISOString(), actualizadoEn: `v${++version}`, ...extra,
  });
  const guardar = async (id: string, datos: Recurrencia) => { await db.doc(`recurrencias/${id}`).set(datos); return datos; };
  const editar = (id: string, cambios: Partial<Recurrencia>) => db.doc(`recurrencias/${id}`).update({ ...cambios, actualizadoEn: `v${++version}` });
  const citasDe = async (id: string) => (await db.collection('citas').where('recurrenciaId', '==', id).get()).docs;
  const slotsDe = async (citaId: string) => (await db.collection('slots').where('citaId', '==', citaId).get()).docs;
  const leer = async (id: string) => (await db.doc(`recurrencias/${id}`).get()).data() as Recurrencia;

  beforeEach(async () => {
    await fetch(`http://${EMULADOR}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
    await db.doc('barberos/B1').set({ nombre: 'Luis Pérez', especialidad: '', avatar: '', diasLibres: [1], descanso: { desde: 780, hasta: 840 } });
    await db.doc('ajustes/sitio').set({ horario: { apertura: 560, cierre: 1180, diasCerrados: [0], cierres: [] } });
  });
  // Sin cerrar la conexión, el proceso de pruebas no termina.
  after(() => db.terminate());

  test('aparta un turno por cada sábado hasta el horizonte, con sus bloques y la serie anotada', async () => {
    const datos = await guardar('R1', serie());
    const r = await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true });
    assert.equal(r.creadas, 9);
    assert.deepEqual(r.omitidas, []);
    const citas = await citasDe('R1');
    assert.deepEqual(citas.map(c => c.get('dia')).sort(), SABADOS);
    const primera = (await db.doc('citas/R1_20261017').get()).data()!;
    assert.equal(primera['userId'], '');
    assert.equal(primera['estado'], 'pendiente');
    assert.equal(primera['horaStr'], '5:20 PM');
    assert.equal(primera['frecuencia'], 'semanal');
    assert.deepEqual((await slotsDe('R1_20261017')).map(s => s.id).sort(), ['B1_2026-10-17_1720', 'B1_2026-10-17_1740']);
    const anotada = await leer('R1');
    assert.equal(anotada.procesadaEn, datos.actualizadoEn);
    assert.equal(anotada.generadaHasta, '2026-12-15');
    assert.deepEqual(anotada.omitidas, []);
  });

  test('repetirla no duplica nada; regenerarla quita y vuelve a crear', async () => {
    await guardar('R1', serie());
    await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true });
    assert.equal((await programarSerie(db, 'R1', { ahora: AHORA })).creadas, 0);
    const otra = await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true });
    assert.equal(otra.quitadas, 9);
    assert.equal(otra.creadas, 9);
    assert.equal((await citasDe('R1')).length, 9);
  });

  test('salta lo ocupado, lo cerrado y los festivos, y dice por qué', async () => {
    await db.doc('slots/B1_2026-10-24_1740').set({ barberoId: 'B1', dia: '2026-10-24', hora: '17:40', citaId: 'OTRA' });
    await db.doc('slots/B1_2026-10-31_1720').set({ barberoId: 'B1', dia: '2026-10-31', hora: '17:20', bloqueo: true, motivo: 'Permiso' });
    await db.doc('slots/B1_2026-11-14_1730').set({ barberoId: 'B1', dia: '2026-11-14', hora: '17:30', citaId: 'VIEJA' }); // bloque viejo de media hora
    await db.doc('ajustes/sitio').set({ horario: { diasCerrados: [0], cierres: ['2026-11-07'] } });
    await guardar('R1', serie());
    const r = await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true });
    assert.equal(r.creadas, 5);
    assert.deepEqual(r.omitidas, [
      { dia: '2026-10-24', motivo: 'Ya hay otra cita a esa hora' },
      { dia: '2026-10-31', motivo: 'Luis cerró ese rato' },
      { dia: '2026-11-07', motivo: 'La barbería cierra ese día' },
      { dia: '2026-11-14', motivo: 'Ya hay otra cita a esa hora' },
    ]);
    assert.deepEqual((await leer('R1')).omitidas, r.omitidas);
    // Los bloques ajenos siguen intactos.
    assert.equal((await db.doc('slots/B1_2026-10-24_1740').get()).get('citaId'), 'OTRA');
    assert.equal((await db.doc('slots/B1_2026-10-24_1720').get()).exists, false);
  });

  test('no agenda en el descanso ni en el día libre del barbero', async () => {
    await guardar('R1', serie({ hora: '12:40' }));
    const r = await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true });
    assert.equal(r.creadas, 0);
    assert.ok(r.omitidas.length === 9 && r.omitidas.every(o => o.motivo === 'Se cruza con el descanso de Luis'));
    // Lunes 19 de octubre: el día libre de Luis.
    await guardar('R2', serie({ desde: '2026-10-19', frecuencia: 'mensual' }));
    const lunes = await programarSerie(db, 'R2', { ahora: AHORA, regenerar: true });
    assert.equal(lunes.creadas, 0);
    assert.deepEqual(lunes.omitidas.map(o => o.motivo), ['Es el día libre de Luis', 'Es el día libre de Luis', 'Es el día libre de Luis']);
  });

  test('al cambiar la hora quita los turnos por venir y conserva los ya atendidos', async () => {
    await guardar('R1', serie());
    await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true });
    await db.doc('citas/R1_20261017').update({ estado: 'completada', precioFinal: 35000 });
    await editar('R1', { hora: '18:00' });
    const r = await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true });
    assert.equal(r.quitadas, 8);
    assert.equal(r.creadas, 8); // el 17 ya existe (atendido): no se vuelve a crear
    const citas = await citasDe('R1');
    assert.equal(citas.length, 9);
    assert.equal(citas.find(c => c.id === 'R1_20261017')!.get('hora'), '17:20');
    assert.ok(citas.filter(c => c.id !== 'R1_20261017').every(c => c.get('hora') === '18:00' && c.get('estado') === 'pendiente'));
    assert.equal((await db.doc('slots/B1_2026-10-24_1720').get()).exists, false);
    assert.equal((await db.doc('slots/B1_2026-10-24_1800').get()).get('citaId'), 'R1_20261024');
  });

  test('en pausa quita los turnos por venir; al reanudar los vuelve a apartar', async () => {
    await guardar('R1', serie());
    await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true });
    await editar('R1', { activa: false });
    const pausa = await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true });
    assert.equal(pausa.quitadas, 9);
    assert.equal((await citasDe('R1')).length, 0);
    assert.equal((await db.collection('slots').get()).size, 0);
    assert.equal((await leer('R1')).generadaHasta, '');
    await editar('R1', { activa: true });
    assert.equal((await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true })).creadas, 9);
  });

  test('al borrar la serie se van sus turnos por venir, no su historia', async () => {
    await guardar('R1', serie({ desde: '2026-10-03' }));
    // El 3 y el 10 ya pasaron: se crean a mano, como si se hubieran agendado antes.
    for (const [dia, estado] of [['2026-10-03', 'completada'], ['2026-10-10', 'no-asistio']]) {
      await db.doc(`citas/R1_${dia.replace(/-/g, '')}`).set({ recurrenciaId: 'R1', dia, hora: '17:20', estado, slotIds: [] });
    }
    await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true });
    assert.equal((await citasDe('R1')).length, 11);
    await db.doc('recurrencias/R1').delete();
    const r = await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true });
    assert.equal(r.quitadas, 9);
    assert.deepEqual((await citasDe('R1')).map(c => c.get('estado')).sort(), ['completada', 'no-asistio']);
  });

  test('no agenda horas que ya pasaron', async () => {
    // Hoy miércoles 14, a las 9:00 (ya pasó) y a las 11:00 (aún no).
    await guardar('R1', serie({ desde: '2026-10-14', hora: '09:00' }));
    await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true });
    assert.equal((await db.doc('citas/R1_20261014').get()).exists, false);
    assert.equal((await db.doc('citas/R1_20261021').get()).exists, true);
    await guardar('R2', serie({ desde: '2026-10-14', hora: '11:00' }));
    await programarSerie(db, 'R2', { ahora: AHORA, regenerar: true });
    assert.equal((await db.doc('citas/R2_20261014').get()).exists, true);
  });

  test('cada noche solo agrega el día que entra al horizonte y conserva los avisos por venir', async () => {
    await db.doc('slots/B1_2026-10-24_1720').set({ barberoId: 'B1', dia: '2026-10-24', hora: '17:20', citaId: 'OTRA' });
    await guardar('R1', serie());
    await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true });
    // Una semana después: el horizonte llega al 22 de diciembre y entra el sábado 19.
    const r = await programarSerie(db, 'R1', { ahora: new Date('2026-10-21T15:00:00Z') });
    assert.equal(r.quitadas, 0);
    assert.equal(r.creadas, 1);
    assert.equal((await db.doc('citas/R1_20261219').get()).exists, true);
    const anotada = await leer('R1');
    assert.equal(anotada.generadaHasta, '2026-12-22');
    assert.deepEqual(anotada.omitidas, [{ dia: '2026-10-24', motivo: 'Ya hay otra cita a esa hora' }]);
  });

  test('si la serie cambió mientras tanto, no agenda con los datos viejos', async () => {
    const datos = await guardar('R1', serie());
    await editar('R1', { hora: '18:00' });
    const ref = db.doc('recurrencias/R1');
    assert.equal(await agendarDia(db, ref, datos.actualizadoEn, 'R1', datos, '2026-10-17', { nombre: 'Luis' }, AHORA), 'cambio');
    assert.equal((await citasDe('R1')).length, 0);
  });

  test('al quitar un turno cancelado no suelta un bloque que ya es de otra cita', async () => {
    await guardar('R1', serie());
    await programarSerie(db, 'R1', { ahora: AHORA, regenerar: true });
    // El turno del 24 se canceló, se soltaron sus bloques y otro cliente tomó las 5:20.
    await db.doc('citas/R1_20261024').update({ estado: 'cancelada' });
    await db.doc('slots/B1_2026-10-24_1720').set({ barberoId: 'B1', dia: '2026-10-24', hora: '17:20', citaId: 'OTRA' });
    await db.doc('slots/B1_2026-10-24_1740').delete();
    assert.equal(await quitarTurnosPorVenir(db, 'R1', AHORA), 9);
    assert.equal((await db.doc('slots/B1_2026-10-24_1720').get()).get('citaId'), 'OTRA');
    assert.equal((await db.collection('slots').get()).size, 1);
  });
});
