// Pruebas de seguridad de firestore.rules. Cada caso intenta algo que la app hace (debe funcionar)
// o un ataque desde la consola del navegador (debe fallar).
//
// Uso: npm run test:reglas   (levanta el emulador de Firestore, no toca el proyecto real)
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, writeBatch } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-reglas',
  // REGLAS permite probar otro archivo de reglas (para medir márgenes); por defecto, las del proyecto.
  firestore: { rules: readFileSync(process.env.REGLAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
await env.clearFirestore();

// Debe coincidir con esEmailAdmin() en firestore.rules.
const ADMIN_EMAIL = 'ortizgonzalesbryanalexander1@gmail.com';
const CUENTAS = {
  admin: ADMIN_EMAIL, luis: 'luis@x.com', pedro: 'pedro@x.com', suelto: 'suelto@x.com',
  ana: 'ana@x.com', beto: 'beto@x.com', nuevo: 'nuevo@x.com', malo: 'malo@x.com',
  falso: 'luis@x.com', // cuenta creada desde fuera con el correo de Luis, sin verificar
};
const correoDe = uid => CUENTAS[uid] ?? `${uid}@x.com`;
const db = (uid, extra = {}) => env.authenticatedContext(uid, { email: correoDe(uid), email_verified: true, ...extra }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
/** Cuenta creada con el celular: sin correo en el token. */
const celular = (uid, telefono = '+573001112233') =>
  env.authenticatedContext(uid, { phone_number: telefono, firebase: { sign_in_provider: 'phone' } }).firestore();

let ok = 0, fallos = 0;
async function caso(nombre, fn) {
  try { await fn(); ok++; console.log('  ✔', nombre); }
  catch (e) { fallos++; console.log('  ✘', nombre, '\n     ', e.message.split('\n')[0]); }
}
const seccion = t => console.log(`\n${t}`);

// ---------------------------------------------------------------------------
// Fechas: las reglas solo aceptan reservas de hoy a 14 días, así que todo es relativo a hoy.
// ---------------------------------------------------------------------------
const p2 = n => String(n).padStart(2, '0');
const enDias = n => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
const diaSemana = dia => new Date(`${dia}T12:00:00`).getDay(); // 0 = domingo
const hhmm = m => `${p2(Math.floor(m / 60))}${p2(m % 60)}`;
const horaDe = m => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
/** Duración de cada bloque de la agenda (BLOQUE en src/app/core/utils/horario.ts) y de un turno. */
const BLOQUE = 20;
const TURNO = 40;
/** IDs de los bloques de una cita: uno cada 20 minutos desde su hora. */
const bloques = (barbero, dia, inicio, duracion) =>
  Array.from({ length: Math.ceil(duracion / BLOQUE) }, (_, i) => `${barbero}_${dia}_${hhmm(inicio + i * BLOQUE)}`);

const DIA = enDias(2);
const DIA2 = enDias(3);

// ---------------------------------------------------------------------------
// Estado inicial (sin reglas)
// ---------------------------------------------------------------------------
const SERVICIOS = {
  S1: { nombre: 'Corte', precio: 57000, duracionMinutos: 60 }, // 3 bloques
  S2: { nombre: 'Color', precio: 300000, duracionMinutos: 300 }, // 15 bloques: no se reserva en línea
  S3: { nombre: 'Barba', precio: 20000 }, // sin duración: la app usa un turno (40 min)
  S4: { nombre: 'Rápido', precio: 30000, duracionMinutos: 40 }, // 2 bloques: un turno
  S5: { nombre: 'Premium', precio: 60000, duracionMinutos: 90 }, // 5 bloques
  S6: { nombre: 'Completo', precio: 150000, duracionMinutos: 140 }, // 7 bloques: el máximo en línea
  S7: { nombre: 'Doble', precio: 50000, duracionMinutos: 80 }, // 4 bloques: lo más largo que el cliente cambia de horario
  S8: { nombre: 'Largo', precio: 90000, duracionMinutos: 160 }, // 8 bloques: uno más de los que se reservan en línea
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
  await usuario('falso', 'barbero'); // aun con rol de barbero, su correo no está verificado
  await setDoc(doc(f, 'barberos/B1'), { nombre: 'Luis', especialidad: '', avatar: '' });
  await setDoc(doc(f, 'barberos/B2'), { nombre: 'Pedro', especialidad: '', avatar: '' });
  // B3: no trabaja el día de la semana de DIA y descansa de 1:00 a 2:00 p. m.
  await setDoc(doc(f, 'barberos/B3'), { nombre: 'Trip', especialidad: '', avatar: '', diasLibres: [diaSemana(DIA)], descanso: { desde: 780, hasta: 840 } });
  await setDoc(doc(f, 'barberosPrivado/B1'), { emailAsociado: 'luis@x.com', comision: 40 });
  await setDoc(doc(f, 'barberosPrivado/B2'), { emailAsociado: 'pedro@x.com', comision: 60 });
  for (const [id, s] of Object.entries(SERVICIOS)) await setDoc(doc(f, `servicios/${id}`), { ...s, categoria: 'x', descripcion: '', destacado: true });
  await setDoc(doc(f, 'productos/P1'), { nombre: 'Cera', precio: 1 });
});

/** Lo mismo que hace CitasService.reservar: la cita, sus bloques y su cupo en un batch. */
function reservar(f, citaId, uid, { inicio = 600, servicio = 'S1', barbero = 'B1', dia = DIA, extra = {}, slotIds, crearBloques, cupo = 1, conCupo = true } = {}) {
  const s = SERVICIOS[servicio] ?? { nombre: 'X', precio: 1, duracionMinutos: TURNO };
  const duracion = s.duracionMinutos > 0 ? s.duracionMinutos : TURNO;
  const ids = slotIds ?? bloques(barbero, dia, inicio, duracion);
  const cupoId = `${uid}_${dia}_${cupo}`;
  const b = writeBatch(f);
  b.set(doc(f, `citas/${citaId}`), {
    userId: uid, userName: 'Cliente', userEmail: CUENTAS[uid] ?? '', phone: '3001234567',
    servicioId: servicio, serviceName: s.nombre, precio: s.precio, duracionMinutos: duracion,
    barberoId: barbero, barberoNombre: 'Luis', dia, hora: horaDe(inicio), horaStr: '10:00 AM',
    fecha: `${dia}T15:00:00.000Z`, estado: 'pendiente', creadoEn: new Date().toISOString(), slotIds: ids, cupoId, ...extra,
  });
  for (const id of (crearBloques ?? ids)) {
    const t = id.slice(-4);
    b.set(doc(f, `slots/${id}`), { barberoId: id.split('_')[0], dia: id.split('_')[1], hora: `${t.slice(0, 2)}:${t.slice(2)}`, citaId });
  }
  if (conCupo) b.set(doc(f, `cupos/${extra.cupoId ?? cupoId}`), { userId: uid, dia, citaId });
  return b.commit();
}
let n = 0;
const nueva = () => `X${++n}`;
/** Una cuenta de cliente distinta para cada caso (cada cuenta solo tiene 3 cupos por día). */
let c = 0;
const fresco = () => `cli${++c}`;
/** Un turno libre distinto para cada caso: 6 por día (cada 2 horas), en los días 4 a 12 desde hoy. */
let t = 0;
const turno = () => {
  const i = t++;
  return { dia: enDias(4 + Math.floor(i / 6)), inicio: 600 + (i % 6) * 120 };
};

// ---------------------------------------------------------------------------
seccion('usuarios');
await caso('nuevo usuario se crea como cliente (lo que hace el login)', () =>
  assertSucceeds(setDoc(doc(db('nuevo'), 'usuarios/nuevo'), { uid: 'nuevo', nombre: 'N', email: 'nuevo@x.com', rol: 'cliente', politicaAceptadaEn: 'x' }, { merge: true })));
await caso('cuenta de celular crea su perfil sin correo y con su teléfono', () =>
  assertSucceeds(setDoc(doc(celular('cel'), 'usuarios/cel'), { uid: 'cel', nombre: 'Camilo', rol: 'cliente', telefono: '+573001112233', politicaAceptadaEn: 'x' }, { merge: true })));
await caso('ATAQUE: cuenta de celular se pone un correo en el perfil', () =>
  assertFails(setDoc(doc(celular('cel2'), 'usuarios/cel2'), { uid: 'cel2', nombre: 'X', email: 'luis@x.com', rol: 'cliente' })));
await caso('ATAQUE: cuenta de celular se crea como admin', () =>
  assertFails(setDoc(doc(celular('cel3'), 'usuarios/cel3'), { uid: 'cel3', nombre: 'X', rol: 'admin' })));
await caso('cuenta de correo recién creada (sin verificar) crea su perfil', () =>
  assertSucceeds(setDoc(doc(db('recien', { email_verified: false }), 'usuarios/recien'), { uid: 'recien', nombre: 'R', email: 'recien@x.com', rol: 'cliente', politicaAceptadaEn: 'x' }, { merge: true })));
await caso('ATAQUE: crearse como admin', () =>
  assertFails(setDoc(doc(db('malo'), 'usuarios/malo'), { uid: 'malo', nombre: 'M', email: 'malo@x.com', rol: 'admin' })));
await caso('ATAQUE: crearse como barbero', () =>
  assertFails(setDoc(doc(db('malo'), 'usuarios/malo'), { uid: 'malo', nombre: 'M', email: 'malo@x.com', rol: 'barbero' })));
await caso('ATAQUE: crear el perfil con el correo de otra persona', () =>
  assertFails(setDoc(doc(db('malo'), 'usuarios/malo'), { uid: 'malo', nombre: 'M', email: 'luis@x.com', rol: 'cliente' })));
await caso('ATAQUE: crear el perfil con campos inventados', () =>
  assertFails(setDoc(doc(db('malo'), 'usuarios/malo'), { uid: 'malo', nombre: 'M', email: 'malo@x.com', rol: 'cliente', esAdmin: true })));
await caso('ATAQUE: crear el perfil con un nombre de 5.000 letras', () =>
  assertFails(setDoc(doc(db('malo'), 'usuarios/malo'), { uid: 'malo', nombre: 'M'.repeat(5000), email: 'malo@x.com', rol: 'cliente' })));
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
await caso('ATAQUE: barbero cambia el correo de su perfil de barbero', () => assertFails(updateDoc(doc(db('luis'), 'barberosPrivado/B1'), { emailAsociado: 'otro@x.com' })));
await caso('ATAQUE: cliente se enlaza a un perfil de barbero', () => assertFails(updateDoc(doc(db('ana'), 'barberosPrivado/B1'), { emailAsociado: 'ana@x.com' })));
await caso('ATAQUE: barbero se sube la comisión', () => assertFails(updateDoc(doc(db('luis'), 'barberosPrivado/B1'), { comision: 100 })));

console.log('\nbarberos: datos públicos y privados');
await caso('la lista pública de barberos no trae correo ni comisión', async () => {
  const lista = await getDocs(collection(anon(), 'barberos'));
  for (const d of lista.docs) if ('emailAsociado' in d.data() || 'comision' in d.data()) throw new Error(`${d.id} expone datos privados`);
});
await caso('ATAQUE: visitante lee los datos privados de los barberos', () => assertFails(getDocs(collection(anon(), 'barberosPrivado'))));
await caso('ATAQUE: cliente lee los datos privados de los barberos', () => assertFails(getDocs(collection(db('ana'), 'barberosPrivado'))));
await caso('ATAQUE: cliente consulta por el correo de un barbero', () =>
  assertFails(getDocs(query(collection(db('ana'), 'barberosPrivado'), where('emailAsociado', '==', 'luis@x.com')))));
await caso('barbero encuentra su propio perfil por su correo', async () => {
  const r = await assertSucceeds(getDocs(query(collection(db('luis'), 'barberosPrivado'), where('emailAsociado', '==', 'luis@x.com'))));
  if (r.size !== 1 || r.docs[0].id !== 'B1') throw new Error('no encontró su perfil');
});
await caso('ATAQUE: barbero lista TODOS los perfiles privados (comisiones ajenas)', () => assertFails(getDocs(collection(db('luis'), 'barberosPrivado'))));
await caso('ATAQUE: barbero lee la comisión de otro barbero', () => assertFails(getDoc(doc(db('luis'), 'barberosPrivado/B2'))));
await caso('ATAQUE: cuenta sin verificar con el correo de un barbero lee su perfil privado', () =>
  assertFails(getDocs(query(collection(db('falso', { email_verified: false }), 'barberosPrivado'), where('emailAsociado', '==', 'luis@x.com')))));
await caso('admin lee todos los perfiles privados', () => assertSucceeds(getDocs(collection(db('admin'), 'barberosPrivado'))));
await caso('admin guarda correo y comisión de un barbero', () => assertSucceeds(setDoc(doc(db('admin'), 'barberosPrivado/B9'), { emailAsociado: 'nuevo@x.com', comision: 50 })));
await caso('ATAQUE: comisión fuera de rango (150 %)', () => assertFails(setDoc(doc(db('admin'), 'barberosPrivado/B9'), { emailAsociado: 'nuevo@x.com', comision: 150 })));
await caso('ATAQUE: ni el admin vuelve a poner el correo en el documento público', () =>
  assertFails(setDoc(doc(db('admin'), 'barberos/B9'), { nombre: 'X', especialidad: '', avatar: '', emailAsociado: 'nuevo@x.com' })));
await caso('ATAQUE: ni el admin guarda la comisión en el documento público', () =>
  assertFails(updateDoc(doc(db('admin'), 'barberos/B1'), { comision: 10 })));
await caso('ATAQUE: cliente escribe datos privados', () => assertFails(setDoc(doc(db('ana'), 'barberosPrivado/B8'), { emailAsociado: 'ana@x.com' })));
await caso('ATAQUE: cliente cambia el enlace de cursos (phishing)', () => assertFails(setDoc(doc(db('ana'), 'ajustes/sitio'), { cursos: { url: 'https://malo.co' } })));
await caso('admin edita servicios, barberos y ajustes (cursos y horario)', async () => {
  await assertSucceeds(updateDoc(doc(db('admin'), 'servicios/S1'), { descripcion: 'ok' }));
  await assertSucceeds(updateDoc(doc(db('admin'), 'barberos/B2'), { especialidad: 'Color' }));
  await assertSucceeds(setDoc(doc(db('admin'), 'ajustes/sitio'), { cursos: { activo: true, url: 'https://x.co' }, horario: { apertura: 600, cierre: 1200, diasCerrados: [0], cierres: [] } }));
});
await caso('ATAQUE: ni el admin crea otros documentos en ajustes', () => assertFails(setDoc(doc(db('admin'), 'ajustes/otro'), { a: 1 })));

console.log('\nbarberos: perfil público y disponibilidad');
await caso('admin guarda el perfil completo (Instagram, orden, día libre y descanso)', () =>
  assertSucceeds(setDoc(doc(db('admin'), 'barberos/B4'), { nombre: 'Nuevo', especialidad: 'Barbero', avatar: 'fotos/x.webp', instagram: 'nuevo_barber', orden: 3, diasLibres: [1], descanso: { desde: 780, hasta: 840 } })));
await caso('ATAQUE: Instagram con una dirección o código en vez del usuario', () =>
  assertFails(updateDoc(doc(db('admin'), 'barberos/B4'), { instagram: 'https://malo.co/<script>' })));
await caso('ATAQUE: día libre que no es un día de la semana', () => assertFails(updateDoc(doc(db('admin'), 'barberos/B4'), { diasLibres: [9] })));
await caso('ATAQUE: descanso al revés (termina antes de empezar)', () => assertFails(updateDoc(doc(db('admin'), 'barberos/B4'), { descanso: { desde: 900, hasta: 800 } })));
await caso('barbero cambia su propio día libre y su descanso', () =>
  assertSucceeds(updateDoc(doc(db('luis'), 'barberos/B1'), { diasLibres: [], descanso: null })));
await caso('ATAQUE: barbero se cambia el nombre o la foto', () => assertFails(updateDoc(doc(db('luis'), 'barberos/B1'), { nombre: 'El mejor' })));
await caso('ATAQUE: barbero cambia la disponibilidad de OTRO barbero', () => assertFails(updateDoc(doc(db('luis'), 'barberos/B2'), { diasLibres: [1, 2, 3, 4, 5, 6] })));
await caso('ATAQUE: cliente le pone días libres a un barbero', () => assertFails(updateDoc(doc(db('ana'), 'barberos/B1'), { diasLibres: [1, 2, 3, 4, 5, 6] })));
await caso('ATAQUE: cuenta sin verificar con el correo del barbero cambia su disponibilidad', () =>
  assertFails(updateDoc(doc(db('falso', { email_verified: false }), 'barberos/B1'), { diasLibres: [1] })));

// ---------------------------------------------------------------------------
seccion('reservas (crear)');
await caso('cliente reserva un servicio de 60 min (cita + 3 bloques + cupo)', () => assertSucceeds(reservar(db('ana'), 'C1', 'ana')));
await caso('ATAQUE: doble reserva del mismo horario', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: 600 })));
await caso('ATAQUE: reservar 20 minutos después, encima de la cita que ya está (10:20)', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: 620 })));
await caso('ATAQUE: un turno que empieza antes y termina dentro de esa cita (9:40 a 10:20)', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: 580, servicio: 'S4' })));
await caso('servicio de 40 min ocupa 2 bloques (un turno)', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S4', ...turno() })); });
await caso('servicio de 90 min (5 bloques)', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S5', ...turno() })); });
await caso('servicio de 2 h 20 min (7 bloques, el máximo en línea)', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S6', barbero: 'B2', dia: DIA2, inicio: 600 })); });
await caso('ATAQUE: servicio de 2 h 40 min (8 bloques) por la página: solo lo registra el admin', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { servicio: 'S8', barbero: 'B2', dia: enDias(5), inicio: 600 })); });
await caso('ATAQUE: servicio de 5 h (15 bloques) por la página', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { servicio: 'S2', barbero: 'B2', dia: enDias(5), inicio: 600 })); });
await caso('servicio sin duración (un turno: 40 min, 2 bloques)', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S3', ...turno() })); });
await caso('ATAQUE: servicio sin duración reservado como si durara 20 min (un solo bloque)', () => {
  const u = fresco(); const tu = turno();
  return assertFails(reservar(db(u), nueva(), u, { ...tu, servicio: 'S3', extra: { duracionMinutos: 20 }, slotIds: [`B1_${tu.dia}_${hhmm(tu.inicio)}`] }));
});
await caso('correo con mayúsculas del mismo dueño', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { ...turno(), extra: { userEmail: `${u.toUpperCase()}@X.com` } })); });
await caso('reserva sin correo (no se envía confirmación)', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { ...turno(), extra: { userEmail: '' } })); });
await caso('ATAQUE: confirmación a un correo ajeno (spam)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { userEmail: 'victima@gmail.com' } })); });
await caso('ATAQUE: cuenta con correo sin verificar pide la confirmación a ese correo', () => {
  const u = fresco();
  return assertFails(reservar(db(u, { email: 'victima@gmail.com', email_verified: false }), nueva(), u, { ...turno(), extra: { userEmail: 'victima@gmail.com' } }));
});
await caso('cuenta sin verificar reserva sin correo de confirmación', () => {
  const u = fresco();
  return assertSucceeds(reservar(db(u, { email_verified: false }), nueva(), u, { ...turno(), extra: { userEmail: '' } }));
});
await caso('cuenta de celular reserva (sin correo de confirmación)', () => { const u = fresco(); return assertSucceeds(reservar(celular(u), nueva(), u, { ...turno(), extra: { userEmail: '' } })); });
await caso('ATAQUE: cuenta de celular pide la confirmación a un correo', () => { const u = fresco(); return assertFails(reservar(celular(u), nueva(), u, { ...turno(), extra: { userEmail: 'victima@gmail.com' } })); });
await caso('ATAQUE: reservar a nombre de otro usuario', () => assertFails(reservar(db(fresco()), nueva(), 'ana', { ...turno() })));
await caso('ATAQUE: precio manipulado ($1.000)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { precio: 1000 } })); });
await caso('ATAQUE: nombre de servicio falso (texto que llega al barbero)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { serviceName: 'Gana un premio en malo.co' } })); });
await caso('ATAQUE: nombre del cliente de 5.000 letras', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { userName: 'A'.repeat(5000) } })); });
await caso('ATAQUE: un enlace en el campo del celular', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { phone: 'https://malo.co' } })); });
await caso('ATAQUE: duración menor para ocupar menos bloques', () => {
  const u = fresco(); const tu = turno();
  return assertFails(reservar(db(u), nueva(), u, { ...tu, extra: { duracionMinutos: 20 }, slotIds: [`B1_${tu.dia}_${hhmm(tu.inicio)}`] }));
});
await caso('ATAQUE: declarar 3 bloques pero crear solo el primero', () => {
  const u = fresco(); const tu = turno();
  return assertFails(reservar(db(u), nueva(), u, { ...tu, crearBloques: [`B1_${tu.dia}_${hhmm(tu.inicio)}`] }));
});
await caso('ATAQUE: servicio de 3 bloques sin crear el de la mitad (dejaría ese rato reservable)', () => {
  const u = fresco(); const tu = turno();
  return assertFails(reservar(db(u), nueva(), u, { ...tu, crearBloques: [`B1_${tu.dia}_${hhmm(tu.inicio)}`, `B1_${tu.dia}_${hhmm(tu.inicio + 40)}`] }));
});
await caso('ATAQUE: el segundo bloque es de otro barbero (dejaría libres esos 20 minutos)', () => {
  const u = fresco(); const tu = turno();
  return assertFails(reservar(db(u), nueva(), u, { ...tu, slotIds: [`B1_${tu.dia}_${hhmm(tu.inicio)}`, `B2_${tu.dia}_${hhmm(tu.inicio + 20)}`, `B1_${tu.dia}_${hhmm(tu.inicio + 40)}`] }));
});
await caso('ATAQUE: bloques saltados (10:00, 10:20 y 11:00 para un servicio de una hora)', () => {
  const u = fresco(); const tu = turno();
  return assertFails(reservar(db(u), nueva(), u, { ...tu, slotIds: [`B1_${tu.dia}_${hhmm(tu.inicio)}`, `B1_${tu.dia}_${hhmm(tu.inicio + 20)}`, `B1_${tu.dia}_${hhmm(tu.inicio + 60)}`] }));
});
await caso('ATAQUE: reservar a las 10:15 (se montaría sobre dos bloques sin chocar con ninguno)', () => {
  const u = fresco(); const tu = turno();
  return assertFails(reservar(db(u), nueva(), u, { ...tu, inicio: tu.inicio + 15 }));
});
await caso('ATAQUE: reservar a y media (10:30), fuera de la rejilla de 20 minutos', () => {
  const u = fresco(); const tu = turno();
  return assertFails(reservar(db(u), nueva(), u, { ...tu, inicio: tu.inicio + 30 }));
});
await caso('ATAQUE: servicio que no existe', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), servicio: 'NOEXISTE' })); });
await caso('ATAQUE: barbero que no existe', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), barbero: 'FANTASMA' })); });
await caso('ATAQUE: crear la cita ya completada', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { estado: 'completada' } })); });
await caso('ATAQUE: crear la cita con valor cobrado (precioFinal)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { precioFinal: 0 } })); });
await caso('ATAQUE: crear la cita con campos inventados', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { esVip: true } })); });
await caso('ATAQUE: el primer bloque no corresponde a la hora de la cita', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { hora: '06:00' } })); });
await caso('ATAQUE: día con formato inválido', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { inicio: 600, dia: '2/10/2026' })); });
await caso('ATAQUE: reservar en una fecha que ya pasó', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { inicio: 600, dia: enDias(-3) })); });
await caso('ATAQUE: reservar para dentro de un año (llenar la agenda futura)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { inicio: 600, dia: enDias(365) })); });
await caso('ATAQUE: cita sin bloques', () =>
  assertFails(setDoc(doc(db('beto'), 'citas/sinbloque'), { userId: 'beto', estado: 'pendiente', slotIds: [`B1_${DIA}_1500`] })));
await caso('ATAQUE: bloque suelto apuntando a la cita de otro', () =>
  assertFails(setDoc(doc(db('beto'), `slots/B1_${DIA}_1900`), { barberoId: 'B1', dia: DIA, hora: '19:00', citaId: 'C1' })));
await caso('ATAQUE: sobrescribir un bloque ocupado', () =>
  assertFails(setDoc(doc(db('beto'), `slots/B1_${DIA}_1000`), { barberoId: 'B1', dia: DIA, hora: '10:00', citaId: 'X1' })));
await caso('ATAQUE: bloque cuyo ID no corresponde a sus datos (no saldría como ocupado)', async () => {
  const u = fresco(); const tu = turno(); const id = nueva(); const f = db(u); const b = writeBatch(f);
  const ids = bloques('B1', tu.dia, tu.inicio, 60);
  b.set(doc(f, `citas/${id}`), { userId: u, userName: 'C', userEmail: '', phone: '3001234567', servicioId: 'S1', serviceName: 'Corte', precio: 57000, duracionMinutos: 60,
    barberoId: 'B1', barberoNombre: 'Luis', dia: tu.dia, hora: horaDe(tu.inicio), horaStr: 'x', fecha: 'x', estado: 'pendiente', creadoEn: 'x', slotIds: ids, cupoId: `${u}_${tu.dia}_1` });
  for (const s of ids) b.set(doc(f, `slots/${s}`), { barberoId: 'B1', dia: '2020-01-01', hora: '10:00', citaId: id });
  b.set(doc(f, `cupos/${u}_${tu.dia}_1`), { userId: u, dia: tu.dia, citaId: id });
  await assertFails(b.commit());
});
await caso('ATAQUE: visitante sin sesión reserva', () => assertFails(reservar(anon(), nueva(), 'beto', { ...turno() })));

console.log('\nreservas: días que abren a horas distintas (turnos desde las 9:20 o desde las 9:00)');
// Las reglas no saben a qué hora abre cada día: lo que impide la doble reserva es que los bloques son de 20 minutos,
// así que dos turnos de rejillas distintas que se cruzan comparten siempre algún bloque.
const DG = enDias(10);
await caso('turno de las 9:20 (rejilla de lunes a jueves)', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { barbero: 'B2', dia: DG, inicio: 560, servicio: 'S4' })); });
await caso('ATAQUE: turno de las 9:40 de la otra rejilla, que se cruza con el de las 9:20', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: DG, inicio: 580, servicio: 'S4' })); });
await caso('ATAQUE: turno de las 9:00 de la otra rejilla, que termina dentro del de las 9:20', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: DG, inicio: 540, servicio: 'S4' })); });
await caso('el turno siguiente (10:00) sí queda libre', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { barbero: 'B2', dia: DG, inicio: 600, servicio: 'S4' })); });
await caso('último turno del día: 7:00 p. m. (termina a las 7:40)', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { barbero: 'B2', dia: DG, inicio: 1140, servicio: 'S4' })); });

