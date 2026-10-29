import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { provideClientHydration } from '@angular/platform-browser';
import localeEsCo from '@angular/common/locales/es-CO';
import { TitleStrategy, provideRouter, withInMemoryScrolling, withPreloading } from '@angular/router';
import { routes } from './app.routes';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { initializeAppCheck, provideAppCheck, ReCaptchaEnterpriseProvider } from '@angular/fire/app-check';
import {
  browserLocalPersistence, browserSessionPersistence, connectAuthEmulator, inMemoryPersistence, indexedDBLocalPersistence, initializeAuth, provideAuth,
} from '@angular/fire/auth';
import { connectFirestoreEmulator, getFirestore, provideFirestore } from '@angular/fire/firestore';
import { CLIENTE } from './config/cliente';
import { environment } from '../environments/environment';
import { resolverDeVentanas } from './core/services/auth.service';
import { PrecargaSelectiva } from './core/services/precarga.strategy';
import { TituloStrategy } from './core/services/titulo.strategy';
import { enNavegador } from './core/utils/plataforma';

// Fechas y moneda en formato colombiano ("miércoles 1 oct", "$ 30.000").
registerLocaleData(localeEsCo);

// Con los emuladores, los datos van a un proyecto "demo-": así nunca se toca la base real.
// El inicio de sesión sigue siendo el de Google real (la apiKey y el authDomain del cliente).
const firebase = environment.emuladores
  ? { ...CLIENTE.firebase, projectId: `demo-${CLIENTE.id}` }
  : CLIENTE.firebase;

/**
 * App Check: Firestore solo atiende a la página de verdad (reCAPTCHA Enterprise por puntaje), no a scripts.
 * - Con los emuladores no hace falta.
 * - En localhost se usa un token de depuración: la primera vez el navegador lo muestra en la consola
 *   ("App Check debug token") y hay que registrarlo en Firebase → App Check → Administrar tokens de depuración.
 */
/**
 * Las páginas públicas llegan ya armadas (prerender, ver app.routes.server.ts): Angular las retoma tal cual, sin
 * volver a pintarlas (así nada parpadea ni se repiten las animaciones). Las demás rutas abren desde index.csr.html,
 * sin nada que retomar. Al compilar también hace falta, para que el HTML lleve las marcas con que se retoma.
 */
const hidratar = !enNavegador || !!document.querySelector('app-root[ng-server-context]');

const appCheck = environment.emuladores || !CLIENTE.appCheckSiteKey || !enNavegador
  ? []
  : [provideAppCheck(() => {
      if (location.hostname === 'localhost') (self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      return initializeAppCheck(undefined, {
        provider: new ReCaptchaEnterpriseProvider(CLIENTE.appCheckSiteKey!),
        isTokenAutoRefreshEnabled: true,
      });
    })];

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'es-CO' },
    // Varios eventos seguidos (un toque dispara tres o cuatro) se atienden con una sola pasada de la vista.
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
      withPreloading(PrecargaSelectiva),
    ),
    { provide: TitleStrategy, useExisting: TituloStrategy },
    provideFirebaseApp(() => initializeApp(firebase)),
    ...appCheck,
    ...(hidratar ? [provideClientHydration()] : []),
    provideAuth(() => {
      // Al compilar las páginas públicas no hay sesión ni ventanas: basta una en memoria.
      if (!enNavegador) return initializeAuth(getApp(), { persistence: inMemoryPersistence });
      // Lo mismo que getAuth() (la sesión se guarda igual), salvo por la ventana de Google: getAuth() la deja
      // lista al arrancar en celulares y en Safari, bajando un marco oculto de Google ANTES de decir si hay sesión,
      // y Firestore no pide ningún dato hasta saberlo. Aquí se prepara cuando alguien va a entrar (ver
      // AuthService.prepararGoogle), y los servicios, el equipo y los horarios cargan sin esa espera.
      const auth = initializeAuth(getApp(), {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
        popupRedirectResolver: resolverDeVentanas,
      });
      if (environment.emuladores && environment.authEmulador) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      return auth;
    }),
    provideFirestore(() => {
      const firestore = getFirestore();
      if (environment.emuladores) connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
      return firestore;
    }),
  ]
};
