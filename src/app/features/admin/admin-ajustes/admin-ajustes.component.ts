import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';
import { CLIENTE } from '../../../config/cliente';
import { AjustesSitio } from '../../../core/models/ajustes.model';
import { AjustesService } from '../../../core/services/ajustes.service';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-admin-ajustes',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="animate-in fade-in duration-500 max-w-4xl">
      <div class="mb-8">
        <h2 class="text-3xl md:text-4xl font-black text-white">Ajustes</h2>
        <p class="text-neutral-400 mt-2 text-lg">Cursos, tienda, envíos y formas de pago.</p>
      </div>

      @if (form(); as f) {
        <form (ngSubmit)="guardar()" class="space-y-6" novalidate>

          <!-- ============ CURSOS ============ -->
          <section class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <div class="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 class="text-xl font-black text-white">Cursos</h3>
                <p class="text-sm text-neutral-400 mt-1">Botón en el menú y banner en el inicio que llevan a la página de tus cursos.</p>
              </div>
              <label class="flex items-center gap-2 cursor-pointer shrink-0">
                <span class="text-sm font-bold" [class]="f.cursos.activo ? 'text-emerald-400' : 'text-neutral-500'">{{ f.cursos.activo ? 'Visible' : 'Oculto' }}</span>
                <span class="relative">
                  <input type="checkbox" name="cursosActivo" [(ngModel)]="f.cursos.activo" class="sr-only peer">
                  <span class="block w-11 h-6 rounded-full bg-neutral-700 peer-checked:bg-emerald-500 transition-colors"></span>
                  <span class="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-5"></span>
                </span>
              </label>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label class="block md:col-span-2">
                <span class="etiqueta">Enlace de la página de cursos *</span>
                <input name="cursosUrl" type="url" [(ngModel)]="f.cursos.url" placeholder="https://…" class="campo">
                @if (f.cursos.url && !urlValida(f.cursos.url)) { <span class="texto-error">Debe empezar por https://</span> }
              </label>
              <label class="block">
                <span class="etiqueta">Título</span>
                <input name="cursosTitulo" [(ngModel)]="f.cursos.titulo" class="campo">
              </label>
              <label class="block">
                <span class="etiqueta">Texto del botón</span>
                <input name="cursosBoton" [(ngModel)]="f.cursos.textoBoton" placeholder="Ver cursos" class="campo">
              </label>
              <label class="block md:col-span-2">
                <span class="etiqueta">Descripción</span>
                <textarea name="cursosDescripcion" [(ngModel)]="f.cursos.descripcion" rows="3" class="campo resize-none"></textarea>
              </label>
            </div>
            @if (f.cursos.url && urlValida(f.cursos.url)) {
              <a [href]="f.cursos.url" target="_blank" rel="noopener" class="inline-flex items-center gap-1 mt-4 text-sm font-bold text-acento-500 hover:text-white">Probar enlace <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M7 17L17 7M8 7h9v9"/></svg></a>
            }
          </section>

          <!-- ============ TIENDA ============ -->
          <section class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <div class="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 class="text-xl font-black text-white">Tienda</h3>
                <p class="text-sm text-neutral-400 mt-1">Si la apagas, desaparece del menú y del inicio (los pedidos existentes se conservan).</p>
              </div>
              <label class="flex items-center gap-2 cursor-pointer shrink-0">
                <span class="text-sm font-bold" [class]="f.tienda.activa ? 'text-emerald-400' : 'text-neutral-500'">{{ f.tienda.activa ? 'Abierta' : 'Cerrada' }}</span>
                <span class="relative">
                  <input type="checkbox" name="tiendaActiva" [(ngModel)]="f.tienda.activa" class="sr-only peer">
                  <span class="block w-11 h-6 rounded-full bg-neutral-700 peer-checked:bg-emerald-500 transition-colors"></span>
                  <span class="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-5"></span>
                </span>
              </label>
            </div>

            <h4 class="etiqueta">Formas de entrega</h4>
            <div class="space-y-3 mb-6">
              <label class="flex items-center gap-3 rounded-xl border border-neutral-800 p-4 cursor-pointer">
                <input type="checkbox" name="recoger" [(ngModel)]="f.tienda.entrega.recoger" class="w-4 h-4 accent-neutral-300">
                <span class="flex-1"><span class="block text-sm font-bold text-white">Recoger en la barbería</span><span class="text-xs text-neutral-500">Gratis</span></span>
              </label>
              <div class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-neutral-800 p-4">
                <label class="flex items-center gap-3 flex-1 cursor-pointer">
                  <input type="checkbox" name="local" [(ngModel)]="f.tienda.entrega.local.activo" class="w-4 h-4 accent-neutral-300">
                  <span><span class="block text-sm font-bold text-white">Domicilio en {{ ciudad }}</span><span class="text-xs text-neutral-500">Permite contraentrega</span></span>
                </label>
                <label class="flex items-center gap-2 text-sm text-neutral-400">Costo
                  <input name="costoLocal" type="number" min="0" step="500" [(ngModel)]="f.tienda.entrega.local.costo" class="campo w-32">
                </label>
              </div>
              <div class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-neutral-800 p-4">
                <label class="flex items-center gap-3 flex-1 cursor-pointer">
                  <input type="checkbox" name="nacional" [(ngModel)]="f.tienda.entrega.nacional.activo" class="w-4 h-4 accent-neutral-300">
                  <span><span class="block text-sm font-bold text-white">Envío nacional</span><span class="text-xs text-neutral-500">Solo con pago en línea</span></span>
                </label>
                <label class="flex items-center gap-2 text-sm text-neutral-400">Costo
                  <input name="costoNacional" type="number" min="0" step="500" [(ngModel)]="f.tienda.entrega.nacional.costo" class="campo w-32">
                </label>
              </div>
              <label class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-neutral-300 pt-1">
                Envío gratis en compras desde
                <input name="gratisDesde" type="number" min="0" step="1000" [(ngModel)]="f.tienda.entrega.gratisDesde" class="campo sm:w-40">
                <span class="text-xs text-neutral-500">0 = nunca</span>
              </label>
            </div>

            <h4 class="etiqueta">Formas de pago</h4>
            <div class="space-y-3">
              <label class="flex items-start gap-3 rounded-xl border p-4 cursor-pointer" [class]="f.tienda.pagos.enLinea ? 'border-acento-500/40' : 'border-neutral-800'">
                <input type="checkbox" name="enLinea" [(ngModel)]="f.tienda.pagos.enLinea" class="mt-0.5 w-4 h-4 accent-neutral-300">
                <span class="flex-1">
                  <span class="block text-sm font-bold text-white">Pago en línea con Wompi</span>
                  <span class="block text-xs text-neutral-500">Tarjeta, PSE, Nequi y Botón Bancolombia. Actívalo solo cuando la cuenta de Wompi y las Cloud Functions estén configuradas (ver README), o los clientes verán un error al pagar.</span>
                </span>
              </label>
              <label class="flex items-center gap-3 rounded-xl border border-neutral-800 p-4 cursor-pointer">
                <input type="checkbox" name="contraentrega" [(ngModel)]="f.tienda.pagos.contraentrega" class="w-4 h-4 accent-neutral-300">
                <span><span class="block text-sm font-bold text-white">Contraentrega</span><span class="text-xs text-neutral-500">Solo en domicilios en {{ ciudad }}</span></span>
              </label>
              <label class="flex items-center gap-3 rounded-xl border border-neutral-800 p-4 cursor-pointer">
                <input type="checkbox" name="enTienda" [(ngModel)]="f.tienda.pagos.enTienda" class="w-4 h-4 accent-neutral-300">
                <span><span class="block text-sm font-bold text-white">Pago en la barbería</span><span class="text-xs text-neutral-500">Al recoger el pedido</span></span>
              </label>
            </div>
            @for (aviso of avisos(f); track aviso) {
              <p class="mt-4 text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">{{ aviso }}</p>
            }
          </section>

          <div class="sticky bottom-20 md:bottom-4 flex justify-end">
            <button type="submit" [disabled]="guardando()" class="bg-acento-500 hover:bg-acento-400 disabled:opacity-50 text-sobre-acento font-black py-3.5 px-10 rounded-xl shadow-2xl shadow-black transition-all active:scale-95">
              {{ guardando() ? 'Guardando…' : 'Guardar ajustes' }}
            </button>
          </div>
        </form>
      } @else {
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl h-96 animate-pulse"></div>
      }
    </div>
  `,
})
export class AdminAjustesComponent {
  private ajustesService = inject(AjustesService);
  private notificaciones = inject(NotificationService);
  readonly ciudad = CLIENTE.tienda?.ciudad ?? 'la ciudad';

  /** Copia editable. Se toma una sola vez para no pisar lo que el admin está escribiendo. */
  readonly form = signal<AjustesSitio | null>(null);
  readonly guardando = signal(false);

  constructor() {
    this.ajustesService.ajustes$.pipe(take(1), takeUntilDestroyed(inject(DestroyRef))).subscribe(ajustes =>
      this.form.set(structuredClone(ajustes)),
    );
  }

  urlValida(url: string): boolean {
    return /^https:\/\/[^\s]+\.[^\s]+/.test(url.trim());
  }

  /** Combinaciones que dejarían a un cliente sin poder comprar. */
  avisos(f: AjustesSitio): string[] {
    const { entrega, pagos } = f.tienda;
    const avisos: string[] = [];
    if (!entrega.recoger && !entrega.local.activo && !entrega.nacional.activo) avisos.push('Activa al menos una forma de entrega.');
    if (entrega.recoger && !pagos.enLinea && !pagos.enTienda) avisos.push('Quien elija recoger en la barbería no tendrá cómo pagar.');
    if (entrega.local.activo && !pagos.enLinea && !pagos.contraentrega) avisos.push(`Los domicilios en ${this.ciudad} no tendrán cómo pagarse.`);
    if (entrega.nacional.activo && !pagos.enLinea) avisos.push('El envío nacional necesita el pago en línea activo.');
    return avisos;
  }

  async guardar() {
    const f = this.form();
    if (!f) return;
    if (f.cursos.activo && !this.urlValida(f.cursos.url)) {
      this.notificaciones.error('Revisa el enlace de los cursos', 'Debe ser una dirección completa que empiece por https://');
      return;
    }
    const numero = (valor: unknown) => Math.max(0, Number(valor) || 0);
    const ajustes: AjustesSitio = {
      cursos: { ...f.cursos, url: f.cursos.url.trim(), titulo: f.cursos.titulo.trim(), descripcion: f.cursos.descripcion.trim(), textoBoton: f.cursos.textoBoton.trim() },
      tienda: {
        ...f.tienda,
        entrega: {
          recoger: f.tienda.entrega.recoger,
          local: { activo: f.tienda.entrega.local.activo, costo: numero(f.tienda.entrega.local.costo) },
          nacional: { activo: f.tienda.entrega.nacional.activo, costo: numero(f.tienda.entrega.nacional.costo) },
          gratisDesde: numero(f.tienda.entrega.gratisDesde),
        },
      },
    };
    this.guardando.set(true);
    try {
      await this.ajustesService.guardar(ajustes);
      this.notificaciones.exito('Ajustes guardados', 'Los cambios ya se ven en la página.');
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudieron guardar los ajustes', 'Revisa tu conexión y que las reglas de Firestore estén desplegadas.');
    } finally {
      this.guardando.set(false);
    }
  }
}