console.log('\nreservas: día libre y descanso del barbero');
await caso('ATAQUE: reservar con un barbero en su día libre', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { barbero: 'B3', dia: DIA, inicio: 600 })); });
await caso('reservar con ese barbero otro día', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { barbero: 'B3', dia: DIA2, inicio: 600 })); });
await caso('ATAQUE: reservar dentro del descanso del barbero (1:00 p. m.)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { barbero: 'B3', dia: DIA2, inicio: 780 })); });
await caso('ATAQUE: cita que empieza antes pero se mete en el descanso (12:20, una hora)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { barbero: 'B3', dia: DIA2, inicio: 740 })); });
await caso('reservar justo después del descanso (2:00 p. m.)', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { barbero: 'B3', dia: DIA2, inicio: 840 })); });

console.log('\nreservas: cupo por cliente y día');
await caso('ATAQUE: reservar sin ocupar un cupo', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), conCupo: false })); });
await caso('ATAQUE: cita sin el campo del cupo', async () => {
  const u = fresco(); const tu = turno(); const id = nueva(); const f = db(u); const b = writeBatch(f);
  const ids = bloques('B1', tu.dia, tu.inicio, 60);
  b.set(doc(f, `citas/${id}`), { userId: u, userName: 'C', userEmail: '', phone: '3001234567', servicioId: 'S1', serviceName: 'Corte', precio: 57000, duracionMinutos: 60,
    barberoId: 'B1', barberoNombre: 'Luis', dia: tu.dia, hora: horaDe(tu.inicio), horaStr: 'x', fecha: 'x', estado: 'pendiente', creadoEn: 'x', slotIds: ids });
  for (const s of ids) b.set(doc(f, `slots/${s}`), { barberoId: 'B1', dia: tu.dia, hora: `${s.slice(-4, -2)}:${s.slice(-2)}`, citaId: id });
  await assertFails(b.commit());
});
await caso('ATAQUE: usar el cupo de otra persona', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { cupoId: `ana_${DIA}_2` } })); });
await caso('ATAQUE: inventar un cuarto cupo (_4)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), cupo: 4 })); });
await caso('ATAQUE: cupo de un día distinto al de la cita', () => { const u = fresco(); const tu = turno(); return assertFails(reservar(db(u), nueva(), u, { ...tu, extra: { cupoId: `${u}_${DIA}_1` } })); });
await caso('ATAQUE: una misma cuenta intenta llenar el día: la cuarta reserva no pasa', async () => {
  const u = fresco(); const dia = enDias(13);
  await assertSucceeds(reservar(db(u), nueva(), u, { dia, inicio: 600, cupo: 1 }));
  await assertSucceeds(reservar(db(u), nueva(), u, { dia, inicio: 720, cupo: 2 }));
  await assertSucceeds(reservar(db(u), nueva(), u, { dia, inicio: 840, cupo: 3 }));
  await assertFails(reservar(db(u), nueva(), u, { dia, inicio: 960, cupo: 1 })); // ese cupo ya está ocupado
  await assertFails(reservar(db(u), nueva(), u, { dia, inicio: 960, cupo: 4 })); // y no hay más
});
await caso('ATAQUE: crear un cupo suelto, sin cita', () => assertFails(setDoc(doc(db('beto'), `cupos/beto_${DIA}_3`), { userId: 'beto', dia: DIA, citaId: 'NOEXISTE' })));
await caso('ATAQUE: ocuparle los cupos a otra persona', () => assertFails(setDoc(doc(db('beto'), `cupos/ana_${DIA}_2`), { userId: 'ana', dia: DIA, citaId: 'C1' })));
await caso('cliente consulta sus propios cupos del día', () =>
  assertSucceeds(getDocs(query(collection(db('ana'), 'cupos'), where('userId', '==', 'ana'), where('dia', '==', DIA)))));
await caso('ATAQUE: cliente consulta los cupos de otro', () =>
  assertFails(getDocs(query(collection(db('beto'), 'cupos'), where('userId', '==', 'ana')))));
await caso('ATAQUE: cliente libera el cupo de una cita que sigue activa', () => assertFails(deleteDoc(doc(db('ana'), `cupos/ana_${DIA}_1`))));

// ---------------------------------------------------------------------------
seccion('reservas (leer y cambiar)');
await caso('visitante consulta la disponibilidad sin iniciar sesión', () =>
  assertSucceeds(getDocs(query(collection(anon(), 'slots'), where('dia', '==', DIA)))));
await caso('cliente lee disponibilidad y sus citas', async () => {
  await assertSucceeds(getDocs(query(collection(db('beto'), 'slots'), where('dia', '==', DIA))));
  await assertSucceeds(getDocs(query(collection(db('ana'), 'citas'), where('userId', '==', 'ana'))));
});
await caso('la disponibilidad no trae datos personales', async () => {
  const r = await getDocs(query(collection(anon(), 'slots'), where('dia', '==', DIA)));
  for (const d of r.docs) for (const k of Object.keys(d.data())) if (!['barberoId', 'dia', 'hora', 'citaId', 'bloqueo', 'motivo'].includes(k)) throw new Error(`campo inesperado: ${k}`);
});
await caso('ATAQUE: visitante lee las citas', () => assertFails(getDocs(collection(anon(), 'citas'))));
await caso('ATAQUE: cliente lista todas las citas (datos personales)', () => assertFails(getDocs(collection(db('beto'), 'citas'))));
await caso('ATAQUE: cliente lee la cita de otro', () => assertFails(getDoc(doc(db('beto'), 'citas/C1'))));
await caso('ATAQUE: cliente consulta citas de otro con filtro', () => assertFails(getDocs(query(collection(db('beto'), 'citas'), where('userId', '==', 'ana')))));
await caso('ATAQUE: cliente cambia el precio de su cita', () => assertFails(updateDoc(doc(db('ana'), 'citas/C1'), { precio: 1 })));
await caso('ATAQUE: cliente marca su cita como completada', () => assertFails(updateDoc(doc(db('ana'), 'citas/C1'), { estado: 'completada' })));
await caso('ATAQUE: cliente mueve su cita a otra hora sin bloques', () => assertFails(updateDoc(doc(db('ana'), 'citas/C1'), { hora: '18:00' })));
await caso('ATAQUE: cliente borra su cita', () => assertFails(deleteDoc(doc(db('ana'), 'citas/C1'))));
await caso('ATAQUE: cliente libera bloques de una cita activa', () => assertFails(deleteDoc(doc(db('ana'), `slots/B1_${DIA}_1000`))));
await caso('ATAQUE: otro cliente cancela una cita ajena', () => assertFails(updateDoc(doc(db('beto'), 'citas/C1'), { estado: 'cancelada' })));
await caso('cliente cancela su cita y libera los bloques y el cupo', () => {
  const f = db('ana'); const b = writeBatch(f);
  b.update(doc(f, 'citas/C1'), { estado: 'cancelada' });
  for (const id of bloques('B1', DIA, 600, 60)) b.delete(doc(f, `slots/${id}`));
  b.delete(doc(f, `cupos/ana_${DIA}_1`));
  return assertSucceeds(b.commit());
});
await caso('ATAQUE: cliente reactiva una cita cancelada', () => assertFails(updateDoc(doc(db('ana'), 'citas/C1'), { estado: 'pendiente' })));
await caso('tras cancelar, otro cliente reserva ese horario', () => assertSucceeds(reservar(db('beto'), 'C6', 'beto')));
await caso('y quien canceló puede volver a reservar ese día (su cupo quedó libre)', () => assertSucceeds(reservar(db('ana'), 'C1b', 'ana', { inicio: 900 })));

console.log('\nreagendar (el cliente cambia su cita de horario)');
/** Lo mismo que CitasService.reagendar: cancela la anterior y crea la nueva en un batch. */
function reagendar(f, uid, anterior, nuevaId, { dia, inicio, barbero = 'B1', cupoNuevo, servicio = 'S1', extra = {} }) {
  const s = SERVICIOS[servicio];
  const ids = bloques(barbero, dia, inicio, s.duracionMinutos);
  const b = writeBatch(f);
  b.update(doc(f, `citas/${anterior.id}`), { estado: 'cancelada', reemplazadaPor: nuevaId });
  b.set(doc(f, `citas/${nuevaId}`), {
    userId: uid, userName: 'Cliente', userEmail: '', phone: '3001234567', servicioId: servicio, serviceName: s.nombre, precio: s.precio, duracionMinutos: s.duracionMinutos,
    barberoId: barbero, barberoNombre: 'Luis', dia, hora: horaDe(inicio), horaStr: 'x', fecha: 'x', estado: 'pendiente', creadoEn: 'x',
    slotIds: ids, cupoId: cupoNuevo, reemplazaA: anterior.id, ...extra,
  });
  for (const id of anterior.slotIds.filter(s => ids.includes(s))) b.update(doc(f, `slots/${id}`), { citaId: nuevaId }); // los que coinciden se traspasan
  for (const id of anterior.slotIds.filter(s => !ids.includes(s))) b.delete(doc(f, `slots/${id}`));
  for (const id of ids.filter(s => !anterior.slotIds.includes(s))) b.set(doc(f, `slots/${id}`), { barberoId: barbero, dia, hora: `${id.slice(-4, -2)}:${id.slice(-2)}`, citaId: nuevaId });
  b.delete(doc(f, `cupos/${anterior.cupoId}`));
  b.set(doc(f, `cupos/${cupoNuevo}`), { userId: uid, dia, citaId: nuevaId });
  return b.commit();
}
const RD = enDias(3); // día de las pruebas de reagendar (barbero B2, tarde: lejos de los otros casos)
await caso('cliente cambia su cita a otro día', async () => {
  await reservar(db('rea1'), 'R1', 'rea1', { barbero: 'B2', dia: RD, inicio: 1020 });
  const anterior = { id: 'R1', slotIds: bloques('B2', RD, 1020, 60), cupoId: `rea1_${RD}_1` };
  const otro = enDias(6);
  await assertSucceeds(reagendar(db('rea1'), 'rea1', anterior, 'R1n', { barbero: 'B2', dia: otro, inicio: 1020, cupoNuevo: `rea1_${otro}_1` }));
});
await caso('el horario anterior queda libre para otra persona', () => assertSucceeds(reservar(db('rea9'), nueva(), 'rea9', { barbero: 'B2', dia: RD, inicio: 1020 })));
await caso('cliente corre su cita un turno el mismo día (comparte un bloque con la anterior)', async () => {
  await reservar(db('rea2'), 'R2', 'rea2', { barbero: 'B2', dia: RD, inicio: 1140 });
  const anterior = { id: 'R2', slotIds: bloques('B2', RD, 1140, 60), cupoId: `rea2_${RD}_1` };
  await assertSucceeds(reagendar(db('rea2'), 'rea2', anterior, 'R2n', { barbero: 'B2', dia: RD, inicio: 1180, cupoNuevo: `rea2_${RD}_2` }));
});
await caso('cliente cambia de horario un servicio de 80 min (4 bloques, el máximo que deja la página)', async () => {
  const dia = enDias(11);
  await reservar(db('rea5'), 'R5', 'rea5', { barbero: 'B2', dia, inicio: 600, servicio: 'S7' });
  const anterior = { id: 'R5', slotIds: bloques('B2', dia, 600, 80), cupoId: `rea5_${dia}_1` };
  // 40 minutos más tarde: dos bloques pasan a la cita nueva, dos se borran y dos se crean.
  await assertSucceeds(reagendar(db('rea5'), 'rea5', anterior, 'R5n', { barbero: 'B2', dia, inicio: 640, servicio: 'S7', cupoNuevo: `rea5_${dia}_2` }));
});
await caso('ATAQUE: quedarse con los bloques de la cita de OTRO diciendo que la reagenda', async () => {
  await reservar(db('rea3'), 'R3', 'rea3', { barbero: 'B2', dia: RD, inicio: 1260 });
  const anterior = { id: 'R3', slotIds: bloques('B2', RD, 1260, 60), cupoId: `rea3_${RD}_1` };
  await assertFails(reagendar(db('malo'), 'malo', anterior, 'R3n', { barbero: 'B2', dia: RD, inicio: 1260, cupoNuevo: `malo_${RD}_1` }));
});
await caso('ATAQUE: traspasarse un bloque ajeno sin cancelar nada', () =>
  assertFails(updateDoc(doc(db('malo'), `slots/B2_${RD}_2100`), { citaId: 'OTRA' })));
await caso('ATAQUE: reagendar a un horario ocupado', async () => {
  await reservar(db('rea4'), 'R4', 'rea4', { barbero: 'B2', dia: enDias(7), inicio: 600 });
  const anterior = { id: 'R4', slotIds: bloques('B2', enDias(7), 600, 60), cupoId: `rea4_${enDias(7)}_1` };
  await assertFails(reagendar(db('rea4'), 'rea4', anterior, 'R4n', { barbero: 'B2', dia: RD, inicio: 1260, cupoNuevo: `rea4_${RD}_1` }));
});

// ---------------------------------------------------------------------------
seccion('agenda de reservas (siempre abierta o por periodos que abre el admin)');
/** Deja ajustes/sitio como lo guardaría el panel (sin pasar por las reglas). `null` borra el documento. */
const ponerAgenda = agenda => env.withSecurityRulesDisabled(ctx => agenda === null
  ? deleteDoc(doc(ctx.firestore(), 'ajustes/sitio'))
  : setDoc(doc(ctx.firestore(), 'ajustes/sitio'), { cursos: { activo: false, url: '' }, agenda }));
const CONTINUA = { modo: 'continua', desde: '', hasta: '' };
// Los periodos de estas pruebas van del día 20 al 30 con el barbero B2: lejos de todos los demás casos.
const P1 = enDias(20), P2 = enDias(30);

await caso('siempre abierta: ATAQUE reservar a más de 14 días', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(17), inicio: 600 })); });
await caso('proyecto sin documento de ajustes: se reserva igual, dentro de los 14 días', async () => {
  await ponerAgenda(null);
  const u = fresco();
  await assertSucceeds(reservar(db(u), nueva(), u, { ...turno() }));
  await assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(17), inicio: 600 }));
});
await caso('ATAQUE: un cliente se abre la agenda a su gusto', () =>
  assertFails(setDoc(doc(db('ana'), 'ajustes/sitio'), { agenda: { modo: 'periodo', desde: enDias(0), hasta: enDias(365) } }, { merge: true })));
