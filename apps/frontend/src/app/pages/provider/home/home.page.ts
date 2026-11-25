import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { LoadingController, ToastController, ActionSheetController } from '@ionic/angular';
import { Subscription, interval } from 'rxjs';
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
import { PushNotificationService } from '../../../services/push-notification.service';
import { ProviderActiveJob } from '../../../interfaces/request.interface';
import { LocalNotifications } from '@capacitor/local-notifications';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

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
  isLocationSynced = false;
  locationErrorMessage = '';
  activityErrorMessage = '';
  isConnectedToWebSocket = false;
  isAuthenticated = false;

  // Availability toggle
  isAvailable = false;

  isAdmin = false;

  // PWA install prompt (Android/Chrome) & Web Push state
  showInstallBanner = false;
  private deferredInstall?: BeforeInstallPromptEvent;
  showPushBanner = false;
  isIosStandaloneCandidate = false; // iOS Safari, not yet in home screen
  private readonly PUSH_BANNER_DISMISSED_KEY = 'push_banner_dismissed_at';
  private readonly INSTALL_BANNER_DISMISSED_KEY = 'install_banner_dismissed_at';
  private readonly handleInstallPrompt = (event: Event) => {
    event.preventDefault();
    this.deferredInstall = event as BeforeInstallPromptEvent;
    if (!this.wasDismissedRecently(this.INSTALL_BANNER_DISMISSED_KEY)) {
      this.showInstallBanner = true;
    }
  };
  private readonly handleAppInstalled = () => {
    this.deferredInstall = undefined;
    this.showInstallBanner = false;
  };
  private readonly handleVisibilityChange = () => {
    if (!document.hidden && this.user) {
      void this.refreshActivity();
      void this.providerWorkspace.fetchPendingBacklog();
      if (this.isAvailable && this.isLocationSynced && !this.isAuthenticated) {
        void this.initializeWebSocket();
      }
    }
  };

  pendingRequests: ServiceRequest[] = [];
  sentResponses: ProviderSentResponse[] = [];
  activeJob: ProviderActiveJob | null = null;

  private subscriptions: Subscription[] = [];
  private locationSubscription: Subscription | null = null;

  constructor(
    public router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private actionSheetCtrl: ActionSheetController,
    private auth: BackendAuthService,
    private websocket: AjustadoAtiWebSocketService,
    private geolocation: HybridGeolocationService,
    private providerWorkspace: ProviderWorkspaceService,
    private pushNotifications: PushNotificationService,
    private adminService: AdminService
  ) {}

  async ngOnInit() {
    console.log('🏠 Provider Home page initialized');

    // Catch the install event before GPS, profile and WebSocket awaits delay the page.
    this.wireInstallPrompt();

    // Load user profile
    await this.loadUserProfile();

    this.subscribeToWorkspaceState();
    this.subscribeToServiceRequests();
    this.subscribeToWebSocketState();
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    void this.refreshActivity();
    // Keep accepted work visible even when the WebSocket notification is missed.
    this.subscriptions.push(interval(15000).subscribe(() => {
      void this.refreshActivity();
    }));

    // Initialize location services
    const locationReady = await this.initializeLocation();

    // Initialize WebSocket connection
    if (locationReady) {
      this.isAvailable = true;
      await this.initializeWebSocket();
      if (this.isAvailable) void this.providerWorkspace.fetchPendingBacklog();
    } else {
      this.isAvailable = false;
    }

    // Request notification permissions
    await this.requestNotificationPermissions();

    // Show admin button only for accounts listed in the backend's ADMIN_EMAILS
    this.adminService.checkAccess().then(isAdmin => (this.isAdmin = isAdmin));

    // Route push notification clicks to /provider/home (or the URL in payload)
    this.pushNotifications.wireClickHandler('/provider/home');

    // Show "Activar notificaciones" banner if push is supported but not yet enabled
    void this.evaluatePushBanner();
  }

  private wireInstallPrompt(): void {
    if (this.isStandalone()) return;

    const dismissed = this.wasDismissedRecently(this.INSTALL_BANNER_DISMISSED_KEY);

    window.addEventListener('beforeinstallprompt', this.handleInstallPrompt);
    window.addEventListener('appinstalled', this.handleAppInstalled);

    // iOS Safari fires no event — show a manual card if we detect it
    if (this.isIosSafari() && !dismissed) {
      this.isIosStandaloneCandidate = true;
      this.showInstallBanner = true;
    }
  }

  async promptInstall() {
    if (this.deferredInstall) {
      await this.deferredInstall.prompt();
      const choice = await this.deferredInstall.userChoice;
      if (choice.outcome === 'accepted') {
        this.showInstallBanner = false;
      }
      this.deferredInstall = undefined;
      return;
    }
    // iOS: nothing to prompt — the CTA is instructions
    this.showToast(
      'En iPhone: pulsa "Compartir" y luego "Añadir a pantalla de inicio".',
      'success'
    );
  }

  dismissInstallBanner() {
    this.showInstallBanner = false;
    localStorage.setItem(this.INSTALL_BANNER_DISMISSED_KEY, String(Date.now()));
  }

  private async evaluatePushBanner() {
    if (!this.pushNotifications.isSupported()) return;
    const perm = this.pushNotifications.currentPermission();
    if (perm === 'denied' || perm === 'granted') {
      const subscribed = await this.pushNotifications.isSubscribed();
      this.showPushBanner = perm === 'granted' && !subscribed;
    } else {
      // 'default' — never asked
      this.showPushBanner = !this.wasDismissedRecently(this.PUSH_BANNER_DISMISSED_KEY);
    }
  }

  async enablePush() {
    const result = await this.pushNotifications.enable();
    if (result === 'ok') {
      this.showPushBanner = false;
      this.showToast('Notificaciones activadas.', 'success');
    } else if (result === 'denied') {
      this.showToast('Permiso denegado. Actívalas desde los ajustes del navegador.', 'warning');
      this.showPushBanner = false;
    } else if (result === 'unsupported') {
      this.showToast('Tu navegador no soporta notificaciones push todavía.', 'warning');
      this.showPushBanner = false;
    } else {
      this.showToast('No se pudo activar. Intenta más tarde.', 'danger');
    }
  }

  dismissPushBanner() {
    this.showPushBanner = false;
    localStorage.setItem(this.PUSH_BANNER_DISMISSED_KEY, String(Date.now()));
  }

  private isStandalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  }

  private isIosSafari(): boolean {
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua);
    const webkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    return iOS && webkit;
  }

  /** Suppress a dismissed banner for 3 days so it doesn't keep bothering the user. */
  private wasDismissedRecently(key: string): boolean {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const at = Number(raw);
    if (isNaN(at)) return false;
    return Date.now() - at < 3 * 24 * 60 * 60 * 1000;
  }

  goToAdmin() {
    this.router.navigate(['/admin']);
  }

  ngOnDestroy() {
    // Cleanup subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.locationSubscription = null;
    window.removeEventListener('beforeinstallprompt', this.handleInstallPrompt);
    window.removeEventListener('appinstalled', this.handleAppInstalled);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    // Stop location watching
    this.geolocation.stopWatching();
  }

  ionViewWillEnter() {
    if (this.user) {
      void this.refreshActivity();
      if (this.isAvailable) void this.providerWorkspace.fetchPendingBacklog();
    }
  }

  async refreshActivity() {
    const ok = await this.providerWorkspace.refreshProviderActivity();
    this.activityErrorMessage = ok ? '' : 'No pudimos actualizar tus propuestas. Comprueba la conexión y vuelve a intentar.';
  }

  private async loadUserProfile() {
    try {
      this.user = await this.auth.getFullUserProfile();
      // Wipe the workspace if it belongs to a different account that
      // previously logged in on this browser — otherwise the new
      // provider would see ghost pending requests and sent responses.
      this.providerWorkspace.ensureBelongsTo(this.user?.email);
      console.log('👤 Provider profile loaded:', this.user);

    } catch (error) {
      console.error('Error loading provider profile:', error);
    }
  }

  private async initializeLocation(): Promise<boolean> {
    try {
      this.isLocationLoading = true;
      this.locationErrorMessage = '';

      this.currentPosition = await this.geolocation.getCurrentPosition();
      const locationChanged = await this.syncProviderLocation(this.currentPosition);
      if (locationChanged) this.websocket.disconnect();

      await this.watchLocation();
      return true;

    } catch (error) {
      console.error('📍 Location error:', error);
      this.isLocationSynced = false;
      this.isAvailable = false;
      this.websocket.disconnect();
      this.locationErrorMessage = this.describeLocationError(error);
      return false;
    } finally {
      this.isLocationLoading = false;
    }
  }

  private async watchLocation(): Promise<void> {
    try {
      await this.geolocation.startWatching();
    } catch (error) {
      console.warn('Could not watch provider location:', error);
    }
    if (!this.locationSubscription) {
      this.locationSubscription = this.geolocation.getCurrentPositionObservable()
        .subscribe(position => {
          if (position) this.currentPosition = position;
        });
      this.subscriptions.push(this.locationSubscription);
    }
  }

  private async syncProviderLocation(position: Position): Promise<boolean> {
    const saved = this.user?.location;
    const changed = !saved || Math.abs(saved.latitude - position.latitude) > 0.0001
        || Math.abs(saved.longitude - position.longitude) > 0.0001;
    if (changed) {
      this.user = await this.auth.updateProfile({
        location: { latitude: position.latitude, longitude: position.longitude }
      });
    }
    this.isLocationSynced = true;
    this.locationErrorMessage = '';
    return changed;
  }

  private describeLocationError(error: unknown): string {
    const code = (error as { code?: number })?.code;
    if (code === 1) return 'El navegador no tiene permiso de ubicación. Actívalo para este sitio y vuelve a intentar.';
    if (code === 2) return 'Tu dispositivo no pudo determinar la ubicación. Comprueba la ubicación del sistema y vuelve a intentar.';
    if (code === 3) return 'La ubicación tardó demasiado. Comprueba el GPS o la red y vuelve a intentar.';
    return 'No pudimos sincronizar tu ubicación. Comprueba la conexión y vuelve a intentar.';
  }

  private async initializeWebSocket() {
    if (!this.auth.isAuthenticated()) {
      console.log('🔌 Skipping WebSocket - user not authenticated');
      return;
    }

    try {
      await this.websocket.connect();
      console.log('🔌 WebSocket connected successfully');
    } catch (error) {
      console.error('🔌 WebSocket connection failed:', error);
      this.isConnectedToWebSocket = false;
      this.isAvailable = false;
      this.websocket.disconnect();
    }
  }

  private subscribeToWebSocketState() {
    this.subscriptions.push(this.websocket.getConnectionStatus().subscribe(connected => {
      this.isConnectedToWebSocket = connected;
    }));
    this.subscriptions.push(this.websocket.getAuthenticationStatus().subscribe(authenticated => {
      this.isAuthenticated = authenticated;
    }));
    this.subscriptions.push(this.websocket.getNotifications().subscribe(async notification => {
      if (notification.type === 'offer_accepted') {
        const activeJob = this.providerWorkspace.handleOfferAccepted(notification);
        if (activeJob) {
          await this.showToast('Un cliente aceptó tu oferta. Revisa el trabajo activo para coordinar.', 'success');
        }
      }
      if (notification.type === 'request_expired' && notification.requestId) {
        this.providerWorkspace.removeExpiredRequest(notification.requestId);
      }
    }));
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
        if (!this.isAvailable || !this.isLocationSynced) {
          console.log('⚠️ Ignoring request - provider not ready');
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
        this.currentPosition = await this.geolocation.getCurrentPosition();
        await this.syncProviderLocation(this.currentPosition);
        this.locationErrorMessage = '';
        this.websocket.disconnect();
        await this.websocket.connect();
        void this.providerWorkspace.fetchPendingBacklog();
        await this.showToast('Estas disponible para recibir solicitudes', 'success');
      } catch (error) {
        console.error('Error connecting WebSocket:', error);
        this.isLocationSynced = false;
        this.isAvailable = false;
        this.websocket.disconnect();
        this.locationErrorMessage = this.describeLocationError(error);
        await this.showToast(this.locationErrorMessage, 'danger');
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
    if (this.activeJob?.requestId === request.requestId) {
      this.navigateToActiveJob();
      return;
    }
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
      this.locationErrorMessage = '';
      this.currentPosition = await this.geolocation.getCurrentPosition();
      await this.syncProviderLocation(this.currentPosition);
      await this.watchLocation();
      if (this.isAvailable) {
        this.websocket.disconnect();
        await this.websocket.connect();
        void this.providerWorkspace.fetchPendingBacklog();
      }
      await this.showToast(this.isAvailable
        ? 'Ubicación actualizada para recibir solicitudes cercanas'
        : 'Ubicación actualizada. Activa tu disponibilidad para recibir solicitudes', 'success');
    } catch (error) {
      console.error('Error refreshing location:', error);
      this.isLocationSynced = false;
      this.isAvailable = false;
      this.websocket.disconnect();
      this.locationErrorMessage = this.describeLocationError(error);
      await this.showToast(this.locationErrorMessage, 'danger');
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
              await this.pushNotifications.disable();
              this.providerWorkspace.clearAll();
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
    if (!this.isLocationSynced) return 'Ubicación no sincronizada';
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
    return this.sentResponses.filter(response => response.status === 'accepted' || response.status === 'completed').length;
  }

  get greetingText(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 20) return 'Buenas tardes';
    return 'Buenas noches';
  }
}
