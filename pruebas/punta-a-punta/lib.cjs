// Utilidades de las pruebas de punta a punta (Puppeteer con el Chrome local, contra los emuladores).
// Cómo correrlas: ver LEEME.md en esta carpeta.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:4300';
const PROYECTO = 'demo-acicale';
const FS = `http://127.0.0.1:8080/v1/projects/${PROYECTO}/databases/(default)/documents`;
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
/** Raíz del repositorio. */
const RAIZ = path.resolve(__dirname, '..', '..');
/** Capturas de pantalla de cada corrida (no se suben al repositorio). */
const CAPTURAS = path.join(__dirname, 'capturas');
/** Log de los emuladores: ahí quedan los correos que "envían" las funciones. */
const LOG_EMULADORES = process.env.LOG_EMULADORES ?? path.join(__dirname, 'emuladores.log');
/** Chrome instalado en el equipo (otra ruta: variable CHROME). */
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(CAPTURAS, { recursive: true });

let ok = 0;
const fallos = [];
function comprobar(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log('  ✔', nombre); }
  else { fallos.push(nombre); console.log('  ✘', nombre, detalle ? `→ ${detalle}` : ''); }
}
const seccion = t => console.log(`\n${t}`);
const resumen = () => { console.log(`\n${ok} OK, ${fallos.length} fallidos${fallos.length ? ':\n  - ' + fallos.join('\n  - ') : ''}`); return fallos.length; };

// --- Firestore del emulador (como "owner": sin reglas) ---
function plano(v) {
  if (v == null) return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(plano);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, plano(x)]));
  return v;
}
async function docs(coleccion) {
  // El emulador entrega la colección por páginas (aunque se le pida un tamaño mayor): se piden todas.
  const todos = [];
  let pagina = '';
  do {
    const r = await fetch(`${FS}/${coleccion}?pageSize=300${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ''}`, { headers: { Authorization: 'Bearer owner' } });
    const j = await r.json();
    todos.push(...(j.documents ?? []));
    pagina = j.nextPageToken ?? '';
  } while (pagina);
  return todos.map(d => ({ id: d.name.split('/').pop(), ...plano({ mapValue: { fields: d.fields } }) }));
}
async function doc(ruta) {
  const r = await fetch(`${FS}/${ruta}`, { headers: { Authorization: 'Bearer owner' } });
  if (!r.ok) return null;
  const d = await r.json();
  return { id: d.name.split('/').pop(), ...plano({ mapValue: { fields: d.fields } }) };
}

// --- Cuentas del emulador de Auth ---
async function crearCuenta(email, clave, nombre) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=demo`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: clave, displayName: nombre, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.localId) throw new Error('No se creó la cuenta ' + email + ': ' + JSON.stringify(j));
  await fetch(`${AUTH}/projects/${PROYECTO}/accounts:update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: j.localId, emailVerified: true }),
  });
  return j.localId;
}

// --- Navegador ---
function abrirNavegador() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-first-run', '--disable-extensions', '--lang=es-CO'],
  });
}

