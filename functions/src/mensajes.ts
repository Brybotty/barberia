/**
 * Cada correo de citas: nueva, cancelada, cambio de horario y recordatorio del día anterior.
 * El cliente recibe los datos y cómo llegar; el barbero, los datos y el contacto del cliente.
 */
import {
  Boton, C, Cita, Correo, Negocio, archivoIcs, duracion, emailValido, enlaceGoogleCalendar, enlaceWhatsApp, escaparHtml,
  fechaLarga, horaDe, inicioDeCita, marco, pesos,
} from './correo';

type Filas = [string, string][];

function cuandoEs(cita: Cita) {
  const inicio = inicioDeCita(cita)!;
  const fecha = fechaLarga(inicio);
  const hora = horaDe(cita, inicio);
  return { fecha, hora, cuando: `${fecha}, ${hora}` };
}

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] || '';
const fuerte = (texto: string) => `<strong style="color:${C.texto};">${escaparHtml(texto)}</strong>`;
const adjuntoIcs = (cita: Cita, citaId: string, negocio: Negocio) =>
  [{ filename: 'cita.ics', content: Buffer.from(archivoIcs(cita, citaId, negocio)).toString('base64') }];
/** Al barbero le sirve responderle directo al cliente. */
const responderAlCliente = (cita: Cita) => (emailValido(cita.userEmail) ? cita.userEmail.trim() : undefined);

function filasCliente(cita: Cita, negocio: Negocio): Filas {
  const { fecha, hora } = cuandoEs(cita);
  return [
    ['Servicio', escaparHtml(cita.serviceName)],
    ['Fecha', escaparHtml(fecha)],
    ['Hora', escaparHtml(hora)],
    ['Barbero', escaparHtml(cita.barberoNombre)],
    ['Duración', escaparHtml(duracion(cita.duracionMinutos))],
    ['Valor', escaparHtml(pesos(cita.precio))],
    ['Dirección', escaparHtml(negocio.direccion)],
  ];
}

function filasBarbero(cita: Cita): Filas {
  const { fecha, hora } = cuandoEs(cita);
  const telefono = (cita.phone ?? '').trim();
  const filas: Filas = [
    ['Cliente', escaparHtml(cita.userName)],
    ['Servicio', escaparHtml(cita.serviceName)],
    ['Fecha', escaparHtml(fecha)],
    ['Hora', escaparHtml(hora)],
    ['Duración', escaparHtml(duracion(cita.duracionMinutos))],
    ['Valor', escaparHtml(pesos(cita.precio))],
  ];
  if (telefono) filas.push(['Celular', escaparHtml(telefono)]);
  if (emailValido(cita.userEmail)) filas.push(['Correo', escaparHtml(cita.userEmail.trim())]);
  return filas;
}

/** Versión en texto plano de las filas (para clientes de correo sin HTML). */
function textoFilas(filas: Filas): string {
  const sinHtml = (html: string) =>
    html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return filas.map(([nombre, valor]) => `${nombre}: ${sinHtml(valor)}`).join('\n');
}

const botonesCliente = (cita: Cita, negocio: Negocio): Boton[] => [
  { texto: 'Cómo llegar', url: negocio.mapaUrl, principal: true },
  { texto: 'Agregar a Google Calendar', url: enlaceGoogleCalendar(cita, negocio) },
];

function botonesBarbero(cita: Cita, negocio: Negocio): Boton[] {
  const telefono = (cita.phone ?? '').trim();
  const botones: Boton[] = [];
  if (telefono) botones.push({ texto: 'Escribirle por WhatsApp', url: enlaceWhatsApp(telefono), principal: true });
  if (negocio.urlSitio) botones.push({ texto: 'Ver mi agenda', url: `${negocio.urlSitio}/barbero`, principal: !telefono });
  return botones;
}

const botonAgenda = (negocio: Negocio): Boton[] =>
  negocio.urlSitio ? [{ texto: 'Ver mi agenda', url: `${negocio.urlSitio}/barbero`, principal: true }] : [];

function notaCancelar(negocio: Negocio): { html: string; texto: string } {
  const url = negocio.urlSitio ? `${negocio.urlSitio}/mis-citas` : '';
  return {
    html: url
      ? `Si no puedes venir, cancélala desde <a href="${escaparHtml(url)}" style="color:${C.texto};">Mis reservas</a> para liberar el horario.`
      : 'Si no puedes venir, cancélala desde "Mis reservas" en nuestra página para liberar el horario.',
    texto: `Si no puedes venir, cancélala desde "Mis reservas"${url ? ` (${url})` : ''} para liberar el horario.`,
  };
}

