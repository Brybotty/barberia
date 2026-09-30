import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { CLIENTE } from '../../../config/cliente';
import { Producto, STOCK_BAJO, precioMinimo, preciosVariables, sinExistencias, stockTotal } from '../../../core/models/producto.model';
import { existencias } from '../../../core/services/inventario.service';
import { AdminInventarioComponent } from '../admin-inventario/admin-inventario.component';
import { NotificationService } from '../../../core/services/notification.service';
import { ProductosService } from '../../../core/services/productos.service';
import { ProductoImagenComponent } from '../../../shared/components/producto-imagen/producto-imagen.component';
import { IconoComponent } from '../../../shared/components/icono/icono.component';
import { comprimirImagen } from '../../../shared/utils/imagen';
import { bloquearScroll } from '../../../shared/utils/scroll';

const CATEGORIAS_SUGERIDAS = ['Ceras', 'Polvos texturizantes', 'Talcos', 'Geles', 'Pomadas', 'Barba', 'Cuidado facial', 'Shampoo', 'Aftershave', 'Kits'];

@Component({
  selector: 'app-admin-productos',
  standalone: true,
  imports: [CurrencyPipe, NgClass, FormsModule, ProductoImagenComponent, AdminInventarioComponent, IconoComponent],
  template: `
    <div class="animate-in fade-in duration-500">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 class="text-3xl md:text-4xl font-black text-white">Tienda</h2>
          <p class="text-neutral-400 mt-2 text-lg">Productos, precios y existencias de la tienda en línea.</p>
        </div>
        <button (click)="nuevo()" class="bg-acento-500 hover:bg-acento-400 text-sobre-acento font-bold py-3 px-6 rounded-xl transition-all shadow-lg flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          Nuevo producto
        </button>
      </div>

      <div class="inline-flex p-1 rounded-xl bg-neutral-900 border border-neutral-800 mb-6">
        @for (v of vistas; track v.valor) {
          <button (click)="vista.set(v.valor)" class="px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                  [ngClass]="vista() === v.valor ? 'bg-acento-500 text-sobre-acento' : 'text-neutral-400 hover:text-white'">
            {{ v.texto }}
            @if (v.valor === 'inventario' && alertasStock() > 0) {
              <span class="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-black text-[11px] font-black">{{ alertasStock() }}</span>
            }
          </button>
        }
      </div>

      @if (vista() === 'inventario') {
        <app-admin-inventario />
      } @else {

      <!-- Resumen -->
      <div class="grid grid-cols-3 gap-3 md:gap-6 mb-6">
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 md:p-5">
          <p class="text-neutral-500 text-xs md:text-sm font-bold">Productos</p>
          <p class="text-2xl md:text-3xl font-black text-white">{{ productos().length }}</p>
        </div>
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 md:p-5">
          <p class="text-neutral-500 text-xs md:text-sm font-bold">En la tienda</p>
          <p class="text-2xl md:text-3xl font-black text-emerald-400">{{ visibles() }}</p>
        </div>
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 md:p-5">
          <p class="text-neutral-500 text-xs md:text-sm font-bold">Agotados</p>
          <p class="text-2xl md:text-3xl font-black text-red-400">{{ agotados() }}</p>
        </div>
      </div>

      <!-- Filtros -->
      <div class="flex flex-col sm:flex-row gap-3 mb-6">
        <input type="search" [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" placeholder="Buscar producto…" class="campo sm:max-w-xs">
        <select [ngModel]="categoria()" (ngModelChange)="categoria.set($event)" class="campo sm:max-w-[220px]">
          <option value="">Todas las categorías</option>
          @for (c of categorias(); track c) { <option [value]="c">{{ c }}</option> }
        </select>
      </div>

      <!-- Lista -->
      @if (cargando()) {
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          @for (i of [1, 2, 3]; track i) { <div class="bg-neutral-900 border border-neutral-800 rounded-2xl h-40 animate-pulse"></div> }
        </div>
      } @else if (productos().length === 0) {
        <div class="text-center py-16 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl">
          <p class="text-white font-bold text-lg mb-2">Aún no hay productos</p>
          <p class="mb-6">Agrega el primero: ceras, talcos, geles… Con foto, precio y, si quieres, opciones (tamaños, aromas).</p>
          <button (click)="nuevo()" class="bg-acento-500 hover:bg-acento-400 text-sobre-acento font-black py-3 px-6 rounded-xl transition-all">Agregar producto</button>
        </div>
      } @else {
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          @for (p of filtrados(); track p.id) {
            <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col gap-4 hover:border-neutral-700 transition-colors" [class.opacity-60]="!p.visible">
              <div class="flex gap-4">
                <app-producto-imagen class="w-20 h-20 rounded-xl shrink-0" [src]="p.imagen" [nombre]="p.nombre" tamanoInicial="2rem" />
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] font-black text-acento-500 uppercase tracking-widest truncate">{{ p.marca ? p.marca + ' · ' : '' }}{{ p.categoria }}</p>
                  <h4 class="font-bold text-white leading-snug line-clamp-2">{{ p.nombre }}</h4>
                  <p class="text-white font-black mt-1">
                    @if (preciosVariables(p)) { <span class="text-xs text-neutral-500 font-bold">Desde </span> }
                    {{ precioMinimo(p) | currency:'COP':'symbol-narrow':'1.0-0' }}
                    @if (p.opciones?.length) { <span class="text-xs text-neutral-500 font-bold"> · {{ p.opciones!.length }} opciones</span> }
                  </p>
                  @if (stockTotal(p); as total) {
                    <p class="text-xs font-bold mt-1" [ngClass]="total <= stockBajo ? 'text-amber-300' : 'text-neutral-400'">{{ total }} en inventario</p>
                  } @else if (p.controlStock) {
                    <p class="text-xs font-bold mt-1 text-red-400">Sin unidades</p>
                  }
                </div>
              </div>
              <div class="flex items-center justify-between gap-2 border-t border-neutral-800 pt-3">
                <div class="flex flex-wrap gap-1.5">
                  <button (click)="alternar(p, 'visible')" [title]="p.visible ? 'Ocultar de la tienda' : 'Mostrar en la tienda'"
                          class="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors"
                          [ngClass]="p.visible ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-neutral-500 border-neutral-700'">
                    {{ p.visible ? 'Visible' : 'Oculto' }}
                  </button>
                  <button (click)="alternar(p, 'destacado')" title="Aparece en el carrusel de la tienda"
                          class="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors"
                          [ngClass]="p.destacado ? 'text-amber-300 border-amber-500/30 bg-amber-500/10' : 'text-neutral-500 border-neutral-700'">
                    <app-icono nombre="estrella" [relleno]="p.destacado" class="w-3 h-3 -mt-px align-middle" /> Destacado
                  </button>
                  <button (click)="alternar(p, 'agotado')" title="Marcar sin existencias"
                          class="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors"
                          [ngClass]="p.agotado ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-neutral-500 border-neutral-700'">
                    {{ p.agotado ? 'Agotado' : 'En existencia' }}
                  </button>
                </div>
                <div class="flex gap-1.5 shrink-0">
                  <button (click)="editar(p)" class="text-blue-400 hover:text-white p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500 transition-colors" title="Editar">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                  </button>
                  <button (click)="eliminar(p)" class="text-red-400 hover:text-white p-2 rounded-lg bg-red-500/10 hover:bg-red-500 transition-colors" title="Eliminar">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                  </button>
                </div>
              </div>
            </div>
          } @empty {
            <p class="col-span-full text-center text-neutral-500 py-10">Ningún producto coincide con el filtro.</p>
          }
        </div>
      }
      }
    </div>

    <!-- ============ FORMULARIO ============ -->
    @if (form(); as f) {
      <div class="fixed inset-0 z-[80] flex justify-end">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" (click)="cerrar()"></div>
        <form (ngSubmit)="guardar()" class="relative w-full max-w-2xl h-full overflow-y-auto bg-neutral-950 border-l border-neutral-800 shadow-2xl animate-in slide-in-from-right duration-300" novalidate>
          <div class="sticky top-0 z-10 flex items-center justify-between px-6 h-16 bg-neutral-950/95 backdrop-blur border-b border-neutral-800">
            <h3 class="text-lg font-black text-white">{{ f.id ? 'Editar producto' : 'Nuevo producto' }}</h3>
            <button type="button" (click)="cerrar()" class="p-2 text-neutral-400 hover:text-white" aria-label="Cerrar">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <div class="p-6 space-y-6">
            <!-- Foto -->
            <div class="flex flex-col sm:flex-row gap-5">
              <app-producto-imagen class="w-40 h-40 rounded-2xl shrink-0 border border-neutral-800" [src]="f.imagen" [nombre]="f.nombre || '?'" tamanoInicial="4rem" />
              <div class="flex-1 space-y-3">
                <span class="etiqueta">Foto</span>
                <div class="flex flex-wrap gap-2">
                  <label class="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors">
                    {{ subiendo() ? 'Procesando…' : 'Subir foto' }}
                    <input type="file" accept="image/*" class="sr-only" (change)="subirFoto($event)" [disabled]="subiendo()">
                  </label>
                  @if (f.imagen) {
                    <button type="button" (click)="f.imagen = ''" class="text-sm font-bold text-red-400 hover:bg-red-500/10 px-4 py-2.5 rounded-xl transition-colors">Quitar</button>
                  }
                </div>
                <p class="text-xs text-neutral-500">Se reduce y comprime automáticamente. Mejor cuadrada y con buena luz.</p>
                @if (!f.imagen.startsWith('data:')) {
                  <input name="imagenUrl" [(ngModel)]="f.imagen" placeholder="…o pega un enlace a la imagen" class="campo">
                }
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label class="block sm:col-span-2">
                <span class="etiqueta">Nombre *</span>
                <input name="nombre" [(ngModel)]="f.nombre" required placeholder="Ej. Cera mate fijación fuerte" class="campo">
              </label>
              <label class="block">
                <span class="etiqueta">Marca</span>
                <input name="marca" [(ngModel)]="f.marca" placeholder="Ej. Cacique" class="campo">
              </label>
              <label class="block">
                <span class="etiqueta">Categoría *</span>
                <input name="categoria" [(ngModel)]="f.categoria" list="categorias-producto" required placeholder="Ej. Ceras" class="campo">
                <datalist id="categorias-producto">
                  @for (c of sugerencias(); track c) { <option [value]="c"></option> }
                </datalist>
              </label>
              <label class="block sm:col-span-2">
                <span class="etiqueta">Descripción</span>
                <textarea name="descripcion" [(ngModel)]="f.descripcion" rows="4" placeholder="Para qué sirve, cómo se usa, tamaño…" class="campo resize-none"></textarea>
              </label>
            </div>

            <!-- Inventario -->
            <div class="rounded-2xl border p-5 space-y-4" [ngClass]="f.controlStock ? 'border-acento-500/30' : 'border-neutral-800'">
              <label class="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" name="controlStock" [(ngModel)]="f.controlStock" class="mt-0.5 w-4 h-4 accent-neutral-300">
                <span>
                  <span class="block text-sm font-bold text-white">Controlar inventario</span>
                  <span class="block text-xs text-neutral-500">Las unidades se descuentan solas con cada venta y vuelven si el pedido se cancela. Cada cambio queda en el historial.</span>
                </span>
              </label>
              @if (f.controlStock) {
                @if (!f.opciones?.length) {
                  <label class="block max-w-[220px]">
                    <span class="etiqueta">Unidades en stock</span>
                    <input name="stock" type="number" min="0" step="1" [(ngModel)]="f.stock" class="campo">
                  </label>
                } @else {
                  <p class="text-xs text-neutral-400">Escribe las unidades de cada opción en la lista de abajo.</p>
                }
              }
            </div>

            <!-- Precio y opciones -->
            <div class="rounded-2xl border border-neutral-800 p-5 space-y-4">
              @if (!f.opciones?.length) {
                <div class="grid grid-cols-2 gap-4">
                  <label class="block">
                    <span class="etiqueta">Precio (COP) *</span>
                    <input name="precio" type="number" min="0" step="100" [(ngModel)]="f.precio" class="campo">
                  </label>
                  <label class="block">
                    <span class="etiqueta">Precio antes <span class="normal-case tracking-normal text-neutral-600">(oferta)</span></span>
                    <input name="precioAntes" type="number" min="0" step="100" [(ngModel)]="f.precioAntes" placeholder="Opcional" class="campo">
                  </label>
                </div>
              } @else {
                <label class="block max-w-[50%]">
                  <span class="etiqueta">Precio antes <span class="normal-case tracking-normal text-neutral-600">(oferta)</span></span>
                  <input name="precioAntes" type="number" min="0" step="100" [(ngModel)]="f.precioAntes" placeholder="Opcional" class="campo">
                </label>
              }

              <div>
                <div class="flex items-center justify-between mb-2">
                  <span class="etiqueta mb-0">Opciones</span>
                  <button type="button" (click)="agregarOpcion()" class="text-xs font-bold text-acento-500 hover:text-white transition-colors">+ Agregar opción</button>
                </div>
                @if (!f.opciones?.length) {
                  <p class="text-xs text-neutral-500">Úsalas si el producto viene en varias presentaciones (100 g / 200 g), fijaciones o aromas, cada una con su precio.</p>
                } @else {
                  <div class="space-y-2">
                    <div class="grid grid-cols-[1fr_110px_auto_auto] gap-2 text-[10px] font-extrabold uppercase tracking-widest text-neutral-600 px-1">
                      <span>Opción</span><span>Precio</span><span class="w-24">{{ f.controlStock ? 'Stock' : '' }}</span><span class="w-8"></span>
                    </div>
                    @for (o of f.opciones; track $index; let i = $index) {
                      <div class="grid grid-cols-[1fr_110px_auto_auto] gap-2 items-center">
                        <input [name]="'opcion-nombre-' + i" [(ngModel)]="o.nombre" placeholder="Ej. 150 g" class="campo">
                        <input [name]="'opcion-precio-' + i" type="number" min="0" step="100" [(ngModel)]="o.precio" placeholder="Precio" class="campo">
                        @if (f.controlStock) {
                          <input [name]="'opcion-stock-' + i" type="number" min="0" step="1" [(ngModel)]="o.stock" placeholder="Stock" title="Unidades en stock" class="campo w-24">
                        } @else {
                          <label class="flex items-center gap-1.5 text-xs font-bold text-neutral-400 cursor-pointer">
                            <input type="checkbox" [name]="'opcion-agotado-' + i" [(ngModel)]="o.agotado" class="accent-red-500"> Agotado
                          </label>
                        }
                        <button type="button" (click)="f.opciones!.splice(i, 1)" class="p-2 text-neutral-500 hover:text-red-400" aria-label="Quitar opción">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>

            <!-- Estado -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              @for (t of interruptores; track t.campo) {
                <label class="flex items-start gap-3 rounded-2xl border border-neutral-800 p-4 cursor-pointer hover:border-neutral-700 transition-colors">
                  <input type="checkbox" [name]="t.campo" [(ngModel)]="f[t.campo]" class="mt-0.5 w-4 h-4 accent-neutral-300">
                  <span>
                    <span class="block text-sm font-bold text-white">{{ t.titulo }}</span>
                    <span class="block text-xs text-neutral-500">{{ t.detalle }}</span>
                  </span>
                </label>
              }
            </div>

            <label class="block max-w-[200px]">
              <span class="etiqueta">Orden en el catálogo</span>
              <input name="orden" type="number" [(ngModel)]="f.orden" placeholder="999" class="campo">
              <span class="block text-xs text-neutral-500 mt-1.5">Menor número = aparece primero.</span>
            </label>

            @if (errorForm()) {
              <p class="text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{{ errorForm() }}</p>
            }
          </div>

          <div class="sticky bottom-0 flex justify-end gap-3 px-6 py-4 bg-neutral-950/95 backdrop-blur border-t border-neutral-800">
            <button type="button" (click)="cerrar()" class="px-5 py-3 text-sm font-bold text-neutral-400 hover:text-white">Cancelar</button>
            <button type="submit" [disabled]="guardando() || subiendo()" class="bg-acento-500 hover:bg-acento-400 disabled:opacity-50 text-sobre-acento font-black py-3 px-8 rounded-xl transition-all active:scale-95">
              {{ guardando() ? 'Guardando…' : 'Guardar producto' }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
})
export class AdminProductosComponent implements OnDestroy {
  private productosService = inject(ProductosService);
  private notificaciones = inject(NotificationService);

  readonly precioMinimo = precioMinimo;
  readonly stockTotal = stockTotal;
  readonly stockBajo = STOCK_BAJO;
  readonly vistas = [{ valor: 'productos', texto: 'Productos' }, { valor: 'inventario', texto: 'Inventario' }] as const;
  readonly vista = signal<'productos' | 'inventario'>('productos');
  /** El producto como estaba al abrir el formulario (para registrar los cambios de stock). */
  private original: Producto | null = null;
  readonly preciosVariables = preciosVariables;
  readonly interruptores = [
    { campo: 'visible', titulo: 'Visible', detalle: 'Se muestra en la tienda' },
    { campo: 'destacado', titulo: 'Destacado', detalle: 'Sale en el carrusel' },
    { campo: 'agotado', titulo: 'Agotado', detalle: 'No se puede comprar' },
  ] as const;

  private lista = toSignal(
    this.productosService.todos().pipe(
      catchError(error => {
        console.error('Error cargando productos', error);
        this.notificaciones.error('No se pudieron cargar los productos', 'Revisa que las reglas de Firestore estén desplegadas.');
        return of([] as Producto[]);
      }),
    ),
  );
  readonly cargando = computed(() => this.lista() === undefined);
  readonly productos = computed(() => this.lista() ?? []);
  readonly visibles = computed(() => this.productos().filter(p => p.visible).length);
  readonly agotados = computed(() => this.productos().filter(p => sinExistencias(p)).length);
  /** Opciones con stock bajo o agotadas (aviso en la pestaña Inventario). */
  readonly alertasStock = computed(() =>
    this.productos().flatMap(p => existencias(p)).filter(e => e.stock <= STOCK_BAJO).length,
  );
  readonly categorias = computed(() => [...new Set(this.productos().map(p => p.categoria))].sort());
  readonly sugerencias = computed(() => [...new Set([...this.categorias(), ...CATEGORIAS_SUGERIDAS])]);

  readonly busqueda = signal('');
  readonly categoria = signal('');
  readonly filtrados = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    return this.productos().filter(p =>
      (!this.categoria() || p.categoria === this.categoria())
      && (!termino || `${p.nombre} ${p.marca}`.toLowerCase().includes(termino)),
    );
  });

  /** Producto que se está editando (copia), o null con el formulario cerrado. */
  readonly form = signal<Producto | null>(null);
  readonly guardando = signal(false);
  readonly subiendo = signal(false);
  readonly errorForm = signal('');
  private liberarScroll?: () => void;

  nuevo() {
    this.abrir({
      nombre: '', descripcion: '', marca: CLIENTE.tienda?.aliada?.nombre ?? '', categoria: '', imagen: '',
      precio: 0, precioAntes: null, opciones: [], destacado: false, visible: true, agotado: false,
      controlStock: true, stock: 0,
    });
  }

  editar(producto: Producto) {
    this.abrir({ ...producto, opciones: (producto.opciones ?? []).map(o => ({ ...o })) }, producto);
  }

  private abrir(producto: Producto, original: Producto | null = null) {
    this.original = original;
    this.errorForm.set('');
    this.form.set(producto);
    this.liberarScroll ??= bloquearScroll();
  }

  cerrar() {
    this.form.set(null);
    this.liberarScroll?.();
    this.liberarScroll = undefined;
  }

  ngOnDestroy() {
    this.liberarScroll?.();
  }

  agregarOpcion() {
    const f = this.form()!;
    f.opciones = [...(f.opciones ?? []), { nombre: '', precio: f.precio || 0, agotado: false, stock: 0 }];
  }

  async subirFoto(evento: Event) {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    this.subiendo.set(true);
    try {
      this.form()!.imagen = await comprimirImagen(archivo);
    } catch (error: any) {
      this.notificaciones.error('No se pudo usar la foto', error?.message ?? '');
    } finally {
      this.subiendo.set(false);
    }
  }

  private validar(f: Producto): string {
    if (!f.nombre.trim()) return 'Escribe el nombre del producto.';
    if (!f.categoria.trim()) return 'Escribe la categoría.';
    const opciones = f.opciones ?? [];
    if (opciones.length === 0 && !(Number(f.precio) > 0)) return 'Escribe el precio.';
    if (opciones.some(o => !o.nombre.trim() || !(Number(o.precio) > 0))) return 'Cada opción necesita nombre y precio.';
    if (new Set(opciones.map(o => o.nombre.trim().toLowerCase())).size !== opciones.length) return 'Hay opciones con el mismo nombre.';
    if (f.controlStock) {
      const stocks = opciones.length ? opciones.map(o => o.stock) : [f.stock];
      if (stocks.some(x => x === null || x === undefined || (x as unknown) === '' || !(Number(x) >= 0) || !Number.isInteger(Number(x)))) {
        return 'Escribe las unidades en stock (número entero, 0 o más).';
      }
    }
    return '';
  }

  async guardar() {
    const f = this.form();
    if (!f) return;
    const error = this.validar(f);
    this.errorForm.set(error);
    if (error) return;

    // Pesos enteros: Wompi cobra en centavos y los precios con decimales no tienen sentido en COP.
    const opciones = (f.opciones ?? []).map(o => ({
      nombre: o.nombre.trim(), precio: Math.round(Number(o.precio)), agotado: !!o.agotado, stock: Number(o.stock) || 0,
    }));
    const producto: Producto = {
      ...f,
      nombre: f.nombre.trim(),
      marca: f.marca.trim(),
      categoria: f.categoria.trim(),
      descripcion: f.descripcion.trim(),
      opciones,
      // Con opciones, el precio base es el menor (para ordenar y filtrar).
      precio: opciones.length ? Math.min(...opciones.map(o => o.precio)) : Math.round(Number(f.precio)),
      precioAntes: Math.round(Number(f.precioAntes)) || null,
      orden: f.orden === null || f.orden === undefined || (f.orden as unknown) === '' ? 999 : Number(f.orden),
      stock: Number(f.stock) || 0,
    };

    this.guardando.set(true);
    try {
      await this.productosService.guardar(producto, this.original);
      this.notificaciones.exito('Producto guardado', producto.nombre);
      this.cerrar();
    } catch (e) {
      console.error(e);
      this.errorForm.set('No se pudo guardar. Revisa tu conexión (y que la foto no sea demasiado grande).');
    } finally {
      this.guardando.set(false);
    }
  }

  async alternar(producto: Producto, campo: 'visible' | 'destacado' | 'agotado') {
    try {
      await this.productosService.actualizar(producto.id!, { [campo]: !producto[campo] });
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo actualizar el producto');
    }
  }

  async eliminar(producto: Producto) {
    if (!confirm(`¿Eliminar "${producto.nombre}" de la tienda? Si solo quieres esconderlo, usa "Visible".`)) return;
    try {
      await this.productosService.eliminar(producto.id!);
    } catch (e) {
      console.error(e);
      this.notificaciones.error('No se pudo eliminar el producto');
    }
  }
}
