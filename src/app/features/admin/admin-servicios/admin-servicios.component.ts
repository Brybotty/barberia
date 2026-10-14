import { Component, inject } from '@angular/core';
import { AsyncPipe, CurrencyPipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { map } from 'rxjs';
import { ICONOS_SERVICIO, Servicio, iconoDe } from '../../../core/models/servicio.model';
import { IconoComponent } from '../../../shared/components/icono/icono.component';
import { ServiciosService } from '../../../core/services/servicios.service';
import { ConfirmarService } from '../../../core/services/confirmar.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CLIENTE } from '../../../config/cliente';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';
import { BLOQUE, INTERVALO, MAX_BLOQUES_EN_LINEA, bloquesDe } from '../../../core/utils/horario';

@Component({
  selector: 'app-admin-servicios',
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, NgClass, FormsModule, DuracionPipe, IconoComponent],
  template: `
    <div class="animate-in fade-in duration-500">
      <div class="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 class="titulo-panel">Servicios y precios</h2>
          <p class="mt-1 text-neutral-400">El menú de la barbería. El precio y la duración que pongas son los que se reservan.</p>
        </div>
        <button type="button" (click)="toggleFormulario()" [class]="mostrarFormulario ? 'boton-linea' : 'boton-acento'">
          @if (!mostrarFormulario) { <app-icono nombre="mas" class="h-4 w-4" [grosor]="2.4" /> }
          {{ mostrarFormulario ? 'Cerrar' : 'Nuevo servicio' }}
        </button>
      </div>

      @if (mostrarFormulario) {
        <div class="tarjeta mb-8 p-5 animate-in slide-in-from-top-4 sm:p-6">
          <h3 class="mb-6 text-lg font-black">{{ editandoId ? 'Editar servicio' : 'Nuevo servicio' }}</h3>
          <form (ngSubmit)="guardarServicio()" class="space-y-5" novalidate>
            <div class="grid gap-4 md:grid-cols-2">
              <label class="block">
                <span class="etiqueta">Nombre *</span>
                <input type="text" [(ngModel)]="formularioServicio.nombre" name="nombre" required maxlength="80" class="campo">
              </label>
              <label class="block">
                <span class="etiqueta">Categoría *</span>
                <input type="text" [(ngModel)]="formularioServicio.categoria" name="categoria" required maxlength="40" placeholder="Cortes, Barba…" class="campo">
              </label>
            </div>

            <div>
              <span class="etiqueta">Ícono</span>
              <div class="flex flex-wrap gap-2">
                @for (i of iconos; track i.valor) {
                  <button type="button" (click)="formularioServicio.icono = i.valor" [attr.aria-pressed]="iconoDe(formularioServicio) === i.valor"
                          class="flex w-[4.75rem] flex-col items-center gap-1.5 rounded-xl border py-3 transition-colors"
                          [ngClass]="iconoDe(formularioServicio) === i.valor ? 'border-detalle-400 bg-detalle-500/10 text-detalle-200' : 'border-white/10 text-neutral-500 hover:border-white/30 hover:text-white'">
                    <app-icono [nombre]="i.valor" class="h-6 w-6" />
                    <span class="text-[11px] font-bold">{{ i.nombre }}</span>
                  </button>
                }
              </div>
            </div>

            <label class="block">
              <span class="etiqueta">Descripción</span>
              <textarea [(ngModel)]="formularioServicio.descripcion" name="descripcion" rows="3" maxlength="300" class="campo resize-none"></textarea>
            </label>

            <div class="grid gap-4 md:grid-cols-3">
              <label class="block">
                <span class="etiqueta">Precio (COP) *</span>
                <input type="number" [(ngModel)]="formularioServicio.precio" name="precio" required min="0" step="1000" inputmode="numeric" class="campo">
              </label>
              <label class="block">
                <span class="etiqueta">Duración (minutos) *</span>
                <input type="number" [(ngModel)]="formularioServicio.duracionMinutos" name="duracion" required min="10" step="10" inputmode="numeric" class="campo">
                @if (!reservableEnLinea(formularioServicio)) {
                  <span class="ayuda !text-detalle-200">Con más de {{ maximoEnLinea | duracion }} no se reserva en línea: lo agendas tú desde Citas.</span>
                } @else {
                  <span class="ayuda">Ocupa {{ turnos(formularioServicio) }} {{ turnos(formularioServicio) === 1 ? 'turno' : 'turnos' }} de {{ turno }} min en la agenda.</span>
                }
              </label>
              <div class="flex flex-col justify-center gap-3 md:pt-5">
                <label class="flex cursor-pointer items-center justify-between gap-3">
                  <span class="text-sm font-bold text-neutral-200">Destacado en el inicio</span>
                  <input type="checkbox" [(ngModel)]="formularioServicio.destacado" name="destacado" class="peer sr-only">
                  <span class="interruptor"></span>
                </label>
                <label class="flex cursor-pointer items-center justify-between gap-3">
                  <span class="text-sm font-bold text-neutral-200">El precio es "desde"</span>
                  <input type="checkbox" [(ngModel)]="formularioServicio.precioDesde" name="precioDesde" class="peer sr-only">
                  <span class="interruptor"></span>
                </label>
              </div>
            </div>

            <div class="flex justify-end gap-3 border-t border-white/10 pt-5">
              <button type="button" (click)="cancelarEdicion()" class="boton-linea">Cancelar</button>
              <button type="submit" [disabled]="guardando" class="boton-acento">{{ guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Agregar servicio' }}</button>
            </div>
          </form>
        </div>
      }

      @let servicios = servicios$ | async;
      @if (servicios === null) {
        <div class="grid gap-4 lg:grid-cols-2"><div class="tarjeta h-36 animate-pulse"></div><div class="tarjeta h-36 animate-pulse"></div></div>
      } @else if (servicios.length === 0) {
        <div class="tarjeta border-dashed px-6 py-12 text-center text-neutral-500">
          <p class="mb-4">Aún no hay servicios.</p>
          @if (cliente.catalogo.length > 0) {
            <button type="button" (click)="cargarCatalogo()" [disabled]="cargandoCatalogo" class="boton-acento">
              {{ cargandoCatalogo ? 'Cargando…' : 'Cargar el menú de ' + cliente.nombre + ' (' + cliente.catalogo.length + ')' }}
            </button>
          }
        </div>
      } @else {
        <ul class="grid gap-4 lg:grid-cols-2">
          @for (s of servicios; track s.id) {
            <li class="tarjeta relative flex flex-col p-5">
              <div class="flex items-start gap-3">
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-detalle-500/10 text-detalle-300">
                  <app-icono [nombre]="iconoDe(s)" class="h-5 w-5" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-[11px] font-extrabold uppercase tracking-widest text-neutral-500">{{ s.categoria }}</p>
                  <h4 class="truncate text-lg font-bold">{{ s.nombre }}</h4>
                </div>
                @if (s.destacado) { <span class="chip-oro">Destacado</span> }
              </div>
              <p class="mt-3 line-clamp-2 text-sm text-neutral-400">{{ s.descripcion }}</p>
              <div class="mt-auto flex items-center gap-4 border-t border-white/5 pt-4">
                <span class="font-display text-xl font-black">@if (s.precioDesde) {<span class="font-sans text-xs font-bold text-neutral-500">Desde </span>}{{ s.precio | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                <span class="flex items-center gap-1 text-xs font-bold text-neutral-500"><app-icono nombre="reloj" class="h-4 w-4" [grosor]="2" /> {{ s.duracionMinutos | duracion }}</span>
                <span class="ml-auto flex gap-2">
                  <button type="button" (click)="editarServicio(s)" class="boton-icono" [attr.aria-label]="'Editar ' + s.nombre" title="Editar"><app-icono nombre="editar" class="h-4 w-4" [grosor]="1.8" /></button>
                  <button type="button" (click)="eliminarServicio(s)" class="boton-icono peligro" [attr.aria-label]="'Eliminar ' + s.nombre" title="Eliminar"><app-icono nombre="papelera" class="h-4 w-4" [grosor]="1.8" /></button>
                </span>
              </div>
            </li>
          }
        </ul>
      }
    </div>
  `
})
export class AdminServiciosComponent {
  private serviciosService = inject(ServiciosService);
  private notificaciones = inject(NotificationService);
  private confirmar = inject(ConfirmarService);

