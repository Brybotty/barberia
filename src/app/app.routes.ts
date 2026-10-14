import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';
import { ClientLayoutComponent } from './layouts/client-layout/client-layout.component';

// `title` es el título de la pestaña (ver TituloStrategy). `sinIndexar` pide a los buscadores no guardar la página.
// `precargar` baja la pantalla por adelantado cuando el navegador está libre (ver PrecargaSelectiva).
export const routes: Routes = [
  {
    // Las rutas públicas y de cliente usan el Navbar y Footer
    path: '',
    component: ClientLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent)
      },
      {
        path: 'servicios',
        title: 'Servicios y precios',
        data: { precargar: true },
        loadComponent: () => import('./features/servicios/servicios.component').then(m => m.ServiciosComponent)
      },
      {
        path: 'politica-de-datos',
        title: 'Política de datos y cookies',
        loadComponent: () => import('./features/legal/politica-datos.component').then(m => m.PoliticaDatosComponent)
      },
      {
        // Pública: se elige barbero, servicio y hora sin sesión; solo se pide al confirmar.
        path: 'reservar',
        title: 'Reservar turno',
        data: { precargar: true },
        loadComponent: () => import('./features/citas/reservar/reservar.component').then(m => m.ReservarComponent)
      },
      {
        // El enlace que se comparte para dejar la página como app en el celular.
        path: 'instalar',
        title: 'Instalar la app',
        loadComponent: () => import('./features/instalar/instalar.component').then(m => m.InstalarComponent)
      },
      {
        path: 'mis-citas',
        title: 'Mis reservas',
        data: { sinIndexar: true },
        loadComponent: () => import('./features/citas/mis-citas/mis-citas.component').then(m => m.MisCitasComponent),
        canActivate: [authGuard]
      }
    ]
  },
  {
    // El Login va suelto, ocupando toda la pantalla
    path: 'login',
    title: 'Ingresar',
    data: { sinIndexar: true },
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'barbero',
    title: 'Mi panel',
    data: { sinIndexar: true },
    loadComponent: () => import('./features/barbero/barbero-dashboard/barbero-dashboard.component').then(m => m.BarberoDashboardComponent),
    canActivate: [authGuard, roleGuard(['barbero', 'admin'])]
  },
  {
    path: 'admin',
    title: 'Panel de administración',
    data: { sinIndexar: true },
    loadComponent: () => import('./features/admin/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    canActivate: [authGuard, roleGuard(['admin'])]
  },
  {
    // Una dirección que no existe muestra su propia página (sin cambiar la URL), con el menú de siempre.
    path: '**',
    component: ClientLayoutComponent,
    children: [{
      path: '',
      title: 'Página no encontrada',
      data: { sinIndexar: true },
      loadComponent: () => import('./features/no-encontrada/no-encontrada.component').then(m => m.NoEncontradaComponent)
    }]
  }
];
