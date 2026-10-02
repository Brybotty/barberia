/**
 * Cloud Functions de la barbería: correos de citas por medio de Resend (https://resend.com).
 *
 * - avisarCitaNueva (al crearse una cita): confirmación al cliente (con la cita para su calendario)
 *   y aviso al barbero.
 * - avisarCambioDeCita (al actualizarse): si se cancela o cambia de día/hora, avisa a los dos.
 * - recordarCitas (todos los días a las 6:00 p. m., hora de Colombia): recordatorio a quien tiene cita mañana.
 *
 * Solo se avisa de citas que aún no pasan. Si un correo falla, la cita no se afecta: queda en el log.
 *
 * Configuración (ver README): la llave de Resend en el secreto RESEND_API_KEY
 * (`firebase functions:secrets:set RESEND_API_KEY`) y los datos del negocio en functions/.env.<proyecto>.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { Cita, Correo, Negocio, debeAvisar, emailValido, mananaEnColombia, necesitaRecordatorio, tipoDeCambio } from './correo';
import {
  correoBarbero, correoCanceladaBarbero, correoCanceladaCliente, correoCliente, correoRecordatorio,
  correoReprogramadaBarbero, correoReprogramadaCliente,
} from './mensajes';

initializeApp();
// La base de datos está en nam5 (Estados Unidos): las funciones quedan en la misma zona.
setGlobalOptions({ region: 'us-central1', maxInstances: 5 });

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const CORREO_REMITENTE = defineString('CORREO_REMITENTE', {
  description: 'Remitente de los correos, p. ej. "El Acicale <citas@tudominio.com>" (el dominio debe estar verificado en Resend).',
});
const NEGOCIO_NOMBRE = defineString('NEGOCIO_NOMBRE');
const NEGOCIO_DIRECCION = defineString('NEGOCIO_DIRECCION');
const NEGOCIO_MAPA_URL = defineString('NEGOCIO_MAPA_URL');
const NEGOCIO_INSTAGRAM = defineString('NEGOCIO_INSTAGRAM', { default: '' });
const URL_SITIO = defineString('URL_SITIO', { default: '', description: 'Dirección pública de la página, sin / al final.' });

/** Valor de barberoId cuando se reservó sin barberos registrados (igual que en la app). */
const BARBERO_CUALQUIERA = 'cualquiera';

type Destino = 'cliente' | 'barbero';

// ---------------------------------------------------------------------------

export const avisarCitaNueva = onDocumentCreated({ document: 'citas/{citaId}', secrets: [RESEND_API_KEY] }, async event => {
  const cita = event.data?.data() as Cita | undefined;
  const citaId = event.params.citaId;
  if (!cita || !debeAvisar(cita)) return;

  const negocio = datosDelNegocio();
  const emailBarbero = await emailDelBarbero(cita.barberoId);
  await enviarTodos(citaId, 'nueva', [
    emailValido(cita.userEmail) && ['cliente', correoCliente(cita, citaId, negocio)],
    emailBarbero && ['barbero', correoBarbero(cita, citaId, negocio, emailBarbero)],
  ]);
});

export const avisarCambioDeCita = onDocumentUpdated({ document: 'citas/{citaId}', secrets: [RESEND_API_KEY] }, async event => {
  const antes = event.data?.before.data() as Cita | undefined;
  const despues = event.data?.after.data() as Cita | undefined;
  const citaId = event.params.citaId;
  if (!antes || !despues) return;
  const cambio = tipoDeCambio(antes, despues);
  if (!cambio) return;

  const negocio = datosDelNegocio();
  const emailBarbero = await emailDelBarbero(despues.barberoId);
  const conCorreo = emailValido(despues.userEmail);
  await enviarTodos(citaId, cambio, cambio === 'cancelada'
    ? [
        conCorreo && ['cliente', correoCanceladaCliente(antes, citaId, negocio)],
        emailBarbero && ['barbero', correoCanceladaBarbero(antes, citaId, negocio, emailBarbero)],
      ]
    : [
        conCorreo && ['cliente', correoReprogramadaCliente(antes, despues, citaId, negocio)],
        emailBarbero && ['barbero', correoReprogramadaBarbero(antes, despues, citaId, negocio, emailBarbero)],
      ]);
});