await caso('ATAQUE: un barbero abre la agenda', () =>
  assertFails(setDoc(doc(db('luis'), 'ajustes/sitio'), { agenda: { modo: 'periodo', desde: enDias(0), hasta: enDias(30) } }, { merge: true })));
await caso('admin abre un periodo de agenda', () =>
  assertSucceeds(setDoc(doc(db('admin'), 'ajustes/sitio'), { agenda: { modo: 'periodo', desde: P1, hasta: P2 } }, { merge: true })));
await caso('por periodos: se reserva dentro del periodo aunque falten más de 14 días', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(25), inicio: 600 })); });
await caso('por periodos: el primer día y el último también cuentan', async () => {
  const u = fresco();
  await assertSucceeds(reservar(db(u), nueva(), u, { barbero: 'B2', dia: P1, inicio: 600 }));
  await assertSucceeds(reservar(db(u), nueva(), u, { barbero: 'B2', dia: P2, inicio: 600 }));
});
await caso('por periodos: servicio de 7 bloques (el máximo de lecturas de una reserva)', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S6', barbero: 'B2', dia: enDias(26), inicio: 600 })); });
await caso('ATAQUE: reservar antes de que empiece el periodo (aunque sea esta semana)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(5), inicio: 1320 })); });
await caso('ATAQUE: reservar el día siguiente al último del periodo', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(31), inicio: 600 })); });
await caso('ATAQUE: cupo de un día abierto para una cita de un día cerrado', () => {
  const u = fresco();
  return assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(31), inicio: 600, extra: { cupoId: `${u}_${P2}_1` } }));
});
await caso('por periodos: el cliente cambia su cita a otro día del periodo', async () => {
  await reservar(db('age1'), 'AG1', 'age1', { barbero: 'B2', dia: enDias(21), inicio: 600 });
  const anterior = { id: 'AG1', slotIds: bloques('B2', enDias(21), 600, 60), cupoId: `age1_${enDias(21)}_1` };
  await assertSucceeds(reagendar(db('age1'), 'age1', anterior, 'AG1n', { barbero: 'B2', dia: enDias(22), inicio: 600, cupoNuevo: `age1_${enDias(22)}_1` }));
});
await caso('ATAQUE: cambiar la cita a un día fuera del periodo', async () => {
  await reservar(db('age2'), 'AG2', 'age2', { barbero: 'B2', dia: enDias(23), inicio: 600 });
  const anterior = { id: 'AG2', slotIds: bloques('B2', enDias(23), 600, 60), cupoId: `age2_${enDias(23)}_1` };
  await assertFails(reagendar(db('age2'), 'age2', anterior, 'AG2n', { barbero: 'B2', dia: enDias(31), inicio: 600, cupoNuevo: `age2_${enDias(31)}_1` }));
});
await caso('el cliente cancela aunque la agenda ya esté cerrada', async () => {
  await reservar(db('age3'), 'AG3', 'age3', { barbero: 'B2', dia: enDias(24), inicio: 600 });
  await ponerAgenda({ modo: 'periodo', desde: enDias(-20), hasta: enDias(-1) });
  const f = db('age3'); const b = writeBatch(f);
  b.update(doc(f, 'citas/AG3'), { estado: 'cancelada' });
  for (const id of bloques('B2', enDias(24), 600, 60)) b.delete(doc(f, `slots/${id}`));
  b.delete(doc(f, `cupos/age3_${enDias(24)}_1`));
  await assertSucceeds(b.commit());
});
await caso('periodo que ya terminó: la agenda queda cerrada para todos', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(2), inicio: 1320 })); });
await caso('con la agenda cerrada, el admin sí registra una cita (la que le piden por teléfono)', () =>
  assertSucceeds(setDoc(doc(db('admin'), 'citas/ADMAG'), { userId: 'admin', userName: 'Por teléfono', servicioId: 'S1', serviceName: 'Corte', precio: 57000, duracionMinutos: 60,
    barberoId: 'B2', dia: enDias(2), hora: '22:00', estado: 'confirmada', slotIds: [] })));
