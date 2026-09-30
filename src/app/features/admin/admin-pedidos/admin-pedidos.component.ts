import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import {
  EstadoPedido, NOMBRE_ENTREGA, NOMBRE_METODO, Pedido, codigoPedido, etiquetaEstado, etiquetaPago,
} from '../../../core/models/pedido.model';
import { NotificationService } from '../../../core/services/notification.service';
import { PedidosService } from '../../../core/services/pedidos.service';
import { enlaceWhatsApp } from '../../../core/utils/colombia';
import { COLOR_ESTADO, COLOR_PAGO } from '../../tienda/pedido-estilos';

type Filtro = 'activos' | EstadoPedido | 'todos';

const ESTADOS: EstadoPedido[] = ['pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado'];

@Component({
  selector: 'app-admin-pedidos',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgClass],
  template: `
    <div class="animate-in fade-in duration-500">
      <div class="mb-8">
        <h2 class="text-3xl md:text-4xl font-black text-white">Pedidos</h2>
        <p class="text-neutral-400 mt-2 text-lg">Compras de la tienda: confirma, despacha y marca como entregadas.</p>
      </div>

      <!-- Resumen -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-8">
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden">
          <div class="absolute -right-6 -top-6 w-24 h-24 bg-amber-500/10 rounded-full"></div>
          <p class="text-neutral-400 font-bold mb-2">Nuevos</p>
          <h3 class="text-4xl font-black text-white">{{ resumen().nuevos }}</h3>
          <p class="text-neutral-500 text-sm font-bold mt-2">por confirmar</p>
        </div>
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden">
          <div class="absolute -right-6 -top-6 w-24 h-24 bg-sky-500/10 rounded-full"></div>
          <p class="text-neutral-400 font-bold mb-2">En curso</p>
          <h3 class="text-4xl font-black text-white">{{ resumen().enCurso }}</h3>
          <p class="text-neutral-500 text-sm font-bold mt-2">confirmados o en camino</p>
        </div>
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden">
          <div class="absolute -right-6 -top-6 w-24 h-24 bg-emerald-500/10 rounded-full"></div>
          <p class="text-neutral-400 font-bold mb-2">Vendido este mes</p>
          <h3 class="text-4xl font-black text-white">{{ resumen().ventasMes | currency:'COP':'symbol-narrow':'1.0-0' }}</h3>
          <p class="text-emerald-400 text-sm font-bold mt-2">{{ resumen().pagadosMes }} pedidos pagados</p>
        </div>
      </div>

      <!-- Filtros -->
      <div class="flex gap-2 overflow-x-auto pb-2 mb-4">
        @for (f of filtros; track f.valor) {
          <button (click)="filtro.set(f.valor)" class="shrink-0 px-4 py-2 rounded-xl text-sm font-bold border transition-colors"
                  [ngClass]="filtro() === f.valor ? 'bg-acento-500 border-acento-500 text-sobre-acento' : 'border-neutral-800 text-neutral-400 hover:text-white'">
            {{ f.texto }} <span class="opacity-60">{{ contar(f.valor) }}</span>
          </button>
        }
      </div>

      @if (pedidos() === undefined) {
        <div class="space-y-3">
          @for (i of [1, 2, 3]; track i) { <div class="bg-neutral-900 border border-neutral-800 rounded-2xl h-24 animate-pulse"></div> }
        </div>
      } @else {
        <div class="space-y-3">
          @for (p of filtrados(); track p.id) {
            <div class="bg-neutral-900 border rounded-2xl overflow-hidden transition-colors"
                 [ngClass]="p.estado === 'pendiente' ? 'border-amber-500/30' : 'border-neutral-800'">
              <!-- Fila -->
              <button type="button" (click)="alternarAbierto(p.id!)" class="w-full text-left p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-6 hover:bg-neutral-800/40 transition-colors">
                <div class="flex-1 min-w-0">
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="font-black text-white">#{{ codigo(p) }}</span>
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded-full border" [ngClass]="colorEstado[p.estado]">{{ etiquetaEstado(p) }}</span>
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded-full border" [ngClass]="colorPago[p.pago.estado]">{{ etiquetaPago(p.pago) }}</span>
                  </div>
                  <p class="text-sm text-white font-bold">{{ p.cliente.nombre }} <span class="text-neutral-500 font-normal">· {{ nombreEntrega[p.entrega.tipo] }} · {{ nombreMetodo[p.pago.metodo] }}</span></p>
                  <p class="text-xs text-neutral-500 mt-0.5">{{ p.creadoEn | date:'EEE d MMM, h:mm a' }} · {{ unidades(p) }} producto(s)</p>
                </div>
                <div class="flex items-center justify-between md:justify-end gap-4">
                  <span class="text-xl font-black text-white">{{ p.total | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                  <svg class="w-5 h-5 text-neutral-500 transition-transform" [class.rotate-180]="abierto() === p.id" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </div>
              </button>

              <!-- Detalle -->
              @if (abierto() === p.id) {
                <div class="border-t border-neutral-800 p-5 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
                  <div class="lg:col-span-2">
                    <p class="etiqueta">Productos</p>
                    <ul class="divide-y divide-neutral-800 border border-neutral-800 rounded-xl mb-4">
                      @for (item of p.items; track $index) {
                        <li class="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                          <span class="text-white"><strong>{{ item.cantidad }}×</strong> {{ item.nombre }}@if (item.opcion) { <span class="text-neutral-500"> · {{ item.opcion }}</span> }</span>
                          <span class="text-neutral-300 font-bold shrink-0">{{ item.precio * item.cantidad | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                        </li>
                      }
                      <li class="flex justify-between px-4 py-2 text-sm text-neutral-400"><span>Envío</span><span>{{ p.envio | currency:'COP':'symbol-narrow':'1.0-0' }}</span></li>
                      <li class="flex justify-between px-4 py-3 text-white font-black"><span>Total</span><span>{{ p.total | currency:'COP':'symbol-narrow':'1.0-0' }}</span></li>
                    </ul>
                    @if (p.entrega.notas) {
                      <p class="etiqueta">Notas del cliente</p>
                      <p class="text-sm text-neutral-300 bg-neutral-950 border border-neutral-800 rounded-xl p-3">{{ p.entrega.notas }}</p>
                    }
                  </div>

                  <div class="space-y-5 text-sm">
                    <div>
                      <p class="etiqueta">Cliente</p>
                      <p class="text-white font-bold">{{ p.cliente.nombre }}</p>
                      <p class="text-neutral-400">{{ p.cliente.email }}</p>
                      @if (p.cliente.documento) { <p class="text-neutral-400">CC {{ p.cliente.documento }}</p> }
                      <a [href]="whatsapp(p)" target="_blank" rel="noopener" class="mt-2 inline-flex items-center gap-2 text-xs font-bold text-white bg-[#25D366]/90 hover:bg-[#25D366] px-3 py-2 rounded-lg transition-colors">WhatsApp {{ p.cliente.telefono }}</a>
                    </div>
                    <div>
                      <p class="etiqueta">Entrega</p>
                      <p class="text-white font-bold">{{ nombreEntrega[p.entrega.tipo] }}</p>
                      @if (p.entrega.tipo !== 'recoger') {
                        <p class="text-neutral-400">{{ p.entrega.direccion }}{{ p.entrega.barrio ? ', ' + p.entrega.barrio : '' }}</p>
                        <p class="text-neutral-400">{{ p.entrega.ciudad }}, {{ p.entrega.departamento }}</p>
                      }
                    </div>
                    <div>
                      <p class="etiqueta">Pago</p>
                      <p class="text-white">{{ nombreMetodo[p.pago.metodo] }} · <span [ngClass]="p.pago.estado === 'aprobado' ? 'text-emerald-400' : 'text-neutral-400'">{{ etiquetaPago(p.pago) }}</span></p>
                      @if (p.pago.transaccionId) {
                        <p class="text-xs text-neutral-500 mt-1">Wompi {{ p.pago.transaccionId }}{{ p.pago.medio ? ' · ' + p.pago.medio : '' }}</p>
                      }
                      @if (p.pago.metodo !== 'en-linea' && p.pago.estado !== 'aprobado' && p.estado !== 'cancelado') {
                        <button (click)="marcarPagado(p)" class="mt-2 text-xs font-bold text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 px-3 py-2 rounded-lg transition-colors">Marcar como pagado</button>
                      }
                    </div>
                    <div>
                      <p class="etiqueta">Cambiar estado</p>
                      @if (p.estado === 'cancelado') {
                        <p class="text-neutral-500">Cancelado{{ p.stockDevuelto ? ': las unidades volvieron al inventario.' : '.' }}</p>
                      } @else {
                        <div class="flex flex-wrap gap-1.5">
                          @for (e of estados; track e) {
                            <button (click)="cambiarEstado(p, e)" [disabled]="p.estado === e || ocupado() === p.id || (e === 'cancelado' && p.estado === 'entregado')"
                                    class="text-xs font-bold px-3 py-2 rounded-lg border transition-colors disabled:cursor-default disabled:opacity-60"
                                    [ngClass]="p.estado === e ? colorEstado[e] : 'border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600'">
                              {{ e === 'cancelado' ? 'Cancelar pedido' : etiquetaEstado({ estado: e, entrega: p.entrega }) }}
                            </button>
                          }
                        </div>
                        <p class="text-[11px] text-neutral-600 mt-2">Al cancelar, las unidades vuelven al inventario.</p>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          } @empty {
            <div class="text-center py-16 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl">No hay pedidos en esta vista.</div>
          }
        </div>
      }
    </div>
  `,
})
export class AdminPedidosComponent {
  private pedidosService = inject(PedidosService);
  private notificaciones = inject(NotificationService);