  readonly cliente = CLIENTE;
  readonly iconos = ICONOS_SERVICIO;
  readonly iconoDe = iconoDe;

  mostrarFormulario = false;
  editandoId: string | null = null;
  cargandoCatalogo = false;
  guardando = false;

  formularioServicio: Servicio = this.servicioVacio();

  // Ordenados por categoría y, dentro de cada una, por precio descendente
  servicios$ = this.serviciosService.actuales().pipe(
    map(servicios => [...servicios].sort((a, b) =>
      (a.categoria ?? '').localeCompare(b.categoria ?? '') || b.precio - a.precio,
    )),
  );

  readonly turno = INTERVALO;
  readonly maximoEnLinea = MAX_BLOQUES_EN_LINEA * BLOQUE;

  servicioVacio(): Servicio {
    return { nombre: '', descripcion: '', precio: 0, duracionMinutos: INTERVALO, categoria: 'Cortes', destacado: false, precioDesde: false };
  }

  bloques(servicio: Servicio): number {
    return bloquesDe(Number(servicio.duracionMinutos) || INTERVALO);
  }

  /** Turnos de la agenda que deja ocupados: los turnos empiezan cada 40 min, así que uno de 60 min ocupa dos. */
  turnos(servicio: Servicio): number {
    return Math.ceil((Number(servicio.duracionMinutos) || INTERVALO) / INTERVALO);
  }

