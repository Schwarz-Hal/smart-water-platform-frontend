import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

/** Hides routes in the demo UI; the API remains the authoritative permission check. */
export const permissionGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const permission = route.data['permission'] as string | undefined;

  if (!permission || auth.hasPermission(permission)) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
