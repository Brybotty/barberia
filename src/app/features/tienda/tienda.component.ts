import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { CLIENTE } from '../../config/cliente';
import { Producto, descuento, precioMinimo, preciosVariables, sinExistencias, tieneOpciones } from '../../core/models/producto.model';
import { AjustesService } from '../../core/services/ajustes.service';
import { CarritoService } from '../../core/services/carrito.service';
import { ProductosService } from '../../core/services/productos.service';
import { RevelarDirective } from '../../shared/directives/revelar.directive';
import { ProductoImagenComponent } from '../../shared/components/producto-imagen/producto-imagen.component';
import { ProductoCardComponent } from './components/producto-card.component';
import { IconoComponent } from '../../shared/components/icono/icono.component';
import { ProductoDetalleComponent } from './components/producto-detalle.component';

type Orden = 'relevancia' | 'menor' | 'mayor' | 'nombre';

/** Minúsculas y sin tildes, para buscar "gel" y encontrar "Gél". */
const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

@Component({
  selector: 'app-tienda',
  standalone: true,
  imports: [CurrencyPipe, RevelarDirective, ProductoImagenComponent, ProductoCardComponent, ProductoDetalleComponent, IconoComponent],
  templateUrl: './tienda.component.html',
})
export class TiendaComponent {
  private carrito = inject(CarritoService);
  readonly ajustes = inject(AjustesService).ajustes;
  readonly cliente = CLIENTE;
  readonly aliada = CLIENTE.tienda?.aliada;

  /** null mientras carga. */
  readonly productos = toSignal(
    inject(ProductosService).visibles().pipe(
      catchError(error => {
        console.error('Error cargando productos', error);
        return of([] as Producto[]);
      }),
    ),
    { initialValue: null },
  );

  readonly destacados = computed(() => (this.productos() ?? []).filter(p => p.destacado).slice(0, 6));

  readonly categorias = computed(() => {
    const conteo = new Map<string, number>();
    for (const p of this.productos() ?? []) conteo.set(p.categoria, (conteo.get(p.categoria) ?? 0) + 1);
    return [...conteo].map(([nombre, cantidad]) => ({ nombre, cantidad }));
  });

  readonly categoria = signal<string | null>(null);
  readonly busqueda = signal('');
  readonly orden = signal<Orden>('relevancia');

  readonly filtrados = computed(() => {
    const termino = normalizar(this.busqueda().trim());
    const lista = (this.productos() ?? []).filter(p =>
      (!this.categoria() || p.categoria === this.categoria())
      && (!termino || normalizar(`${p.nombre} ${p.marca} ${p.categoria} ${p.descripcion}`).includes(termino)),
    );
    switch (this.orden()) {
      case 'menor': return lista.sort((a, b) => precioMinimo(a) - precioMinimo(b));
      case 'mayor': return lista.sort((a, b) => precioMinimo(b) - precioMinimo(a));
      case 'nombre': return lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      // Relevancia: primero lo disponible, en el orden definido en el panel.
      default: return lista.sort((a, b) => Number(sinExistencias(a)) - Number(sinExistencias(b)));
    }
  });

  readonly hayFiltros = computed(() => !!this.categoria() || !!this.busqueda().trim());

  /** Producto abierto en la ventana de detalle. */
  readonly seleccionado = signal<Producto | null>(null);

  // ---- Carrusel de destacados ----
  readonly slide = signal(0);
  private pausado = false;

  readonly precioMinimo = precioMinimo;
  readonly preciosVariables = preciosVariables;
  readonly descuento = descuento;
  readonly sinExistencias = sinExistencias;

  constructor() {
    const intervalo = setInterval(() => {
      const total = this.destacados().length;
      if (total > 1 && !this.pausado && !this.seleccionado()) this.slide.set((this.slide() + 1) % total);
    }, 6000);
    inject(DestroyRef).onDestroy(() => clearInterval(intervalo));

    // Si cambian los destacados (p. ej. el admin quita uno), no quedarse en un slide que ya no existe.
    effect(() => {
      if (this.slide() >= this.destacados().length) this.slide.set(0);
    });
  }

  irASlide(indice: number) {
    const total = this.destacados().length;
    this.slide.set((indice + total) % total);
  }

  pausar(valor: boolean) {
    this.pausado = valor;
  }

  /** Botón principal de una tarjeta: agrega directo o abre el detalle si hay que elegir opción. */
  agregar(producto: Producto) {
    if (tieneOpciones(producto)) {
      this.seleccionado.set(producto);
      return;
    }
    this.carrito.agregar(producto, null);
    this.carrito.abierto.set(true);
  }

  limpiarFiltros() {
    this.categoria.set(null);
    this.busqueda.set('');
  }
}
