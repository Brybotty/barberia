// Pruebas de seguridad de firestore.rules. Cada caso intenta algo que la app hace (debe funcionar)
// o un ataque desde la consola del navegador (debe fallar).
//
// Uso: npm run test:reglas   (levanta el emulador de Firestore, no toca el proyecto real)
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, deleteField, getDoc, getDocs, collection, query, where, writeBatch } from 'firebase/firestore';

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
const horaDe = m => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
/** Lo que dura un servicio sin duración en el catálogo: un turno. */
const TURNO = 40;

// --- La agenda al minuto: un documento por barbero y día en `ocupacion` (src/app/core/utils/ocupacion.ts) ---
const CEROS = '0'.repeat(288);
/** Marcas de 5 minutos de un rato: [primera, cuántas]. */
const tramo = (inicio, duracion) => [Math.floor(inicio / 5), Math.ceil(duracion / 5)];
const ocupar = (mapa, [k, n]) => mapa.slice(0, k) + 'c'.repeat(n) + mapa.slice(k + n);
const liberar = (mapa, [k, n]) => mapa.slice(0, k) + mapa.slice(k, k + n).replace(/c/g, '0') + mapa.slice(k + n);
const LETRAS = { '': 'X', Descanso: 'D', Almuerzo: 'A', Permiso: 'P', Vacaciones: 'V', Otro: 'O' };
const rutaDia = (barbero, dia) => `ocupacion/${barbero}_${dia}`;
const leerDia = async (f, barbero, dia) => (await getDoc(doc(f, rutaDia(barbero, dia)))).data();

const DIA = enDias(2);
const DIA2 = enDias(3);

// ---------------------------------------------------------------------------
// Estado inicial (sin reglas)
// ---------------------------------------------------------------------------
const SERVICIOS = {
  S1: { nombre: 'Corte', precio: 57000, duracionMinutos: 60 },
  S2: { nombre: 'Color', precio: 300000, duracionMinutos: 300 }, // 5 horas
  S3: { nombre: 'Barba', precio: 20000 }, // sin duración: la app usa un turno (40 min)
  S4: { nombre: 'Rápido', precio: 30000, duracionMinutos: 40 }, // un turno
  S5: { nombre: 'Premium', precio: 60000, duracionMinutos: 90 },
  S6: { nombre: 'Completo', precio: 150000, duracionMinutos: 140 },
  S7: { nombre: 'Doble', precio: 50000, duracionMinutos: 80 },
  S8: { nombre: 'Largo', precio: 90000, duracionMinutos: 160 },
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
  // Los días de agenda de cada barbero, vacíos (los preparan el panel del admin y la Cloud Function): de hace 3 días a 35
  // días adelante, y los días 45 y 90 para las pruebas de fechas lejanas.
  for (const b of ['B1', 'B2', 'B3']) {
    for (const n of [...Array.from({ length: 39 }, (_, i) => i - 3), 45, 90]) {
      const dia = enDias(n);
      await setDoc(doc(f, rutaDia(b, dia)), { barberoId: b, dia, mapa: CEROS, citas: {}, op: { tipo: 'prepara' } });
    }
  }
});

/**
 * Lo mismo que hace CitasService.reservar: la cita, su rato en el mapa del día de su barbero y su cupo, juntos.
 * Para los ataques: `tramoMapa` (el tramo que se anota), `mapa(actual, tramo)` (cómo queda el mapa), `agendaDe`
 * (el barbero cuya agenda se toca), `conAgenda`, `conCupo` y `sin` (campos que se le quitan a la cita).
 */
async function reservar(f, citaId, uid, {
  inicio = 600, servicio = 'S1', barbero = 'B1', dia = DIA, extra = {}, cupo = 1, conCupo = true, conAgenda = true, tramoMapa, mapa, agendaDe, sin = [],
} = {}) {
  const s = SERVICIOS[servicio] ?? { nombre: 'X', precio: 1, duracionMinutos: TURNO };
  const duracion = s.duracionMinutos > 0 ? s.duracionMinutos : TURNO;
  const cupoId = `${uid}_${dia}_${cupo}`;
  const cita = {
    userId: uid, userName: 'Cliente', userEmail: CUENTAS[uid] ?? '', phone: '3001234567',
    servicioId: servicio, serviceName: s.nombre, precio: s.precio, duracionMinutos: duracion,
    barberoId: barbero, barberoNombre: 'Luis', dia, hora: horaDe(inicio), horaStr: '10:00 AM',
    fecha: `${dia}T15:00:00.000Z`, estado: 'pendiente', creadoEn: new Date().toISOString(), cupoId, ...extra,
  };
  for (const campo of sin) delete cita[campo];
  const b = writeBatch(f);
  b.set(doc(f, `citas/${citaId}`), cita);
  const deQuien = agendaDe ?? barbero;
  const actual = conAgenda ? await leerDia(f, deQuien, dia) : null;
  if (actual) {
    const t = tramoMapa ?? tramo(inicio, cita.duracionMinutos);
    b.update(doc(f, rutaDia(deQuien, dia)), { mapa: mapa ? mapa(actual.mapa, t) : ocupar(actual.mapa, t), [`citas.${citaId}`]: t, op: { tipo: 'citas', ocupa: citaId } });
  }
  if (conCupo) b.set(doc(f, `cupos/${extra.cupoId ?? cupoId}`), { userId: uid, dia, citaId });
  return b.commit();
}

/** Lo mismo que CitasService.cancelar: la cita queda cancelada y suelta su rato en la agenda (y su cupo). */
async function cancelar(f, citaId, { barbero = 'B1', dia = DIA, cupoId, mapa } = {}) {
  const actual = await leerDia(f, barbero, dia);
  const suyo = actual.citas[citaId];
  const b = writeBatch(f);
  b.update(doc(f, `citas/${citaId}`), { estado: 'cancelada' });
  b.update(doc(f, rutaDia(barbero, dia)), {
    mapa: mapa ? mapa(actual.mapa, suyo) : liberar(actual.mapa, suyo), [`citas.${citaId}`]: deleteField(), op: { tipo: 'citas', libera: citaId },
  });
  if (cupoId) b.delete(doc(f, `cupos/${cupoId}`));
  return b.commit();
}

/**
 * Lo mismo que CitasService.bloquear y desbloquear: cierra lo libre de un rato con el motivo (o vuelve a abrir lo
 * cerrado). `mapa(actual, desde, hasta)` cambia cómo queda, para los ataques.
 */
