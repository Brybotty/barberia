import { ApplicationConfig, inject, mergeApplicationConfig, provideAppInitializer } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { aplicarCliente } from './config/cliente';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Los colores y la fuente del cliente van en el HTML armado (en el navegador los pone main.ts antes de arrancar).
    provideAppInitializer(() => aplicarCliente(undefined, inject(DOCUMENT))),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
