// Parte 3: celular (360 y 390 px). Nada se sale de la pantalla, las zonas táctiles y los textos tienen buen
// tamaño, el botón de confirmar queda fijo abajo, y la política de seguridad (CSP) no reporta nada bloqueado.
const path = require('path');
const L = require('./lib.cjs');
const { comprobar, seccion, clic, ir, esperarTexto, captura, pausa } = L;

const CLAVE = 'Clave-segura-1';
const ADMIN = 'ortizgonzalesbryanalexander1@gmail.com';
/** Barra de accesos rápidos del celular y la hoja que abre "Horario". */
const BARRA = 'nav[aria-label="Accesos rápidos"]';
const HOJA = '[role="dialog"][aria-labelledby="horario-titulo"]';

/** Elementos que se salen a lo ancho, textos de menos de 11 px y botones o enlaces de menos de 40 px de alto. */
const auditar = pagina => pagina.evaluate(() => {
  const visible = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0; };
  const nombre = e => (e.textContent.replace(/\s+/g, ' ').trim() || e.getAttribute('aria-label') || e.tagName).slice(0, 40);
  const ancho = window.innerWidth;
  const fuera = [], chicos = [], toques = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!visible(e) || e.closest('iframe, .sr-only, [aria-hidden="true"]')) continue;
    const r = e.getBoundingClientRect();
    // Lo que va en un carrusel o dentro de algo con scroll propio no cuenta como "salirse".
    const conScroll = e.closest('.overflow-x-auto, .overflow-hidden, .snap-x');
    if (r.right > ancho + 1 && !conScroll && getComputedStyle(e).position !== 'fixed') fuera.push(nombre(e));
    const propio = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (propio && parseFloat(getComputedStyle(e).fontSize) < 11) chicos.push(`${nombre(e)} (${getComputedStyle(e).fontSize})`);
    if (e.matches('button, a, select, input:not([type="hidden"]), [role="tab"]') && !e.closest('table') && r.height < 39.5 && r.width > 0) {
      // Los enlaces dentro de un párrafo son texto: no aplican.
      const enFrase = e.parentElement.tagName === 'P' && [...e.parentElement.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 20);
      if (!(e.tagName === 'A' && getComputedStyle(e).display === 'inline') && !enFrase) toques.push(`${nombre(e)} (${Math.round(r.height)} px)`);
    }
  }
  return { desborde: document.documentElement.scrollWidth - ancho, fuera: [...new Set(fuera)], chicos: [...new Set(chicos)], toques: [...new Set(toques)] };
});

async function revisar(pagina, nombre) {
  const r = await auditar(pagina);
  comprobar(`${nombre}: nada se sale a lo ancho`, r.desborde <= 0 && r.fuera.length === 0, `desborde ${r.desborde}px ${r.fuera.slice(0, 4).join(' | ')}`);
  comprobar(`${nombre}: ningún texto de menos de 11 px`, r.chicos.length === 0, r.chicos.slice(0, 5).join(' | '));
  comprobar(`${nombre}: botones y enlaces de al menos 40 px de alto`, r.toques.length === 0, r.toques.slice(0, 6).join(' | '));
}

