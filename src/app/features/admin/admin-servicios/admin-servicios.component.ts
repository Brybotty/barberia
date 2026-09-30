import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { map } from 'rxjs';
import { ICONOS_SERVICIO, Servicio, iconoDe } from '../../../core/models/servicio.model';
import { IconoComponent } from '../../../shared/components/icono/icono.component';
import { ServiciosService } from '../../../core/services/servicios.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CLIENTE } from '../../../config/cliente';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';

@Component({
  selector: 'app-admin-servicios',
  standalone: true,
  imports: [CommonModule, FormsModule, DuracionPipe, IconoComponent],
  template: `
    <div class="animate-in fade-in duration-500">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 class="text-3xl md:text-4xl font-black text-white">Servicios & Precios</h2>
          <p class="text-neutral-400 mt-2 text-lg">Administra el catálogo de servicios de tu barbería.</p>
        </div>
        <button (click)="toggleFormulario()" class="bg-acento-600 hover:bg-acento-500 text-sobre-acento font-bold py-3 px-6 rounded-xl transition-all shadow-lg hover:shadow-acento-500/20 flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          {{ mostrarFormulario ? 'Cancelar' : 'Nuevo Servicio' }}
        </button>
      </div>

      <!-- Formulario de Servicio (Nuevo/Editar) -->
      @if (mostrarFormulario) {
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 mb-8 shadow-xl animate-in slide-in-from-top-4">
          <h3 class="text-xl font-black text-white mb-6">{{ editandoId ? 'Editar Servicio' : 'Agregar Nuevo Servicio' }}</h3>
          <form (ngSubmit)="guardarServicio()" class="space-y-4">
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Nombre del Servicio</label>
                <input type="text" [(ngModel)]="formularioServicio.nombre" name="nombre" required class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-acento-500 transition-colors">
              </div>
              <div>
                <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Categoría</label>
                <!-- Usar input de texto en lugar de select cerrado para permitir las categorías actuales -->
                <input type="text" [(ngModel)]="formularioServicio.categoria" name="categoria" required placeholder="Ej: Cortes, Barba, Color" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-acento-500 transition-colors">
              </div>
            </div>

            <div>
              <span class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Ícono</span>
              <div class="flex flex-wrap gap-2">
                @for (i of iconos; track i.valor) {
                  <button type="button" (click)="formularioServicio.icono = i.valor" [title]="i.nombre"
                          class="flex flex-col items-center gap-1.5 w-[4.5rem] py-3 rounded-xl border transition-colors"
                          [ngClass]="iconoDe(formularioServicio) === i.valor ? 'border-acento-500 bg-acento-500/10 text-acento-500' : 'border-neutral-800 text-neutral-500 hover:text-white hover:border-neutral-600'">
                    <app-icono [nombre]="i.valor" class="w-6 h-6" />
                    <span class="text-[10px] font-bold">{{ i.nombre }}</span>
                  </button>
                }
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Descripción</label>
              <textarea [(ngModel)]="formularioServicio.descripcion" name="descripcion" rows="3" required class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-acento-500 transition-colors resize-none"></textarea>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Precio (COP)</label>
                <input type="number" [(ngModel)]="formularioServicio.precio" name="precio" required min="0" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-acento-500 transition-colors">
              </div>
              <div>
                <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Duración (Mins)</label>
                <input type="number" [(ngModel)]="formularioServicio.duracionMinutos" name="duracion" required min="5" step="5" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-acento-500 transition-colors">
              </div>
              <div class="flex items-center justify-center pt-6">
                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="relative">
                    <input type="checkbox" [(ngModel)]="formularioServicio.destacado" name="destacado" class="sr-only">
                    <div class="w-10 h-6 bg-neutral-800 rounded-full shadow-inner transition-colors" [class.bg-acento-500]="formularioServicio.destacado"></div>
                    <div class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform" [class.translate-x-4]="formularioServicio.destacado"></div>
                  </div>
                  <span class="text-sm font-bold text-neutral-300 group-hover:text-white transition-colors">Destacado (Popular)</span>
                </label>
              </div>
            </div>

            <div class="flex justify-end pt-4">
              <button type="submit" class="bg-acento-500 hover:bg-acento-400 text-neutral-900 font-black py-3 px-8 rounded-xl transition-all shadow-lg active:scale-95">
                {{ editandoId ? 'Actualizar Servicio' : 'Guardar Servicio' }}
              </button>
            </div>
          </form>
        </div>
      }

      <!-- Lista de Servicios -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        @for (s of servicios$ | async; track s.id) {
          <div class="bg-neutral-900 border border-neutral-800 rounded-xl p-5 hover:border-neutral-700 transition-colors relative overflow-hidden group">
            @if (s.destacado) {
              <div class="absolute right-0 top-0 w-2 h-full bg-acento-500"></div>
            }
            <div class="flex justify-between items-start mb-3">
              <div class="flex items-start gap-3">
                <span class="w-10 h-10 shrink-0 rounded-xl bg-acento-500/10 text-acento-500 flex items-center justify-center">
                  <app-icono [nombre]="iconoDe(s)" class="w-5 h-5" />
                </span>
                <div>
                  <span class="text-[10px] font-black text-acento-500 uppercase tracking-widest">{{ s.categoria }}</span>
                  <h4 class="text-lg font-bold text-white">{{ s.nombre }}</h4>
                </div>
              </div>
              <div class="flex gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                <!-- Edit button -->
                <button (click)="editarServicio(s)" class="text-blue-500 hover:text-white p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500 transition-colors" title="Editar">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                </button>
                <!-- Delete button -->
                <button (click)="eliminarServicio(s.id!)" class="text-red-500 hover:text-white p-2 rounded-lg bg-red-500/10 hover:bg-red-500 transition-colors" title="Eliminar">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </div>
            </div>
            <p class="text-sm text-neutral-400 mb-4 line-clamp-2">{{ s.descripcion }}</p>
            <div class="flex justify-between items-center border-t border-neutral-800 pt-4">
              <span class="text-xl font-black text-white">@if (s.precioDesde) {<span class="text-xs font-bold text-neutral-500">Desde </span>}{{ s.precio | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
              <span class="text-xs font-bold text-neutral-500 flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                {{ s.duracionMinutos | duracion }}
              </span>
            </div>
          </div>
        }
        
        @if ((servicios$ | async)?.length === 0) {
          <div class="col-span-1 lg:col-span-2 text-center py-12 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl">
            <p class="mb-4">No has agregado ningún servicio aún.</p>
            @if (cliente.catalogo.length > 0) {
              <button (click)="cargarCatalogo()" [disabled]="cargandoCatalogo" class="bg-acento-500 hover:bg-acento-400 disabled:opacity-50 text-sobre-acento font-black py-3 px-6 rounded-xl transition-all">
                {{ cargandoCatalogo ? 'Cargando...' : 'Cargar catálogo de ' + cliente.nombre + ' (' + cliente.catalogo.length + ' servicios)' }}
              </button>
            }
          </div>
        }
      </div>

    </div>
  `
})
export class AdminServiciosComponent {
  private serviciosService = inject(ServiciosService);
  private notificaciones = inject(NotificationService);