async function cerrarRato(f, barbero, dia, desdeMin, hastaMin, motivo = 'Almuerzo', { abrir = false, mapa } = {}) {
  const actual = await leerDia(f, barbero, dia);
  const desde = Math.floor(desdeMin / 5);
  const hasta = Math.ceil(hastaMin / 5);
  const rato = actual.mapa.slice(desde, hasta);
  const nuevo = actual.mapa.slice(0, desde) + (abrir ? rato.replace(/[DAPVOX]/g, '0') : rato.replace(/0/g, LETRAS[motivo] ?? 'X')) + actual.mapa.slice(hasta);
  return updateDoc(doc(f, rutaDia(barbero, dia)), {
    mapa: mapa ? mapa(actual.mapa, desde, hasta) : nuevo,
    op: abrir ? { tipo: 'abre', desde, hasta } : { tipo: 'cierra', desde, hasta, motivo },
  });
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
await caso('cliente reserva un servicio de 60 min (la cita, su rato en la agenda y su cupo)', () => assertSucceeds(reservar(db('ana'), 'C1', 'ana')));
await caso('ATAQUE: doble reserva del mismo horario', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: 600 })));
await caso('ATAQUE: reservar 20 minutos después, encima de la cita que ya está (10:20)', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: 620 })));
await caso('ATAQUE: un turno que empieza antes y termina dentro de esa cita (9:40 a 10:20)', () => assertFails(reservar(db('beto'), nueva(), 'beto', { inicio: 580, servicio: 'S4' })));
await caso('ATAQUE: empezar 5 minutos antes de que termine la otra (10:55)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { inicio: 655, servicio: 'S4' })); });
await caso('el turno que empieza justo cuando termina la otra (11:00) sí pasa: sin tiempo muerto', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { inicio: 660, servicio: 'S4' })); });
await caso('servicio de 40 min (un turno)', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S4', ...turno() })); });
await caso('servicio de 90 min', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S5', ...turno() })); });
await caso('servicio de 2 h 20 min', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S6', barbero: 'B2', dia: DIA2, inicio: 600 })); });
await caso('servicio de 2 h 40 min: ya no hay tope de duración para reservar en línea', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S8', barbero: 'B2', dia: enDias(5), inicio: 600 })); });
await caso('servicio de 5 horas en línea', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S2', barbero: 'B2', dia: enDias(5), inicio: 900 })); });
await caso('servicio sin duración (un turno: 40 min)', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S3', ...turno() })); });
await caso('ATAQUE: servicio sin duración reservado como si durara 20 min', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), servicio: 'S3', extra: { duracionMinutos: 20 } })); });
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
await caso('ATAQUE: reservar sin nombre o con el nombre vacío (rompería los mensajes del panel)', async () => {
  const u = fresco();
  await assertFails(reservar(db(u), nueva(), u, { ...turno(), sin: ['userName'] }));
  await assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { userName: '' } }));
});
await caso('ATAQUE: un enlace en el campo del celular', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { phone: 'https://malo.co' } })); });
await caso('ATAQUE: decir que dura menos para ocupar menos (20 de sus 60 min)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { duracionMinutos: 20 } })); });
await caso('ATAQUE: anotar en la agenda un rato más corto que la cita (20 de sus 60 min)', () => {
  const u = fresco(); const tu = turno();
  return assertFails(reservar(db(u), nueva(), u, { ...tu, tramoMapa: tramo(tu.inicio, 20) }));
});
await caso('ATAQUE: anotar la cita en la agenda sin marcar su rato (quedaría reservable)', () => {
  const u = fresco();
  return assertFails(reservar(db(u), nueva(), u, { ...turno(), mapa: actual => actual }));
});
await caso('ATAQUE: marcar su rato y de paso borrar las demás citas del día (las dejaría reservables)', () => {
  const u = fresco();
  return assertFails(reservar(db(u), nueva(), u, { inicio: 900, servicio: 'S4', mapa: (_, t) => ocupar(CEROS, t) }));
});
await caso('ATAQUE: reservar sin apartar el rato en la agenda', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), conAgenda: false })); });
await caso('ATAQUE: apartar el rato en la agenda de otro barbero', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), agendaDe: 'B2' })); });
await caso('ATAQUE: reservar a las 10:03 (fuera de la rejilla de 5 minutos)', () => {
  const u = fresco(); const tu = turno();
  return assertFails(reservar(db(u), nueva(), u, { ...tu, inicio: tu.inicio + 3 }));
});
await caso('reservar a cualquier hora de 5 en 5 (10:25)', () => {
  const u = fresco(); const tu = turno();
  return assertSucceeds(reservar(db(u), nueva(), u, { ...tu, inicio: tu.inicio + 25, servicio: 'S4' }));
});
await caso('ATAQUE: servicio que no existe', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), servicio: 'NOEXISTE' })); });
await caso('ATAQUE: barbero que no existe', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), barbero: 'FANTASMA' })); });
await caso('ATAQUE: "cualquiera" como barbero (no tiene agenda)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), barbero: 'cualquiera' })); });
await caso('ATAQUE: crear la cita ya completada', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { estado: 'completada' } })); });
await caso('ATAQUE: crear la cita con valor cobrado (precioFinal)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { precioFinal: 0 } })); });
await caso('ATAQUE: crear la cita con campos inventados', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { esVip: true } })); });
await caso('ATAQUE: la hora de la cita no corresponde al rato que apartó', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { hora: '06:00' } })); });
await caso('ATAQUE: día con formato inválido', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { inicio: 600, dia: '2/10/2026' })); });
await caso('ATAQUE: reservar en una fecha que ya pasó', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { inicio: 600, dia: enDias(-3) })); });
await caso('ATAQUE: reservar para dentro de un año (llenar la agenda futura)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { inicio: 600, dia: enDias(365) })); });
await caso('ATAQUE: un cliente crea el día de un barbero (para empezar con el mapa vacío)', () =>
  assertFails(setDoc(doc(db('beto'), rutaDia('B1', enDias(40))), { barberoId: 'B1', dia: enDias(40), mapa: CEROS, citas: {}, op: { tipo: 'citas' } })));
await caso('ATAQUE: un cliente deja vacío el mapa de un día (soltaría las citas de todos)', () =>
  assertFails(updateDoc(doc(db('beto'), rutaDia('B1', DIA)), { mapa: CEROS, citas: {}, op: { tipo: 'citas', libera: 'C1' } })));
await caso('ATAQUE: escribir en la agenda vieja (slots)', () =>
  assertFails(setDoc(doc(db('beto'), `slots/B1_${DIA}_1500`), { barberoId: 'B1', dia: DIA, hora: '15:00', citaId: 'C1' })));
await caso('ATAQUE: visitante sin sesión reserva', () => assertFails(reservar(anon(), nueva(), 'beto', { ...turno() })));

console.log('\nreservas: días que abren a horas distintas (turnos desde las 9:20 o desde las 9:00)');
// Las reglas no saben a qué hora abre cada día: lo que impide la doble reserva es el mapa del día.
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
await caso('ATAQUE: cita sin el campo del cupo', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), conCupo: false, sin: ['cupoId'] })); });
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
  assertSucceeds(getDocs(query(collection(anon(), 'ocupacion'), where('dia', '==', DIA)))));
await caso('cliente lee disponibilidad y sus citas', async () => {
  await assertSucceeds(getDocs(query(collection(db('beto'), 'ocupacion'), where('dia', '==', DIA))));
  await assertSucceeds(getDocs(query(collection(db('ana'), 'citas'), where('userId', '==', 'ana'))));
});
await caso('la disponibilidad no trae datos personales', async () => {
  const r = await getDocs(query(collection(anon(), 'ocupacion'), where('dia', '==', DIA)));
  for (const d of r.docs) for (const k of Object.keys(d.data())) if (!['barberoId', 'dia', 'mapa', 'citas', 'op'].includes(k)) throw new Error(`campo inesperado: ${k}`);
});
await caso('ATAQUE: visitante lee las citas', () => assertFails(getDocs(collection(anon(), 'citas'))));
await caso('ATAQUE: cliente lista todas las citas (datos personales)', () => assertFails(getDocs(collection(db('beto'), 'citas'))));
await caso('ATAQUE: cliente lee la cita de otro', () => assertFails(getDoc(doc(db('beto'), 'citas/C1'))));
await caso('ATAQUE: cliente consulta citas de otro con filtro', () => assertFails(getDocs(query(collection(db('beto'), 'citas'), where('userId', '==', 'ana')))));
await caso('ATAQUE: cliente cambia el precio de su cita', () => assertFails(updateDoc(doc(db('ana'), 'citas/C1'), { precio: 1 })));
await caso('ATAQUE: cliente marca su cita como completada', () => assertFails(updateDoc(doc(db('ana'), 'citas/C1'), { estado: 'completada' })));
await caso('ATAQUE: cliente mueve su cita a otra hora sin pasar por la agenda', () => assertFails(updateDoc(doc(db('ana'), 'citas/C1'), { hora: '18:00' })));
await caso('ATAQUE: cliente borra su cita', () => assertFails(deleteDoc(doc(db('ana'), 'citas/C1'))));
await caso('ATAQUE: cliente suelta el rato de su cita sin cancelarla', async () => {
  const actual = await leerDia(db('ana'), 'B1', DIA);
  await assertFails(updateDoc(doc(db('ana'), rutaDia('B1', DIA)), { mapa: liberar(actual.mapa, actual.citas.C1), 'citas.C1': deleteField(), op: { tipo: 'citas', libera: 'C1' } }));
});
await caso('ATAQUE: otro cliente cancela una cita ajena', () => assertFails(updateDoc(doc(db('beto'), 'citas/C1'), { estado: 'cancelada' })));
await caso('ATAQUE: cancelar su cita sin soltar su rato (lo dejaría ocupado para siempre: horas fantasma)', () =>
  assertFails(updateDoc(doc(db('ana'), 'citas/C1'), { estado: 'cancelada' })));
await caso('ATAQUE: otro cliente suelta el rato de una cita ajena (cancelándola)', () => assertFails(cancelar(db('beto'), 'C1')));
await caso('ATAQUE: al cancelar la suya, soltar también la cita de al lado (quedaría reservable)', () =>
  assertFails(cancelar(db('ana'), 'C1', { cupoId: `ana_${DIA}_1`, mapa: actual => actual.replace(/c/g, '0') })));
await caso('cliente cancela su cita y suelta su rato y su cupo', () => assertSucceeds(cancelar(db('ana'), 'C1', { cupoId: `ana_${DIA}_1` })));
await caso('ATAQUE: cliente reactiva una cita cancelada', () => assertFails(updateDoc(doc(db('ana'), 'citas/C1'), { estado: 'pendiente' })));
await caso('tras cancelar, otro cliente reserva ese horario', () => assertSucceeds(reservar(db('beto'), 'C6', 'beto')));
await caso('y quien canceló puede volver a reservar ese día (su cupo quedó libre)', () => assertSucceeds(reservar(db('ana'), 'C1b', 'ana', { inicio: 900 })));

