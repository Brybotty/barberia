// Parte 4: agendas recurrentes. El admin crea (con un cliente nuevo, de la lista o sin cliente), edita, pausa y
// borra agendas de clientes fijos; la Cloud Function del emulador aparta los turnos; la reserva del cliente ya no
// ofrece esas horas; la agenda y el panel del barbero los marcan como recurrentes; las ganancias los suman.
// Necesita el emulador de funciones con el código compilado (npm --prefix functions run build).
const fs = require('fs');
const path = require('path');
const L = require('./lib.cjs');
const { comprobar, seccion, clic, ir, esperarTexto, captura, texto, pausa } = L;

const CLAVE = 'Clave-segura-1';
const ADMIN = 'ortizgonzalesbryanalexander1@gmail.com';
/** Días que la función deja apartados (HORIZONTE_DIAS en functions/src/recurrencias.ts). */
const HORIZONTE = 62;
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const p2 = n => String(n).padStart(2, '0');
const clave = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const aFecha = dia => { const [y, m, d] = dia.split('-').map(Number); return new Date(y, m - 1, d); };
const fechaEn = n => { const d = new Date(); d.setDate(d.getDate() + n); return clave(d); };
const sumar = (dia, n) => { const d = aFecha(dia); d.setDate(d.getDate() + n); return clave(d); };
const diaSemana = dia => aFecha(dia).getDay();
const corta = dia => `${DIAS_CORTOS[diaSemana(dia)]} ${aFecha(dia).getDate()} ${MESES[aFecha(dia).getMonth()]}`;
const hhmm = m => `${p2(Math.floor(m / 60))}${p2(m % 60)}`;
const hora24 = m => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
const hora12 = m => `${((Math.floor(m / 60) + 11) % 12) + 1}:${p2(m % 60)} ${m < 720 ? 'AM' : 'PM'}`;
const minutosDe = h => { const [, hh, mm, ap] = h.match(/(\d+):(\d+)\s*(AM|PM)/i); return (Number(hh) % 12 + (/PM/i.test(ap) ? 12 : 0)) * 60 + Number(mm); };
// Como en la demo: lunes a jueves desde las 9:20, viernes y sábado desde las 9:00, cierre 7:40 p. m.
const aperturaDe = dia => ([5, 6].includes(diaSemana(dia)) ? 540 : 560);
const CIERRE = 1180;
/** Días de una serie desde `desde`, cada `semanas`, hasta el horizonte. */
const serie = (desde, semanas) => { const r = []; for (let d = desde; d <= fechaEn(HORIZONTE); d = sumar(d, 7 * semanas)) r.push(d); return r; };
const tamanoLog = () => (fs.existsSync(L.LOG_EMULADORES) ? fs.statSync(L.LOG_EMULADORES).size : 0);

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
/** Fechas de la serie en que ese turno pisa un bloque ocupado del barbero (lo que debe marcar la ventana). */
async function choques(barberoId, dias, inicio, duracion, ignorar = '') {
  const ocupados = new Set((await L.docs('slots')).filter(s => s.barberoId === barberoId && !(ignorar && (s.citaId ?? '').startsWith(ignorar))).map(s => s.id));
  return dias.filter(d => { for (let t = inicio; t < inicio + duracion; t += 20) if (ocupados.has(`${barberoId}_${d}_${hhmm(t)}`)) return true; return false; });
}
const notaEsperada = (n, total) => (n === 0 ? 'Libre' : n === total ? 'Ocupada' : n === 1 ? '1 fecha ocupada' : `${n} ocupadas`);

