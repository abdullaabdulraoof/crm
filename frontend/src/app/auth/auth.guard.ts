import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';

import { AuthService } from './auth.service';

export function authGuard(): boolean | UrlTree {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? true : router.createUrlTree(['/login']);
}

export function alreadyAuthGuard(): boolean | UrlTree {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
}