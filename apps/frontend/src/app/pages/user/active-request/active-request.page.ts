import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { UserRequestService } from '../../../services/user-request.service';
import { SearchRequestService } from '../../../services/search-request.service';
import {
  UserServiceRequest,
  AcceptedOfferDetails,
  JobStatus,
  RequestStatus
} from '../../../interfaces/request.interface';

@Component({
  selector: 'app-active-request',
  templateUrl: './active-request.page.html',
  styleUrls: ['./active-request.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ActiveRequestPage implements OnInit, OnDestroy {
  activeRequest: UserServiceRequest | null = null;
  acceptedOffer: AcceptedOfferDetails | null = null;

  // ETA tracking
  etaMinutes: number | null = null;
  etaDisplay = '';
  isServiceConfirmedDone = false;

  private subscriptions: Subscription[] = [];
  private etaInterval: Subscription | null = null;
  private activeRequestId: string | null = null;

  constructor(
    private router: Router,
    private userRequestService: UserRequestService,
    private searchRequestService: SearchRequestService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    console.log('Active Request page initialized');
    this.subscribeToActiveRequest();
    this.startEtaTracking();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.stopEtaTracking();
  }

  private subscribeToActiveRequest() {
    const requestSub = this.userRequestService.getActiveRequest()
      .subscribe(request => {
        if (request?.id !== this.activeRequestId) {
          this.activeRequestId = request?.id || null;
          this.isServiceConfirmedDone = false;
        }

        this.activeRequest = request;
        this.acceptedOffer = request?.acceptedOffer || null;

        if (!request || request.status === RequestStatus.COMPLETED) {
          // No active request, go back to home
          console.log('No active request, navigating to home');
        }

        this.updateEta();
      });

    this.subscriptions.push(requestSub);
  }

  private startEtaTracking() {
    this.etaInterval = interval(30000).subscribe(() => {
      this.updateEta();
    });
    this.subscriptions.push(this.etaInterval);
  }

  private stopEtaTracking() {
    if (this.etaInterval) {
      this.etaInterval.unsubscribe();
      this.etaInterval = null;
    }
  }

  private updateEta() {
    if (!this.acceptedOffer?.estimatedArrival) {
      this.etaMinutes = null;
      this.etaDisplay = 'Calculando...';
      return;
    }

    const now = new Date().getTime();
    const arrival = this.acceptedOffer.estimatedArrival.getTime();
    const diff = arrival - now;

    if (diff <= 0) {
      this.etaMinutes = 0;
      this.etaDisplay = 'Llegando';
    } else {
      this.etaMinutes = Math.ceil(diff / (60 * 1000));
      this.etaDisplay = `${this.etaMinutes} min`;
    }
  }

  goBack() {
    this.router.navigate(['/user/home']);
  }

  async callProvider() {
    if (!this.acceptedOffer?.providerPhone) {
      await this.showToast('No hay numero de telefono disponible', 'warning');
      return;
    }

    const cleanPhone = this.acceptedOffer.providerPhone.replace(/[^0-9+]/g, '');
    window.open(`tel:${cleanPhone}`, '_system');
  }

  async openWhatsApp() {
    const phone = this.acceptedOffer?.providerPhone;
    if (!phone) {
      await this.showToast('No hay numero de telefono disponible', 'warning');
      return;
    }

    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const message = encodeURIComponent(`Hola ${this.acceptedOffer?.providerName}, soy tu cliente de AjustadoATi. Estoy esperando tu llegada.`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  }

  async cancelRequest() {
    const alert = await this.alertCtrl.create({
      header: 'Cancelar Solicitud',
      message: 'Estas seguro de que quieres cancelar esta solicitud? El proveedor sera notificado.',
      buttons: [
        {
          text: 'No, continuar',
          role: 'cancel'
        },
        {
          text: 'Si, cancelar',
          handler: async () => {
            await this.performCancellation();
          }
        }
      ]
    });

    await alert.present();
  }

  async confirmServiceFinished() {
    this.isServiceConfirmedDone = true;
    await this.showToast('Servicio confirmado como terminado', 'success');
  }

  async closeCompletedRequest() {
    if (!this.activeRequest) {
      this.router.navigate(['/user/requests']);
      return;
    }

    try {
      await this.userRequestService.completeRequest(this.activeRequest.id);
      this.searchRequestService.clearCurrentSession();
      await this.showToast('Solicitud cerrada y movida al historial', 'success');
      this.router.navigate(['/user/requests']);
    } catch (error) {
      console.error('Error closing completed request:', error);
      await this.showToast('No se pudo cerrar la solicitud', 'danger');
    }
  }

  get currentJobStatus(): JobStatus {
    return this.isCompletedView ? JobStatus.COMPLETED : (this.acceptedOffer?.jobStatus || JobStatus.EN_ROUTE);
  }

  get isCompletedView(): boolean {
    return this.isServiceConfirmedDone || this.acceptedOffer?.jobStatus === JobStatus.COMPLETED;
  }

  private async performCancellation() {
    try {
      if (this.activeRequest) {
        await this.userRequestService.cancelRequest(this.activeRequest.id);
        await this.showToast('Solicitud cancelada', 'warning');
        this.router.navigate(['/user/home']);
      }
    } catch (error) {
      console.error('Error cancelling request:', error);
      await this.showToast('Error al cancelar la solicitud', 'danger');
    }
  }

  getStatusIcon(): string {
    if (this.isCompletedView) return 'checkmark-circle-outline';
    if (!this.acceptedOffer) return 'hourglass-outline';

    switch (this.acceptedOffer.jobStatus) {
      case JobStatus.EN_ROUTE:
        return 'car-outline';
      case JobStatus.ARRIVING:
        return 'navigate-outline';
      case JobStatus.ON_SITE:
        return 'location-outline';
      case JobStatus.WORKING:
        return 'construct-outline';
      case JobStatus.COMPLETED:
        return 'checkmark-circle-outline';
      default:
        return 'hourglass-outline';
    }
  }

  getStatusText(): string {
    if (this.isCompletedView) return 'Servicio terminado';
    if (!this.acceptedOffer) return 'Esperando...';

    switch (this.acceptedOffer.jobStatus) {
      case JobStatus.EN_ROUTE:
        return 'En camino';
      case JobStatus.ARRIVING:
        return 'Llegando';
      case JobStatus.ON_SITE:
        return 'En sitio';
      case JobStatus.WORKING:
        return 'Trabajando';
      case JobStatus.COMPLETED:
        return 'Completado';
      default:
        return 'Esperando...';
    }
  }

  getStatusColor(): string {
    if (this.isCompletedView) return 'success';
    if (!this.acceptedOffer) return 'medium';

    switch (this.acceptedOffer.jobStatus) {
      case JobStatus.EN_ROUTE:
        return 'primary';
      case JobStatus.ARRIVING:
        return 'warning';
      case JobStatus.ON_SITE:
        return 'success';
      case JobStatus.WORKING:
        return 'tertiary';
      case JobStatus.COMPLETED:
        return 'success';
      default:
        return 'medium';
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