// ---------------------------------------------------------------------------
// Cita nueva
// ---------------------------------------------------------------------------

export function correoCliente(cita: Cita, citaId: string, negocio: Negocio): Correo {
  const { cuando } = cuandoEs(cita);
  const nombre = primerNombre(cita.userName) || 'hola';
  const filas = filasCliente(cita, negocio);
  const nota = notaCancelar(negocio);
  return {
    para: cita.userEmail!.trim(),
    asunto: `Tu cita en ${negocio.nombre}: ${cuando}`,
    html: marco({
      negocio,
      resumen: `${cita.serviceName} con ${cita.barberoNombre} · ${cuando}`,
      etiqueta: 'Reserva agendada',
      titulo: `¡Listo, ${nombre}! Te esperamos`,
      intro: `Tu cita en ${fuerte(negocio.nombre)} quedó agendada. Estos son los detalles:`,
      filas,
      botones: botonesCliente(cita, negocio),
      nota: `Te adjuntamos la cita como archivo de calendario por si usas otra app. ${nota.html}`,
    }),
    texto: [`¡Listo, ${nombre}! Tu cita en ${negocio.nombre} quedó agendada.`, '', textoFilas(filas), `Cómo llegar: ${negocio.mapaUrl}`, '', nota.texto].join('\n'),
    adjuntos: adjuntoIcs(cita, citaId, negocio),
    clave: `cita-${citaId}-cliente`,
  };
}

export function correoBarbero(cita: Cita, citaId: string, negocio: Negocio, email: string): Correo {
  const { cuando } = cuandoEs(cita);
  const filas = filasBarbero(cita);
  return {
    para: email,
    asunto: `Nueva cita: ${cita.userName} · ${cuando}`,
    html: marco({
      negocio,
      resumen: `${cita.userName} · ${cita.serviceName} · ${cuando}`,
      etiqueta: 'Nueva cita',
      titulo: `${cita.userName} reservó contigo`,
      intro: `Tienes una cita nueva, ${escaparHtml(primerNombre(cita.barberoNombre))}. Estos son los datos:`,
      filas,
      botones: botonesBarbero(cita, negocio),
      nota: responderAlCliente(cita) ? 'Si respondes este correo, le llega directamente al cliente.' : undefined,
    }),
    texto: [`Nueva cita: ${cita.userName} reservó contigo.`, '', textoFilas(filas)].join('\n'),
    responderA: responderAlCliente(cita),
    clave: `cita-${citaId}-barbero`,
  };
}

// ---------------------------------------------------------------------------
// Cita cancelada (por el cliente, el barbero o el admin)
// ---------------------------------------------------------------------------

export function correoCanceladaCliente(cita: Cita, citaId: string, negocio: Negocio): Correo {
  const { cuando } = cuandoEs(cita);
  const reservar = negocio.urlSitio ? `${negocio.urlSitio}/reservar` : '';
  const filas = filasCliente(cita, negocio).slice(0, 4);
  return {
    para: cita.userEmail!.trim(),
    asunto: `Cita cancelada: ${cuando}`,
    html: marco({
      negocio,
      resumen: `Tu cita del ${cuando} quedó cancelada.`,
      etiqueta: 'Cita cancelada',
      titulo: 'Tu cita quedó cancelada',
      intro: `La cita del ${fuerte(cuando)} en ${fuerte(negocio.nombre)} ya no está en la agenda. Si fue un error o quieres otro horario, reserva de nuevo cuando quieras.`,
      filas,
      botones: reservar ? [{ texto: 'Reservar otra cita', url: reservar, principal: true }] : [],
    }),
    texto: [`Tu cita del ${cuando} en ${negocio.nombre} quedó cancelada.`, '', textoFilas(filas), reservar ? `\nReserva de nuevo: ${reservar}` : ''].join('\n'),
    clave: `cita-${citaId}-cancelada-cliente`,
  };
}

