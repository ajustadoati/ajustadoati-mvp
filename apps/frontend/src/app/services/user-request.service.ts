import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  UserServiceRequest,
  ProviderOffer,
  AcceptedOfferDetails,
  RequestStatus,
  RequestUrgency,
  JobStatus
} from '../interfaces/request.interface';
import { AjustadoAtiWebSocketService } from './ajustadoati-websocket.service';
import { BackendAuthService } from './backend-auth.service';

const STORAGE_KEY = 'user_requests';
const ACTIVE_REQUEST_KEY = 'active_request';

@Injectable({
  providedIn: 'root'
})
export class UserRequestService {
  private activeRequest$ = new BehaviorSubject<UserServiceRequest | null>(null);
  private requestHistory$ = new BehaviorSubject<UserServiceRequest[]>([]);

  constructor(
    private websocket: AjustadoAtiWebSocketService,
    private auth: BackendAuthService
  ) {
    this.loadFromStorage();
    this.subscribeToWebSocketEvents();
  }

  // =================== PUBLIC METHODS ===================

  /**
   * Create a new service request
   */
  async createRequest(data: {
    categoryId: string;
    categoryName: string;
    description: string;
    urgency: RequestUrgency;
    maxBudget?: number;
    location: { latitude: number; longitude: number; address?: string };
  }): Promise<UserServiceRequest> {
    const userId = this.auth.currentUser?.id || 'anonymous';

    const request: UserServiceRequest = {
      id: this.generateId(),
      userId,
      categoryId: data.categoryId,
      categoryName: data.categoryName,
      description: data.description,
      urgency: data.urgency,
      maxBudget: data.maxBudget,
      location: data.location,
      status: RequestStatus.SEARCHING,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: this.calculateExpiration(data.urgency),
      responses: []
    };

    this.activeRequest$.next(request);
    this.saveToStorage();

    console.log('📝 UserRequestService: Created new request', request.id);
    return request;
  }

  /**
   * Accept a provider's offer
   */
  async acceptOffer(requestId: string, offer: ProviderOffer): Promise<void> {
    const activeRequest = this.activeRequest$.value;

    if (!activeRequest || activeRequest.id !== requestId) {
      throw new Error('Request not found or not active');
    }

    const acceptedDetails: AcceptedOfferDetails = {
      offerId: offer.id,
      providerId: offer.providerId,
      providerName: offer.providerName,
      providerEmail: offer.providerEmail,
      providerPhone: offer.providerPhone,
      providerPhoto: offer.providerPhoto,
      agreedPrice: offer.price,
      estimatedArrival: offer.estimatedTime
        ? new Date(Date.now() + offer.estimatedTime * 60 * 1000)
        : undefined,
      jobStatus: JobStatus.EN_ROUTE,
      acceptedAt: new Date()
    };

    const updatedRequest: UserServiceRequest = {
      ...activeRequest,
      status: RequestStatus.OFFER_ACCEPTED,
      updatedAt: new Date(),
      acceptedOffer: acceptedDetails
    };

    this.activeRequest$.next(updatedRequest);
    this.saveToStorage();

    // Notify provider via WebSocket
    this.sendOfferAcceptedNotification(offer);

    console.log('✅ UserRequestService: Offer accepted', offer.id);
  }

  /**
   * Cancel the active request
   */
  async cancelRequest(requestId: string): Promise<void> {
    const activeRequest = this.activeRequest$.value;

    if (!activeRequest || activeRequest.id !== requestId) {
      throw new Error('Request not found or not active');
    }

    const cancelledRequest: UserServiceRequest = {
      ...activeRequest,
      status: RequestStatus.CANCELLED,
      updatedAt: new Date()
    };

    // Move to history
    this.addToHistory(cancelledRequest);
    this.activeRequest$.next(null);
    this.saveToStorage();

    console.log('❌ UserRequestService: Request cancelled', requestId);
  }

  /**
   * Mark request as completed
   */
  async completeRequest(requestId: string): Promise<void> {
    const activeRequest = this.activeRequest$.value;

    if (!activeRequest || activeRequest.id !== requestId) {
      throw new Error('Request not found or not active');
    }

    const completedRequest: UserServiceRequest = {
      ...activeRequest,
      status: RequestStatus.COMPLETED,
      updatedAt: new Date(),
      acceptedOffer: activeRequest.acceptedOffer
        ? {
            ...activeRequest.acceptedOffer,
            jobStatus: JobStatus.COMPLETED,
            completedAt: new Date()
          }
        : undefined
    };

    // Move to history
    this.addToHistory(completedRequest);
    this.activeRequest$.next(null);
    this.saveToStorage();

    console.log('✅ UserRequestService: Request completed', requestId);
  }

