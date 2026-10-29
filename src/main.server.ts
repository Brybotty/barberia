import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

/** Arranque al compilar: arma en Node las páginas públicas que se entregan ya escritas (ver app.routes.server.ts). */
const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default bootstrap;
