import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { CitasService } from '../../../core/services/citas.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Cita, esActiva } from '../../../core/models/cita.model';
import { compararCitas, inicioDeCita } from '../../../core/utils/horario';

@Component({
  selector: 'app-mis-citas',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-neutral-950 py-16 px-4">
      <div class="max-w-5xl mx-auto mt-10">
        <h2 class="text-4xl font-black text-white mb-2">Mis Reservas</h2>
        <p class="text-neutral-400 mb-8">Administra y visualiza el historial de tus citas.</p>

        @if (citas.length === 0 && !cargando) {
          <div class="bg-neutral-900 border border-neutral-800 rounded-3xl p-12 text-center">
            <div class="w-20 h-20 bg-neutral-950 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg class="w-10 h-10 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            </div>
            <h3 class="text-2xl font-bold text-white mb-3">No tienes reservas</h3>
            <p class="text-neutral-500 mb-8">Aún no has agendado ninguna cita con nosotros.</p>
            <button routerLink="/reservar" class="bg-acento-600 hover:bg-acento-500 text-sobre-acento font-black py-3 px-8 rounded-full transition-all">
              Agendar mi primera cita
            </button>
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            @for (cita of citas; track cita.id) {
              <div class="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 relative overflow-hidden group">
                <!-- Estado Badge -->
                <div class="absolute top-4 right-4 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded"
                     [ngClass]="{
                       'bg-green-500/10 text-green-500': cita.estado === 'pendiente' || cita.estado === 'confirmada',
                       'bg-red-500/10 text-red-500': cita.estado === 'no-asistio',
                       'bg-neutral-500/10 text-neutral-400': cita.estado === 'completada' || cita.estado === 'cancelada'
                     }">
                  {{ cita.estado }}
                </div>
                
                <h4 class="text-xl font-bold text-white mb-1 pr-16">{{ cita.serviceName }}</h4>
                <p class="text-acento-500 text-sm font-bold mb-6">{{ cita.precio | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
                
                <div class="space-y-3 mb-6">
                  <div class="flex items-center text-sm text-neutral-300">
                    <svg class="w-4 h-4 text-neutral-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    {{ cita.fecha | date:'mediumDate' }} a las {{ cita.horaStr }}
                  </div>
                  <div class="flex items-center text-sm text-neutral-300">
                    <svg class="w-4 h-4 text-neutral-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                    {{ cita.barberoNombre }}
                  </div>
                </div>

                @if (sePuedeCancelar(cita)) {
                  <button (click)="cancelarCita(cita)" class="w-full bg-neutral-950 hover:bg-red-500/10 text-neutral-400 hover:text-red-500 border border-neutral-800 hover:border-red-500/30 font-bold py-2.5 rounded-xl transition-all text-sm">
                    Cancelar Reserva
                  </button>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `
})
export class MisCitasComponent {
  private authService = inject(AuthService);
  private citasService = inject(CitasService);
  private notificaciones = inject(NotificationService);

  citas: Cita[] = [];
  cargando = true;

  constructor() {
    this.authService.user$.pipe(
      switchMap(user => user ? this.citasService.deUsuario(user.uid) : of([])),
      takeUntilDestroyed(),
    ).subscribe({
      next: citas => {
        // Las más recientes primero
        this.citas = citas.sort(compararCitas).reverse();
        this.cargando = false;
      },
      error: error => {
        console.error(error);
        this.cargando = false;
      },
    });
  }

  sePuedeCancelar(cita: Cita): boolean {
    return esActiva(cita.estado) && inicioDeCita(cita) > new Date();
  }

  async cancelarCita(cita: Cita) {
    if (!confirm('¿Estás seguro de que deseas cancelar esta reserva?')) return;
    try {
      await this.citasService.cancelar(cita);
      this.notificaciones.exito('Reserva cancelada', 'El horario quedó libre para otros clientes.');
    } catch (e) {
      console.error(e);
      this.notificaciones.error('Error al cancelar la cita', 'Inténtalo de nuevo en unos segundos.');
    }
  }
}