  /**
   * Add a provider response to the active request
   */
  addProviderResponse(response: ProviderOffer): void {
    const activeRequest = this.activeRequest$.value;

    if (!activeRequest) {
      console.warn('⚠️ UserRequestService: No active request for response');
      return;
    }

    // Check if we already have this response
    const existingIndex = activeRequest.responses.findIndex(
      r => r.providerId === response.providerId
    );

    let updatedResponses: ProviderOffer[];
    if (existingIndex >= 0) {
      updatedResponses = [...activeRequest.responses];
      updatedResponses[existingIndex] = response;
    } else {
      updatedResponses = [...activeRequest.responses, response];
    }

    const updatedRequest: UserServiceRequest = {
      ...activeRequest,
      status: activeRequest.status === RequestStatus.SEARCHING
        ? RequestStatus.WAITING_RESPONSES
        : activeRequest.status,
      updatedAt: new Date(),
      responses: updatedResponses
    };

    this.activeRequest$.next(updatedRequest);
    this.saveToStorage();

    console.log('📥 UserRequestService: Added provider response', response.providerName);
  }

  /**
   * Update job status (e.g., provider arrived)
   */
  updateJobStatus(status: JobStatus): void {
    const activeRequest = this.activeRequest$.value;

    if (!activeRequest || !activeRequest.acceptedOffer) {
      return;
    }

    const updatedOffer: AcceptedOfferDetails = {
      ...activeRequest.acceptedOffer,
      jobStatus: status,
      ...(status === JobStatus.ON_SITE && { arrivedAt: new Date() }),
      ...(status === JobStatus.COMPLETED && { completedAt: new Date() })
    };

    const updatedRequest: UserServiceRequest = {
      ...activeRequest,
      status: status === JobStatus.COMPLETED
        ? RequestStatus.COMPLETED
        : RequestStatus.IN_PROGRESS,
      updatedAt: new Date(),
      acceptedOffer: updatedOffer
    };

    if (status === JobStatus.COMPLETED) {
      this.addToHistory(updatedRequest);
      this.activeRequest$.next(null);
    } else {
      this.activeRequest$.next(updatedRequest);
    }

    this.saveToStorage();
  }

  // =================== OBSERVABLES ===================

  /**
   * Get the currently active request
   */
  getActiveRequest(): Observable<UserServiceRequest | null> {
    return this.activeRequest$.asObservable();
  }

  /**
   * Get the request history
   */
  getRequestHistory(): Observable<UserServiceRequest[]> {
    return this.requestHistory$.asObservable();
  }

  /**
   * Check if there's an active request
   */
  hasActiveRequest(): boolean {
    return this.activeRequest$.value !== null;
  }

  /**
   * Get current active request value
   */
  getCurrentActiveRequest(): UserServiceRequest | null {
    return this.activeRequest$.value;
  }

  // =================== PRIVATE METHODS ===================

  private subscribeToWebSocketEvents(): void {
    // Listen for job status updates from provider
    this.websocket.getNotifications().subscribe(notification => {
      this.handleWebSocketNotification(notification);
    });
  }

  private handleWebSocketNotification(notification: any): void {
    // Prefer explicit event types when available, fallback to plain-text parsing for older messages.
    if (notification?.type === 'job_started') {
      this.updateJobStatus(JobStatus.EN_ROUTE);
      return;
    }
    if (notification?.type === 'job_completed') {
      this.updateJobStatus(JobStatus.COMPLETED);
      return;
    }

    const message = notification?.message?.toLowerCase() || '';

    if (message.includes('llegado') || message.includes('arrived')) {
      this.updateJobStatus(JobStatus.ON_SITE);
    } else if (message.includes('completado') || message.includes('completed')) {
      this.updateJobStatus(JobStatus.COMPLETED);
    }
  }