// --- La ventana de la agenda recurrente ---
const campo = legend => `[...document.querySelectorAll('[role="dialog"] fieldset')].find(f => f.querySelector('legend')?.textContent.trim() === ${JSON.stringify(legend)})`;
/** Las horas que muestra: etiqueta, nota (Libre, Ocupada...) y si se puede elegir. */
const horasVentana = pagina => pagina.evaluate(`(() => { const c = ${campo('Hora')}; return c ? [...c.querySelectorAll('button[aria-pressed]')].map(b => ({ hora: b.children[0].textContent.trim(), nota: b.children[1].textContent.trim(), libre: !b.disabled })) : []; })()`);
const esperarHoras = pagina => pagina.waitForFunction(`(() => { const c = ${campo('Hora')}; return !!c && c.querySelectorAll('button[aria-pressed]').length > 0; })()`, { timeout: 15000 });
async function elegirEn(pagina, legend, inicio) {
  const hecho = await pagina.evaluate(`(() => { const c = ${campo(legend)}; const b = c && [...c.querySelectorAll('button')].find(x => !x.disabled && x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(inicio)})); if (b) b.click(); return !!b; })()`);
  if (!hecho) throw new Error(`No se pudo elegir "${inicio}" en "${legend}"`);
  await pausa(300);
}
const resumenVentana = pagina => pagina.evaluate(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent.replace(/\s+/g, ' ').trim() ?? '');
const valor = (pagina, nombre) => pagina.$eval(`input[name="${nombre}"]`, el => el.value);

/** En un calendario (el de la reserva o el del admin), pasa al mes del día y lo elige. */
async function irAlDia(pagina, dia, delAdmin = false) {
  const hoy = new Date();
  const meses = (aFecha(dia).getFullYear() - hoy.getFullYear()) * 12 + aFecha(dia).getMonth() - hoy.getMonth();
  for (let i = 0; i < meses; i++) { await pagina.click('button[aria-label="Mes siguiente"]'); await pausa(300); }
  const hecho = await pagina.evaluate((n, delAdmin) => {
    const boton = [...document.querySelectorAll('button[aria-pressed]')].find(b => delAdmin
      ? !b.className.includes('opacity-40') && b.querySelector('span')?.textContent.trim() === n
      : !b.disabled && b.getAttribute('aria-hidden') !== 'true' && b.textContent.trim() === n);
    boton?.click();
    return !!boton;
  }, String(aFecha(dia).getDate()), delAdmin);
  if (!hecho) throw new Error(`No se pudo elegir el día ${dia} en el calendario`);
  await pausa(1500);
}

