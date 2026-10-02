import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map, shareReplay } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { CitasService } from '../../../core/services/citas.service';
import { NotificationService } from '../../../core/services/notification.service';
import { UsuariosService } from '../../../core/services/usuarios.service';
import { Usuario } from '../../../core/models/usuario.model';
import { Cita, esActiva } from '../../../core/models/cita.model';
import { claveDia, diaDeCita } from '../../../core/utils/horario';
import { AdminCitasComponent } from '../admin-citas/admin-citas.component';
import { AdminServiciosComponent } from '../admin-servicios/admin-servicios.component';
import { AdminBarberosComponent } from '../admin-barberos/admin-barberos.component';
import { AdminAjustesComponent } from '../admin-ajustes/admin-ajustes.component';
import { AdminRendimientoComponent } from '../admin-rendimiento/admin-rendimiento.component';

type Tab = 'dashboard' | 'usuarios' | 'barberos' | 'citas' | 'rendimiento' | 'servicios' | 'ajustes';

interface Pestana {
  id: Tab;
  texto: string;
  /** Texto de la barra inferior en móvil. */
  corto: string;
  /** Trazo del ícono (path de 24x24). */
  icono: string;
}

const PESTANAS: Pestana[] = [
  { id: 'dashboard', texto: 'Dashboard', corto: 'Inicio', icono: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
  { id: 'citas', texto: 'Citas (Calendario)', corto: 'Citas', icono: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'rendimiento', texto: 'Cortes y ganancias', corto: 'Ganancias', icono: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'servicios', texto: 'Servicios & Precios', corto: 'Servicios', icono: 'M6.2 20.2a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4Zm11.6 0a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4ZM8.1 15.4 16.4 3.2M15.9 15.4 7.6 3.2M12 9.3l.01.01' },
  { id: 'barberos', texto: 'Staff & Barberos', corto: 'Staff', icono: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { id: 'usuarios', texto: 'Usuarios & Roles', corto: 'Usuarios', icono: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { id: 'ajustes', texto: 'Ajustes (cursos)', corto: 'Ajustes', icono: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink, AdminCitasComponent, AdminServiciosComponent, AdminBarberosComponent,
    AdminAjustesComponent, AdminRendimientoComponent,
  ],
  template: `
    <div class="flex h-screen bg-neutral-900 text-white overflow-hidden font-sans">
      
      <!-- Sidebar -->
      <aside class="w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col hidden md:flex">
        <!-- Logo -->
        <div class="h-16 flex items-center px-6 border-b border-neutral-800 cursor-pointer" routerLink="/">
          <h1 class="text-2xl font-black tracking-tight text-acento-500">BARBER<span class="text-white">ADMIN</span></h1>
        </div>
        
        <!-- Navigation -->
        <nav class="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          @for (tab of pestanas; track tab.id) {
            <button (click)="currentTab = tab.id" [ngClass]="currentTab === tab.id ? 'bg-acento-500 text-sobre-acento' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'" class="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-xl transition-all">
              <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="tab.icono"></path></svg>
              <span class="flex-1 text-left">{{ tab.texto }}</span>
            </button>
          }
        </nav>

        <!-- User Info Bottom -->
        <div class="p-4 border-t border-neutral-800">
          @if (authService.currentUserProfile$ | async; as user) {
            <div class="flex items-center gap-3 mb-4 px-2">
              <div class="w-10 h-10 rounded-full bg-acento-500/20 text-acento-500 flex items-center justify-center font-black text-lg border border-acento-500/30">
                {{ user.nombre.charAt(0) }}
              </div>
              <div class="overflow-hidden">
                <p class="text-sm font-bold truncate text-white">{{ user.nombre }}</p>
                <p class="text-xs text-neutral-500 truncate uppercase">{{ user.rol }}</p>
              </div>
            </div>
            <button (click)="logout()" class="w-full flex justify-center items-center gap-2 bg-neutral-800/50 hover:bg-red-500/10 text-neutral-400 hover:text-red-500 border border-transparent hover:border-red-500/30 text-sm font-bold py-2.5 px-4 rounded-xl transition-all">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
              Cerrar Sesión
            </button>
          }
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a]">
        
        <!-- Mobile Header -->
        <header class="md:hidden h-16 border-b border-neutral-800 flex items-center justify-between px-4 bg-neutral-950">
          <h1 class="text-xl font-black text-acento-500">BARBER<span class="text-white">ADMIN</span></h1>
          <button class="text-neutral-400 hover:text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>
        </header>

        <!-- Dynamic View -->
        <div class="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          
          <!-- TAB: DASHBOARD -->
          @if (currentTab === 'dashboard') {
            <div class="animate-in fade-in duration-500">
              <div class="mb-8">
                <h2 class="text-3xl md:text-4xl font-black text-white">Hola de nuevo.</h2>
                <p class="text-neutral-400 mt-2 text-lg">Aquí tienes el resumen de tu negocio hoy.</p>
              </div>

              <!-- Stats Grid -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                  <div class="absolute -right-6 -top-6 w-24 h-24 bg-acento-500/10 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
                  <p class="text-neutral-400 font-bold mb-2">Citas Hoy</p>
                  <h3 class="text-4xl font-black text-white">{{ stats.citasHoy }}</h3>
                  <p class="text-neutral-500 text-sm font-bold mt-2">
                    {{ stats.porAtenderHoy }} por atender
                  </p>
                </div>
                
                <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                  <div class="absolute -right-6 -top-6 w-24 h-24 bg-blue-500/10 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
                  <p class="text-neutral-400 font-bold mb-2">Ingresos Estimados Hoy</p>
                  <h3 class="text-4xl font-black text-white">{{ stats.ingresosHoy | currency:'COP':'symbol-narrow':'1.0-0' }}</h3>
                  <p class="text-emerald-400 text-sm font-bold mt-2">
                    {{ stats.ingresosCompletadosHoy | currency:'COP':'symbol-narrow':'1.0-0' }} ya completados
                  </p>
                </div>

                <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                  <div class="absolute -right-6 -top-6 w-24 h-24 bg-purple-500/10 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
                  <p class="text-neutral-400 font-bold mb-2">Próximas Citas</p>
                  <h3 class="text-4xl font-black text-white">{{ stats.proximas }}</h3>
                  <p class="text-neutral-500 text-sm font-bold mt-2">
                    {{ stats.clientes }} clientes registrados
                  </p>
                </div>

              </div>
            </div>
          }

          <!-- TAB: USUARIOS -->
          @if (currentTab === 'usuarios') {
            <div class="animate-in fade-in duration-500">
              <div class="mb-8">
                <h2 class="text-3xl md:text-4xl font-black text-white">Gestión de Usuarios</h2>
                <p class="text-neutral-400 mt-2 text-lg">Administra los accesos y roles de tu equipo de barberos.</p>
              </div>

              <div class="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden shadow-2xl">
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-sm text-neutral-300">
                    <thead class="text-xs uppercase bg-neutral-950 text-neutral-500 border-b border-neutral-800">
                      <tr>
                        <th scope="col" class="px-6 py-5">Usuario</th>
                        <th scope="col" class="px-6 py-5">Email</th>
                        <th scope="col" class="px-6 py-5">Rol Actual</th>
                        <th scope="col" class="px-6 py-5 text-right">Acciones de Rol</th>
                      </tr>
                    </thead>
                    <tbody>
                      @if (usuarios$ | async; as usuarios) {
                        @for (u of usuarios; track u.uid) {
                          <tr class="border-b border-neutral-800/50 hover:bg-neutral-800/50 transition-colors">
                            <td class="px-6 py-4 font-bold text-white flex items-center gap-3">
                              <div class="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center text-xs text-white uppercase">{{ u.nombre ? u.nombre.charAt(0) : 'U' }}</div>
                              {{ u.nombre }}
                            </td>
                            <td class="px-6 py-4 text-neutral-400">{{ u.email || u.telefono }}</td>
                            <td class="px-6 py-4">
                              <span class="px-3 py-1.5 text-[10px] uppercase tracking-widest font-black rounded-lg"
                                [ngClass]="{
                                  'bg-acento-500/10 text-acento-500 border border-acento-500/20': u.rol === 'admin',
                                  'bg-blue-500/10 text-blue-500 border border-blue-500/20': u.rol === 'barbero',
                                  'bg-neutral-800 text-neutral-400 border border-neutral-700': u.rol === 'cliente' || !u.rol
                                }">
                                {{ u.rol || 'cliente' }}
                              </span>
                            </td>
                            <td class="px-6 py-4 text-right">
                              <div class="flex justify-end gap-2">
                                @if (u.rol !== 'cliente') {
                                  <button (click)="cambiarRol(u.uid, 'cliente')" class="px-3 py-1.5 text-xs font-bold text-neutral-400 bg-neutral-950 hover:text-white hover:bg-neutral-800 border border-neutral-800 rounded-lg transition-colors">
                                    Hacer Cliente
                                  </button>
                                }
                                @if (u.rol !== 'barbero') {
                                  <button (click)="cambiarRol(u.uid, 'barbero')" class="px-3 py-1.5 text-xs font-bold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-colors">
                                    Hacer Barbero
                                  </button>
                                }
                                @if (u.rol !== 'admin') {
                                  <button (click)="cambiarRol(u.uid, 'admin')" class="px-3 py-1.5 text-xs font-bold text-acento-500 bg-acento-500/10 hover:bg-acento-500/20 border border-acento-500/20 rounded-lg transition-colors">
                                    Hacer Admin
                                  </button>
                                }
                              </div>
                            </td>
                          </tr>
                        }
                        
                        @if (usuarios.length === 0) {
                          <tr>
                            <td colspan="4" class="px-6 py-12 text-center text-neutral-500">
                              Cargando usuarios... o no hay registros.
                            </td>
                          </tr>
                        }
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          }

          <!-- TAB: BARBEROS -->
          @if (currentTab === 'barberos') {
            <app-admin-barberos></app-admin-barberos>
          }

          <!-- TAB: CITAS -->
          @if (currentTab === 'citas') {
            <app-admin-citas></app-admin-citas>
          }

          <!-- TAB: SERVICIOS -->
          @if (currentTab === 'servicios') {
            <app-admin-servicios></app-admin-servicios>
          }

          <!-- TAB: CORTES Y GANANCIAS -->
          @if (currentTab === 'rendimiento') {
            <app-admin-rendimiento></app-admin-rendimiento>
          }

          <!-- TAB: AJUSTES -->
          @if (currentTab === 'ajustes') {
            <app-admin-ajustes></app-admin-ajustes>
          }

        </div>
      </main>

      <!-- Mobile Bottom Nav -->
      <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-neutral-950 border-t border-neutral-800 flex overflow-x-auto scrollbar-hide px-2 py-2 pb-safe z-50">
        @for (tab of pestanas; track tab.id) {
          <button (click)="currentTab = tab.id" [ngClass]="currentTab === tab.id ? 'text-acento-500' : 'text-neutral-500'" class="relative shrink-0 min-w-[68px] flex flex-col items-center gap-1 px-2 py-1">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="tab.icono"></path></svg>
            <span class="text-[10px] font-bold whitespace-nowrap">{{ tab.corto }}</span>
          </button>
        }
      </nav>
    </div>
  `
})
export class AdminDashboardComponent {
  authService = inject(AuthService);
  private router = inject(Router);
  private usuariosService = inject(UsuariosService);
  private citasService = inject(CitasService);
  private notificaciones = inject(NotificationService);

  usuarios$ = this.usuariosService.listar().pipe(shareReplay({ bufferSize: 1, refCount: true }));

  readonly pestanas = PESTANAS;
  currentTab: Tab = 'dashboard';

  stats = {
    citasHoy: 0,
    porAtenderHoy: 0,
    ingresosHoy: 0,
    ingresosCompletadosHoy: 0,
    proximas: 0,
    clientes: 0,
  };

  constructor() {
    this.citasService.todas().pipe(takeUntilDestroyed()).subscribe({
      next: citas => this.calcularStats(citas),
      error: error => console.error('Error cargando citas:', error),
    });
    this.usuarios$.pipe(
      map(usuarios => usuarios.filter(u => (u.rol ?? 'cliente') === 'cliente').length),
      takeUntilDestroyed(),
    ).subscribe({
      next: clientes => this.stats.clientes = clientes,
      error: error => console.error('Error cargando usuarios desde Firestore:', error),
    });
  }

  private calcularStats(citas: Cita[]) {
    const hoy = claveDia(new Date());
    const deHoy = citas.filter(c => diaDeCita(c) === hoy && c.estado !== 'cancelada');
    const sumar = (lista: Cita[]) => lista.reduce((total, c) => total + (Number(c.precio) || 0), 0);

    this.stats.citasHoy = deHoy.length;
    this.stats.porAtenderHoy = deHoy.filter(c => esActiva(c.estado)).length;
    this.stats.ingresosHoy = sumar(deHoy.filter(c => c.estado !== 'no-asistio'));
    this.stats.ingresosCompletadosHoy = sumar(deHoy.filter(c => c.estado === 'completada'));
    this.stats.proximas = citas.filter(c => esActiva(c.estado) && diaDeCita(c) >= hoy).length;
  }

  async cambiarRol(userId: string, nuevoRol: Usuario['rol']) {
    try {
      await this.usuariosService.cambiarRol(userId, nuevoRol);
    } catch (error) {
      console.error('Error actualizando rol:', error);
      this.notificaciones.error('No se pudo cambiar el rol', 'Revisa tu conexión y los permisos de Firestore.');
    }
  }

  async logout() {
    await this.authService.logout();
    this.router.navigate(['/']);
  }
}