  private sendOfferAcceptedNotification(offer: ProviderOffer): void {
    try {
      const currentUser = this.auth.currentUser;
      if (!currentUser) return;

      // Send notification to provider that their offer was accepted
      // This would typically be a WebSocket message
      console.log('📤 Sending offer accepted notification to provider:', offer.providerEmail);

      this.websocket.sendOfferAccepted(offer.requestId, offer.id, offer.providerEmail);
    } catch (error) {
      console.error('Error sending offer accepted notification:', error);
    }
  }

  private addToHistory(request: UserServiceRequest): void {
    const history = this.requestHistory$.value;
    this.requestHistory$.next([request, ...history]);
  }

  private calculateExpiration(urgency: RequestUrgency): Date {
    const now = new Date();
    switch (urgency) {
      case RequestUrgency.NOW:
        return new Date(now.getTime() + 60 * 60 * 1000); // 1 hour
      case RequestUrgency.TODAY:
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        return endOfDay;
      case RequestUrgency.THIS_WEEK:
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    }
  }

  private generateId(): string {
    return 'req_' + Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }

  // =================== STORAGE ===================

  private loadFromStorage(): void {
    try {
      // Load active request
      const activeData = localStorage.getItem(ACTIVE_REQUEST_KEY);
      if (activeData) {
        const parsed = JSON.parse(activeData);
        // Convert date strings back to Date objects
        parsed.createdAt = new Date(parsed.createdAt);
        parsed.updatedAt = new Date(parsed.updatedAt);
        if (parsed.expiresAt) parsed.expiresAt = new Date(parsed.expiresAt);
        if (parsed.responses) {
          parsed.responses = parsed.responses.map((r: any) => ({
            ...r,
            timestamp: new Date(r.timestamp)
          }));
        }
        if (parsed.acceptedOffer) {
          parsed.acceptedOffer.acceptedAt = new Date(parsed.acceptedOffer.acceptedAt);
          if (parsed.acceptedOffer.estimatedArrival) {
            parsed.acceptedOffer.estimatedArrival = new Date(parsed.acceptedOffer.estimatedArrival);
          }
          if (parsed.acceptedOffer.arrivedAt) {
            parsed.acceptedOffer.arrivedAt = new Date(parsed.acceptedOffer.arrivedAt);
          }
          if (parsed.acceptedOffer.completedAt) {
            parsed.acceptedOffer.completedAt = new Date(parsed.acceptedOffer.completedAt);
          }
        }
        this.activeRequest$.next(parsed);
      }

      // Load history
      const historyData = localStorage.getItem(STORAGE_KEY);
      if (historyData) {
        const history = JSON.parse(historyData).map((req: any) => ({
          ...req,
          createdAt: new Date(req.createdAt),
          updatedAt: new Date(req.updatedAt),
          expiresAt: req.expiresAt ? new Date(req.expiresAt) : undefined,
          responses: (req.responses || []).map((r: any) => ({
            ...r,
            timestamp: new Date(r.timestamp)
          })),
          acceptedOffer: req.acceptedOffer
            ? {
                ...req.acceptedOffer,
                acceptedAt: new Date(req.acceptedOffer.acceptedAt),
                estimatedArrival: req.acceptedOffer.estimatedArrival
                  ? new Date(req.acceptedOffer.estimatedArrival)
                  : undefined,
                arrivedAt: req.acceptedOffer.arrivedAt
                  ? new Date(req.acceptedOffer.arrivedAt)
                  : undefined,
                completedAt: req.acceptedOffer.completedAt
                  ? new Date(req.acceptedOffer.completedAt)
                  : undefined
              }
            : undefined
        }));
        this.requestHistory$.next(history);
      }

      console.log('📦 UserRequestService: Loaded data from storage');
    } catch (error) {
      console.error('Error loading from storage:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const activeRequest = this.activeRequest$.value;
      if (activeRequest) {
        localStorage.setItem(ACTIVE_REQUEST_KEY, JSON.stringify(activeRequest));
      } else {
        localStorage.removeItem(ACTIVE_REQUEST_KEY);
      }

      const history = this.requestHistory$.value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));

      console.log('💾 UserRequestService: Saved data to storage');
    } catch (error) {
      console.error('Error saving to storage:', error);
    }
  }

  /**
   * Clear all data (for testing/logout)
   */
  clearAll(): void {
    this.activeRequest$.next(null);
    this.requestHistory$.next([]);
    localStorage.removeItem(ACTIVE_REQUEST_KEY);
    localStorage.removeItem(STORAGE_KEY);
  }
}
