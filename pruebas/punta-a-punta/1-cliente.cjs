// Parte 1: lo que ve un visitante (aviso de cookies, inicio, menú, reserva sin sesión) y el cliente
// (entrar al final, confirmar, mis reservas, cambiar horario, cancelar, reservar de nuevo).
const fs = require('fs');
const L = require('./lib.cjs');
const { comprobar, seccion, clic, ir, esperarTexto, captura, texto, pausa } = L;

const LOG = L.LOG_EMULADORES; // log de los emuladores (para ver los correos)
const CLAVE = 'Clave-segura-1';

/** Elige barbero, servicio, el segundo día disponible y una hora. Devuelve la hora elegida. */
async function elegirTurno(pagina, { barbero = 'Jose Julian', servicio = 'Barba2', indiceHora = 2 } = {}) {
  await esperarTexto(pagina, 'Elige a tu barbero');
  await clic(pagina, barbero, 'button');
  await esperarTexto(pagina, 'Elige tu servicio');
  await clic(pagina, servicio, 'button');
  await esperarTexto(pagina, 'Horas libres');
  return elegirDiaYHora(pagina, indiceHora);
}

async function elegirDiaYHora(pagina, indiceHora, indiceDia = 1) {
  await pagina.evaluate(indiceDia => {
    const dias = [...document.querySelectorAll('button[aria-pressed]')].filter(b => !b.disabled && /^\d+$/.test(b.textContent.trim()));
    dias[Math.min(indiceDia, dias.length - 1)].click();
  }, indiceDia);
  await pagina.waitForFunction(() => [...document.querySelectorAll('button[aria-pressed]')].some(b => /^\d{1,2}:\d{2} (AM|PM)$/.test(b.textContent.trim())), { timeout: 15000 });
  await pausa(400);
  const hora = await pagina.evaluate(i => {
    const horas = [...document.querySelectorAll('button[aria-pressed]')].filter(b => /^\d{1,2}:\d{2} (AM|PM)$/.test(b.textContent.trim()));
    const b = horas[Math.min(i, horas.length - 1)];
    b.click();
    return b.textContent.trim();
  }, indiceHora);
  await pausa(200);
  return hora;
}

