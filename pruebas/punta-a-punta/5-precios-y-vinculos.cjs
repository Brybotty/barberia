// Parte 5: precios propios de un barbero y servicios propios (el admin sube los suyos sin tocar los del otro), y las
// citas que el equipo le registra a un cliente sin cuenta (desde el panel o con una agenda recurrente), que el cliente
// ve en "Mis reservas" si entra con ese celular o con ese correo.
// Necesita el emulador de funciones con el código compilado (los turnos de la agenda recurrente los aparta la función).
const L = require('./lib.cjs');
const { comprobar, seccion, clic, ir, esperarTexto, captura, texto, pausa } = L;

const CLAVE = 'Clave-segura-1';
const ADMIN = 'ortizgonzalesbryanalexander1@gmail.com';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const p2 = n => String(n).padStart(2, '0');
const fechaEn = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const diaSemana = dia => new Date(`${dia}T12:00:00`).getDay();
/** "$ 70.000", "$70.000"...: se compara solo la cifra. */
const conPrecio = (t, cifra) => new RegExp(`\\$\\s?${cifra.replace('.', '\\.')}`).test(t);
const pestana = async (pagina, nombre) => { await clic(pagina, nombre, 'aside nav button'); await pausa(700); };

/** Espera (consultando el emulador) a que `condicion` devuelva algo, hasta `ms`. */
async function hasta(condicion, ms = 30000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const valor = await condicion();
    if (valor) return valor;
    await pausa(500);
  }
  return condicion();
}

