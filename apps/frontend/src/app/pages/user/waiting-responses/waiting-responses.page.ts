import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { SearchRequestService, SearchSession, ProviderResponse } from '../../../services/search-request.service';
import { UserRequestService } from '../../../services/user-request.service';
import { AjustadoAtiWebSocketService } from '../../../services/ajustadoati-websocket.service';
import { ProviderOffer, RequestStatus } from '../../../interfaces/request.interface';

@Component({
  selector: 'app-waiting-responses',
  templateUrl: './waiting-responses.page.html',
  styleUrls: ['./waiting-responses.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class WaitingResponsesPage implements OnInit, OnDestroy {
  currentSession: SearchSession | null = null;
  isSearchActive = false;
  searchStats = { total: 0, accepted: 0, rejected: 0 };
  isWebSocketConnected = false;

  // Countdown timer
  searchTimeRemaining = 60;
  searchCountdownDisplay = '1:00';

  private subscriptions: Subscription[] = [];
  private countdownInterval: Subscription | null = null;

  constructor(
    private router: Router,
    private searchService: SearchRequestService,
    private userRequestService: UserRequestService,
    private websocketService: AjustadoAtiWebSocketService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    console.log('🔍 Waiting Responses page initialized');
    this.subscribeToSearchUpdates();
    this.subscribeToWebSocketStatus();
    this.startCountdown();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.stopCountdown();
  }

  private subscribeToSearchUpdates() {
    // Subscribe to current search session
    const sessionSub = this.searchService.getCurrentSearchSession()
      .subscribe(session => {
        this.currentSession = session;
        this.isSearchActive = session?.isActive || false;
        if (session) {
          this.searchStats = this.searchService.getCurrentSearchStats();
          console.log('Updated search stats:', this.searchStats);
          console.log('Current session responses:', session.responses.length);
        }
      });

    // Subscribe to incoming responses
    const responsesSub = this.searchService.getIncomingResponses()
      .subscribe(response => {
        console.log('New provider response received:', response);
        this.searchStats = this.searchService.getCurrentSearchStats();

        // Also add to UserRequestService for persistence
        this.addResponseToUserRequest(response);
      });

    // Subscribe directly to WebSocket provider responses
    const directResponsesSub = this.websocketService.getProviderResponses()
      .subscribe(wsResponse => {
        console.log('Direct WebSocket provider response received:', wsResponse);
      });

    this.subscriptions.push(sessionSub, responsesSub, directResponsesSub);
  }

  private addResponseToUserRequest(response: ProviderResponse) {
    const offer: ProviderOffer = {
      id: response.id,
      requestId: response.requestId,
      providerId: response.providerId,
      providerName: response.providerName,
      providerEmail: response.providerEmail,
      message: response.message,
      estimatedTime: response.estimatedTime,
      price: response.price,
      latitude: response.latitude,
      longitude: response.longitude,
      accepted: response.accepted,
      timestamp: response.timestamp
    };

    this.userRequestService.addProviderResponse(offer);
  }

  private subscribeToWebSocketStatus() {
    const connectionSub = this.websocketService.getConnectionStatus()
      .subscribe(isConnected => {
        this.isWebSocketConnected = isConnected;
        console.log('WebSocket connection status:', isConnected);
      });

    this.subscriptions.push(connectionSub);
  }

  private startCountdown() {
    this.searchTimeRemaining = 60;
    this.updateCountdownDisplay();

    this.countdownInterval = interval(1000).subscribe(() => {
      if (this.searchTimeRemaining > 0 && this.isSearchActive) {
        this.searchTimeRemaining--;
        this.updateCountdownDisplay();
      } else if (this.searchTimeRemaining <= 0) {
        this.stopCountdown();
      }
    });

    this.subscriptions.push(this.countdownInterval);
  }

  private stopCountdown() {
    if (this.countdownInterval) {
      this.countdownInterval.unsubscribe();
      this.countdownInterval = null;
    }
  }

  private updateCountdownDisplay() {
    const minutes = Math.floor(this.searchTimeRemaining / 60);
    const seconds = this.searchTimeRemaining % 60;
    this.searchCountdownDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  goBack() {
    this.router.navigate(['/user/home']);
  }

  finishSearch() {
    this.searchService.finishCurrentSearch();
    this.router.navigate(['/user/home']);
  }

  async acceptOffer(response: ProviderResponse) {
    const alert = await this.alertCtrl.create({
      header: 'Aceptar Oferta',
      message: `Quieres aceptar la oferta de ${response.providerName}?
${response.price ? `\nPrecio: $${response.price.toLocaleString()}` : ''}
${response.estimatedTime ? `\nTiempo estimado: ${response.estimatedTime} min` : ''}`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Aceptar',
          handler: async () => {
            await this.confirmAcceptOffer(response);
          }
        }
      ]
    });

    await alert.present();
  }

  private async confirmAcceptOffer(response: ProviderResponse) {
    try {
      // Accept in SearchRequestService
      this.searchService.acceptProviderResponse(response.id);

      // Accept in UserRequestService for persistence
      const offer: ProviderOffer = {
        id: response.id,
        requestId: response.requestId,
        providerId: response.providerId,
        providerName: response.providerName,
        providerEmail: response.providerEmail,
        providerPhone: response.providerPhone,
        message: response.message,
        estimatedTime: response.estimatedTime,
        price: response.price,
        latitude: response.latitude,
        longitude: response.longitude,
        accepted: true,
        timestamp: response.timestamp
      };

      const activeRequest = this.userRequestService.getCurrentActiveRequest();
      if (activeRequest) {
        await this.userRequestService.acceptOffer(activeRequest.id, offer);
      }

      await this.showToast('Oferta aceptada! El proveedor ha sido notificado.', 'success');

      // Navigate to active request page
      this.router.navigate(['/user/active-request']);

    } catch (error) {
      console.error('Error accepting offer:', error);
      await this.showToast('Error al aceptar la oferta. Intenta de nuevo.', 'danger');
    }
  }

  async contactProvider(response: ProviderResponse) {
    // The response already carries the provider's phone from the backend's
    // WebSocket payload (providerInfo.phone). Use it directly; fall back to
    // matching against the session's provider list only if missing.
    const phone =
      response.providerPhone ||
      this.currentSession?.providers.find(p => p.email === response.providerEmail)?.phone;

    const cleanPhone = phone ? phone.replace(/[^0-9+]/g, '') : '';
    if (cleanPhone) {
      const text = encodeURIComponent(`Hola ${response.providerName}, vi tu respuesta sobre: ${response.message}`);
      window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
      return;
    }

    // No usable phone — open email instead
    const subject = encodeURIComponent('Consulta sobre servicio');
    const body = encodeURIComponent(
      `Hola ${response.providerName},\n\nVi tu respuesta: "${response.message}"\n\n¿Podrías darme más información?\n\nGracias`
    );
    window.open(`mailto:${response.providerEmail}?subject=${subject}&body=${body}`, '_blank');
  }

  viewOnMap() {
    if (this.currentSession) {
      this.router.navigate(['/map'], {
        queryParams: {
          lat: this.currentSession.searchRequest.userLatitude,
          lng: this.currentSession.searchRequest.userLongitude,
          search: this.currentSession.searchRequest.productName
        }
      });
    }
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
}
