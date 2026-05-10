import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, RefresherCustomEvent, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { combineLatest, Subscription } from 'rxjs';
import { UserRequestService } from '../../../services/user-request.service';
import { UserServiceRequest, RequestStatus } from '../../../interfaces/request.interface';

interface RequestStats {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
}

type FilterType = 'all' | 'active' | 'completed';

@Component({
  selector: 'app-requests',
  templateUrl: './requests.page.html',
  styleUrls: ['./requests.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class RequestsPage implements OnInit, OnDestroy {
  userRequests: UserServiceRequest[] = [];
  filteredRequests: UserServiceRequest[] = [];
  selectedFilter: FilterType = 'all';

  requestStats: RequestStats = {
    total: 0,
    active: 0,
    completed: 0,
    cancelled: 0
  };

  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private userRequestService: UserRequestService
  ) {}

  ngOnInit() {
    console.log('📝 User Requests page initialized');
    this.loadUserRequests();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  ionViewWillEnter() {
    // Refresh data when entering the page
    this.loadUserRequests();
  }

  private loadUserRequests() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];

    const requestsSub = combineLatest([
      this.userRequestService.getActiveRequest(),
      this.userRequestService.getRequestHistory()
    ]).subscribe(([activeRequest, history]) => {
      this.userRequests = activeRequest
        ? [activeRequest, ...history.filter(request => request.id !== activeRequest.id)]
        : history;

      this.updateStats();
      this.applyFilter();
    });

    this.subscriptions.push(requestsSub);
  }

  private updateStats() {
    const activeStatuses = [
      RequestStatus.SEARCHING,
      RequestStatus.WAITING_RESPONSES,
      RequestStatus.OFFER_ACCEPTED,
      RequestStatus.IN_PROGRESS
    ];

    this.requestStats = {
      total: this.userRequests.length,
      active: this.userRequests.filter(req => activeStatuses.includes(req.status)).length,
      completed: this.userRequests.filter(req => req.status === RequestStatus.COMPLETED).length,
      cancelled: this.userRequests.filter(req =>
        req.status === RequestStatus.CANCELLED || req.status === RequestStatus.EXPIRED
      ).length
    };
  }

  onFilterChange(event: any) {
    this.selectedFilter = event.detail.value;
    this.applyFilter();
  }

  private applyFilter() {
    const activeStatuses = [
      RequestStatus.SEARCHING,
      RequestStatus.WAITING_RESPONSES,
      RequestStatus.OFFER_ACCEPTED,
      RequestStatus.IN_PROGRESS
    ];

    switch (this.selectedFilter) {
      case 'active':
        this.filteredRequests = this.userRequests.filter(req =>
          activeStatuses.includes(req.status)
        );
        break;
      case 'completed':
        this.filteredRequests = this.userRequests.filter(req =>
          this.isClosedRequest(req)
        );
        break;
      default:
        this.filteredRequests = [...this.userRequests];
    }

    // Sort by creation date descending
    this.filteredRequests.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  handleRefresh(event: RefresherCustomEvent) {
    this.loadUserRequests();
    setTimeout(() => {
      event.target.complete();
      this.showToast('Solicitudes actualizadas', 'success');
    }, 1000);
  }

  createNewRequest() {
    console.log('📝 Creating new service request');
    this.router.navigate(['/user/home']);
  }

  viewRequestDetails(request: UserServiceRequest) {
    console.log('📝 Viewing request details:', request.id);

    if (this.isActiveRequest(request)) {
      this.router.navigate(['/user/active-request']);
    } else if (request.status === RequestStatus.WAITING_RESPONSES) {
      this.router.navigate(['/user/waiting-responses']);
    }
  }

  async cancelRequest(request: UserServiceRequest) {
    console.log('📝 Cancelling request:', request.id);

    try {
      await this.userRequestService.cancelRequest(request.id);
      this.showToast('Solicitud cancelada', 'success');
    } catch (error) {
      console.error('Error cancelling request:', error);
      this.showToast('Error al cancelar solicitud', 'danger');
    }
  }

  repeatRequest(request: UserServiceRequest) {
    console.log('📝 Repeating request:', request.id);
    this.router.navigate(['/user/home'], {
      queryParams: {
        categoryId: request.categoryId,
        description: request.description
      }
    });
  }

  trackByRequestId(index: number, request: UserServiceRequest): string {
    return request.id;
  }

  isActiveRequest(request: UserServiceRequest): boolean {
    return request.status === RequestStatus.OFFER_ACCEPTED ||
           request.status === RequestStatus.IN_PROGRESS;
  }

  isWaitingRequest(request: UserServiceRequest): boolean {
    return request.status === RequestStatus.SEARCHING ||
           request.status === RequestStatus.WAITING_RESPONSES;
  }

  isClosedRequest(request: UserServiceRequest): boolean {
    return request.status === RequestStatus.COMPLETED ||
           request.status === RequestStatus.CANCELLED ||
           request.status === RequestStatus.EXPIRED;
  }

  getStatusLabel(status: RequestStatus): string {
    const labels: { [key: string]: string } = {
      [RequestStatus.SEARCHING]: 'Buscando',
      [RequestStatus.WAITING_RESPONSES]: 'Esperando',
      [RequestStatus.OFFER_ACCEPTED]: 'Aceptada',
      [RequestStatus.IN_PROGRESS]: 'En Progreso',
      [RequestStatus.COMPLETED]: 'Completada',
      [RequestStatus.CANCELLED]: 'Cancelada',
      [RequestStatus.EXPIRED]: 'Expirada'
    };
    return labels[status] || status;
  }

  getStatusColor(status: RequestStatus): string {
    const colors: { [key: string]: string } = {
      [RequestStatus.SEARCHING]: 'warning',
      [RequestStatus.WAITING_RESPONSES]: 'tertiary',
      [RequestStatus.OFFER_ACCEPTED]: 'success',
      [RequestStatus.IN_PROGRESS]: 'primary',
      [RequestStatus.COMPLETED]: 'medium',
      [RequestStatus.CANCELLED]: 'danger',
      [RequestStatus.EXPIRED]: 'medium'
    };
    return colors[status] || 'medium';
  }

  getFormattedDate(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diff = now.getTime() - dateObj.getTime();
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));

    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 7) return `Hace ${days} dias`;

    return dateObj.toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'short'
    });
  }

  goBack() {
    this.router.navigate(['/user/home']);
  }

  navigateToProfile() {
    this.router.navigate(['/user/profile']);
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger' = 'success') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'top'
    });
    await toast.present();
  }
}
