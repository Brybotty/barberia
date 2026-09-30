import { Component, computed, inject, signal } from '@angular/core';
import { AsyncPipe, NgClass } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { ServiceCardComponent } from '../../shared/components/service-card/service-card.component';
import { RevelarDirective } from '../../shared/directives/revelar.directive';
import { Servicio } from '../../core/models/servicio.model';
import { Producto, sinExistencias, tieneOpciones } from '../../core/models/producto.model';
import { ServiciosService } from '../../core/services/servicios.service';
import { ProductosService } from '../../core/services/productos.service';
import { AjustesService } from '../../core/services/ajustes.service';
import { CarritoService } from '../../core/services/carrito.service';
import { resumenHorario } from '../../core/utils/horario';
import { CLIENTE } from '../../config/cliente';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { VideoGalleryComponent } from './components/video-gallery/video-gallery.component';
import { ProductoCardComponent } from '../tienda/components/producto-card.component';
import { ProductoDetalleComponent } from '../tienda/components/producto-detalle.component';
import { IconoComponent } from '../../shared/components/icono/icono.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    ServiceCardComponent, RevelarDirective, RouterLink, VideoGalleryComponent, AsyncPipe, NgClass,
    ProductoCardComponent, ProductoDetalleComponent, IconoComponent,
  ],
  templateUrl: './home.component.html'
})
export class HomeComponent {
  private router = inject(Router);
  private carrito = inject(CarritoService);
  readonly ajustes = inject(AjustesService).ajustes;

  readonly cliente = CLIENTE;
  readonly horario = resumenHorario();
  readonly estrellas = [1, 2, 3, 4, 5];
  // URL fija de la configuración del cliente, no viene de usuarios.
  readonly mapaEmbed = CLIENTE.ubicacion
    ? inject(DomSanitizer).bypassSecurityTrustResourceUrl(CLIENTE.ubicacion.mapaEmbedUrl)
    : null;

  // Si falla la carga se oculta la sección en vez de dejar el esqueleto para siempre.
  serviciosDestacados$ = inject(ServiciosService).destacados().pipe(
    catchError(error => {
      console.error('Error cargando servicios destacados', error);
      return of([]);
    }),
  );

  private productos = toSignal(
    inject(ProductosService).visibles().pipe(catchError(() => of([] as Producto[]))),
    { initialValue: [] as Producto[] },
  );
  /** Vitrina de la tienda: primero los destacados y lo que hay en existencia. */
  readonly vitrina = computed(() =>
    [...this.productos()]
      .sort((a, b) => Number(sinExistencias(a)) - Number(sinExistencias(b)) || Number(b.destacado) - Number(a.destacado))
      .slice(0, 4),
  );
  readonly seleccionado = signal<Producto | null>(null);

  irAReservar(servicio: Servicio) {
    this.router.navigate(['/reservar'], { state: { servicio } });
  }

  agregar(producto: Producto) {
    if (tieneOpciones(producto)) {
      this.seleccionado.set(producto);
      return;
    }
    this.carrito.agregar(producto, null);
    this.carrito.abierto.set(true);
  }

  iniciales(nombre: string): string {
    return nombre.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }
}
