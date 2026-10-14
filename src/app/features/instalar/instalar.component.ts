import { Component, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CLIENTE } from '../../config/cliente';
import { InstalacionService } from '../../core/services/instalacion.service';
import { NotificationService } from '../../core/services/notification.service';
import { IconoComponent } from '../../shared/components/icono/icono.component';

/**
 * "Instalar la app": deja la página con su ícono en la pantalla de inicio del celular.
 * En Android se instala con un toque cuando el navegador lo permite; en iPhone son siempre tres pasos a mano
 * (Apple no deja otra forma), y aquí se muestran. El enlace de esta página es el que se comparte.
 */
@Component({
  selector: 'app-instalar',
  standalone: true,
  imports: [NgClass, RouterLink, IconoComponent],
  template: `
    <section class="relative overflow-hidden px-4 py-12 sm:py-20">
      <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgb(var(--detalle-500)/0.10),transparent_60%)]"></div>

      <div class="relative mx-auto max-w-xl">
        <div class="text-center">
          @if (cliente.logo) {
            <img [src]="cliente.logo" alt="" width="96" height="96" class="mx-auto h-20 w-20 rounded-3xl border border-white/10 shadow-2xl shadow-black">
          }
          <p class="rotulo rotulo-centro mt-6">La app</p>
          <h1 class="mt-3 font-display text-3xl font-black tracking-tight text-white text-balance sm:text-4xl">{{ cliente.nombre }} en tu celular</h1>
          <p class="mx-auto mt-3 max-w-md text-neutral-400">
            Queda con su ícono en la pantalla de inicio, como cualquier app: reservas en dos toques, sin buscar la página.
            No pasa por la tienda de aplicaciones ni ocupa espacio.
          </p>
        </div>

        @if (instalacion.instalada()) {
          <div class="placa mt-10 p-7 text-center" role="status">
            <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <app-icono nombre="check" class="h-6 w-6" [grosor]="2.2" />
            </span>
            <h2 class="mt-4 text-lg font-black text-white">Ya la tienes instalada</h2>
            <p class="mt-1 text-sm text-neutral-400">Búscala en tu pantalla de inicio con el ícono de {{ cliente.nombre }}.</p>
            <a routerLink="/reservar" class="boton-acento relative z-[1] mt-6">Reservar turno</a>
          </div>
        } @else {
          <!-- Cada celular se instala distinto: se abre en el que tiene el visitante y puede ver el otro -->
          <div class="mt-10 flex justify-center">
            <div class="flex rounded-xl border border-white/10 p-1" role="group" aria-label="Tu celular">
              @for (opcion of sistemas; track opcion.valor) {
                <button type="button" (click)="sistema.set(opcion.valor)" [attr.aria-pressed]="sistema() === opcion.valor"
                        class="min-h-10 rounded-lg px-5 text-sm font-bold transition-colors"
                        [ngClass]="sistema() === opcion.valor ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'">{{ opcion.nombre }}</button>
              }
            </div>
          </div>

          @if (instalacion.dispositivo.dentroDeOtraApp) {
            <p class="mt-6 rounded-2xl border border-detalle-400/30 bg-detalle-500/[0.06] p-4 text-sm leading-relaxed text-detalle-200" role="status">
              Estás viendo esta página dentro de otra app (Instagram, Facebook…) y desde aquí no se puede instalar.
              Ábrela en {{ sistema() === 'ios' ? 'Safari' : 'Chrome' }}: toca el menú de arriba y elige "Abrir en el navegador", o copia el enlace y pégalo allá.
            </p>
          }

          @if (sistema() === 'android') {
            <div class="placa mt-6 p-6 sm:p-8">
              @if (instalacion.conUnToque()) {
                <button type="button" (click)="instalar()" class="boton-acento relative z-[1] w-full !py-4 !text-base">
                  Instalar la app
                  <app-icono nombre="descargar" class="h-5 w-5" [grosor]="2" />
                </button>
                <p class="ayuda text-center">Tu celular te pide confirmar y queda instalada.</p>
              } @else {
                <h2 class="text-base font-black text-white">Desde el menú de tu navegador</h2>
                <ol class="mt-4 space-y-4">
                  <li class="paso"><span class="paso-numero">I</span><span>Toca el menú <strong class="text-white">⋮</strong> de Chrome (arriba a la derecha).</span></li>
                  <li class="paso"><span class="paso-numero">II</span><span>Elige <strong class="text-white">Instalar aplicación</strong> (en algunos celulares dice <strong class="text-white">Agregar a pantalla principal</strong>).</span></li>
                  <li class="paso"><span class="paso-numero">III</span><span>Confirma con <strong class="text-white">Instalar</strong>.</span></li>
                </ol>
                <p class="ayuda !mt-5">Cuando tu navegador lo permita, aquí mismo aparece el botón para instalarla con un toque.</p>
              }
            </div>
          } @else {
            <div class="placa mt-6 p-6 sm:p-8">
              <h2 class="text-base font-black text-white">En iPhone son tres pasos, una sola vez</h2>
              <ol class="mt-4 space-y-4">
                <li class="paso">
                  <span class="paso-numero">I</span>
                  <span>Con esta página abierta en <strong class="text-white">Safari</strong>, toca <strong class="text-white">Compartir</strong>
                    <app-icono nombre="compartir" class="mx-0.5 inline-block h-5 w-5 align-text-bottom text-detalle-200" [grosor]="1.8" /> (abajo, en el centro).</span>
                </li>
                <li class="paso">
                  <span class="paso-numero">II</span>
                  <span>Baja en la lista y elige <span class="whitespace-nowrap"><strong class="text-white">Agregar a inicio</strong>
                    <app-icono nombre="agregar" class="mx-0.5 inline-block h-5 w-5 align-text-bottom text-detalle-200" [grosor]="1.8" />.</span></span>
                </li>
                <li class="paso"><span class="paso-numero">III</span><span>Toca <strong class="text-white">Agregar</strong> (arriba a la derecha).</span></li>
              </ol>
              <p class="ayuda !mt-5">Apple no deja que una página se instale sola: en iPhone siempre es así. Si no ves "Agregar a inicio", abre este enlace en Safari.</p>
            </div>
          }

          <div class="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button type="button" (click)="copiarEnlace()" class="boton-linea boton-chico">
              <app-icono nombre="compartir" class="h-4 w-4" [grosor]="2" /> Copiar el enlace para compartir
            </button>
            <a routerLink="/reservar" class="enlace-toque text-sm font-bold text-detalle-200 hover:text-white">Reservar sin instalar</a>
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    .paso {
      display: flex;
      align-items: flex-start;
      gap: 0.875rem;
      font-size: 0.9375rem;
      line-height: 1.5;
      color: rgb(212 212 212);
    }
    /* El número del paso en romanos, como los pasos de la reserva. */
    .paso-numero {
      display: grid;
      height: 2rem;
      width: 2rem;
      flex-shrink: 0;
      place-items: center;
      border-radius: 9999px;
      border: 1px solid rgb(var(--detalle-400) / 0.5);
      font-family: var(--fuente-display);
      font-size: 0.75rem;
      font-weight: 700;
      color: rgb(var(--detalle-200));
    }
  `,
})
export class InstalarComponent {
  readonly cliente = CLIENTE;
  readonly instalacion = inject(InstalacionService);
  private notificaciones = inject(NotificationService);

  readonly sistemas = [{ valor: 'android', nombre: 'Android' }, { valor: 'ios', nombre: 'iPhone' }] as const;
  /** Se abre en el del visitante; en un computador, en el de Android (Chrome también instala ahí). */
  readonly sistema = signal<'android' | 'ios'>(this.instalacion.dispositivo.sistema === 'ios' ? 'ios' : 'android');

  async instalar() {
    if (await this.instalacion.instalar()) {
      this.notificaciones.exito('App instalada', `Ya tienes ${this.cliente.nombre} en tu pantalla de inicio.`);
    }
  }

  async copiarEnlace() {
    const enlace = `${location.origin}/instalar`;
    try {
      await navigator.clipboard.writeText(enlace);
      this.notificaciones.exito('Enlace copiado', 'Pégalo en WhatsApp o donde quieras compartirlo.');
    } catch {
      // Sin permiso para el portapapeles (algunos navegadores dentro de otras apps): se muestra para copiarlo a mano.
      this.notificaciones.mostrar('Copia este enlace', enlace);
    }
  }
}
