import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.user$.pipe(
    take(1),
    map(user => {
      if (user) return true;
      // Tras iniciar sesión vuelve a donde iba (p. ej. el pedido al que llegó desde Wompi).
      return router.createUrlTree(['/login'], { queryParams: { volver: state.url } });
    })
  );
};

export const roleGuard = (allowedRoles: string[]): CanActivateFn => {
  return (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return authService.currentUserProfile$.pipe(
      take(1),
      map(profile => {
        if (profile && allowedRoles.includes(profile.rol)) {
          return true;
        }
        return router.createUrlTree(['/']);
      })
    );
  };
};