  readonly cliente = CLIENTE;
  readonly iconos = ICONOS_SERVICIO;
  readonly iconoDe = iconoDe;

  mostrarFormulario = false;
  editandoId: string | null = null;
  cargandoCatalogo = false;

  formularioServicio: Servicio = this.servicioVacio();

  // Ordenados por categoría y, dentro de cada una, por precio descendente
  servicios$ = this.serviciosService.listar().pipe(
    map(servicios => [...servicios].sort((a, b) =>
      (a.categoria ?? '').localeCompare(b.categoria ?? '') || b.precio - a.precio,
    )),
  );

  servicioVacio(): Servicio {
    return {
      nombre: '',
      descripcion: '',
      precio: 0,
      duracionMinutos: 30,
      categoria: 'Cortes',
      destacado: false
    };
  }

  toggleFormulario() {
    if (this.mostrarFormulario) {
      this.cancelarEdicion();
    } else {
      this.mostrarFormulario = true;
    }
  }

  editarServicio(servicio: Servicio) {
    this.editandoId = servicio.id!;
    this.formularioServicio = { ...servicio };
    this.mostrarFormulario = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelarEdicion() {
    this.mostrarFormulario = false;
    this.editandoId = null;
    this.formularioServicio = this.servicioVacio();
  }

  async guardarServicio() {
    if (!this.formularioServicio.nombre || !this.formularioServicio.precio) return;
    try {
      await this.serviciosService.guardar(this.formularioServicio);
      this.cancelarEdicion();
    } catch (e) {
      console.error(e);
      this.notificaciones.error('Error al guardar el servicio');
    }
  }

  /** Carga el catálogo inicial definido en la configuración del cliente. */
  async cargarCatalogo() {
    try {
      this.cargandoCatalogo = true;
      for (const servicio of this.cliente.catalogo) {
        await this.serviciosService.guardar({ ...servicio });
      }
      this.notificaciones.exito('Catálogo cargado', `${this.cliente.catalogo.length} servicios agregados.`);
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo cargar el catálogo');
    } finally {
      this.cargandoCatalogo = false;
    }
  }

  async eliminarServicio(id: string) {
    if (!confirm('¿Estás seguro de eliminar este servicio permanentemente?')) return;
    try {
      await this.serviciosService.eliminar(id);
    } catch (e) {
      console.error(e);
      this.notificaciones.error('Error al eliminar el servicio');
    }
  }
}
