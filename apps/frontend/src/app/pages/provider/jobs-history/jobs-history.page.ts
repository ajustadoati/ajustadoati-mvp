import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, RefresherCustomEvent } from '@ionic/angular';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { BackendAuthService } from '../../../services/backend-auth.service';
import { ProviderSentResponse, ProviderWorkspaceService } from '../../../services/provider-workspace.service';

type ActivityFilter = 'all' | 'sent' | 'accepted' | 'completed';

@Component({
  selector: 'app-jobs-history',
  templateUrl: './jobs-history.page.html',
  styleUrls: ['./jobs-history.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class JobsHistoryPage implements OnInit, OnDestroy {
  responses: ProviderSentResponse[] = [];
  filteredResponses: ProviderSentResponse[] = [];
  selectedFilter: ActivityFilter = 'all';
  isRefreshing = false;
  loadError = '';

  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private auth: BackendAuthService,
    private providerWorkspace: ProviderWorkspaceService
  ) {}

  ngOnInit() {
    this.providerWorkspace.ensureBelongsTo(this.auth.currentUser?.email);
    this.subscriptions.push(this.providerWorkspace.sentResponses$.subscribe(responses => {
      this.responses = responses;
      this.applyFilter();
    }));
    void this.refreshActivity();
  }

  ionViewWillEnter() {
    void this.refreshActivity();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  get acceptedCount(): number {
    return this.responses.filter(item => item.status === 'accepted' || item.status === 'completed').length;
  }

  get completedCount(): number {
    return this.responses.filter(item => item.status === 'completed').length;
  }

  onFilterChange(event: Event) {
    const value = (event as CustomEvent<{ value?: string }>).detail?.value;
    if (value !== 'all' && value !== 'sent' && value !== 'accepted' && value !== 'completed') return;
    this.selectedFilter = value;
    this.applyFilter();
  }

  private applyFilter() {
    this.filteredResponses = this.responses
      .filter(item => this.selectedFilter === 'all' || item.status === this.selectedFilter)
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  }

  async refreshActivity() {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    try {
      this.loadError = await this.providerWorkspace.refreshProviderActivity()
        ? '' : 'No pudimos actualizar la actividad. Mostramos los datos guardados en este dispositivo.';
    } finally {
      this.isRefreshing = false;
    }
  }

  async handleRefresh(event: RefresherCustomEvent) {
    try {
      await this.refreshActivity();
    } finally {
      await event.target.complete();
    }
  }

  statusText(status: ProviderSentResponse['status']): string {
    switch (status) {
      case 'accepted': return 'Aceptada';
      case 'completed': return 'Completada';
      case 'expired': return 'Vencida';
      case 'not_selected': return 'No elegida';
      default: return 'Enviada';
    }
  }

  openAcceptedJob(response: ProviderSentResponse) {
    if (response.status === 'accepted'
      && this.providerWorkspace.getActiveJob()?.requestId === response.request.requestId) {
      this.router.navigate(['/provider/active-job']);
    }
  }

  goBack() {
    this.router.navigate(['/provider/home']);
  }
}
