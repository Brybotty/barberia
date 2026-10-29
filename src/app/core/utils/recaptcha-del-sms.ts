import { CLIENTE } from '../../config/cliente';
import { environment } from '../../../environments/environment';

/**
 * Arreglo para entrar con el celular mientras App Check usa reCAPTCHA Enterprise.
 *
 * Firebase pide el token del SMS a reCAPTCHA Enterprise con una clave propia (la crea y la administra Firebase), pero
 * si reCAPTCHA ya está cargado no la carga: da por hecho que está. En esta página lo carga App Check al arrancar, solo
 * con la suya, y entonces reCAPTCHA responde "Invalid site key or not loaded in api.js" dentro de una función que
 * Firebase no vigila: el envío se queda esperando para siempre ("Enviando…"). Pasa en AUDIT y en ENFORCE, y sigue así
 * en @firebase/auth 1.13.7.
 *
 * Aquí se carga reCAPTCHA otra vez con la clave del SMS en la dirección (`render=`): queda registrada y App Check
 * sigue funcionando con la suya (probado en producción el 2026-10-15). La clave se le pregunta a Firebase, igual que
 * hace el SDK, por si algún día la cambia.
 */
const SCRIPT = 'https://www.google.com/recaptcha/enterprise.js';
const TOPE_MS = 10_000;

interface ReCaptchaEnterprise {
  ready(listo: () => void): void;
}

let preparada: Promise<void> | undefined;

/** Deja lista la clave del SMS (una vez por visita). Si falla, no corta el envío: lo intenta igual. */
export function prepararClaveDelSms(): Promise<void> {
  // Con los emuladores no hay App Check ni reCAPTCHA.
  if (environment.emuladores) return Promise.resolve();
  preparada ??= Promise.race([cargar(), new Promise<never>((_, falla) => setTimeout(() => falla(new Error('sin respuesta')), TOPE_MS))])
    .catch(error => {
      preparada = undefined;
      console.warn('No se pudo preparar la clave de reCAPTCHA del SMS:', error);
    });
  return preparada;
}

function recaptcha(): ReCaptchaEnterprise | undefined {
  return (window as { grecaptcha?: { enterprise?: ReCaptchaEnterprise } }).grecaptcha?.enterprise;
}

async function cargar(): Promise<void> {
  const respuesta = await fetch(`https://identitytoolkit.googleapis.com/v2/recaptchaConfig?key=${CLIENTE.firebase.apiKey}&clientType=CLIENT_TYPE_WEB&version=RECAPTCHA_ENTERPRISE`);
  if (!respuesta.ok) throw new Error(`Firebase respondió ${respuesta.status}`);
  // 'projects/870552898429/keys/6LeG…' -> '6LeG…'. Sin clave, Firebase no usa Enterprise para el celular.
  const clave = String((await respuesta.json()).recaptchaKey ?? '').split('/').pop();
  if (!clave || document.querySelector(`script[src="${SCRIPT}?render=${clave}"]`)) return;

  // Si el de App Check aún está bajando, se espera a que termine: dos cargas a la vez podrían pisarse.
  const deAppCheck = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
  if (deAppCheck && !recaptcha()) {
    await new Promise(listo => {
      deAppCheck.addEventListener('load', listo, { once: true });
      deAppCheck.addEventListener('error', listo, { once: true });
    });
  }
  await new Promise<void>((listo, falla) => {
    const script = document.createElement('script');
    script.src = `${SCRIPT}?render=${clave}`;
    script.onload = () => listo();
    script.onerror = () => falla(new Error('No cargó reCAPTCHA'));
    document.head.appendChild(script);
  });
  const enterprise = recaptcha();
  await new Promise<void>(listo => (enterprise ? enterprise.ready(listo) : listo()));
}
