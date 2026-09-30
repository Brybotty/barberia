import { Component, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IconoServicio, Servicio, iconoDe } from '../../core/models/servicio.model';
import { IconoComponent } from '../../shared/components/icono/icono.component';
import { ServiciosService } from '../../core/services/servicios.service';
import { DuracionPipe } from '../../shared/pipes/duracion.pipe';
import { RevelarDirective } from '../../shared/directives/revelar.directive';

type ServicioCatalogo = Servicio;

interface CategoriaServicios {
  nombre: string;
  icono: IconoServicio;
  servicios: ServicioCatalogo[];
}

@Component({
  selector: 'app-servicios',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DuracionPipe, RevelarDirective, IconoComponent],
  templateUrl: './servicios.component.html'
})
export class ServiciosComponent {
  private router = inject(Router);
  private serviciosService = inject(ServiciosService);

  categorias: CategoriaServicios[] = [];

  constructor() {
    this.serviciosService.listar().pipe(takeUntilDestroyed()).subscribe({
      next: servicios => this.agruparCategorias(servicios),
      error: error => console.error('Error cargando el catálogo de servicios', error),
    });
  }

  private agruparCategorias(servicios: ServicioCatalogo[]) {
    const map = new Map<string, ServicioCatalogo[]>();
    
    servicios.forEach(s => {
      const catName = s.categoria || 'Otros';
      if (!map.has(catName)) {
        map.set(catName, []);
      }
      map.get(catName)!.push(s);
    });

    this.categorias = Array.from(map.keys()).map(catName => ({
      nombre: catName,
      // El ícono de la categoría es el de su primer servicio.
      icono: iconoDe(map.get(catName)![0]),
      servicios: map.get(catName)!
    }));
  }

  agendarServicio(servicio: ServicioCatalogo) {
    this.router.navigate(['/reservar'], { state: { servicio } });
  }
}
