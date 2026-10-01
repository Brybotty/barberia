import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';
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
        <p class="text-neutral-400 mt-2 text-lg">El botón y la sección de cursos de la página.</p>
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

  async guardar() {
    const f = this.form();
    if (!f) return;
    if (f.cursos.activo && !this.urlValida(f.cursos.url)) {
      this.notificaciones.error('Revisa el enlace de los cursos', 'Debe ser una dirección completa que empiece por https://');
      return;
    }
    const ajustes: AjustesSitio = {
      cursos: { ...f.cursos, url: f.cursos.url.trim(), titulo: f.cursos.titulo.trim(), descripcion: f.cursos.descripcion.trim(), textoBoton: f.cursos.textoBoton.trim() },
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
