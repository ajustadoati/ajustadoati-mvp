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
  async createSearchRequest(productName: string, categoryId: string, userLocation: {lat: number, lng: number}, categoryName?: string, isGuestSearch = false): Promise<SearchSession> {
    try {
      // 1. Crear el objeto de búsqueda
      const searchRequest: SearchRequest = {
        id: this.generateRequestId(),
        productName,
        categoryId,
        categoryName,
        userLatitude: userLocation.lat,
        userLongitude: userLocation.lng,
        timestamp: new Date(),
        status: 'pending'
      };

      // 2. Obtener lista de proveedores del backend
      const providers = await this.getProvidersForCategory(categoryId, userLocation.lat, userLocation.lng, isGuestSearch);
      console.log(`✅ Found ${providers.length} providers for category ${categoryId}`);

      // 3. Crear sesión de búsqueda
      const searchSession: SearchSession = {
        searchRequest,
        responses: [],
        isActive: true,
        providers,
        isGuestSearch
      };

      if (isGuestSearch) {
        const guestRequest = await this.createGuestRequestOnBackend(searchRequest);
        searchRequest.id = guestRequest.id;
        searchSession.responses = this.mapGuestResponses(guestRequest.responses || []);
        searchSession.notifiedProvidersCount = guestRequest.notifiedProviders || 0;
        this.currentSearchSession$.next(searchSession);
        this.startGuestResponsePolling(guestRequest.id);
        return searchSession;
      }

      // 4. Guardar sesión actual
      this.currentSearchSession$.next(searchSession);

      // 5. Enviar petición via WebSocket
      this.sendRequestToProviders(searchRequest);

      // 6. Configurar timeout
      this.setupSearchTimeout(searchRequest.id);

      return searchSession;

    } catch (error) {
      console.error('❌ Error creating search request:', error);
      throw error;
    }
  }

  /**
   * Obtener proveedores de una categoría usando el backend
   */
  private async getProvidersForCategory(categoryId: string, userLatitude?: number, userLongitude?: number, isGuestSearch = false): Promise<ProviderSearchResult[]> {
    try {
      console.log(`🔍 Searching providers in backend for category: ${categoryId}`);

      // Si no hay ubicación del usuario, retornar array vacío
      if (!userLatitude || !userLongitude) {
        console.warn('⚠️ User location required for provider search');
        return [];
      }

      const radiusKm = 50; // Radio de búsqueda en kilómetros

      // Llamar al endpoint correcto del backend
      const endpoint = isGuestSearch ? 'public-search' : 'search';
      const response = await this.http.get<any>(
        `${environment.baseUrl}/providers/${endpoint}`,
        {
          params: {
            categoryId: categoryId,
            latitude: userLatitude.toString(),
            longitude: userLongitude.toString(),
            maxDistanceKm: radiusKm.toString(),
            page: '0',
            size: '20'
          }
        }
      ).toPromise();

      if (!response.success || !response.data || !response.data.content) {
        console.warn('Invalid response from backend:', response);
        return [];
      }

      // Convertir respuesta del backend al formato esperado
      const providers: ProviderSearchResult[] = response.data.content.map((provider: any) => ({
        id: provider.id,
        userId: provider.id,
        name: provider.fullName || 'Proveedor',
        email: provider.email || '',
        phone: provider.phone || '',
        businessName: provider.fullName,
        description: 'Proveedor de servicios',
        rating: 4.0,
        totalReviews: 0,
        isActive: provider.isActive ?? true,
        isVerified: false,
        categories: (provider.categories || []).map((catId: number) => ({
          categoryId: catId.toString(),
          categoryName: 'Servicio',
          experience: 0
        })),
        locations: provider.location ? [{
          address: provider.location.address || '',
          latitude: provider.location.latitude,
          longitude: provider.location.longitude,
          serviceRadius: 10,
          distance: provider.distanceKm
        }] : [],
        contact: {
          phone: provider.phone || '',
          whatsapp: provider.phone || undefined
        },
        pricing: undefined
      }));

      console.log(`✅ Found ${providers.length} providers from backend`);
      return providers;
    } catch (error: any) {
      console.error('❌ Error fetching providers from backend:', error);
      const endpoint = isGuestSearch ? '/providers/public-search' : '/providers/search';

      if (error.status === 0) {
        console.error('Backend not reachable. Make sure it is running on', environment.baseUrl);
        throw new Error('No se pudo conectar con el servidor. Verifica que el backend y el proxy esten activos.');
      }

      if (error.status === 404) {
        throw new Error(`El endpoint ${endpoint} no existe en el backend activo. Reinicia Spring Boot para cargar los cambios mas recientes.`);
      }

      if (error.status === 401 || error.status === 403) {
        throw new Error(`El backend bloqueo la ruta ${endpoint}. Revisa la configuracion de seguridad para la busqueda publica.`);
      }

      if (error.status >= 500) {
        throw new Error(`El backend respondio con error ${error.status} al consultar ${endpoint}. Revisa el log del servidor.`);
      }

      throw new Error(`La busqueda fallo con estado ${error.status} al consultar ${endpoint}.`);
    }
  }

  /**
   * Enviar petición a proveedores via WebSocket
   */
  private sendRequestToProviders(searchRequest: SearchRequest): void {
    try {
      console.log('📤 Attempting to send service request via WebSocket');

      // Enviar petición via WebSocket al backend
      // El backend se encargará de distribuirla a los proveedores cercanos
      this.websocketService.sendServiceRequest(
        parseInt(searchRequest.categoryId),
        searchRequest.productName,
        searchRequest.userLatitude,
        searchRequest.userLongitude,
        50 // maxDistanceKm
      );

      console.log('✅ Service request sent successfully via WebSocket');
    } catch (error: any) {
      console.warn('⚠️ Could not send request via WebSocket:', error.message);
      console.log('ℹ️ Guest users or users without WebSocket connection will only see provider list without real-time responses');
      // No lanzar error - los usuarios invitados pueden ver la lista de proveedores
      // pero no recibirán respuestas en tiempo real
    }
  }

  /**
   * Manejar respuesta de proveedor via WebSocket
   */
  private handleProviderResponse(wsResponse: any): void {
    const currentSession = this.currentSearchSession$.value;
    if (!currentSession || !currentSession.isActive) {
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

  private async createGuestRequestOnBackend(searchRequest: SearchRequest): Promise<GuestRequestApiResponse> {
    const response = await firstValueFrom(this.http.post<any>(`${environment.baseUrl}/guest-requests`, {
      message: searchRequest.productName,
      categoryId: parseInt(searchRequest.categoryId, 10),
      categoryName: searchRequest.categoryName,
      latitude: searchRequest.userLatitude,
      longitude: searchRequest.userLongitude,
      maxDistanceKm: 50
    }));

    if (!response?.success || !response?.data) {
      throw new Error('No se pudo crear la solicitud publica para invitados.');
    }

    return response.data as GuestRequestApiResponse;
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
        this.currentSearchSession$.next({ ...sessionAfterFetch, responses: newResponses });
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
      accepted: true,
      latitude: response.latitude,
      longitude: response.longitude,
      timestamp: new Date(response.createdAt),
      providerPhone: response.providerPhone
    }));
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