(async () => {
  const navegador = await L.abrirNavegador();
  await L.reiniciar();
  const uid = await L.crearCuenta('mateo.cliente@example.com', CLAVE, 'Mateo Rincón');

  // ------------------------------------------------------------------
  seccion('buscadores: lo que recibe Google sin ejecutar JavaScript (páginas armadas al compilar)');
  const crudo = ruta => fetch(L.BASE + ruta).then(r => r.text());
  const sinEtiquetas = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const inicioCrudo = await crudo('/');
  const textoInicio = sinEtiquetas(inicioCrudo);
  comprobar('el inicio llega ya armado (sin la pantalla de carga) y con la marca para retomarlo', !inicioCrudo.includes('class="arranque"') && /<app-root[^>]*ng-server-context="ssg"/.test(inicioCrudo));
  comprobar('el titular dice qué es y dónde queda: "Barbería en Calima, Cali"', /<h1[^>]*>[\s\S]*Barbería en Calima, Cali[\s\S]*¡Energía, experiencia y calidad![\s\S]*<\/h1>/.test(inicioCrudo));
  comprobar('y trae el texto sobre la barbería, la dirección y el horario', textoInicio.includes('Tu barbería en Calima, al norte de Cali') && textoInicio.includes('Cl. 68 Nte. #4an - 52')
    && textoInicio.includes('Lun – Jue') && textoInicio.includes('9:20 AM – 7:40 PM'));
  comprobar('con título, descripción y dirección canónica', inicioCrudo.includes('<title>El Acicale · Barbería en Calima, Cali</title>')
    && inicioCrudo.includes('<link rel="canonical" href="https://elacicale.com/">') && /<meta name="description" content="Barbería en Calima, Cali\./.test(inicioCrudo));
  const ficha = JSON.parse(inicioCrudo.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  comprobar('la ficha del negocio para Google trae los servicios con precio', ficha['@type'] === 'BarberShop' && ficha.hasOfferCatalog.itemListElement.length === 3
    && ficha.hasOfferCatalog.itemListElement.every(o => o.priceCurrency === 'COP' && Number(o.price) > 0), JSON.stringify(ficha.hasOfferCatalog).slice(0, 200));
  comprobar('lo que hace aparecer al bajar ya llega visible (no queda escondido para Google)', !/class="[^"]*\brevelar\b(?![^"]*revelado)[^"]*"/.test(inicioCrudo));
  // El estado "abierto ahora" sale con la hora de quien compiló: va oculto hasta que el navegador pone la de verdad.
  const estados = [...inicioCrudo.matchAll(/<p[^>]*class="([^"]*)"[^>]*>(?:(?!<\/p>)[\s\S])*?(Abierto ahora|Cerrado ·)/g)];
  comprobar('"Abierto ahora / Cerrado" no se muestra con la hora de la compilación', estados.length > 0 && estados.every(m => /\binvisible\b/.test(m[1])), estados.map(m => m[1].slice(-40)).join(' | '));
  const serviciosCrudo = await crudo('/servicios');
  comprobar('servicios también llega armado, con su título y su canónica', serviciosCrudo.includes('<title>Precios de cortes y barba en Cali · El Acicale</title>')
    && serviciosCrudo.includes('<link rel="canonical" href="https://elacicale.com/servicios">'));
  const reservarCrudo = await crudo('/reservar');
  comprobar('reservar y los paneles abren con la app sin armar (index.csr.html)', reservarCrudo.includes('class="arranque"') && !reservarCrudo.includes('ng-server-context'));

  // ------------------------------------------------------------------
  seccion('visitante: aviso de cookies y contenido de terceros');
  const v = await L.sesion(navegador);
  global.ultimaPagina = v.pagina;
  const peticiones = [];
  /** Las que hace la página misma. El mapa de Google va en su propio marco y pide lo suyo (sus tipografías, por ejemplo). */
  const propias = [];
  v.pagina.on('request', r => { peticiones.push(r.url()); if (r.frame() === v.pagina.mainFrame()) propias.push(r.url()); });
  await ir(v.pagina, '/');
  await esperarTexto(v.pagina, 'Cookies y contenido de terceros');
  comprobar('sale el aviso de cookies en la primera visita', true);
  comprobar('antes de aceptar no se pide nada a Instagram', !peticiones.some(u => /instagram\.com/.test(u)), peticiones.filter(u => /instagram/.test(u)).join(' '));
  comprobar('la página no pide nada a Google Fonts ni a otros sitios de terceros (aparte del mapa, en su marco)', !propias.some(u => /fonts\.g|ui-avatars|mixkit|svgrepo|unsplash/.test(u)), propias.filter(u => /fonts\.g|ui-avatars|mixkit|svgrepo|unsplash/.test(u)).join(' '));
  // El mapa entra cuando la página ya pintó lo suyo (no compite con ella al abrir), sin esperar a que nadie acepte nada.
  await v.pagina.waitForSelector('iframe[title^="Mapa"]', { timeout: 10000 }).catch(() => {});
  comprobar('el mapa de cómo llegar se ve desde el principio, sin pedir permiso', await v.pagina.evaluate(() => !!document.querySelector('iframe[title^="Mapa"]')));
  // El inicio llega ya armado; las páginas que se arman en el navegador (reservar, paneles) muestran la marca mientras tanto.
  comprobar('mientras arranca la app sin armar se ve la marca, y la aplicación la reemplaza', await v.pagina.evaluate(async () => {
    const html = await fetch('/index.csr.html').then(r => r.text());
    return html.includes('class="arranque"') && !document.querySelector('.arranque');
  }));
  comprobar('y el aviso lo cuenta: el mapa es de Google y se muestra siempre', (await texto(v.pagina)).includes('es de Google y se muestra siempre'));
  await captura(v.pagina, '01-inicio-con-aviso');

  await clic(v.pagina, 'Solo las necesarias', 'button');
  await pausa(400);
  comprobar('"Solo las necesarias" cierra el aviso', !(await texto(v.pagina)).includes('Cookies y contenido de terceros'));
  comprobar('el mapa sigue ahí, y de Instagram no se cargó nada', await v.pagina.evaluate(() => document.querySelectorAll('iframe').length === 1 && !!document.querySelector('iframe[title^="Mapa"]')));
  await pausa(2500);
  await captura(v.pagina, '02-inicio');

  const estado = await v.pagina.evaluate(() => document.querySelector('[aria-live="polite"]')?.textContent.trim());
  comprobar('muestra si está abierto ahora', /^(Abierto ahora · cierra a las|Cerrado · abre)/.test(estado ?? ''), estado);
  comprobar('el equipo sale de Firestore (2 barberos con su Instagram)', await v.pagina.evaluate(() => {
    const tarjetas = [...document.querySelectorAll('#equipo article')];
    return tarjetas.length === 2 && tarjetas[0].textContent.includes('Jose Julian') && tarjetas[0].textContent.includes('@josejulian_barbero') && tarjetas[1].textContent.includes('Trip');
  }));
  comprobar('las fotos del equipo cargan', await v.pagina.evaluate(async () => {
    const fotos = [...document.querySelectorAll('#equipo article img')];
    fotos.forEach(f => f.loading = 'eager');
    await Promise.all(fotos.map(f => f.complete ? 0 : new Promise(r => { f.onload = f.onerror = r; })));
    return fotos.length === 2 && fotos.every(f => f.naturalWidth > 0);
  }));
  await v.pagina.evaluate(() => document.querySelector('#equipo').scrollIntoView());
  await captura(v.pagina, '03-equipo');
  await v.pagina.evaluate(() => document.querySelector('#galeria').scrollIntoView());
  await pausa(600);
  comprobar('la galería pide permiso antes de cargar Instagram', (await texto(v.pagina)).includes('Ver las publicaciones aquí') && !peticiones.some(u => /instagram\.com/.test(u)));
  await captura(v.pagina, '04-galeria-sin-permiso');
  await v.pagina.evaluate(() => document.querySelector('#contacto').scrollIntoView());
  await captura(v.pagina, '05-visitanos');
  await clic(v.pagina, 'Preferencias de cookies', 'button');
  await esperarTexto(v.pagina, 'Guardar mi elección');
  comprobar('"Preferencias de cookies" del pie vuelve a abrir las opciones', true);
  await captura(v.pagina, '06-preferencias-cookies');
  await clic(v.pagina, 'Guardar mi elección', 'button');

  seccion('visitante: menú, títulos y página que no existe');
  await ir(v.pagina, '/servicios');
  await esperarTexto(v.pagina, 'Acicale Premium');
  comprobar('el menú muestra los 3 servicios (sin Total color)', await v.pagina.evaluate(() => document.querySelectorAll('article').length === 3 && !document.body.textContent.includes('Total color')));
  comprobar('título de la pestaña por página', (await v.pagina.title()) === 'Precios de cortes y barba en Cali · El Acicale', await v.pagina.title());
  await captura(v.pagina, '07-servicios');
  await ir(v.pagina, '/una-pagina-que-no-existe');
  await esperarTexto(v.pagina, 'Esta página no existe');
  comprobar('una dirección que no existe lo dice (y pide no indexarla)', await v.pagina.evaluate(() => document.querySelector('meta[name="robots"]')?.content === 'noindex'));
  await captura(v.pagina, '08-no-encontrada');
  await ir(v.pagina, '/');
  comprobar('el inicio conserva su título y no lleva "noindex"', (await v.pagina.title()) === 'El Acicale · Barbería en Calima, Cali' && await v.pagina.evaluate(() => !document.querySelector('meta[name="robots"]')));

  // ------------------------------------------------------------------
  seccion('visitante: reservar sin iniciar sesión');
  await ir(v.pagina, '/reservar');
  comprobar('/reservar abre sin pedir sesión', v.pagina.url().endsWith('/reservar'));
  await captura(v.pagina, '09-reservar-paso-1');
  const hora = await elegirTurno(v.pagina);
  await captura(v.pagina, '10-reservar-paso-3');
  await clic(v.pagina, 'Continuar', 'button');
  await esperarTexto(v.pagina, 'Entra para confirmar');
  comprobar('elige barbero, servicio, día y hora sin cuenta; la sesión se pide solo al confirmar', true);
  await captura(v.pagina, '11-reservar-entrar');

  await clic(v.pagina, 'Entrar con correo o celular', 'button');
  await v.pagina.waitForFunction(() => location.pathname === '/login', { timeout: 10000 });
  comprobar('va a la pantalla de ingreso con ?volver=/reservar', v.pagina.url().includes('volver=%2Freservar'));
  await pausa(600);
  await captura(v.pagina, '12-login');
  comprobar('el login usa la foto del local (y nada de otros sitios)', await v.pagina.evaluate(() => {
    const fotos = [...document.querySelectorAll('img')].map(i => i.getAttribute('src'));
    return fotos.includes('fotos/local.webp') && fotos.every(f => !/^https?:/.test(f));
  }));

  const posLog = fs.statSync(LOG).size;
  await L.escribir(v.pagina, 'input[name="correo"]', 'mateo.cliente@example.com');
  await L.escribir(v.pagina, 'input[name="clave"]', CLAVE);
  await clic(v.pagina, 'Entrar', 'button[type="submit"]');
  await v.pagina.waitForFunction(() => location.pathname === '/reservar', { timeout: 20000 });
  await esperarTexto(v.pagina, 'Tus datos');
  const resumen = await v.pagina.evaluate(() => document.querySelector('aside')?.textContent.replace(/\s+/g, ' '));
  comprobar('al volver, conserva lo que había elegido (servicio, barbero y hora)', resumen.includes('Barba2') && resumen.includes('Jose Julian') && resumen.includes(hora), resumen);

  await L.escribir(v.pagina, 'input[type="tel"]', '12345');
  await clic(v.pagina, 'Confirmar reserva', 'button');
  await pausa(500);
  comprobar('un celular inválido no deja confirmar', (await texto(v.pagina)).includes('Escribe 10 dígitos que empiecen por 3'));
  await L.escribir(v.pagina, 'input[type="tel"]', '300 123 4567');
  await captura(v.pagina, '13-reservar-paso-4');
  await clic(v.pagina, 'Confirmar reserva', 'button');
  await esperarTexto(v.pagina, 'Te esperamos');
  await captura(v.pagina, '14-comprobante');
  comprobar('el comprobante ofrece avisarle a la barbería por WhatsApp, con la cita ya escrita', await v.pagina.evaluate(() => {
    const enlace = [...document.querySelectorAll('a')].find(e => e.textContent.includes('Avisar por WhatsApp'))?.href ?? '';
    return enlace.startsWith('https://wa.me/573153229528?text=') && decodeURIComponent(enlace).includes('Barba2');
  }));

  let citas = (await L.docs('citas')).filter(c => c.userId === uid);
  const primera = citas[0];
  comprobar('la cita queda guardada con su cupo y el celular limpio', citas.length === 1 && primera.estado === 'pendiente' && primera.cupoId === `${uid}_${primera.dia}_1` && primera.phone === '3001234567', JSON.stringify(primera));
  const aMinutos = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const agenda = await L.ocupacion('JoseJulian', primera.dia);
  comprobar('es un turno encadenado de ese día: al abrir (9:20, o 9:00 viernes y sábado) o justo cuando termina otra cita, cada 40 min', (() => {
    const apertura = [5, 6].includes(new Date(`${primera.dia}T12:00:00`).getDay()) ? 540 : 560;
    return L.turnos(L.sinCitas(agenda, id => id === primera.id), apertura, 1180, 60).includes(aMinutos(primera.hora));
  })(), `${primera.dia} ${primera.hora}`);
  comprobar('aparta justo su hora en la agenda del barbero (60 min) y su cupo del día',
    JSON.stringify(agenda?.citas?.[primera.id]) === JSON.stringify(L.tramo(aMinutos(primera.hora), 60))
      && !L.libreEn(L.sinCitas(agenda, () => false), aMinutos(primera.hora), 5) && !!(await L.doc(`cupos/${primera.cupoId}`)), JSON.stringify(agenda?.citas));
  await pausa(4000);
  let correos = L.correosDesde(LOG, posLog);
  comprobar('salen los correos de reserva nueva (cliente y barbero)', correos.includes('nueva:cliente') && correos.includes('nueva:barbero'), correos.join(' '));

  // ------------------------------------------------------------------
  seccion('cliente: mis reservas, cambiar horario y cancelar');
  await clic(v.pagina, 'Ver mis reservas', 'a');
  await esperarTexto(v.pagina, 'Próximas');
  comprobar('"Mis reservas" dice "Agendada" (no "pendiente")', await v.pagina.evaluate(() => {
    const t = document.querySelector('article')?.textContent ?? '';
    return t.includes('Agendada') && !/pendiente/i.test(t);
  }));
  await captura(v.pagina, '15-mis-reservas');

  const posLog2 = fs.statSync(LOG).size;
  await clic(v.pagina, 'Cambiar horario', 'button');
  await esperarTexto(v.pagina, 'Estás cambiando tu cita');
  await esperarTexto(v.pagina, 'Horas libres');
  comprobar('"Cambiar horario" abre la reserva con su barbero y servicio ya elegidos', true);
  // El turno siguiente al original (40 min después) o, si la demo de esa fecha tiene otra cita justo detrás (pasó con
  // demo0143 a las 12:00), el anterior (40 min antes): los dos se cruzan con la cita que se cambia.
  const minutosDe = h => { const [, hh, mm, ap] = h.match(/(\d+):(\d+) (AM|PM)/); return ((+hh % 12) + (ap === 'PM' ? 12 : 0)) * 60 + +mm; };
  const nuevaHora = await v.pagina.evaluate(async (dia, objetivos) => {
    const espera = ms => new Promise(r => setTimeout(r, ms));
    const numero = String(Number(dia.slice(8)));
    [...document.querySelectorAll('button[aria-pressed]')].find(b => !b.disabled && b.textContent.trim() === numero).click();
    await espera(1500);
    const aMin = t => { const m = t.match(/(\d+):(\d+) (AM|PM)/); return ((+m[1] % 12) + (m[3] === 'PM' ? 12 : 0)) * 60 + +m[2]; };
    const horas = [...document.querySelectorAll('button[aria-pressed]')].filter(b => /^\d{1,2}:\d{2} (AM|PM)$/.test(b.textContent.trim()));
    const b = objetivos.map(m => horas.find(h => aMin(h.textContent.trim()) === m)).find(Boolean);
    if (!b) return null;
    b.click();
    return b.textContent.trim();
  }, primera.dia, [minutosDe(hora) + 40, minutosDe(hora) - 40]);
  comprobar('ofrece un turno que se cruza con la cita que se cambia (su rato cuenta como libre)', !!nuevaHora, `original ${hora}`);
  await captura(v.pagina, '16-cambiar-horario');
  await clic(v.pagina, 'Continuar', 'button');
  await esperarTexto(v.pagina, 'Tus datos');
  await clic(v.pagina, 'Confirmar el cambio', 'button');
  await esperarTexto(v.pagina, 'quedó en el nuevo horario');
  await captura(v.pagina, '17-cita-cambiada');

  citas = (await L.docs('citas')).filter(c => c.userId === uid);
  const anterior = citas.find(c => c.id === primera.id);
  const nueva = citas.find(c => c.reemplazaA === primera.id);
  comprobar('la anterior queda cancelada y anota cuál la reemplaza', anterior?.estado === 'cancelada' && anterior?.reemplazadaPor === nueva?.id);
  const agenda2 = await L.ocupacion('JoseJulian', nueva?.dia);
  // Lo de la anterior que la nueva no cubre: antes de la nueva (si se corrió hacia adelante) o después (si hacia atrás).
  const [ini, fin] = [aMinutos(primera.hora), aMinutos(nueva?.hora ?? primera.hora)];
  const suelto = fin > ini ? [ini, fin - ini] : [fin + 60, ini - fin];
  comprobar('la agenda queda con el rato de la cita nueva, y el de la anterior se suelta',
    JSON.stringify(agenda2?.citas?.[nueva?.id]) === JSON.stringify(L.tramo(fin, 60)) && !(primera.id in (agenda2?.citas ?? {}))
      && L.libreEn(agenda2.mapa, suelto[0], suelto[1]), JSON.stringify(agenda2?.citas));
  comprobar('el cupo anterior se libera y la nueva ocupa otro', !(await L.doc(`cupos/${primera.cupoId}`)) && !!(await L.doc(`cupos/${nueva?.cupoId}`)));
  await pausa(4000);
  correos = L.correosDesde(LOG, posLog2);
  comprobar('un solo aviso de "cambió de horario" a cada uno (ni cancelación ni reserva nueva)',
    correos.filter(c => c.startsWith('reagendada:')).length === 2 && !correos.some(c => c.startsWith('cancelada:') || c.startsWith('nueva:')), correos.join(' '));

  await ir(v.pagina, '/mis-citas');
  await esperarTexto(v.pagina, 'Próximas');
  comprobar('en "Mis reservas" queda solo la cita nueva (la reemplazada no aparece)', await v.pagina.evaluate(h => {
    const t = document.body.textContent;
    return document.querySelectorAll('article').length === 1 && t.includes(h) && !t.includes('Historial');
  }, nuevaHora));

  const posLog3 = fs.statSync(LOG).size;
  await clic(v.pagina, 'Cancelar', 'button');
  await esperarTexto(v.pagina, '¿Cancelar esta reserva?');
  comprobar('cancelar pregunta con una ventana propia (no la del navegador)', !v.consola.some(l => l.includes('dialogo nativo')));
  await captura(v.pagina, '18-confirmar-cancelar');
  await clic(v.pagina, 'Sí, cancelar', 'button');
  await esperarTexto(v.pagina, 'Reserva cancelada');
  await pausa(1500);
  const cancelada = (await L.docs('citas')).find(c => c.id === nueva.id);
  const agenda3 = await L.ocupacion('JoseJulian', nueva.dia);
  comprobar('al cancelar se suelta su rato en la agenda y su cupo', cancelada.estado === 'cancelada' && !(nueva.id in agenda3.citas)
    && L.libreEn(agenda3.mapa, aMinutos(nueva.hora), 60) && !(await L.doc(`cupos/${nueva.cupoId}`)));
  await pausa(3500);
  correos = L.correosDesde(LOG, posLog3);
  comprobar('la cancelación sí avisa a los dos', correos.includes('cancelada:cliente') && correos.includes('cancelada:barbero'), correos.join(' '));
  await captura(v.pagina, '19-historial');

  await clic(v.pagina, 'Reservar de nuevo', 'button');
  await esperarTexto(v.pagina, 'Horas libres');
  comprobar('"Reservar de nuevo" va directo al horario con el mismo barbero y servicio', await v.pagina.evaluate(() => document.body.textContent.includes('Jose Julian') && document.body.textContent.includes('Barba2')));

  seccion('cliente: cupo de reservas por día');
  // Dos reservas el mismo día y, al intentar la tercera, la página avisa.
  for (const i of [0, 4]) {
    await ir(v.pagina, '/servicios'); await ir(v.pagina, '/reservar'); // por otra página: recargar /reservar conserva lo elegido
    await elegirTurno(v.pagina, { barbero: 'Cualquier barbero', servicio: 'Acicale sencillo', indiceHora: i });
    await clic(v.pagina, 'Continuar', 'button');
    await esperarTexto(v.pagina, 'Tus datos');
    await L.escribir(v.pagina, 'input[type="tel"]', '3001234567');
    await clic(v.pagina, 'Confirmar reserva', 'button');
    await esperarTexto(v.pagina, 'Te esperamos');
  }
  const activas = (await L.docs('citas')).filter(c => c.userId === uid && c.estado === 'pendiente');
  comprobar('"Cualquier barbero" asigna un barbero de verdad', activas.length === 2 && activas.every(c => ['JoseJulian', 'Trip'].includes(c.barberoId)), activas.map(c => c.barberoId).join(','));
  await ir(v.pagina, '/servicios'); await ir(v.pagina, '/reservar');
  await elegirTurno(v.pagina, { barbero: 'Cualquier barbero', servicio: 'Acicale sencillo', indiceHora: 8 });
  comprobar('con 2 reservas ese día, la tercera no se deja confirmar', (await texto(v.pagina)).includes('Ya tienes 2 reservas para este día')
    && await v.pagina.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Continuar')).disabled));
  await captura(v.pagina, '20-cupo-agotado');

  const ruido = L.limpia(v.consola);
  comprobar('consola sin errores en todo el recorrido', ruido.length === 0, '\n      ' + ruido.slice(0, 8).join('\n      '));
  await v.cerrar();
  await navegador.close();
  process.exit(L.resumen() ? 1 : 0);
})().catch(async e => {
  console.error('\nFALLO DEL GUION:', e.message);
  try {
    await global.ultimaPagina.screenshot({ path: require('path').join(L.CAPTURAS, 'fallo.png') });
    console.error('URL:', global.ultimaPagina.url());
    console.error('Texto:', (await L.texto(global.ultimaPagina)).slice(0, 900));
  } catch { /* sin página */ }
  process.exit(2);
});
