// Parte 2: el equipo. Admin (inicio, citas, días con servicios limitados, caritas de asistencia, multa por no asistir,
// equipo con subida de foto, servicios, usuarios, ajustes de horario) y barbero (agenda con caritas, recordatorio por WhatsApp, día libre,
// descanso y cierre de horas).
const path = require('path');
const L = require('./lib.cjs');
const { comprobar, seccion, clic, ir, esperarTexto, captura, texto, pausa } = L;

const CLAVE = 'Clave-segura-1';
const ADMIN = 'ortizgonzalesbryanalexander1@gmail.com'; // adminEmail de la config (aquí es una cuenta del emulador)
const PROYECTO = L.RAIZ;

const pestana = async (pagina, nombre) => { await clic(pagina, nombre, 'aside nav button'); await pausa(700); };

(async () => {
  const navegador = await L.abrirNavegador();
  await L.reiniciar();
  await L.crearCuenta(ADMIN, CLAVE, 'Bryan Ortiz');
  await L.crearCuenta('trip.demo@example.com', CLAVE, 'Juan Sebastián');
  const uidCliente = await L.crearCuenta('ana.cliente@example.com', CLAVE, 'Ana Gómez');

  // ------------------------------------------------------------------
  seccion('barbero: primer ingreso (aún sin rol)');
  let t = await L.sesion(navegador);
  global.ultimaPagina = t.pagina;
  await L.elegirCookies(t.pagina);
  await L.entrar(t.pagina, 'trip.demo@example.com', CLAVE);
  comprobar('una cuenta nueva entra como cliente (va a reservar)', t.pagina.url().endsWith('/reservar'), t.pagina.url());
  await ir(t.pagina, '/barbero');
  comprobar('sin rol no entra al panel del barbero', !t.pagina.url().includes('/barbero'), t.pagina.url());
  await ir(t.pagina, '/admin');
  comprobar('ni al panel de admin', !t.pagina.url().includes('/admin'), t.pagina.url());
  await t.cerrar();

  // ------------------------------------------------------------------
  seccion('admin: panel');
  const a = await L.sesion(navegador);
  global.ultimaPagina = a.pagina;
  await L.elegirCookies(a.pagina);
  await L.entrar(a.pagina, ADMIN, CLAVE);
  comprobar('el admin entra directo a su panel', a.pagina.url().endsWith('/admin'), a.pagina.url());
  await esperarTexto(a.pagina, 'Hola, Bryan');
  await pausa(1200);
  comprobar('el panel lleva la marca del cliente (ya no dice BARBERADMIN)', await a.pagina.evaluate(() => document.body.textContent.includes('EL ACICALE') && !/BARBER\s*ADMIN/i.test(document.body.textContent)));
  comprobar('Inicio muestra las cifras del día y lo que sigue', await a.pagina.evaluate(() => ['Citas de hoy', 'Ingresos de hoy', 'Esta semana', 'Por venir', 'Lo que sigue hoy'].every(x => document.body.textContent.includes(x))));
  await captura(a.pagina, '30-admin-inicio');

  await pestana(a.pagina, 'Citas');
  await esperarTexto(a.pagina, 'Agenda del día');
  await captura(a.pagina, '31-admin-citas');
  await clic(a.pagina, 'Lista', 'button');
  await pausa(500);

  seccion('admin: ver las citas de cada barbero, por días y buscando al cliente');
  const FILTRO_BARBERO = '[aria-label="Ver las citas de"] button';
  const PERIODO = '[aria-label="Qué días ver"] button';
  const p2f = n => String(n).padStart(2, '0');
  const claveF = dF => `${dF.getFullYear()}-${p2f(dF.getMonth() + 1)}-${p2f(dF.getDate())}`;
  const hoyF = claveF(new Date());
  const ayerF = (() => { const dF = new Date(); dF.setDate(dF.getDate() - 1); return claveF(dF); })();
  const enLista = () => a.pagina.evaluate(() => ({
    filas: [...document.querySelectorAll('table.tabla tbody tr[data-cita]')].map(tr => tr.textContent.replace(/\s+/g, ' ').trim()),
    dias: [...document.querySelectorAll('table.tabla tbody tr:not([data-cita]) th')].map(th => th.textContent.replace(/\s+/g, ' ').trim()),
    columnas: [...document.querySelectorAll('table.tabla thead th')].map(th => th.textContent.trim()),
    elegidos: [...document.querySelectorAll('[aria-label="Ver las citas de"] button[aria-pressed="true"], [aria-label="Qué días ver"] button[aria-pressed="true"]')].map(b => b.textContent.replace(/\s+/g, ' ').trim()),
  }));
  // Una cancelada de Trip para hoy (no aparta nada en la agenda): la lista la esconde hasta que se pide.
  await L.guardarDoc('citas/pruebaCanceladaTrip', {
    userId: '', userName: 'Cancelo Hoy', userEmail: '', phone: '3009998877', servicioId: 'S1', serviceName: 'Acicale sencillo', precio: 30000,
    duracionMinutos: 40, barberoId: 'Trip', barberoNombre: 'Juan Sebastián "Trip"', fecha: new Date(`${hoyF}T18:40:00`).toISOString(),
    dia: hoyF, hora: '18:40', horaStr: '6:40 PM', estado: 'cancelada', creadoEn: new Date(Date.now() - 86400000).toISOString(),
  });
  await pausa(800);
  const citasF = await L.docs('citas');
  const diaF = c => c.dia ?? claveF(new Date(c.fecha));
  const esperadas = (filtro, conCanceladas = false) => citasF.filter(c => filtro(c) && (conCanceladas || c.estado !== 'cancelada'));
  const deTrip = c => c.barberoId === 'Trip';

  let vista = await enLista();
  const proximas = esperadas(c => diaF(c) >= hoyF);
  comprobar('la lista abre en "Próximas" con las de todos: desde hoy, sin las canceladas', vista.elegidos.join() === 'Todos,Próximas'
    && vista.filas.length === proximas.length && vista.filas.length > 0, `${vista.elegidos.join()} · ${vista.filas.length} filas, ${proximas.length} esperadas`);
  comprobar('agrupada por día, del más cercano al más lejano, con "Hoy" primero y cuántas tiene cada día', vista.dias.length === new Set(proximas.map(diaF)).size
    && (!proximas.some(c => diaF(c) === hoyF) || /^Hoy · /.test(vista.dias[0])) && vista.dias.every(dF => /· \d+ citas?$/.test(dF)), vista.dias.slice(0, 3).join(' | '));
  comprobar('los botones del barbero: Todos y uno por barbero, con su foto', (await a.pagina.$$eval(FILTRO_BARBERO, bs => bs.map(b => `${b.textContent.replace(/\s+/g, ' ').trim()}${b.querySelector('img') ? '+foto' : ''}`))).join()
    === 'Todos,Jose Julian+foto,Juan Sebastián "Trip"+foto');
  comprobar('viendo las de todos, la tabla dice de qué barbero es cada una', vista.columnas.includes('Barbero'));

  await clic(a.pagina, 'Trip', FILTRO_BARBERO);
  await pausa(400);
  vista = await enLista();
  const proximasTripF = esperadas(c => deTrip(c) && diaF(c) >= hoyF);
  comprobar('al elegir a Trip, solo salen las suyas (y sin la columna de barbero)', vista.filas.length === proximasTripF.length
    && !vista.columnas.includes('Barbero') && vista.filas.every(f => !f.includes('Jose Julian')), `${vista.filas.length} filas, ${proximasTripF.length} suyas`);

  await clic(a.pagina, 'Hoy', PERIODO);
  await pausa(400);
  vista = await enLista();
  const hoyTrip = esperadas(c => deTrip(c) && diaF(c) === hoyF);
  comprobar('"Hoy": solo las de hoy de Trip', vista.filas.length === hoyTrip.length && vista.dias.length === (hoyTrip.length ? 1 : 0), `${vista.filas.length} filas, ${hoyTrip.length} esperadas`);
  comprobar('la cancelada no sale, pero se ofrece "Ver las canceladas (1)"', !vista.filas.some(f => f.includes('Cancelo Hoy'))
    && await a.pagina.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Ver las canceladas (1)')));
  await clic(a.pagina, 'Ver las canceladas', 'button');
  vista = await enLista();
  comprobar('y al pedirla aparece, marcada "Cancelada"', vista.filas.length === hoyTrip.length + 1 && vista.filas.some(f => f.includes('Cancelo Hoy') && f.includes('Cancelada')));
  await clic(a.pagina, 'Ocultar las canceladas', 'button');

  await clic(a.pagina, 'Pasadas', PERIODO);
  await pausa(400);
  vista = await enLista();
  const pasadasTrip = esperadas(c => deTrip(c) && diaF(c) < hoyF);
  const diasPasados = [...new Set(pasadasTrip.map(diaF))].sort().reverse();
  comprobar('"Pasadas": las de Trip hasta ayer, de la más reciente hacia atrás', vista.filas.length === pasadasTrip.length && vista.dias.length === diasPasados.length
    && (diasPasados[0] !== ayerF || /^Ayer · /.test(vista.dias[0])), `${vista.filas.length} filas, ${pasadasTrip.length} esperadas; ${vista.dias.slice(0, 2).join(' | ')}`);

  // Buscar a un cliente: por nombre (sin tildes ni mayúsculas) y por celular.
  const buscado = pasadasTrip[0];
  const parteNombre = buscado.userName.split(' ')[0].normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
  await L.escribir(a.pagina, 'input[name="buscarCita"]', parteNombre);
  await pausa(400);
  vista = await enLista();
  const conEseNombre = pasadasTrip.filter(c => c.userName.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().includes(parteNombre));
  comprobar(`buscar "${parteNombre}" deja solo a quienes se llaman así`, vista.filas.length === conEseNombre.length && vista.filas.length > 0, `${vista.filas.length} filas, ${conEseNombre.length} esperadas`);
  const celular = buscado.phone;
  await L.escribir(a.pagina, 'input[name="buscarCita"]', `${celular.slice(0, 3)} ${celular.slice(3, 6)} ${celular.slice(6)}`);
  await pausa(400);
  vista = await enLista();
  comprobar('y por celular, aunque se escriba con espacios', vista.filas.length >= 1 && vista.filas.every(f => f.includes(`${celular.slice(0, 3)} ${celular.slice(3, 6)} ${celular.slice(6)}`)), vista.filas.join(' | ').slice(0, 200));
  await L.escribir(a.pagina, 'input[name="buscarCita"]', 'Nadie Se Llama Asi');
  await pausa(400);
  comprobar('sin resultados lo dice', await a.pagina.evaluate(() => document.body.textContent.includes('Nadie con ese nombre o celular en estas fechas.')));
  await L.escribir(a.pagina, 'input[name="buscarCita"]', '');
  await captura(a.pagina, '32b-admin-lista-filtrada');

  // En el calendario vale el mismo barbero: el día dice cuántas le tocan y la agenda muestra solo las suyas.
  await clic(a.pagina, 'Calendario', 'button');
  await pausa(500);
  const enCalendario = await a.pagina.evaluate(() => ({
    nota: document.body.textContent.includes('Solo las de Juan Sebastián "Trip"'),
    jose: [...document.querySelectorAll('li')].some(li => li.textContent.includes('Jose Julian')),
  }));
  const hoyTripActivas = hoyTrip.length;
  const etiquetaHoy = await a.pagina.evaluate(() => [...document.querySelectorAll('button[aria-pressed="true"]')].map(b => b.getAttribute('aria-label') ?? '').find(x => /citas$/.test(x)) ?? '');
  comprobar('en el calendario: "Solo las de Trip", sin citas de Jose y el día cuenta solo las suyas', enCalendario.nota && !enCalendario.jose && etiquetaHoy.endsWith(`, ${hoyTripActivas} citas`), `${JSON.stringify(enCalendario)} ${etiquetaHoy}`);
  await clic(a.pagina, 'Nueva cita', 'button');
  await a.pagina.waitForSelector('#nueva-cita', { visible: true });
  comprobar('"Nueva cita" abre con el barbero que se está mirando', await a.pagina.$eval('select[name="nuevaBarbero"]', s => s.selectedOptions[0]?.textContent.includes('Trip')));
  await clic(a.pagina, 'Cancelar', 'form button[type="button"]');

  // La elección se recuerda en este navegador (Jose la deja en las suyas y no tiene que volver a elegir).
  await ir(a.pagina, '/admin');
  await esperarTexto(a.pagina, 'Hola, Bryan');
  await pestana(a.pagina, 'Citas');
  await esperarTexto(a.pagina, 'Agenda del día');
  await clic(a.pagina, 'Lista', 'button');
  await pausa(500);
  vista = await enLista();
  comprobar('al volver al panel sigue en Trip y en "Pasadas"', vista.elegidos.join() === 'Juan Sebastián "Trip",Pasadas', vista.elegidos.join());

  // Viendo las de todos, en pantalla ancha cada día del mes dice cuántas tiene cada barbero (con su foto).
  await clic(a.pagina, 'Todos', FILTRO_BARBERO);
  await clic(a.pagina, 'Calendario', 'button');
  await pausa(400);
  const desglose = await a.pagina.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')]
    .map(b => [...b.querySelectorAll('span[title]')].map(s => s.getAttribute('title')))
    .filter(x => x.length > 1).length);
  const mesF = hoyF.slice(0, 7);
  const conLosDos = [...new Set(citasF.filter(c => diaF(c).startsWith(mesF)).map(diaF))]
    .filter(dF => new Set(esperadas(c => diaF(c) === dF).map(c => c.barberoId)).size > 1).length;
  comprobar('con "Todos", los días del mes dicen cuántas le tocan a cada barbero', desglose === conLosDos && desglose > 0, `${desglose} días con los dos, ${conLosDos} esperados`);
  await captura(a.pagina, '31b-admin-calendario-por-barbero');

  // Si el admin también corta (como Jose), su botón dice "Tú".
  const { id: _idJose, ...privadoJose } = await L.doc('barberosPrivado/JoseJulian');
  await L.guardarDoc('barberosPrivado/JoseJulian', { ...privadoJose, emailAsociado: ADMIN });
  await a.pagina.waitForFunction(sel => [...document.querySelectorAll(sel)].some(b => b.textContent.replace(/\s+/g, ' ').trim() === 'Jose Julian Tú'), { timeout: 10000 }, FILTRO_BARBERO).catch(() => {});
  comprobar('el admin que también es barbero ve su botón marcado "Tú"', await a.pagina.$$eval(FILTRO_BARBERO, bs => bs.some(b => b.textContent.replace(/\s+/g, ' ').trim() === 'Jose Julian Tú')));
  await L.guardarDoc('barberosPrivado/JoseJulian', privadoJose);
  await clic(a.pagina, 'Lista', 'button');
  await clic(a.pagina, 'Todas', PERIODO);
  await pausa(400);

  comprobar('la lista de citas dice "Agendada", "Hecho" o "No asistió" (no los nombres internos)', await a.pagina.evaluate(() => {
    const tF = [...document.querySelectorAll('table td span')].map(s => s.textContent.trim());
    return tF.length > 20 && !tF.some(x => /^(pendiente|confirmada|completada|no-asistio)$/i.test(x));
  }));
  await captura(a.pagina, '32-admin-citas-lista');
  await clic(a.pagina, 'Próximas', PERIODO);
  await L.borrarDoc('citas/pruebaCanceladaTrip');

  seccion('admin: pedir reseñas en Google a los clientes ya atendidos');
  await clic(a.pagina, 'Calendario', 'button');
  // Un día de la semana pasada (la demo tiene cortes hechos con celular).
  const diaPasado = (() => { const d = new Date(); d.setDate(d.getDate() - 2); if (d.getDay() === 0) d.setDate(d.getDate() - 1); return d; })();
  if (diaPasado.getMonth() !== new Date().getMonth()) await a.pagina.click('button[aria-label="Mes anterior"]');
  await pausa(300);
  await a.pagina.evaluate(n => [...document.querySelectorAll('button[aria-pressed]')].find(b => !b.className.includes('opacity-40') && b.querySelector('span')?.textContent.trim() === n).click(), String(diaPasado.getDate()));
  await pausa(600);
  const resena = await a.pagina.evaluate(() => [...document.querySelectorAll('a')].find(x => x.textContent.includes('Pedir reseña'))?.href ?? '');
  comprobar('en los cortes hechos, "Pedir reseña" abre WhatsApp con el mensaje y el enlace de Google', /^https:\/\/wa\.me\/573\d{9}\?text=/.test(resena)
    && decodeURIComponent(resena).includes('¿nos ayudas con una reseña en Google?') && decodeURIComponent(resena).includes('https://www.google.com/maps?cid='), decodeURIComponent(resena).slice(0, 220));
  if (diaPasado.getMonth() !== new Date().getMonth()) await a.pagina.click('button[aria-label="Mes siguiente"]');

  seccion('admin: agendar una cita desde el panel');
  await clic(a.pagina, 'Calendario', 'button');
  // Un día de la semana que viene que no sea domingo.
  const p2 = n => String(n).padStart(2, '0');
  const diaPanel = (() => { const d = new Date(); d.setDate(d.getDate() + 6); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; })();
  const horasOfrecidas = () => a.pagina.evaluate(() => [...document.querySelectorAll('select[name="nuevaMinutos"] option:not([disabled])')].map(o => o.textContent.trim()));
  const minutosDeHora = h => { const [, hh, mm, ap] = h.match(/(\d+):(\d+)\s*(AM|PM)/i); return (Number(hh) % 12 + (/PM/i.test(ap) ? 12 : 0)) * 60 + Number(mm); };
  const abrirConDia = async dia => {
    await clic(a.pagina, 'Nueva cita', 'button');
    await a.pagina.waitForSelector('#nueva-cita', { visible: true });
    await a.pagina.$eval('input[name="nuevaDia"]', (el, d) => { el.value = d; el.dispatchEvent(new Event('input', { bubbles: true })); }, dia);
    await a.pagina.waitForFunction(() => document.querySelectorAll('select[name="nuevaMinutos"] option:not([disabled])').length > 0, { timeout: 15000 });
  };
  await abrirConDia(diaPanel);
  await captura(a.pagina, '32b-admin-nueva-cita');
  const barberoPanel = await a.pagina.$eval('select[name="nuevaBarbero"]', s => s.selectedOptions[0]?.textContent.trim());
  const servicioPanel = await a.pagina.$eval('select[name="nuevaServicio"]', s => s.selectedOptions[0]?.textContent.trim());
  const idBarbero = (await L.docs('barberos')).find(b => b.nombre === barberoPanel)?.id;
  const duracionPanel = Number(servicioPanel.match(/(\d+) min/)?.[1]);
  const mapaPanel = (await L.ocupacion(idBarbero, diaPanel)).mapa;
  const ofrecidas = await horasOfrecidas();
  const pisa = h => !L.libreEn(mapaPanel, minutosDeHora(h), duracionPanel);
  comprobar('el formulario ofrece horas de 5 en 5 y ninguna pisa otra cita o cierre del barbero',
    ofrecidas.length > 5 && ofrecidas.every(h => minutosDeHora(h) % 5 === 0) && ofrecidas.some(h => minutosDeHora(h) % 20 !== 0) && !ofrecidas.some(pisa),
    `${barberoPanel}, ${servicioPanel}, ${ofrecidas.length} horas`);
  const seguidas = await a.pagina.evaluate(() => [...document.querySelectorAll('select[name="nuevaMinutos"] optgroup')]
    .find(g => g.label.startsWith('Turnos seguidos'))?.querySelectorAll('option').length ?? 0);
  const aperturaPanel = [5, 6].includes(new Date(`${diaPanel}T12:00:00`).getDay()) ? 540 : 560;
  comprobar('primero van los turnos seguidos (sin tiempo muerto), los mismos que ve el cliente', seguidas > 0
    && ofrecidas.slice(0, seguidas).map(minutosDeHora).join() === L.turnos(mapaPanel, aperturaPanel, 1180, duracionPanel, (await L.doc(`barberos/${idBarbero}`)).descanso ?? null).filter(t => L.libreEn(mapaPanel, t, duracionPanel)).join(),
    `${seguidas} seguidos: ${ofrecidas.slice(0, seguidas).join(' ')}`);

  await clic(a.pagina, 'Agendar cita', 'button[type="submit"]');
  comprobar('sin nombre ni hora no agenda: marca los campos', await a.pagina.evaluate(() =>
    document.querySelector('input[name="nuevaNombre"]').classList.contains('campo-error') && !!document.querySelector('#nueva-cita')));
  await L.escribir(a.pagina, 'input[name="nuevaNombre"]', 'Carlos Por WhatsApp');
  await L.escribir(a.pagina, 'input[name="nuevaCelular"]', '310 555 1234');
  const horaPanel = ofrecidas[Math.min(3, ofrecidas.length - 1)];
  await a.pagina.$eval('select[name="nuevaMinutos"]', (s, h) => {
    s.value = [...s.options].find(o => o.textContent.trim() === h).value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, horaPanel);
  const logAntes = require('fs').existsSync(L.LOG_EMULADORES) ? require('fs').statSync(L.LOG_EMULADORES).size : 0;
  await clic(a.pagina, 'Agendar cita', 'button[type="submit"]');
  await esperarTexto(a.pagina, 'Cita agendada');
  const citaPanel = (await L.docs('citas')).find(c => c.userName === 'Carlos Por WhatsApp');
  const agendaPanel = await L.ocupacion(idBarbero, diaPanel);
  comprobar('la cita queda guardada sin cuenta ni cupo, con el servicio y el barbero elegidos',
    !!citaPanel && citaPanel.userId === '' && !('cupoId' in citaPanel) && citaPanel.dia === diaPanel && citaPanel.barberoId === idBarbero
      && citaPanel.horaStr === horaPanel && citaPanel.estado === 'pendiente' && citaPanel.phone === '3105551234', JSON.stringify(citaPanel));
  comprobar('y aparta justo su rato en la agenda del barbero', JSON.stringify(agendaPanel.citas[citaPanel?.id]) === JSON.stringify(L.tramo(minutosDeHora(horaPanel), duracionPanel)),
    JSON.stringify(agendaPanel.citas[citaPanel?.id]));
  comprobar('el calendario queda en ese día y la muestra', (await texto(a.pagina)).includes('Carlos Por WhatsApp'));
  await captura(a.pagina, '32c-admin-cita-agendada');
  await pausa(4000);
  const correosPanel = L.correosDesde(L.LOG_EMULADORES, logAntes);
  comprobar('al barbero le llega el aviso y al cliente nada (no se puso correo)',
    correosPanel.includes('nueva:barbero') && !correosPanel.includes('nueva:cliente'), correosPanel.join(', ') || 'sin correos');

  await abrirConDia(diaPanel);
  comprobar('esa hora ya no se ofrece para el mismo barbero', !(await horasOfrecidas()).includes(horaPanel));
  await clic(a.pagina, 'Cancelar', '#nueva-cita ~ div button, form button[type="button"]');
  comprobar('"Cancelar" cierra el formulario', !(await a.pagina.$('#nueva-cita')));

  // Después del cierre: solo el equipo, desde el panel, hasta que la cita termine a las 10:00 p. m.
  const horasDelGrupo = (pagina, inicio) => pagina.evaluate(inicio => [...([...document.querySelectorAll('select[name="nuevaMinutos"] optgroup')]
    .find(g => g.label.startsWith(inicio))?.querySelectorAll('option') ?? [])].map(o => o.textContent.trim()), inicio);
  const elegirHora = (pagina, h) => pagina.$eval('select[name="nuevaMinutos"]', (s, h) => {
    s.value = [...s.options].find(o => o.textContent.trim() === h).value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, h);
  const citaLlamada = async nombre => {
    for (let i = 0; i < 40; i++) {
      const cita = (await L.docs('citas')).find(c => c.userName === nombre);
      if (cita) return cita;
      await pausa(250);
    }
    return null;
  };
  await abrirConDia(diaPanel);
  const tarde = await horasDelGrupo(a.pagina, 'Después del cierre');
  comprobar('además ofrece horas después del cierre, hasta que la cita termine a las 10:00 p. m.',
    tarde.length > 0 && tarde.every(h => minutosDeHora(h) + duracionPanel > 1180 && minutosDeHora(h) + duracionPanel <= 1320)
      && tarde.some(h => minutosDeHora(h) + duracionPanel === 1320) && !tarde.some(pisa), `${tarde[0]} … ${tarde.at(-1)} (${tarde.length})`);
  const horaNoche = tarde.find(h => minutosDeHora(h) === 1200) ?? tarde[0];
  await L.escribir(a.pagina, 'input[name="nuevaNombre"]', 'Nocturno Del Admin');
  await elegirHora(a.pagina, horaNoche);
  await captura(a.pagina, '32d-admin-nueva-cita-noche');
  await clic(a.pagina, 'Agendar cita', 'button[type="submit"]');
  const nocturna = await citaLlamada('Nocturno Del Admin');
  const agendaNoche = await L.ocupacion(idBarbero, diaPanel);
  comprobar('el admin agenda una cita después del cierre y aparta su rato', !!nocturna && nocturna.horaStr === horaNoche && !('origen' in nocturna)
    && JSON.stringify(agendaNoche.citas[nocturna.id]) === JSON.stringify(L.tramo(minutosDeHora(horaNoche), duracionPanel)), JSON.stringify(nocturna));
  await a.pagina.waitForFunction(() => !document.querySelector('#nueva-cita'), { timeout: 10000 });

  // Mover la cita desde "Editar o mover": su rato pasa a la hora nueva y el de antes queda libre.
  const horaAntes = minutosDeHora(horaPanel);
  const libreSinElla = L.sinCitas(await L.ocupacion(idBarbero, diaPanel), id => id === citaPanel.id);
  await a.pagina.evaluate(() => [...document.querySelectorAll('li')]
    .find(li => li.textContent.includes('Carlos Por WhatsApp'))?.querySelector('button[aria-label="Editar o mover la cita"]')?.click());
  await esperarTexto(a.pagina, 'Editar o mover la cita');
  const destino = await a.pagina.evaluate(() => [...document.querySelectorAll('select[name="minutos"] option')].map(o => o.textContent.trim()));
  const elegidaMover = destino.find(h => {
    const t = minutosDeHora(h);
    return Math.abs(t - horaAntes) >= duracionPanel && t + duracionPanel <= 1180 && L.libreEn(libreSinElla, t, duracionPanel);
  });
  await a.pagina.$eval('select[name="minutos"]', (sel, h) => {
    sel.value = [...sel.options].find(o => o.textContent.trim() === h).value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, elegidaMover);
  await clic(a.pagina, 'Guardar cambios', 'button[type="submit"]');
  await pausa(1500);
  const movida = await L.doc(`citas/${citaPanel.id}`);
  const agendaMovida = await L.ocupacion(idBarbero, diaPanel);
  comprobar('"Editar o mover" pasa su rato a la hora nueva y suelta el de antes',
    movida.horaStr === elegidaMover && JSON.stringify(agendaMovida.citas[citaPanel.id]) === JSON.stringify(L.tramo(minutosDeHora(elegidaMover), duracionPanel))
      && L.libreEn(L.sinCitas(agendaMovida, id => id === citaPanel.id), horaAntes, duracionPanel), `${horaPanel} -> ${elegidaMover}`);

  // La duración para ese cliente (de 5 en 5, como en las agendas recurrentes): las horas se calculan con ella.
  const comoDuracion = m => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);
  const duracionNueva = pagina => pagina.$eval('select[name="nuevaDuracion"]', s => s.selectedOptions[0]?.textContent.trim() ?? '');
  const elegirDuracionNueva = (pagina, etiqueta) => pagina.evaluate(etiqueta => {
    const s = document.querySelector('select[name="nuevaDuracion"]');
    s.selectedIndex = [...s.options].findIndex(o => o.textContent.trim() === etiqueta);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, etiqueta);
  const etiquetaDe = async (pagina, minutos) => (await pagina.evaluate(() => [...document.querySelectorAll('select[name="nuevaMinutos"] option:not([disabled])')]
    .map(o => o.textContent.trim()))).find(h => minutosDeHora(h) === minutos);
  await abrirConDia(diaPanel);
  comprobar('la duración de la cita arranca en la del servicio', await duracionNueva(a.pagina) === comoDuracion(duracionPanel), await duracionNueva(a.pagina));
  await a.pagina.click('form button[aria-label="5 minutos más"]');
  await pausa(300);
  comprobar('con + sube 5 minutos y recuerda la normal', await duracionNueva(a.pagina) === comoDuracion(duracionPanel + 5)
    && (await texto(a.pagina)).includes(`Normalmente dura ${comoDuracion(duracionPanel)}`), await duracionNueva(a.pagina));
  const CORTA = 25;
  await elegirDuracionNueva(a.pagina, comoDuracion(CORTA));
  await pausa(300);
  comprobar('de la lista se elige directo (25 min) y ofrece volver a la del servicio', await duracionNueva(a.pagina) === '25 min'
    && (await texto(a.pagina)).includes(`Volver a ${comoDuracion(duracionPanel)}`));
  const mapaCorta = (await L.ocupacion(idBarbero, diaPanel)).mapa;
  const descansoPanel = (await L.doc(`barberos/${idBarbero}`)).descanso ?? null;
  const seguidosCorta = (await horasDelGrupo(a.pagina, 'Turnos seguidos')).map(minutosDeHora);
  const ofrecidasCorta = (await horasOfrecidas()).map(minutosDeHora);
  comprobar('con 25 min, los turnos seguidos (sin tiempo muerto) se calculan con esa duración y ninguna hora pisa otra cita',
    seguidosCorta.length > 0 && seguidosCorta.join() === L.turnos(mapaCorta, aperturaPanel, 1180, CORTA, descansoPanel).filter(t => L.libreEn(mapaCorta, t, CORTA)).join()
      && ofrecidasCorta.every(t => L.libreEn(mapaCorta, t, CORTA)), `${seguidosCorta.length} seguidos, ${ofrecidasCorta.length} horas`);
  const tardeCorta = (await horasDelGrupo(a.pagina, 'Después del cierre')).map(minutosDeHora);
  comprobar('y después del cierre llega hasta que la cita de 25 min termine a las 10:00 p. m.', tardeCorta.every(t => t + CORTA > 1180 && t + CORTA <= 1320)
    && (!L.libreEn(mapaCorta, 1320 - CORTA, CORTA) || tardeCorta.includes(1320 - CORTA)), `${tardeCorta.length} horas, la última ${tardeCorta.at(-1)}`);
  // Un turno seguido con espacio después para un servicio normal: así se ve que el siguiente entra justo al terminar.
  const cabeDespues = t => t + CORTA + duracionPanel <= 1180 && L.libreEn(mapaCorta, t + CORTA, duracionPanel)
    && !(descansoPanel && t + CORTA < descansoPanel.hasta && t + CORTA + duracionPanel > descansoPanel.desde);
  const horaCorta = seguidosCorta.find(cabeDespues) ?? seguidosCorta[0];
  await L.escribir(a.pagina, 'input[name="nuevaNombre"]', 'Cliente Rapido');
  await elegirHora(a.pagina, await etiquetaDe(a.pagina, horaCorta));
  await captura(a.pagina, '32e-admin-nueva-cita-duracion');
  await clic(a.pagina, 'Agendar cita', 'button[type="submit"]');
  const rapida = await citaLlamada('Cliente Rapido');
  const servicioDoc = (await L.docs('servicios')).find(s => s.nombre === servicioPanel.split(' · ')[0]);
  comprobar('la cita guarda la duración elegida (25 min) con el nombre y el precio del servicio, y aparta solo ese rato', !!rapida && rapida.duracionMinutos === CORTA
    && rapida.serviceName === servicioDoc?.nombre && rapida.precio === servicioDoc?.precio
    && JSON.stringify((await L.ocupacion(idBarbero, diaPanel)).citas[rapida.id]) === JSON.stringify(L.tramo(horaCorta, CORTA)), JSON.stringify(rapida));
  await a.pagina.waitForFunction(() => !document.querySelector('#nueva-cita'), { timeout: 10000 });
  await abrirConDia(diaPanel);
  const seguidosDespues = (await horasDelGrupo(a.pagina, 'Turnos seguidos')).map(minutosDeHora);
  comprobar('la siguiente cita (con la duración normal) tiene un turno justo cuando termina la de 25 min, sin tiempo muerto',
    await duracionNueva(a.pagina) === comoDuracion(duracionPanel)
      && (!cabeDespues(horaCorta) || seguidosDespues.includes(horaCorta + CORTA)), `${horaCorta} + 25 -> ${seguidosDespues.join(' ')}`);
  await clic(a.pagina, 'Cancelar', '#nueva-cita ~ div button, form button[type="button"]');

  await pestana(a.pagina, 'Cortes y ganancias');
  await esperarTexto(a.pagina, 'Queda para la barbería');
  await captura(a.pagina, '33-admin-ganancias');

  await pestana(a.pagina, 'Servicios y precios');
  await esperarTexto(a.pagina, 'Acicale Premium');
  await captura(a.pagina, '34-admin-servicios');

  seccion('admin: habilitar solo algunos servicios con un barbero (primero los Premium)');
  const SECCION = 'section[aria-labelledby="habilitar-titulo"]';
  const fichaBarbero = nombre => a.pagina.evaluate((sel, nombre) => {
    const li = [...document.querySelectorAll(`${sel} li`)].find(x => x.querySelector('p')?.textContent.trim() === nombre);
    return li ? { resumen: li.querySelectorAll('p')[1].textContent.trim(), habilitados: [...li.querySelectorAll('button[aria-pressed="true"]')].map(b => b.textContent.trim()) } : null;
  }, SECCION, nombre);
  const tocarServicio = (barbero, servicio) => a.pagina.evaluate((sel, barbero, servicio) => {
    const li = [...document.querySelectorAll(`${sel} li`)].find(x => x.querySelector('p')?.textContent.trim() === barbero);
    [...li.querySelectorAll('button[aria-pressed]')].find(b => b.textContent.trim() === servicio).click();
  }, SECCION, barbero, servicio);
  comprobar('al empezar, con cada barbero se reservan todos los servicios', (await fichaBarbero('Jose Julian'))?.resumen === 'Se reservan todos los servicios');
  await tocarServicio('Jose Julian', 'Barba2');
  await pausa(500);
  await tocarServicio('Jose Julian', 'Acicale sencillo');
  await pausa(800);
  const soloPremium = await fichaBarbero('Jose Julian');
  comprobar('con dos toques Jose Julian queda solo con Acicale Premium', soloPremium?.resumen === 'Solo se reserva: Acicale Premium' && soloPremium.habilitados.join() === 'Acicale Premium', JSON.stringify(soloPremium));
  comprobar('y se guarda en su perfil (Barba2 y Acicale sencillo sin habilitar)', JSON.stringify((await L.doc('barberos/JoseJulian')).serviciosCerrados) === JSON.stringify(['S1', 'S2']), JSON.stringify((await L.doc('barberos/JoseJulian')).serviciosCerrados));
  comprobar('a Trip no le cambia nada', (await fichaBarbero('Juan Sebastián "Trip"'))?.resumen === 'Se reservan todos los servicios');
  await a.pagina.$eval(SECCION, el => el.scrollIntoView({ block: 'start' }));
  await captura(a.pagina, '34b-admin-servicios-habilitados');

  const cliente = await L.sesion(navegador);
  await L.elegirCookies(cliente.pagina);
  await ir(cliente.pagina, '/reservar');
  const serviciosEnPaso2 = () => cliente.pagina.evaluate(() => [...document.querySelectorAll('button')]
    .filter(b => b.querySelector('h4')).map(b => ({ nombre: b.querySelector('h4').textContent.trim(), libre: !b.disabled, nota: b.textContent.includes('Disponible más adelante') })));
  // Con Trip elige Barba2 y luego se cambia a Jose: el servicio se suelta y se le explica por qué.
  await clic(cliente.pagina, 'Juan Sebastián', 'button');
  await clic(cliente.pagina, 'Barba2', 'button');
  await esperarTexto(cliente.pagina, 'Horas libres');
  await cliente.pagina.$eval('nav[aria-label="Pasos de la reserva"] button[aria-label="Paso 1: Barbero"]', b => b.click());
  await pausa(400);
  await clic(cliente.pagina, 'Jose Julian', 'button');
  await esperarTexto(cliente.pagina, 'Elige tu servicio');
  comprobar('si cambia a un barbero con quien ese servicio no se reserva, se le avisa y elige otro',
    (await texto(cliente.pagina)).includes('Barba2 no se está reservando con Jose Julian por ahora'));
  const conJose = await serviciosEnPaso2();
  comprobar('con Jose solo se puede elegir Premium; los demás dicen "Disponible más adelante"',
    conJose.length === 3 && conJose.every(s => s.libre === (s.nombre === 'Acicale Premium') && s.nota === (s.nombre !== 'Acicale Premium')), JSON.stringify(conJose));
  await captura(cliente.pagina, '34c-reservar-solo-premium');
  await clic(cliente.pagina, 'Acicale Premium', 'button');
  await esperarTexto(cliente.pagina, 'Horas libres');
  comprobar('y el Premium se reserva como siempre (pasa al horario)', true);

  await pestana(a.pagina, 'Inicio');
  await esperarTexto(a.pagina, 'No todos los servicios se pueden reservar');
  comprobar('el inicio del panel recuerda que hay servicios sin habilitar', (await texto(a.pagina)).includes('Con Jose Julian solo se reserva: Acicale Premium.'));
  await captura(a.pagina, '34d-admin-inicio-servicios');
  await clic(a.pagina, 'Habilitar servicios', 'button');
  await esperarTexto(a.pagina, 'Qué se puede reservar con cada barbero');
  await a.pagina.evaluate(sel => {
    const li = [...document.querySelectorAll(`${sel} li`)].find(x => x.querySelector('p')?.textContent.trim() === 'Jose Julian');
    [...li.querySelectorAll('button')].find(b => b.textContent.trim() === 'Habilitar todos').click();
  }, SECCION);
  await esperarTexto(a.pagina, 'Servicios habilitados');
  comprobar('"Habilitar todos" los abre de nuevo', ((await L.doc('barberos/JoseJulian')).serviciosCerrados ?? []).length === 0);
  // El cliente que estaba reservando lo ve sin recargar.
  await cliente.pagina.$eval('nav[aria-label="Pasos de la reserva"] button[aria-label="Paso 2: Servicio"]', b => b.click());
  await esperarTexto(cliente.pagina, 'Elige tu servicio');
  await pausa(800);
  comprobar('y al cliente se le habilitan sin recargar la página', (await serviciosEnPaso2()).every(s => s.libre));
  const ruidoCliente = L.limpia(cliente.consola);
  comprobar('consola del cliente sin errores', ruidoCliente.length === 0, '\n      ' + ruidoCliente.slice(0, 6).join('\n      '));
  await cliente.cerrar();

  seccion('admin: un día solo para algunos servicios (desde el calendario de Citas)');
  // Un día que se reserva con los dos barberos: desde pasado mañana, sin domingo (cerrado) ni lunes (Trip descansa).
  const p2d = n => String(n).padStart(2, '0');
  const claveD = d => `${d.getFullYear()}-${p2d(d.getMonth() + 1)}-${p2d(d.getDate())}`;
  const diaLim = (() => { const d = new Date(); d.setDate(d.getDate() + 2); while ([0, 1].includes(d.getDay())) d.setDate(d.getDate() + 1); return d; })();
  const LIM = claveD(diaLim);
  const otroMes = diaLim.getMonth() !== new Date().getMonth();
  const PREMIUM = (await L.docs('servicios')).find(s => s.nombre === 'Acicale Premium')?.id;
  await pestana(a.pagina, 'Citas');
  await esperarTexto(a.pagina, 'Agenda del día');
  if (otroMes) { await a.pagina.$eval('button[aria-label="Mes siguiente"]', b => b.click()); await pausa(400); }
  const tocarDiaAdmin = n => a.pagina.evaluate(n => {
    const celda = [...document.querySelectorAll('button[aria-pressed]')]
      .find(b => (b.getAttribute('aria-label') ?? '').includes(' citas') && !b.classList.contains('opacity-40') && b.querySelector('span')?.textContent.trim() === String(n));
    celda?.click();
    return !!celda;
  }, n);
  comprobar('el día se elige en el calendario de Citas', await tocarDiaAdmin(diaLim.getDate()));
  await pausa(400);
  comprobar('y dice que en línea se reservan todos los servicios', (await texto(a.pagina)).includes('En línea se reservan todos los servicios'));
  await clic(a.pagina, 'Limitar', '[data-servicios-del-dia] button');
  await esperarTexto(a.pagina, '¿Qué se reserva este día?');
  await clic(a.pagina, 'Solo algunos', '[role="dialog"] button');
  await clic(a.pagina, 'Acicale Premium', '[role="dialog"] label');
  await esperarTexto(a.pagina, 'Ese día solo se reserva Acicale Premium.');
  await captura(a.pagina, '34e-admin-servicios-del-dia');
  await clic(a.pagina, 'Guardar', '[role="dialog"] button[type="submit"]');
  await esperarTexto(a.pagina, 'En línea solo se reserva Acicale Premium');
  const limites = (await L.doc('ajustes/sitio'))?.serviciosPorDia ?? {};
  comprobar('se guarda en los ajustes: ese día, solo el Premium', JSON.stringify(limites[LIM]) === JSON.stringify([PREMIUM]), JSON.stringify(limites));
  comprobar('el día sale con una estrella en el calendario', await a.pagina.evaluate(() => document.querySelectorAll('[data-dia-limitado]').length === 1));
  await captura(a.pagina, '34f-admin-dia-limitado');

  // Un visita que reserva un Acicale sencillo con Trip: ese día sale marcado y, al tocarlo, se le ofrece el Premium.
  const visita = await L.sesion(navegador);
  await L.elegirCookies(visita.pagina);
  await ir(visita.pagina, '/reservar');
  await clic(visita.pagina, 'Juan Sebastián', 'button');
  await clic(visita.pagina, 'Acicale sencillo', 'button');
  await esperarTexto(visita.pagina, 'Horas libres');
  if (otroMes) { await visita.pagina.$eval('button[aria-label="Mes siguiente"]', b => b.click()); await pausa(400); }
  const marcados = () => visita.pagina.evaluate(() => [...document.querySelectorAll('button[data-limitado]')].map(b => b.textContent.trim()));
  comprobar('en la reserva ese día sale marcado, con "Solo otros servicios" en la leyenda',
    (await marcados()).join() === String(diaLim.getDate()) && (await texto(visita.pagina)).includes('Solo otros servicios'), (await marcados()).join());
  const horasVisibles = () => visita.pagina.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].filter(b => /\d:\d\d (AM|PM)/.test(b.textContent)).length);
  await visita.pagina.evaluate(() => document.querySelector('button[data-limitado]').click());
  await esperarTexto(visita.pagina, 'Este día solo se reserva Acicale Premium.');
  comprobar('al tocarlo no ofrece horas y dice qué se reserva ese día', await horasVisibles() === 0);
  await captura(visita.pagina, '34g-reservar-dia-limitado');
  await clic(visita.pagina, 'Cambiar a Acicale Premium', 'button');
  await visita.pagina.waitForFunction(() => [...document.querySelectorAll('button[aria-pressed]')].some(b => /\d:\d\d (AM|PM)/.test(b.textContent)), { timeout: 15000 }).catch(() => {});
  comprobar('con "Cambiar a Acicale Premium" se queda en ese día con el Premium y le ofrece horas', await horasVisibles() > 0
    && (await texto(visita.pagina)).includes('Acicale Premium ·') && (await marcados()).length === 0);
  // Si vuelve al sencillo, el día deja de estar elegido: pasa al primero en que sí se reserva.
  await visita.pagina.$eval('nav[aria-label="Pasos de la reserva"] button[aria-label="Paso 2: Servicio"]', b => b.click());
  await esperarTexto(visita.pagina, 'Elige tu servicio');
  await clic(visita.pagina, 'Acicale sencillo', 'button');
  await esperarTexto(visita.pagina, 'Horas libres');
  await pausa(600);
  comprobar('si vuelve a un servicio que no va ese día, la reserva pasa a otro día', !(await texto(visita.pagina)).includes('Este día solo se reserva'));
  // El día limitado sigue a la vista (si cae en el mes siguiente, la reserva volvió al mes del día que eligió).
  if ((await marcados()).length === 0 && otroMes) { await visita.pagina.$eval('button[aria-label="Mes siguiente"]', b => b.click()); await pausa(400); }
  comprobar('y ese día sigue marcado para el sencillo', (await marcados()).join() === String(diaLim.getDate()), (await marcados()).join());

  // Desde el panel se agenda igual, con un aviso.
  await a.pagina.$eval('button[aria-label="Agendar una cita este día"]', b => b.click());
  await a.pagina.waitForSelector('#nueva-cita', { visible: true });
  await a.pagina.$eval('select[name="nuevaServicio"]', s => {
    s.selectedIndex = [...s.options].findIndex(o => o.textContent.includes('Acicale sencillo'));
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await pausa(400);
  comprobar('"Nueva cita" en ese día avisa del límite, sin impedir agendar', (await texto(a.pagina)).includes('Ese día en línea solo se reserva Acicale Premium. Puedes agendar Acicale sencillo igual.'));
  await clic(a.pagina, 'Cancelar', 'button');
  await pausa(300);

  // En Servicios y precios se ven todos los días limitados, y se abren de nuevo.
  await pestana(a.pagina, 'Servicios y precios');
  await esperarTexto(a.pagina, 'Días con servicios limitados');
  comprobar('Servicios y precios muestra el día con lo que se reserva', await a.pagina.evaluate(() => {
    const li = document.querySelectorAll('[data-dias-con-servicios] li');
    return li.length === 1 && li[0].textContent.includes('Solo Acicale Premium');
  }));
  await captura(a.pagina, '34h-admin-dias-limitados');
  await clic(a.pagina, 'Abrir todos', '[data-dias-con-servicios] button');
  await a.pagina.waitForFunction(() => !document.querySelector('[data-dias-con-servicios] li'), { timeout: 10000 }).catch(() => {});
  comprobar('"Abrir todos" lo quita de los ajustes', !((await L.doc('ajustes/sitio'))?.serviciosPorDia ?? {})[LIM]);
  await pausa(800);
  comprobar('y en la reserva el día deja de estar marcado, sin recargar', (await marcados()).length === 0);
  const ruidoVisita = L.limpia(visita.consola);
  comprobar('consola del visitante sin errores', ruidoVisita.length === 0, '\n      ' + ruidoVisita.slice(0, 6).join('\n      '));
  await visita.cerrar();

  seccion('admin: caritas de asistencia (cuántas veces faltó cada cliente)');
  // Carla faltó dos veces con Jose y vino una; tiene un turno mañana con Trip, a las 9:00 p. m. (sin cruzarse con la demo).
  // Nora nunca ha venido: es nueva.
  const diaAntes = n => { const d = new Date(); d.setDate(d.getDate() - n); return claveD(d); };
  const MANANA = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return claveD(d); })();
  const citaDe = (nombre, telefono, dia, estado, barberoId = 'JoseJulian', hora = '21:00') => ({
    userId: '', userName: nombre, userEmail: '', phone: telefono, servicioId: 'S1', serviceName: 'Acicale sencillo', precio: 30000, duracionMinutos: 40,
    barberoId, barberoNombre: barberoId === 'Trip' ? 'Juan Sebastián "Trip"' : 'Jose Julian', dia, hora, horaStr: '9:00 PM',
    fecha: new Date(`${dia}T${hora}:00`).toISOString(), estado, creadoEn: new Date(Date.now() - 20 * 86400000).toISOString(),
  });
  await L.guardarDoc('citas/carla1', citaDe('Carla Faltona', '3159990001', diaAntes(20), 'completada'));
  await L.guardarDoc('citas/carla2', citaDe('Carla Faltona', '3159990001', diaAntes(13), 'no-asistio'));
  await L.guardarDoc('citas/carla3', citaDe('Carla Faltona', '315 999 0001', diaAntes(6), 'no-asistio'));
  await L.guardarDoc('citas/carla4', citaDe('Carla Faltona', '3159990001', MANANA, 'pendiente', 'Trip'));
  await L.apartarEnAgenda('Trip', MANANA, 1260, 40, 'carla4');
  await L.guardarDoc('citas/nora1', citaDe('Nora Nueva', '3159990002', MANANA, 'pendiente'));
  await L.apartarEnAgenda('JoseJulian', MANANA, 1260, 40, 'nora1');
  await pestana(a.pagina, 'Citas');
  await clic(a.pagina, 'Lista', 'button');
  await clic(a.pagina, 'Todos', '[aria-label="Ver las citas de"] button').catch(() => {});
  const caritasDe = async (periodo, nombre) => {
    await clic(a.pagina, periodo, '[aria-label="Qué días ver"] button');
    await L.escribir(a.pagina, 'input[name="buscarCita"]', nombre);
    await pausa(500);
    return a.pagina.evaluate(() => [...document.querySelectorAll('table.tabla tbody tr[data-cita]')].map(tr => ({
      nivel: tr.querySelector('app-carita')?.getAttribute('data-nivel'), titulo: tr.querySelector('app-carita')?.getAttribute('title'), estado: tr.textContent.includes('No asistió') ? 'no-asistio' : '',
    })));
  };
  let carla = await caritasDe('Próximas', 'Carla');
  comprobar('Carla (faltó 2 de 3 turnos) sale con la carita 3, roja', carla.length === 1 && carla[0].nivel === '3' && carla[0].titulo === 'Faltó 2 veces de 3 turnos', JSON.stringify(carla));
  const nora = await caritasDe('Próximas', 'Nora');
  comprobar('Nora, sin turnos marcados, sale como cliente nueva (gris)', nora.length === 1 && nora[0].nivel === '0', JSON.stringify(nora));
  carla = await caritasDe('Pasadas', 'Carla');
  comprobar('en sus turnos pasados también: el celular escrito con espacios es la misma persona', carla.length === 3 && carla.every(c => c.nivel === '3'), JSON.stringify(carla));
  await captura(a.pagina, '34i-admin-caritas');
  // Un "No asistió" marcado por error se corrige con "Sí vino" (queda como hecho, con el valor cobrado).
  await clic(a.pagina, 'Sí vino', 'table button');
  await esperarTexto(a.pagina, 'Marcar como hecho');
  await clic(a.pagina, 'Marcar como hecho', 'button[type="submit"]');
  await a.pagina.waitForFunction(() => [...document.querySelectorAll('table.tabla tbody tr[data-cita] app-carita')].every(c => c.getAttribute('data-nivel') === '2'), { timeout: 10000 }).catch(() => {});
  carla = await caritasDe('Pasadas', 'Carla');
  const corregidas = (await L.docs('citas')).filter(c => c.userName === 'Carla Faltona' && c.estado === 'no-asistio').length;
  comprobar('con "Sí vino" la falta se corrige y la carita pasa a la amarilla (faltó 1 vez)', corregidas === 1 && carla.every(c => c.nivel === '2'), `${corregidas} faltas · ${JSON.stringify(carla)}`);
  await L.escribir(a.pagina, 'input[name="buscarCita"]', '');
  await clic(a.pagina, 'Próximas', '[aria-label="Qué días ver"] button');
  await clic(a.pagina, '¿Qué dicen las caritas?', 'summary');
  await pausa(300);
  comprobar('"¿Qué dicen las caritas?" explica las seis', await a.pagina.evaluate(() => {
    const leyenda = document.querySelector('[data-leyenda-caritas]');
    return leyenda.open && leyenda.querySelectorAll('li app-carita').length === 6 && leyenda.textContent.includes('Faltó a 4 turnos o más');
  }));
  await captura(a.pagina, '34j-admin-leyenda-caritas');
  await clic(a.pagina, 'Calendario', 'button');
  await pausa(300);

  seccion('admin: multa por no asistir (se pone sola al marcar "No asistió" y se cobra en la visita siguiente)');
  await pestana(a.pagina, 'Ajustes');
  await esperarTexto(a.pagina, 'Multa por no asistir');
  await clic(a.pagina, 'Sin multa', '[data-ajuste-multa] label');
  await pausa(300);
  comprobar('al activarla propone 10.000 y que se ponga sola', await a.pagina.evaluate(() =>
    document.querySelector('input[name="multaValor"]')?.value === '10000'
    && document.querySelector('[data-ajuste-multa] button[aria-pressed="true"]')?.textContent.includes('Sola')));
  await L.escribir(a.pagina, 'input[name="multaValor"]', '15000');
  await captura(a.pagina, '34k-admin-ajustes-multa');
  await clic(a.pagina, 'Guardar ajustes', 'button[type="submit"]');
  await esperarTexto(a.pagina, 'Ajustes guardados');
  const multaGuardada = (await L.doc('ajustes/sitio'))?.multa;
  comprobar('se guarda: activa, de $15.000 y automática', multaGuardada?.activa === true && multaGuardada?.valor === 15000 && multaGuardada?.automatica === true, JSON.stringify(multaGuardada));
  comprobar('y el resto de los ajustes queda guardado (el horario sigue ahí)', !!(await L.doc('ajustes/sitio'))?.horario);

  // Felipe tenía turno ayer y no llegó; vuelve mañana con Trip.
  const AYER = diaAntes(1);
  await L.guardarDoc('citas/felipe1', citaDe('Felipe Multado', '3159990003', AYER, 'pendiente'));
  await L.guardarDoc('citas/felipe2', citaDe('Felipe Multado', '3159990003', MANANA, 'pendiente', 'Trip', '20:00'));
  await L.apartarEnAgenda('Trip', MANANA, 1200, 40, 'felipe2');
  await pestana(a.pagina, 'Citas');
  await clic(a.pagina, 'Lista', 'button');
  const filaDe = () => a.pagina.evaluate(() => {
    const tr = document.querySelector('table.tabla tbody tr[data-cita]');
    return tr ? { texto: tr.textContent.replace(/\s+/g, ' '), nivel: tr.querySelector('app-carita')?.getAttribute('data-nivel'), debe: tr.querySelector('[data-debe-multa]')?.textContent.replace(/\s+/g, ' ').trim() ?? '' } : null;
  });
  await clic(a.pagina, 'Pasadas', '[aria-label="Qué días ver"] button');
  await L.escribir(a.pagina, 'input[name="buscarCita"]', 'Felipe');
  await pausa(500);
  await a.pagina.$eval('table.tabla tbody tr[data-cita] button[aria-label="Marcar que no asistió"]', b => b.click());
  await esperarTexto(a.pagina, '¿El cliente no asistió?');
  comprobar('al marcar "No asistió" la multa ya viene puesta, con su valor', await a.pagina.evaluate(() =>
    document.querySelector('[role="dialog"] input[name="ponerMulta"]')?.checked === true && document.querySelector('[role="dialog"] input[name="valorMulta"]')?.value === '15000'));
  await captura(a.pagina, '34l-admin-no-asistio-multa');
  await clic(a.pagina, 'No asistió, con multa', '[role="dialog"] button[type="submit"]');
  await a.pagina.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 10000 }).catch(() => {});
  await pausa(600);
  const felipe1 = await L.doc('citas/felipe1');
  comprobar('queda "No asistió" con la multa de $15.000', felipe1?.estado === 'no-asistio' && felipe1?.multa === 15000, JSON.stringify({ estado: felipe1?.estado, multa: felipe1?.multa }));
  let fila = await filaDe();
  comprobar('la cita dice la multa y la carita dice que la debe', /Multa \$ ?15\.000/.test(fila?.texto ?? '') && fila?.nivel === '2' && /Debe \$ ?15\.000/.test(fila?.debe ?? ''), JSON.stringify(fila));

  // Al día siguiente vuelve: al marcarlo "Hecho" se ofrece cobrar la multa (aparte del corte).
  await clic(a.pagina, 'Próximas', '[aria-label="Qué días ver"] button');
  await pausa(400);
  fila = await filaDe();
  comprobar('en su turno de mañana también sale que debe la multa', /Debe \$ ?15\.000/.test(fila?.debe ?? ''), JSON.stringify(fila));
  await a.pagina.$eval('table.tabla tbody tr[data-cita] button[aria-label="Marcar como hecho"]', b => b.click());
  await esperarTexto(a.pagina, 'Cobrar su multa pendiente');
  comprobar('"Hecho" ofrece cobrar la multa pendiente, ya marcada', await a.pagina.evaluate(() => document.querySelector('[data-cobrar-multa] input')?.checked === true));
  await captura(a.pagina, '34m-admin-cobrar-multa');
  await clic(a.pagina, 'Marcar como hecho', 'button[type="submit"]');
  await a.pagina.waitForFunction(() => !document.querySelector('[data-cobrar-multa]'), { timeout: 10000 }).catch(() => {});
  await pausa(600);
  const felipe2 = await L.doc('citas/felipe2');
  comprobar('la cita queda hecha con la multa cobrada aparte (el valor del corte no cambia)', felipe2?.estado === 'completada' && felipe2?.multaCobrada === 15000 && felipe2?.precioFinal === 30000, JSON.stringify(felipe2));
  await clic(a.pagina, 'Todas', '[aria-label="Qué días ver"] button');
  await pausa(400);
  comprobar('y ya no debe nada', await a.pagina.evaluate(() => !document.querySelector('table.tabla [data-debe-multa]')));

  // Gloria no vino, pero avisó: se le quita la multa.
  await L.guardarDoc('citas/gloria1', citaDe('Gloria Perdonada', '3159990004', AYER, 'pendiente'));
  await clic(a.pagina, 'Pasadas', '[aria-label="Qué días ver"] button');
  await L.escribir(a.pagina, 'input[name="buscarCita"]', 'Gloria');
  await pausa(500);
  await a.pagina.$eval('table.tabla tbody tr[data-cita] button[aria-label="Marcar que no asistió"]', b => b.click());
  await esperarTexto(a.pagina, '¿El cliente no asistió?');
  await clic(a.pagina, 'No asistió, con multa', '[role="dialog"] button[type="submit"]');
  await a.pagina.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 10000 }).catch(() => {});
  await pausa(500);
  await clic(a.pagina, 'Quitar multa', 'table button');
  await esperarTexto(a.pagina, '¿Quitarle la multa?');
  await clic(a.pagina, 'Sí, quitarla', 'button');
  await pausa(800);
  const gloria = await L.doc('citas/gloria1');
  comprobar('"Quitar multa" se la perdona (sigue como "No asistió")', gloria?.estado === 'no-asistio' && !gloria?.multa, JSON.stringify({ estado: gloria?.estado, multa: gloria?.multa }));
  await L.escribir(a.pagina, 'input[name="buscarCita"]', '');
  await clic(a.pagina, 'Próximas', '[aria-label="Qué días ver"] button');
  await clic(a.pagina, 'Calendario', 'button');

  await pestana(a.pagina, 'Cortes y ganancias');
  await pausa(600);
  comprobar('"Cortes y ganancias" resume las multas puestas, cobradas y por cobrar', await a.pagina.evaluate(() => {
    const r = document.querySelector('[data-resumen-multas]');
    return !!r && ['Puestas', 'Cobradas', 'Por cobrar'].every(t => r.textContent.includes(t));
  }));

  // El cliente lo sabe antes de reservar, y en "Mis reservas" ve lo que debe.
  const conMulta = await L.sesion(navegador);
  await L.elegirCookies(conMulta.pagina);
  await L.guardarDoc('citas/anaMulta', { ...citaDe('Ana Gómez', '3001234567', diaAntes(3), 'no-asistio'), userId: uidCliente, multa: 15000 });
  await L.entrar(conMulta.pagina, 'ana.cliente@example.com', CLAVE);
  await ir(conMulta.pagina, '/mis-citas');
  await esperarTexto(conMulta.pagina, 'Historial');
  comprobar('en "Mis reservas" el cliente ve la multa que debe', /Tienes una multa pendiente de \$ ?15\.000/.test(await texto(conMulta.pagina)));
  await ir(conMulta.pagina, '/reservar');
  await clic(conMulta.pagina, 'Juan Sebastián', 'button');
  await clic(conMulta.pagina, 'Acicale sencillo', 'button');
  await conMulta.pagina.waitForFunction(() => [...document.querySelectorAll('button[aria-pressed]')].some(b => /\d:\d\d (AM|PM)/.test(b.textContent)), { timeout: 15000 });
  await conMulta.pagina.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].find(b => /\d:\d\d (AM|PM)/.test(b.textContent)).click());
  await clic(conMulta.pagina, 'Continuar', 'button');
  await esperarTexto(conMulta.pagina, 'Tus datos');
  comprobar('antes de confirmar la reserva se le avisa de la multa', /Si no vienes ni cancelas antes, se cobra una multa de \$ ?15\.000 en tu próxima visita/.test(await texto(conMulta.pagina)));
  await captura(conMulta.pagina, '34n-reservar-aviso-multa');
  await conMulta.cerrar();

  seccion('admin: equipo (foto en Storage, Instagram y disponibilidad)');
  await pestana(a.pagina, 'Equipo');
  await esperarTexto(a.pagina, 'trip.demo@example.com');
  await pausa(1500);
  comprobar('abrir Equipo le da el rol de barbero a la cuenta enlazada', (await L.docs('usuarios')).find(u => u.email === 'trip.demo@example.com')?.rol === 'barbero');
  await captura(a.pagina, '35-admin-equipo');
  await a.pagina.evaluate(() => [...document.querySelectorAll('button[title="Editar"]')][0].click());
  await esperarTexto(a.pagina, 'Editar a Jose Julian');
  const entrada = await a.pagina.$('input[type="file"]');
  await entrada.uploadFile(path.join(PROYECTO, 'recursos/originales/jjulian.jpg'));
  await a.pagina.waitForFunction(() => /127\.0\.0\.1:9199/.test(document.querySelector('form img')?.src ?? ''), { timeout: 20000 });
  comprobar('"Subir foto" la sube a Storage y la deja de vista previa', true);
  await L.escribir(a.pagina, 'input[name="instagram"]', '@josejulian_barbero');
  await captura(a.pagina, '36-admin-editar-barbero');
  await clic(a.pagina, 'Guardar cambios', 'button[type="submit"]');
  await esperarTexto(a.pagina, 'Cambios guardados');
  const jose = await L.doc('barberos/JoseJulian');
  comprobar('la foto queda como avatar (URL de Storage) y el Instagram sin la arroba', /127\.0\.0\.1:9199.*staff/.test(jose.avatar) && jose.instagram === 'josejulian_barbero', JSON.stringify(jose));
  comprobar('lo privado sigue aparte: el documento público no trae correo ni comisión', !('emailAsociado' in jose) && !('comision' in jose));
  const pesoFoto = await fetch(jose.avatar).then(r => r.arrayBuffer()).then(b => b.byteLength);
  comprobar('la foto se redujo antes de subir (WebP de menos de 300 KB)', pesoFoto < 300 * 1024 && /\.webp/.test(jose.avatar), `${Math.round(pesoFoto / 1024)} KB`);

  await clic(a.pagina, 'Días libres y horarios cerrados', 'button');
  await esperarTexto(a.pagina, 'Disponibilidad de');
  await captura(a.pagina, '37-admin-disponibilidad');

  seccion('admin: usuarios y ajustes');
  await pestana(a.pagina, 'Usuarios y roles');
  await esperarTexto(a.pagina, 'trip.demo@example.com');
  await captura(a.pagina, '38-admin-usuarios');
  // Dar el rol de admin pide confirmación.
  await a.pagina.evaluate(() => {
    const fila = [...document.querySelectorAll('li')].find(li => li.textContent.includes('trip.demo@example.com'));
    [...fila.querySelectorAll('button')].find(b => b.textContent.trim() === 'Admin').click();
  });
  await esperarTexto(a.pagina, '¿Hacer admin a');
  comprobar('hacer admin a alguien pide confirmación', true);
  await clic(a.pagina, 'Volver', 'button');
  await pausa(400);
  comprobar('y si se dice que no, el rol no cambia', (await L.docs('usuarios')).find(u => u.email === 'trip.demo@example.com')?.rol === 'barbero');

  await pestana(a.pagina, 'Ajustes');
  await esperarTexto(a.pagina, 'Horario de atención');
  await pausa(500);
  const aperturas = await a.pagina.evaluate(() => {
    const elegida = n => document.querySelector(`select[name="apertura${n}"]`)?.selectedOptions[0]?.textContent.trim() ?? null;
    const resumen = [...document.querySelectorAll('[role="status"] li')].map(li => li.textContent.replace(/\s+/g, ' ').trim());
    return { lunes: elegida(1), viernes: elegida(5), sabado: elegida(6), resumen };
  });
  comprobar('Ajustes muestra la apertura propia de viernes y sábado', aperturas.viernes === '9:00 AM' && aperturas.sabado === '9:00 AM' && aperturas.lunes === 'Igual (9:20 AM)', JSON.stringify(aperturas));
  comprobar('y cómo quedan los turnos: el primero y el último de cada grupo de días',
    aperturas.resumen.some(r => r.startsWith('Lun – Jue: primer turno 9:20 AM, último 6:40 PM'))
    && aperturas.resumen.some(r => r.startsWith('Vie – Sáb: primer turno 9:00 AM, último 7:00 PM')), JSON.stringify(aperturas.resumen));
  await a.pagina.select('select[name="cierre"]', await a.pagina.evaluate(() => [...document.querySelectorAll('select[name="cierre"] option')].find(o => o.textContent.trim() === '7:00 PM').value));
  const festivo = await a.pagina.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await a.pagina.$eval('input[name="nuevoCierre"]', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, festivo);
  await clic(a.pagina, 'Agregar fecha', 'button');
  await captura(a.pagina, '39-admin-ajustes');
  await clic(a.pagina, 'Guardar ajustes', 'button[type="submit"]');
  await esperarTexto(a.pagina, 'Ajustes guardados');
  const sitio = await L.doc('ajustes/sitio');
  comprobar('el horario y la fecha cerrada se guardan en ajustes/sitio', sitio.horario.cierre === 1140 && sitio.horario.cierres.includes(festivo), JSON.stringify(sitio.horario));
  comprobar('con la apertura general (9:20) y la de viernes y sábado (9:00)', sitio.horario.apertura === 560 && JSON.stringify(sitio.horario.aperturas) === '{"5":540,"6":540}', JSON.stringify(sitio.horario));

  const visitante = await L.sesion(navegador);
  await L.elegirCookies(visitante.pagina);
  await ir(visitante.pagina, '/');
  await pausa(800);
  comprobar('la página pública muestra el horario nuevo sin publicar nada, con cada grupo de días', await (async () => {
    const t = await texto(visitante.pagina);
    return t.includes('9:20 AM – 7:00 PM') && t.includes('9:00 AM – 7:00 PM') && t.includes('Lun – Jue') && t.includes('Vie – Sáb');
  })());
  comprobar('y la foto nueva del barbero', await visitante.pagina.evaluate(() => /9199/.test(document.querySelector('#equipo article img')?.src ?? '')));
  await ir(visitante.pagina, '/reservar');
  await clic(visitante.pagina, 'Jose Julian', 'button');
  await clic(visitante.pagina, 'Acicale sencillo', 'button');
  await esperarTexto(visitante.pagina, 'Horas libres');
  const diaFestivo = String(Number(festivo.slice(8)));
  comprobar('la fecha cerrada no se puede elegir al reservar', await visitante.pagina.evaluate(n => {
    const celda = [...document.querySelectorAll('button[aria-pressed], button[disabled]')].find(b => b.textContent.trim() === n && b.getAttribute('aria-hidden') !== 'true');
    return !!celda && celda.disabled;
  }, diaFestivo));
  comprobar('ya no se ofrece el turno de las 7:00 (ahora cierra a esa hora)', await visitante.pagina.evaluate(() => ![...document.querySelectorAll('button')].some(b => b.textContent.trim() === '7:00 PM')));
  await visitante.cerrar();

  // ------------------------------------------------------------------
  seccion('admin: agenda por periodos');
  const fechaEn = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const ponerFecha = (nombre, valor) => a.pagina.$eval(`input[name="${nombre}"]`, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, valor);
  /** Días que el calendario de la reserva deja elegir, contando también los meses siguientes. */
  const diasElegibles = pagina => pagina.evaluate(async () => {
    const contar = () => [...document.querySelectorAll('button[aria-pressed]')].filter(b => /^\d+$/.test(b.textContent.trim()) && !b.disabled && b.getAttribute('aria-hidden') !== 'true').length;
    const espera = () => new Promise(r => setTimeout(r, 150));
    const siguiente = () => document.querySelector('button[aria-label="Mes siguiente"]');
    let total = contar(), avances = 0;
    while (siguiente() && !siguiente().disabled && avances < 3) { siguiente().click(); avances++; await espera(); total += contar(); }
    for (let i = 0; i < avances; i++) { document.querySelector('button[aria-label="Mes anterior"]').click(); await espera(); }
    return total;
  });
  const guardarAjustes = async () => {
    await L.esperarSinTexto(a.pagina, 'Ajustes guardados', 20000);
    await clic(a.pagina, 'Guardar ajustes', 'button[type="submit"]');
    await esperarTexto(a.pagina, 'Ajustes guardados');
  };

  // Un visitante que ya va por el calendario: debe ver los cambios sin recargar.
  const v = await L.sesion(navegador);
  await L.elegirCookies(v.pagina);
  await ir(v.pagina, '/reservar');
  await clic(v.pagina, 'Jose Julian', 'button');
  await clic(v.pagina, 'Acicale sencillo', 'button');
  await esperarTexto(v.pagina, 'Horas libres');
  const diasContinua = await diasElegibles(v.pagina);
  comprobar('con la agenda siempre abierta no hay aviso de periodo', !(await texto(v.pagina)).includes('Agenda abierta'));

  comprobar('en Ajustes la agenda empieza como "Siempre abierta"', await a.pagina.evaluate(() =>
    [...document.querySelectorAll('button[role="radio"]')].find(b => b.textContent.includes('Siempre abierta'))?.getAttribute('aria-checked') === 'true'));
  await clic(a.pagina, 'Por periodos', 'button[role="radio"]');
  await pausa(300);
  comprobar('al pasar a periodos propone 15 días desde hoy', await a.pagina.evaluate((d, h) =>
    document.querySelector('input[name="agendaDesde"]').value === d && document.querySelector('input[name="agendaHasta"]').value === h, fechaEn(0), fechaEn(15)));
  await ponerFecha('agendaHasta', fechaEn(3));
  await pausa(300);
  comprobar('y dice en claro lo que significan las fechas', (await texto(a.pagina)).includes('Tus clientes pueden reservar hasta el'));
  await captura(a.pagina, '39b-admin-agenda');
  await guardarAjustes();
  let agenda = (await L.doc('ajustes/sitio'));
  comprobar('el periodo se guarda en ajustes/sitio, sin perder el horario', agenda.agenda.modo === 'periodo' && agenda.agenda.desde === fechaEn(0) && agenda.agenda.hasta === fechaEn(3) && agenda.horario.cierre === 1140, JSON.stringify(agenda.agenda));

  await esperarTexto(v.pagina, 'Agenda abierta hasta el');
  const diasPeriodo = await diasElegibles(v.pagina);
  comprobar('el calendario del visitante se recorta al periodo sin recargar la página', diasPeriodo <= 4 && diasPeriodo < diasContinua, `${diasContinua} -> ${diasPeriodo}`);
  await captura(v.pagina, '39c-reservar-con-periodo');

  await pestana(a.pagina, 'Inicio');
  await esperarTexto(a.pagina, 'Abrir 15 días más');
  comprobar('el inicio del panel avisa hasta cuándo está abierta la agenda', (await texto(a.pagina)).includes('Agenda abierta hasta el'));
  await captura(a.pagina, '39d-admin-inicio-agenda');
  await clic(a.pagina, 'Abrir 15 días más', 'button');
  await esperarTexto(a.pagina, '¿Abrir la agenda hasta el');
  await clic(a.pagina, 'Sí, abrirla', 'button');
  await esperarTexto(a.pagina, 'Ya se puede reservar hasta el');
  agenda = await L.doc('ajustes/sitio');
  comprobar('"Abrir 15 días más" alarga el periodo desde su último día y no toca lo demás',
    agenda.agenda.desde === fechaEn(0) && agenda.agenda.hasta === fechaEn(18) && agenda.horario.cierre === 1140 && agenda.horario.cierres.includes(festivo), JSON.stringify(agenda));
  let diasExtendida = diasPeriodo;
  for (let i = 0; i < 20 && diasExtendida <= diasPeriodo; i++) { await pausa(500); diasExtendida = await diasElegibles(v.pagina); }
  comprobar('y al visitante le aparecen los días nuevos (más que con la agenda de 14 días)', diasExtendida > diasContinua, `${diasPeriodo} -> ${diasExtendida}`);

  await pestana(a.pagina, 'Ajustes');
  await esperarTexto(a.pagina, 'Agenda de reservas');
  await ponerFecha('agendaDesde', fechaEn(-10));
  await ponerFecha('agendaHasta', fechaEn(-1));
  await pausa(300);
  comprobar('con fechas que ya pasaron avisa que la agenda queda cerrada', (await texto(a.pagina)).includes('la agenda queda cerrada'));
  await guardarAjustes();
  await esperarTexto(v.pagina, 'Pronto abrimos nuevas fechas');
  comprobar('con el periodo vencido la reserva dice que la agenda está cerrada', await v.pagina.evaluate(() => !document.querySelector('nav[aria-label="Pasos de la reserva"]')));
  await captura(v.pagina, '39e-agenda-cerrada');
  await pestana(a.pagina, 'Inicio');
  await esperarTexto(a.pagina, 'La agenda está cerrada');
  comprobar('y el inicio del panel lo avisa en rojo, con el botón para abrirla', (await texto(a.pagina)).includes('Abrir 15 días más'));

  // Se deja como estaba para lo que sigue.
  await pestana(a.pagina, 'Ajustes');
  await esperarTexto(a.pagina, 'Agenda de reservas');
  await clic(a.pagina, 'Siempre abierta', 'button[role="radio"]');
  await guardarAjustes();
  await esperarTexto(v.pagina, 'Horas libres');
  comprobar('al volver a "Siempre abierta" se puede reservar otra vez', (await L.doc('ajustes/sitio')).agenda.modo === 'continua' && await diasElegibles(v.pagina) === diasContinua);
  const ruidoVisitante = L.limpia(v.consola);
  comprobar('consola del visitante sin errores', ruidoVisitante.length === 0, '\n      ' + ruidoVisitante.slice(0, 6).join('\n      '));
  await v.cerrar();

  const ruidoAdmin = L.limpia(a.consola);
  comprobar('consola del admin sin errores', ruidoAdmin.length === 0, '\n      ' + ruidoAdmin.slice(0, 8).join('\n      '));
  await a.cerrar();

  // ------------------------------------------------------------------
  seccion('barbero: agenda y disponibilidad');
  t = await L.sesion(navegador);
  global.ultimaPagina = t.pagina;
  await L.elegirCookies(t.pagina);
  await L.entrar(t.pagina, 'trip.demo@example.com', CLAVE);
  comprobar('con el rol asignado entra directo a su panel', t.pagina.url().endsWith('/barbero'), t.pagina.url());
  await esperarTexto(t.pagina, 'Hola, Juan');
  await pausa(1200);
  await captura(t.pagina, '40-barbero-agenda', true);
  // El de "Recordarle", no el de "Pedir reseña" (de noche, las citas de hoy ya pasaron y ese sale primero).
  const recordatorio = await t.pagina.evaluate(() => [...document.querySelectorAll('a[href^="https://wa.me/57"]')]
    .find(a => /Recordarle/.test(a.textContent + (a.getAttribute('aria-label') ?? '')))?.href ?? '');
  comprobar('cada cita trae el recordatorio de WhatsApp ya escrito', /wa\.me\/573\d{9}\?text=Hola%20/.test(recordatorio) && decodeURIComponent(recordatorio).includes('te recordamos tu cita en El Acicale'), decodeURIComponent(recordatorio).slice(0, 160));
  // Carla (de la sección de las caritas) tiene mañana un turno con Trip y faltó una vez con Jose.
  const caritaCarla = await t.pagina.evaluate(() => [...document.querySelectorAll('li')].find(li => li.textContent.includes('Carla Faltona'))?.querySelector('app-carita')?.getAttribute('data-nivel') ?? null);
  comprobar('el barbero ve la carita de su cliente, con la falta que tuvo con otro barbero', caritaCarla === '2', String(caritaCarla));

  // Se agenda él mismo una cita después del cierre (7:00 PM desde los ajustes de arriba), sin elegir barbero ni correo.
  const diaTrip = await t.pagina.evaluate(festivo => {
    const clave = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const d = new Date();
    d.setDate(d.getDate() + 9);
    while ([0, 1, 3].includes(d.getDay()) || clave(d) === festivo) d.setDate(d.getDate() + 1);
    return clave(d);
  }, festivo);
  // El número de "Próximas citas" (la lista muestra solo las 10 primeras).
  const proximasTrip = () => t.pagina.evaluate(() => Number([...document.querySelectorAll('p')].find(p => p.textContent.trim() === 'Próximas citas')?.nextElementSibling?.textContent.trim()));
  const proximasAntes = await proximasTrip();
  await clic(t.pagina, 'Nueva cita', 'button');
  await t.pagina.waitForSelector('#nueva-cita', { visible: true });
  comprobar('su "Nueva cita" es solo para él: sin elegir barbero ni poner correo', await t.pagina.evaluate(() =>
    !document.querySelector('select[name="nuevaBarbero"]') && !document.querySelector('input[name="nuevaCorreo"]')));
  await t.pagina.$eval('input[name="nuevaDia"]', (el, d) => { el.value = d; el.dispatchEvent(new Event('input', { bubbles: true })); }, diaTrip);
  await t.pagina.waitForFunction(() => document.querySelectorAll('select[name="nuevaMinutos"] option:not([disabled])').length > 0, { timeout: 15000 });
  const duracionTrip = Number((await t.pagina.$eval('select[name="nuevaServicio"]', s => s.selectedOptions[0]?.textContent.trim())).match(/(\d+) min/)?.[1]);
  const tardeTrip = await horasDelGrupo(t.pagina, 'Después del cierre');
  comprobar('también le ofrece horas después del cierre, hasta las 10:00 p. m.', tardeTrip.length > 0
    && tardeTrip.every(h => minutosDeHora(h) + duracionTrip > 1140 && minutosDeHora(h) + duracionTrip <= 1320), `${tardeTrip[0]} … ${tardeTrip.at(-1)}`);
  const horaTrip = tardeTrip.find(h => minutosDeHora(h) === 1200) ?? tardeTrip[0];
  await L.escribir(t.pagina, 'input[name="nuevaNombre"]', 'Cliente De Trip');
  await elegirHora(t.pagina, horaTrip);
  await captura(t.pagina, '40b-barbero-nueva-cita', true);
  const logTrip = require('fs').existsSync(L.LOG_EMULADORES) ? require('fs').statSync(L.LOG_EMULADORES).size : 0;
  await clic(t.pagina, 'Agendar cita', 'button[type="submit"]');
  const citaTrip = await citaLlamada('Cliente De Trip');
  const agendaTrip = await L.ocupacion('Trip', diaTrip);
  comprobar('la cita queda suya, marcada como del barbero, sin cuenta ni correo, y aparta su rato', !!citaTrip && citaTrip.barberoId === 'Trip'
    && citaTrip.origen === 'barbero' && citaTrip.userId === '' && citaTrip.userEmail === '' && citaTrip.horaStr === horaTrip && citaTrip.dia === diaTrip
    && JSON.stringify(agendaTrip.citas[citaTrip.id]) === JSON.stringify(L.tramo(minutosDeHora(horaTrip), duracionTrip)), JSON.stringify(citaTrip));
  await t.pagina.waitForFunction(() => !document.querySelector('#nueva-cita'), { timeout: 10000 });
  await t.pagina.waitForFunction(n => Number([...document.querySelectorAll('p')].find(p => p.textContent.trim() === 'Próximas citas')?.nextElementSibling?.textContent.trim()) === n + 1,
    { timeout: 10000 }, proximasAntes).catch(() => {});
  comprobar('y cuenta en sus próximas citas', await proximasTrip() === proximasAntes + 1, `${proximasAntes} -> ${await proximasTrip()}`);
  await pausa(4000);
  const correosTrip = L.correosDesde(L.LOG_EMULADORES, logTrip);
  comprobar('no sale ningún correo (ni a él por su propia cita)', !correosTrip.some(c => c.startsWith('nueva')), correosTrip.join(', ') || 'sin correos');

  // También elige la duración para ese cliente (las reglas le dejan otra duración, no otro precio).
  await clic(t.pagina, 'Nueva cita', 'button');
  await t.pagina.waitForSelector('#nueva-cita', { visible: true });
  await t.pagina.$eval('input[name="nuevaDia"]', (el, d) => { el.value = d; el.dispatchEvent(new Event('input', { bubbles: true })); }, diaTrip);
  await t.pagina.waitForFunction(() => document.querySelectorAll('select[name="nuevaMinutos"] option:not([disabled])').length > 0, { timeout: 15000 });
  const LARGA_TRIP = duracionTrip + 15;
  await elegirDuracionNueva(t.pagina, comoDuracion(LARGA_TRIP));
  await pausa(300);
  const mapaTrip = (await L.ocupacion('Trip', diaTrip)).mapa;
  const horasTrip = (await t.pagina.evaluate(() => [...document.querySelectorAll('select[name="nuevaMinutos"] option:not([disabled])')].map(o => o.textContent.trim())))
    .map(minutosDeHora);
  comprobar(`el barbero también cambia la duración (${comoDuracion(LARGA_TRIP)}) y sus horas se calculan con ella`, await duracionNueva(t.pagina) === comoDuracion(LARGA_TRIP)
    && horasTrip.length > 0 && horasTrip.every(m => L.libreEn(mapaTrip, m, LARGA_TRIP) && m + LARGA_TRIP <= 1320), `${horasTrip.length} horas`);
  const seguidosTrip = (await horasDelGrupo(t.pagina, 'Turnos seguidos')).map(minutosDeHora);
  const horaLarga = seguidosTrip[0] ?? horasTrip[0];
  await L.escribir(t.pagina, 'input[name="nuevaNombre"]', 'Fijo Largo De Trip');
  await elegirHora(t.pagina, await etiquetaDe(t.pagina, horaLarga));
  await captura(t.pagina, '40c-barbero-nueva-cita-duracion', true);
  await clic(t.pagina, 'Agendar cita', 'button[type="submit"]');
  const largaTrip = await citaLlamada('Fijo Largo De Trip');
  comprobar('su cita queda con esa duración, el precio del catálogo y justo ese rato apartado', !!largaTrip && largaTrip.duracionMinutos === LARGA_TRIP
    && largaTrip.origen === 'barbero' && largaTrip.precio === citaTrip?.precio && largaTrip.serviceName === citaTrip?.serviceName
    && JSON.stringify((await L.ocupacion('Trip', diaTrip)).citas[largaTrip.id]) === JSON.stringify(L.tramo(horaLarga, LARGA_TRIP)), JSON.stringify(largaTrip));
  await t.pagina.waitForFunction(() => !document.querySelector('#nueva-cita'), { timeout: 10000 });

  // Sus citas en calendario y en lista, como el admin: solo las suyas, sin editar, mover ni eliminar (eso es del admin).
  const VISTAS = '[aria-label="Cómo ver las citas"] button';
  await clic(t.pagina, 'Calendario y lista', 'button[role="tab"]');
  await esperarTexto(t.pagina, 'Tus citas');
  comprobar('el barbero tiene la vista de calendario y la de lista', (await t.pagina.$$eval(VISTAS, bs => bs.map(b => b.textContent.trim()))).join() === 'Calendario,Lista');
  const fechaTrip = new Date(`${diaTrip}T12:00:00`);
  if (fechaTrip.getMonth() !== new Date().getMonth()) await t.pagina.click('button[aria-label="Mes siguiente"]');
  await pausa(300);
  await t.pagina.evaluate(n => [...document.querySelectorAll('button[aria-pressed]')]
    .find(b => !b.className.includes('opacity-40') && b.querySelector('span')?.textContent.trim() === n).click(), String(fechaTrip.getDate()));
  await esperarTexto(t.pagina, 'Fijo Largo De Trip');
  const diaEnCalendario = await t.pagina.evaluate(() => {
    const suyas = [...document.querySelectorAll('li')].filter(li => /Cliente De Trip|Fijo Largo De Trip/.test(li.textContent));
    return {
      citas: suyas.length,
      hecho: suyas.every(li => [...li.querySelectorAll('button')].some(b => b.textContent.trim() === 'Hecho')),
      editar: !!document.querySelector('button[aria-label="Editar o mover la cita"]'),
      eliminar: !!document.querySelector('button[aria-label="Eliminar la cita"]'),
    };
  });
  comprobar('en el calendario elige el día y ve sus citas con "Hecho", sin editar ni eliminar', diaEnCalendario.citas === 2 && diaEnCalendario.hecho
    && !diaEnCalendario.editar && !diaEnCalendario.eliminar, JSON.stringify(diaEnCalendario));
  await captura(t.pagina, '40d-barbero-calendario');
  await t.pagina.click('button[aria-label="Agendar una cita este día"]');
  await t.pagina.waitForSelector('#nueva-cita', { visible: true });
  comprobar('el "+" del día abre su "Nueva cita" en ese día, solo para él', await t.pagina.evaluate(d =>
    document.querySelector('input[name="nuevaDia"]').value === d && !document.querySelector('select[name="nuevaBarbero"]'), diaTrip));
  await clic(t.pagina, 'Cancelar', 'form button[type="button"]');
  await clic(t.pagina, 'Lista', VISTAS);
  await pausa(600);
  comprobar('su lista abre en "Próximas", sin botones de barbero (ve solo las suyas)', await t.pagina.evaluate(() =>
    document.querySelector('[aria-label="Qué días ver"] button[aria-pressed="true"]')?.textContent.trim() === 'Próximas' && !document.querySelector('[aria-label="Ver las citas de"]')));
  await clic(t.pagina, 'Todas', '[aria-label="Qué días ver"] button');
  if (await t.pagina.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Ver las canceladas')))) await clic(t.pagina, 'Ver las canceladas', 'button');
  await pausa(400);
  const suyasTrip = (await L.docs('citas')).filter(c => c.barberoId === 'Trip' || c.barberoId === 'cualquiera').length;
  const lista = await t.pagina.evaluate(() => ({
    filas: document.querySelectorAll('table.tabla tbody tr[data-cita]').length,
    columnas: [...document.querySelectorAll('table.tabla thead th')].map(th => th.textContent.trim()),
    editar: !!document.querySelector('button[aria-label="Editar o mover la cita"]'),
  }));
  comprobar('en la lista están todas sus citas y solo las suyas (sin columna de barbero ni editar)', lista.filas === suyasTrip
    && !lista.columnas.includes('Barbero') && !lista.editar, `${lista.filas} filas, ${suyasTrip} suyas; ${lista.columnas.join(', ')}`);
  await captura(t.pagina, '40e-barbero-lista');

  await clic(t.pagina, 'Mi disponibilidad', 'button[role="tab"]');
  await esperarTexto(t.pagina, 'Cada semana');
  comprobar('las horas de cierre van de 5 en 5 (como la agenda)', await t.pagina.evaluate(() =>
    [...document.querySelectorAll('select[name="descansoDesde"] option, select[name="desde"] option')].some(o => o.textContent.trim() === '1:05 PM')
      || [...document.querySelectorAll('select option')].some(o => o.textContent.trim() === '1:05 PM')));
  comprobar('ve su día libre y su descanso guardados', await t.pagina.evaluate(() =>
    [...document.querySelectorAll('button[aria-pressed="true"]')].some(b => b.textContent.trim() === 'Lun') && document.body.textContent.includes('No atiendes: Lun')));
  // Agrega el miércoles como día libre.
  await t.pagina.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].find(b => b.textContent.trim() === 'Mié').click());
  await clic(t.pagina, 'Guardar', 'button');
  await esperarTexto(t.pagina, 'Disponibilidad guardada');
  comprobar('el barbero cambia su propio día libre', JSON.stringify((await L.doc('barberos/Trip')).diasLibres) === '[1,3]');

  // Cierra unas horas de un día concreto.
  // Un día que Trip atiende (ni domingo, ni lunes, ni el miércoles que acaba de cerrar) y que no sea el festivo.
  const dia = await t.pagina.evaluate(festivo => {
    const clave = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const d = new Date();
    d.setDate(d.getDate() + 4);
    while ([0, 1, 3].includes(d.getDay()) || clave(d) === festivo) d.setDate(d.getDate() + 1);
    return clave(d);
  }, festivo);
  await t.pagina.$eval('input[name="dia"]', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, dia);
  await t.pagina.select('select[name="motivo"]', await t.pagina.evaluate(() => [...document.querySelectorAll('select[name="motivo"] option')].find(o => o.textContent.trim() === 'Permiso').value));
  await clic(t.pagina, 'Todo el día', 'label');
  await pausa(300);
  const valorDe = (nombre, etiqueta) => t.pagina.evaluate((nombre, etiqueta) => [...document.querySelectorAll(`select[name="${nombre}"] option`)].find(o => o.textContent.trim() === etiqueta).value, nombre, etiqueta);
  await t.pagina.select('select[name="desde"]', await valorDe('desde', '3:00 PM'));
  await t.pagina.select('select[name="hasta"]', await valorDe('hasta', '5:00 PM'));
  const antes = await L.ocupacion('Trip', dia);
  await clic(t.pagina, 'Cerrar ese horario', 'button[type="submit"]');
  await esperarTexto(t.pagina, 'Horario cerrado');
  await pausa(800);
  const despues = await L.ocupacion('Trip', dia);
  // De 3:00 a 5:00 p. m. (marcas 180 a 204): lo libre queda con la letra de "Permiso" y las citas siguen ahí.
  const ratoAntes = antes.mapa.slice(180, 204);
  const ratoDespues = despues.mapa.slice(180, 204);
  comprobar('cierra solo lo que estaba libre, sin tocar las citas', ratoDespues === ratoAntes.replace(/0/g, 'P')
    && JSON.stringify(despues.citas) === JSON.stringify(antes.citas) && despues.mapa.slice(0, 180) === antes.mapa.slice(0, 180), `${ratoAntes} -> ${ratoDespues}`);
  comprobar('el cierre aparece en su lista', (await texto(t.pagina)).includes('Permiso'));
  await captura(t.pagina, '41-barbero-disponibilidad', true);

  // El cliente ya no ve esas horas con ese barbero.
  const c = await L.sesion(navegador);
  await L.elegirCookies(c.pagina);
  await ir(c.pagina, '/reservar');
  await clic(c.pagina, 'Juan Sebastián', 'button');
  await clic(c.pagina, 'Acicale sencillo', 'button');
  await esperarTexto(c.pagina, 'Horas libres');
  const numero = String(Number(dia.slice(8)));
  // A fin de mes ese día cae en el mes siguiente (el calendario abre en el de hoy).
  if (Number(dia.slice(5, 7)) !== new Date().getMonth() + 1) {
    await c.pagina.click('button[aria-label="Mes siguiente"]');
    await pausa(400);
  }
  await c.pagina.evaluate(n => [...document.querySelectorAll('button[aria-pressed]')].find(b => !b.disabled && b.textContent.trim() === n).click(), numero);
  await pausa(1500);
  const horas = await c.pagina.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].map(b => b.textContent.trim()).filter(x => /^\d{1,2}:\d{2} (AM|PM)$/.test(x)));
  // Ningún turno de 40 min se cruza con lo que cerró (3:00 a 5:00) ni con su descanso (1:00 a 2:00).
  const aMinutos = h => { const [, hh, mm, ap] = h.match(/(\d+):(\d+) (AM|PM)/); return ((+hh % 12) + (ap === 'PM' ? 12 : 0)) * 60 + +mm; };
  const seCruza = (h, desde, hasta) => aMinutos(h) < hasta && aMinutos(h) + 40 > desde;
  comprobar('la reserva deja de ofrecer las horas cerradas y su descanso (1:00 a 2:00)', horas.length > 0 && !horas.some(h => seCruza(h, 900, 1020) || seCruza(h, 780, 840)), horas.join(' '));
  const aperturaDia = [5, 6].includes(new Date(`${dia}T12:00:00`).getDay()) ? 540 : 560;
  comprobar('y son sus turnos encadenados: cada 40 min desde que abre, o desde que termina una cita, el descanso o el cierre',
    horas.map(aMinutos).join() === L.turnos(despues.mapa, aperturaDia, (await L.doc('ajustes/sitio')).horario.cierre, 40, { desde: 780, hasta: 840 }).join(), horas.join(' '));
  comprobar('y su día libre (lunes) no se puede elegir', await c.pagina.evaluate(() => {
    const lunes = [...document.querySelectorAll('button[aria-label^="lunes"]')];
    return lunes.length > 0 && lunes.every(b => b.disabled);
  }));
  await captura(c.pagina, '42-reservar-con-cierres');
  await c.cerrar();

  // Vuelve a abrir el horario.
  await clic(t.pagina, 'Volver a abrir', 'button[title="Volver a abrir"]').catch(() => t.pagina.evaluate(() => document.querySelector('button[title="Volver a abrir"]').click()));
  await esperarTexto(t.pagina, '¿Volver a abrir este horario?');
  await clic(t.pagina, 'Sí, abrirlo', 'button');
  await pausa(1200);
  comprobar('el barbero vuelve a abrir su horario', !/[DAPVOX]/.test((await L.ocupacion('Trip', dia)).mapa));

  await clic(t.pagina, 'Cortes y ganancias', 'button[role="tab"]');
  await esperarTexto(t.pagina, 'Cortes realizados');
  await captura(t.pagina, '43-barbero-cortes');
  const ruidoBarbero = L.limpia(t.consola);
  comprobar('consola del barbero sin errores', ruidoBarbero.length === 0, '\n      ' + ruidoBarbero.slice(0, 8).join('\n      '));
  await t.cerrar();

  void uidCliente;
  await navegador.close();
  process.exit(L.resumen() ? 1 : 0);
})().catch(async e => {
  console.error('\nFALLO DEL GUION:', e.message);
  try {
    await global.ultimaPagina.screenshot({ path: path.join(L.CAPTURAS, 'fallo.png') });
    console.error('URL:', global.ultimaPagina.url());
    console.error('Texto:', (await L.texto(global.ultimaPagina)).slice(0, 900));
  } catch { /* sin página */ }
  process.exit(2);
});
