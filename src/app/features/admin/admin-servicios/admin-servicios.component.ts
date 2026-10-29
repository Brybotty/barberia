import { Component, computed, inject, output, signal } from '@angular/core';
import { AsyncPipe, CurrencyPipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { ICONOS_SERVICIO, Servicio, esDelMenuDe, iconoDe, precioCon, preciosPropios } from '../../../core/models/servicio.model';
import { Barbero, avatarDe } from '../../../core/models/barbero.model';
import { BarberosService } from '../../../core/services/barberos.service';
import { AuthService } from '../../../core/services/auth.service';
import { IconoComponent } from '../../../shared/components/icono/icono.component';
import { ServiciosService } from '../../../core/services/servicios.service';
import { ConfirmarService } from '../../../core/services/confirmar.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CLIENTE } from '../../../config/cliente';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';
import { INTERVALO } from '../../../core/utils/horario';
import { ServiciosPorBarberoComponent } from './servicios-por-barbero.component';
import { DiasConServiciosComponent } from './dias-con-servicios.component';

@Component({
  selector: 'app-admin-servicios',
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, NgClass, FormsModule, DuracionPipe, IconoComponent, ServiciosPorBarberoComponent, DiasConServiciosComponent],
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

      <app-servicios-por-barbero />
      <app-dias-con-servicios (irACitas)="irACitas.emit()" />

      @if (barberos().length > 1) {
        <!-- El menú de cada barbero: sus servicios con lo que cobra él (puede tener precios propios). -->
        <div class="mb-6">
          <p class="etiqueta">Ver el menú de</p>
          <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide" role="group" aria-label="Ver el menú de">
            <button type="button" (click)="menuDe.set('')" [attr.aria-pressed]="menuDe() === ''"
                    class="min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold transition-colors"
                    [ngClass]="menuDe() === '' ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-300 hover:border-white/25'">Todos (precio general)</button>
            @for (b of barberos(); track b.id) {
              <button type="button" (click)="menuDe.set(b.id!)" [attr.aria-pressed]="menuDe() === b.id"
                      class="flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-4 text-sm font-bold transition-colors"
                      [ngClass]="menuDe() === b.id ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-300 hover:border-white/25'">
                <img [src]="avatarDe(b)" alt="" class="h-8 w-8 rounded-full object-cover object-[50%_25%]">
                {{ b.nombre }}@if (b.id === miBarberoId()) { <span class="text-[11px] font-extrabold uppercase tracking-wider opacity-80"> · Tú</span> }
              </button>
            }
          </div>
          @if (menuDe()) {
            <p class="ayuda">Lo que se reserva con {{ nombreDe(menuDe()) }} y a qué precio. Para cambiar su precio sin tocar el de los demás, edita el servicio.</p>
          }
        </div>
      }

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

            @if (barberos().length > 1) {
              <fieldset>
                <legend class="etiqueta">¿Quién lo hace?</legend>
                <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Quién hace el servicio">
                  <button type="button" role="radio" [attr.aria-checked]="!formularioServicio.soloDe" (click)="formularioServicio.soloDe = ''"
                          class="min-h-11 rounded-full border px-4 text-sm font-bold transition-colors"
                          [ngClass]="!formularioServicio.soloDe ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-300 hover:border-white/25'">Todos los barberos</button>
                  @for (b of barberos(); track b.id) {
                    <button type="button" role="radio" [attr.aria-checked]="formularioServicio.soloDe === b.id" (click)="formularioServicio.soloDe = b.id"
                            class="min-h-11 rounded-full border px-4 text-sm font-bold transition-colors"
                            [ngClass]="formularioServicio.soloDe === b.id ? 'border-acento-500 bg-acento-500 text-sobre-acento' : 'border-white/10 text-neutral-300 hover:border-white/25'">
                      Solo {{ b.nombre }}{{ b.id === miBarberoId() ? ' (tú)' : '' }}
                    </button>
                  }
                </div>
                @if (formularioServicio.soloDe) {
                  <span class="ayuda">Es un servicio propio de {{ nombreDe(formularioServicio.soloDe) }}: solo se reserva con él y a los demás no les aparece.</span>
                }
              </fieldset>
            }

            <div class="grid gap-4 md:grid-cols-3">
              <label class="block">
                <span class="etiqueta">{{ barberos().length > 1 && !formularioServicio.soloDe ? 'Precio general (COP) *' : 'Precio (COP) *' }}</span>
                <input type="number" [(ngModel)]="formularioServicio.precio" name="precio" required min="0" step="1000" inputmode="numeric" class="campo">
              </label>
              <label class="block">
                <span class="etiqueta">Duración (minutos) *</span>
                <input type="number" [(ngModel)]="formularioServicio.duracionMinutos" name="duracion" required min="5" step="5" inputmode="numeric" class="campo">
                <span class="ayuda">Ocupa justo ese rato en la agenda: el turno siguiente empieza cuando este termina.</span>
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

            @if (barberos().length > 1 && !formularioServicio.soloDe) {
              <fieldset class="rounded-2xl border border-white/10 bg-black/30 p-4" data-precios-por-barbero>
                <legend class="px-1 text-sm font-black text-white">Precio con cada barbero <span class="font-semibold text-neutral-500">(opcional)</span></legend>
                <p class="mb-3 text-sm text-neutral-400">
                  Vacío: cobra el precio general. Pon otro valor para subir (o bajar) el precio de un barbero sin cambiar el de los demás.
                </p>
                <div class="space-y-2.5">
                  @for (b of barberos(); track b.id) {
                    <label class="flex items-center gap-3">
                      <img [src]="avatarDe(b)" alt="" class="h-9 w-9 shrink-0 rounded-full border border-white/15 object-cover object-[50%_25%]">
                      <span class="min-w-0 flex-1 truncate text-sm font-bold">{{ b.nombre }}@if (b.id === miBarberoId()) { <span class="text-detalle-300"> · Tú</span> }</span>
                      <input type="number" [(ngModel)]="preciosForm[b.id!]" [name]="'precio-' + b.id" [attr.name]="'precio-' + b.id" min="0" step="1000" inputmode="numeric"
                             class="campo !w-36 shrink-0" [placeholder]="(formularioServicio.precio || 0) | currency:'COP':'symbol-narrow':'1.0-0'"
                             [attr.aria-label]="'Precio con ' + b.nombre">
                    </label>
                  }
                </div>
              </fieldset>
            }

            <div class="flex justify-end gap-3 border-t border-white/10 pt-5">
              <button type="button" (click)="cancelarEdicion()" class="boton-linea">Cancelar</button>
              <button type="submit" [disabled]="guardando" class="boton-acento">{{ guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Agregar servicio' }}</button>
            </div>
          </form>
        </div>
      }

      @let todos = servicios$ | async;
      @let servicios = todos === null ? null : delMenu(todos);
      @if (servicios === null) {
        <div class="grid gap-4 lg:grid-cols-2"><div class="tarjeta h-36 animate-pulse"></div><div class="tarjeta h-36 animate-pulse"></div></div>
      } @else if (servicios.length === 0 && todos!.length > 0) {
        <div class="tarjeta border-dashed px-6 py-12 text-center text-neutral-500">{{ nombreDe(menuDe()) }} aún no tiene servicios en su menú.</div>
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
              @if (s.soloDe && !menuDe()) {
                <p class="mt-3 text-xs font-bold text-detalle-200" data-solo-de>Servicio propio de {{ nombreDe(s.soloDe) }}</p>
              }
              @if (!menuDe() && preciosDe(s).length) {
                <ul class="mt-3 flex flex-wrap gap-2" data-precios-propios>
                  @for (p of preciosDe(s); track p.barbero.id) {
                    <li class="rounded-full border border-detalle-400/30 bg-detalle-500/[0.06] px-3 py-1 text-xs font-bold text-detalle-200">
                      Con {{ p.barbero.nombre }}{{ p.barbero.id === miBarberoId() ? ' (tú)' : '' }}: {{ p.precio | currency:'COP':'symbol-narrow':'1.0-0' }}
                    </li>
                  }
                </ul>
              }
              <div class="mt-auto flex items-center gap-4 border-t border-white/5 pt-4">
                <span class="font-display text-xl font-black">@if (s.precioDesde) {<span class="font-sans text-xs font-bold text-neutral-500">Desde </span>}{{ precioEnMenu(s) | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                @if (menuDe() && !s.soloDe) {
                  <span class="text-[11px] font-bold uppercase tracking-wider" [ngClass]="precioEnMenu(s) !== s.precio ? 'text-detalle-200' : 'text-neutral-500'">{{ precioEnMenu(s) !== s.precio ? 'Su precio' : 'General' }}</span>
                }
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

  /** Para ir a Citas (ahí se limitan los servicios de un día). */
  readonly irACitas = output<void>();

  readonly cliente = CLIENTE;
  readonly iconos = ICONOS_SERVICIO;
  readonly iconoDe = iconoDe;
  readonly avatarDe = avatarDe;

  /** El equipo, en el orden de la página: cada uno puede tener precios propios o servicios propios. */
  readonly barberos = toSignal(inject(BarberosService).listarCompleto().pipe(catchError(() => of<Barbero[]>([]))), { initialValue: [] as Barbero[] });
  private readonly miCorreo = toSignal(inject(AuthService).currentUserProfile$.pipe(map(perfil => perfil?.email?.toLowerCase() ?? ''), catchError(() => of(''))), { initialValue: '' });
  /** El perfil de barbero de quien mira (un admin que también corta, como Jose): sale marcado "Tú". */
  readonly miBarberoId = computed(() => (this.miCorreo() && this.barberos().find(b => b.emailAsociado === this.miCorreo())?.id) || '');
  /** El barbero cuyo menú se mira (sus servicios con sus precios). Vacío: todos, con el precio general. */
  readonly menuDe = signal('');

  mostrarFormulario = false;
  editandoId: string | null = null;
  cargandoCatalogo = false;
  guardando = false;

  formularioServicio: Servicio = this.servicioVacio();
  /** El precio propio de cada barbero en el formulario (vacío: el general). */
  preciosForm: Record<string, number | null> = {};

  // Ordenados por categoría y, dentro de cada una, por precio descendente
  servicios$ = this.serviciosService.actuales().pipe(
    map(servicios => [...servicios].sort((a, b) =>
      (a.categoria ?? '').localeCompare(b.categoria ?? '') || b.precio - a.precio,
    )),
  );

  servicioVacio(): Servicio {
    return { nombre: '', descripcion: '', precio: 0, duracionMinutos: INTERVALO, categoria: 'Cortes', destacado: false, precioDesde: false, soloDe: '' };
  }

  nombreDe(barberoId: string | undefined): string {
    return this.barberos().find(b => b.id === barberoId)?.nombre ?? 'Ese barbero';
  }

  /** Lo que se ve en la lista: todo, o solo el menú del barbero elegido. */
  delMenu(servicios: Servicio[]): Servicio[] {
    const barberoId = this.menuDe();
    return barberoId ? servicios.filter(s => esDelMenuDe(s, barberoId)) : servicios;
  }

  /** El precio de la tarjeta: el general, o el del barbero cuyo menú se mira. */
  precioEnMenu(servicio: Servicio): number {
    return precioCon(servicio, this.menuDe());
  }

  preciosDe(servicio: Servicio) {
    return preciosPropios(servicio, this.barberos());
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
    this.formularioServicio = { precioDesde: false, ...servicio, soloDe: servicio.soloDe ?? '' };
    this.preciosForm = { ...(servicio.precios ?? {}) };
    this.mostrarFormulario = true;
    document.getElementById('contenido-panel')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelarEdicion() {
    this.mostrarFormulario = false;
    this.editandoId = null;
    this.formularioServicio = this.servicioVacio();
    this.preciosForm = {};
  }

  async guardarServicio() {
    const s = this.formularioServicio;
    const precio = Math.round(Number(s.precio));
    // La agenda va de 5 en 5 minutos (y las reglas lo exigen al reservar): 42 se guarda como 45.
    const duracion = Math.ceil(Number(s.duracionMinutos) / 5) * 5;
    if (!s.nombre.trim() || !s.categoria.trim() || !(precio > 0) || !(duracion >= 5)) {
      this.notificaciones.error('Revisa el servicio', 'Necesita nombre, categoría, un precio mayor que cero y una duración de al menos 5 minutos.');
      return;
    }
    // Solo los precios propios de barberos que siguen en el equipo, y distintos del general (igual es no tener uno).
    const precios: Record<string, number> = {};
    for (const b of this.barberos()) {
      const propio = Math.round(Number(this.preciosForm[b.id!]));
      if (propio > 0 && propio !== precio) precios[b.id!] = propio;
    }
    const soloDe = this.barberos().some(b => b.id === s.soloDe) ? s.soloDe : '';
    try {
      this.guardando = true;
      // Las reglas comparan la reserva con estos valores: van como números enteros.
      await this.serviciosService.guardar({
        ...s, nombre: s.nombre.trim(), categoria: s.categoria.trim(), descripcion: (s.descripcion ?? '').trim(), precio, duracionMinutos: duracion,
        precioDesde: !!s.precioDesde, precios, soloDe,
      });
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
