/**
 * Base de los correos de citas: datos, fechas en hora de Colombia, calendario (.ics) y la plantilla HTML.
 * Cada correo está en mensajes.ts; el envío, en index.ts.
 */

/** Campos de la cita que usan los correos (los mismos que guarda la app al reservar). */
export interface Cita {
  userName: string;
  userEmail?: string;
  phone?: string;
  serviceName: string;
  precio: number;
  duracionMinutos: number;
  barberoId: string;
  barberoNombre: string;
  /** Día local 'YYYY-MM-DD'. */
  dia?: string;
  /** Hora local 'HH:mm' (24h). */
  hora?: string;
  /** Hora para mostrar, p. ej. '2:30 PM'. */
  horaStr?: string;
  /** ISO del inicio (calculado en el navegador del cliente). Respaldo si faltan dia/hora. */
  fecha?: string;
  estado: string;
  creadoEn?: string;
}

export interface Negocio {
  nombre: string;
  direccion: string;
  mapaUrl: string;
  instagram: string;
  /** Dirección pública de la página (sin / al final). Vacía mientras no esté publicada. */
  urlSitio: string;
}

export interface Correo {
  para: string;
  asunto: string;
  html: string;
  texto: string;
  /** Para responderle directamente a otra persona (al barbero le sirve el correo del cliente). */
  responderA?: string;
  adjuntos?: { filename: string; content: string }[];
  /** Evita enviar el mismo correo dos veces si el trigger se repite. */
  clave: string;
}

/** Colombia no tiene horario de verano: la hora local siempre es UTC-5. */
const ZONA = 'America/Bogota';
const DESFASE = '-05:00';

export function inicioDeCita(cita: Pick<Cita, 'dia' | 'hora' | 'fecha'>): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(cita.dia ?? '') && /^\d{2}:\d{2}$/.test(cita.hora ?? '')) {
    return new Date(`${cita.dia}T${cita.hora}:00${DESFASE}`);
  }
  const fecha = cita.fecha ? new Date(cita.fecha) : null;
  return fecha && !isNaN(fecha.getTime()) ? fecha : null;
}

const esActiva = (cita: Cita) => ['pendiente', 'confirmada'].includes(cita.estado);
const porVenir = (cita: Cita, ahora: Date) => (inicioDeCita(cita)?.getTime() ?? 0) > ahora.getTime();

/** Solo se avisa de citas por venir (no de las que el admin registra después de atenderlas). */
export function debeAvisar(cita: Cita, ahora = new Date()): boolean {
  return esActiva(cita) && porVenir(cita, ahora);
}

/** Qué cambió en una cita que todavía no pasa: se canceló o se movió de día u hora. */
export function tipoDeCambio(antes: Cita, despues: Cita, ahora = new Date()): 'cancelada' | 'reprogramada' | null {
  if (!esActiva(antes) || !porVenir(antes, ahora)) return null;
  if (despues.estado === 'cancelada') return 'cancelada';
  const seMovio = antes.dia !== despues.dia || antes.hora !== despues.hora;
  return seMovio && esActiva(despues) && porVenir(despues, ahora) ? 'reprogramada' : null;
}

/** Día de mañana en Colombia ('YYYY-MM-DD'). */
export function mananaEnColombia(ahora = new Date()): string {
  const manana = new Date(ahora.getTime() + 24 * 3600_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(manana);
}

/** El recordatorio sobra si la cita se reservó hace menos de 12 horas (la confirmación está fresca). */
export function necesitaRecordatorio(cita: Cita, ahora = new Date()): boolean {
  const creada = cita.creadoEn ? new Date(cita.creadoEn).getTime() : 0;
  return debeAvisar(cita, ahora) && emailValido(cita.userEmail) && ahora.getTime() - creada > 12 * 3600_000;
}

export function emailValido(email: string | undefined | null): email is string {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** "Martes 7 de octubre" */
export function fechaLarga(fecha: Date): string {
  const texto = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA })
    .format(fecha)
    .replace(',', '');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function horaDe(cita: Cita, inicio: Date): string {
  return cita.horaStr || new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: ZONA }).format(inicio);
}

export function pesos(valor: number): string {
  return '$' + Math.round(Number(valor) || 0).toLocaleString('es-CO');
}

export function duracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || `${minutos} min`;
}

