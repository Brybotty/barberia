import { Component, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotificationService, TipoToast } from './core/services/notification.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('barberia');
  notificationService = inject(NotificationService);

  readonly estilosToast: Record<TipoToast, { caja: string; icono: string }> = {
    info: { caja: 'border-acento-500/30 shadow-acento-500/20', icono: 'bg-acento-500/20 text-acento-500' },
    exito: { caja: 'border-emerald-500/30 shadow-emerald-500/20', icono: 'bg-emerald-500/20 text-emerald-500' },
    error: { caja: 'border-red-500/30 shadow-red-500/20', icono: 'bg-red-500/20 text-red-500' },
  };
}
