import { Injectable, inject, signal } from '@angular/core';
import { EMPTY, Observable, map, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { BarberosService } from './barberos.service';
import { CitasService } from './citas.service';
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
            cita.reemplazaA ? 'Una cita cambió de horario' : 'Nueva reserva',
            `${cita.userName} agendó ${cita.serviceName} para el ${new Date(cita.fecha).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${cita.horaStr}.`,
          );
          this.reproducirSonido();
        }
      },
      error: error => console.error('Error escuchando nuevas reservas:', error),
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

    // Los turnos de una agenda recurrente los aparta el sistema de a varios (uno por semana): no son reservas nuevas
    // y, si avisaran, sonarían nueve veces seguidas.
    const nuevas$ = this.citas.creadasDesde(new Date().toISOString()).pipe(
      map(citas => citas.filter(c => !c.recurrenciaId)),
    );
    if (perfil.rol === 'admin') return nuevas$;

    // Las cuentas de celular no tienen correo: no pueden estar enlazadas a un perfil de barbero.
    return (perfil.email ? this.barberos.delEmail(perfil.email) : of([])).pipe(
      map(perfiles => [...perfiles.map(b => b.id!), BARBERO_CUALQUIERA]),
      switchMap(ids => nuevas$.pipe(map(citas => citas.filter(c => ids.includes(c.barberoId))))),
    );
  }

  /** Dos notas cortas generadas en el navegador (sin descargar audio de otro sitio). */
  private reproducirSonido() {
    try {
      const ctx = new AudioContext();
      const nota = (frecuencia: number, inicio: number) => {
        const t = ctx.currentTime + inicio;
        const oscilador = ctx.createOscillator();
        const volumen = ctx.createGain();
        oscilador.type = 'sine';
        oscilador.frequency.value = frecuencia;
        volumen.gain.setValueAtTime(0.0001, t);
        volumen.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
        volumen.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
        oscilador.connect(volumen).connect(ctx.destination);
        oscilador.start(t);
        oscilador.stop(t + 0.4);
      };
      ctx.resume().catch(() => {});
      nota(880, 0);
      nota(1318.5, 0.16);
      setTimeout(() => ctx.close(), 1200);
    } catch {
      // Sin audio (navegador antiguo o bloqueado): el aviso en pantalla basta.
    }
  }
}
