import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { filter, map, of, take, timeout } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.user$.pipe(
    take(1),
    map(user => {
      if (user) return true;
      // Tras iniciar sesión vuelve a donde iba (p. ej. a sus reservas).
      return router.createUrlTree(['/login'], { queryParams: { volver: state.url } });
    })
  );
};

/** Va después de authGuard (ya hay sesión). Deja pasar solo a los roles indicados. */
export const roleGuard = (allowedRoles: string[]): CanActivateFn => {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // El perfil solo se emite cuando el servidor lo confirmó, y eso puede tardar un instante (sobre todo en el
    // primer inicio de sesión, cuando se acaba de crear): se espera al perfil en vez de rechazar por "aún no hay".
    return authService.currentUserProfile$.pipe(
      filter(perfil => !!perfil),
      take(1),
      timeout({ first: 8000, with: () => of(null) }),
      map(perfil => (perfil && allowedRoles.includes(perfil.rol) ? true : router.createUrlTree(['/']))),
    );
  };
};