await caso('ATAQUE: periodo de un año guardado a mano: nadie reserva a más de 60 días', async () => {
  await ponerAgenda({ modo: 'periodo', desde: enDias(0), hasta: enDias(365) });
  const u = fresco();
  await assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(90), inicio: 600 }));
  await assertSucceeds(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(45), inicio: 600 }));
});
await caso('agenda mal guardada (por periodos, sin fechas): no pasa nadie', async () => {
  await ponerAgenda({ modo: 'periodo' });
  const u = fresco();
  await assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(2), inicio: 1320 }));
});
await caso('al volver a "siempre abierta" se reserva como antes: los próximos 14 días y no más', async () => {
  await ponerAgenda(CONTINUA);
  const u = fresco();
  await assertSucceeds(reservar(db(u), nueva(), u, { ...turno() }));
  await assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(27), inicio: 600 }));
});

// ---------------------------------------------------------------------------
seccion('barberos');
await caso('barbero lee la agenda (todas las citas)', () => assertSucceeds(getDocs(collection(db('luis'), 'citas'))));
await caso('barbero marca hecha su cita con el valor cobrado', () => assertSucceeds(updateDoc(doc(db('luis'), 'citas/C6'), { estado: 'completada', precioFinal: 65000 })));
await caso('ATAQUE: barbero cambia otros campos (precio)', () => assertFails(updateDoc(doc(db('luis'), 'citas/C6'), { precio: 0 })));
await caso('ATAQUE: valor cobrado negativo', () => assertFails(updateDoc(doc(db('luis'), 'citas/C6'), { estado: 'completada', precioFinal: -1 })));
await caso('ATAQUE: valor cobrado que no es número', () => assertFails(updateDoc(doc(db('luis'), 'citas/C6'), { estado: 'completada', precioFinal: 'gratis' })));
await caso('ATAQUE: barbero gestiona la cita de OTRO barbero', () => assertFails(updateDoc(doc(db('pedro'), 'citas/C6'), { estado: 'no-asistio' })));
await caso('ATAQUE: cuenta sin verificar con el correo de un barbero gestiona sus citas', () =>
  assertFails(updateDoc(doc(db('falso', { email_verified: false }), 'citas/C6'), { estado: 'no-asistio' })));
