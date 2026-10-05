import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AjustadoAtiWebSocketService } from './ajustadoati-websocket.service';
import { ProviderSearchResult } from '../interfaces/provider.interface';

export interface SearchRequest {
  id: string;
  productName: string;
  categoryId: string;
  categoryName?: string;
  userLatitude: number;
  userLongitude: number;
  requesterId?: string; // Solo si está registrado
  timestamp: Date;
  status: 'pending' | 'completed' | 'timeout' | 'accepted';
  urgency?: 'now' | 'today' | 'this_week';
  maxBudget?: number;
}

export interface ProviderResponse {
  id: string;
  requestId: string;
  providerId: string;
  providerName: string;
  providerEmail: string;
  providerPhone?: string;
  message: string;
  accepted: boolean;
  estimatedTime?: number;
  price?: number;
  latitude?: number;
  longitude?: number;
  timestamp: Date;
}

export interface SearchSession {
  searchRequest: SearchRequest;
  responses: ProviderResponse[];
  isActive: boolean;
  providers: ProviderSearchResult[]; // Lista de proveedores obtenidos del backend
  acceptedResponse?: ProviderResponse; // The accepted provider response
  isGuestSearch?: boolean;
  serverManaged?: boolean;
  notifiedProvidersCount?: number;
}

interface GuestRequestApiResponse {
  id: string;
  guestRef: string;
  categoryId: number;
  categoryName: string;
  message: string;
  latitude: number;
  longitude: number;
  maxDistanceKm: number;
  status: string;
  notifiedProviders: number;
  createdAt: string;
  updatedAt: string;
  responses: GuestProviderApiResponse[];
}