  reservableEnLinea(servicio: Servicio): boolean {
    return this.bloques(servicio) <= MAX_BLOQUES_EN_LINEA;
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
    this.formularioServicio = { precioDesde: false, ...servicio };
    this.mostrarFormulario = true;
    document.getElementById('contenido-panel')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelarEdicion() {
    this.mostrarFormulario = false;
    this.editandoId = null;
    this.formularioServicio = this.servicioVacio();
  }

  async guardarServicio() {
    const s = this.formularioServicio;
    const precio = Math.round(Number(s.precio));
    const duracion = Math.round(Number(s.duracionMinutos));
    if (!s.nombre.trim() || !s.categoria.trim() || !(precio > 0) || !(duracion >= 10)) {
      this.notificaciones.error('Revisa el servicio', 'Necesita nombre, categoría, un precio mayor que cero y una duración de al menos 10 minutos.');
      return;
    }
    try {
      this.guardando = true;
      // Las reglas comparan la reserva con estos valores: van como números enteros.
      await this.serviciosService.guardar({ ...s, nombre: s.nombre.trim(), categoria: s.categoria.trim(), descripcion: (s.descripcion ?? '').trim(), precio, duracionMinutos: duracion, precioDesde: !!s.precioDesde });
      this.cancelarEdicion();
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo guardar el servicio');
    } finally {
      this.guardando = false;
    }
  }

  /** Carga el catálogo inicial definido en la configuración del cliente. */
  async cargarCatalogo() {
    try {
      this.cargandoCatalogo = true;
      for (const servicio of this.cliente.catalogo) {
        await this.serviciosService.guardar({ ...servicio });
      }
      this.notificaciones.exito('Menú cargado', `${this.cliente.catalogo.length} servicios agregados.`);
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo cargar el menú');
    } finally {
      this.cargandoCatalogo = false;
    }
  }

  async eliminarServicio(servicio: Servicio) {
    const seguro = await this.confirmar.preguntar({
      titulo: `¿Eliminar "${servicio.nombre}"?`,
      texto: 'Deja de ofrecerse en la página. Las citas ya agendadas con este servicio no se tocan.',
      aceptar: 'Sí, eliminar',
      peligro: true,
    });
    if (!seguro) return;
    try {
      await this.serviciosService.eliminar(servicio.id!);
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo eliminar el servicio');
    }
  }
}
