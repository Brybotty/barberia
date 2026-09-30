import { Component, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CLIENTE } from '../../../config/cliente';
import { MarcaComponent } from '../../../shared/components/marca/marca.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [MarcaComponent, RouterLink],
  templateUrl: './login.component.html'
})
export class LoginComponent {
  readonly cliente = CLIENTE;
  authService = inject(AuthService);
  router = inject(Router);
  private route = inject(ActivatedRoute);
  private notificaciones = inject(NotificationService);

  async login() {
    try {
      await this.authService.loginConGoogle();
      // Solo rutas internas ('/x', no '//dominio.com').
      const volver = this.route.snapshot.queryParamMap.get('volver');
      await this.router.navigateByUrl(volver?.startsWith('/') && !volver.startsWith('//') ? volver : '/reservar');
    } catch (error: any) {
      // El usuario cerró el popup: no es un error que haya que mostrar.
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') return;
      console.error('Error al iniciar sesión:', error);
      this.notificaciones.error('Error al iniciar sesión', error?.message ?? String(error));
    }
  }
}
