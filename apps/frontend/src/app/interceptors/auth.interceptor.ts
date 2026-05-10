import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { BackendAuthService } from '../services/backend-auth.service';
import { environment } from '../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(BackendAuthService);
  
  // Solo agregar token para peticiones a nuestro backend
  if (req.url.startsWith(environment.baseUrl)) {
    const token = auth.getJwtToken();
    if (token) {
      return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
    }
  }
  
  return next(req);
};