  readonly colorEstado = COLOR_ESTADO;
  readonly colorPago = COLOR_PAGO;
  readonly nombreEntrega = NOMBRE_ENTREGA;
  readonly nombreMetodo = NOMBRE_METODO;
  readonly etiquetaEstado = etiquetaEstado;
  readonly etiquetaPago = etiquetaPago;
  readonly codigo = codigoPedido;
  readonly estados = ESTADOS;
  readonly filtros: { valor: Filtro; texto: string }[] = [
    { valor: 'activos', texto: 'Por atender' },
    { valor: 'pendiente', texto: 'Nuevos' },
    { valor: 'confirmado', texto: 'Confirmados' },
    { valor: 'enviado', texto: 'En camino / listos' },
    { valor: 'entregado', texto: 'Entregados' },
    { valor: 'cancelado', texto: 'Cancelados' },
    { valor: 'todos', texto: 'Todos' },
  ];

  readonly pedidos = toSignal(
    this.pedidosService.todos().pipe(
      catchError(error => {
        console.error('Error cargando pedidos', error);
        this.notificaciones.error('No se pudieron cargar los pedidos', 'Revisa que las reglas de Firestore estén desplegadas.');
        return of([] as Pedido[]);
      }),
    ),
  );

  readonly filtro = signal<Filtro>('activos');
  /** Pedido con un cambio en curso (evita dobles clics). */
  readonly ocupado = signal<string | null>(null);
  readonly abierto = signal<string | null>(null);

