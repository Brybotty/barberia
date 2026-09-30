import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { MovimientoInventario, NOMBRE_MOVIMIENTO, TipoMovimiento } from '../../../core/models/inventario.model';
import { Producto, STOCK_BAJO, precioDe } from '../../../core/models/producto.model';
import { InventarioService, existencias } from '../../../core/services/inventario.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ProductosService } from '../../../core/services/productos.service';
import { ProductoImagenComponent } from '../../../shared/components/producto-imagen/producto-imagen.component';

interface Fila {
  producto: Producto;
  opcion: string | null;
  stock: number;
  precio: number;
}

type Filtro = 'todos' | 'bajo' | 'agotados';
type TipoRegistro = 'entrada' | 'salida' | 'conteo';

@Component({
  selector: 'app-admin-inventario',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgClass, FormsModule, ProductoImagenComponent],
  template: `
    <!-- Resumen -->
    <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-6">
      <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 md:p-5">
        <p class="text-neutral-500 text-xs md:text-sm font-bold">Unidades en stock</p>
        <p class="text-2xl md:text-3xl font-black text-white">{{ resumen().unidades }}</p>
      </div>
      <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 md:p-5">
        <p class="text-neutral-500 text-xs md:text-sm font-bold">Valor a precio de venta</p>
        <p class="text-2xl md:text-3xl font-black text-white">{{ resumen().valor | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
      </div>
      <button (click)="filtro.set('bajo')" class="text-left bg-neutral-900 border rounded-2xl p-4 md:p-5 transition-colors" [ngClass]="resumen().bajo ? 'border-amber-500/40 hover:border-amber-500/70' : 'border-neutral-800'">
        <p class="text-neutral-500 text-xs md:text-sm font-bold">Stock bajo (≤ {{ stockBajo }})</p>
        <p class="text-2xl md:text-3xl font-black" [ngClass]="resumen().bajo ? 'text-amber-300' : 'text-white'">{{ resumen().bajo }}</p>
      </button>
      <button (click)="filtro.set('agotados')" class="text-left bg-neutral-900 border rounded-2xl p-4 md:p-5 transition-colors" [ngClass]="resumen().agotados ? 'border-red-500/40 hover:border-red-500/70' : 'border-neutral-800'">
        <p class="text-neutral-500 text-xs md:text-sm font-bold">Agotados</p>
        <p class="text-2xl md:text-3xl font-black" [ngClass]="resumen().agotados ? 'text-red-400' : 'text-white'">{{ resumen().agotados }}</p>
      </button>
    </div>

    <div class="grid grid-cols-1 2xl:grid-cols-[1fr_420px] gap-6 items-start">
      <!-- Existencias -->
      <section class="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-neutral-800">
          <div class="flex gap-1.5">
            @for (f of filtros; track f.valor) {
              <button (click)="filtro.set(f.valor)" class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors"
                      [ngClass]="filtro() === f.valor ? 'bg-acento-500 border-acento-500 text-sobre-acento' : 'border-neutral-800 text-neutral-400 hover:text-white'">{{ f.texto }}</button>
            }
          </div>
          <input type="search" [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" placeholder="Buscar…" class="campo sm:max-w-[220px] py-2">
        </div>

        <ul class="divide-y divide-neutral-800">
          @for (fila of filas(); track fila.producto.id + (fila.opcion ?? '')) {
            <li class="p-4">
              <!-- En pantallas angostas los controles bajan a su propia línea -->
              <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
                <app-producto-imagen class="w-12 h-12 rounded-xl shrink-0" [src]="fila.producto.imagen" [nombre]="fila.producto.nombre" tamanoInicial="1.25rem" />
                <div class="flex-1 min-w-[10rem]">
                  <p class="text-sm font-bold text-white truncate">{{ fila.producto.nombre }}</p>
                  <p class="text-xs text-neutral-500">{{ fila.opcion ?? 'Única presentación' }} · {{ fila.precio | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
                </div>
                <div class="flex items-center gap-1.5 ml-auto">
                  <button (click)="rapido(fila, -1)" [disabled]="fila.stock === 0 || ocupado()" title="Restar 1 (ajuste)" class="w-8 h-8 rounded-lg border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-600 disabled:opacity-30">−</button>
                  <span class="min-w-[3.25rem] text-center text-sm font-black px-2 py-1.5 rounded-lg border" [ngClass]="colorStock(fila.stock)">{{ fila.stock }}</span>
                  <button (click)="rapido(fila, 1)" [disabled]="ocupado()" title="Sumar 1 (ajuste)" class="w-8 h-8 rounded-lg border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-600 disabled:opacity-30">+</button>
                  <button (click)="abrirRegistro(fila)" class="ml-1 text-xs font-bold text-acento-500 hover:text-white px-2 py-1.5">Registrar</button>
                </div>
              </div>

              @if (registro?.clave === clave(fila)) {
                <form (ngSubmit)="guardarRegistro(fila)" class="mt-4 grid grid-cols-1 sm:grid-cols-[180px_110px_1fr_auto] gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <select name="tipo" [(ngModel)]="registro!.tipo" class="campo py-2">
                    <option value="entrada">Entrada de mercancía</option>
                    <option value="salida">Salida (daño, uso interno)</option>
                    <option value="conteo">Conteo físico (total real)</option>
                  </select>
                  <input name="cantidad" type="number" min="0" [(ngModel)]="registro!.cantidad" [placeholder]="registro!.tipo === 'conteo' ? 'Total' : 'Unidades'" class="campo py-2">
                  <input name="nota" [(ngModel)]="registro!.nota" placeholder="Nota (ej. pedido a Cacique #123)" class="campo py-2">
                  <div class="flex gap-2">
                    <button type="submit" [disabled]="ocupado()" class="bg-acento-500 hover:bg-acento-400 disabled:opacity-50 text-sobre-acento text-sm font-black px-4 rounded-xl">Guardar</button>
                    <button type="button" (click)="registro = null" class="text-sm font-bold text-neutral-500 hover:text-white px-2">Cancelar</button>
                  </div>
                </form>
              }
            </li>
          } @empty {
            <li class="p-10 text-center text-neutral-500 text-sm">
              {{ controlados().length === 0 ? 'Ningún producto controla inventario todavía. Actívalo abajo o al editar un producto.' : 'Nada en esta vista.' }}
            </li>
          }
        </ul>

        @if (sinControl().length > 0) {
          <details class="border-t border-neutral-800 group">
            <summary class="cursor-pointer list-none p-4 text-sm font-bold text-neutral-400 hover:text-white flex items-center justify-between">
              {{ sinControl().length }} producto(s) sin control de inventario
              <svg class="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </summary>
            <ul class="divide-y divide-neutral-800 border-t border-neutral-800">
              @for (p of sinControl(); track p.id) {
                <li class="flex items-center justify-between gap-3 px-4 py-3">
                  <span class="text-sm text-neutral-300 truncate">{{ p.nombre }}</span>
                  <button (click)="activarControl(p)" class="shrink-0 text-xs font-bold text-acento-500 hover:text-white">Controlar inventario</button>
                </li>
              }
            </ul>
          </details>
        }
      </section>

      <!-- Movimientos -->
      <section class="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        <h3 class="text-sm font-black text-white p-4 border-b border-neutral-800">Últimos movimientos</h3>
        <ul class="divide-y divide-neutral-800 max-h-[640px] overflow-y-auto">
          @for (m of movimientos(); track m.id) {
            <li class="px-4 py-3 flex items-start gap-3">
              <span class="mt-0.5 min-w-[3rem] text-center text-xs font-black px-2 py-1 rounded-lg" [ngClass]="m.cantidad > 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'">{{ m.cantidad > 0 ? '+' : '' }}{{ m.cantidad }}</span>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-white truncate">{{ m.producto }}@if (m.opcion) { <span class="text-neutral-500"> · {{ m.opcion }}</span> }</p>
                <p class="text-xs text-neutral-500">
                  {{ nombreMovimiento[m.tipo] }}@if (m.pedidoId) { · pedido #{{ m.pedidoId.slice(0, 6).toUpperCase() }} }@if (m.nota) { · {{ m.nota }} }
                </p>
                <p class="text-[11px] text-neutral-600 mt-0.5">{{ m.fecha | date:'d MMM, h:mm a' }} · {{ m.usuario }} · quedan {{ m.stockResultante }}</p>
              </div>
            </li>
          } @empty {
            <li class="p-10 text-center text-neutral-500 text-sm">Aún no hay movimientos.</li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class AdminInventarioComponent {
  private productosService = inject(ProductosService);
  private inventario = inject(InventarioService);
  private notificaciones = inject(NotificationService);

  readonly stockBajo = STOCK_BAJO;
  readonly nombreMovimiento = NOMBRE_MOVIMIENTO;
  readonly filtros: { valor: Filtro; texto: string }[] = [
    { valor: 'todos', texto: 'Todos' },
    { valor: 'bajo', texto: 'Stock bajo' },
    { valor: 'agotados', texto: 'Agotados' },
  ];

  private productos = toSignal(this.productosService.todos().pipe(catchError(() => of([] as Producto[]))), { initialValue: [] });
  readonly movimientos = toSignal(
    this.inventario.movimientos().pipe(
      catchError(error => {
        console.error('Error cargando movimientos', error);
        return of([] as MovimientoInventario[]);
      }),
    ),
    { initialValue: [] },
  );

  readonly controlados = computed(() => this.productos().filter(p => p.controlStock));
  readonly sinControl = computed(() => this.productos().filter(p => !p.controlStock));
  private todasLasFilas = computed<Fila[]>(() =>
    this.controlados().flatMap(producto =>
      existencias(producto).map(e => ({ producto, opcion: e.opcion, stock: e.stock, precio: precioDe(producto, e.opcion) ?? 0 })),
    ),
  );

  readonly filtro = signal<Filtro>('todos');
  readonly busqueda = signal('');
  readonly filas = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    return this.todasLasFilas()
      .filter(f => this.filtro() === 'todos' || (this.filtro() === 'bajo' ? f.stock > 0 && f.stock <= STOCK_BAJO : f.stock === 0))
      .filter(f => !termino || `${f.producto.nombre} ${f.opcion ?? ''}`.toLowerCase().includes(termino))
      .sort((a, b) => a.stock - b.stock);
  });

  readonly resumen = computed(() => {
    const filas = this.todasLasFilas();
    return {
      unidades: filas.reduce((t, f) => t + f.stock, 0),
      valor: filas.reduce((t, f) => t + f.stock * f.precio, 0),
      bajo: filas.filter(f => f.stock > 0 && f.stock <= STOCK_BAJO).length,
      agotados: filas.filter(f => f.stock === 0).length,
    };
  });

  readonly ocupado = signal(false);
  /** Formulario abierto para registrar un movimiento en una fila. */
  registro: { clave: string; tipo: TipoRegistro; cantidad: number | null; nota: string } | null = null;

  clave(fila: Fila): string {
    return `${fila.producto.id}|${fila.opcion ?? ''}`;
  }

  colorStock(stock: number): string {
    if (stock === 0) return 'bg-red-500/10 text-red-300 border-red-500/25';
    if (stock <= STOCK_BAJO) return 'bg-amber-500/10 text-amber-300 border-amber-500/25';
    return 'bg-neutral-950 text-white border-neutral-800';
  }

  abrirRegistro(fila: Fila) {
    this.registro = { clave: this.clave(fila), tipo: 'entrada', cantidad: null, nota: '' };
  }

  rapido(fila: Fila, cantidad: number) {
    return this.mover(fila, cantidad, 'ajuste', 'Ajuste rápido');
  }

  async guardarRegistro(fila: Fila) {
    const r = this.registro;
    const cantidad = Math.round(Number(r?.cantidad));
    if (!r || !Number.isFinite(cantidad) || cantidad < 0 || (r.tipo !== 'conteo' && cantidad === 0)) {
      this.notificaciones.error('Escribe una cantidad válida');
      return;
    }
    const [delta, tipo]: [number, TipoMovimiento] =
      r.tipo === 'entrada' ? [cantidad, 'entrada'] : r.tipo === 'salida' ? [-cantidad, 'salida'] : [cantidad - fila.stock, 'ajuste'];
    const nota = r.nota.trim() || (r.tipo === 'conteo' ? 'Conteo físico' : '');
    if (await this.mover(fila, delta, tipo, nota)) this.registro = null;
  }

  private async mover(fila: Fila, cantidad: number, tipo: TipoMovimiento, nota: string): Promise<boolean> {
    if (cantidad === 0) return true;
    this.ocupado.set(true);
    try {
      await this.inventario.ajustar(fila.producto.id!, fila.opcion, cantidad, tipo, nota);
      return true;
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo actualizar el inventario');
      return false;
    } finally {
      this.ocupado.set(false);
    }
  }

  async activarControl(producto: Producto) {
    try {
      await this.productosService.actualizar(producto.id!, {
        controlStock: true,
        stock: 0,
        opciones: (producto.opciones ?? []).map(o => ({ ...o, stock: 0 })),
      });
      this.notificaciones.exito('Inventario activado', `Registra la entrada de unidades de ${producto.nombre}.`);
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo activar el inventario');
    }
  }
}