console.log('\nreagendar (el cliente cambia su cita de horario)');
/** Lo mismo que CitasService.reagendar: cancela la anterior (soltando su rato) y crea la nueva, en una escritura. */
async function reagendar(f, uid, anterior, nuevaId, { dia, inicio, barbero = 'B1', cupoNuevo, servicio = 'S1', extra = {} }) {
  const s = SERVICIOS[servicio];
  const t = tramo(inicio, s.duracionMinutos);
  const viejo = await leerDia(f, anterior.barbero, anterior.dia);
  const suyo = viejo.citas[anterior.id] ?? [0, 0];
  const b = writeBatch(f);
  b.update(doc(f, `citas/${anterior.id}`), { estado: 'cancelada', reemplazadaPor: nuevaId });
  b.set(doc(f, `citas/${nuevaId}`), {
    userId: uid, userName: 'Cliente', userEmail: '', phone: '3001234567', servicioId: servicio, serviceName: s.nombre, precio: s.precio, duracionMinutos: s.duracionMinutos,
    barberoId: barbero, barberoNombre: 'Luis', dia, hora: horaDe(inicio), horaStr: 'x', fecha: 'x', estado: 'pendiente', creadoEn: 'x',
    cupoId: cupoNuevo, reemplazaA: anterior.id, ...extra,
  });
  if (anterior.barbero === barbero && anterior.dia === dia) {
    b.update(doc(f, rutaDia(barbero, dia)), {
      mapa: ocupar(liberar(viejo.mapa, suyo), t), [`citas.${anterior.id}`]: deleteField(), [`citas.${nuevaId}`]: t,
      op: { tipo: 'citas', libera: anterior.id, ocupa: nuevaId },
    });
  } else {
    const nuevo = await leerDia(f, barbero, dia);
    b.update(doc(f, rutaDia(anterior.barbero, anterior.dia)), { mapa: liberar(viejo.mapa, suyo), [`citas.${anterior.id}`]: deleteField(), op: { tipo: 'citas', libera: anterior.id } });
    b.update(doc(f, rutaDia(barbero, dia)), { mapa: ocupar(nuevo.mapa, t), [`citas.${nuevaId}`]: t, op: { tipo: 'citas', ocupa: nuevaId } });
  }
  b.delete(doc(f, `cupos/${anterior.cupoId}`));
  b.set(doc(f, `cupos/${cupoNuevo}`), { userId: uid, dia, citaId: nuevaId });
  return b.commit();
}
const RD = enDias(3); // día de las pruebas de reagendar (barbero B2, tarde: lejos de los otros casos)
await caso('cliente cambia su cita a otro día', async () => {
  await reservar(db('rea1'), 'R1', 'rea1', { barbero: 'B2', dia: RD, inicio: 1020 });
  const otro = enDias(6);
  await assertSucceeds(reagendar(db('rea1'), 'rea1', { id: 'R1', barbero: 'B2', dia: RD, cupoId: `rea1_${RD}_1` }, 'R1n', { barbero: 'B2', dia: otro, inicio: 1020, cupoNuevo: `rea1_${otro}_1` }));
});
await caso('el horario anterior queda libre para otra persona', () => assertSucceeds(reservar(db('rea9'), nueva(), 'rea9', { barbero: 'B2', dia: RD, inicio: 1020 })));
await caso('cliente corre su cita 40 minutos el mismo día (se cruza con la anterior)', async () => {
  await reservar(db('rea2'), 'R2', 'rea2', { barbero: 'B2', dia: RD, inicio: 1140 });
  await assertSucceeds(reagendar(db('rea2'), 'rea2', { id: 'R2', barbero: 'B2', dia: RD, cupoId: `rea2_${RD}_1` }, 'R2n', { barbero: 'B2', dia: RD, inicio: 1180, cupoNuevo: `rea2_${RD}_2` }));
});
await caso('cliente cambia de horario un servicio de 90 min (ya no hay tope de duración)', async () => {
  const dia = enDias(11);
  await reservar(db('rea5'), 'R5', 'rea5', { barbero: 'B2', dia, inicio: 600, servicio: 'S5' });
  await assertSucceeds(reagendar(db('rea5'), 'rea5', { id: 'R5', barbero: 'B2', dia, cupoId: `rea5_${dia}_1` }, 'R5n', { barbero: 'B2', dia, inicio: 640, servicio: 'S5', cupoNuevo: `rea5_${dia}_2` }));
});
await caso('ATAQUE: quedarse con el rato de la cita de OTRO diciendo que la reagenda', async () => {
  await reservar(db('rea3'), 'R3', 'rea3', { barbero: 'B2', dia: RD, inicio: 1260 });
  await assertFails(reagendar(db('malo'), 'malo', { id: 'R3', barbero: 'B2', dia: RD, cupoId: `rea3_${RD}_1` }, 'R3n', { barbero: 'B2', dia: RD, inicio: 1260, cupoNuevo: `malo_${RD}_1` }));
});
await caso('ATAQUE: reagendar a un horario ocupado', async () => {
  await reservar(db('rea4'), 'R4', 'rea4', { barbero: 'B2', dia: enDias(7), inicio: 600 });
  await assertFails(reagendar(db('rea4'), 'rea4', { id: 'R4', barbero: 'B2', dia: enDias(7), cupoId: `rea4_${enDias(7)}_1` }, 'R4n', { barbero: 'B2', dia: RD, inicio: 1260, cupoNuevo: `rea4_${RD}_1` }));
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
await caso('por periodos: servicio de 2 h 20 min', () => { const u = fresco(); return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S6', barbero: 'B2', dia: enDias(26), inicio: 600 })); });
await caso('ATAQUE: reservar antes de que empiece el periodo (aunque sea esta semana)', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(5), inicio: 1320 })); });
await caso('ATAQUE: reservar el día siguiente al último del periodo', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(31), inicio: 600 })); });
await caso('ATAQUE: cupo de un día abierto para una cita de un día cerrado', () => {
  const u = fresco();
  return assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(31), inicio: 600, extra: { cupoId: `${u}_${P2}_1` } }));
});
await caso('por periodos: el cliente cambia su cita a otro día del periodo', async () => {
  await reservar(db('age1'), 'AG1', 'age1', { barbero: 'B2', dia: enDias(21), inicio: 600 });
  await assertSucceeds(reagendar(db('age1'), 'age1', { id: 'AG1', barbero: 'B2', dia: enDias(21), cupoId: `age1_${enDias(21)}_1` }, 'AG1n', { barbero: 'B2', dia: enDias(22), inicio: 600, cupoNuevo: `age1_${enDias(22)}_1` }));
});
await caso('ATAQUE: cambiar la cita a un día fuera del periodo', async () => {
  await reservar(db('age2'), 'AG2', 'age2', { barbero: 'B2', dia: enDias(23), inicio: 600 });
  await assertFails(reagendar(db('age2'), 'age2', { id: 'AG2', barbero: 'B2', dia: enDias(23), cupoId: `age2_${enDias(23)}_1` }, 'AG2n', { barbero: 'B2', dia: enDias(31), inicio: 600, cupoNuevo: `age2_${enDias(31)}_1` }));
});
await caso('el cliente cancela aunque la agenda ya esté cerrada', async () => {
  await reservar(db('age3'), 'AG3', 'age3', { barbero: 'B2', dia: enDias(24), inicio: 600 });
  await ponerAgenda({ modo: 'periodo', desde: enDias(-20), hasta: enDias(-1) });
  await assertSucceeds(cancelar(db('age3'), 'AG3', { barbero: 'B2', dia: enDias(24), cupoId: `age3_${enDias(24)}_1` }));
});
await caso('periodo que ya terminó: la agenda queda cerrada para todos', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { barbero: 'B2', dia: enDias(2), inicio: 1320 })); });
await caso('con la agenda cerrada, el admin sí registra una cita (la que le piden por teléfono)', () =>
  assertSucceeds(setDoc(doc(db('admin'), 'citas/ADMAG'), { userId: 'admin', userName: 'Por teléfono', servicioId: 'S1', serviceName: 'Corte', precio: 57000, duracionMinutos: 60,
    barberoId: 'B2', dia: enDias(2), hora: '22:00', estado: 'confirmada' })));
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
await caso('barbero cancela su cita y suelta su rato en la agenda y el cupo', async () => {
  await reservar(db('bar1'), 'C8', 'bar1', { inicio: 900, dia: DIA2 });
  await assertSucceeds(cancelar(db('luis'), 'C8', { dia: DIA2, cupoId: `bar1_${DIA2}_1` }));
});
await caso('ATAQUE: el barbero cancela una cita sin soltar su rato', async () => {
  await reservar(db('bar3'), 'C10', 'bar3', { inicio: 1140, dia: DIA2 });
  await assertFails(updateDoc(doc(db('luis'), 'citas/C10'), { estado: 'cancelada' }));
  await assertSucceeds(updateDoc(doc(db('luis'), 'citas/C10'), { estado: 'no-asistio' })); // marcar "no asistió" no suelta nada
});
await caso('ATAQUE: otro barbero suelta el rato de una cita de Luis', async () => {
  await reservar(db('bar2'), 'C9', 'bar2', { inicio: 1020, dia: DIA2 });
  await assertFails(cancelar(db('pedro'), 'C9', { dia: DIA2 }));
});

console.log('\ncierres de agenda (el barbero cierra horas)');
const BD = enDias(8);
await caso('barbero cierra una hora de su propia agenda (almuerzo)', () => assertSucceeds(cerrarRato(db('luis'), 'B1', BD, 780, 840, 'Almuerzo')));
await caso('barbero cierra el día entero (de 9:20 a 7:40) de una vez', () => assertSucceeds(cerrarRato(db('pedro'), 'B2', enDias(9), 560, 1180, 'Vacaciones')));
await caso('ATAQUE: reservar en una hora que el barbero cerró', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { dia: BD, inicio: 780 })); });
await caso('ATAQUE: reservar una hora que termina dentro del rato cerrado', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { dia: BD, inicio: 740 })); });
await caso('ATAQUE: barbero cierra la agenda de OTRO barbero', () => assertFails(cerrarRato(db('luis'), 'B2', BD, 780, 840, '')));
await caso('ATAQUE: cliente cierra la agenda de un barbero', () => assertFails(cerrarRato(db('ana'), 'B1', BD, 900, 960, '')));
await caso('ATAQUE: visitante cierra la agenda de un barbero', () => assertFails(cerrarRato(anon(), 'B1', BD, 900, 960, '')));
await caso('ATAQUE: cuenta sin verificar con el correo del barbero cierra su agenda', () => assertFails(cerrarRato(db('falso', { email_verified: false }), 'B1', BD, 900, 960, '')));
await caso('ATAQUE: barbero cierra encima de una cita agendada (la borraría de la agenda)', () =>
  assertFails(cerrarRato(db('luis'), 'B1', DIA, 600, 660, '', { mapa: (m, desde, hasta) => m.slice(0, desde) + 'X'.repeat(hasta - desde) + m.slice(hasta) })));
