// Pruebas de seguridad de firestore.rules. Cada caso intenta algo que la app hace (debe funcionar)
// o un ataque desde la consola del navegador (debe fallar).
//
// Uso: npm run test:reglas   (levanta el emulador de Firestore, no toca el proyecto real)
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, writeBatch } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-reglas',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});

// Debe coincidir con esEmailAdmin() en firestore.rules.
const ADMIN_EMAIL = 'ortizgonzalesbryanalexander1@gmail.com';
const CUENTAS = {
  admin: ADMIN_EMAIL, luis: 'luis@x.com', pedro: 'pedro@x.com', suelto: 'suelto@x.com',
  ana: 'ana@x.com', beto: 'beto@x.com', nuevo: 'nuevo@x.com', malo: 'malo@x.com',
};
const db = (uid, extra = {}) => env.authenticatedContext(uid, { email: CUENTAS[uid] ?? `${uid}@x.com`, email_verified: true, ...extra }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

let ok = 0, fallos = 0;
async function caso(nombre, fn) {
  try { await fn(); ok++; console.log('  ✔', nombre); }
  catch (e) { fallos++; console.log('  ✘', nombre, '\n     ', e.message.split('\n')[0]); }
}
const seccion = t => console.log(`\n${t}`);

// ---------------------------------------------------------------------------
// Estado inicial (sin reglas)
// ---------------------------------------------------------------------------
const SERVICIOS = {
  S1: { nombre: 'Corte', precio: 57000, duracionMinutos: 60 },
  S2: { nombre: 'Color', precio: 300000, duracionMinutos: 300 },
  S3: { nombre: 'Barba', precio: 20000 }, // sin duración: la app usa 30 min
  S4: { nombre: 'Rápido', precio: 30000, duracionMinutos: 40 },
};
await env.withSecurityRulesDisabled(async ctx => {
  const f = ctx.firestore();
  const usuario = (uid, rol) => setDoc(doc(f, `usuarios/${uid}`), { uid, nombre: uid, email: CUENTAS[uid], rol });
  await usuario('admin', 'admin');
  await usuario('luis', 'barbero');
  await usuario('pedro', 'barbero');
  await usuario('suelto', 'barbero'); // rol barbero pero sin perfil en /barberos
  await usuario('ana', 'cliente');
  await usuario('beto', 'cliente');
  await setDoc(doc(f, 'barberos/B1'), { nombre: 'Luis', emailAsociado: 'luis@x.com', especialidad: '', avatar: '' });
  await setDoc(doc(f, 'barberos/B2'), { nombre: 'Pedro', emailAsociado: 'pedro@x.com', especialidad: '', avatar: '' });
  for (const [id, s] of Object.entries(SERVICIOS)) await setDoc(doc(f, `servicios/${id}`), { ...s, categoria: 'x', descripcion: '', destacado: true });
  await setDoc(doc(f, 'productos/P1'), { nombre: 'Cera', precio: 1 });
});

const DIA = '2026-10-02';
const DIA2 = '2026-10-03';
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`;

/** Lo mismo que hace CitasService.reservar: la cita y sus bloques en un batch. */
function reservar(f, citaId, uid, { inicio = 600, servicio = 'S1', barbero = 'B1', dia = DIA, extra = {}, slotIds, crearBloques } = {}) {
  const s = SERVICIOS[servicio] ?? { nombre: 'X', precio: 1, duracionMinutos: 30 };
  const duracion = s.duracionMinutos > 0 ? s.duracionMinutos : 30;
  const ids = slotIds ?? Array.from({ length: Math.ceil(duracion / 30) }, (_, i) => `${barbero}_${dia}_${hhmm(inicio + i * 30)}`);
  const b = writeBatch(f);
  b.set(doc(f, `citas/${citaId}`), {
    userId: uid, userName: 'Cliente', userEmail: CUENTAS[uid] ?? '', phone: '3001234567',
    servicioId: servicio, serviceName: s.nombre, precio: s.precio, duracionMinutos: duracion,
    barberoId: barbero, barberoNombre: 'Luis', dia, hora: `${hhmm(inicio).slice(0, 2)}:${hhmm(inicio).slice(2)}`, horaStr: '10:00 AM',
    fecha: `${dia}T15:00:00.000Z`, estado: 'pendiente', creadoEn: new Date().toISOString(), slotIds: ids, ...extra,
  });
  for (const id of (crearBloques ?? ids)) b.set(doc(f, `slots/${id}`), { barberoId: barbero, dia, hora: id.slice(-4), citaId });
  return b.commit();
}
let n = 0;
const nueva = () => `X${++n}`;
let h = 600;
const hora = () => (h += 120); // horarios distintos para que no choquen entre casos

// ---------------------------------------------------------------------------
seccion('usuarios');
await caso('nuevo usuario se crea como cliente (lo que hace el login)', () =>
  assertSucceeds(setDoc(doc(db('nuevo'), 'usuarios/nuevo'), { uid: 'nuevo', nombre: 'N', email: 'nuevo@x.com', rol: 'cliente', politicaAceptadaEn: 'x' }, { merge: true })));
await caso('ATAQUE: crearse como admin', () =>
  assertFails(setDoc(doc(db('malo'), 'usuarios/malo'), { uid: 'malo', nombre: 'M', email: 'malo@x.com', rol: 'admin' })));
await caso('ATAQUE: crearse como barbero', () =>
  assertFails(setDoc(doc(db('malo'), 'usuarios/malo'), { uid: 'malo', nombre: 'M', email: 'malo@x.com', rol: 'barbero' })));
await caso('ATAQUE: crear el perfil con el correo de otra persona', () =>
  assertFails(setDoc(doc(db('malo'), 'usuarios/malo'), { uid: 'malo', nombre: 'M', email: 'luis@x.com', rol: 'cliente' })));
await caso('ATAQUE: crear el perfil con campos inventados', () =>
  assertFails(setDoc(doc(db('malo'), 'usuarios/malo'), { uid: 'malo', nombre: 'M', email: 'malo@x.com', rol: 'cliente', esAdmin: true })));
await caso('ATAQUE: crear el perfil de otro uid', () =>
  assertFails(setDoc(doc(db('malo'), 'usuarios/otro'), { uid: 'otro', nombre: 'M', email: 'malo@x.com', rol: 'cliente' })));
await caso('la cuenta admin configurada se crea como admin', () =>
  assertSucceeds(setDoc(doc(db('adm2', { email: ADMIN_EMAIL }), 'usuarios/adm2'), { uid: 'adm2', nombre: 'A', email: ADMIN_EMAIL, rol: 'admin' })));
await caso('ATAQUE: el correo admin sin verificar NO se crea como admin', () =>
  assertFails(setDoc(doc(db('adm3', { email: ADMIN_EMAIL, email_verified: false }), 'usuarios/adm3'), { uid: 'adm3', nombre: 'A', email: ADMIN_EMAIL, rol: 'admin' })));
await caso('ATAQUE: cliente se cambia el rol a admin', () => assertFails(updateDoc(doc(db('ana'), 'usuarios/ana'), { rol: 'admin' })));
await caso('ATAQUE: cliente se cambia el rol con setDoc merge', () => assertFails(setDoc(doc(db('ana'), 'usuarios/ana'), { rol: 'admin' }, { merge: true })));
await caso('ATAQUE: cliente se pone el correo de un barbero', () => assertFails(updateDoc(doc(db('ana'), 'usuarios/ana'), { email: 'luis@x.com' })));
await caso('cliente actualiza su nombre (login con merge)', () =>
  assertSucceeds(setDoc(doc(db('ana'), 'usuarios/ana'), { uid: 'ana', nombre: 'Ana María', email: 'ana@x.com' }, { merge: true })));
await caso('cliente guarda su celular', () => assertSucceeds(updateDoc(doc(db('ana'), 'usuarios/ana'), { telefono: '3001112233' })));
await caso('ATAQUE: cliente lee el perfil de otro', () => assertFails(getDoc(doc(db('ana'), 'usuarios/beto'))));
await caso('ATAQUE: cliente lista todos los usuarios', () => assertFails(getDocs(collection(db('ana'), 'usuarios'))));
await caso('ATAQUE: barbero lista todos los usuarios', () => assertFails(getDocs(collection(db('luis'), 'usuarios'))));
await caso('ATAQUE: visitante lee usuarios', () => assertFails(getDocs(collection(anon(), 'usuarios'))));
await caso('ATAQUE: cliente borra su perfil (y con él su rastro)', () => assertFails(deleteDoc(doc(db('ana'), 'usuarios/ana'))));
await caso('admin lista usuarios y cambia roles', async () => {
  await assertSucceeds(getDocs(collection(db('admin'), 'usuarios')));
  await assertSucceeds(updateDoc(doc(db('admin'), 'usuarios/beto'), { rol: 'cliente' }));
});

// ---------------------------------------------------------------------------
seccion('catálogo, staff y ajustes');
await caso('visitante lee servicios, barberos y ajustes', async () => {
  await assertSucceeds(getDocs(collection(anon(), 'servicios')));
  await assertSucceeds(getDocs(collection(anon(), 'barberos')));
  await assertSucceeds(getDoc(doc(anon(), 'ajustes/sitio')));
});
await caso('ATAQUE: cliente baja el precio de un servicio', () => assertFails(updateDoc(doc(db('ana'), 'servicios/S1'), { precio: 1 })));
await caso('ATAQUE: barbero edita servicios', () => assertFails(updateDoc(doc(db('luis'), 'servicios/S1'), { precio: 1 })));
await caso('ATAQUE: barbero cambia el correo de su perfil de barbero', () => assertFails(updateDoc(doc(db('luis'), 'barberos/B1'), { emailAsociado: 'otro@x.com' })));
await caso('ATAQUE: cliente se enlaza a un perfil de barbero', () => assertFails(updateDoc(doc(db('ana'), 'barberos/B1'), { emailAsociado: 'ana@x.com' })));
await caso('ATAQUE: cliente cambia el enlace de cursos (phishing)', () => assertFails(setDoc(doc(db('ana'), 'ajustes/sitio'), { cursos: { url: 'https://malo.co' } })));
await caso('admin edita servicios, barberos y ajustes', async () => {
  await assertSucceeds(updateDoc(doc(db('admin'), 'servicios/S1'), { descripcion: 'ok' }));
  await assertSucceeds(updateDoc(doc(db('admin'), 'barberos/B2'), { especialidad: 'Color' }));
  await assertSucceeds(setDoc(doc(db('admin'), 'ajustes/sitio'), { cursos: { activo: true, url: 'https://x.co' } }));
});

// ---------------------------------------------------------------------------
seccion('reservas (crear)');
await caso('cliente reserva un servicio de 60 min (cita + 2 bloques)', () => assertSucceeds(reservar(db('ana'), 'C1', 'ana')));
await caso('ATAQUE: doble reserva del mismo horario', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: 630 })));
await caso('servicio de 40 min ocupa 2 bloques', () => assertSucceeds(reservar(db('beto'), nueva(), 'beto', { servicio: 'S4', inicio: hora() })));
await caso('servicio largo (5 h = 10 bloques) dentro del límite de lecturas', () => assertSucceeds(reservar(db('beto'), nueva(), 'beto', { servicio: 'S2', barbero: 'B2', inicio: 600 })));
await caso('servicio sin duración (30 min, 1 bloque)', () => assertSucceeds(reservar(db('beto'), nueva(), 'beto', { servicio: 'S3', inicio: hora() })));
await caso('correo con mayúsculas del mismo dueño', () => assertSucceeds(reservar(db('beto'), nueva(), 'beto', { inicio: hora(), extra: { userEmail: 'Beto@X.com' } })));
await caso('reserva sin correo (no se envía confirmación)', () => assertSucceeds(reservar(db('beto'), nueva(), 'beto', { inicio: hora(), extra: { userEmail: '' } })));
await caso('ATAQUE: confirmación a un correo ajeno (spam)', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: hora(), extra: { userEmail: 'victima@gmail.com' } })));
await caso('ATAQUE: reservar a nombre de otro usuario', () => assertFails(reservar(db('beto'), nueva(), 'ana', { inicio: hora() })));
await caso('ATAQUE: precio manipulado ($1.000)', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: hora(), extra: { precio: 1000 } })));
await caso('ATAQUE: nombre de servicio falso (texto que llega al barbero)', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: hora(), extra: { serviceName: 'Gana un premio en malo.co' } })));
await caso('ATAQUE: duración menor para ocupar menos bloques', () =>
  assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: hora(), extra: { duracionMinutos: 30 }, slotIds: [`B1_${DIA}_${hhmm(h)}`] })));
await caso('ATAQUE: declarar 2 bloques pero crear solo el primero', () => {
  const i = hora();
  return assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: i, crearBloques: [`B1_${DIA}_${hhmm(i)}`] }));
});
await caso('ATAQUE: servicio que no existe', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: hora(), servicio: 'NOEXISTE' })));
await caso('ATAQUE: barbero que no existe', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: hora(), barbero: 'FANTASMA' })));
await caso('ATAQUE: crear la cita ya completada', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: hora(), extra: { estado: 'completada' } })));
await caso('ATAQUE: crear la cita con valor cobrado (precioFinal)', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: hora(), extra: { precioFinal: 0 } })));
await caso('ATAQUE: crear la cita con campos inventados', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: hora(), extra: { esVip: true } })));
await caso('ATAQUE: el primer bloque no corresponde a la hora de la cita', () => {
  const i = hora();
  return assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: i, extra: { hora: '06:00' } }));
});
await caso('ATAQUE: día con formato inválido', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: hora(), dia: '2/10/2026' })));
await caso('ATAQUE: cita sin bloques', () =>
  assertFails(setDoc(doc(db('beto'), 'citas/sinbloque'), { userId: 'beto', estado: 'pendiente', slotIds: [`B1_${DIA}_1500`] })));
await caso('ATAQUE: bloque suelto apuntando a la cita de otro', () =>
  assertFails(setDoc(doc(db('beto'), `slots/B1_${DIA}_1900`), { barberoId: 'B1', dia: DIA, hora: '1900', citaId: 'C1' })));
await caso('ATAQUE: sobrescribir un bloque ocupado', () =>
  assertFails(setDoc(doc(db('beto'), `slots/B1_${DIA}_1000`), { barberoId: 'B1', dia: DIA, hora: '1000', citaId: 'X1' })));
await caso('ATAQUE: visitante sin sesión reserva', () => assertFails(reservar(anon(), nueva(), 'beto', { inicio: hora() })));

// ---------------------------------------------------------------------------
seccion('reservas (leer y cambiar)');
await caso('cliente lee disponibilidad y sus citas', async () => {
  await assertSucceeds(getDocs(query(collection(db('beto'), 'slots'), where('dia', '==', DIA))));
  await assertSucceeds(getDocs(query(collection(db('ana'), 'citas'), where('userId', '==', 'ana'))));
});
await caso('ATAQUE: visitante lee la disponibilidad', () => assertFails(getDocs(collection(anon(), 'slots'))));
await caso('ATAQUE: cliente lista todas las citas (datos personales)', () => assertFails(getDocs(collection(db('beto'), 'citas'))));
await caso('ATAQUE: cliente lee la cita de otro', () => assertFails(getDoc(doc(db('beto'), 'citas/C1'))));
await caso('ATAQUE: cliente consulta citas de otro con filtro', () => assertFails(getDocs(query(collection(db('beto'), 'citas'), where('userId', '==', 'ana')))));
await caso('ATAQUE: cliente cambia el precio de su cita', () => assertFails(updateDoc(doc(db('ana'), 'citas/C1'), { precio: 1 })));
await caso('ATAQUE: cliente marca su cita como completada', () => assertFails(updateDoc(doc(db('ana'), 'citas/C1'), { estado: 'completada' })));
await caso('ATAQUE: cliente mueve su cita a otra hora sin bloques', () => assertFails(updateDoc(doc(db('ana'), 'citas/C1'), { hora: '18:00' })));
await caso('ATAQUE: cliente borra su cita', () => assertFails(deleteDoc(doc(db('ana'), 'citas/C1'))));
await caso('ATAQUE: cliente libera bloques de una cita activa', () => assertFails(deleteDoc(doc(db('ana'), `slots/B1_${DIA}_1000`))));
await caso('ATAQUE: otro cliente cancela una cita ajena', () => assertFails(updateDoc(doc(db('beto'), 'citas/C1'), { estado: 'cancelada' })));
await caso('cliente cancela su cita y libera los bloques', () => {
  const f = db('ana'); const b = writeBatch(f);
  b.update(doc(f, 'citas/C1'), { estado: 'cancelada' });
  b.delete(doc(f, `slots/B1_${DIA}_1000`));
  b.delete(doc(f, `slots/B1_${DIA}_1030`));
  return assertSucceeds(b.commit());
});
await caso('ATAQUE: cliente reactiva una cita cancelada', () => assertFails(updateDoc(doc(db('ana'), 'citas/C1'), { estado: 'pendiente' })));
await caso('tras cancelar, otro cliente reserva ese horario', () => assertSucceeds(reservar(db('beto'), 'C6', 'beto')));

// ---------------------------------------------------------------------------
seccion('barberos');
await caso('barbero lee la agenda (todas las citas)', () => assertSucceeds(getDocs(collection(db('luis'), 'citas'))));
await caso('barbero marca hecha su cita con el valor cobrado', () => assertSucceeds(updateDoc(doc(db('luis'), 'citas/C6'), { estado: 'completada', precioFinal: 65000 })));
await caso('ATAQUE: barbero cambia otros campos (precio)', () => assertFails(updateDoc(doc(db('luis'), 'citas/C6'), { precio: 0 })));
await caso('ATAQUE: valor cobrado negativo', () => assertFails(updateDoc(doc(db('luis'), 'citas/C6'), { estado: 'completada', precioFinal: -1 })));
await caso('ATAQUE: valor cobrado que no es número', () => assertFails(updateDoc(doc(db('luis'), 'citas/C6'), { estado: 'completada', precioFinal: 'gratis' })));
await caso('ATAQUE: barbero gestiona la cita de OTRO barbero', () => assertFails(updateDoc(doc(db('pedro'), 'citas/C6'), { estado: 'no-asistio' })));
await caso('ATAQUE: barbero sin perfil enlazado gestiona citas', () => assertFails(updateDoc(doc(db('suelto'), 'citas/C6'), { estado: 'cancelada' })));
await caso('ATAQUE: cliente pone el valor cobrado de su cita', () => assertFails(updateDoc(doc(db('beto'), 'citas/C6'), { precioFinal: 1 })));
await caso('barbero cancela su cita y libera los bloques', async () => {
  await reservar(db('beto'), 'C8', 'beto', { inicio: 900, dia: DIA2 });
  const f = db('luis'); const b = writeBatch(f);
  b.update(doc(f, 'citas/C8'), { estado: 'cancelada' });
  b.delete(doc(f, `slots/B1_${DIA2}_1500`));
  b.delete(doc(f, `slots/B1_${DIA2}_1530`));
  return assertSucceeds(b.commit());
});

// ---------------------------------------------------------------------------
seccion('admin');
await caso('admin registra una cita de un cliente sin cuenta (walk-in)', () =>
  assertSucceeds(setDoc(doc(db('admin'), 'citas/W1'), { userId: 'admin', userName: 'Walk-in', userEmail: '', estado: 'completada', precio: 30000, barberoId: 'B1', dia: '2026-09-30' })));
await caso('admin reprograma (mueve bloques en un batch)', async () => {
  await reservar(db('beto'), 'C7', 'beto', { inicio: 1080, dia: DIA2 });
  const f = db('admin'); const b = writeBatch(f);
  b.delete(doc(f, `slots/B1_${DIA2}_1800`));
  b.set(doc(f, `slots/B1_${DIA2}_1900`), { barberoId: 'B1', dia: DIA2, hora: '1900', citaId: 'C7' });
  b.update(doc(f, 'citas/C7'), { hora: '18:30', horaStr: '6:30 PM', slotIds: [`B1_${DIA2}_1830`, `B1_${DIA2}_1900`] });
  return assertSucceeds(b.commit());
});
await caso('ATAQUE: ni el admin pisa un bloque de otra cita', () =>
  assertFails(setDoc(doc(db('admin'), `slots/B1_${DIA2}_1830`), { barberoId: 'B1', dia: DIA2, hora: '1830', citaId: 'OTRA' })));
await caso('admin elimina una cita y sus bloques', () => {
  const f = db('admin'); const b = writeBatch(f);
  b.delete(doc(f, `slots/B1_${DIA2}_1830`));
  b.delete(doc(f, `slots/B1_${DIA2}_1900`));
  b.delete(doc(f, 'citas/C7'));
  return assertSucceeds(b.commit());
});

// ---------------------------------------------------------------------------
seccion('colecciones cerradas (tienda retirada y cualquier otra)');
for (const ruta of ['productos/P1', 'pedidos/X1', 'movimientosInventario/M1', 'cualquiera/X1']) {
  await caso(`ATAQUE: leer ${ruta.split('/')[0]}`, () => assertFails(getDoc(doc(anon(), ruta))));
  await caso(`ATAQUE: ni el admin escribe en ${ruta.split('/')[0]}`, () => assertFails(setDoc(doc(db('admin'), ruta), { a: 1 })));
}

console.log(`\n${ok} OK, ${fallos} fallidos`);
await env.cleanup();
process.exit(fallos ? 1 : 0);
