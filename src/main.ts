import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { aplicarCliente } from './app/config/cliente';

aplicarCliente();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