await caso('ATAQUE: texto libre en el motivo (lo vería cualquiera)', () => assertFails(cerrarRato(db('luis'), 'B1', BD, 960, 1000, 'Cita con el médico Dr. X')));
await caso('ATAQUE: cerrar la agenda de dentro de 90 días', () => assertFails(cerrarRato(db('luis'), 'B1', enDias(90), 600, 660, '')));
await caso('ATAQUE: cerrar con una letra que no es de ningún motivo', () =>
  assertFails(cerrarRato(db('luis'), 'B1', BD, 960, 1000, '', { mapa: (m, desde, hasta) => m.slice(0, desde) + 'Z'.repeat(hasta - desde) + m.slice(hasta) })));
await caso('ATAQUE: otro barbero vuelve a abrir un horario que no cerró él', () => assertFails(cerrarRato(db('pedro'), 'B1', BD, 780, 840, '', { abrir: true })));
await caso('ATAQUE: cliente vuelve a abrir un horario cerrado', () => assertFails(cerrarRato(db('ana'), 'B1', BD, 780, 840, '', { abrir: true })));
await caso('ATAQUE: al "abrir", soltar también una cita', () =>
  assertFails(cerrarRato(db('luis'), 'B1', DIA, 600, 660, '', { abrir: true, mapa: (m, desde, hasta) => m.slice(0, desde) + '0'.repeat(hasta - desde) + m.slice(hasta) })));
await caso('barbero vuelve a abrir su horario', () => assertSucceeds(cerrarRato(db('luis'), 'B1', BD, 780, 840, '', { abrir: true })));
await caso('admin cierra y abre la agenda de cualquier barbero', async () => {
  await assertSucceeds(cerrarRato(db('admin'), 'B2', BD, 900, 960, 'Permiso'));
  await assertSucceeds(cerrarRato(db('admin'), 'B2', BD, 900, 960, '', { abrir: true }));
});

// ---------------------------------------------------------------------------
seccion('admin');
await caso('admin registra una cita de un cliente sin cuenta (walk-in)', () =>
  assertSucceeds(setDoc(doc(db('admin'), 'citas/W1'), { userId: 'admin', userName: 'Walk-in', userEmail: '', estado: 'completada', precio: 30000, barberoId: 'B1', dia: '2026-09-30' })));
await caso('admin mueve una cita y su rato en la agenda', async () => {
  await reservar(db('adm1'), 'C7', 'adm1', { inicio: 1080, dia: DIA2 });
  const f = db('admin');
  const actual = await leerDia(f, 'B1', DIA2);
  const b = writeBatch(f);
  // De 6:00 a 6:20 p. m.
  b.update(doc(f, rutaDia('B1', DIA2)), { mapa: ocupar(liberar(actual.mapa, actual.citas.C7), tramo(1100, 60)), 'citas.C7': tramo(1100, 60), op: { tipo: 'admin' } });
  b.update(doc(f, 'citas/C7'), { hora: '18:20', horaStr: '6:20 PM' });
  await assertSucceeds(b.commit());
});
await caso('ATAQUE: ni el admin guarda un mapa mal hecho (de otro largo o con letras raras)', async () => {
  await assertFails(updateDoc(doc(db('admin'), rutaDia('B1', DIA2)), { mapa: '0'.repeat(100), op: { tipo: 'admin' } }));
  await assertFails(updateDoc(doc(db('admin'), rutaDia('B1', DIA2)), { mapa: 'z'.repeat(288), op: { tipo: 'admin' } }));
});
await caso('admin prepara un día que faltaba (lo que hace el panel al abrirse)', () =>
  assertSucceeds(setDoc(doc(db('admin'), rutaDia('B1', enDias(40))), { barberoId: 'B1', dia: enDias(40), mapa: CEROS, citas: {}, op: { tipo: 'prepara' } })));
await caso('ATAQUE: ni el admin crea un día de agenda para "cualquiera" (abriría reservas sin barbero)', () =>
  assertFails(setDoc(doc(db('admin'), rutaDia('cualquiera', enDias(40))), { barberoId: 'cualquiera', dia: enDias(40), mapa: CEROS, citas: {}, op: { tipo: 'prepara' } })));
await caso('ATAQUE: un barbero prepara (crea) un día de agenda', () =>
  assertFails(setDoc(doc(db('luis'), rutaDia('B1', enDias(41))), { barberoId: 'B1', dia: enDias(41), mapa: CEROS, citas: {}, op: { tipo: 'prepara' } })));
/** Lo mismo que hace CitasService.registrarDesdePanel: la cita (de ninguna cuenta) y su rato en la agenda, sin cupo. */
async function registrarEnPanel(f, citaId, { inicio, servicio = 'S1', barbero = 'B1', dia, duracion }) {
  const s = SERVICIOS[servicio];
  const minutos = duracion ?? s.duracionMinutos;
  const t = tramo(inicio, minutos);
  const actual = await leerDia(f, barbero, dia);
  const b = writeBatch(f);
  b.set(doc(f, `citas/${citaId}`), {
    userId: '', userName: 'Por WhatsApp', userEmail: '', phone: '3001234567',
    servicioId: servicio, serviceName: s.nombre, precio: s.precio, duracionMinutos: minutos,
    barberoId: barbero, barberoNombre: 'Luis', dia, hora: horaDe(inicio), horaStr: 'x',
    fecha: `${dia}T15:00:00.000Z`, estado: 'pendiente', creadoEn: new Date().toISOString(),
  });
  b.update(doc(f, rutaDia(barbero, dia)), { mapa: ocupar(actual.mapa, t), [`citas.${citaId}`]: t, op: { tipo: 'admin' } });
  return b.commit();
}
const PANEL = enDias(20);
await caso('admin agenda desde el panel una cita sin cuenta ni cupo, con su rato en la agenda', () =>
  assertSucceeds(registrarEnPanel(db('admin'), 'PAN1', { inicio: 600, servicio: 'S5', dia: PANEL })));
await caso('admin agenda desde el panel un servicio largo (2 h 20 min)', () =>
  assertSucceeds(registrarEnPanel(db('admin'), 'PAN2', { inicio: 840, servicio: 'S6', dia: PANEL })));
await caso('admin agenda desde el panel con otra duración (el Corte de 60 min en 25) y aparta solo ese rato', () =>
  assertSucceeds(registrarEnPanel(db('admin'), 'PAN5', { inicio: 1200, dia: PANEL, duracion: 25 })));
await caso('ATAQUE: un cliente no agenda como si fuera el panel (sin cuenta ni cupo)', () =>
  assertFails(registrarEnPanel(db('ana'), 'PAN4', { inicio: 1080, servicio: 'S4', dia: PANEL })));
await caso('el barbero ve, completa y cancela una cita del panel y suelta su rato', async () => {
  await assertSucceeds(getDoc(doc(db('luis'), 'citas/PAN1')));
  await assertSucceeds(updateDoc(doc(db('luis'), 'citas/PAN2'), { estado: 'completada', precioFinal: 150000 }));
  await assertSucceeds(cancelar(db('luis'), 'PAN1', { dia: PANEL }));
});
await caso('admin elimina una cita con su rato y su cupo', async () => {
  const f = db('admin');
  const actual = await leerDia(f, 'B1', DIA2);
  const b = writeBatch(f);
  b.update(doc(f, rutaDia('B1', DIA2)), { mapa: liberar(actual.mapa, actual.citas.C7), 'citas.C7': deleteField(), op: { tipo: 'admin' } });
  b.delete(doc(f, `cupos/adm1_${DIA2}_1`));
  b.delete(doc(f, 'citas/C7'));
  await assertSucceeds(b.commit());
});
await caso('admin borra bloques de la agenda vieja', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), `slots/B1_${DIA}_0900`), { barberoId: 'B1', dia: DIA, hora: '09:00', citaId: 'VIEJA' }));
  await assertSucceeds(deleteDoc(doc(db('admin'), `slots/B1_${DIA}_0900`)));
});

// ---------------------------------------------------------------------------
seccion('el barbero se agenda citas desde su panel (también después del cierre)');
// Como las del admin (sin cuenta ni cupo), marcadas origen: 'barbero', sin correo del cliente, solo con su perfil y
// terminando a más tardar a las 10:00 p. m. Se arma igual que la página (CitasService.registrarDelBarbero).
async function agendaDelBarbero(f, citaId, { inicio, servicio = 'S1', barbero = 'B1', dia, duracion, extra = {}, sin = [], op } = {}) {
  const s = SERVICIOS[servicio];
  const minutos = duracion ?? s.duracionMinutos;
  const t = tramo(inicio, minutos);
  const actual = await leerDia(f, barbero, dia);
  const cita = {
    userId: '', userName: 'Por WhatsApp', userEmail: '', phone: '3001234567',
    servicioId: servicio, serviceName: s.nombre, precio: s.precio, duracionMinutos: minutos,
    barberoId: barbero, barberoNombre: 'Luis', dia, hora: horaDe(inicio), horaStr: 'x',
    fecha: `${dia}T15:00:00.000Z`, estado: 'pendiente', creadoEn: new Date().toISOString(), origen: 'barbero', ...extra,
  };
  for (const campo of sin) delete cita[campo];
  const b = writeBatch(f);
  b.set(doc(f, `citas/${citaId}`), cita);
  b.update(doc(f, rutaDia(barbero, dia)), { mapa: ocupar(actual.mapa, t), [`citas.${citaId}`]: t, op: op ?? { tipo: 'citas', ocupa: citaId } });
  return b.commit();
}
const NOCHE = enDias(21);
const cambiarB1 = datos => env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'barberos/B1'), datos));
await caso('el barbero se agenda una cita suya desde el panel después del cierre (8:00 p. m.)', () =>
  assertSucceeds(agendaDelBarbero(db('luis'), 'BAR1', { inicio: 1200, dia: NOCHE })));