await caso('ATAQUE: barbero sin perfil enlazado gestiona citas', () => assertFails(updateDoc(doc(db('suelto'), 'citas/C6'), { estado: 'cancelada' })));
await caso('ATAQUE: cliente pone el valor cobrado de su cita', () => assertFails(updateDoc(doc(db('beto'), 'citas/C6'), { precioFinal: 1 })));
await caso('barbero cancela su cita y libera los bloques y el cupo', async () => {
  await reservar(db('bar1'), 'C8', 'bar1', { inicio: 900, dia: DIA2 });
  const f = db('luis'); const b = writeBatch(f);
  b.update(doc(f, 'citas/C8'), { estado: 'cancelada' });
  for (const id of bloques('B1', DIA2, 900, 60)) b.delete(doc(f, `slots/${id}`));
  b.delete(doc(f, `cupos/bar1_${DIA2}_1`));
  return assertSucceeds(b.commit());
});

console.log('\nbloqueos de agenda (el barbero cierra horas)');
const BD = enDias(8);
await caso('barbero cierra una hora de su propia agenda (almuerzo)', () => {
  const f = db('luis'); const b = writeBatch(f);
  for (const m of [780, 800, 820]) b.set(doc(f, `slots/B1_${BD}_${hhmm(m)}`), { barberoId: 'B1', dia: BD, hora: horaDe(m), bloqueo: true, motivo: 'Almuerzo' });
  return assertSucceeds(b.commit());
});
await caso('barbero cierra el día entero (de 9:20 a 7:40) en lotes de 8 bloques, como hace la página', async () => {
  const f = db('pedro'); const dia = enDias(9);
  const total = (1180 - 560) / BLOQUE; // 31 bloques de 20 minutos
  for (let lote = 0; lote * 8 < total; lote++) {
    const b = writeBatch(f);
    for (let i = lote * 8; i < Math.min(total, lote * 8 + 8); i++) {
      const m = 560 + i * BLOQUE;
      b.set(doc(f, `slots/B2_${dia}_${hhmm(m)}`), { barberoId: 'B2', dia, hora: horaDe(m), bloqueo: true, motivo: 'Vacaciones' });
    }
    await assertSucceeds(b.commit());
  }
});
await caso('ATAQUE: cierre a y media (13:30), fuera de la rejilla de 20 minutos', () =>
  assertFails(setDoc(doc(db('luis'), `slots/B1_${BD}_1330`), { barberoId: 'B1', dia: BD, hora: '13:30', bloqueo: true, motivo: 'Almuerzo' })));