export function escaparHtml(texto: string): string {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function enlaceWhatsApp(telefono: string): string {
  const digitos = telefono.replace(/\D/g, '');
  return `https://wa.me/${digitos.length === 10 ? `57${digitos}` : digitos}`;
}

// ---------------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------------

/** 20261007T193000Z */
const fechaIcs = (fecha: Date) => fecha.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const textoIcs = (texto: string) => texto.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function archivoIcs(cita: Cita, citaId: string, negocio: Negocio, ahora = new Date()): string {
  const inicio = inicioDeCita(cita)!;
  const fin = new Date(inicio.getTime() + cita.duracionMinutos * 60_000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${textoIcs(negocio.nombre)}//Reservas//ES`,
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${citaId}@reservas`,
    `DTSTAMP:${fechaIcs(ahora)}`,
    // Si la cita cambia de horario, el calendario reemplaza el evento (mismo UID, secuencia mayor).
    `SEQUENCE:${Math.floor(ahora.getTime() / 1000)}`,
    `DTSTART:${fechaIcs(inicio)}`,
    `DTEND:${fechaIcs(fin)}`,
    `SUMMARY:${textoIcs(`${cita.serviceName} en ${negocio.nombre}`)}`,
    `LOCATION:${textoIcs(negocio.direccion)}`,
    `DESCRIPTION:${textoIcs(`Con ${cita.barberoNombre}.`)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${textoIcs(`Tu cita en ${negocio.nombre}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function enlaceGoogleCalendar(cita: Cita, negocio: Negocio): string {
  const inicio = inicioDeCita(cita)!;
  const fin = new Date(inicio.getTime() + cita.duracionMinutos * 60_000);
  const datos = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${cita.serviceName} en ${negocio.nombre}`,
    dates: `${fechaIcs(inicio)}/${fechaIcs(fin)}`,
    details: `Con ${cita.barberoNombre}.`,
    location: negocio.direccion,
  });
  return `https://calendar.google.com/calendar/render?${datos}`;
}

// ---------------------------------------------------------------------------
// Plantilla (tablas y estilos en línea: es lo que entienden Gmail, Outlook y compañía)
// ---------------------------------------------------------------------------

export const C = { fondo: '#f3f1ec', tarjeta: '#ffffff', negro: '#0a0a0a', texto: '#1c1c1c', suave: '#6b6b6b', linea: '#e7e3da', dorado: '#a07a38' };
const LETRA = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface Boton { texto: string; url: string; principal?: boolean }

function boton({ texto, url, principal }: Boton): string {
  const estilo = principal
    ? `background:${C.negro};color:#ffffff;border:1px solid ${C.negro};`
    : `background:#ffffff;color:${C.negro};border:1px solid ${C.negro};`;
  return `<a href="${escaparHtml(url)}" target="_blank" style="${estilo}display:inline-block;padding:12px 22px;margin:0 8px 10px 0;border-radius:999px;font:700 14px ${LETRA};text-decoration:none;">${escaparHtml(texto)}</a>`;
}

export function marco(opciones: {
  negocio: Negocio;
  resumen: string;
  etiqueta: string;
  titulo: string;
  intro: string;
  filas: [string, string][];
  botones: Boton[];
  nota?: string;
}): string {
  const { negocio } = opciones;
  const filas = opciones.filas
    .map(([nombre, valor], i) => `
      <tr>
        <td style="padding:12px 0;${i ? `border-top:1px solid ${C.linea};` : ''}font:600 12px ${LETRA};color:${C.suave};text-transform:uppercase;letter-spacing:1px;width:34%;vertical-align:top;">${escaparHtml(nombre)}</td>
        <td style="padding:12px 0;${i ? `border-top:1px solid ${C.linea};` : ''}font:600 15px ${LETRA};color:${C.texto};vertical-align:top;">${valor}</td>
      </tr>`)
    .join('');
  const pie = [
    escaparHtml(negocio.direccion),
    negocio.instagram ? `<a href="https://www.instagram.com/${escaparHtml(negocio.instagram)}" style="color:${C.suave};">@${escaparHtml(negocio.instagram)}</a>` : '',
  ].filter(Boolean).join(' · ');

  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escaparHtml(opciones.titulo)}</title></head>
<body style="margin:0;padding:0;background:${C.fondo};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escaparHtml(opciones.resumen)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fondo};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.tarjeta};border-radius:18px;overflow:hidden;border:1px solid ${C.linea};">
        <tr><td style="background:${C.negro};padding:26px 32px;text-align:center;">
          <div style="font:700 22px Georgia,'Times New Roman',serif;letter-spacing:4px;color:#ffffff;text-transform:uppercase;">${escaparHtml(negocio.nombre)}</div>
          <div style="width:44px;height:2px;background:#c29a4e;margin:12px auto 0;"></div>
        </td></tr>
        <tr><td style="padding:32px 32px 8px;">
          <div style="font:800 11px ${LETRA};color:${C.dorado};text-transform:uppercase;letter-spacing:3px;">${escaparHtml(opciones.etiqueta)}</div>
          <h1 style="margin:10px 0 12px;font:800 24px/1.25 ${LETRA};color:${C.texto};">${escaparHtml(opciones.titulo)}</h1>
          <p style="margin:0 0 20px;font:400 15px/1.6 ${LETRA};color:${C.suave};">${opciones.intro}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas}</table>
        </td></tr>
        <tr><td style="padding:20px 32px 12px;">${opciones.botones.map(boton).join('')}</td></tr>
        ${opciones.nota ? `<tr><td style="padding:0 32px 28px;font:400 13px/1.6 ${LETRA};color:${C.suave};">${opciones.nota}</td></tr>` : ''}
      </table>
      <p style="max-width:560px;margin:18px auto 0;font:400 12px/1.6 ${LETRA};color:${C.suave};text-align:center;">${pie}</p>
    </td></tr>
  </table>
</body>
</html>`;
}
