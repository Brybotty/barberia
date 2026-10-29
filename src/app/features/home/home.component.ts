import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { AsyncPipe, NgClass } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ServiceCardComponent } from '../../shared/components/service-card/service-card.component';
import { RevelarDirective } from '../../shared/directives/revelar.directive';
import { Servicio } from '../../core/models/servicio.model';
import { BarberoPublico, iniciales } from '../../core/models/barbero.model';
import { ServiciosService } from '../../core/services/servicios.service';
import { BarberosService } from '../../core/services/barberos.service';
import { AjustesService } from '../../core/services/ajustes.service';
import { estadoDelNegocio, resumenHorario } from '../../core/utils/horario';
import { enNavegador } from '../../core/utils/plataforma';
import { CLIENTE } from '../../config/cliente';
import { VideoGalleryComponent } from './components/video-gallery/video-gallery.component';
import { IconoComponent } from '../../shared/components/icono/icono.component';
import { RedSocialComponent } from '../../shared/components/red-social/red-social.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    ServiceCardComponent, RevelarDirective, RouterLink, VideoGalleryComponent, AsyncPipe, NgClass, IconoComponent, RedSocialComponent,
  ],
  templateUrl: './home.component.html'
})
export class HomeComponent {
  private router = inject(Router);
  private ajustesService = inject(AjustesService);
  readonly ajustes = this.ajustesService.ajustes;

  readonly cliente = CLIENTE;
  /** Al compilar (prerender) no hay hora del visitante: lo que depende de ella espera al navegador. */
  readonly navegador = enNavegador;
  readonly iniciales = iniciales;
  readonly estrellas = [1, 2, 3, 4, 5];
  // URL fija de la configuración del cliente, no viene de usuarios.
  readonly mapaEmbed = CLIENTE.ubicacion
    ? inject(DomSanitizer).bypassSecurityTrustResourceUrl(CLIENTE.ubicacion.mapaEmbedUrl)
    : null;

  /** En pantallas táctiles el mapa no atrapa el dedo al bajar por la página: se activa con un toque. */
  readonly mapaActivo = signal(enNavegador && !matchMedia('(pointer: coarse)').matches);

  /**
   * El mapa de Google baja más código que toda la página y, en un celular modesto, compite con ella por el
   * procesador justo al abrir. Por eso su marco se pone solo cuando está por verse y el navegador ya quedó libre
   * de pintar lo demás; mientras tanto se ve su espacio, con el pin.
   */
  readonly mapaCargado = signal(false);
  private readonly marcoMapa = viewChild<ElementRef<HTMLElement>>('marcoMapa');

  // "Abierto ahora" se revisa cada minuto (en la hora de Colombia, esté donde esté quien mira).
  private readonly ahora = signal(new Date());
  readonly horario = computed(() => resumenHorario(this.ajustesService.horario()));
  readonly estado = computed(() => estadoDelNegocio(this.ahora(), this.ajustesService.horario()));
  readonly periodo = this.ajustesService.periodo;

  // Si falla la carga se oculta la sección en vez de dejar el esqueleto para siempre.
  serviciosDestacados$ = inject(ServiciosService).destacados().pipe(
    catchError(error => {
      console.error('Error cargando servicios destacados', error);
      return of([]);
    }),
  );

  /** El equipo sale de Firestore (lo edita el admin en el panel). undefined mientras carga. */
  readonly equipo = toSignal(inject(BarberosService).listar().pipe(
    catchError(error => {
      console.error('Error cargando el equipo', error);
      return of<BarberoPublico[]>([]);
    }),
  ));

  constructor() {
    const destruir = inject(DestroyRef);
    if (enNavegador) {
      const reloj = setInterval(() => this.ahora.set(new Date()), 60_000);
      destruir.onDestroy(() => clearInterval(reloj));
    }

    afterNextRender(() => {
      const marco = this.marcoMapa()?.nativeElement;
      if (!marco) return;
      const cargar = () => (typeof requestIdleCallback === 'function'
        ? requestIdleCallback(() => this.mapaCargado.set(true), { timeout: 2500 })
        : setTimeout(() => this.mapaCargado.set(true), 600));
      if (typeof IntersectionObserver !== 'function') {
        cargar();
        return;
      }
      // Un poco antes de que asome en pantalla, para que ya esté cuando el visitante llegue a él.
      const observador = new IntersectionObserver(entradas => {
        if (!entradas.some(e => e.isIntersecting)) return;
        observador.disconnect();
        cargar();
      }, { rootMargin: '150px' });
      observador.observe(marco);
      destruir.onDestroy(() => observador.disconnect());
    });
  }

  /** Un servicio propio de un barbero se reserva con él: la reserva abre ya con ese barbero elegido. */
  irAReservar(servicio: Servicio) {
    this.router.navigate(['/reservar'], { state: servicio.soloDe ? { servicio, servicioId: servicio.id, barberoId: servicio.soloDe } : { servicio } });
  }

  reservarCon(barbero: BarberoPublico) {
    this.router.navigate(['/reservar'], { state: { barberoId: barbero.id } });
  }
}