await caso('ATAQUE: reservar en una hora que el barbero cerró', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { dia: BD, inicio: 780 })); });
await caso('ATAQUE: reservar una hora que termina dentro del rato cerrado', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { dia: BD, inicio: 740 })); });
await caso('ATAQUE: barbero cierra la agenda de OTRO barbero', () =>
  assertFails(setDoc(doc(db('luis'), `slots/B2_${BD}_1300`), { barberoId: 'B2', dia: BD, hora: '13:00', bloqueo: true, motivo: '' })));
await caso('ATAQUE: cliente cierra la agenda de un barbero', () =>
  assertFails(setDoc(doc(db('ana'), `slots/B1_${BD}_1500`), { barberoId: 'B1', dia: BD, hora: '15:00', bloqueo: true, motivo: '' })));
await caso('ATAQUE: visitante cierra la agenda de un barbero', () =>
  assertFails(setDoc(doc(anon(), `slots/B1_${BD}_1500`), { barberoId: 'B1', dia: BD, hora: '15:00', bloqueo: true, motivo: '' })));
await caso('ATAQUE: cuenta sin verificar con el correo del barbero cierra su agenda', () =>
  assertFails(setDoc(doc(db('falso', { email_verified: false }), `slots/B1_${BD}_1500`), { barberoId: 'B1', dia: BD, hora: '15:00', bloqueo: true, motivo: '' })));
