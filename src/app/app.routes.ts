import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';
import { ClientLayoutComponent } from './layouts/client-layout/client-layout.component';

export const routes: Routes = [
  {
    // Solo en la demo con emuladores: imita el checkout de Wompi (fuera del layout, como la pasarela real).
    path: 'tienda/pago-simulado/:pedidoId',
    loadComponent: () => import('./features/tienda/pago-simulado/pago-simulado.component').then(m => m.PagoSimuladoComponent),
    canActivate: [authGuard]
  },
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
        loadComponent: () => import('./features/servicios/servicios.component').then(m => m.ServiciosComponent)
      },
      {
        path: 'tienda',
        loadComponent: () => import('./features/tienda/tienda.component').then(m => m.TiendaComponent)
      },
      {
        // Sin guard: el checkout pide iniciar sesión al confirmar, sin perder lo escrito.
        path: 'tienda/pagar',
        loadComponent: () => import('./features/tienda/checkout/checkout.component').then(m => m.CheckoutComponent)
      },
      {
        path: 'tienda/pedido/:pedidoId',
        loadComponent: () => import('./features/tienda/pedido/pedido.component').then(m => m.PedidoComponent),
        canActivate: [authGuard]
      },
      {
        path: 'mis-pedidos',
        loadComponent: () => import('./features/tienda/mis-pedidos/mis-pedidos.component').then(m => m.MisPedidosComponent),
        canActivate: [authGuard]
      },
      {
        path: 'politica-de-datos',
        loadComponent: () => import('./features/legal/politica-datos.component').then(m => m.PoliticaDatosComponent)
      },
      {
        path: 'reservar',
        loadComponent: () => import('./features/citas/reservar/reservar.component').then(m => m.ReservarComponent),
        canActivate: [authGuard]
      },
      {
        path: 'mis-citas',
        loadComponent: () => import('./features/citas/mis-citas/mis-citas.component').then(m => m.MisCitasComponent),
        canActivate: [authGuard]
      }
    ]
  },
  {
    // El Login va suelto, ocupando toda la pantalla
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    // Dashboards privados (pueden llevar su propio AdminLayout después)
    path: 'barbero',
    loadComponent: () => import('./features/barbero/barbero-dashboard/barbero-dashboard.component').then(m => m.BarberoDashboardComponent),
    canActivate: [authGuard, roleGuard(['barbero', 'admin'])]
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    canActivate: [authGuard, roleGuard(['admin'])]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
