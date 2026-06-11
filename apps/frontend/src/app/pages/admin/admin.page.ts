import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  businessOutline,
  checkmarkCircle,
  closeCircle,
  ellipse,
  flaskOutline,
  peopleOutline,
  refreshOutline,
  wifiOutline
} from 'ionicons/icons';
import { AdminService, AdminProvider, AdminStats, DemoRequestSummary } from '../../services/admin.service';
import { CategoryService } from '../../services/category.service';
import { Category } from '../../interfaces/category';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class AdminPage implements OnInit {
  stats: AdminStats | null = null;
  providers: AdminProvider[] = [];
  demoRequests: DemoRequestSummary[] = [];
  categories: Category[] = [];
  isLoading = false;
  isForbidden = false;
  errorMessage = '';

  constructor(
    private adminService: AdminService,
    private categoryService: CategoryService,
    private router: Router
  ) {
    addIcons({
      arrowBackOutline,
      businessOutline,
      checkmarkCircle,
      closeCircle,
      ellipse,
      flaskOutline,
      peopleOutline,
      refreshOutline,
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
      const [stats, providers, demos] = await Promise.all([
        this.adminService.getStats(),
        this.adminService.getProviders(),
        this.adminService.getDemoRequests()
      ]);
      this.stats = stats;
      this.providers = providers;
      this.demoRequests = demos;
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

  demoStatusLabel(demo: DemoRequestSummary): string {
    if (demo.status === 'accepted') return 'Aceptada';
    if (demo.responsesCount > 0) return 'Respondida';
    return 'Sin respuesta';
  }

  demoStatusColor(demo: DemoRequestSummary): string {
    if (demo.status === 'accepted') return 'success';
    if (demo.responsesCount > 0) return 'primary';
    return 'medium';
  }

  goBack() {
    this.router.navigate(['/']);
  }
}