  readonly filtrados = computed(() => (this.pedidos() ?? []).filter(p => this.coincide(p, this.filtro())));

  readonly resumen = computed(() => {
    const pedidos = this.pedidos() ?? [];
    const mes = new Date().toISOString().slice(0, 7);
    const pagadosMes = pedidos.filter(p => p.creadoEn.startsWith(mes) && p.pago.estado === 'aprobado' && p.estado !== 'cancelado');
    return {
      nuevos: pedidos.filter(p => p.estado === 'pendiente').length,
      enCurso: pedidos.filter(p => p.estado === 'confirmado' || p.estado === 'enviado').length,
      ventasMes: pagadosMes.reduce((total, p) => total + p.total, 0),
      pagadosMes: pagadosMes.length,
    };
  });

  private coincide(p: Pedido, filtro: Filtro): boolean {
    if (filtro === 'todos') return true;
    if (filtro === 'activos') return ['pendiente', 'confirmado', 'enviado'].includes(p.estado);
    return p.estado === filtro;
  }

  contar(filtro: Filtro): number {
    return (this.pedidos() ?? []).filter(p => this.coincide(p, filtro)).length;
  }

  alternarAbierto(id: string) {
    this.abierto.set(this.abierto() === id ? null : id);
  }

  unidades(p: Pedido): number {
    return p.items.reduce((total, i) => total + i.cantidad, 0);
  }

  whatsapp(p: Pedido): string {
    return enlaceWhatsApp(p.cliente.telefono, `Hola ${p.cliente.nombre.split(' ')[0]}, te escribimos por tu pedido #${this.codigo(p)}.`);
  }

  async cambiarEstado(p: Pedido, estado: EstadoPedido) {
    if (estado === 'cancelado' && !confirm(`¿Cancelar el pedido #${this.codigo(p)}? Las unidades vuelven al inventario.`)) return;
    this.ocupado.set(p.id!);
    try {
      // Cancelar pasa por el servidor para devolver el inventario en la misma operación.
      if (estado === 'cancelado') await this.pedidosService.cancelar(p.id!);
      else await this.pedidosService.actualizar(p.id!, { estado });
    } catch (e: any) {
      console.error(e);
      this.notificaciones.error('No se pudo cambiar el estado', e?.code === 'functions/failed-precondition' ? e.message : '');
    } finally {
      this.ocupado.set(null);
    }
  }

  async marcarPagado(p: Pedido) {
    try {
      await this.pedidosService.actualizar(p.id!, { 'pago.estado': 'aprobado', 'pago.actualizadoEn': new Date().toISOString() });
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo marcar como pagado');
    }
  }
}
