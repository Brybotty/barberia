import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgClass } from '@angular/common';
import { InstalacionService } from './core/services/instalacion.service';
import { NotificationService, TipoToast } from './core/services/notification.service';
import { AvisoCookiesComponent } from './shared/components/aviso-cookies/aviso-cookies.component';
import { ConfirmarComponent } from './shared/components/confirmar/confirmar.component';
import { IconoComponent } from './shared/components/icono/icono.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NgClass, AvisoCookiesComponent, ConfirmarComponent, IconoComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  notificationService = inject(NotificationService);
  // Desde el arranque: el navegador avisa una sola vez que la página se puede instalar, en la pantalla que sea.
  private instalacion = inject(InstalacionService);

  readonly estilosToast: Record<TipoToast, { caja: string; icono: string; nombre: string }> = {
    info: { caja: 'border-detalle-400/40', icono: 'border-detalle-400/40 bg-detalle-500/10 text-detalle-200', nombre: 'campana' },
    exito: { caja: 'border-emerald-500/30', icono: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', nombre: 'check' },
    error: { caja: 'border-red-500/30', icono: 'border-red-500/30 bg-red-500/10 text-red-300', nombre: 'alerta' },
  };
}