export function correoCanceladaBarbero(cita: Cita, citaId: string, negocio: Negocio, email: string): Correo {
  const { cuando } = cuandoEs(cita);
  const filas = filasBarbero(cita).slice(0, 4);
  return {
    para: email,
    asunto: `Cancelada: ${cita.userName} · ${cuando}`,
    html: marco({
      negocio,
      resumen: `Se canceló la cita de ${cita.userName} (${cuando}).`,
      etiqueta: 'Cita cancelada',
      titulo: `Se canceló la cita de ${cita.userName}`,
      intro: `El horario del ${fuerte(cuando)} quedó libre para otra reserva.`,
      filas,
      botones: botonAgenda(negocio),
    }),
    texto: [`Se canceló la cita de ${cita.userName} (${cuando}). El horario quedó libre.`, '', textoFilas(filas)].join('\n'),
    clave: `cita-${citaId}-cancelada-barbero`,
  };
}

// ---------------------------------------------------------------------------
// Cambio de horario (el admin la movió)
// ---------------------------------------------------------------------------

export function correoReprogramadaCliente(antes: Cita, cita: Cita, citaId: string, negocio: Negocio): Correo {
  const { cuando } = cuandoEs(cita);
  const anterior = cuandoEs(antes).cuando;
  const filas = filasCliente(cita, negocio);
  const nota = notaCancelar(negocio);
  return {
    para: cita.userEmail!.trim(),
    asunto: `Tu cita cambió de horario: ${cuando}`,
    html: marco({
      negocio,
      resumen: `Nuevo horario: ${cuando} (antes ${anterior}).`,
      etiqueta: 'Cambio de horario',
      titulo: 'Tu cita cambió de horario',
      intro: `Antes era el ${escaparHtml(anterior)}. Ahora quedó así:`,
      filas,
      botones: botonesCliente(cita, negocio),
      nota: `Te adjuntamos la cita actualizada para tu calendario. ${nota.html}`,
    }),
    texto: [`Tu cita en ${negocio.nombre} cambió de horario (antes: ${anterior}).`, '', textoFilas(filas), '', nota.texto].join('\n'),
    adjuntos: adjuntoIcs(cita, citaId, negocio),
    clave: `cita-${citaId}-cambio-${cita.dia}-${cita.hora}-cliente`,
  };
}

export function correoReprogramadaBarbero(antes: Cita, cita: Cita, citaId: string, negocio: Negocio, email: string): Correo {
  const { cuando } = cuandoEs(cita);
  const anterior = cuandoEs(antes).cuando;
  const filas = filasBarbero(cita);
  return {
    para: email,
    asunto: `Cita movida: ${cita.userName} · ${cuando}`,
    html: marco({
      negocio,
      resumen: `${cita.userName}: ${anterior} → ${cuando}.`,
      etiqueta: 'Cambio de horario',
      titulo: `La cita de ${cita.userName} cambió de horario`,
      intro: `Antes era el ${escaparHtml(anterior)}. Ahora quedó así:`,
      filas,
      botones: botonesBarbero(cita, negocio),
    }),
    texto: [`La cita de ${cita.userName} cambió de horario (antes: ${anterior}).`, '', textoFilas(filas)].join('\n'),
    responderA: responderAlCliente(cita),
    clave: `cita-${citaId}-cambio-${cita.dia}-${cita.hora}-barbero`,
  };
}

// ---------------------------------------------------------------------------
// Recordatorio del día anterior
// ---------------------------------------------------------------------------

export function correoRecordatorio(cita: Cita, citaId: string, negocio: Negocio): Correo {
  const { hora } = cuandoEs(cita);
  const nombre = primerNombre(cita.userName);
  const filas = filasCliente(cita, negocio);
  const nota = notaCancelar(negocio);
  return {
    para: cita.userEmail!.trim(),
    asunto: `Recordatorio: mañana a las ${hora} en ${negocio.nombre}`,
    html: marco({
      negocio,
      resumen: `${cita.serviceName} con ${cita.barberoNombre}, mañana a las ${hora}.`,
      etiqueta: 'Recordatorio',
      titulo: nombre ? `${nombre}, tu cita es mañana` : 'Tu cita es mañana',
      intro: `Te esperamos mañana a las ${fuerte(hora)}. Llega 10 a 15 minutos antes para atenderte sin demoras.`,
      filas,
      botones: botonesCliente(cita, negocio),
      nota: nota.html,
    }),
    texto: [`Te esperamos mañana a las ${hora} en ${negocio.nombre}.`, '', textoFilas(filas), `Cómo llegar: ${negocio.mapaUrl}`, '', nota.texto].join('\n'),
    clave: `cita-${citaId}-recordatorio`,
  };
}
