import { Component, inject } from '@angular/core';
import { AsyncPipe, NgClass } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { ServiceCardComponent } from '../../shared/components/service-card/service-card.component';
import { RevelarDirective } from '../../shared/directives/revelar.directive';
import { Servicio } from '../../core/models/servicio.model';
import { ServiciosService } from '../../core/services/servicios.service';
import { AjustesService } from '../../core/services/ajustes.service';
import { resumenHorario } from '../../core/utils/horario';
import { CLIENTE } from '../../config/cliente';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { VideoGalleryComponent } from './components/video-gallery/video-gallery.component';
import { IconoComponent } from '../../shared/components/icono/icono.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    ServiceCardComponent, RevelarDirective, RouterLink, VideoGalleryComponent, AsyncPipe, NgClass, IconoComponent,
  ],
  templateUrl: './home.component.html'
})
export class HomeComponent {
  private router = inject(Router);
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

  irAReservar(servicio: Servicio) {
    this.router.navigate(['/reservar'], { state: { servicio } });
  }

  iniciales(nombre: string): string {
    return nombre.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }
}