await caso('y otra que termina justo a las 10:00 p. m.', () =>
  assertSucceeds(agendaDelBarbero(db('luis'), 'BAR2', { inicio: 1260, dia: NOCHE })));
await caso('ATAQUE: el barbero agenda una que termina después de las 10:00 p. m.', () =>
  assertFails(agendaDelBarbero(db('luis'), 'BAR3', { inicio: 1320, dia: NOCHE })));
await caso('ATAQUE: el barbero agenda en la agenda de otro barbero', () =>
  assertFails(agendaDelBarbero(db('luis'), 'BAR4', { inicio: 1200, barbero: 'B2', dia: NOCHE })));
await caso('ATAQUE: el barbero le pone el correo de alguien (le llegarían correos)', () =>
  assertFails(agendaDelBarbero(db('luis'), 'BAR5', { inicio: 600, dia: NOCHE, extra: { userEmail: 'victima@x.com' } })));
await caso('ATAQUE: el barbero agenda a nombre de una cuenta', () =>
  assertFails(agendaDelBarbero(db('luis'), 'BAR6', { inicio: 600, dia: NOCHE, extra: { userId: 'ana' } })));
await caso('ATAQUE: el barbero se inventa el precio (cuenta en sus ganancias)', () =>
  assertFails(agendaDelBarbero(db('luis'), 'BAR7', { inicio: 600, dia: NOCHE, extra: { precio: 1 } })));
await caso('ATAQUE: el barbero agenda sin la marca de origen', () =>
  assertFails(agendaDelBarbero(db('luis'), 'BAR8', { inicio: 600, dia: NOCHE, sin: ['origen'] })));
await caso('ATAQUE: el barbero aparta el rato como si fuera el admin', () =>
  assertFails(agendaDelBarbero(db('luis'), 'BAR9', { inicio: 600, dia: NOCHE, op: { tipo: 'admin' } })));
await caso('ATAQUE: un cliente se agenda como si fuera el barbero', () =>
  assertFails(agendaDelBarbero(db('ana'), 'BAR10', { inicio: 600, dia: NOCHE })));
await caso('ATAQUE: el barbero agenda en su descanso', async () => {
  await cambiarB1({ descanso: { desde: 780, hasta: 840 } });
  await assertFails(agendaDelBarbero(db('luis'), 'BAR11', { inicio: 780, servicio: 'S4', dia: NOCHE }));
  await cambiarB1({ descanso: deleteField() });
});
await caso('ATAQUE: el barbero agenda un servicio que tiene cerrado', async () => {
  await cambiarB1({ serviciosCerrados: ['S4'] });
  await assertFails(agendaDelBarbero(db('luis'), 'BAR12', { inicio: 900, servicio: 'S4', dia: NOCHE }));
  await cambiarB1({ serviciosCerrados: deleteField() });
});
// Duración elegida para ese cliente (de 5 en 5), como en las agendas recurrentes: el nombre y el precio, del catálogo.
await caso('el barbero se agenda una cita con otra duración (el Corte de 60 min en 25) y aparta justo ese rato', () =>
  assertSucceeds(agendaDelBarbero(db('luis'), 'BAR13', { inicio: 600, dia: NOCHE, duracion: 25 })));
await caso('y la siguiente entra justo cuando termina (10:25), sin tiempo muerto', () =>
  assertSucceeds(agendaDelBarbero(db('luis'), 'BAR14', { inicio: 625, servicio: 'S4', dia: NOCHE })));
await caso('también más larga que la del catálogo (1 h 35 min)', () =>
  assertSucceeds(agendaDelBarbero(db('luis'), 'BAR15', { inicio: 720, dia: NOCHE, duracion: 95 })));
await caso('ATAQUE: el barbero pone una duración que no va de 5 en 5 (32 min)', () =>
  assertFails(agendaDelBarbero(db('luis'), 'BAR16', { inicio: 900, dia: NOCHE, duracion: 32 })));
await caso('ATAQUE: el barbero cambia la duración y se inventa el precio', () =>
  assertFails(agendaDelBarbero(db('luis'), 'BAR17', { inicio: 900, dia: NOCHE, duracion: 25, extra: { precio: 1 } })));
await caso('ATAQUE: el barbero cambia la duración y le pone otro nombre al servicio', () =>
  assertFails(agendaDelBarbero(db('luis'), 'BAR18', { inicio: 900, dia: NOCHE, duracion: 25, extra: { serviceName: 'Corte VIP' } })));
await caso('ATAQUE: con una duración más larga, la cita pasa de las 10:00 p. m.', () =>
  assertFails(agendaDelBarbero(db('luis'), 'BAR19', { inicio: 1200, dia: enDias(22), duracion: 125 })));
await caso('pero sí termina justo a las 10:00 p. m. (2 h desde las 8:00)', () =>
  assertSucceeds(agendaDelBarbero(db('luis'), 'BAR20', { inicio: 1200, dia: enDias(22), duracion: 120 })));
await caso('ATAQUE: el barbero dice una duración y aparta menos rato en la agenda', async () => {
  const f = db('luis');
  const actual = await leerDia(f, 'B1', NOCHE);
  const s = SERVICIOS.S1;
  const b = writeBatch(f);
  b.set(doc(f, 'citas/BAR21'), {
    userId: '', userName: 'Por WhatsApp', userEmail: '', phone: '', servicioId: 'S1', serviceName: s.nombre, precio: s.precio,
    duracionMinutos: 45, barberoId: 'B1', barberoNombre: 'Luis', dia: NOCHE, hora: horaDe(960), horaStr: 'x',
    fecha: `${NOCHE}T15:00:00.000Z`, estado: 'pendiente', creadoEn: new Date().toISOString(), origen: 'barbero',
  });
  b.update(doc(f, rutaDia('B1', NOCHE)), { mapa: ocupar(actual.mapa, tramo(960, 25)), 'citas.BAR21': tramo(960, 25), op: { tipo: 'citas', ocupa: 'BAR21' } });
  await assertFails(b.commit());
});
await caso('el barbero cancela la cita que se agendó y suelta su rato', () =>
  assertSucceeds(cancelar(db('luis'), 'BAR1', { dia: NOCHE })));

// ---------------------------------------------------------------------------
seccion('servicios habilitados por barbero');
// Día 12 con Pedro (B2): fuera de los días que usa turno() y dentro de la agenda continua.
const HAB = enDias(12);
await caso('admin deja reservar con Pedro solo algunos servicios (cierra "Rápido")', () =>
  assertSucceeds(updateDoc(doc(db('admin'), 'barberos/B2'), { serviciosCerrados: ['S4'] })));
await caso('ATAQUE: el barbero se abre o se cierra servicios él mismo', () =>
  assertFails(updateDoc(doc(db('luis'), 'barberos/B1'), { serviciosCerrados: ['S1'] })));
await caso('ATAQUE: un cliente vuelve a abrir un servicio cerrado', () =>
  assertFails(updateDoc(doc(db('ana'), 'barberos/B2'), { serviciosCerrados: [] })));
await caso('ATAQUE: servicios cerrados que no son una lista', () =>
  assertFails(updateDoc(doc(db('admin'), 'barberos/B2'), { serviciosCerrados: 'S4' })));
await caso('ATAQUE: un cliente reserva con Pedro un servicio que no está habilitado (y uno habilitado sí pasa)', async () => {
  const u = fresco();
  await assertFails(reservar(db(u), nueva(), u, { servicio: 'S4', barbero: 'B2', dia: HAB, inicio: 1080 }));
  await assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S1', barbero: 'B2', dia: HAB, inicio: 840 }));
});
await caso('con servicios cerrados sigue pasando un servicio largo habilitado (2 h 20 min)', () => {
  const u = fresco();
  return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S6', barbero: 'B2', dia: HAB, inicio: 600 }));
});
await caso('el servicio cerrado sigue abierto con otro barbero', () => {
  const u = fresco();
  return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S4', barbero: 'B1', dia: HAB, inicio: 1080 }));
});
await caso('admin agenda desde el panel un servicio cerrado (él no tiene ese límite)', () =>
  assertSucceeds(registrarEnPanel(db('admin'), 'HAB1', { inicio: 1200, servicio: 'S4', barbero: 'B2', dia: HAB })));
await caso('al habilitarlo otra vez, el cliente lo reserva', async () => {
  await assertSucceeds(updateDoc(doc(db('admin'), 'barberos/B2'), { serviciosCerrados: [] }));
  const u = fresco();
  await assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S4', barbero: 'B2', dia: HAB, inicio: 1100 }));
});

