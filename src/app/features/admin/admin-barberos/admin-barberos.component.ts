import { Component, OnDestroy, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs';
import { Barbero, avatarDe } from '../../../core/models/barbero.model';
import { BarberosService } from '../../../core/services/barberos.service';
import { ConfirmarService } from '../../../core/services/confirmar.service';
import { FotoStaff, FotosStaffService } from '../../../core/services/fotos-staff.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CLIENTE } from '../../../config/cliente';
import { DisponibilidadComponent } from '../../../shared/components/disponibilidad/disponibilidad.component';
import { IconoComponent } from '../../../shared/components/icono/icono.component';
import { RedSocialComponent } from '../../../shared/components/red-social/red-social.component';

@Component({
  selector: 'app-admin-barberos',
  standalone: true,
  imports: [AsyncPipe, FormsModule, DisponibilidadComponent, IconoComponent, RedSocialComponent],
  template: `
    <div class="animate-in fade-in duration-500">
      <div class="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 class="titulo-panel">Equipo</h2>
          <p class="mt-1 text-neutral-400">Los barberos que se muestran en la página y en la reserva. Lo que cambies aquí se ve al instante.</p>
        </div>
        <button type="button" (click)="toggleFormulario()" [class]="mostrarFormulario ? 'boton-linea' : 'boton-acento'">
          @if (!mostrarFormulario) { <app-icono nombre="mas" class="h-4 w-4" [grosor]="2.4" /> }
          {{ mostrarFormulario ? 'Cerrar' : 'Agregar barbero' }}
        </button>
      </div>

      <!-- Formulario (nuevo o edición) -->
      @if (mostrarFormulario) {
        <div class="tarjeta mb-8 p-5 animate-in slide-in-from-top-4 sm:p-6">
          <h3 class="mb-6 text-lg font-black">{{ editando ? 'Editar a ' + editando.nombre : 'Nuevo barbero' }}</h3>
          <form (ngSubmit)="guardarBarbero()" class="grid gap-6 lg:grid-cols-[13rem_1fr]" novalidate>

            <!-- Foto -->
            <div>
              <span class="etiqueta">Foto</span>
              <div class="relative aspect-[4/5] w-40 overflow-hidden rounded-2xl border border-white/10 bg-black/40 lg:w-full">
                <img [src]="avatarDe(nuevoBarbero)" alt="" class="h-full w-full object-cover object-[50%_25%]">
                @if (subiendoFoto) {
                  <div class="absolute inset-0 flex items-center justify-center bg-black/70 text-sm font-bold">Subiendo…</div>
                }
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <label class="boton-linea boton-chico cursor-pointer" [class.pointer-events-none]="subiendoFoto">
                  <app-icono nombre="camara" class="h-4 w-4" [grosor]="1.8" />
                  {{ nuevoBarbero.avatar ? 'Cambiar' : 'Subir foto' }}
                  <input type="file" accept="image/*" class="sr-only" (change)="subirFoto($event)" [disabled]="subiendoFoto">
                </label>
                <button type="button" (click)="abrirGaleria()" [disabled]="cargandoGaleria" class="boton-linea boton-chico">
                  {{ cargandoGaleria ? 'Cargando…' : galeria ? 'Ocultar' : 'Ya subidas' }}
                </button>
                @if (nuevoBarbero.avatar) {
                  <button type="button" (click)="nuevoBarbero.avatar = ''" class="boton-linea boton-chico">Quitar</button>
                }
              </div>
              <p class="ayuda">Vertical, con la cara en la parte de arriba. Se reduce sola antes de subir.</p>
            </div>

            <div class="space-y-4">
              @if (galeria) {
                <div class="rounded-xl border border-white/10 bg-black/30 p-4">
                  <p class="etiqueta">Fotos ya subidas ({{ galeria.length }})</p>
                  @if (galeria.length) {
                    <div class="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      @for (foto of galeria; track foto.url) {
                        <button type="button" (click)="elegirFoto(foto)" [attr.aria-label]="'Usar la foto ' + foto.nombre"
                                class="relative aspect-[4/5] overflow-hidden rounded-lg border transition-colors"
                                [class]="foto.url === nuevoBarbero.avatar ? 'border-detalle-400 ring-2 ring-detalle-400/40' : 'border-white/10 hover:border-white/40'">
                          <img [src]="foto.url" alt="" loading="lazy" class="h-full w-full object-cover">
                        </button>
                      }
                    </div>
                  } @else {
                    <p class="text-sm text-neutral-500">Aún no hay fotos. Sube la primera con "Subir foto".</p>
                  }
                </div>
              }

              <div class="grid gap-4 md:grid-cols-2">
                <label class="block">
                  <span class="etiqueta">Nombre *</span>
                  <input type="text" [(ngModel)]="nuevoBarbero.nombre" name="nombre" required maxlength="80" class="campo" placeholder="Como se muestra en la página">
                </label>
                <label class="block">
                  <span class="etiqueta">Rol o especialidad</span>
                  <input type="text" [(ngModel)]="nuevoBarbero.especialidad" name="especialidad" maxlength="80" class="campo" placeholder="Barbero">
                </label>
                <label class="block">
                  <span class="etiqueta">Instagram</span>
                  <span class="flex">
                    <span class="flex items-center rounded-l-xl border border-r-0 border-white/10 bg-white/5 px-3 font-bold text-neutral-400">&#64;</span>
                    <input type="text" [(ngModel)]="nuevoBarbero.instagram" name="instagram" maxlength="31" autocapitalize="off" spellcheck="false" class="campo !rounded-l-none" placeholder="usuario">
                  </span>
                </label>
                <label class="block">
                  <span class="etiqueta">Orden en la página</span>
                  <input type="number" min="0" step="1" [(ngModel)]="nuevoBarbero.orden" name="orden" class="campo" placeholder="1">
                  <span class="ayuda">El 1 sale primero.</span>
                </label>
                <label class="block">
                  <span class="etiqueta">Correo de su cuenta</span>
                  <input type="email" [(ngModel)]="nuevoBarbero.emailAsociado" name="email" maxlength="200" autocapitalize="off" spellcheck="false" class="campo" placeholder="correo@ejemplo.com">
                  <span class="ayuda">Con este correo entra y ve su agenda en "Mi panel". No se muestra en la página.</span>
                </label>
                <label class="block">
                  <span class="etiqueta">Comisión (%)</span>
                  <input type="number" min="0" max="100" step="1" [(ngModel)]="nuevoBarbero.comision" name="comision" class="campo" placeholder="100">
                  <span class="ayuda">Lo que gana de cada servicio. Vacío = 100 %, como el dueño que también corta.</span>
                </label>
              </div>

              <div class="flex justify-end gap-3 border-t border-white/10 pt-5">
                <button type="button" (click)="toggleFormulario()" class="boton-linea">Cancelar</button>
                <button type="submit" [disabled]="isSubmitting || subiendoFoto || !nuevoBarbero.nombre.trim()" class="boton-acento">
                  {{ isSubmitting ? 'Guardando…' : editando ? 'Guardar cambios' : 'Agregar al equipo' }}
                </button>
              </div>
            </div>
          </form>
        </div>
      }

      <!-- Equipo -->
      @let barberos = barberos$ | async;
      @if (barberos === null) {
        <div class="grid gap-4 md:grid-cols-2"><div class="tarjeta h-40 animate-pulse"></div><div class="tarjeta h-40 animate-pulse"></div></div>
      } @else if (barberos.length === 0) {
        <div class="tarjeta border-dashed px-6 py-12 text-center text-neutral-500">
          <p class="mb-4">Aún no hay barberos en el equipo.</p>
          @if (cliente.equipo.length > 0) {
            <button type="button" (click)="cargarEquipo()" [disabled]="isSubmitting" class="boton-acento">
              Cargar el equipo de {{ cliente.nombre }} ({{ cliente.equipo.length }})
            </button>
            <p class="ayuda">Después agrega el correo de cada barbero para que vea sus citas.</p>
          }
        </div>
      } @else {
        <ul class="grid gap-4 md:grid-cols-2">
          @for (b of barberos; track b.id) {
            <li class="tarjeta overflow-hidden">
              <div class="flex gap-4 p-4 sm:p-5">
                <img [src]="avatarDe(b)" [alt]="b.nombre" loading="lazy" class="h-28 w-[5.5rem] shrink-0 rounded-xl border border-white/10 object-cover object-[50%_25%]">
                <div class="flex min-w-0 flex-1 flex-col">
                  <p class="text-[11px] font-extrabold uppercase tracking-widest text-detalle-300">{{ b.especialidad || 'Barbero' }}</p>
                  <h4 class="truncate text-lg font-black">{{ b.nombre }}</h4>
                  @if (b.instagram) {
                    <p class="mt-0.5 flex items-center gap-1.5 truncate text-sm text-neutral-400"><app-red-social red="instagram" class="h-3.5 w-3.5" /> &#64;{{ b.instagram }}</p>
                  }
                  <p class="mt-1 truncate text-xs text-neutral-500">
                    @if (b.emailAsociado) { {{ b.emailAsociado }} } @else { <span class="text-detalle-300">Sin correo: no puede ver su agenda</span> }
                  </p>
                  <div class="mt-auto flex items-center gap-2 pt-3">
                    <span class="chip-neutro">Comisión {{ b.comision ?? 100 }} %</span>
                    <span class="ml-auto flex gap-2">
                      <button type="button" (click)="editarBarbero(b)" class="boton-icono" [attr.aria-label]="'Editar a ' + b.nombre" title="Editar"><app-icono nombre="editar" class="h-4 w-4" [grosor]="1.8" /></button>
                      <button type="button" (click)="eliminarBarbero(b)" class="boton-icono peligro" [attr.aria-label]="'Quitar a ' + b.nombre" title="Quitar del equipo"><app-icono nombre="papelera" class="h-4 w-4" [grosor]="1.8" /></button>
                    </span>
                  </div>
                </div>
              </div>
              <button type="button" (click)="disponibilidadDe = disponibilidadDe === b.id ? null : b.id!" [attr.aria-expanded]="disponibilidadDe === b.id"
                      class="flex min-h-11 w-full items-center justify-between gap-3 border-t border-white/10 px-5 text-sm font-bold text-neutral-300 transition-colors hover:bg-white/[0.03] hover:text-white">
                <span class="flex items-center gap-2"><app-icono nombre="reloj" class="h-4 w-4 text-detalle-300" [grosor]="2" /> Días libres y horarios cerrados</span>
                <app-icono nombre="atras" class="h-4 w-4 transition-transform" [class]="disponibilidadDe === b.id ? 'rotate-90' : '-rotate-90'" [grosor]="2" />
              </button>
            </li>
            @if (disponibilidadDe === b.id) {
              <li class="md:col-span-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <p class="rotulo mb-3">Disponibilidad de {{ b.nombre }}</p>
                <app-disponibilidad [barbero]="b" />
              </li>
            }
          }
        </ul>
      }
    </div>
  `
})
export class AdminBarberosComponent implements OnDestroy {
  private barberosService = inject(BarberosService);
  private fotos = inject(FotosStaffService);
  private notificaciones = inject(NotificationService);
  private confirmar = inject(ConfirmarService);

  readonly avatarDe = avatarDe;
  readonly cliente = CLIENTE;

  mostrarFormulario = false;
  isSubmitting = false;
  /** Barbero que se está editando; null al registrar uno nuevo. */
  editando: Barbero | null = null;
  /** Barbero cuya disponibilidad está abierta. */
  disponibilidadDe: string | null = null;

  nuevoBarbero: Barbero = this.barberoVacio();

  subiendoFoto = false;
  cargandoGaleria = false;
  /** Fotos de la carpeta del staff; null mientras el selector está cerrado. */
  galeria: FotoStaff[] | null = null;
  /** Fotos subidas en este formulario y aún sin guardar: las que no queden como avatar se borran. */
  private subidasSinGuardar: string[] = [];

  barberos$ = this.barberosService.listarCompleto();

  constructor() {
    // Asigna el rol a barberos enlazados que iniciaron sesión después de ser registrados.
    this.barberos$.pipe(take(1)).subscribe({
      next: barberos => this.barberosService.sincronizarRoles(barberos)
        .catch(error => console.error('No se pudieron sincronizar los roles de barbero', error)),
      error: error => console.error('Error cargando barberos', error),
    });
  }

  ngOnDestroy() {
    this.limpiarSubidas();
  }

  private barberoVacio(): Barbero {
    return { nombre: '', especialidad: '', avatar: '', instagram: '', emailAsociado: '' };
  }

  toggleFormulario() {
    this.limpiarSubidas();
    this.galeria = null;
    this.mostrarFormulario = !this.mostrarFormulario;
    this.editando = null;
    this.nuevoBarbero = this.barberoVacio();
  }

  editarBarbero(barbero: Barbero) {
    this.limpiarSubidas();
    this.galeria = null;
    this.editando = barbero;
    this.nuevoBarbero = { ...barbero };
    this.mostrarFormulario = true;
    document.getElementById('contenido-panel')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async guardarBarbero() {
    if (!this.nuevoBarbero.nombre.trim()) return;
    const instagram = (this.nuevoBarbero.instagram ?? '').trim().replace(/^@/, '');
    if (!/^[A-Za-z0-9._]{0,30}$/.test(instagram)) {
      this.notificaciones.error('Revisa el Instagram', 'Escribe solo el usuario, sin espacios ni la dirección completa.');
      return;
    }
    this.nuevoBarbero.instagram = instagram;
    // Vacío = sin comisión definida (100 %). Firestore no acepta undefined.
    const comision = Number(this.nuevoBarbero.comision);
    this.nuevoBarbero.comision = (this.nuevoBarbero.comision as unknown) === '' || this.nuevoBarbero.comision == null || !Number.isFinite(comision)
      ? null
      : Math.min(100, Math.max(0, Math.round(comision)));
    try {
      this.isSubmitting = true;
      if (this.editando) {
        await this.barberosService.actualizar(this.editando, this.nuevoBarbero);
      } else {
        await this.barberosService.crear(this.nuevoBarbero);
      }
      this.notificaciones.exito(this.editando ? 'Cambios guardados' : 'Barbero agregado', 'Ya se ve en la página y en la reserva.');
      this.limpiarSubidas(this.nuevoBarbero.avatar);
      this.galeria = null;
      this.mostrarFormulario = false;
      this.editando = null;
      this.nuevoBarbero = this.barberoVacio();
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.isSubmitting = false;
    }
  }

  /** Sube la foto elegida a Storage y deja su enlace como avatar (se guarda al pulsar "Guardar"). */
  async subirFoto(evento: Event) {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    this.subiendoFoto = true;
    const formulario = this.nuevoBarbero;
    try {
      const url = await this.fotos.subir(archivo, formulario.nombre);
      // Si cerraron o cambiaron de formulario mientras subía, la foto ya no tiene dueño.
      if (formulario !== this.nuevoBarbero || !this.mostrarFormulario) {
        this.fotos.borrar(url).catch(error => console.warn('No se pudo borrar una foto sin usar', error));
        return;
      }
      this.subidasSinGuardar.push(url);
      this.nuevoBarbero.avatar = url;
      this.galeria = null;
    } catch (error) {
      console.error(error);
      this.notificaciones.error('No se pudo subir la foto', mensajeDeFoto(error));
    } finally {
      this.subiendoFoto = false;
    }
  }

  async abrirGaleria() {
    if (this.galeria) {
      this.galeria = null;
      return;
    }
    this.cargandoGaleria = true;
    try {
      this.galeria = await this.fotos.listar();
    } catch (error) {
      console.error(error);
      this.notificaciones.error('No se pudieron cargar las fotos', mensajeDeFoto(error));
    } finally {
      this.cargandoGaleria = false;
    }
  }

  elegirFoto(foto: FotoStaff) {
    this.nuevoBarbero.avatar = foto.url;
    this.galeria = null;
  }

  /** Borra de Storage las fotos subidas en este formulario que no quedaron como avatar (las de antes no se tocan). */
  private limpiarSubidas(conservar = '') {
    const sobrantes = this.subidasSinGuardar.filter(url => url !== conservar);
    this.subidasSinGuardar = [];
    for (const url of sobrantes) {
      this.fotos.borrar(url).catch(error => console.warn('No se pudo borrar una foto sin usar', error));
    }
  }

  /** Registra en el staff al equipo definido en la configuración del cliente. */
  async cargarEquipo() {
    try {
      this.isSubmitting = true;
      let orden = 1;
      for (const miembro of this.cliente.equipo) {
        await this.barberosService.crear({
          nombre: miembro.apodo ? `${miembro.nombre} "${miembro.apodo}"` : miembro.nombre,
          especialidad: miembro.rol,
          avatar: miembro.foto ?? '',
          instagram: miembro.instagram ?? '',
          orden: orden++,
          emailAsociado: '',
        });
      }
      this.notificaciones.exito('Equipo cargado', 'Agrega el correo de cada barbero cuando lo tengas.');
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo cargar el equipo');
    } finally {
      this.isSubmitting = false;
    }
  }

  async eliminarBarbero(barbero: Barbero) {
    const seguro = await this.confirmar.preguntar({
      titulo: `¿Quitar a ${barbero.nombre} del equipo?`,
      texto: 'Deja de aparecer en la página y en la reserva, y su cuenta vuelve a ser de cliente. Sus citas ya registradas no se borran.',
      aceptar: 'Sí, quitarlo',
      peligro: true,
    });
    if (!seguro) return;
    try {
      await this.barberosService.eliminar(barbero);
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo quitar al barbero');
    }
  }
}

/** Mensaje claro para los errores al subir o listar fotos (los de Storage traen un código "storage/..."). */
function mensajeDeFoto(error: unknown): string {
  const { code = '', message = '' } = (error ?? {}) as { code?: string; message?: string };
  if (code === 'storage/unauthorized') return 'Tu cuenta no tiene permiso para manejar fotos. Por ahora solo puede la cuenta de administrador principal.';
  if (code === 'storage/unknown' || code === 'storage/bucket-not-found' || code === 'storage/project-not-found') {
    return 'El almacenamiento de fotos (Storage) aún no está activado en Firebase. Mientras tanto la foto se conserva como está.';
  }
  if (!navigator.onLine || code === 'storage/retry-limit-exceeded') return 'No hay conexión a internet. Revisa tu red e inténtalo de nuevo.';
  if (code === 'storage/quota-exceeded') return 'Se llenó el espacio de Storage del proyecto. Revisa el plan en la consola de Firebase.';
  if (!code.startsWith('storage/') && message) return message;
  return 'Inténtalo de nuevo en unos minutos.';
}
