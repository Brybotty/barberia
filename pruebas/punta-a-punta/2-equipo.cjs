// Parte 2: el equipo. Admin (inicio, citas, equipo con subida de foto, servicios, usuarios, ajustes de horario)
// y barbero (agenda, recordatorio por WhatsApp, día libre, descanso y cierre de horas).
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
  comprobar('la lista de citas dice "Agendada", "Hecho" o "No asistió" (no los nombres internos)', await a.pagina.evaluate(() => {
    const t = [...document.querySelectorAll('table td span')].map(s => s.textContent.trim());
    return t.length > 20 && !t.some(x => /^(pendiente|confirmada|completada|no-asistio)$/i.test(x));
  }));
  await captura(a.pagina, '32-admin-citas-lista');

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
  const ocupadosDia = new Set((await L.docs('slots')).filter(s => s.barberoId === idBarbero && s.dia === diaPanel).map(s => s.hora));
  const ofrecidas = await horasOfrecidas();
  const pisa = h => { for (let m = minutosDeHora(h); m < minutosDeHora(h) + duracionPanel; m += 20) if (ocupadosDia.has(`${p2(Math.floor(m / 60))}:${p2(m % 60)}`)) return true; return false; };
  comprobar('el formulario ofrece horas cada 20 min y ninguna pisa otra cita o cierre del barbero',
    ofrecidas.length > 5 && !ofrecidas.some(pisa), `${barberoPanel}, ${servicioPanel}, ${ofrecidas.length} horas, ${ocupadosDia.size} bloques ocupados`);

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
  const bloquesPanel = (await L.docs('slots')).filter(s => s.citaId === citaPanel?.id);
  comprobar('la cita queda guardada sin cuenta ni cupo, con el servicio y el barbero elegidos',
    !!citaPanel && citaPanel.userId === '' && !('cupoId' in citaPanel) && citaPanel.dia === diaPanel && citaPanel.barberoId === idBarbero
      && citaPanel.horaStr === horaPanel && citaPanel.estado === 'pendiente' && citaPanel.phone === '3105551234', JSON.stringify(citaPanel));
  comprobar('y ocupa sus bloques de 20 min', bloquesPanel.length === Math.ceil(duracionPanel / 20) && bloquesPanel.length === citaPanel.slotIds.length, `${bloquesPanel.length} bloques`);
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

  await pestana(a.pagina, 'Cortes y ganancias');
  await esperarTexto(a.pagina, 'Queda para la barbería');
  await captura(a.pagina, '33-admin-ganancias');

  await pestana(a.pagina, 'Servicios y precios');
  await esperarTexto(a.pagina, 'Acicale Premium');
  await captura(a.pagina, '34-admin-servicios');

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
  const recordatorio = await t.pagina.evaluate(() => [...document.querySelectorAll('a[href^="https://wa.me/57"]')][0]?.href ?? '');
  comprobar('cada cita trae el recordatorio de WhatsApp ya escrito', /wa\.me\/573\d{9}\?text=Hola%20/.test(recordatorio) && decodeURIComponent(recordatorio).includes('te recordamos tu cita en El Acicale'), decodeURIComponent(recordatorio).slice(0, 160));

  await clic(t.pagina, 'Mi disponibilidad', 'button[role="tab"]');
  await esperarTexto(t.pagina, 'Cada semana');
  comprobar('ve su día libre y su descanso guardados', await t.pagina.evaluate(() =>
    [...document.querySelectorAll('button[aria-pressed="true"]')].some(b => b.textContent.trim() === 'Lun') && document.body.textContent.includes('No atiendes: Lun')));
  // Agrega el miércoles como día libre.
  await t.pagina.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].find(b => b.textContent.trim() === 'Mié').click());
  await clic(t.pagina, 'Guardar', 'button');
  await esperarTexto(t.pagina, 'Disponibilidad guardada');
  comprobar('el barbero cambia su propio día libre', JSON.stringify((await L.doc('barberos/Trip')).diasLibres) === '[1,3]');

  // Cierra unas horas de un día concreto.
  const dia = await t.pagina.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 4); if (d.getDay() === 0 || d.getDay() === 1 || d.getDay() === 3) d.setDate(d.getDate() + 1); if (d.getDay() === 1) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await t.pagina.$eval('input[name="dia"]', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, dia);
  await t.pagina.select('select[name="motivo"]', await t.pagina.evaluate(() => [...document.querySelectorAll('select[name="motivo"] option')].find(o => o.textContent.trim() === 'Permiso').value));
  await clic(t.pagina, 'Todo el día', 'label');
  await pausa(300);
  const valorDe = (nombre, etiqueta) => t.pagina.evaluate((nombre, etiqueta) => [...document.querySelectorAll(`select[name="${nombre}"] option`)].find(o => o.textContent.trim() === etiqueta).value, nombre, etiqueta);
  await t.pagina.select('select[name="desde"]', await valorDe('desde', '3:00 PM'));
  await t.pagina.select('select[name="hasta"]', await valorDe('hasta', '5:00 PM'));
  const antes = (await L.docs('slots')).filter(s => s.barberoId === 'Trip' && s.dia === dia);
  await clic(t.pagina, 'Cerrar ese horario', 'button[type="submit"]');
  await esperarTexto(t.pagina, 'Horario cerrado');
  await pausa(800);
  const despues = (await L.docs('slots')).filter(s => s.barberoId === 'Trip' && s.dia === dia);
  const cerrados = despues.filter(s => s.bloqueo);
  const libresAntes = ['1500', '1520', '1540', '1600', '1620', '1640'].filter(h => !antes.some(s => s.id.endsWith(h)));
  comprobar('cierra solo los bloques que estaban libres, sin tocar las citas', cerrados.length === libresAntes.length && cerrados.every(s => s.motivo === 'Permiso')
    && antes.every(s => despues.some(d => d.id === s.id && d.citaId === s.citaId)), `cerrados ${cerrados.length}, libres antes ${libresAntes.length}`);
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
  await c.pagina.evaluate(n => [...document.querySelectorAll('button[aria-pressed]')].find(b => !b.disabled && b.textContent.trim() === n).click(), numero);
  await pausa(1500);
  const horas = await c.pagina.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].map(b => b.textContent.trim()).filter(x => /^\d{1,2}:\d{2} (AM|PM)$/.test(x)));
  // Ningún turno de 40 min se cruza con lo que cerró (3:00 a 5:00) ni con su descanso (1:00 a 2:00).
  const aMinutos = h => { const [, hh, mm, ap] = h.match(/(\d+):(\d+) (AM|PM)/); return ((+hh % 12) + (ap === 'PM' ? 12 : 0)) * 60 + +mm; };
  const seCruza = (h, desde, hasta) => aMinutos(h) < hasta && aMinutos(h) + 40 > desde;
  comprobar('la reserva deja de ofrecer las horas cerradas y su descanso (1:00 a 2:00)', horas.length > 0 && !horas.some(h => seCruza(h, 900, 1020) || seCruza(h, 780, 840)), horas.join(' '));
  comprobar('y los turnos van cada 40 minutos', horas.every((h, i) => i === 0 || (aMinutos(h) - aMinutos(horas[0])) % 40 === 0), horas.join(' '));
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
  comprobar('el barbero vuelve a abrir su horario', !(await L.docs('slots')).some(s => s.barberoId === 'Trip' && s.dia === dia && s.bloqueo));

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