export const recordarCitas = onSchedule(
  { schedule: '0 18 * * *', timeZone: 'America/Bogota', secrets: [RESEND_API_KEY], timeoutSeconds: 300 },
  async () => {
    const dia = mananaEnColombia();
    const citas = await getFirestore().collection('citas').where('dia', '==', dia).get();
    const negocio = datosDelNegocio();
    let enviados = 0;
    for (const doc of citas.docs) {
      const cita = doc.data() as Cita;
      if (!necesitaRecordatorio(cita)) continue;
      // Uno a la vez: Resend acepta 2 envíos por segundo.
      await enviarTodos(doc.id, 'recordatorio', [['cliente', correoRecordatorio(cita, doc.id, negocio)]]);
      enviados++;
    }
    logger.info('Recordatorios del día', { dia, citas: citas.size, enviados });
  },
);

// ---------------------------------------------------------------------------

function datosDelNegocio(): Negocio {
  return {
    nombre: NEGOCIO_NOMBRE.value(),
    direccion: NEGOCIO_DIRECCION.value(),
    mapaUrl: NEGOCIO_MAPA_URL.value(),
    instagram: NEGOCIO_INSTAGRAM.value(),
    urlSitio: URL_SITIO.value().replace(/\/+$/, ''),
  };
}

async function emailDelBarbero(barberoId: string): Promise<string | null> {
  if (!barberoId || barberoId === BARBERO_CUALQUIERA) return null;
  // El correo del barbero no es público: está en barberosPrivado (el Admin SDK lo lee sin pasar por las reglas).
  const perfil = await getFirestore().doc(`barberosPrivado/${barberoId}`).get();
  const email = perfil.get('emailAsociado') as string | undefined;
  return emailValido(email) ? email.trim() : null;
}

/** Envía los correos (los vacíos se ignoran) y deja en el log el resultado de cada uno. */
async function enviarTodos(citaId: string, motivo: string, lista: (false | null | '' | undefined | [Destino, Correo])[]) {
  const correos = lista.filter((x): x is [Destino, Correo] => !!x);
  if (correos.length === 0) {
    logger.info('Cita sin correos a quién avisar', { citaId, motivo });
    return;
  }
  const resultados = await Promise.allSettled(correos.map(([, correo]) => enviar(correo)));
  resultados.forEach((resultado, i) => {
    // Sin direcciones en los logs: basta con saber a quién (cliente o barbero) y la cita.
    const datos = { citaId, motivo, para: correos[i][0] };
    if (resultado.status === 'fulfilled') logger.info('Correo enviado', { ...datos, id: resultado.value });
    else logger.error('No se pudo enviar el correo', { ...datos, error: String(resultado.reason) });
  });
}

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Envía por la API de Resend y devuelve el id del correo. Reintenta si Resend pide bajar el ritmo (429). */
async function enviar(correo: Correo, intento = 1): Promise<string> {
  // En los emuladores no sale nada: se muestra en el log.
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    logger.info('[emulador] Correo no enviado', { asunto: correo.asunto, adjuntos: correo.adjuntos?.length ?? 0 });
    return 'emulador';
  }
  const respuesta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY.value()}`,
      'Content-Type': 'application/json',
      // Si el mismo correo se intenta dos veces (reintento del trigger), Resend lo envía una sola.
      'Idempotency-Key': correo.clave,
    },
    body: JSON.stringify({
      from: CORREO_REMITENTE.value(),
      to: [correo.para],
      subject: correo.asunto,
      html: correo.html,
      text: correo.texto,
      ...(correo.responderA ? { reply_to: correo.responderA } : {}),
      ...(correo.adjuntos ? { attachments: correo.adjuntos } : {}),
    }),
  });
  const cuerpo = await respuesta.text();
  if (respuesta.status === 429 && intento < 4) {
    await esperar(800 * intento);
    return enviar(correo, intento + 1);
  }
  if (!respuesta.ok) throw new Error(`Resend respondió ${respuesta.status}: ${cuerpo.slice(0, 300)}`);
  return (JSON.parse(cuerpo) as { id?: string }).id ?? '';
}
