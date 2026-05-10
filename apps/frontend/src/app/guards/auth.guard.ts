import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { BackendAuthService } from '../services/backend-auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private auth: BackendAuthService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean> {
    return this.auth.getCurrentUser().pipe(
      take(1),
      map(user => {
        if (user && this.auth.isAuthenticated()) {
          return true;
        } else {
          this.router.navigate(['/auth/login']);
          return false;
        }
      })
    );
  }
}