// ---------------------------------------------------------------------------
seccion('servicios del día (el admin deja un día solo para algunos servicios)');
// Día 13: B2 está libre ese día y B1 solo tiene citas de 10:00 a 5:00 p. m. (las del cupo).
const LIM = enDias(13);
const limitarDia = (f, servicios) => setDoc(doc(f, 'ajustes/sitio'), { serviciosPorDia: { [LIM]: servicios } }, { merge: true });
await caso('admin deja el día solo para el Premium', () => assertSucceeds(limitarDia(db('admin'), ['S5'])));
await caso('ATAQUE: un cliente se abre el día para su servicio', () => assertFails(limitarDia(db('ana'), ['S4'])));
await caso('ATAQUE: un barbero cambia los servicios del día', () => assertFails(limitarDia(db('luis'), ['S4'])));
await caso('ATAQUE: servicios del día que no son una lista por día (dejarían a nadie reservar)', () =>
  assertFails(setDoc(doc(db('admin'), 'ajustes/sitio'), { serviciosPorDia: 'S5' }, { merge: true })));
await caso('ATAQUE: un cliente reserva ese día otro servicio (y el Premium sí pasa)', async () => {
  const u = fresco();
  await assertFails(reservar(db(u), nueva(), u, { servicio: 'S4', barbero: 'B2', dia: LIM, inicio: 600 }));
  await assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S5', barbero: 'B2', dia: LIM, inicio: 600 }));
});
await caso('ATAQUE: el límite vale con todos los barberos', () => {
  const u = fresco();
  return assertFails(reservar(db(u), nueva(), u, { servicio: 'S4', barbero: 'B1', dia: LIM, inicio: 1080 }));
});
await caso('ATAQUE: cambiar una cita a ese día con un servicio que no se reserva ese día (con el Premium sí)', async () => {
  const otro = enDias(11);
  await reservar(db('lim1'), 'LIM1', 'lim1', { servicio: 'S4', barbero: 'B2', dia: otro, inicio: 900 });
  const anterior = { id: 'LIM1', barbero: 'B2', dia: otro, cupoId: `lim1_${otro}_1` };
  await assertFails(reagendar(db('lim1'), 'lim1', anterior, 'LIM1n', { servicio: 'S4', barbero: 'B2', dia: LIM, inicio: 840, cupoNuevo: `lim1_${LIM}_1` }));
  await assertSucceeds(reagendar(db('lim1'), 'lim1', anterior, 'LIM1p', { servicio: 'S5', barbero: 'B2', dia: LIM, inicio: 840, cupoNuevo: `lim1_${LIM}_1` }));
});
await caso('el día siguiente (sin límite) se reserva cualquier servicio', () => {
  const u = fresco();
  return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S4', barbero: 'B2', dia: enDias(14), inicio: 1200 }));
});
await caso('admin agenda desde el panel otro servicio ese día (el límite es para lo que reservan en línea)', () =>
  assertSucceeds(registrarEnPanel(db('admin'), 'LIM2', { inicio: 1200, servicio: 'S4', barbero: 'B2', dia: LIM })));
await caso('el barbero también se agenda otro servicio ese día desde su panel', () =>
  assertSucceeds(agendaDelBarbero(db('luis'), 'LIM3', { inicio: 1200, servicio: 'S4', dia: LIM })));
await caso('con dos servicios permitidos pasa cualquiera de los dos', async () => {
  await assertSucceeds(limitarDia(db('admin'), ['S5', 'S4']));
  const u = fresco();
  await assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S4', barbero: 'B2', dia: LIM, inicio: 1000 }));
  await assertFails(reservar(db(u), nueva(), u, { servicio: 'S1', barbero: 'B2', dia: LIM, inicio: 1080, cupo: 2 }));
});
await caso('guardar el formulario de Ajustes (solo cursos, horario y agenda) no borra los días limitados', async () => {
  await assertSucceeds(setDoc(doc(db('admin'), 'ajustes/sitio'), { cursos: { activo: false, url: '' }, horario: { apertura: 560, cierre: 1180, diasCerrados: [0], cierres: [] }, agenda: CONTINUA, serviciosPorDia: {} },
    { mergeFields: ['cursos', 'horario', 'agenda'] }));
  const guardado = (await getDoc(doc(db('admin'), 'ajustes/sitio'))).data();
  if (guardado.serviciosPorDia?.[LIM]?.length !== 2) throw new Error('Se borraron los servicios del día');
});
await caso('al quitar el límite se reserva cualquier servicio otra vez', async () => {
  await assertSucceeds(setDoc(doc(db('admin'), 'ajustes/sitio'), { serviciosPorDia: { [LIM]: deleteField() } }, { merge: true }));
  const u = fresco();
  await assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S1', barbero: 'B2', dia: LIM, inicio: 1080 }));
});

// ---------------------------------------------------------------------------
seccion('multas por no asistir');
// Citas ya pasadas de Luis (B1): una de Beto (con cuenta) y otra que se agendó desde el panel.
const citaPasada = (id, extra = {}) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), `citas/${id}`), {
  userId: '', userName: 'Cliente', userEmail: '', phone: '3001234567', servicioId: 'S1', serviceName: 'Corte', precio: 57000, duracionMinutos: 60,
  barberoId: 'B1', barberoNombre: 'Luis', dia: enDias(-2), hora: '10:00', horaStr: '10:00 AM', fecha: 'x', estado: 'pendiente', creadoEn: 'x', ...extra,
}));
await citaPasada('MU1', { userId: 'beto' });
await citaPasada('MU2');
await caso('el barbero marca "No asistió" y le pone la multa', () => assertSucceeds(updateDoc(doc(db('luis'), 'citas/MU1'), { estado: 'no-asistio', multa: 10000 })));
await caso('ATAQUE: el cliente se quita la multa', () => assertFails(updateDoc(doc(db('beto'), 'citas/MU1'), { multa: deleteField() })));
await caso('ATAQUE: un barbero le pone multa a la cita de otro barbero', () => assertFails(updateDoc(doc(db('pedro'), 'citas/MU1'), { multa: 50000 })));
await caso('ATAQUE: multa negativa', () => assertFails(updateDoc(doc(db('luis'), 'citas/MU1'), { multa: -5000 })));
await caso('ATAQUE: multa de más de un millón', () => assertFails(updateDoc(doc(db('luis'), 'citas/MU1'), { multa: 1000001 })));
await caso('ATAQUE: multa que no es número', () => assertFails(updateDoc(doc(db('luis'), 'citas/MU1'), { multa: 'mucha' })));
await caso('ATAQUE: multa en una cita que sí se atendió', () => assertFails(updateDoc(doc(db('luis'), 'citas/MU2'), { estado: 'completada', precioFinal: 57000, multa: 10000 })));
await caso('el barbero perdona la multa', () => assertSucceeds(updateDoc(doc(db('luis'), 'citas/MU1'), { multa: deleteField() })));
await caso('en la visita siguiente el barbero anota la multa que le cobró', () =>
  assertSucceeds(updateDoc(doc(db('luis'), 'citas/MU2'), { estado: 'completada', precioFinal: 57000, multaCobrada: 10000 })));
await caso('ATAQUE: anotar una multa cobrada en una cita "No asistió"', () =>
  assertFails(updateDoc(doc(db('luis'), 'citas/MU1'), { estado: 'no-asistio', multaCobrada: 10000 })));
await caso('ATAQUE: multa cobrada negativa (para "deber" menos)', () => assertFails(updateDoc(doc(db('luis'), 'citas/MU2'), { multaCobrada: -10000 })));
await caso('ATAQUE: el cliente reserva con una multa ya cobrada', () => { const u = fresco(); return assertFails(reservar(db(u), nueva(), u, { ...turno(), extra: { multaCobrada: 99999 } })); });
await caso('el admin pone o cambia la multa', () => assertSucceeds(updateDoc(doc(db('admin'), 'citas/MU1'), { multa: 20000 })));

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
await caso('admin cambia la hora (a cualquier hora de 5 en 5) y la frecuencia', () =>
  assertSucceeds(updateDoc(doc(db('admin'), 'recurrencias/R1'), { hora: '18:05', frecuencia: 'quincenal', actualizadoEn: 'v2' })));
await caso('admin pausa la agenda', () => assertSucceeds(updateDoc(doc(db('admin'), 'recurrencias/R1'), { activa: false, actualizadoEn: 'v3' })));
await caso('admin pone cualquier duración de 5 en 5 (5, 25, 85 y 240 min) y la cambia a 35', async () => {
  for (const duracionMinutos of [5, 25, 85, 240]) {
    await assertSucceeds(setDoc(doc(db('admin'), `recurrencias/DUR${duracionMinutos}`), recurrencia({ duracionMinutos, hora: '09:20' })));
  }
  await assertSucceeds(updateDoc(doc(db('admin'), 'recurrencias/DUR25'), { duracionMinutos: 35, actualizadoEn: 'v2' }));
});
await caso('ATAQUE: un cambio sin actualizadoEn nuevo (la función no se enteraría)', () =>
  assertFails(updateDoc(doc(db('admin'), 'recurrencias/R1'), { hora: '19:00' })));