(async () => {
  const navegador = await L.abrirNavegador();
  await L.reiniciar();
  await L.crearCuenta(ADMIN, CLAVE, 'Bryan Ortiz');
  await L.crearCuenta('trip.demo@example.com', CLAVE, 'Juan Sebastián');
  // Trip entra una vez (queda su perfil, como cliente): el rol de barbero se lo da el admin al abrir Equipo.
  const primeraVez = await L.sesion(navegador);
  await L.elegirCookies(primeraVez.pagina);
  await L.entrar(primeraVez.pagina, 'trip.demo@example.com', CLAVE);
  await primeraVez.cerrar();

  // ------------------------------------------------------------------
  seccion('admin: la pestaña de agendas recurrentes');
  const a = await L.sesion(navegador);
  global.ultimaPagina = a.pagina;
  await L.elegirCookies(a.pagina);
  await L.entrar(a.pagina, ADMIN, CLAVE);
  await esperarTexto(a.pagina, 'Hola, Bryan');
  // Abrir Equipo le da el rol de barbero a Trip (lo usa la parte del barbero).
  await pestana(a.pagina, 'Equipo');
  await esperarTexto(a.pagina, 'trip.demo@example.com');
  await pausa(1200);
  await pestana(a.pagina, 'Agendas recurrentes');
  await esperarTexto(a.pagina, 'Aún no hay agendas recurrentes');
  comprobar('sin agendas aún, explica para qué sirven y ofrece crear la primera', (await texto(a.pagina)).includes('Crear la primera'));
  await captura(a.pagina, '70-recurrentes-vacia');

  // ------------------------------------------------------------------
  seccion('admin: agenda semanal con un cliente nuevo');
  await clic(a.pagina, 'Nueva agenda recurrente', 'button');
  await esperarTexto(a.pagina, 'I · Cliente');
  const conCelular = (await L.docs('citas')).find(c => /^3\d{9}$/.test(c.phone ?? '') && c.userName);
  await L.escribir(a.pagina, 'input[name="buscarCliente"]', conCelular.userName.split(' ')[0]);
  await pausa(300);
  const enLista = n => a.pagina.evaluate(n => [...document.querySelectorAll('[role="dialog"] li button')].some(b => b.textContent.includes(n)), n);
  comprobar('los clientes salen de las citas: se buscan por nombre', await enLista(conCelular.userName));
  await L.escribir(a.pagina, 'input[name="buscarCliente"]', `${conCelular.phone.slice(0, 3)} ${conCelular.phone.slice(3, 6)}`);
  await pausa(300);
  comprobar('y por celular (aunque se escriba con espacios)', await enLista(conCelular.userName));
  await captura(a.pagina, '71-recurrente-cliente');

  await L.escribir(a.pagina, 'input[name="buscarCliente"]', 'Juan Camilo Rojas');
  await clic(a.pagina, 'Crear cliente', 'button');
  comprobar('"Crear cliente" trae el nombre que se estaba buscando', await valor(a.pagina, 'nuevoNombre') === 'Juan Camilo Rojas');
  await L.escribir(a.pagina, 'input[name="nuevoCelular"]', '301 234');
  await clic(a.pagina, 'Continuar', '[role="dialog"] button');
  comprobar('no sigue con un celular a medias', (await texto(a.pagina)).includes('10 dígitos, empezando por 3'));
  await L.escribir(a.pagina, 'input[name="nuevoCelular"]', '301 234 5678');
  await clic(a.pagina, 'Continuar', '[role="dialog"] button');
  await esperarTexto(a.pagina, 'II · Servicio');
  await clic(a.pagina, 'Acicale sencillo', '[role="dialog"] button');
  await esperarTexto(a.pagina, 'III · Agenda');

  // Primer turno: el día de la semana de dentro de 3 días (que no sea domingo), dentro de la agenda de la demo.
  let primero = fechaEn(3);
  if (diaSemana(primero) === 0) primero = fechaEn(4);
  comprobar('sin día elegido todavía no muestra horas (hay que escoger el día)', (await horasVentana(a.pagina)).length === 0);
  await elegirEn(a.pagina, 'Día', DIAS[diaSemana(primero)]);
  comprobar('el primer turno queda en la próxima fecha de ese día', await a.pagina.evaluate(`(() => ${campo('Primer turno')}.querySelector('button[aria-pressed="true"]').textContent.replace(/\\s+/g, ' ').trim())()`) === corta(primero));
  await a.pagina.click('button[aria-label="20 minutos más"]');
  await pausa(300);
  comprobar('la duración cambia de 20 en 20 (40 → 60 min) y recuerda la normal', (await texto(a.pagina)).includes('60 min') && (await texto(a.pagina)).includes('Normalmente dura 40 min'));
  await esperarHoras(a.pagina);
  await pausa(800);

  const fechas = serie(primero, 1);
  const horas = await horasVentana(a.pagina);
  const apertura = aperturaDe(primero);
  comprobar('las horas son los turnos de 40 min desde la apertura de ese día y hasta donde cabe el servicio',
    horas.length > 8 && minutosDe(horas[0].hora) === apertura && horas.every((h, i) => minutosDe(h.hora) === apertura + 40 * i)
      && minutosDe(horas[horas.length - 1].hora) + 60 <= CIERRE && minutosDe(horas[horas.length - 1].hora) + 100 > CIERRE, horas.map(h => h.hora).join(' '));
  const malas = [];
  for (const h of horas) {
    const n = (await choques('JoseJulian', fechas, minutosDe(h.hora), 60)).length;
    if (h.nota !== notaEsperada(n, fechas.length) || h.libre !== (n < fechas.length)) malas.push(`${h.hora}: dice "${h.nota}", la agenda tiene ${n} de ${fechas.length}`);
  }
  comprobar(`cada hora dice si está libre u ocupada en las ${fechas.length} fechas de la serie, igual que la agenda`, malas.length === 0, malas.slice(0, 4).join(' | '));
  const elegida = horas.filter(h => h.nota === 'Libre').pop();
  const m = minutosDe(elegida.hora);
  await elegirEn(a.pagina, 'Hora', elegida.hora);
  comprobar('el nombre y el celular del cliente nuevo ya vienen escritos', await valor(a.pagina, 'clienteNombre') === 'Juan Camilo Rojas' && await valor(a.pagina, 'clienteCelular') === '301 234 5678');
  const resumen = await resumenVentana(a.pagina);
  comprobar(`el resumen dice cuántos turnos se apartan (${fechas.length}) y cada cuánto`, resumen.includes(`apartan ${fechas.length} turnos`) && resumen.includes('cada semana'), resumen);
  await captura(a.pagina, '72-recurrente-agenda');

  const logAntes = tamanoLog();
  await clic(a.pagina, 'Crear cita recurrente', 'button');
  await esperarTexto(a.pagina, 'Agenda recurrente creada');
  const rec = (await L.docs('recurrencias')).find(r => r.clienteNombre === 'Juan Camilo Rojas');
  comprobar('se guarda la agenda con lo elegido', !!rec && rec.frecuencia === 'semanal' && rec.duracionMinutos === 60 && rec.barberoId === 'JoseJulian'
    && rec.desde === primero && rec.hora === hora24(m) && rec.clienteTelefono === '3012345678' && rec.activa === true && rec.serviceName === 'Acicale sencillo', JSON.stringify(rec));
  const turnosDe = async id => (await L.docs('citas')).filter(c => c.recurrenciaId === id);
  const turnos = await hasta(async () => { const t = await turnosDe(rec.id); return t.length === fechas.length ? t : null; });
  comprobar(`la función aparta un turno por semana hasta el horizonte (${fechas.length})`, !!turnos && turnos.map(t => t.dia).sort().join() === fechas.join(), (turnos ?? []).map(t => t.dia).join());
  comprobar('cada turno es una cita sin cuenta, marcada como recurrente, con sus 3 bloques de 20 min',
    !!turnos && turnos.every(t => t.userId === '' && t.frecuencia === 'semanal' && t.estado === 'pendiente' && t.hora === hora24(m) && t.horaStr === hora12(m)
      && t.slotIds.length === 3 && t.id === `${rec.id}_${t.dia.replace(/-/g, '')}` && t.userName === 'Juan Camilo Rojas' && t.phone === '3012345678'));
  const bloques = await L.docs('slots');
  comprobar('y sus bloques quedan ocupados en la agenda', !!turnos && turnos.every(t => t.slotIds.every(id => bloques.some(s => s.id === id && s.citaId === t.id))));
  await pausa(1500);
  comprobar('el panel no avisa (ni suena) "Nueva reserva" por cada turno que se aparta', !(await texto(a.pagina)).includes('Nueva reserva'));
  await esperarTexto(a.pagina, 'Próximo:');
  comprobar('la tarjeta dice el próximo turno y cuántos quedaron apartados', (await texto(a.pagina)).includes(`${fechas.length} turnos apartados`) && (await texto(a.pagina)).includes(corta(primero)));
  await captura(a.pagina, '73-recurrentes-lista');
  await pausa(3000);
  const correos = L.correosDesde(L.LOG_EMULADORES, logAntes);
  comprobar('los turnos recurrentes no envían correos (ni al barbero ni al cliente)', correos.length === 0, correos.join(', '));

  // ------------------------------------------------------------------
  seccion('cliente: esas horas ya no se pueden reservar');
  const v = await L.sesion(navegador);
  await L.elegirCookies(v.pagina);
  await ir(v.pagina, '/reservar');
  await clic(v.pagina, 'Jose Julian', 'button');
  await clic(v.pagina, 'Acicale sencillo', 'button');
  await esperarTexto(v.pagina, 'Horas libres');
  await irAlDia(v.pagina, primero);
  const ofrecidas = await v.pagina.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].map(b => b.textContent.trim()).filter(x => /^\d{1,2}:\d{2} (AM|PM)$/.test(x)));
  comprobar('la reserva no ofrece la hora del cliente fijo ni el turno siguiente (que pisa sus 60 min)',
    ofrecidas.length > 0 && !ofrecidas.includes(hora12(m)) && !ofrecidas.includes(hora12(m + 40)), ofrecidas.join(' '));
  await v.cerrar();

  // ------------------------------------------------------------------
  seccion('admin: los turnos están en la agenda, marcados, y se marcan como hechos');
  await pestana(a.pagina, 'Citas');
  await esperarTexto(a.pagina, 'Agenda del día');
  await irAlDia(a.pagina, primero, true);
  await esperarTexto(a.pagina, 'Juan Camilo Rojas');
  comprobar('el turno sale en la agenda del día con la marca "Recurrente · Semanal"', await a.pagina.evaluate(() =>
    [...document.querySelectorAll('li')].some(li => li.textContent.includes('Juan Camilo Rojas') && /Recurrente\s*·\s*Semanal/.test(li.textContent))));
  await captura(a.pagina, '74-agenda-con-recurrente');
  await a.pagina.evaluate(() => {
    const li = [...document.querySelectorAll('li')].find(x => x.textContent.includes('Juan Camilo Rojas') && x.querySelector('button'));
    [...li.querySelectorAll('button')].find(b => b.textContent.includes('Hecho')).click();
  });
  await esperarTexto(a.pagina, 'Corte realizado');
  await L.escribir(a.pagina, 'input[name="valor"]', '35000');
  await clic(a.pagina, 'Marcar como hecho', 'button[type="submit"]');
  const idPrimero = `${rec.id}_${primero.replace(/-/g, '')}`;
  const hecho = await hasta(async () => { const c = await L.doc(`citas/${idPrimero}`); return c?.estado === 'completada' ? c : null; }, 10000);
  comprobar('"Hecho" lo deja atendido con el valor cobrado, como cualquier cita', hecho?.precioFinal === 35000, JSON.stringify(hecho));

  // ------------------------------------------------------------------
  seccion('admin: editar la hora vuelve a apartar los turnos por venir');
  await pestana(a.pagina, 'Agendas recurrentes');
  await a.pagina.click('button[aria-label="Editar la agenda de Juan Camilo Rojas"]');
  await esperarTexto(a.pagina, 'Editar agenda recurrente');
  await esperarHoras(a.pagina);
  await pausa(800);
  const horasEdicion = await horasVentana(a.pagina);
  comprobar('al editar, su propia hora se ve libre (sus turnos no cuentan como ocupados) y viene elegida',
    horasEdicion.find(h => h.hora === elegida.hora)?.nota === 'Libre'
      && await a.pagina.evaluate(`(() => ${campo('Hora')}.querySelector('button[aria-pressed="true"]')?.children[0].textContent.trim())()`) === elegida.hora);
  const otra = horasEdicion.filter(h => h.nota === 'Libre' && Math.abs(minutosDe(h.hora) - m) >= 80)[0];
  const m2 = minutosDe(otra.hora);
  await elegirEn(a.pagina, 'Hora', otra.hora);
  comprobar('avisa que los turnos por venir se vuelven a apartar', (await texto(a.pagina)).includes('se vuelven a apartar con estos datos'));
  await clic(a.pagina, 'Guardar cambios', 'button');
  await esperarTexto(a.pagina, 'Agenda actualizada');
  const editados = await hasta(async () => {
    const t = await turnosDe(rec.id);
    return t.length === fechas.length && t.filter(x => x.estado === 'pendiente').every(x => x.hora === hora24(m2)) ? t : null;
  });
  comprobar('los turnos por venir pasan a la hora nueva', !!editados, JSON.stringify((await turnosDe(rec.id)).map(t => `${t.dia} ${t.hora} ${t.estado}`)));
  comprobar('y el que ya se atendió se queda como estaba (su hora y lo cobrado)', editados?.find(x => x.id === idPrimero)?.hora === hora24(m) && editados?.find(x => x.id === idPrimero)?.precioFinal === 35000);
  const bloques2 = await L.docs('slots');
  comprobar('las horas de antes quedan libres y las nuevas, ocupadas', !bloques2.some(s => fechas.slice(1).some(d => s.id === `JoseJulian_${d}_${hhmm(m)}`))
    && fechas.slice(1).every(d => bloques2.some(s => s.id === `JoseJulian_${d}_${hhmm(m2)}` && s.citaId === `${rec.id}_${d.replace(/-/g, '')}`)));

  // ------------------------------------------------------------------
  seccion('admin: pausar y reanudar');
  const botonDeTarjeta = async (cliente, textoBoton) => a.pagina.evaluate((cliente, textoBoton) => {
    const li = [...document.querySelectorAll('li')].find(x => x.querySelector('h3')?.textContent.trim() === cliente);
    [...li.querySelectorAll('button')].find(b => b.textContent.includes(textoBoton)).click();
  }, cliente, textoBoton);
  await botonDeTarjeta('Juan Camilo Rojas', 'Pausar');
  await esperarTexto(a.pagina, '¿Pausar la agenda de Juan Camilo Rojas?');
  await clic(a.pagina, 'Sí, pausar', 'button');
  const pausada = await hasta(async () => { const t = await turnosDe(rec.id); return t.length === 1 ? t : null; });
  comprobar('en pausa se sueltan sus turnos por venir (queda solo el ya atendido)', pausada?.[0]?.id === idPrimero);
  await esperarTexto(a.pagina, 'En pausa');
  comprobar('y la tarjeta dice que está en pausa', (await texto(a.pagina)).includes('Sus horas quedan libres mientras esté en pausa'));
  await botonDeTarjeta('Juan Camilo Rojas', 'Reanudar');
  const reanudada = await hasta(async () => (await turnosDe(rec.id)).length === fechas.length);
  comprobar('al reanudarla se vuelven a apartar', !!reanudada);

  // ------------------------------------------------------------------
  seccion('admin: agenda quincenal sin cliente guardado, con Trip, que choca con una cita');
  // Trip no atiende los lunes y descansa de 1:00 a 2:00 p. m. Su serie empieza mañana (o el siguiente día que atiende).
  let dTrip = fechaEn(1);
  while ([0, 1].includes(diaSemana(dTrip))) dTrip = sumar(dTrip, 1);
  const fechasTrip = serie(dTrip, 2);
  // Una hora libre en todas las fechas, fuera de su descanso; luego una cita le ocupa la segunda fecha.
  let tTrip = null;
  for (let t = aperturaDe(dTrip); t + 60 <= CIERRE && tTrip === null; t += 40) {
    if (t < 840 && t + 60 > 780) continue;
    if ((await choques('Trip', fechasTrip, t, 60)).length === 0) tTrip = t;
  }
  await L.guardarDoc(`slots/Trip_${fechasTrip[1]}_${hhmm(tTrip)}`, { barberoId: 'Trip', dia: fechasTrip[1], hora: hora24(tTrip), citaId: 'OTRA-CITA' });

  await clic(a.pagina, 'Nueva agenda recurrente', 'button');
  await esperarTexto(a.pagina, 'I · Cliente');
  await clic(a.pagina, 'Continuar sin agregar cliente', 'button');
  await clic(a.pagina, 'Barba2', '[role="dialog"] button');
  await esperarTexto(a.pagina, 'III · Agenda');
  comprobar('sin cliente, el nombre queda por escribir', await valor(a.pagina, 'clienteNombre') === '');
  await elegirEn(a.pagina, 'Barbero', 'Juan Sebastián');
  comprobar('con Trip, el lunes (su día libre) no se puede elegir', await a.pagina.evaluate(`(() => { const b = [...${campo('Día')}.querySelectorAll('button')].find(x => x.textContent.trim() === 'Lunes'); return !!b && b.disabled; })()`));
  await elegirEn(a.pagina, 'Tipo de recurrencia', 'Quincenal');
  await elegirEn(a.pagina, 'Día', DIAS[diaSemana(dTrip)]);
  await elegirEn(a.pagina, 'Primer turno', corta(dTrip));
  await esperarHoras(a.pagina);
  await pausa(800);
  const horasTrip = await horasVentana(a.pagina);
  const enDescanso = horasTrip.filter(h => minutosDe(h.hora) < 840 && minutosDe(h.hora) + 60 > 780);
  comprobar('las horas que pisan el descanso de Trip (1:00 a 2:00) dicen "Descanso" y no se eligen', enDescanso.length > 0 && enDescanso.every(h => h.nota === 'Descanso' && !h.libre), JSON.stringify(enDescanso));
  const conChoque = horasTrip.find(h => h.hora === hora12(tTrip));
  comprobar('la hora que ya tiene otra cita en una de las fechas dice "1 fecha ocupada" y sí se puede elegir', conChoque?.nota === '1 fecha ocupada' && conChoque.libre, JSON.stringify(conChoque));
  await elegirEn(a.pagina, 'Hora', hora12(tTrip));
  const aviso = await resumenVentana(a.pagina);
  comprobar('el resumen avisa qué fecha no se aparta y por qué', aviso.includes(`apartan ${fechasTrip.length - 1} turnos`) && aviso.includes(`${corta(fechasTrip[1])}: esa hora ya está ocupada`) && aviso.includes('cada 2 semanas'), aviso);
  await clic(a.pagina, 'Crear cita recurrente', 'button');
  await pausa(300);
  comprobar('sin nombre no guarda: lo pide', (await texto(a.pagina)).includes('Escribe el nombre del cliente') && !!(await a.pagina.$('#recurrente-titulo')));
  await L.escribir(a.pagina, 'input[name="clienteNombre"]', 'Pedro Quincenal');
  await L.escribir(a.pagina, 'input[name="clienteCelular"]', '3009876543');
  await captura(a.pagina, '75-recurrente-con-choque');
  await clic(a.pagina, 'Crear cita recurrente', 'button');
  await esperarTexto(a.pagina, 'Agenda recurrente creada');
  const recTrip = (await L.docs('recurrencias')).find(r => r.clienteNombre === 'Pedro Quincenal');
  const procesada = await hasta(async () => { const r = await L.doc(`recurrencias/${recTrip.id}`); return r && r.procesadaEn === r.actualizadoEn ? r : null; });
  const citasTrip = await turnosDe(recTrip.id);
  comprobar('se apartan todas las fechas menos la ocupada', citasTrip.length === fechasTrip.length - 1 && !citasTrip.some(c => c.dia === fechasTrip[1])
    && citasTrip.every(c => c.frecuencia === 'quincenal' && c.serviceName === 'Barba2' && c.duracionMinutos === 60), citasTrip.map(c => c.dia).join());
  comprobar('y la serie anota esa fecha y el motivo', JSON.stringify(procesada?.omitidas) === JSON.stringify([{ dia: fechasTrip[1], motivo: 'Ya hay otra cita a esa hora' }]), JSON.stringify(procesada?.omitidas));
  await esperarTexto(a.pagina, '1 fecha sin apartar');
  comprobar('la tarjeta lo muestra', (await texto(a.pagina)).includes('Ya hay otra cita a esa hora'));
  await captura(a.pagina, '76-recurrentes-con-aviso');

  // El cliente nuevo ya está en la lista, marcado como fijo.
  await clic(a.pagina, 'Nueva agenda recurrente', 'button');
  await L.escribir(a.pagina, 'input[name="buscarCliente"]', 'juan camilo');
  await pausa(300);
  comprobar('el cliente nuevo ya sale entre los clientes (sin importar mayúsculas), marcado como fijo', await a.pagina.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] li button')].some(b => b.textContent.includes('Juan Camilo Rojas') && b.textContent.includes('Fijo') && b.textContent.includes('301 234 5678'))));
  await a.pagina.keyboard.press('Escape');
  await pausa(300);
  comprobar('Escape cierra la ventana', !(await a.pagina.$('#recurrente-titulo')));

  // ------------------------------------------------------------------
  seccion('barbero: ve sus turnos recurrentes marcados');
  const b = await L.sesion(navegador);
  global.ultimaPagina = b.pagina;
  await L.elegirCookies(b.pagina);
  await L.entrar(b.pagina, 'trip.demo@example.com', CLAVE);
  await esperarTexto(b.pagina, 'Hola, Juan');
  await pausa(1500);
  const filaFija = () => b.pagina.evaluate(() => {
    const li = [...document.querySelectorAll('li')].find(x => x.textContent.includes('Pedro Quincenal'));
    return li ? { texto: li.textContent.replace(/\s+/g, ' '), whatsapp: decodeURIComponent(li.querySelector('a[href^="https://wa.me/"]')?.href ?? '') } : null;
  });
  const fila = await filaFija();
  comprobar('en "Próximas citas" el turno fijo lleva la marca "Recurrente"', !!fila && fila.texto.includes('Recurrente'), JSON.stringify(fila));
  comprobar('y su recordatorio de WhatsApp no manda a "Mis reservas" (no es de ninguna cuenta)', !!fila && fila.whatsapp.includes('wa.me/573009876543') && fila.whatsapp.includes('avísanos por aquí') && !fila.whatsapp.includes('/mis-citas'), fila?.whatsapp);
  await captura(b.pagina, '77-barbero-con-recurrente');
  const ruidoBarbero = L.limpia(b.consola);
  comprobar('consola del barbero sin errores', ruidoBarbero.length === 0, '\n      ' + ruidoBarbero.slice(0, 6).join('\n      '));
  await b.cerrar();
  global.ultimaPagina = a.pagina;

  // ------------------------------------------------------------------
  seccion('admin: las ganancias muestran lo de los clientes fijos');
  // Un turno recurrente de hace unos días, ya atendido (como los que irá dejando la agenda con el tiempo).
  let pasado = fechaEn(-2);
  if (diaSemana(pasado) === 0) pasado = fechaEn(-3);
  await L.guardarDoc(`citas/${rec.id}_${pasado.replace(/-/g, '')}`, {
    userId: '', userName: 'Juan Camilo Rojas', userEmail: '', phone: '3012345678', servicioId: 'S1', serviceName: 'Acicale sencillo', precio: 30000,
    duracionMinutos: 60, barberoId: 'JoseJulian', barberoNombre: 'Jose Julian', dia: pasado, hora: hora24(m), horaStr: hora12(m),
    fecha: new Date(`${pasado}T${hora24(m)}:00-05:00`).toISOString(), estado: 'completada', precioFinal: 32000, creadoEn: new Date().toISOString(),
    slotIds: [], recurrenciaId: rec.id, frecuencia: 'semanal',
  });
  await pestana(a.pagina, 'Cortes y ganancias');
  await clic(a.pagina, 'Todo', 'button');
  await esperarTexto(a.pagina, 'Turnos de clientes fijos');
  const finanzas = await a.pagina.evaluate(() => [...document.querySelectorAll('.tarjeta')].find(t => t.textContent.includes('Turnos de clientes fijos'))?.textContent.replace(/\s+/g, ' ') ?? '');
  comprobar('"Cortes y ganancias" suma aparte los turnos recurrentes atendidos (2, $67.000)', /Hechos\s*2(?!\d)/.test(finanzas) && finanzas.includes('67.000'), finanzas);
  await captura(a.pagina, '78-ganancias-recurrentes');

  // ------------------------------------------------------------------
  seccion('admin: eliminar una agenda');
  await pestana(a.pagina, 'Agendas recurrentes');
  await a.pagina.click('button[aria-label="Eliminar la agenda de Juan Camilo Rojas"]');
  await esperarTexto(a.pagina, '¿Eliminar la agenda recurrente de Juan Camilo Rojas?');
  comprobar('antes de eliminar dice cuántos turnos por venir se quitan', (await texto(a.pagina)).includes(`Se quitan sus ${fechas.length - 1} turnos por venir`));
  await clic(a.pagina, 'Sí, eliminar', 'button');
  const quedan = await hasta(async () => { const t = await turnosDe(rec.id); return t.length === 2 && t.every(x => x.estado === 'completada') ? t : null; });
  comprobar('al eliminarla se van sus turnos por venir y se quedan los atendidos', !!quedan && !(await L.doc(`recurrencias/${rec.id}`)));
  await pausa(800);
  comprobar('y su tarjeta desaparece de la lista', !(await a.pagina.evaluate(() => [...document.querySelectorAll('li h3')].some(h => h.textContent.includes('Juan Camilo Rojas')))));

  const ruidoAdmin = L.limpia(a.consola);
  comprobar('consola del admin sin errores', ruidoAdmin.length === 0, '\n      ' + ruidoAdmin.slice(0, 8).join('\n      '));
  await a.cerrar();
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