(async () => {
  const navegador = await L.abrirNavegador();
  await L.reiniciar();
  await L.crearCuenta('mateo.cliente@example.com', CLAVE, 'Mateo Rincón');
  await L.crearCuenta(ADMIN, CLAVE, 'Bryan Ortiz');
  await L.crearCuenta('trip.demo@example.com', CLAVE, 'Juan Sebastián');
  const csp = [];

  for (const ancho of [360, 390]) {
    seccion(`celular de ${ancho} px: visitante`);
    const m = await L.sesion(navegador, { movil: true, ancho });
    global.ultimaPagina = m.pagina;
    m.pagina.on('console', x => { if (/Content Security Policy|Content-Security-Policy/i.test(x.text())) csp.push(x.text().slice(0, 300)); });
    await ir(m.pagina, '/');
    await esperarTexto(m.pagina, 'Cookies y contenido de terceros');
    if (ancho === 390) await captura(m.pagina, '50-movil-inicio-aviso');
    await revisar(m.pagina, 'inicio con el aviso de cookies');
    comprobar('mientras está el aviso de cookies no se monta la barra de accesos debajo', await m.pagina.evaluate(sel => !document.querySelector(sel), BARRA));
    await clic(m.pagina, 'Aceptar todo', 'button');
    await m.pagina.waitForSelector('iframe[title^="Mapa"]', { timeout: 10000 });
    comprobar('en celular el mapa pide un toque antes de moverse (no atrapa el dedo al bajar)', await m.pagina.evaluate(() => document.body.textContent.includes('Toca para mover el mapa') && document.querySelector('iframe[title^="Mapa"]').classList.contains('pointer-events-none')));
    await pausa(1500);
    if (ancho === 390) await captura(m.pagina, '51-movil-inicio');
    // Recorre la página para que aparezca todo (las secciones entran al hacer scroll).
    await m.pagina.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } window.scrollTo(0, 0); });
    await pausa(2500);
    await revisar(m.pagina, 'inicio');

    comprobar('accesos rápidos fijos abajo: Servicios, Reservar, Horario y el contacto', await m.pagina.evaluate(sel => {
      const barra = document.querySelector(sel);
      if (!barra) return false;
      const textos = [...barra.querySelectorAll('a, button')].map(e => e.textContent.trim());
      return getComputedStyle(barra).position === 'fixed' && Math.abs(barra.getBoundingClientRect().bottom - document.documentElement.clientHeight) < 2
        && textos.length === 4 && ['Servicios', 'Reservar', 'Horario'].every(t => textos.includes(t)) && /^(WhatsApp|Instagram)$/.test(textos[3]);
    }, BARRA));
    comprobar('el cuarto acceso abre el WhatsApp de la barbería con un saludo ya escrito', await m.pagina.evaluate(sel =>
      /^https:\/\/wa\.me\/573153229528\?text=Hola/.test([...document.querySelectorAll(`${sel} a`)].find(e => e.textContent.trim() === 'WhatsApp')?.href ?? ''), BARRA));
    comprobar('la barra no tapa el final del pie de página', await m.pagina.evaluate(async sel => {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 400));
      const tapa = document.querySelector('footer').getBoundingClientRect().bottom > document.querySelector(sel).getBoundingClientRect().top + 1;
      window.scrollTo(0, 0);
      return !tapa;
    }, BARRA));
    await clic(m.pagina, 'Horario', `${BARRA} button`);
    await m.pagina.waitForSelector(HOJA, { timeout: 5000 });
    await pausa(500);
    comprobar('"Horario" abre una hoja con el estado de hoy y la semana, sin salir de la página', await m.pagina.evaluate(sel => {
      const hoja = document.querySelector(sel);
      return /Abierto ahora|Cerrado/.test(hoja.textContent) && hoja.textContent.includes('Lun') && hoja.textContent.includes('Cómo llegar') && location.pathname === '/';
    }, HOJA));
    comprobar('el teclado entra a la hoja (queda en el botón de cerrar)', await m.pagina.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Cerrar el horario'));
    await revisar(m.pagina, 'hoja del horario');
    if (ancho === 390) await captura(m.pagina, '52b-movil-horario');
    await m.pagina.keyboard.press('Escape');
    await pausa(300);
    comprobar('y se cierra con Escape', !(await m.pagina.$(HOJA)));

    if (ancho === 390) {
      await captura(m.pagina, '52-movil-inicio-completo', true);
      await clic(m.pagina, 'Abrir el menú', 'button[aria-label="Abrir el menú"]').catch(() => m.pagina.click('button[aria-controls="menu-movil"]'));
      await pausa(400);
      await captura(m.pagina, '53-movil-menu');
      await revisar(m.pagina, 'menú desplegado');
      comprobar('el menú desplegado tiene fondo sólido: la página no se trasluce detrás', await m.pagina.evaluate(() => {
        const opaco = e => { const c = getComputedStyle(e).backgroundColor.match(/[\d.]+/g).map(Number); return c.length === 3 || c[3] === 1; };
        const menu = document.querySelector('#menu-movil');
        const enlace = menu.querySelector('a[href="/servicios"]');
        return opaco(menu) && opaco(document.querySelector('header')) && getComputedStyle(enlace).color === 'rgb(255, 255, 255)';
      }));
      comprobar('el menú ofrece "Instalar la app"', await m.pagina.evaluate(() => document.querySelector('#menu-movil a[href="/instalar"]')?.textContent.trim() === 'Instalar la app'));
      comprobar('y oscurece el resto de la página (con la barra de accesos debajo)', await m.pagina.evaluate(sel => {
        const velo = [...document.querySelectorAll('div.fixed')].find(d => d.getAttribute('aria-hidden') === 'true' && /bg-black/.test(d.className));
        const medio = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 20);
        return !!velo && velo.getBoundingClientRect().height >= window.innerHeight - 1 && !medio.closest(sel);
      }, BARRA));
      await m.pagina.evaluate(() => [...document.querySelectorAll('div.fixed')].find(d => d.getAttribute('aria-hidden') === 'true' && /bg-black/.test(d.className)).click());
      await pausa(300);
      comprobar('un toque fuera del menú lo cierra', !(await m.pagina.$('#menu-movil')));
    }

    await ir(m.pagina, '/servicios');
    await esperarTexto(m.pagina, 'Acicale Premium');
    await revisar(m.pagina, 'servicios');
    await ir(m.pagina, '/politica-de-datos');
    await esperarTexto(m.pagina, 'Cookies y contenido de terceros');
    await revisar(m.pagina, 'política de datos');
    await ir(m.pagina, '/instalar');
    await esperarTexto(m.pagina, 'en tu celular');
    await revisar(m.pagina, 'instalar la app');
    comprobar('"Instalar la app" trae cómo se hace en Android y, al elegir iPhone, los pasos de Safari', await m.pagina.evaluate(async () => {
      const tarjeta = () => document.querySelector('.placa')?.textContent.replace(/\s+/g, ' ') ?? '';
      // Sin el aviso del navegador (aquí no lo hay) se ven los pasos del menú; con él, el botón de un toque.
      const android = tarjeta().includes('Instalar aplicación') || tarjeta().includes('Instalar la app');
      [...document.querySelectorAll('button[aria-pressed]')].find(b => b.textContent.trim() === 'iPhone').click();
      await new Promise(r => setTimeout(r, 300));
      return android && tarjeta().includes('Compartir') && tarjeta().includes('Agregar a inicio') && tarjeta().includes('Safari');
    }));
    await revisar(m.pagina, 'instalar la app, pasos de iPhone');
    if (ancho === 390) await captura(m.pagina, '53b-movil-instalar', true);

    await ir(m.pagina, '/login');
    await esperarTexto(m.pagina, 'Entra para reservar');
    await revisar(m.pagina, 'login');
    if (ancho === 390) await captura(m.pagina, '54-movil-login', true);

    await ir(m.pagina, '/reservar');
    await esperarTexto(m.pagina, 'Elige a tu barbero');
    await revisar(m.pagina, 'reservar, paso 1');
    comprobar('en la reserva, "Reservar" queda marcado en la barra', await m.pagina.evaluate(sel => document.querySelector(`${sel} a[aria-current="page"]`)?.textContent.trim() === 'Reservar', BARRA));
    if (ancho === 390) await captura(m.pagina, '55-movil-reservar-1', true);
    await clic(m.pagina, 'Jose Julian', 'button');
    await esperarTexto(m.pagina, 'Elige tu servicio');
    await revisar(m.pagina, 'reservar, paso 2');
    await clic(m.pagina, 'Barba2', 'button');
    await esperarTexto(m.pagina, 'Horas libres');
    await m.pagina.evaluate(() => { const d = [...document.querySelectorAll('button[aria-pressed]')].filter(b => !b.disabled && /^\d+$/.test(b.textContent.trim())); d[Math.min(2, d.length - 1)].click(); });
    await m.pagina.waitForFunction(() => [...document.querySelectorAll('button[aria-pressed]')].some(b => /^\d{1,2}:\d{2} (AM|PM)$/.test(b.textContent.trim())), { timeout: 15000 });
    await pausa(400);
    await m.pagina.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].filter(b => /^\d{1,2}:\d{2} (AM|PM)$/.test(b.textContent.trim()))[3].click());
    await revisar(m.pagina, 'reservar, paso 3');
    if (ancho === 390) await captura(m.pagina, '56-movil-reservar-3', true);
    await clic(m.pagina, 'Continuar', 'button');
    await esperarTexto(m.pagina, 'Entra para confirmar');
    await revisar(m.pagina, 'reservar, paso 4 sin sesión');
    if (ancho === 390) await captura(m.pagina, '57-movil-reservar-entrar', true);

    seccion(`celular de ${ancho} px: cliente con sesión`);
    await clic(m.pagina, 'Entrar con correo o celular', 'button');
    await m.pagina.waitForFunction(() => location.pathname === '/login', { timeout: 10000 });
    await L.escribir(m.pagina, 'input[name="correo"]', 'mateo.cliente@example.com');
    await L.escribir(m.pagina, 'input[name="clave"]', CLAVE);
    await clic(m.pagina, 'Entrar', 'button[type="submit"]');
    await esperarTexto(m.pagina, 'Tus datos');
    comprobar('con sesión, el total y "Confirmar reserva" quedan fijos abajo', await m.pagina.evaluate(() => {
      const barra = [...document.querySelectorAll('div.fixed')].find(d => d.textContent.includes('Confirmar reserva'));
      const abajo = barra ? barra.getBoundingClientRect().bottom : -1;
      return !!barra && getComputedStyle(barra).position === 'fixed' && Math.abs(abajo - document.documentElement.clientHeight) < 2;
    }));
    comprobar('y ahí los accesos rápidos se quitan: no quedan dos barras una sobre otra', await m.pagina.evaluate(sel => !document.querySelector(sel), BARRA));
    comprobar('en celular los campos van a 16 px (Safari no hace zoom al tocarlos)', await m.pagina.evaluate(() => [...document.querySelectorAll('input:not([type="checkbox"]), select, textarea')].every(c => parseFloat(getComputedStyle(c).fontSize) >= 16)));
    await L.escribir(m.pagina, 'input[type="tel"]', '3001234567');
    await revisar(m.pagina, 'reservar, paso 4');
    if (ancho === 390) await captura(m.pagina, '58-movil-reservar-4', true);
    await m.pagina.evaluate(() => [...document.querySelectorAll('div.fixed button')].find(b => b.textContent.includes('Confirmar reserva')).click());
    await esperarTexto(m.pagina, 'Te esperamos');
    await revisar(m.pagina, 'comprobante');
    comprobar('con la reserva hecha, los accesos rápidos vuelven', await m.pagina.evaluate(sel => !!document.querySelector(sel), BARRA));
    comprobar('a un cliente no le sale "Panel" en la barra', await m.pagina.evaluate(sel => ![...document.querySelectorAll(`${sel} a`)].some(e => e.textContent.trim() === 'Panel'), BARRA));
    if (ancho === 390) await captura(m.pagina, '59-movil-comprobante', true);
    comprobar('con sesión, la barra muestra "Mis reservas" sin que se monte nada', await m.pagina.evaluate(() => {
      const barra = document.querySelector('header .flex.h-20') ?? document.querySelector('header > div > div');
      const hijos = [...barra.children].map(h => h.getBoundingClientRect());
      const seMontan = hijos.some((a, i) => hijos.some((b, j) => j > i && a.right > b.left + 1 && b.right > a.left + 1));
      return document.querySelector('header').textContent.includes('Mis reservas') && !seMontan;
    }));
    await ir(m.pagina, '/mis-citas');
    await esperarTexto(m.pagina, 'Próximas');
    await revisar(m.pagina, 'mis reservas');
    if (ancho === 390) await captura(m.pagina, '60-movil-mis-reservas', true);
    // Deja el horario libre para la siguiente pasada.
    await clic(m.pagina, 'Cancelar', 'button');
    await esperarTexto(m.pagina, '¿Cancelar esta reserva?');
    await revisar(m.pagina, 'ventana de confirmación');
    if (ancho === 390) await captura(m.pagina, '61-movil-confirmar');
    await clic(m.pagina, 'Sí, cancelar', 'button');
    await esperarTexto(m.pagina, 'Reserva cancelada');
    const ruido = L.limpia(m.consola);
    comprobar('consola sin errores', ruido.length === 0, '\n      ' + ruido.slice(0, 6).join('\n      '));
    await m.cerrar();
  }

  seccion('celular de 390 px: paneles');
  const b = await L.sesion(navegador, { movil: true });
  global.ultimaPagina = b.pagina;
  await L.elegirCookies(b.pagina);
  // El rol de barbero se asigna cuando el admin abre Equipo.
  const a = await L.sesion(navegador, { movil: true });
  await L.elegirCookies(a.pagina);
  await L.entrar(b.pagina, 'trip.demo@example.com', CLAVE);
  await L.entrar(a.pagina, ADMIN, CLAVE);
  global.ultimaPagina = a.pagina;
  await esperarTexto(a.pagina, 'Hola, Bryan');
  await pausa(1000);
  await revisar(a.pagina, 'admin, inicio');
  await captura(a.pagina, '62-movil-admin-inicio');

  // Agendas recurrentes: la pestaña, el botón flotante (sobre la barra de abajo) y la ventana de tres pasos.
  const enDialogo = (legend, accion) => a.pagina.evaluate((legend, accion) => {
    const campo = [...document.querySelectorAll('[role="dialog"] fieldset')].find(f => f.querySelector('legend')?.textContent.trim() === legend);
    const boton = campo && [...campo.querySelectorAll('button')].find(b => !b.disabled && (accion === 'primero' || b.textContent.includes(accion)));
    boton?.click();
    return !!boton;
  }, legend, accion);
  await a.pagina.evaluate(() => [...document.querySelectorAll('nav[aria-label="Secciones del panel"] button')].filter(x => x.getClientRects().length).find(x => x.textContent.trim() === 'Recurrentes').click());
  await esperarTexto(a.pagina, 'Aún no hay agendas recurrentes');
  await pausa(700);
  await revisar(a.pagina, 'admin, agendas recurrentes');
  const fab = await a.pagina.evaluate(() => {
    const boton = document.querySelector('button[aria-label="Nueva agenda recurrente"]');
    const barra = [...document.querySelectorAll('nav[aria-label="Secciones del panel"]')].find(n => n.getClientRects().length);
    if (!boton || !barra) return null;
    const r = boton.getBoundingClientRect();
    return { fijo: getComputedStyle(boton).position === 'fixed', sobreLaBarra: r.bottom <= barra.getBoundingClientRect().top - 4, dentro: r.left >= 0 && r.right <= innerWidth, alto: Math.round(r.height) };
  });
  comprobar('el botón flotante de "Nueva agenda recurrente" queda fijo, sobre la barra de abajo y grande para el dedo', !!fab && fab.fijo && fab.sobreLaBarra && fab.dentro && fab.alto >= 48, JSON.stringify(fab));
  await captura(a.pagina, '66g-movil-recurrentes');
  await a.pagina.click('button[aria-label="Nueva agenda recurrente"]');
  await esperarTexto(a.pagina, 'I · Cliente');
  await pausa(600);
  comprobar('mientras la ventana está abierta el botón flotante no estorba', !(await a.pagina.$('button[aria-label="Nueva agenda recurrente"]')));
  await revisar(a.pagina, 'agenda recurrente, paso I (cliente)');
  await captura(a.pagina, '66h-movil-recurrente-cliente');
  await clic(a.pagina, 'Continuar sin agregar cliente', 'button');
  await esperarTexto(a.pagina, 'II · Servicio');
  await revisar(a.pagina, 'agenda recurrente, paso II (servicio)');
  await clic(a.pagina, 'Acicale sencillo', '[role="dialog"] button');
  await esperarTexto(a.pagina, 'III · Agenda');
  await enDialogo('Día', 'primero');
  await a.pagina.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] fieldset')]
    .some(f => f.querySelector('legend')?.textContent.trim() === 'Hora' && f.querySelectorAll('button[aria-pressed]').length > 0), { timeout: 15000 });
  await pausa(600);
  comprobar('en celular se elige el día y aparecen sus horas, con una libre para elegir', await enDialogo('Hora', 'Libre'));
  await pausa(400);
  await revisar(a.pagina, 'agenda recurrente, paso III (agenda)');
  const crear = await a.pagina.evaluate(() => {
    const r = [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.includes('Crear cita recurrente')).getBoundingClientRect();
    return { aLaVista: r.top >= 0 && r.bottom <= innerHeight, alto: Math.round(r.height) };
  });
  comprobar('"Crear cita recurrente" queda siempre a la vista abajo, sin tener que bajar', crear.aLaVista && crear.alto >= 40, JSON.stringify(crear));
  await captura(a.pagina, '66i-movil-recurrente-agenda');
  await a.pagina.keyboard.press('Escape');
  await pausa(300);

  for (const [pestana, espera, archivo] of [['Citas', 'Agenda del día', '63-movil-admin-citas'], ['Ganancias', 'Queda para la barbería', null], ['Servicios', 'Acicale Premium', null],
    ['Equipo', 'trip.demo@example.com', '64-movil-admin-equipo'], ['Usuarios', 'Usuarios y roles', '65-movil-admin-usuarios'], ['Ajustes', 'Horario de atención', '66-movil-admin-ajustes']]) {
    await a.pagina.evaluate(t => [...document.querySelectorAll('nav[aria-label="Secciones del panel"] button')].filter(x => x.getClientRects().length).find(x => x.textContent.trim() === t).click(), pestana);
    await esperarTexto(a.pagina, espera);
    await pausa(700);
    await revisar(a.pagina, `admin, ${pestana.toLowerCase()}`);
    if (archivo) await captura(a.pagina, archivo, false);
    if (pestana === 'Citas') {
      // La lista con sus filtros: barbero, días y buscador.
      await clic(a.pagina, 'Lista', '[aria-label="Cómo ver las citas"] button');
      await clic(a.pagina, 'Trip', '[aria-label="Ver las citas de"] button');
      await clic(a.pagina, 'Pasadas', '[aria-label="Qué días ver"] button');
      await pausa(500);
      await revisar(a.pagina, 'admin, lista de citas filtrada por barbero y días');
      comprobar('en la lista del celular, cada día lleva su título con cuántas citas tiene', await a.pagina.evaluate(() =>
        [...document.querySelectorAll('section h3')].filter(h => h.getClientRects().length).every(h => /\d+ citas?$/.test(h.textContent.trim()))
        && [...document.querySelectorAll('section h3')].some(h => h.getClientRects().length)));
      await captura(a.pagina, '63b-movil-admin-lista', false);
      comprobar('cada cliente de la lista lleva su carita de asistencia', await a.pagina.evaluate(() => {
        const tarjetas = [...document.querySelectorAll('li.tarjeta')].filter(li => li.getClientRects().length);
        return tarjetas.length > 0 && tarjetas.every(li => li.querySelector('app-carita[data-nivel]'));
      }));
      await clic(a.pagina, '¿Qué dicen las caritas?', 'summary');
      await pausa(300);
      await revisar(a.pagina, 'admin, leyenda de las caritas');
      await captura(a.pagina, '63c-movil-caritas', false);
      await clic(a.pagina, '¿Qué dicen las caritas?', 'summary');
      await clic(a.pagina, 'Todos', '[aria-label="Ver las citas de"] button');
      await clic(a.pagina, 'Próximas', '[aria-label="Qué días ver"] button');
      await clic(a.pagina, 'Calendario', '[aria-label="Cómo ver las citas"] button');
      // La ventana para dejar un día solo para algunos servicios (desde la agenda del día).
      await pausa(400);
      await clic(a.pagina, 'Limitar', '[data-servicios-del-dia] button');
      await esperarTexto(a.pagina, '¿Qué se reserva este día?');
      await clic(a.pagina, 'Solo algunos', '[role="dialog"] button');
      await pausa(400);
      await revisar(a.pagina, 'ventana "¿Qué se reserva este día?"');
      await captura(a.pagina, '63d-movil-servicios-del-dia', false);
      await clic(a.pagina, 'Cancelar', '[role="dialog"] button');
    }
  }
  // La multa por no asistir (quedó en Ajustes): activa, con su valor y cómo se pone. Sin guardar.
  await clic(a.pagina, 'Sin multa', '[data-ajuste-multa] label');
  await pausa(300);
  await a.pagina.$eval('[data-ajuste-multa]', el => el.scrollIntoView({ block: 'center' }));
  await revisar(a.pagina, 'admin, ajustes con la multa activa');
  await captura(a.pagina, '66j-movil-ajustes-multa', false);
  await clic(a.pagina, 'Activa', '[data-ajuste-multa] label');
  // Agenda por periodos (quedó en Ajustes): la sección con sus fechas y el aviso que deja en el Inicio.
  await clic(a.pagina, 'Por periodos', 'button[role="radio"]');
  await esperarTexto(a.pagina, 'Tus clientes pueden reservar hasta el');
  await revisar(a.pagina, 'admin, ajustes con la agenda por periodos');
  await a.pagina.$eval('input[name="agendaDesde"]', el => el.scrollIntoView({ block: 'center' }));
  await captura(a.pagina, '66b-movil-admin-agenda');
  await clic(a.pagina, 'Guardar ajustes', 'button[type="submit"]');
  await esperarTexto(a.pagina, 'Ajustes guardados');
  await a.pagina.evaluate(() => [...document.querySelectorAll('nav[aria-label="Secciones del panel"] button')].filter(x => x.getClientRects().length).find(x => x.textContent.trim() === 'Inicio').click());
  await esperarTexto(a.pagina, 'Abrir 15 días más');
  await pausa(700);
  await revisar(a.pagina, 'admin, inicio con el aviso de la agenda');
  await captura(a.pagina, '66c-movil-admin-inicio-agenda');
  // Y lo que ve el cliente en su celular: la hoja del horario y el calendario cuentan hasta cuándo se reserva.
  const c = await L.sesion(navegador, { movil: true });
  await L.elegirCookies(c.pagina);
  await ir(c.pagina, '/reservar');
  await clic(c.pagina, 'Horario', `${BARRA} button`);
  await c.pagina.waitForSelector(HOJA, { timeout: 5000 });
  await pausa(500);
  comprobar('con la agenda por periodos, la hoja del horario dice hasta cuándo se puede reservar', await c.pagina.evaluate(sel => document.querySelector(sel).textContent.includes('Agenda abierta hasta el'), HOJA));
  await revisar(c.pagina, 'hoja del horario con el periodo de agenda');
  await captura(c.pagina, '66d-movil-horario-agenda');
  await c.pagina.click(`${HOJA} button[aria-label="Cerrar el horario"]`);
  await pausa(300);
  await clic(c.pagina, 'Jose Julian', 'button');
  await clic(c.pagina, 'Barba2', 'button');
  await esperarTexto(c.pagina, 'Las fechas siguientes se habilitan más adelante');
  await revisar(c.pagina, 'reservar, paso 3 con el periodo de agenda');
  await captura(c.pagina, '66e-movil-reservar-agenda', true);
  const ruidoCliente = L.limpia(c.consola);
  comprobar('consola del cliente sin errores', ruidoCliente.length === 0, '\n      ' + ruidoCliente.slice(0, 6).join('\n      '));
  await c.cerrar();

  comprobar('en celular el admin tiene "Ver página" y "Salir" a la mano', await a.pagina.evaluate(() => {
    const cabecera = [...document.querySelectorAll('header')].find(h => h.getClientRects().length);
    return cabecera.textContent.includes('Ver página') && !!cabecera.querySelector('button[aria-label="Cerrar sesión"]');
  }));

  // El equipo, en la página pública: "Panel" en el centro de la barra de accesos.
  const panelEnLaBarra = pagina => pagina.evaluate(sel => {
    const accesos = [...document.querySelectorAll(`${sel} li`)].map(li => li.textContent.trim());
    const enlace = [...document.querySelectorAll(`${sel} a`)].find(e => e.textContent.trim() === 'Panel');
    return { accesos, medio: accesos[Math.floor(accesos.length / 2)], ruta: enlace?.getAttribute('href') ?? null };
  }, BARRA);
  await ir(a.pagina, '/');
  await a.pagina.waitForFunction(sel => [...document.querySelectorAll(`${sel} a`)].some(e => e.textContent.trim() === 'Panel'), { timeout: 10000 }, BARRA).catch(() => {});
  let panel = await panelEnLaBarra(a.pagina);
  comprobar('al admin le sale "Panel" en la mitad de la barra, y lo lleva a /admin', panel.accesos.length === 5 && panel.medio === 'Panel' && panel.ruta === '/admin', JSON.stringify(panel));
  await revisar(a.pagina, 'inicio con el acceso al panel (admin)');
  await captura(a.pagina, '66f-movil-barra-con-panel');
  await clic(a.pagina, 'Panel', `${BARRA} a`);
  await a.pagina.waitForFunction(() => location.pathname === '/admin', { timeout: 10000 });
  comprobar('y con un toque está en su panel', true);
  const ruidoAdmin = L.limpia(a.consola);
  comprobar('consola del admin sin errores', ruidoAdmin.length === 0, '\n      ' + ruidoAdmin.slice(0, 6).join('\n      '));
  await a.cerrar();

  await ir(b.pagina, '/');
  global.ultimaPagina = b.pagina;
  await b.pagina.waitForFunction(sel => [...document.querySelectorAll(`${sel} a`)].some(e => e.textContent.trim() === 'Panel'), { timeout: 10000 }, BARRA).catch(() => {});
  panel = await panelEnLaBarra(b.pagina);
  comprobar('al barbero también: "Panel" en la mitad, hacia su panel (/barbero)', panel.accesos.length === 5 && panel.medio === 'Panel' && panel.ruta === '/barbero', JSON.stringify(panel));
  await clic(b.pagina, 'Panel', `${BARRA} a`);
  await b.pagina.waitForFunction(() => location.pathname === '/barbero', { timeout: 10000 });
  await esperarTexto(b.pagina, 'Hola, Juan');
  await pausa(1000);
  await revisar(b.pagina, 'barbero, agenda');
  await captura(b.pagina, '67-movil-barbero', true);
  const NAV_BARBERO = 'nav[aria-label="Secciones de mi panel"]';
  const barraBarbero = await b.pagina.evaluate(sel => {
    const nav = [...document.querySelectorAll(sel)].find(n => n.getClientRects().length && getComputedStyle(n).position === 'fixed');
    if (!nav) return null;
    const r = nav.getBoundingClientRect();
    return { textos: [...nav.querySelectorAll('button')].map(x => x.textContent.trim()), abajo: Math.abs(r.bottom - document.documentElement.clientHeight) < 2 };
  }, NAV_BARBERO);
  comprobar('el barbero tiene su barra de botones abajo: Agenda, Citas, Recurrentes, Horario y Ganancias',
    !!barraBarbero && barraBarbero.abajo && barraBarbero.textos.join() === 'Agenda,Citas,Recurrentes,Horario,Ganancias', JSON.stringify(barraBarbero));
  // Sus citas en calendario y en lista, como en el panel del admin.
  await clic(b.pagina, 'Citas', `${NAV_BARBERO} button`);
  await esperarTexto(b.pagina, 'Tus citas');
  await esperarTexto(b.pagina, 'Agenda del día');
  await pausa(800);
  await revisar(b.pagina, 'barbero, calendario de sus citas');
  await captura(b.pagina, '67c-movil-barbero-calendario', true);
  await clic(b.pagina, 'Lista', '[aria-label="Cómo ver las citas"] button');
  await pausa(600);
  await revisar(b.pagina, 'barbero, lista de sus citas');
  await captura(b.pagina, '67d-movil-barbero-lista', true);
  await clic(b.pagina, 'Recurrentes', `${NAV_BARBERO} button`);
  await esperarTexto(b.pagina, 'Mis agendas recurrentes');
  await revisar(b.pagina, 'barbero, agendas recurrentes');
  const fabBarbero = await b.pagina.evaluate(sel => {
    const boton = document.querySelector('button[aria-label="Nueva agenda recurrente"]');
    const barra = [...document.querySelectorAll(sel)].find(n => getComputedStyle(n).position === 'fixed');
    if (!boton || !barra) return null;
    const r = boton.getBoundingClientRect();
    return { sobreLaBarra: r.bottom <= barra.getBoundingClientRect().top + 1, alto: Math.round(r.height) };
  }, NAV_BARBERO);
  comprobar('y el mismo botón flotante de "Nueva agenda recurrente", sobre la barra', !!fabBarbero && fabBarbero.sobreLaBarra && fabBarbero.alto >= 48, JSON.stringify(fabBarbero));
  await captura(b.pagina, '67b-movil-barbero-recurrentes', true);
  await clic(b.pagina, 'Horario', `${NAV_BARBERO} button`);
  await esperarTexto(b.pagina, 'Cada semana');
  await revisar(b.pagina, 'barbero, disponibilidad');
  await captura(b.pagina, '68-movil-barbero-disponibilidad', true);
  await b.cerrar();

  seccion('instalar la app: lo que ve un iPhone');
  const iphone = await L.sesion(navegador, { movil: true });
  global.ultimaPagina = iphone.pagina;
  await iphone.pagina.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
  await L.elegirCookies(iphone.pagina);
  await ir(iphone.pagina, '/instalar');
  await esperarTexto(iphone.pagina, 'en tu celular');
  comprobar('a un iPhone le abre directo los pasos de Safari (Compartir y "Agregar a inicio")', await iphone.pagina.evaluate(() =>
    document.querySelector('button[aria-pressed="true"]')?.textContent.trim() === 'iPhone' && document.querySelector('.placa').textContent.includes('Agregar a inicio')));
  await captura(iphone.pagina, '53c-movil-instalar-iphone', true);
  const ruidoIphone = L.limpia(iphone.consola);
  comprobar('consola del iPhone sin errores', ruidoIphone.length === 0, '\n      ' + ruidoIphone.slice(0, 6).join('\n      '));
  await iphone.cerrar();

  seccion('política de seguridad de contenido (modo "solo reportar")');
  comprobar('ninguna carga de la página queda fuera de la política estricta', csp.length === 0, '\n      ' + [...new Set(csp)].slice(0, 8).join('\n      '));

  await navegador.close();
  process.exit(L.resumen() ? 1 : 0);
})().catch(async e => {
  console.error('\nFALLO DEL GUION:', e.message);
  try {
    await global.ultimaPagina.screenshot({ path: path.join(L.CAPTURAS, 'fallo.png') });
    console.error('URL:', global.ultimaPagina.url());
    console.error('Texto:', (await L.texto(global.ultimaPagina)).slice(0, 700));
  } catch { /* sin página */ }
  process.exit(2);
});
