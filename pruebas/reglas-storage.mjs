// Pruebas de seguridad de storage.rules (fotos del staff). Cada caso intenta algo que el panel hace (debe funcionar)
// o un ataque desde la consola del navegador (debe fallar).
//
// Uso: npm run test:reglas   (levanta los emuladores de Firestore y Storage, no toca el proyecto real)
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const BUCKET = 'gs://demo-reglas.appspot.com';
const CARPETA = 'staff';

const env = await initializeTestEnvironment({
  projectId: 'demo-reglas',
  // Las reglas de Storage leen el rol en Firestore: los dos emuladores corren juntos.
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  storage: { rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 },
});

// Debe coincidir con esEmailAdmin() en storage.rules y firestore.rules.
const ADMIN_EMAIL = 'ortizgonzalesbryanalexander1@gmail.com';
const st = (uid, email = `${uid}@x.com`, verificado = true) =>
  env.authenticatedContext(uid, { email, email_verified: verificado }).storage(BUCKET);
// La cuenta de admin configurada (en producción entra por su correo, sin leer Firestore).
const principal = () => st('principal', ADMIN_EMAIL);
const anon = () => env.unauthenticatedContext().storage(BUCKET);

let ok = 0, fallos = 0;
async function caso(nombre, fn) {
  try { await fn(); ok++; console.log('  ✔', nombre); }
  catch (e) { fallos++; console.log('  ✘', nombre, '\n     ', e.message.split('\n')[0]); }
}
const seccion = t => console.log(`\n${t}`);

// Bytes de una foto cualquiera (al emulador solo le importan el tipo y el tamaño).
const foto = (bytes = 2048) => new Uint8Array(bytes).fill(7);
const subir = (s, ruta, { tipo = 'image/webp', bytes } = {}) => s.ref(ruta).put(foto(bytes), { contentType: tipo });

// ---------------------------------------------------------------------------
// Estado inicial (sin reglas): roles en Firestore y una foto subida desde la consola
// ---------------------------------------------------------------------------
await env.clearFirestore();
await env.clearStorage();
await env.withSecurityRulesDisabled(async ctx => {
  const f = ctx.firestore();
  await setDoc(doc(f, 'usuarios/admin'), { uid: 'admin', rol: 'admin' });
  await setDoc(doc(f, 'usuarios/luis'), { uid: 'luis', rol: 'barbero' });
  await setDoc(doc(f, 'usuarios/ana'), { uid: 'ana', rol: 'cliente' });
  await ctx.storage(BUCKET).ref(`${CARPETA}/foto_consola.jpg`).put(foto(), { contentType: 'image/jpeg' });
});

// ---------------------------------------------------------------------------
seccion('lo que hace el panel de staff (cuenta de admin configurada)');
await caso('el admin configurado sube una foto aunque aún no tenga perfil', () => assertSucceeds(subir(principal(), `${CARPETA}/principal.webp`)));
await caso('el admin configurado lista y usa las fotos', async () => {
  await assertSucceeds(principal().ref(CARPETA).listAll());
  await assertSucceeds(principal().ref(`${CARPETA}/foto_consola.jpg`).getDownloadURL());
});
await caso('el admin configurado borra una foto', () => assertSucceeds(principal().ref(`${CARPETA}/principal.webp`).delete()));
await caso('ATAQUE: el correo del admin sin verificar no entra', () =>
  assertFails(subir(st('impostor', ADMIN_EMAIL, false), `${CARPETA}/impostor.webp`)));