await caso('ATAQUE: barbero cierra encima de una cita agendada (la borraría de la agenda)', () =>
  assertFails(setDoc(doc(db('luis'), `slots/B1_${DIA}_1000`), { barberoId: 'B1', dia: DIA, hora: '10:00', bloqueo: true, motivo: '' })));
await caso('ATAQUE: texto libre en el motivo (lo vería cualquiera)', () =>
  assertFails(setDoc(doc(db('luis'), `slots/B1_${BD}_1600`), { barberoId: 'B1', dia: BD, hora: '16:00', bloqueo: true, motivo: 'Cita con el médico Dr. X' })));
await caso('ATAQUE: cerrar la agenda de aquí a un año', () =>
  assertFails(setDoc(doc(db('luis'), `slots/B1_${enDias(365)}_1000`), { barberoId: 'B1', dia: enDias(365), hora: '10:00', bloqueo: true, motivo: '' })));
await caso('ATAQUE: otro barbero vuelve a abrir un horario que no cerró él', () => assertFails(deleteDoc(doc(db('pedro'), `slots/B1_${BD}_1300`))));
await caso('ATAQUE: cliente vuelve a abrir un horario cerrado', () => assertFails(deleteDoc(doc(db('ana'), `slots/B1_${BD}_1300`))));
await caso('barbero vuelve a abrir su horario', () => assertSucceeds(deleteDoc(doc(db('luis'), `slots/B1_${BD}_1300`))));
await caso('admin cierra y abre la agenda de cualquier barbero', async () => {
  await assertSucceeds(setDoc(doc(db('admin'), `slots/B2_${BD}_1500`), { barberoId: 'B2', dia: BD, hora: '15:00', bloqueo: true, motivo: 'Permiso' }));
  await assertSucceeds(deleteDoc(doc(db('admin'), `slots/B2_${BD}_1500`)));
});

// ---------------------------------------------------------------------------
seccion('admin');
await caso('admin registra una cita de un cliente sin cuenta (walk-in)', () =>
  assertSucceeds(setDoc(doc(db('admin'), 'citas/W1'), { userId: 'admin', userName: 'Walk-in', userEmail: '', estado: 'completada', precio: 30000, barberoId: 'B1', dia: '2026-09-30' })));
await caso('admin reprograma (mueve bloques en un batch)', async () => {
  await reservar(db('adm1'), 'C7', 'adm1', { inicio: 1080, dia: DIA2 });
  const f = db('admin'); const b = writeBatch(f);
  // De 6:00 a 6:20 p. m.: se suelta el primer bloque y se toma el de las 7:00; los dos del medio se conservan.
  b.delete(doc(f, `slots/B1_${DIA2}_1800`));
  b.set(doc(f, `slots/B1_${DIA2}_1900`), { barberoId: 'B1', dia: DIA2, hora: '19:00', citaId: 'C7' });
  b.update(doc(f, 'citas/C7'), { hora: '18:20', horaStr: '6:20 PM', slotIds: bloques('B1', DIA2, 1100, 60) });
  return assertSucceeds(b.commit());
});
await caso('ATAQUE: ni el admin pisa un bloque de otra cita', () =>
  assertFails(setDoc(doc(db('admin'), `slots/B1_${DIA2}_1820`), { barberoId: 'B1', dia: DIA2, hora: '18:20', citaId: 'OTRA' })));
/** Lo mismo que hace CitasService.registrarDesdePanel: la cita (de ninguna cuenta) y sus bloques, sin cupo. */
function registrarEnPanel(f, citaId, { inicio, servicio = 'S1', barbero = 'B1', dia }) {
  const s = SERVICIOS[servicio];
  const ids = bloques(barbero, dia, inicio, s.duracionMinutos);
  const b = writeBatch(f);
  b.set(doc(f, `citas/${citaId}`), {
    userId: '', userName: 'Por WhatsApp', userEmail: '', phone: '3001234567',
    servicioId: servicio, serviceName: s.nombre, precio: s.precio, duracionMinutos: s.duracionMinutos,
    barberoId: barbero, barberoNombre: 'Luis', dia, hora: horaDe(inicio), horaStr: 'x',
    fecha: `${dia}T15:00:00.000Z`, estado: 'pendiente', creadoEn: new Date().toISOString(), slotIds: ids,
  });
  for (const id of ids) b.set(doc(f, `slots/${id}`), { barberoId: barbero, dia, hora: horaDe(inicio + (ids.indexOf(id)) * BLOQUE), citaId });
  return b.commit();
}
const PANEL = enDias(20);
await caso('admin agenda desde el panel una cita sin cuenta ni cupo, con sus bloques', () =>
  assertSucceeds(registrarEnPanel(db('admin'), 'PAN1', { inicio: 600, servicio: 'S5', dia: PANEL })));
await caso('admin agenda desde el panel el servicio más largo que se reserva en línea (7 bloques, por las lecturas)', () =>
  assertSucceeds(registrarEnPanel(db('admin'), 'PAN2', { inicio: 840, servicio: 'S6', dia: PANEL })));
await caso('ATAQUE: desde el panel tampoco se agenda sobre otra cita (10:40, dentro de la de las 10:00)', () =>
  assertFails(registrarEnPanel(db('admin'), 'PAN3', { inicio: 640, servicio: 'S4', dia: PANEL })));
await caso('ATAQUE: un cliente no agenda como si fuera el panel (sin cuenta ni cupo)', () =>
  assertFails(registrarEnPanel(db('ana'), 'PAN4', { inicio: 1080, servicio: 'S4', dia: PANEL })));