await caso('ATAQUE: ni el admin escribe lo que anota la función (hasta dónde va, qué omitió)', async () => {
  await assertFails(updateDoc(doc(db('admin'), 'recurrencias/R1'), { generadaHasta: enDias(300), actualizadoEn: 'v4' }));
  await assertFails(setDoc(doc(db('admin'), 'recurrencias/R2'), recurrencia({ procesadaEn: 'x' })));
});
for (const [nombre, extra] of [
  ['una hora fuera de la rejilla de 5 minutos (5:33)', { hora: '17:33' }],
  ['una duración que no va de 5 en 5 (22 min)', { duracionMinutos: 22 }],
  ['una duración con decimales (22,5 min)', { duracionMinutos: 22.5 }],
  ['una duración en texto', { duracionMinutos: '25' }],
  ['una duración de 0 min', { duracionMinutos: 0 }],
  ['una duración de más de 4 horas (245 min)', { duracionMinutos: 245 }],
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

console.log('\nagendas recurrentes del barbero (solo las suyas)');
await caso('el equipo ve las agendas recurrentes (como ve las citas)', () => assertSucceeds(getDocs(collection(db('luis'), 'recurrencias'))));
await caso('barbero crea una agenda recurrente suya', () => assertSucceeds(setDoc(doc(db('luis'), 'recurrencias/RL'), recurrencia({ barberoId: 'B1' }))));
await caso('barbero crea una después del cierre, que termina justo a las 10:00 p. m.', () =>
  assertSucceeds(setDoc(doc(db('luis'), 'recurrencias/RLnoche'), recurrencia({ barberoId: 'B1', hora: '21:00' }))));
await caso('ATAQUE: barbero crea o mueve una que termina después de las 10:00 p. m.', async () => {
  await assertFails(setDoc(doc(db('luis'), 'recurrencias/RLtarde'), recurrencia({ barberoId: 'B1', hora: '21:05' })));
  await assertFails(updateDoc(doc(db('luis'), 'recurrencias/RLnoche'), { hora: '21:30', actualizadoEn: 'v2' }));
});
await caso('barbero edita y pausa la suya', async () => {
  await assertSucceeds(updateDoc(doc(db('luis'), 'recurrencias/RL'), { hora: '16:25', duracionMinutos: 35, actualizadoEn: 'v2' }));
  await assertSucceeds(updateDoc(doc(db('luis'), 'recurrencias/RL'), { activa: false, actualizadoEn: 'v3' }));
});
await caso('ATAQUE: barbero crea su agenda con un precio o un servicio que no son los del catálogo', async () => {
  await assertFails(setDoc(doc(db('luis'), 'recurrencias/RLp'), recurrencia({ barberoId: 'B1', precio: 1 })));
  await assertFails(setDoc(doc(db('luis'), 'recurrencias/RLn'), recurrencia({ barberoId: 'B1', serviceName: 'Corte gratis' })));
  await assertFails(updateDoc(doc(db('luis'), 'recurrencias/RL'), { precio: 999999, actualizadoEn: 'v9' }));
});
await caso('ATAQUE: barbero crea una agenda recurrente para otro barbero', () =>
  assertFails(setDoc(doc(db('luis'), 'recurrencias/RLx'), recurrencia({ barberoId: 'B2', barberoNombre: 'Pedro' }))));
await caso('ATAQUE: barbero le pasa su agenda recurrente a otro barbero', () =>
  assertFails(updateDoc(doc(db('luis'), 'recurrencias/RL'), { barberoId: 'B2', actualizadoEn: 'v4' })));
await caso('ATAQUE: barbero edita, pausa o borra la agenda recurrente de otro barbero', async () => {
  await assertSucceeds(setDoc(doc(db('admin'), 'recurrencias/RP'), recurrencia({ barberoId: 'B2', barberoNombre: 'Pedro' })));
  await assertFails(updateDoc(doc(db('luis'), 'recurrencias/RP'), { hora: '10:00', actualizadoEn: 'v2' }));
  await assertFails(updateDoc(doc(db('luis'), 'recurrencias/RP'), { barberoId: 'B1', actualizadoEn: 'v2' }));
  await assertFails(deleteDoc(doc(db('luis'), 'recurrencias/RP')));
});
await caso('ATAQUE: barbero sin perfil enlazado crea una agenda recurrente', () =>
  assertFails(setDoc(doc(db('suelto'), 'recurrencias/RS'), recurrencia({ barberoId: 'B1' }))));
await caso('ATAQUE: cuenta sin verificar con el correo de un barbero crea una agenda recurrente', () =>
  assertFails(setDoc(doc(db('falso', { email_verified: false }), 'recurrencias/RF'), recurrencia({ barberoId: 'B1' }))));
await caso('barbero borra la suya', () => assertSucceeds(deleteDoc(doc(db('luis'), 'recurrencias/RL'))));
await caso('ATAQUE: cliente o visitante crean, leen o borran agendas recurrentes', async () => {
  await assertFails(setDoc(doc(db('ana'), 'recurrencias/R3'), recurrencia()));
  await assertFails(getDoc(doc(db('ana'), 'recurrencias/R1')));
  await assertFails(getDoc(doc(anon(), 'recurrencias/R1')));
  await assertFails(deleteDoc(doc(db('ana'), 'recurrencias/R1')));
});

/** Un turno que apartó la función (Admin SDK, sin reglas): cita sin cuenta, con su serie, y su rato en la agenda. */
async function turnoDeLaFuncion(id, inicio, duracion) {
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore();
    const t = tramo(inicio, duracion);
    await setDoc(doc(f, `citas/${id}`), {
      userId: '', userName: 'Juan Camilo', userEmail: '', phone: '3001234567', servicioId: 'S4', serviceName: 'Rápido', precio: 30000,
      duracionMinutos: duracion, barberoId: 'B1', barberoNombre: 'Luis', dia: RECURRENTE, hora: horaDe(inicio), horaStr: 'x',
      fecha: `${RECURRENTE}T22:20:00.000Z`, estado: 'pendiente', creadoEn: new Date().toISOString(), recurrenciaId: 'R1', frecuencia: 'semanal',
    });
    const actual = (await getDoc(doc(f, rutaDia('B1', RECURRENTE)))).data();
    await updateDoc(doc(f, rutaDia('B1', RECURRENTE)), { mapa: ocupar(actual.mapa, t), [`citas.${id}`]: t, op: { tipo: 'funcion' } });
  });
}
await turnoDeLaFuncion('R1_turno', 1040, 60);
await caso('ATAQUE: un cliente reserva encima de un turno recurrente (justo cuando termina sí puede)', async () => {
  const u = fresco();
  await assertFails(reservar(db(u), nueva(), u, { dia: RECURRENTE, inicio: 1060, servicio: 'S4' }));
  await assertSucceeds(reservar(db(u), nueva(), u, { dia: RECURRENTE, inicio: 1100, servicio: 'S4' }));
});
// Uno de 25 min a las 9:20: termina a las 9:45.
await turnoDeLaFuncion('R1_corto', 560, 25);
await caso('un turno recurrente de 25 min (9:20): nadie reserva a las 9:40, y a las 9:45 en punto sí', async () => {
  const u = fresco();
  await assertFails(reservar(db(u), nueva(), u, { dia: RECURRENTE, inicio: 580, servicio: 'S4' }));
  await assertSucceeds(reservar(db(u), nueva(), u, { dia: RECURRENTE, inicio: 585, servicio: 'S4' }));
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
seccion('precio propio de un barbero y servicios propios');
// Mañana (día 1), que no usa ningún otro caso. Pedro (B2) cobra el Corte Jose a 45.000 (el general es 30.000) y tiene
// un servicio solo suyo, el VIP. Luis (B1) cobra el general.
const PRE = enDias(1);
SERVICIOS.S9 = { nombre: 'Corte Jose', precio: 30000, duracionMinutos: 40 };
SERVICIOS.S10 = { nombre: 'VIP', precio: 80000, duracionMinutos: 40 };
await caso('admin le pone a Pedro su propio precio en un servicio (los demás siguen con el general)', () =>
  assertSucceeds(setDoc(doc(db('admin'), 'servicios/S9'), { ...SERVICIOS.S9, categoria: 'x', descripcion: '', destacado: false, precios: { B2: 45000 } })));
await caso('admin crea un servicio propio de Pedro', () =>
  assertSucceeds(setDoc(doc(db('admin'), 'servicios/S10'), { ...SERVICIOS.S10, categoria: 'x', descripcion: '', destacado: false, soloDe: 'B2' })));
await caso('admin le quita el precio propio y lo vuelve a poner', async () => {
  await assertSucceeds(updateDoc(doc(db('admin'), 'servicios/S9'), { precios: deleteField() }));
  await assertSucceeds(updateDoc(doc(db('admin'), 'servicios/S9'), { precios: { B2: 45000 } }));
});
await caso('ATAQUE: precios por barbero que no son un mapa, o un "solo de" que no es texto', async () => {
  await assertFails(updateDoc(doc(db('admin'), 'servicios/S9'), { precios: 45000 }));
  await assertFails(updateDoc(doc(db('admin'), 'servicios/S9'), { soloDe: ['B2'] }));
});
await caso('ATAQUE: un barbero se sube (o se baja) su propio precio', () =>
  assertFails(updateDoc(doc(db('pedro'), 'servicios/S9'), { precios: { B2: 1000 } })));
await caso('ATAQUE: un cliente toca los precios', () =>
  assertFails(updateDoc(doc(db('ana'), 'servicios/S9'), { precios: { B2: 1000 } })));
await caso('admin borra un servicio', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'servicios/BORRAR'), { nombre: 'Viejo', precio: 1 }));
  await assertSucceeds(deleteDoc(doc(db('admin'), 'servicios/BORRAR')));
});
await caso('el cliente reserva con Pedro a su precio (y con el general no pasa)', async () => {
  const u = fresco();
  await assertFails(reservar(db(u), nueva(), u, { servicio: 'S9', barbero: 'B2', dia: PRE, inicio: 600 }));
  await assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S9', barbero: 'B2', dia: PRE, inicio: 600, extra: { precio: 45000 } }));
});
await caso('el cliente reserva el mismo servicio con Luis al precio general (y con el de Pedro no pasa)', async () => {
  const u = fresco();
  await assertFails(reservar(db(u), nueva(), u, { servicio: 'S9', barbero: 'B1', dia: PRE, inicio: 600, extra: { precio: 45000 } }));
  await assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S9', barbero: 'B1', dia: PRE, inicio: 600 }));
});
await caso('el servicio propio de Pedro se reserva con él', () => {
  const u = fresco();
  return assertSucceeds(reservar(db(u), nueva(), u, { servicio: 'S10', barbero: 'B2', dia: PRE, inicio: 700 }));
});
await caso('ATAQUE: el servicio propio de Pedro reservado con Luis', () => {
  const u = fresco();
  return assertFails(reservar(db(u), nueva(), u, { servicio: 'S10', barbero: 'B1', dia: PRE, inicio: 700 }));
});
await caso('Pedro se agenda desde su panel el servicio a su precio (y al general no)', async () => {
  await assertFails(agendaDelBarbero(db('pedro'), 'PRE1', { inicio: 800, servicio: 'S9', barbero: 'B2', dia: PRE }));
  await assertSucceeds(agendaDelBarbero(db('pedro'), 'PRE1', { inicio: 800, servicio: 'S9', barbero: 'B2', dia: PRE, extra: { precio: 45000 } }));
});
await caso('ATAQUE: Luis se agenda el servicio propio de Pedro', () =>
  assertFails(agendaDelBarbero(db('luis'), 'PRE2', { inicio: 800, servicio: 'S10', dia: PRE })));