seccion('otros admins (rol admin en Firestore; en producción necesita el permiso de la cuenta de Storage)');
await caso('admin sube la foto de un barbero (WebP)', () => assertSucceeds(subir(st('admin'), `${CARPETA}/luis-1.webp`)));
await caso('admin sube una foto JPEG (navegador sin WebP)', () => assertSucceeds(subir(st('admin'), `${CARPETA}/luis-2.jpg`, { tipo: 'image/jpeg' })));
await caso('admin obtiene la URL de descarga para el avatar', () => assertSucceeds(st('admin').ref(`${CARPETA}/luis-1.webp`).getDownloadURL()));
await caso('admin lista las fotos ya subidas (incluida la de la consola)', async () => {
  const lista = await assertSucceeds(st('admin').ref(CARPETA).listAll());
  if (!lista.items.some(i => i.name === 'foto_consola.jpg')) throw new Error('No aparece la foto subida desde la consola');
});
await caso('admin usa la foto subida desde la consola', () => assertSucceeds(st('admin').ref(`${CARPETA}/foto_consola.jpg`).getDownloadURL()));
await caso('admin borra una foto que no usó', () => assertSucceeds(st('admin').ref(`${CARPETA}/luis-2.jpg`).delete()));

// ---------------------------------------------------------------------------
seccion('nadie más escribe ni curiosea');
// Cuenta de celular: su token no trae correo.
const celular = () => env.authenticatedContext('tel1', { phone_number: '+573001112233', firebase: { sign_in_provider: 'phone' } }).storage(BUCKET);
for (const [quien, s] of [['visitante', anon], ['cliente', () => st('ana')], ['barbero', () => st('luis')], ['cuenta sin perfil', () => st('fantasma')], ['cuenta de celular', celular]]) {
  await caso(`ATAQUE: ${quien} sube una foto al staff`, () => assertFails(subir(s(), `${CARPETA}/intruso.webp`)));
  await caso(`ATAQUE: ${quien} reemplaza la foto de un barbero`, () => assertFails(subir(s(), `${CARPETA}/luis-1.webp`)));
  await caso(`ATAQUE: ${quien} borra la foto de un barbero`, () => assertFails(s().ref(`${CARPETA}/luis-1.webp`).delete()));
  await caso(`ATAQUE: ${quien} lista la carpeta del staff`, () => assertFails(s().ref(CARPETA).listAll()));
  await caso(`ATAQUE: ${quien} pide la URL de una foto`, () => assertFails(s().ref(`${CARPETA}/luis-1.webp`).getDownloadURL()));
}

// ---------------------------------------------------------------------------
seccion('ni el admin sube cualquier cosa');
await caso('ATAQUE: página HTML disfrazada en la carpeta (phishing desde el dominio de Firebase)', () =>
  assertFails(subir(st('admin'), `${CARPETA}/pagina.html`, { tipo: 'text/html' })));
await caso('ATAQUE: SVG (puede llevar scripts)', () => assertFails(subir(st('admin'), `${CARPETA}/logo.svg`, { tipo: 'image/svg+xml' })));
await caso('ATAQUE: archivo de 3 MB', () => assertFails(subir(st('admin'), `${CARPETA}/enorme.jpg`, { tipo: 'image/jpeg', bytes: 3 * 1024 * 1024 })));
await caso('foto de casi 3 MB (cámara sin comprimir) sí entra', () =>
  assertSucceeds(subir(st('admin'), `${CARPETA}/grande.jpg`, { tipo: 'image/jpeg', bytes: 3 * 1024 * 1024 - 1024 })));
await caso('ATAQUE: subir fuera de la carpeta (raíz)', () => assertFails(subir(st('admin'), 'suelta.webp')));
await caso('ATAQUE: subir a otra carpeta', () => assertFails(subir(st('admin'), 'Otra/foto.webp')));
await caso('ATAQUE: subcarpeta dentro del staff', () => assertFails(subir(st('admin'), `${CARPETA}/sub/foto.webp`)));
await caso('ATAQUE: carpeta con nombre parecido (mayúscula)', () => assertFails(subir(st('admin'), 'Staff/foto.webp')));

console.log(`\n${ok} OK, ${fallos} fallidos`);
await env.cleanup();
process.exit(fallos ? 1 : 0);
