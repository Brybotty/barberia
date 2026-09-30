import { ApplicationConfig, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { connectAuthEmulator, getAuth, provideAuth } from '@angular/fire/auth';
import { connectFirestoreEmulator, getFirestore, provideFirestore } from '@angular/fire/firestore';
import { connectFunctionsEmulator, getFunctions, provideFunctions } from '@angular/fire/functions';
import { CLIENTE } from './config/cliente';
import { environment } from '../environments/environment';

// Fechas y moneda en formato colombiano ("miércoles 1 oct", "$ 30.000").
registerLocaleData(localeEsCo);

// Con los emuladores, los datos van a un proyecto "demo-": así nunca se toca la base real.
// El inicio de sesión sigue siendo el de Google real (la apiKey y el authDomain del cliente).
const firebase = environment.emuladores
  ? { ...CLIENTE.firebase, projectId: `demo-${CLIENTE.id}` }
  : CLIENTE.firebase;

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'es-CO' },
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' })),
    provideFirebaseApp(() => initializeApp(firebase)),
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
    provideFunctions(() => {
      const functions = getFunctions();
      if (environment.emuladores) connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      return functions;
    }),
  ]
};
