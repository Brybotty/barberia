import { Injectable, inject, signal } from '@angular/core';
import { EMPTY, Observable, map, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { BarberosService } from './barberos.service';
import { CitasService } from './citas.service';
import { PedidosService } from './pedidos.service';
import { BARBERO_CUALQUIERA, Cita } from '../models/cita.model';
import { Usuario } from '../models/usuario.model';

export type TipoToast = 'info' | 'exito' | 'error';

export interface Toast {
  title: string;
  body: string;
  tipo: TipoToast;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private auth = inject(AuthService);
  private citas = inject(CitasService);
  private barberos = inject(BarberosService);
  private pedidos = inject(PedidosService);

  toastMessage = signal<Toast | null>(null);

  private timeoutId?: ReturnType<typeof setTimeout>;
  private notificadas = new Set<string>();

  constructor() {
    // Admin y barberos reciben un aviso por cada reserva creada mientras tienen la app abierta.
    this.auth.currentUserProfile$.pipe(
      switchMap(perfil => this.citasNuevasPara(perfil)),
    ).subscribe({
      next: citas => {
        for (const cita of citas) {
          if (this.notificadas.has(cita.id!)) continue;
          this.notificadas.add(cita.id!);
          this.mostrar(
            '¡Nueva Reserva Recibida!',
            `${cita.userName} agendó ${cita.serviceName} para el ${new Date(cita.fecha).toLocaleDateString()} a las ${cita.horaStr}.`,
          );
          this.reproducirSonido();
        }
      },
      error: error => console.error('Error escuchando nuevas reservas:', error),
    });

    // El admin también recibe un aviso por cada pedido nuevo de la tienda.
    this.auth.currentUserProfile$.pipe(
      switchMap(perfil => perfil?.rol === 'admin' ? this.pedidos.creadosDesde(new Date().toISOString()) : EMPTY),
    ).subscribe({
      next: pedidos => {
        for (const pedido of pedidos) {
          if (this.notificadas.has(pedido.id!)) continue;
          this.notificadas.add(pedido.id!);
          this.mostrar('¡Nuevo pedido en la tienda!', `${pedido.cliente.nombre} · $${pedido.total.toLocaleString('es-CO')} · Revísalo en Admin, Pedidos.`);
          this.reproducirSonido();
        }
      },
      error: error => console.error('Error escuchando nuevos pedidos:', error),
    });
  }

  mostrar(title: string, body: string, tipo: TipoToast = 'info') {
    clearTimeout(this.timeoutId);
    this.toastMessage.set({ title, body, tipo });
    this.timeoutId = setTimeout(() => this.toastMessage.set(null), 8000);
  }

  exito(title: string, body = '') {
    this.mostrar(title, body, 'exito');
  }

  error(title: string, body = '') {
    this.mostrar(title, body, 'error');
  }

  cerrarToast() {
    clearTimeout(this.timeoutId);
    this.toastMessage.set(null);
  }

  private citasNuevasPara(perfil: Usuario | null): Observable<Cita[]> {
    if (!perfil || (perfil.rol !== 'admin' && perfil.rol !== 'barbero')) return EMPTY;

    const nuevas$ = this.citas.creadasDesde(new Date().toISOString());
    if (perfil.rol === 'admin') return nuevas$;

    return this.barberos.delEmail(perfil.email).pipe(
      map(perfiles => [...perfiles.map(b => b.id!), BARBERO_CUALQUIERA]),
      switchMap(ids => nuevas$.pipe(map(citas => citas.filter(c => ids.includes(c.barberoId))))),
    );
  }

  private reproducirSonido() {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => console.log('Autoplay bloqueado por el navegador'));
    } catch (e) {}
  }
}