await caso('el barbero ve, completa y cancela una cita del panel y suelta sus bloques', async () => {
  await assertSucceeds(getDoc(doc(db('luis'), 'citas/PAN1')));
  await assertSucceeds(updateDoc(doc(db('luis'), 'citas/PAN2'), { estado: 'completada', precioFinal: 150000 }));
  const f = db('luis'); const b = writeBatch(f);
  b.update(doc(f, 'citas/PAN1'), { estado: 'cancelada' });
  for (const id of bloques('B1', PANEL, 600, 90)) b.delete(doc(f, `slots/${id}`));
  return assertSucceeds(b.commit());
});
await caso('admin elimina una cita con sus bloques y su cupo', () => {
  const f = db('admin'); const b = writeBatch(f);
  for (const id of bloques('B1', DIA2, 1100, 60)) b.delete(doc(f, `slots/${id}`));
  b.delete(doc(f, `cupos/adm1_${DIA2}_1`));
  b.delete(doc(f, 'citas/C7'));
  return assertSucceeds(b.commit());
});

// ---------------------------------------------------------------------------
seccion('agendas recurrentes');
// Dentro de los 14 días de la agenda continua y lejos de los días que usa turno() (4 a 10).
const RECURRENTE = enDias(14);
/** Lo que guarda el panel (RecurrenciasService.crear). */
const recurrencia = (extra = {}) => ({
  clienteNombre: 'Juan Camilo', clienteTelefono: '3001234567', servicioId: 'S4', serviceName: 'Rápido', precio: 30000,
  duracionMinutos: 60, barberoId: 'B1', barberoNombre: 'Luis', frecuencia: 'semanal', hora: '17:20', desde: RECURRENTE,
  activa: true, creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(), ...extra,
});
await caso('admin crea una agenda recurrente (con la duración que elija)', () => assertSucceeds(setDoc(doc(db('admin'), 'recurrencias/R1'), recurrencia())));
await caso('admin lee las agendas recurrentes', () => assertSucceeds(getDocs(collection(db('admin'), 'recurrencias'))));
await caso('admin cambia la hora y la frecuencia', () =>
  assertSucceeds(updateDoc(doc(db('admin'), 'recurrencias/R1'), { hora: '18:00', frecuencia: 'quincenal', actualizadoEn: 'v2' })));
await caso('admin pausa la agenda', () => assertSucceeds(updateDoc(doc(db('admin'), 'recurrencias/R1'), { activa: false, actualizadoEn: 'v3' })));
await caso('ATAQUE: un cambio sin actualizadoEn nuevo (la función no se enteraría)', () =>
  assertFails(updateDoc(doc(db('admin'), 'recurrencias/R1'), { hora: '19:00' })));
await caso('ATAQUE: ni el admin escribe lo que anota la función (hasta dónde va, qué omitió)', async () => {
  await assertFails(updateDoc(doc(db('admin'), 'recurrencias/R1'), { generadaHasta: enDias(300), actualizadoEn: 'v4' }));
  await assertFails(setDoc(doc(db('admin'), 'recurrencias/R2'), recurrencia({ procesadaEn: 'x' })));
});
for (const [nombre, extra] of [
  ['una hora fuera de la rejilla de 20 minutos (5:30)', { hora: '17:30' }],
  ['una duración que no es de bloques de 20 (30 min)', { duracionMinutos: 30 }],
  ['una duración de un día entero', { duracionMinutos: 1440 }],
  ['un turno que pasa de la medianoche', { hora: '23:40', duracionMinutos: 40 }],
  ['una frecuencia inventada', { frecuencia: 'diaria' }],
  ['un celular que no es colombiano', { clienteTelefono: '+1 555 0100' }],
  ['un cliente sin nombre', { clienteNombre: '' }],
  ['un nombre de 5.000 letras', { clienteNombre: 'x'.repeat(5000) }],
  ['una fecha de inicio que no es fecha', { desde: 'mañana' }],
  ['un precio negativo', { precio: -1 }],
  ['campos inventados', { notas: 'hola' }],
]) {
  await caso(`ATAQUE: agenda recurrente con ${nombre}`, () => assertFails(setDoc(doc(db('admin'), `recurrencias/MAL${++n}`), recurrencia(extra))));
}
await caso('ATAQUE: barbero lee o crea agendas recurrentes', async () => {
  await assertFails(getDocs(collection(db('luis'), 'recurrencias')));
  await assertFails(setDoc(doc(db('luis'), 'recurrencias/R3'), recurrencia()));
});
await caso('ATAQUE: cliente o visitante crean, leen o borran agendas recurrentes', async () => {
  await assertFails(setDoc(doc(db('ana'), 'recurrencias/R3'), recurrencia()));
  await assertFails(getDoc(doc(db('ana'), 'recurrencias/R1')));
  await assertFails(getDoc(doc(anon(), 'recurrencias/R1')));
  await assertFails(deleteDoc(doc(db('ana'), 'recurrencias/R1')));
});

// Un turno que apartó la función (Admin SDK, sin reglas): cita sin cuenta, con su serie, y sus bloques.
const turnoRecurrente = bloques('B1', RECURRENTE, 1040, 60);
await env.withSecurityRulesDisabled(async ctx => {
  const f = ctx.firestore();
  await setDoc(doc(f, 'citas/R1_turno'), {
    userId: '', userName: 'Juan Camilo', userEmail: '', phone: '3001234567', servicioId: 'S4', serviceName: 'Rápido', precio: 30000,
    duracionMinutos: 60, barberoId: 'B1', barberoNombre: 'Luis', dia: RECURRENTE, hora: '17:20', horaStr: '5:20 PM',
    fecha: `${RECURRENTE}T22:20:00.000Z`, estado: 'pendiente', creadoEn: new Date().toISOString(), slotIds: turnoRecurrente,
    recurrenciaId: 'R1', frecuencia: 'semanal',
  });
  for (const id of turnoRecurrente) await setDoc(doc(f, `slots/${id}`), { barberoId: 'B1', dia: RECURRENTE, hora: `${id.slice(-4, -2)}:${id.slice(-2)}`, citaId: 'R1_turno' });
});
await caso('ATAQUE: un cliente reserva encima de un turno recurrente (justo después sí puede)', async () => {
  const u = fresco();
  await assertFails(reservar(db(u), nueva(), u, { dia: RECURRENTE, inicio: 1060, servicio: 'S4' }));
  await assertSucceeds(reservar(db(u), nueva(), u, { dia: RECURRENTE, inicio: 1100, servicio: 'S4' }));
});
await caso('el barbero ve el turno recurrente y lo marca como hecho', async () => {
  await assertSucceeds(getDoc(doc(db('luis'), 'citas/R1_turno')));
  await assertSucceeds(updateDoc(doc(db('luis'), 'citas/R1_turno'), { estado: 'completada', precioFinal: 30000 }));
});
await caso('ATAQUE: el barbero se cambia el turno a otra serie o le quita la marca', () =>
  assertFails(updateDoc(doc(db('luis'), 'citas/R1_turno'), { recurrenciaId: 'OTRA', estado: 'no-asistio' })));
await caso('ATAQUE: un cliente no ve los turnos recurrentes (no son de ninguna cuenta)', () => assertFails(getDoc(doc(db('ana'), 'citas/R1_turno'))));
await caso('ATAQUE: un cliente no se inventa un turno recurrente al reservar', () => {
  const u = fresco();
  return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { recurrenciaId: 'R1', frecuencia: 'semanal' } }));
});
await caso('admin borra una agenda recurrente', () => assertSucceeds(deleteDoc(doc(db('admin'), 'recurrencias/R1'))));

// ---------------------------------------------------------------------------
seccion('colecciones cerradas (tienda retirada y cualquier otra)');
for (const ruta of ['productos/P1', 'pedidos/X1', 'movimientosInventario/M1', 'cualquiera/X1']) {
  await caso(`ATAQUE: leer ${ruta.split('/')[0]}`, () => assertFails(getDoc(doc(anon(), ruta))));
  await caso(`ATAQUE: ni el admin escribe en ${ruta.split('/')[0]}`, () => assertFails(setDoc(doc(db('admin'), ruta), { a: 1 })));
}

console.log(`\n${ok} OK, ${fallos} fallidos`);
await env.cleanup();
process.exit(fallos ? 1 : 0);