await caso('Pedro crea una agenda recurrente a su precio (y al general no)', async () => {
  const suya = extra => recurrencia({ barberoId: 'B2', barberoNombre: 'Pedro', servicioId: 'S9', serviceName: 'Corte Jose', ...extra });
  await assertFails(setDoc(doc(db('pedro'), 'recurrencias/RPRE'), suya({ precio: 30000 })));
  await assertSucceeds(setDoc(doc(db('pedro'), 'recurrencias/RPRE'), suya({ precio: 45000 })));
});
await caso('ATAQUE: Luis crea una agenda recurrente con el servicio propio de Pedro', () =>
  assertFails(setDoc(doc(db('luis'), 'recurrencias/RPRE2'), recurrencia({ servicioId: 'S10', serviceName: 'VIP', precio: 80000 }))));

// ---------------------------------------------------------------------------
seccion('citas que el equipo registró con el celular o el correo del cliente');
// Las del panel, del barbero y de las agendas recurrentes no son de ninguna cuenta (userId vacío). El cliente las ve en
// "Mis reservas" si entró con ese celular (SMS) o con ese correo verificado, y las puede cancelar.
/** Una cita sin cuenta con su rato en la agenda de Luis (como la deja el panel o la función). */
async function citaDelEquipo(id, inicio, extra = {}) {
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore();
    const t = tramo(inicio, 40);
    await setDoc(doc(f, `citas/${id}`), {
      userId: '', userName: 'Carla', userEmail: '', phone: '', servicioId: 'S4', serviceName: 'Rápido', precio: 30000,
      duracionMinutos: 40, barberoId: 'B1', barberoNombre: 'Luis', dia: PRE, hora: horaDe(inicio), horaStr: 'x',
      fecha: `${PRE}T15:00:00.000Z`, estado: 'pendiente', creadoEn: new Date().toISOString(), ...extra,
    });
    if (extra.userId) return;
    const actual = (await getDoc(doc(f, rutaDia('B1', PRE)))).data();
    await updateDoc(doc(f, rutaDia('B1', PRE)), { mapa: ocupar(actual.mapa, t), [`citas.${id}`]: t, op: { tipo: 'funcion' } });
  });
}
await citaDelEquipo('VIN1', 900, { phone: '3005550001', recurrenciaId: 'RV', frecuencia: 'semanal' });
await citaDelEquipo('VIN2', 1000, { userEmail: 'carla@x.com' });
// La reserva de otra cuenta, en la que alguien escribió ese mismo celular: no es de quien entró con él.
await citaDelEquipo('VIN3', 1100, { userId: 'otra', phone: '3005550001' });
const conCelular = () => celular('celcarla', '+573005550001');
const delEquipoCon = (f, campo, valor) => getDocs(query(collection(f, 'citas'), where('userId', '==', ''), where(campo, '==', valor)));
await caso('quien entró con ese celular (SMS) ve su turno con la consulta de "Mis reservas"', async () => {
  const lista = await assertSucceeds(delEquipoCon(conCelular(), 'phone', '3005550001'));
  if (lista.size !== 1 || lista.docs[0].id !== 'VIN1') throw new Error(`esperaba solo VIN1 y llegaron ${lista.docs.map(d => d.id)}`);
  await assertSucceeds(getDoc(doc(conCelular(), 'citas/VIN1')));
});
await caso('quien tiene ese correo verificado ve la cita que le registró el equipo', async () => {
  const lista = await assertSucceeds(delEquipoCon(db('carla'), 'userEmail', 'carla@x.com'));
  if (lista.size !== 1 || lista.docs[0].id !== 'VIN2') throw new Error(`esperaba solo VIN2 y llegaron ${lista.docs.map(d => d.id)}`);
});
await caso('ATAQUE: con otro celular no la ve (ni pidiéndola por el celular ajeno)', async () => {
  const otro = celular('celotro', '+573009999999');
  await assertFails(delEquipoCon(otro, 'phone', '3005550001'));
  await assertFails(getDoc(doc(otro, 'citas/VIN1')));
});
await caso('ATAQUE: una cuenta de Google con ese celular escrito a mano no la ve (no está verificado)', () =>
  assertFails(delEquipoCon(db('ana'), 'phone', '3005550001')));
await caso('ATAQUE: con ese correo sin verificar no la ve', () =>
  assertFails(getDoc(doc(db('carla', { email_verified: false }), 'citas/VIN2'))));
await caso('ATAQUE: quien entró con el celular no ve la reserva de otra cuenta que escribió su número', async () => {
  await assertFails(getDoc(doc(conCelular(), 'citas/VIN3')));
  await assertFails(getDocs(query(collection(conCelular(), 'citas'), where('phone', '==', '3005550001'))));
});
await caso('ATAQUE: el cliente no cambia la cita del equipo de otra forma (la marca hecha, se la pasa a su cuenta, cancela sin soltar el rato)', async () => {
  await assertFails(updateDoc(doc(db('carla'), 'citas/VIN2'), { estado: 'completada' }));
  await assertFails(updateDoc(doc(db('carla'), 'citas/VIN2'), { userId: 'carla' }));
  await assertFails(updateDoc(doc(db('carla'), 'citas/VIN2'), { estado: 'cancelada' }));
});
await caso('ATAQUE: otro cliente cancela la cita del equipo soltando su rato', () =>
  assertFails(cancelar(celular('celotro', '+573009999999'), 'VIN1', { dia: PRE })));
await caso('quien entró con el celular cancela su turno y suelta el rato', () => assertSucceeds(cancelar(conCelular(), 'VIN1', { dia: PRE })));
await caso('quien tiene el correo cancela su cita y suelta el rato', () => assertSucceeds(cancelar(db('carla'), 'VIN2', { dia: PRE })));
await caso('admin guarda el correo del cliente en la agenda recurrente (y lo quita)', async () => {
  await assertSucceeds(setDoc(doc(db('admin'), 'recurrencias/RC'), recurrencia({ clienteCorreo: 'juan.camilo@correo.com' })));
  await assertSucceeds(updateDoc(doc(db('admin'), 'recurrencias/RC'), { clienteCorreo: '', actualizadoEn: 'v2' }));
});
for (const [nombre, clienteCorreo] of [['un correo sin @', 'juan.correo.com'], ['un correo con mayúsculas', 'Juan@Correo.com'], ['un correo de 200 letras', `${'x'.repeat(190)}@correo.com`]]) {
  await caso(`ATAQUE: agenda recurrente con ${nombre}`, () => assertFails(setDoc(doc(db('admin'), `recurrencias/MAL${++n}`), recurrencia({ clienteCorreo }))));
}

// ---------------------------------------------------------------------------
seccion('colecciones cerradas (tienda retirada y cualquier otra)');
for (const ruta of ['productos/P1', 'pedidos/X1', 'movimientosInventario/M1', 'cualquiera/X1']) {
  await caso(`ATAQUE: leer ${ruta.split('/')[0]}`, () => assertFails(getDoc(doc(anon(), ruta))));
  await caso(`ATAQUE: ni el admin escribe en ${ruta.split('/')[0]}`, () => assertFails(setDoc(doc(db('admin'), ruta), { a: 1 })));
}

console.log(`\n${ok} OK, ${fallos} fallidos`);
await env.cleanup();
process.exit(fallos ? 1 : 0);
