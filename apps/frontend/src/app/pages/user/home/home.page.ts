import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { ActionSheetController, LoadingController, ToastController, AlertController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { BackendAuthService, BackendUserInfo } from '../../../services/backend-auth.service';
import { HybridGeolocationService, Position } from '../../../services/hybrid-geolocation.service';
import { AjustadoAtiWebSocketService } from '../../../services/ajustadoati-websocket.service';
import { SearchRequestService, SearchSession } from '../../../services/search-request.service';
import { UserRequestService } from '../../../services/user-request.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonicModule]
})
export class HomePage implements OnInit, OnDestroy {
  user: BackendUserInfo | null = null;
  currentPosition: Position | null = null;
  isLocationLoading = false;
  isLoading = false;
  isConnectedToWebSocket = false;
  currentSearchSession: SearchSession | null = null;
  serviceForm: FormGroup;

  searchErrorMessage = "";

  private subscriptions: Subscription[] = [];

  constructor(
    public router: Router,
    private fb: FormBuilder,
    private actionSheetCtrl: ActionSheetController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private route: ActivatedRoute,
    private auth: BackendAuthService,
    private geolocation: HybridGeolocationService,
    private websocket: AjustadoAtiWebSocketService,
    private searchService: SearchRequestService,
    private userRequestService: UserRequestService
  ) {
    this.serviceForm = this.fb.group({
      serviceDescription: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(1000)]]
    });
  }

  async ngOnInit() {
    console.log('🏠 Home page initialized');
    
    // Load user profile
    await this.loadUserProfile();
    

    this.applyPrefillFromRoute();
    
    
    // Initialize WebSocket connection
    await this.initializeWebSocket();
    
    // Subscribe to search sessions
    this.subscribeToSearchUpdates();
  }

  ngOnDestroy() {
    // Cleanup subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    
    // Stop location watching
    this.geolocation.stopWatching();
    
    // Disconnect WebSocket
    this.websocket.disconnect();
  }

  navigateToRequests() {
    this.router.navigate(['/user/requests']);
  }

  navigateToActiveRequest() {
    this.router.navigate(['/user/active-request']);
  }

  private async loadUserProfile() {
    try {
      this.user = await this.auth.getUserProfile();
      console.log('👤 User profile loaded:', this.user);
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  }

  private async initializeLocation() {
    try {
      this.isLocationLoading = true;
      
      // Get current position
      this.currentPosition = await this.geolocation.getCurrentPosition();
      console.log('📍 Current position:', this.currentPosition);
      
      // Start watching position for real-time updates
      await this.geolocation.startWatching();
      
      // Subscribe to position updates
      const positionSub = this.geolocation.getCurrentPositionObservable()
        .subscribe(position => {
          if (position) {
            this.currentPosition = position;
          }
        });
      
      this.subscriptions.push(positionSub);
      
    } catch (error) {
      console.error('📍 Location error:', error);
      await this.showToast('No se pudo obtener la ubicación. Algunas funciones podrían estar limitadas.', 'warning');
    } finally {
      this.isLocationLoading = false;
    }
  }


  private subscribeToSearchUpdates() {
    // Subscribe to current search session
    const searchSub = this.searchService.getCurrentSearchSession()
      .subscribe(session => {
        this.currentSearchSession = session;
        console.log('🔍 Search session updated:', session);
      });
    
    this.subscriptions.push(searchSub);
  }

  private applyPrefillFromRoute() {
    const description = this.route.snapshot.queryParamMap.get('description');

    if (description) {
      this.serviceForm.patchValue({ serviceDescription: description });
    }

  }

  private async initializeWebSocket() {
    if (!this.auth.isAuthenticated()) {
      console.log('🔌 Skipping WebSocket - user not authenticated');
      return;
    }

    try {
      await this.websocket.connect();
      console.log('🔌 WebSocket connected successfully');
      
      // Subscribe to connection status
      const connectionSub = this.websocket.getConnectionStatus()
        .subscribe(isConnected => {
          this.isConnectedToWebSocket = isConnected;
          if (isConnected) {
            console.log('✅ WebSocket connection established');
          } else {
            console.log('❌ WebSocket connection lost');
          }
        });
      
      this.subscriptions.push(connectionSub);
      
    } catch (error) {
      console.error('🔌 WebSocket connection failed:', error);
      this.isConnectedToWebSocket = false;
    }
  }

  async onServiceSubmit() {
    if (this.isLoading || this.isLocationLoading) return;
    this.searchErrorMessage = "";
    if (this.serviceForm.invalid) {
      await this.showToast('Por favor completa todos los campos', 'warning');
      return;
    }

    if (!this.currentPosition) {
      await this.initializeLocation();
      if (!this.currentPosition) return;
    }

    if (this.searchService.hasActiveSearch()) {
      await this.showActiveSearchAlert();
      return;
    }

    const { serviceDescription } = this.serviceForm.value;
    await this.performServiceSearch(serviceDescription);
  }

  private async performServiceSearch(description: string) {
    if (!this.currentPosition) {
      await this.showToast('Ubicación requerida para buscar proveedores', 'danger');
      return;
    }

    this.isLoading = true;

    try {
      const userLocation = {
        lat: this.currentPosition.latitude,
        lng: this.currentPosition.longitude
      };

      const session = await this.searchService.createSearchRequest(description, userLocation);
      const categoryId = session.searchRequest.categoryId;
      const categoryName = session.searchRequest.categoryName || 'Servicio';

      // Also create in UserRequestService for persistence
      await this.userRequestService.createRequest({
        id: session.searchRequest.id,
        categoryId,
        categoryName,
        description,
        location: {
          latitude: this.currentPosition.latitude,
          longitude: this.currentPosition.longitude,
          address: this.currentPosition.address
        }
      });

      if (session.providers.length > 0) {
        await this.showToast(`Búsqueda iniciada. ${session.notifiedProvidersCount || 0} proveedores notificados.`, 'success');

        // Clear form and navigate to waiting-responses
        this.serviceForm.reset({ serviceDescription: '' });
        this.router.navigate(['/user/waiting-responses']);
      } else {
        await this.showNoProvidersAlert();
      }

    } catch (error: any) {
      this.searchErrorMessage = error?.message || 'No se pudo realizar la busqueda. Intenta de nuevo.';
    } finally {
      this.isLoading = false;
    }
  }

  navigateToMap(category?: any) {
    const queryParams = category ? { categoryId: category.id } : {};
    this.router.navigate(['/map'], { queryParams });
  }

  async refreshLocation() {
    try {
      this.isLocationLoading = true;
      this.currentPosition = await this.geolocation.getCurrentPosition();
      await this.showToast('Ubicación actualizada', 'success');
    } catch (error) {
      console.error('Error refreshing location:', error);
      await this.showToast('Error al actualizar ubicación', 'danger');
    } finally {
      this.isLocationLoading = false;
    }
  }

  async showUserMenu() {
    const actionSheet = await this.actionSheetCtrl.create({
      header: (this.user as any)?.fullName || 'Usuario',
      buttons: [
        {
          text: 'Mi Perfil',
          icon: 'person-outline',
          handler: () => {
            this.router.navigate(['/user/profile']);
          }
        },
        {
          text: 'Cerrar Sesión',
          icon: 'log-out-outline',
          handler: () => {
            this.logout();
          }
        },
        {
          text: 'Cancelar',
          icon: 'close-outline',
          role: 'cancel'
        }
      ]
    });

    await actionSheet.present();
  }

  private async logout() {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar Sesión',
      message: '¿Estás seguro de que quieres cerrar sesión?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Cerrar Sesión',
          handler: async () => {
            const loading = await this.loadingCtrl.create({
              message: 'Cerrando sesión...'
            });
            await loading.present();

            try {
              this.auth.logout();
              this.websocket.disconnect();
              await loading.dismiss();
              this.router.navigate(['/auth/login'], { replaceUrl: true });
            } catch (error) {
              await loading.dismiss();
              console.error('Logout error:', error);
              await this.showToast('Error al cerrar sesión', 'danger');
            }
          }
        }
      ]
    });

    await alert.present();
  }

  private async showLocationRequiredAlert() {
    const alert = await this.alertCtrl.create({
      header: 'Ubicación Requerida',
      message: 'Necesitamos tu ubicación para buscar proveedores cercanos. ¿Quieres intentar obtenerla de nuevo?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Intentar de Nuevo',
          handler: () => {
            this.initializeLocation();
          }
        }
      ]
    });

    await alert.present();
  }

  private async showActiveSearchAlert() {
    const alert = await this.alertCtrl.create({
      header: 'Búsqueda Activa',
      message: 'Ya tienes una búsqueda en progreso. ¿Quieres ver los resultados?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Ver Resultados',
          handler: () => {
            this.router.navigate(['/user/search-results']);
          }
        }
      ]
    });

    await alert.present();
  }

  private async showNoProvidersAlert() {
    const alert = await this.alertCtrl.create({
      header: 'Sin Proveedores',
      message: 'No se encontraron proveedores disponibles en tu área para este servicio. ¿Quieres ampliar el área de búsqueda?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Buscar en Área Amplia',
          handler: () => {
            // TODO: Implement extended search
            this.showToast('Función en desarrollo', 'warning');
          }
        }
      ]
    });

    await alert.present();
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger' = 'success') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'top'
    });
    await toast.present();
  }

  // Getter for template
  get locationText(): string {
    if (!this.currentPosition) {
      return this.isLocationLoading ? 'Obteniendo ubicación...' : 'Ubicación no disponible';
    }
    return this.currentPosition.address || `${this.currentPosition.latitude.toFixed(4)}, ${this.currentPosition.longitude.toFixed(4)}`;
  }

  get connectionStatusText(): string {
    return this.isConnectedToWebSocket ? 'Conectado' : 'Desconectado';
  }

  get hasActiveSearch(): boolean {
    return this.currentSearchSession !== null && this.currentSearchSession.isActive;
  }

  get hasAcceptedOffer(): boolean {
    return this.searchService.hasAcceptedOffer() || this.userRequestService.hasActiveRequest();
  }
}
