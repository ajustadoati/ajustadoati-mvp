import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  businessOutline,
  checkmarkCircle,
  chatbubbleEllipsesOutline,
  closeCircle,
  ellipse,
  flaskOutline,
  peopleOutline,
  refreshOutline,
  sendOutline,
  wifiOutline
} from 'ionicons/icons';
import { AdminService, AdminProvider, AdminStats, GuestRequestSummary } from '../../services/admin.service';
import { CategoryService } from '../../services/category.service';
import { Category } from '../../interfaces/category';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class AdminPage implements OnInit {
  stats: AdminStats | null = null;
  providers: AdminProvider[] = [];
  guestRequests: GuestRequestSummary[] = [];
  categories: Category[] = [];
  isLoading = false;
  isForbidden = false;
  errorMessage = '';

  // Respond-as-admin modal state
  respondModalOpen = false;
  respondTarget: GuestRequestSummary | null = null;
  respondMessage = '';
  isSendingResponse = false;

  constructor(
    private adminService: AdminService,
    private categoryService: CategoryService,
    private router: Router,
    private toastCtrl: ToastController
  ) {
    addIcons({
      arrowBackOutline,
      businessOutline,
      checkmarkCircle,
      chatbubbleEllipsesOutline,
      closeCircle,
      ellipse,
      flaskOutline,
      peopleOutline,
      refreshOutline,
      sendOutline,
      wifiOutline
    });
  }

  async ngOnInit() {
    try {
      this.categories = await firstValueFrom(this.categoryService.getCategories());
    } catch {
      this.categories = [];
    }
    await this.loadData();
  }

  async loadData() {
    this.isLoading = true;
    this.isForbidden = false;
    this.errorMessage = '';

    try {
      const [stats, providers, requests] = await Promise.all([
        this.adminService.getStats(),
        this.adminService.getProviders(),
        this.adminService.getGuestRequests()
      ]);
      this.stats = stats;
      this.providers = providers;
      this.guestRequests = requests;
    } catch (error: any) {
      if (error?.status === 403) {
        this.isForbidden = true;
      } else if (error?.status === 401) {
        this.router.navigate(['/auth/login']);
      } else {
        this.errorMessage = 'No se pudo cargar la información. Verifica que el backend esté activo.';
      }
    } finally {
      this.isLoading = false;
    }
  }

  getCategoryName(categoryId: number): string {
    return this.categories.find(c => c.id === categoryId)?.name || `Cat. ${categoryId}`;
  }

  requestStatusLabel(request: GuestRequestSummary): string {
    switch (request.status) {
      case 'accepted': return 'Aceptada';
      case 'expired': return 'Caducada';
      case 'responded': return 'Respondida';
      default: return 'Pendiente';
    }
  }

  requestStatusColor(request: GuestRequestSummary): string {
    switch (request.status) {
      case 'accepted': return 'success';
      case 'expired': return 'danger';
      case 'responded': return 'primary';
      default: return 'medium';
    }
  }

  goBack() {
    this.router.navigate(['/']);
  }

  canRespond(request: GuestRequestSummary): boolean {
    return request.status !== 'expired' && request.status !== 'accepted';
  }

  openRespondModal(request: GuestRequestSummary) {
    this.respondTarget = request;
    this.respondMessage = '';
    this.respondModalOpen = true;
  }

  closeRespondModal() {
    this.respondModalOpen = false;
    this.respondTarget = null;
    this.respondMessage = '';
  }

  async sendResponse() {
    const target = this.respondTarget;
    const message = this.respondMessage.trim();
    if (!target || !message) return;

    this.isSendingResponse = true;
    try {
      await this.adminService.respondToGuestRequest(target.requestId, message);
      await this.showToast('Respuesta enviada al cliente.', 'success');
      this.closeRespondModal();
      await this.loadData();
    } catch (error: any) {
      const msg = error?.error?.message || 'No se pudo enviar la respuesta.';
      await this.showToast(msg, 'danger');
    } finally {
      this.isSendingResponse = false;
    }
  }

  private async showToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'top'
    });
    await toast.present();
  }
}
