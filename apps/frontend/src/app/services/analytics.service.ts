import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

export interface MVPMetrics {
  userRegistrations: number;
  providerRegistrations: number;
  searchesPerformed: number;
  contactsMade: number;
  activeUsers: number;
  popularCategories: string[];
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private apiUrl = environment.baseUrl + '/analytics';

  constructor(private http: HttpClient) {}

  // Eventos críticos para MVP
  trackUserRegistration(source: 'mobile' | 'web') {
    this.trackEvent('user_registration', { source });
  }

  trackProviderRegistration(categories: string[]) {
    this.trackEvent('provider_registration', { categories });
  }

  trackSearch(query: string, category: string, location: any) {
    this.trackEvent('search_performed', { query, category, location });
  }

  trackContact(providerType: string, contactMethod: 'whatsapp' | 'phone' | 'email') {
    this.trackEvent('contact_made', { providerType, contactMethod });
  }

  trackAppOpen() {
    this.trackEvent('app_opened', { timestamp: new Date() });
  }

  private trackEvent(eventName: string, data: any) {
    const event = {
      name: eventName,
      data,
      timestamp: new Date(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // Enviar al backend
    this.http.post(`${this.apiUrl}/events`, event).subscribe({
      next: () => console.log(`Event tracked: ${eventName}`),
      error: (err) => console.error('Analytics error:', err)
    });

    // También enviar a Google Analytics si lo tienes
    if ((window as any).gtag) {
      (window as any).gtag('event', eventName, data);
    }
  }

  // Obtener métricas del dashboard
  async getMVPMetrics(): Promise<MVPMetrics> {
    try {
      return await this.http.get<MVPMetrics>(`${this.apiUrl}/mvp-metrics`).toPromise() as MVPMetrics;
    } catch (error) {
      console.error('Error getting MVP metrics:', error);
      return {
        userRegistrations: 0,
        providerRegistrations: 0,
        searchesPerformed: 0,
        contactsMade: 0,
        activeUsers: 0,
        popularCategories: []
      };
    }
  }
}
