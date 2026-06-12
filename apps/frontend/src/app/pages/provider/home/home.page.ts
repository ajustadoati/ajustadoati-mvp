import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { LoadingController, ToastController, ActionSheetController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { BackendAuthService, BackendUserInfo } from '../../../services/backend-auth.service';
import {
  AjustadoAtiWebSocketService,
  ServiceRequest
} from '../../../services/ajustadoati-websocket.service';
import { HybridGeolocationService, Position } from '../../../services/hybrid-geolocation.service';
import {
  ProviderSentResponse,
  ProviderWorkspaceService
} from '../../../services/provider-workspace.service';
import { AdminService } from '../../../services/admin.service';
import { ProviderActiveJob } from '../../../interfaces/request.interface';
import { LocalNotifications } from '@capacitor/local-notifications';

@Component({
  selector: 'app-provider-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class ProviderHomePage implements OnInit, OnDestroy {
  user: BackendUserInfo | null = null;
  currentPosition: Position | null = null;
  isLocationLoading = false;
  isConnectedToWebSocket = false;
  isAuthenticated = false;

  // Availability toggle
  isAvailable = true;

  isAdmin = false;

  pendingRequests: ServiceRequest[] = [];
  sentResponses: ProviderSentResponse[] = [];
  activeJob: ProviderActiveJob | null = null;

  private subscriptions: Subscription[] = [];

  constructor(
    public router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private actionSheetCtrl: ActionSheetController,
    private auth: BackendAuthService,
    private websocket: AjustadoAtiWebSocketService,
    private geolocation: HybridGeolocationService,
    private providerWorkspace: ProviderWorkspaceService,
    private adminService: AdminService
  ) {}

  async ngOnInit() {
    console.log('🏠 Provider Home page initialized');

    // Load user profile
    await this.loadUserProfile();

    // Initialize location services
    await this.initializeLocation();

    // Initialize WebSocket connection
    await this.initializeWebSocket();

    this.subscribeToWorkspaceState();

    // Subscribe to service requests
    this.subscribeToServiceRequests();

    // Request notification permissions
    await this.requestNotificationPermissions();

    // Show admin button only for accounts listed in the backend's ADMIN_EMAILS
    this.adminService.checkAccess().then(isAdmin => (this.isAdmin = isAdmin));
  }

  goToAdmin() {
    this.router.navigate(['/admin']);
  }

  ngOnDestroy() {
    // Cleanup subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());

    // Stop location watching
    this.geolocation.stopWatching();
  }

  private async loadUserProfile() {
    try {
      this.user = await this.auth.getFullUserProfile();
      console.log('👤 Provider profile loaded:', this.user);
    } catch (error) {
      console.error('Error loading provider profile:', error);
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

      // Subscribe to authentication status
      const authSub = this.websocket.getAuthenticationStatus()
        .subscribe(isAuth => {
          this.isAuthenticated = isAuth;
          console.log('🔐 WebSocket authentication status:', isAuth);
        });

      const notificationsSub = this.websocket.getNotifications()
        .subscribe(async (notification) => {
          if (notification.type === 'offer_accepted') {
            const activeJob = this.providerWorkspace.handleOfferAccepted(notification);
            if (activeJob) {
              await this.showToast('Un cliente aceptó tu oferta. Revisa el trabajo activo para coordinar.', 'success');
            }
          }

          if (notification.type === 'request_expired' && notification.requestId) {
            this.providerWorkspace.removeExpiredRequest(notification.requestId);
          }
        });

      this.subscriptions.push(connectionSub, authSub, notificationsSub);

    } catch (error) {
      console.error('🔌 WebSocket connection failed:', error);
      this.isConnectedToWebSocket = false;
    }
  }

  private subscribeToWorkspaceState() {
    const pendingSub = this.providerWorkspace.pendingRequests$
      .subscribe(requests => {
        this.pendingRequests = requests;
      });

    const responsesSub = this.providerWorkspace.sentResponses$
      .subscribe(responses => {
        this.sentResponses = responses;
      });

    const activeJobSub = this.providerWorkspace.activeJob$
      .subscribe(activeJob => {
        this.activeJob = activeJob;
      });

    this.subscriptions.push(pendingSub, responsesSub, activeJobSub);
  }

  private subscribeToServiceRequests() {
    console.log('🔔 Setting up service request subscription...');
    console.log('🔔 Provider is available:', this.isAvailable);
    console.log('🔔 Provider categories:', this.user?.categories);

    // Subscribe to incoming service requests
    const requestsSub = this.websocket.getServiceRequests()
      .subscribe(async (request: ServiceRequest) => {
        console.log('🔔🔔🔔 SERVICE REQUEST ARRIVED IN PROVIDER HOME:', request);

        // Only process if available
        if (!this.isAvailable) {
          console.log('⚠️ Ignoring request - provider not available');
          return;
        }

        this.providerWorkspace.addIncomingRequest(request);

        // Show notification
        await this.showRequestNotification(request);

        // Show toast
        await this.showToast(`Nueva solicitud: ${request.message}`, 'success');
      });

    this.subscriptions.push(requestsSub);
  }

  async toggleAvailability(checked: boolean) {
    this.isAvailable = checked;

    if (this.isAvailable) {
      try {
        await this.websocket.connect();
        await this.showToast('Estas disponible para recibir solicitudes', 'success');
      } catch (error) {
        console.error('Error connecting WebSocket:', error);
        await this.showToast('Error al conectar', 'danger');
        this.isAvailable = false;
      }
    } else {
      this.websocket.disconnect();
      await this.showToast('No recibiras solicitudes hasta que actives disponibilidad', 'warning');
    }
  }

  navigateToActiveJob() {
    this.router.navigate(['/provider/active-job']);
  }

  navigateToJobsHistory() {
    this.router.navigate(['/provider/jobs-history']);
  }

  private async requestNotificationPermissions() {
    try {
      const permission = await LocalNotifications.requestPermissions();
      console.log('🔔 Notification permission:', permission);
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
    }
  }

  private async showRequestNotification(request: ServiceRequest) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: '🔔 Nueva Solicitud de Servicio',
            body: request.message,
            id: Date.now(),
            schedule: { at: new Date(Date.now() + 100) },
            sound: undefined,
            attachments: undefined,
            actionTypeId: '',
            extra: {
              requestId: request.id,
              categoryId: request.categoryId
            }
          }
        ]
      });
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  async viewRequest(request: ServiceRequest) {
    this.router.navigate(['/provider/request-detail', request.id], {
      state: { request }
    });
  }

  navigateToRequests() {
    this.router.navigate(['/provider/home']);
  }

  navigateToProfile() {
    this.router.navigate(['/provider/profile']);
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

  async logout() {
    const actionSheet = await this.actionSheetCtrl.create({
      header: '¿Cerrar Sesión?',
      subHeader: 'Se desconectará de la aplicación',
      buttons: [
        {
          text: 'Cerrar Sesión',
          role: 'destructive',
          icon: 'power',
          handler: async () => {
            const loading = await this.loadingCtrl.create({
              message: 'Cerrando sesión...',
              spinner: 'crescent'
            });
            await loading.present();

            try {
              this.auth.logout();
              this.websocket.disconnect();
              await loading.dismiss();
              this.router.navigate(['/auth/login'], { replaceUrl: true });
              await this.showToast('Sesión cerrada correctamente', 'success');
            } catch (error) {
              await loading.dismiss();
              console.error('Logout error:', error);
              await this.showToast('Error al cerrar sesión', 'danger');
            }
          }
        },
        {
          text: 'Cancelar',
          icon: 'close',
          role: 'cancel'
        }
      ]
    });

    await actionSheet.present();
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

  // Getters for template
  get locationText(): string {
    if (!this.currentPosition) {
      return this.isLocationLoading ? 'Obteniendo ubicación...' : 'Ubicación no disponible';
    }
    return this.currentPosition.address || `${this.currentPosition.latitude.toFixed(4)}, ${this.currentPosition.longitude.toFixed(4)}`;
  }

  get connectionStatusText(): string {
    return this.isConnectedToWebSocket ? 'Conectado' : 'Desconectado';
  }

  get connectionStatusColor(): string {
    return this.isConnectedToWebSocket ? 'success' : 'danger';
  }

  get pendingCount(): number {
    return this.pendingRequests.length;
  }

  get respondedTodayCount(): number {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return this.sentResponses.filter(response => new Date(response.sentAt).getTime() >= todayStart).length;
  }

  get acceptedCount(): number {
    return this.sentResponses.filter(response => response.status === 'accepted').length;
  }

  get greetingText(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 20) return 'Buenas tardes';
    return 'Buenas noches';
  }
}
