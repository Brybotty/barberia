import { ApplicationConfig, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { initializeAppCheck, provideAppCheck, ReCaptchaEnterpriseProvider } from '@angular/fire/app-check';
import { connectAuthEmulator, getAuth, provideAuth } from '@angular/fire/auth';
import { connectFirestoreEmulator, getFirestore, provideFirestore } from '@angular/fire/firestore';
import { CLIENTE } from './config/cliente';
import { environment } from '../environments/environment';

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
const appCheck = environment.emuladores || !CLIENTE.appCheckSiteKey
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
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' })),
    provideFirebaseApp(() => initializeApp(firebase)),
    ...appCheck,
    provideAuth(() => {
      const auth = getAuth();
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
