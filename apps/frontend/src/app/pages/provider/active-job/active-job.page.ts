import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ProviderActiveJob, JobStatus } from '../../../interfaces/request.interface';
import { ProviderWorkspaceService } from '../../../services/provider-workspace.service';

@Component({
  selector: 'app-active-job',
  templateUrl: './active-job.page.html',
  styleUrls: ['./active-job.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ActiveJobPage implements OnInit, OnDestroy {
  activeJob: ProviderActiveJob | null = null;

  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private providerWorkspace: ProviderWorkspaceService
  ) {}

  ngOnInit() {
    console.log('Active Job page initialized');
    this.loadActiveJob();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private loadActiveJob() {
    const activeJobSub = this.providerWorkspace.activeJob$
      .subscribe(activeJob => {
        this.activeJob = activeJob;
      });

    this.subscriptions.push(activeJobSub);
  }

  private saveActiveJob() {
    this.providerWorkspace.updateActiveJob(this.activeJob);
  }

  goBack() {
    this.router.navigate(['/provider/home']);
  }

  openNavigation() {
    if (!this.activeJob) return;

    const { latitude, longitude } = this.activeJob.clientLocation;

    // Try Google Maps first, fallback to generic maps
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    const wazeUrl = `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`;

    // Open Google Maps
    window.open(googleMapsUrl, '_blank');
  }

  async openWaze() {
    if (!this.activeJob) return;

    const { latitude, longitude } = this.activeJob.clientLocation;
    const wazeUrl = `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`;
    window.open(wazeUrl, '_blank');
  }

  async callClient() {
    if (!this.activeJob?.clientPhone) {
      await this.showToast('No hay numero de telefono disponible', 'warning');
      return;
    }

    const cleanPhone = this.activeJob.clientPhone.replace(/[^0-9+]/g, '');
    window.open(`tel:${cleanPhone}`, '_system');
  }

  async openWhatsApp() {
    if (!this.activeJob?.clientPhone) {
      await this.showToast('No hay numero de telefono disponible', 'warning');
      return;
    }

    const cleanPhone = this.activeJob.clientPhone.replace(/[^0-9+]/g, '');
    const message = encodeURIComponent(`Hola ${this.activeJob.clientName}, soy tu proveedor de AjustadoATi. Voy en camino.`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  }

  async markArrived() {
    if (!this.activeJob) return;

    const alert = await this.alertCtrl.create({
      header: 'Confirmar Llegada',
      message: 'Has llegado a la ubicacion del cliente?',
      buttons: [
        {
          text: 'No',
          role: 'cancel'
        },
        {
          text: 'Si, he llegado',
          handler: () => {
            this.updateJobStatus(JobStatus.ON_SITE);
          }
        }
      ]
    });

    await alert.present();
  }

  async markCompleted() {
    if (!this.activeJob) return;

    const alert = await this.alertCtrl.create({
      header: 'Completar Trabajo',
      message: 'Has terminado el trabajo?',
      buttons: [
        {
          text: 'No',
          role: 'cancel'
        },
        {
          text: 'Si, completado',
          handler: async () => {
            await this.completeJob();
          }
        }
      ]
    });

    await alert.present();
  }

  private updateJobStatus(status: JobStatus) {
    if (!this.activeJob) return;

    this.activeJob = {
      ...this.activeJob,
      status,
      ...(status === JobStatus.ON_SITE && { arrivedAt: new Date() })
    };

    this.saveActiveJob();
    this.showToast(this.getStatusMessage(status), 'success');
  }

  private async completeJob() {
    if (!this.activeJob) return;

    this.activeJob = {
      ...this.activeJob,
      status: JobStatus.COMPLETED,
      completedAt: new Date()
    };

    this.providerWorkspace.updateActiveJob(this.activeJob);
    this.providerWorkspace.completeActiveJob();

    await this.showToast('Trabajo completado!', 'success');
    this.router.navigate(['/provider/home']);
  }

  private getStatusMessage(status: JobStatus): string {
    switch (status) {
      case JobStatus.EN_ROUTE:
        return 'Estas en camino';
      case JobStatus.ARRIVING:
        return 'Casi llegas';
      case JobStatus.ON_SITE:
        return 'Llegaste al sitio';
      case JobStatus.WORKING:
        return 'Trabajando';
      case JobStatus.COMPLETED:
        return 'Trabajo completado';
      default:
        return '';
    }
  }

  getStatusIcon(): string {
    if (!this.activeJob) return 'hourglass-outline';

    switch (this.activeJob.status) {
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
    if (!this.activeJob) return 'Cargando...';

    switch (this.activeJob.status) {
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
        return 'Cargando...';
    }
  }

  getStatusColor(): string {
    if (!this.activeJob) return 'medium';

    switch (this.activeJob.status) {
      case JobStatus.EN_ROUTE:
        return 'primary';
      case JobStatus.ARRIVING:
        return 'warning';
      case JobStatus.ON_SITE:
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
