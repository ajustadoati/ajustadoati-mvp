import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, RefresherCustomEvent, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { JobHistoryEntry } from '../../../interfaces/request.interface';
import { ProviderWorkspaceService } from '../../../services/provider-workspace.service';

@Component({
  selector: 'app-jobs-history',
  templateUrl: './jobs-history.page.html',
  styleUrls: ['./jobs-history.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class JobsHistoryPage implements OnInit, OnDestroy {
  jobs: JobHistoryEntry[] = [];
  filteredJobs: JobHistoryEntry[] = [];
  selectedFilter: 'today' | 'week' | 'month' = 'week';

  // Stats
  totalJobs = 0;
  totalEarnings = 0;
  averageRating = 0;

  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private providerWorkspace: ProviderWorkspaceService
  ) {}

  ngOnInit() {
    console.log('Jobs History page initialized');
    this.loadJobHistory();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private loadJobHistory() {
    this.jobs = this.providerWorkspace.readJobHistory();

    this.applyFilter();
    this.calculateStats();
  }

  private calculateStats() {
    this.totalJobs = this.filteredJobs.length;
    this.totalEarnings = this.filteredJobs.reduce((sum, job) => sum + (job.price || 0), 0);

    const ratedJobs = this.filteredJobs.filter(job => job.rating);
    if (ratedJobs.length > 0) {
      this.averageRating = ratedJobs.reduce((sum, job) => sum + (job.rating || 0), 0) / ratedJobs.length;
    } else {
      this.averageRating = 0;
    }
  }

  onFilterChange(event: any) {
    this.selectedFilter = event.detail.value;
    this.applyFilter();
    this.calculateStats();
  }

  private applyFilter() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    switch (this.selectedFilter) {
      case 'today':
        this.filteredJobs = this.jobs.filter(job => job.completedAt >= todayStart);
        break;
      case 'week':
        this.filteredJobs = this.jobs.filter(job => job.completedAt >= weekStart);
        break;
      case 'month':
        this.filteredJobs = this.jobs.filter(job => job.completedAt >= monthStart);
        break;
      default:
        this.filteredJobs = [...this.jobs];
    }

    // Sort by date descending
    this.filteredJobs.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  }

  handleRefresh(event: RefresherCustomEvent) {
    this.loadJobHistory();
    setTimeout(() => {
      event.target.complete();
      this.showToast('Historial actualizado', 'success');
    }, 1000);
  }

  getFormattedDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));

    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 7) return `Hace ${days} dias`;

    return date.toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'short'
    });
  }

  getStarArray(rating: number): number[] {
    return Array(5).fill(0).map((_, i) => i < rating ? 1 : 0);
  }

  goBack() {
    this.router.navigate(['/provider/home']);
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