/** Una persona distinta: contexto propio (sin la sesión ni las cookies de las demás). */
async function sesion(navegador, { movil = false, ancho } = {}) {
  const contexto = await navegador.createBrowserContext();
  const pagina = await contexto.newPage();
  await pagina.setViewport(movil
    ? { width: ancho ?? 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { width: ancho ?? 1440, height: 900, deviceScaleFactor: 1 });
  const consola = [];
  pagina.on('console', m => { if (['error', 'warning'].includes(m.type())) consola.push(`[${m.type()}] ${m.text()}`); });
  pagina.on('pageerror', e => consola.push(`[pageerror] ${e.message}`));
  pagina.on('dialog', async d => { consola.push(`[dialogo nativo] ${d.message()}`); await d.dismiss(); });
  return { pagina, consola, cerrar: () => contexto.close() };
}

const texto = pagina => pagina.evaluate(() => document.body.textContent.replace(/\s+/g, ' '));
const esperarTexto = (pagina, t, ms = 15000) => pagina.waitForFunction(x => document.body.textContent.replace(/\s+/g, ' ').includes(x), { timeout: ms }, t);
const esperarSinTexto = (pagina, t, ms = 15000) => pagina.waitForFunction(x => !document.body.textContent.replace(/\s+/g, ' ').includes(x), { timeout: ms }, t);
const pausa = ms => new Promise(r => setTimeout(r, ms));

/** Clic en el primer botón o enlace visible que contenga ese texto. */
async function clic(pagina, t, selector = 'button, a, label') {
  const hecho = await pagina.evaluate((t, selector) => {
    const visible = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const el = [...document.querySelectorAll(selector)].find(e => visible(e) && !e.disabled && e.textContent.replace(/\s+/g, ' ').trim().includes(t));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }, t, selector);
  if (!hecho) throw new Error(`No hay nada visible para hacer clic con el texto "${t}"`);
  await pausa(250);
}

async function escribir(pagina, selector, valor) {
  await pagina.waitForSelector(selector, { visible: true });
  // Vacía el campo como lo haría la persona (avisando a Angular) y escribe el valor nuevo.
  await pagina.$eval(selector, el => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await pagina.type(selector, valor, { delay: 5 });
}

/** Deja los emuladores como recién sembrados: sin cuentas y con los datos de la demo. */
async function reiniciar() {
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });
  require('child_process').execFileSync('node', ['scripts/sembrar-demo.mjs'], { cwd: RAIZ, stdio: 'ignore' });
}

async function captura(pagina, nombre, completa = false) {
  await pausa(400);
  await pagina.screenshot({ path: path.join(CAPTURAS, nombre + '.png'), fullPage: completa });
}

async function ir(pagina, ruta) {
  await pagina.goto(BASE + ruta, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
  await pausa(500);
}

/** Entra por el formulario de correo y contraseña. */
async function entrar(pagina, email, clave, volver = '') {
  await ir(pagina, '/login' + (volver ? `?volver=${encodeURIComponent(volver)}` : ''));
  await escribir(pagina, 'input[name="correo"]', email);
  await escribir(pagina, 'input[name="clave"]', clave);
  await clic(pagina, 'Entrar', 'button[type="submit"]');
  await pagina.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
  await pausa(900);
}

/** Acepta (o no) el aviso de cookies sin pasar por él: deja guardada la elección antes de cargar la página. */
async function elegirCookies(pagina, { instagram = false } = {}) {
  await pagina.evaluateOnNewDocument(instagram => {
    localStorage.setItem('preferencias-cookies-v1', JSON.stringify({ instagram, fecha: new Date().toISOString() }));
  }, instagram);
}

/** Avisos de la consola que importan (sin el ruido propio de los emuladores). */
function limpia(consola) {
  return consola.filter(l => !/emulator|Emulator|WARNING: You are using the Auth Emulator|favicon/.test(l));
}

/** ¿La página se sale de la pantalla a lo ancho? */
const desborda = pagina => pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Correos que "envió" el emulador de funciones (quedan en su log) desde cierta posición del log. */
function correosDesde(rutaLog, desde) {
  // `desde` es una posición en bytes (el tamaño del archivo en ese momento): se corta antes de convertir a texto.
  const log = fs.readFileSync(rutaLog).subarray(desde).toString('utf8');
  return [...log.matchAll(/"motivo":"([a-z]+)","para":"([a-z]+)"/g)].map(m => `${m[1]}:${m[2]}`)
    .concat([...log.matchAll(/"para":"([a-z]+)","motivo":"([a-z]+)"/g)].map(m => `${m[2]}:${m[1]}`));
}

module.exports = { RAIZ, LOG_EMULADORES, reiniciar, BASE, CAPTURAS, comprobar, seccion, resumen, docs, doc, crearCuenta, abrirNavegador, sesion, elegirCookies, limpia, texto, esperarTexto, esperarSinTexto, pausa, clic, escribir, captura, ir, entrar, desborda, correosDesde };