interface GuestProviderApiResponse {
  id: string;
  requestId: string;
  providerName: string;
  providerEmail: string;
  providerPhone?: string;
  message: string;
  latitude?: number;
  longitude?: number;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class SearchRequestService {
  private currentSearchSession$ = new BehaviorSubject<SearchSession | null>(null);
  private incomingResponses$ = new Subject<ProviderResponse>();
  private searchTimeout: any;
  private guestResponsePollingTimer: any;
  private readonly SEARCH_TIMEOUT = 60000; // 60 segundos

  constructor(
    private http: HttpClient,
    private websocketService: AjustadoAtiWebSocketService
  ) {
    console.log('🔍 SearchRequestService: Initializing WebSocket subscription');
    
    // Escuchar respuestas de proveedores via WebSocket
    this.websocketService.getProviderResponses().subscribe({
      next: (response) => {
        console.log('🔍 SearchRequestService: Received provider response from WebSocket', response);
        this.handleProviderResponse(response);
      },
      error: (error) => {
        console.error('🔍 SearchRequestService: Error in provider response subscription', error);
      },
      complete: () => {
        console.log('🔍 SearchRequestService: Provider response subscription completed');
      }
    });
    
    console.log('🔍 SearchRequestService: WebSocket subscription established');
  }

  /**
   * Crear una nueva búsqueda desde la app/web
   */
  private pendingSubmission: { signature: string; id: string } | null = null;
  private submissionInFlight: Promise<SearchSession> | null = null;

  async createSearchRequest(productName: string, userLocation: {lat: number, lng: number}, isGuestSearch = false): Promise<SearchSession> {
    if (this.submissionInFlight) return this.submissionInFlight;
    const message = productName.trim();
    const signature = JSON.stringify([message, userLocation, isGuestSearch]);
    if (this.pendingSubmission?.signature !== signature) {
      this.pendingSubmission = { signature, id: crypto.randomUUID() };
    }
    const operation = this.submitSearch(message, userLocation, isGuestSearch, this.pendingSubmission!.id);
    this.submissionInFlight = operation;
    try {
      return await operation;
    } finally {
      this.submissionInFlight = null;
    }
  }

  private async submitSearch(message: string, location: {lat: number, lng: number}, isGuestSearch: boolean, submissionId: string): Promise<SearchSession> {
    try {
      const response = await firstValueFrom(this.http.post<any>(`${environment.baseUrl}/search-requests`, {
        submissionId, message, latitude: location.lat, longitude: location.lng, maxDistanceKm: 50
      }));
      if (!response?.success || !response.data?.request) throw new Error('Respuesta de busqueda no valida.');
      const request: GuestRequestApiResponse = response.data.request;
      const session: SearchSession = {
        searchRequest: {
          id: request.id, productName: request.message,
          categoryId: String(request.categoryId), categoryName: request.categoryName,
          userLatitude: request.latitude, userLongitude: request.longitude,
          timestamp: new Date(request.createdAt), status: this.mapGuestRequestStatus(request.status, 'pending')
        },
        responses: this.mapGuestResponses(request.responses || []),
        isActive: !['expired', 'completed', 'accepted'].includes(request.status),
        providers: (response.data.providers || []).map((provider: any) => ({
          id: provider.id, userId: provider.id, name: provider.fullName || 'Proveedor',
          email: '', phone: '', businessName: provider.fullName, description: '',
          rating: 0, totalReviews: 0, isActive: provider.isActive ?? true, isVerified: false,
          categories: [{ categoryId: String(request.categoryId), categoryName: request.categoryName, experience: 0 }],
          locations: provider.location ? [{
            address: provider.location.address || '', latitude: provider.location.latitude,
            longitude: provider.location.longitude, serviceRadius: 50, distance: provider.distanceKm
          }] : [],
          contact: { phone: '' }
        })),
        isGuestSearch,
        serverManaged: true,
        notifiedProvidersCount: request.notifiedProviders || 0
      };
      this.currentSearchSession$.next(session);
      if (session.isActive) this.startGuestResponsePolling(request.id);
      return session;
    } catch (error: any) {
      // Keep the same submission ID after a network error: the server may already have published it.
      if ([400, 401, 409, 422].includes(error.status)) this.pendingSubmission = null;
      throw new Error(error.error?.message || (error.status === 0
        ? 'No pudimos conectar. Tu texto se conserva; vuelve a intentarlo.'
        : error.message || 'No se pudo realizar la busqueda. Intenta de nuevo.'));
    }
  }

  /**
   * Manejar respuesta de proveedor via WebSocket
   */
  private handleProviderResponse(wsResponse: any): void {
    const currentSession = this.currentSearchSession$.value;
    if (!currentSession || !currentSession.isActive || currentSession.serverManaged || wsResponse.requestId !== currentSession.searchRequest.id) {
      console.log('⚠️ No active search session for response');
      return;
    }

    console.log('📡 Provider response received:', wsResponse);

    // Parse estimated time and price from message
    let estimatedTime: number | undefined;
    let price: number | undefined;
    
    const message = wsResponse.message || '';
    const timeMatch = message.match(/⏱️.*?(\d+)\s*min/i);
    const priceMatch = message.match(/💰.*?(\d+)/i);
    
    if (timeMatch) {
      estimatedTime = parseInt(timeMatch[1]);
    }
    if (priceMatch) {
      price = parseInt(priceMatch[1]);
    }

    const response: ProviderResponse = {
      id: this.generateResponseId(),
      requestId: wsResponse.requestId || currentSession.searchRequest.id,
      providerId: wsResponse.providerInfo?.id || wsResponse.fromUser || '',
      providerName: wsResponse.providerInfo?.fullName || 'Proveedor',
      providerEmail: wsResponse.providerInfo?.email || wsResponse.fromUser || '',
      message: message,
      accepted: true, // Si responde, asumimos que acepta
      estimatedTime: estimatedTime,
      price: price,
      latitude: wsResponse.latitude,
      longitude: wsResponse.longitude,
      timestamp: wsResponse.createdAt ? new Date(wsResponse.createdAt) : new Date(),
      providerPhone: wsResponse.providerInfo?.phone
    };

    // Agregar respuesta a la sesión actual
    currentSession.responses.push(response);
    this.currentSearchSession$.next(currentSession);

    // Emitir respuesta individual
    this.incomingResponses$.next(response);

    console.log('✅ Provider response processed:', response);
  }

  /**
   * Finalizar búsqueda activa
   */
  finishCurrentSearch(): void {
    this.pendingSubmission = null;
    const currentSession = this.currentSearchSession$.value;
    if (currentSession) {
      currentSession.isActive = false;
      currentSession.searchRequest.status = 'completed';
      this.currentSearchSession$.next(currentSession);
    }

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    this.stopGuestResponsePolling();
  }

  clearCurrentSession(): void {
    this.pendingSubmission = null;
    this.currentSearchSession$.next(null);

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    this.stopGuestResponsePolling();
  }

  /**
   * Configurar timeout para la búsqueda
   */
  private setupSearchTimeout(requestId: string): void {
    this.searchTimeout = setTimeout(() => {
      const currentSession = this.currentSearchSession$.value;
      if (currentSession && currentSession.searchRequest.id === requestId) {
        currentSession.isActive = false;
        currentSession.searchRequest.status = 'timeout';
        this.currentSearchSession$.next(currentSession);
        console.log('Search request timed out:', requestId);
      }
    }, this.SEARCH_TIMEOUT);
  }

  private async fetchGuestRequestFromBackend(requestId: string): Promise<GuestRequestApiResponse> {
    const response = await firstValueFrom(this.http.get<any>(`${environment.baseUrl}/guest-requests/${requestId}`));

    if (!response?.success || !response?.data) {
      throw new Error('No se pudo obtener el estado de la solicitud publica.');
    }

    return response.data as GuestRequestApiResponse;
  }

  private startGuestResponsePolling(requestId: string): void {
    this.stopGuestResponsePolling();

    this.guestResponsePollingTimer = setInterval(async () => {
      try {
        const currentSession = this.currentSearchSession$.value;
        // Stop polling when session ends or offer was accepted
        if (!currentSession || currentSession.searchRequest.id !== requestId || !currentSession.isActive) {
          this.stopGuestResponsePolling();
          return;
        }

        const guestRequest = await this.fetchGuestRequestFromBackend(requestId);

        // Re-check after async call in case state changed while awaiting
        const sessionAfterFetch = this.currentSearchSession$.value;
        if (!sessionAfterFetch || sessionAfterFetch.searchRequest.id !== requestId || !sessionAfterFetch.isActive) {
          this.stopGuestResponsePolling();
          return;
        }

        const newResponses = this.mapGuestResponses(guestRequest.responses || []);
        const nextSession: SearchSession = {
          ...sessionAfterFetch,
          responses: newResponses,
          isActive: !['expired', 'completed', 'accepted'].includes(guestRequest.status),
          notifiedProvidersCount: guestRequest.notifiedProviders || sessionAfterFetch.notifiedProvidersCount || 0
        };

        if (!this.hasGuestSessionChanged(sessionAfterFetch, nextSession, guestRequest.status)) {
          return;
        }

        for (const response of newResponses) {
          if (!sessionAfterFetch.responses.some(old => old.id === response.id)) this.incomingResponses$.next(response);
        }
        this.currentSearchSession$.next({
          ...nextSession,
          searchRequest: {
            ...nextSession.searchRequest,
            status: this.mapGuestRequestStatus(guestRequest.status, nextSession.searchRequest.status)
          }
        });
      } catch (error) {
        console.error('❌ Error polling guest responses:', error);
      }
    }, 5000);
  }

  private stopGuestResponsePolling(): void {
    if (this.guestResponsePollingTimer) {
      clearInterval(this.guestResponsePollingTimer);
      this.guestResponsePollingTimer = null;
    }
  }

  private mapGuestResponses(responses: GuestProviderApiResponse[]): ProviderResponse[] {
    return responses.map(response => ({
      id: response.id,
      requestId: response.requestId,
      providerId: response.providerEmail || response.id,
      providerName: response.providerName || 'Proveedor',
      providerEmail: response.providerEmail || '',
      message: response.message,
      price: this.extractOfferNumber(response.message, /(?:\$|precio\s*:?\s*)(\d+(?:[.,]\d+)?)/i),
      estimatedTime: this.extractOfferNumber(response.message, /(\d+)\s*min/i),
      accepted: true,
      latitude: response.latitude,
      longitude: response.longitude,
      timestamp: new Date(response.createdAt),
      providerPhone: response.providerPhone
    }));
  }

  private hasGuestSessionChanged(currentSession: SearchSession, nextSession: SearchSession, backendStatus?: string): boolean {
    if ((currentSession.notifiedProvidersCount || 0) !== (nextSession.notifiedProvidersCount || 0)) {
      return true;
    }

    const mappedStatus = this.mapGuestRequestStatus(backendStatus, currentSession.searchRequest.status);
    if (mappedStatus !== currentSession.searchRequest.status) {
      return true;
    }

    const currentResponses = currentSession.responses || [];
    const nextResponses = nextSession.responses || [];

    if (currentResponses.length !== nextResponses.length) {
      return true;
    }

    for (let index = 0; index < nextResponses.length; index += 1) {
      const current = currentResponses[index];
      const next = nextResponses[index];

      if (!current || !next) {
        return true;
      }

      if (
        current.id !== next.id ||
        current.message !== next.message ||
        current.providerPhone !== next.providerPhone ||
        current.providerName !== next.providerName ||
        current.latitude !== next.latitude ||
        current.longitude !== next.longitude ||
        current.timestamp.getTime() !== next.timestamp.getTime()
      ) {
        return true;
      }
    }

    return false;
  }

  private extractOfferNumber(message: string, pattern: RegExp): number | undefined {
    const match = message.match(pattern);
    return match ? Number(match[1].replace(',', '.')) : undefined;
  }

  private mapGuestRequestStatus(status: string | undefined, fallback: SearchRequest['status']): SearchRequest['status'] {
    switch ((status || '').toLowerCase()) {
      case 'accepted':
        return 'accepted';
      case 'completed':
        return 'completed';
      case 'timeout':
      case 'expired':
        return 'timeout';
      case 'pending':
        return 'pending';
      default:
        return fallback;
    }
  }

  /**
   * Generar ID único para petición
   */
  private generateRequestId(): string {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Generar ID único para respuesta
   */
  private generateResponseId(): string {
    return 'resp_' + Date.now().toString() + Math.random().toString(36).substr(2, 5);
  }

  // =================== OBSERVABLES PÚBLICOS ===================

  /**
   * Notificar al backend que el guest aceptó una respuesta de proveedor.
   * El backend envía el mensaje offer_accepted por WebSocket al proveedor.
   */
  async acceptGuestResponse(requestId: string, responseId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<any>(
        `${environment.baseUrl}/guest-requests/${requestId}/responses/${responseId}/accept`,
        {}
      )
    );
  }

  /**
   * Obtener sesión de búsqueda actual
   */
  getCurrentSearchSession(): Observable<SearchSession | null> {
    return this.currentSearchSession$.asObservable();
  }

  /**
   * Obtener respuestas de proveedores en tiempo real
   */
  getIncomingResponses(): Observable<ProviderResponse> {
    return this.incomingResponses$.asObservable();
  }

  /**
   * Verificar si hay una búsqueda activa
   */
  hasActiveSearch(): boolean {
    const session = this.currentSearchSession$.value;
    return session !== null && session.isActive;
  }

  /**
   * Obtener estadísticas de la búsqueda actual
   */
  getCurrentSearchStats(): { total: number; accepted: number; rejected: number } {
    const session = this.currentSearchSession$.value;
    if (!session) {
      return { total: 0, accepted: 0, rejected: 0 };
    }

    const total = session.responses.length;
    const accepted = session.responses.filter(r => r.accepted).length;
    const rejected = session.responses.filter(r => !r.accepted).length;

    return { total, accepted, rejected };
  }

  /**
   * Accept a provider's response/offer
   */
  acceptProviderResponse(responseId: string): ProviderResponse | null {
    const currentSession = this.currentSearchSession$.value;
    if (!currentSession) {
      console.error('❌ No active search session');
      return null;
    }

    const response = currentSession.responses.find(r => r.id === responseId);
    if (!response) {
      console.error('❌ Response not found:', responseId);
      return null;
    }

    // Update the session with accepted response
    const updatedSession: SearchSession = {
      ...currentSession,
      isActive: false,
      searchRequest: {
        ...currentSession.searchRequest,
        status: 'accepted'
      },
      acceptedResponse: response
    };

    this.currentSearchSession$.next(updatedSession);

    // Clear the timeout since we've accepted
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    console.log('✅ Provider response accepted:', response.providerName);
    return response;
  }

  /**
   * Get the accepted response from current session
   */
  getAcceptedResponse(): ProviderResponse | null {
    const session = this.currentSearchSession$.value;
    return session?.acceptedResponse || null;
  }

  /**
   * Check if an offer has been accepted
   */
  hasAcceptedOffer(): boolean {
    const session = this.currentSearchSession$.value;
    return session?.acceptedResponse !== undefined;
  }
}
