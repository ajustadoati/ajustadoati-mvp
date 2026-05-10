import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/guest-search',
    pathMatch: 'full'
  },
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        loadComponent: () => import('./pages/auth/login/login.page').then(m => m.LoginPage)
      },
      {
        path: 'register',
        loadComponent: () => import('./pages/auth/register/register.page').then(m => m.RegisterPage)
      },
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: 'login',
    redirectTo: '/auth/login',
    pathMatch: 'full'
  },
  {
    path: 'register',
    redirectTo: '/auth/register',
    pathMatch: 'full'
  },
  // Rutas para USUARIOS (clientes)
  {
    path: 'user',
    canActivate: [AuthGuard],
    children: [
      {
        path: 'home',
        loadComponent: () => import('./pages/user/home/home.page').then(m => m.HomePage)
      },
      {
        path: 'waiting-responses',
        loadComponent: () => import('./pages/user/waiting-responses/waiting-responses.page').then(m => m.WaitingResponsesPage)
      },
      {
        path: 'active-request',
        loadComponent: () => import('./pages/user/active-request/active-request.page').then(m => m.ActiveRequestPage)
      },
      {
        path: 'requests',
        loadComponent: () => import('./pages/user/requests/requests.page').then(m => m.RequestsPage)
      },
      {
        path: 'profile',
        loadComponent: () => import('./pages/user/profile/profile.page').then(m => m.UserProfilePage)
      },
      // Legacy redirect for old search-results route
      {
        path: 'search-results',
        redirectTo: 'waiting-responses',
        pathMatch: 'full'
      },
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full'
      }
    ]
  },
  // Rutas para PROVEEDORES
  {
    path: 'provider',
    canActivate: [AuthGuard],
    children: [
      {
        path: 'home',
        loadComponent: () => import('./pages/provider/home/home.page').then(m => m.ProviderHomePage)
      },
      {
        path: 'request-detail/:id',
        loadComponent: () => import('./pages/provider/request-detail/request-detail.page').then(m => m.RequestDetailPage)
      },
      {
        path: 'active-job',
        loadComponent: () => import('./pages/provider/active-job/active-job.page').then(m => m.ActiveJobPage)
      },
      {
        path: 'jobs-history',
        loadComponent: () => import('./pages/provider/jobs-history/jobs-history.page').then(m => m.JobsHistoryPage)
      },
      {
        path: 'profile',
        loadComponent: () => import('./pages/provider/profile/profile.page').then(m => m.ProviderProfilePage)
      },
      // Legacy redirect for old requests route
      {
        path: 'requests',
        redirectTo: 'home',
        pathMatch: 'full'
      },
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full'
      }
    ]
  },
  // Rutas directas para paginas que no estan en tabs
  {
    path: 'map',
    loadComponent: () => import('./pages/map/map.page').then((m) => m.MapPage)
  },
  // Redireccion por defecto despues de login
  {
    path: 'home',
    redirectTo: '/user/home',
    pathMatch: 'full'
  },
  {
    path: 'guest-search',
    loadComponent: () => import('./guest-search/guest-search.page').then( m => m.GuestSearchPage)
  }
];