/** Le pone a la cuenta un celular, como si hubiera entrado por SMS: su token trae `phone_number`. */
async function ponerCelular(uid, telefono) {
  const r = await fetch(`${AUTH}/projects/demo-acicale/accounts:update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: uid, phoneNumber: telefono }),
  });
  if (!r.ok) throw new Error('No se le puso el celular a la cuenta: ' + await r.text());
}

/** Elige una opción de un <select> por su texto (como lo haría la persona, avisando a Angular). */
async function elegirOpcion(pagina, nombre, texto) {
  const hecho = await pagina.$eval(`select[name="${nombre}"]`, (s, t) => {
    const i = [...s.options].findIndex(o => o.textContent.includes(t));
    if (i < 0) return false;
    s.selectedIndex = i;
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, texto);
  if (!hecho) throw new Error(`No hay "${texto}" en ${nombre}`);
  await pausa(400);
}
const opciones = (pagina, nombre) => pagina.$$eval(`select[name="${nombre}"] option`, os => os.map(o => o.textContent.trim()));

/** Las tarjetas de servicios del paso II de la reserva: nombre → texto de la tarjeta. */
const serviciosReserva = pagina => pagina.evaluate(() => Object.fromEntries([...document.querySelectorAll('section button h4')]
  .map(h => [h.textContent.trim(), h.closest('button').textContent.replace(/\s+/g, ' ')])));

// --- La ventana de la agenda recurrente (como en 4-recurrentes.cjs) ---
const campo = legend => `[...document.querySelectorAll('[role="dialog"] fieldset')].find(f => f.querySelector('legend')?.textContent.trim() === ${JSON.stringify(legend)})`;
async function elegirEn(pagina, legend, inicio) {
  const hecho = await pagina.evaluate(`(() => { const c = ${campo(legend)}; const b = c && [...c.querySelectorAll('button')].find(x => !x.disabled && x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(inicio)})); if (b) b.click(); return !!b; })()`);
  if (!hecho) throw new Error(`No se pudo elegir "${inicio}" en "${legend}"`);
  await pausa(300);
}

(async () => {
  const navegador = await L.abrirNavegador();
  await L.reiniciar();
  await L.crearCuenta(ADMIN, CLAVE, 'Bryan Ortiz');
  await L.crearCuenta('mateo.cliente@example.com', CLAVE, 'Mateo Rincón');
  // Sofía entró con su celular (su token lo trae verificado); Andrés, con su correo.
  const uidSofia = await L.crearCuenta('sofia.celular@example.com', CLAVE, 'Sofía Celular');
  await ponerCelular(uidSofia, '+573157778899');
  await L.crearCuenta('andres.correo@example.com', CLAVE, 'Andrés Correo');

  // ------------------------------------------------------------------
  seccion('admin: su propio precio en un servicio, sin tocar el del otro barbero');
  const a = await L.sesion(navegador);
  global.ultimaPagina = a.pagina;
  await L.elegirCookies(a.pagina);
  await L.entrar(a.pagina, ADMIN, CLAVE);
  await esperarTexto(a.pagina, 'Hola, Bryan');
  await pestana(a.pagina, 'Servicios y precios');
  await esperarTexto(a.pagina, 'Ver el menú de');
  comprobar('ofrece ver el menú de cada barbero', await a.pagina.evaluate(() =>
    [...document.querySelectorAll('[role="group"][aria-label="Ver el menú de"] button')].map(b => b.textContent.replace(/\s+/g, ' ').trim()).join('|')).then(t => t.includes('Todos (precio general)') && t.includes('Jose Julian') && t.includes('Trip')));

  await a.pagina.click('button[aria-label="Editar Acicale Premium"]');
  await esperarTexto(a.pagina, 'Precio con cada barbero');
  comprobar('al editar, cada barbero tiene su precio vacío (cobra el general)', await a.pagina.evaluate(() =>
    ['JoseJulian', 'Trip'].every(id => document.querySelector(`input[name="precio-${id}"]`)?.value === '')));
  await L.escribir(a.pagina, 'input[name="precio-JoseJulian"]', '70000');
  await captura(a.pagina, '90-precio-por-barbero');
  await clic(a.pagina, 'Guardar cambios', 'button[type="submit"]');
  const premium = await hasta(async () => { const s = await L.doc('servicios/S3'); return s?.precios?.JoseJulian === 70000 ? s : null; });
  comprobar('se guarda el precio de Jose y el general sigue igual (Trip cobra el general)', !!premium && premium.precio === 60000
    && JSON.stringify(premium.precios) === JSON.stringify({ JoseJulian: 70000 }), JSON.stringify(premium));
  await pausa(600);
  comprobar('la tarjeta dice el precio de Jose junto al general', await a.pagina.evaluate(() =>
    [...document.querySelectorAll('[data-precios-propios]')].map(u => u.textContent.replace(/\s+/g, ' ')).join()).then(t => conPrecio(t, '70.000') && t.includes('Con Jose Julian')));

  await clic(a.pagina, 'Jose Julian', '[role="group"][aria-label="Ver el menú de"] button');
  const tarjetaPremium = () => a.pagina.evaluate(() => [...document.querySelectorAll('li.tarjeta')].find(li => li.textContent.includes('Acicale Premium'))?.textContent.replace(/\s+/g, ' ') ?? '');
  const tarjetaSencillo = () => a.pagina.evaluate(() => [...document.querySelectorAll('li.tarjeta')].find(li => li.textContent.includes('Acicale sencillo'))?.textContent.replace(/\s+/g, ' ') ?? '');
  comprobar('en el menú de Jose, el Premium sale a su precio ("Su precio") y el sencillo al general', conPrecio(await tarjetaPremium(), '70.000')
    && (await tarjetaPremium()).includes('Su precio') && conPrecio(await tarjetaSencillo(), '30.000') && (await tarjetaSencillo()).includes('General'));
  await clic(a.pagina, 'Juan Sebastián', '[role="group"][aria-label="Ver el menú de"] button');
  comprobar('en el de Trip, el Premium sigue a 60.000', conPrecio(await tarjetaPremium(), '60.000') && !conPrecio(await tarjetaPremium(), '70.000'));
  await clic(a.pagina, 'Todos (precio general)', '[role="group"][aria-label="Ver el menú de"] button');

  seccion('admin: un servicio propio de Jose');
  await clic(a.pagina, 'Nuevo servicio', 'button');
  await L.escribir(a.pagina, 'input[name="nombre"]', 'Corte de autor');
  await L.escribir(a.pagina, 'input[name="precio"]', '90000');
  await clic(a.pagina, 'Solo Jose Julian', '[role="radiogroup"] button');
  comprobar('un servicio propio no pide precio por barbero (es solo suyo)', !(await texto(a.pagina)).includes('Precio con cada barbero')
    && (await texto(a.pagina)).includes('solo se reserva con él'));
  await clic(a.pagina, 'Agregar servicio', 'button[type="submit"]');
  const deAutor = await hasta(async () => (await L.docs('servicios')).find(s => s.nombre === 'Corte de autor'));
  comprobar('se guarda como propio de Jose, sin precios por barbero', !!deAutor && deAutor.soloDe === 'JoseJulian' && !('precios' in deAutor) && deAutor.precio === 90000, JSON.stringify(deAutor));
  await pausa(600);
  comprobar('la tarjeta dice de quién es', (await texto(a.pagina)).includes('Servicio propio de Jose Julian'));
  const habilitables = await a.pagina.evaluate(() => Object.fromEntries([...document.querySelectorAll('[role="group"][aria-label^="Servicios que se reservan con"]')]
    .map(g => [g.getAttribute('aria-label'), [...g.querySelectorAll('button')].map(b => b.textContent.trim())])));
  const deQuien = n => Object.entries(habilitables).find(([k]) => k.includes(n))?.[1] ?? [];
  comprobar('en "Qué se puede reservar con cada barbero", el servicio propio sale solo con Jose', deQuien('Jose').includes('Corte de autor') && !deQuien('Trip').includes('Corte de autor'), JSON.stringify(habilitables));
  await captura(a.pagina, '91-servicios-propios', true);

  // ------------------------------------------------------------------
  seccion('visitante: cada barbero con sus precios');
  const v = await L.sesion(navegador);
  await L.elegirCookies(v.pagina);
  await ir(v.pagina, '/servicios');
  await esperarTexto(v.pagina, 'Corte de autor');
  const menu = await texto(v.pagina);
  comprobar('el menú dice el precio de Jose junto al general y de quién es el servicio propio', /Con Jose Julian: \$\s?70\.000/.test(menu) && menu.includes('Solo con Jose Julian'));
  await ir(v.pagina, '/reservar');
  await esperarTexto(v.pagina, 'Elige a tu barbero');
  await clic(v.pagina, 'Jose Julian', 'button');
  await esperarTexto(v.pagina, 'Elige tu servicio');
  let tarjetas = await serviciosReserva(v.pagina);
  comprobar('con Jose: el Premium a su precio y su servicio propio', conPrecio(tarjetas['Acicale Premium'] ?? '', '70.000') && 'Corte de autor' in tarjetas, JSON.stringify(tarjetas));
  await captura(v.pagina, '92-reservar-con-jose');
  await clic(v.pagina, 'Atrás', 'button');
  await clic(v.pagina, 'Juan Sebastián', 'button');
  await esperarTexto(v.pagina, 'Elige tu servicio');
  tarjetas = await serviciosReserva(v.pagina);
  comprobar('con Trip: el Premium al general y sin el servicio propio de Jose', conPrecio(tarjetas['Acicale Premium'] ?? '', '60.000') && !('Corte de autor' in tarjetas), JSON.stringify(tarjetas));
  await clic(v.pagina, 'Atrás', 'button');
  await clic(v.pagina, 'Cualquier barbero', 'button');
  await esperarTexto(v.pagina, 'Elige tu servicio');
  tarjetas = await serviciosReserva(v.pagina);
  comprobar('con "Cualquier barbero": el Premium al precio más bajo y el servicio propio dice con quién es', conPrecio(tarjetas['Acicale Premium'] ?? '', '60.000')
    && (tarjetas['Corte de autor'] ?? '').includes('Solo con Jose Julian'), JSON.stringify(tarjetas));

  seccion('cliente: reserva con Jose y paga su precio');
  const m = await L.sesion(navegador);
  global.ultimaPagina = m.pagina;
  await L.elegirCookies(m.pagina);
  await L.entrar(m.pagina, 'mateo.cliente@example.com', CLAVE, '/reservar');
  await esperarTexto(m.pagina, 'Elige a tu barbero');
  await clic(m.pagina, 'Jose Julian', 'button');
  await esperarTexto(m.pagina, 'Elige tu servicio');
  await clic(m.pagina, 'Acicale Premium', 'button');
  await esperarTexto(m.pagina, 'Horas libres');
  await m.pagina.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].filter(b => !b.disabled && /^\d+$/.test(b.textContent.trim()))[1].click());
  await m.pagina.waitForFunction(() => [...document.querySelectorAll('button[aria-pressed]')].some(b => /^\d{1,2}:\d{2} (AM|PM)$/.test(b.textContent.trim())), { timeout: 15000 });
  await pausa(400);
  await m.pagina.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].find(b => /^\d{1,2}:\d{2} (AM|PM)$/.test(b.textContent.trim())).click());
  await pausa(300);
  await clic(m.pagina, 'Continuar', 'button');
  await esperarTexto(m.pagina, 'Tus datos');
  comprobar('el total es el precio de Jose', conPrecio(await m.pagina.evaluate(() => document.querySelector('aside')?.textContent ?? ''), '70.000'));
  await L.escribir(m.pagina, 'input[type="tel"]', '300 123 4567');
  await clic(m.pagina, 'Confirmar reserva', 'button');
  await esperarTexto(m.pagina, 'Te esperamos');
  const reservaMateo = (await L.docs('citas')).find(c => c.userName?.startsWith('Mateo') && c.servicioId === 'S3' && c.estado === 'pendiente');
  comprobar('la reserva queda con el precio de Jose (las reglas lo aceptan)', reservaMateo?.precio === 70000 && reservaMateo.barberoId === 'JoseJulian', JSON.stringify(reservaMateo));

  // ------------------------------------------------------------------
  seccion('admin: una cita desde el panel con el celular de Sofía (que entró con él)');
  await pestana(a.pagina, 'Citas');
  await clic(a.pagina, 'Nueva cita', 'button');
  await a.pagina.waitForSelector('#nueva-cita', { visible: true });
  await elegirOpcion(a.pagina, 'nuevaBarbero', 'Juan Sebastián');
  comprobar('con Trip no se ofrece el servicio propio de Jose', !(await opciones(a.pagina, 'nuevaServicio')).some(o => o.includes('Corte de autor')));
  await elegirOpcion(a.pagina, 'nuevaServicio', 'Acicale Premium');
  const precioCita = () => a.pagina.$eval('[data-precio-cita]', e => e.textContent.replace(/\s+/g, ' '));
  comprobar('con Trip, el Premium a 60.000', conPrecio(await precioCita(), '60.000'));
  await elegirOpcion(a.pagina, 'nuevaBarbero', 'Jose Julian');
  comprobar('con Jose, a su precio (y lo dice)', conPrecio(await precioCita(), '70.000') && (await precioCita()).includes('el de Jose Julian'), await precioCita());
  comprobar('y su servicio propio sí se ofrece', (await opciones(a.pagina, 'nuevaServicio')).some(o => o.includes('Corte de autor')));
  let diaSofia = fechaEn(6);
  if (diaSemana(diaSofia) === 0) diaSofia = fechaEn(7);
  await a.pagina.$eval('input[name="nuevaDia"]', (el, d) => { el.value = d; el.dispatchEvent(new Event('input', { bubbles: true })); }, diaSofia);
  await a.pagina.waitForFunction(() => document.querySelectorAll('select[name="nuevaMinutos"] option:not([disabled])').length > 0, { timeout: 15000 });
  await L.escribir(a.pagina, 'input[name="nuevaNombre"]', 'Sofía Celular');
  await L.escribir(a.pagina, 'input[name="nuevaCelular"]', '315 777 8899');
  await a.pagina.$eval('select[name="nuevaMinutos"]', s => {
    s.selectedIndex = [...s.options].findIndex(o => !o.disabled);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  comprobar('el formulario explica que el cliente la verá si entra con ese celular o correo', (await texto(a.pagina)).includes('verá la cita en "Mis reservas"'));
  await clic(a.pagina, 'Agendar cita', 'button[type="submit"]');
  await esperarTexto(a.pagina, 'Cita agendada');
  const citaSofia = (await L.docs('citas')).find(c => c.userName === 'Sofía Celular');
  comprobar('la cita del panel queda sin cuenta, con su celular y el precio de Jose', !!citaSofia && citaSofia.userId === '' && citaSofia.phone === '3157778899'
    && citaSofia.userEmail === '' && citaSofia.precio === 70000, JSON.stringify(citaSofia));

  seccion('admin: una agenda recurrente con el correo de Andrés');
  await pestana(a.pagina, 'Agendas recurrentes');
  await clic(a.pagina, 'Nueva agenda recurrente', 'button');
  await esperarTexto(a.pagina, 'I · Cliente');
  await L.escribir(a.pagina, 'input[name="buscarCliente"]', 'Andrés Correo');
  await clic(a.pagina, 'Crear cliente', 'button');
  await L.escribir(a.pagina, 'input[name="nuevoCorreo"]', 'andres.correo@');
  await clic(a.pagina, 'Continuar', '[role="dialog"] button');
  comprobar('no sigue con un correo a medias', (await texto(a.pagina)).includes('Revisa el correo.'));
  await L.escribir(a.pagina, 'input[name="nuevoCorreo"]', 'Andres.Correo@Example.com');
  await clic(a.pagina, 'Continuar', '[role="dialog"] button');
  await esperarTexto(a.pagina, 'II · Servicio');
  await clic(a.pagina, 'Acicale sencillo', '[role="dialog"] button');
  await esperarTexto(a.pagina, 'III · Agenda');
  let primero = fechaEn(3);
  if (diaSemana(primero) === 0) primero = fechaEn(4);
  await elegirEn(a.pagina, 'Día', DIAS[diaSemana(primero)]);
  await a.pagina.waitForFunction(`(() => { const c = ${campo('Hora')}; return !!c && [...c.querySelectorAll('button[aria-pressed]')].some(b => !b.disabled && b.textContent.includes('Libre')); })()`, { timeout: 15000 });
  await a.pagina.evaluate(`(() => { const c = ${campo('Hora')}; [...c.querySelectorAll('button[aria-pressed]')].find(b => !b.disabled && b.textContent.includes('Libre')).click(); })()`);
  await pausa(300);
  comprobar('el correo del cliente nuevo ya viene escrito', await a.pagina.$eval('input[name="clienteCorreo"]', e => e.value) === 'Andres.Correo@Example.com');
  await captura(a.pagina, '93-recurrente-con-correo');
  const logAntes = require('fs').existsSync(L.LOG_EMULADORES) ? require('fs').statSync(L.LOG_EMULADORES).size : 0;
  await clic(a.pagina, 'Crear cita recurrente', 'button');
  await esperarTexto(a.pagina, 'Agenda recurrente creada');
  const recAndres = (await L.docs('recurrencias')).find(r => r.clienteNombre === 'Andrés Correo');
  comprobar('la agenda guarda el correo en minúsculas', recAndres?.clienteCorreo === 'andres.correo@example.com', JSON.stringify(recAndres));
  // La función aparta los turnos uno por uno: se cuentan cuando anota que ya está al día con esta versión.
  const turnosAndres = await hasta(async () => {
    const r = await L.doc(`recurrencias/${recAndres?.id}`);
    if (!r || r.procesadaEn !== r.actualizadoEn) return null;
    return (await L.docs('citas')).filter(c => c.recurrenciaId === recAndres.id);
  }, 60000);
  comprobar('la función aparta sus turnos con su correo', !!turnosAndres && turnosAndres.every(t => t.userEmail === 'andres.correo@example.com' && t.userId === ''), `${turnosAndres?.length ?? 0} turnos`);
  await pausa(3000);
  comprobar('y no le manda ningún correo por ellos', !L.correosDesde(L.LOG_EMULADORES, logAntes).some(c => c.endsWith(':cliente')), L.correosDesde(L.LOG_EMULADORES, logAntes).join(', '));

  // ------------------------------------------------------------------
  seccion('Sofía (entró con el celular) ve y cancela la cita que le agendaron');
  const s = await L.sesion(navegador);
  await L.elegirCookies(s.pagina);
  await L.entrar(s.pagina, 'sofia.celular@example.com', CLAVE);
  await ir(s.pagina, '/mis-citas');
  await esperarTexto(s.pagina, 'Te la agendó la barbería');
  const tarjetaSofia = await s.pagina.evaluate(() => [...document.querySelectorAll('article')].find(a => a.textContent.includes('Acicale Premium'))?.textContent.replace(/\s+/g, ' ') ?? '');
  comprobar('sale en sus próximas, con Jose y a su precio', tarjetaSofia.includes('Jose Julian') && conPrecio(tarjetaSofia, '70.000'), tarjetaSofia);
  comprobar('el cambio de horario se pide por WhatsApp (no "Cambiar horario": la mueve el equipo)', tarjetaSofia.includes('Pedir otro horario') && !tarjetaSofia.includes('Cambiar horario'));
  const pedir = await s.pagina.evaluate(() => [...document.querySelectorAll('a')].find(e => e.textContent.includes('Pedir otro horario'))?.href ?? '');
  comprobar('"Pedir otro horario" abre WhatsApp con su turno escrito', pedir.startsWith('https://wa.me/573153229528?text=') && decodeURIComponent(pedir).includes('Acicale Premium'), decodeURIComponent(pedir).slice(0, 160));
  await captura(s.pagina, '94-mis-reservas-celular', true);
  await clic(s.pagina, 'Cancelar', 'article button');
  await clic(s.pagina, 'Sí, cancelar', 'button');
  await esperarTexto(s.pagina, 'Reserva cancelada');
  const sofiaDespues = await L.doc(`citas/${citaSofia.id}`);
  const agendaSofia = await L.ocupacion('JoseJulian', diaSofia);
  comprobar('la cita queda cancelada y su rato libre en la agenda', sofiaDespues?.estado === 'cancelada' && !(citaSofia.id in (agendaSofia?.citas ?? {})), sofiaDespues?.estado);

  seccion('Andrés (entró con el correo) ve sus turnos fijos y cancela uno');
  const n = await L.sesion(navegador);
  await L.elegirCookies(n.pagina);
  await L.entrar(n.pagina, 'andres.correo@example.com', CLAVE);
  await ir(n.pagina, '/mis-citas');
  await esperarTexto(n.pagina, 'Es tu turno fijo');
  const proximas = await n.pagina.$$eval('section[aria-labelledby="proximas"] article', as => as.length);
  comprobar('salen todos sus turnos por venir, marcados como fijos (cada semana)', proximas === turnosAndres.length && (await texto(n.pagina)).includes('Es tu turno fijo (cada semana)'), `${proximas} de ${turnosAndres.length}`);
  await captura(n.pagina, '95-mis-reservas-turnos-fijos');
  await clic(n.pagina, 'Cancelar', 'article button');
  comprobar('al cancelar, aclara que solo es ese día', (await texto(n.pagina)).includes('tus demás turnos fijos siguen'));
  await clic(n.pagina, 'Sí, cancelar', 'button');
  await esperarTexto(n.pagina, 'Reserva cancelada');
  const turnosDespues = (await L.docs('citas')).filter(c => c.recurrenciaId === recAndres.id);
  comprobar('se cancela solo ese turno; los demás siguen', turnosDespues.filter(t => t.estado === 'cancelada').length === 1
    && turnosDespues.filter(t => t.estado === 'pendiente').length === turnosAndres.length - 1);

  seccion('los demás no ven lo que no es suyo');
  await ir(m.pagina, '/mis-citas');
  await esperarTexto(m.pagina, 'Próximas');
  const deMateo = await texto(m.pagina);
  comprobar('Mateo ve su reserva y nada de Sofía ni de Andrés', deMateo.includes('Acicale Premium') && !deMateo.includes('Te la agendó la barbería') && !deMateo.includes('Es tu turno fijo'));

  for (const [quien, ses] of [['admin', a], ['visitante', v], ['Mateo', m], ['Sofía', s], ['Andrés', n]]) {
    const errores = L.limpia(ses.consola);
    comprobar(`sin errores en la consola (${quien})`, errores.length === 0, errores.slice(0, 3).join(' | '));
  }

  await navegador.close();
  process.exit(L.resumen() ? 1 : 0);
})().catch(async e => {
  console.error('\nERROR:', e.message);
  if (global.ultimaPagina) await L.captura(global.ultimaPagina, 'fallo').catch(() => {});
  L.resumen();
  process.exit(1);
});
