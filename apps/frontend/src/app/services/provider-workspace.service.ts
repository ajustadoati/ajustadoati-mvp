import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import {
  IncomingWebSocketMessage,
  ServiceRequest
} from './ajustadoati-websocket.service';
import {
  JobHistoryEntry,
  JobStatus,
  ProviderActiveJob
} from '../interfaces/request.interface';
import { environment } from '../../environments/environment';

interface BackendGuestRequest {
  id: string;
  guestRef: string;
  categoryId: number;
  categoryName: string;
  message: string;
  latitude: number;
  longitude: number;
  maxDistanceKm: number;
  status: string;
  createdAt: string;
}

export type ProviderResponseStatus = 'sent' | 'accepted' | 'expired';

export interface ProviderSentResponse {
  id: string;
  request: ServiceRequest;
  message: string;
  status: ProviderResponseStatus;
  sentAt: string;
  latitude?: number;
  longitude?: number;
}

const PENDING_REQUESTS_KEY = 'provider_pending_requests';
const SENT_RESPONSES_KEY = 'provider_sent_responses';
const ACTIVE_JOB_KEY = 'provider_active_job';
const JOB_HISTORY_KEY = 'provider_job_history';
// Tracks which provider owns the workspace data currently in localStorage so
// we can detect when a different account logs in on the same browser.
const WORKSPACE_OWNER_KEY = 'provider_workspace_owner';

// Must match the backend's app.requests.expiration-minutes (default 15)
const REQUEST_TTL_MS = 15 * 60 * 1000;

@Injectable({
  providedIn: 'root'
})
export class ProviderWorkspaceService {
  private pendingRequestsSubject = new BehaviorSubject<ServiceRequest[]>(this.readArray<ServiceRequest>(PENDING_REQUESTS_KEY));
  private sentResponsesSubject = new BehaviorSubject<ProviderSentResponse[]>(this.readArray<ProviderSentResponse>(SENT_RESPONSES_KEY));
  private activeJobSubject = new BehaviorSubject<ProviderActiveJob | null>(this.readActiveJob());

  pendingRequests$ = this.pendingRequestsSubject.asObservable();
  sentResponses$ = this.sentResponsesSubject.asObservable();
  activeJob$ = this.activeJobSubject.asObservable();

  private http = inject(HttpClient);

  constructor() {
    // Drop stale requests persisted in localStorage (provider may have been
    // offline when the backend broadcast the expiration), then keep pruning.
    this.pruneExpiredRequests();
    setInterval(() => this.pruneExpiredRequests(), 60000);
  }

  /**
   * Pulls the backlog of requests the provider missed while offline (e.g.
   * they opened the app from a push notification). Must be called at
   * provider/home mount, after the workspace is bound to the current user.
   */
  async fetchPendingBacklog(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${environment.baseUrl}/providers/pending-requests`)
      );
      const backlog: BackendGuestRequest[] = response?.data || [];
      backlog.forEach(item => {
        const request: ServiceRequest = {
          id: Date.now(),
          type: 'request',
          fromUser: item.guestRef,
          message: item.message,
          latitude: item.latitude,
          longitude: item.longitude,
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          requestId: item.id,
          timestamp: item.createdAt,
          maxDistanceKm: item.maxDistanceKm
        };
        this.addIncomingRequest(request);
      });
    } catch (err) {
      console.warn('Failed to fetch pending request backlog:', err);
    }
  }

  /**
   * Called on every entry to the provider workspace (e.g. provider/home).
   * If the persisted workspace belongs to a different provider — or to none —
   * it is wiped so the new user starts clean. Otherwise it's a noop.
   */
  ensureBelongsTo(email: string | null | undefined): void {
    if (!email) return;
    const normalised = email.trim().toLowerCase();
    const owner = (localStorage.getItem(WORKSPACE_OWNER_KEY) || '').trim().toLowerCase();
    if (owner === normalised) {
      return;
    }
    this.clearAll();
    localStorage.setItem(WORKSPACE_OWNER_KEY, normalised);
  }

  /**
   * Wipes every workspace key from localStorage and resets in-memory state.
   * Use on logout, account switch, or "ensureBelongsTo" mismatch.
   */
  clearAll(): void {
    try {
      localStorage.removeItem(PENDING_REQUESTS_KEY);
      localStorage.removeItem(SENT_RESPONSES_KEY);
      localStorage.removeItem(ACTIVE_JOB_KEY);
      localStorage.removeItem(JOB_HISTORY_KEY);
      localStorage.removeItem(WORKSPACE_OWNER_KEY);
    } catch {
      // ignore storage failures (private mode etc.)
    }
    this.pendingRequestsSubject.next([]);
    this.sentResponsesSubject.next([]);
    this.activeJobSubject.next(null);
  }

  addIncomingRequest(request: ServiceRequest): void {
    if (this.hasResponded(request) || this.hasPending(request) || this.isExpiredByAge(request)) {
      return;
    }

    const pending = [request, ...this.pendingRequestsSubject.value].slice(0, 30);
    this.setPendingRequests(pending);
  }

  removeExpiredRequest(requestId: string): void {
    const pending = this.pendingRequestsSubject.value.filter(
      item => item.requestId !== requestId
    );
    if (pending.length !== this.pendingRequestsSubject.value.length) {
      this.setPendingRequests(pending);
    }
  }

  pruneExpiredRequests(): void {
    const fresh = this.pendingRequestsSubject.value.filter(item => !this.isExpiredByAge(item));
    if (fresh.length !== this.pendingRequestsSubject.value.length) {
      this.setPendingRequests(fresh);
    }
  }

  private isExpiredByAge(request: ServiceRequest): boolean {
    if (!request.timestamp) {
      return false;
    }
    // Backend serializes LocalDateTime without a timezone designator. JavaScript
    // would interpret that as local time and shift it by the browser's UTC
    // offset — making fresh requests look hours old on a UTC backend with a
    // non-UTC browser. Force UTC interpretation when no zone is present.
    const hasZone = /[zZ]|[+\-]\d{2}:?\d{2}$/.test(request.timestamp);
    const isoString = hasZone ? request.timestamp : request.timestamp + 'Z';
    const created = new Date(isoString).getTime();
    if (isNaN(created)) {
      return false;
    }
    const age = Date.now() - created;
    // Negative age = backend timestamp ahead of browser clock (local backend
    // serialized local time, browser parsed it as UTC); not expired.
    if (age < 0) {
      return false;
    }
    return age > REQUEST_TTL_MS;
  }

  markResponded(
    request: ServiceRequest,
    message: string,
    position?: { latitude: number; longitude: number } | null
  ): ProviderSentResponse {
    const response: ProviderSentResponse = {
      id: `offer_${request.requestId || request.id}_${Date.now()}`,
      request,
      message,
      status: 'sent',
      sentAt: new Date().toISOString(),
      latitude: position?.latitude,
      longitude: position?.longitude
    };

    const sentResponses = [
      response,
      ...this.sentResponsesSubject.value.filter(item => this.getRequestKey(item.request) !== this.getRequestKey(request))
    ].slice(0, 50);

    this.setPendingRequests(
      this.pendingRequestsSubject.value.filter(item => this.getRequestKey(item) !== this.getRequestKey(request))
    );
    this.setSentResponses(sentResponses);

    return response;
  }

  hasResponded(request: ServiceRequest): boolean {
    const requestKey = this.getRequestKey(request);
    return this.sentResponsesSubject.value.some(item => this.getRequestKey(item.request) === requestKey);
  }

  getResponseForRequest(request: ServiceRequest): ProviderSentResponse | undefined {
    const requestKey = this.getRequestKey(request);
    return this.sentResponsesSubject.value.find(item => this.getRequestKey(item.request) === requestKey);
  }

  handleOfferAccepted(message: IncomingWebSocketMessage): ProviderActiveJob | null {
    if (!message.requestId) {
      return null;
    }

    const responses = this.sentResponsesSubject.value;
    const response = responses.find(item => item.request.requestId === message.requestId);
    if (!response) {
      return null;
    }

    const updatedResponses = responses.map(item =>
      item.request.requestId === message.requestId ? { ...item, status: 'accepted' as const } : item
    );
    this.setSentResponses(updatedResponses);

    const request = response.request;
    const activeJob: ProviderActiveJob = {
      id: `job_${message.requestId}`,
      requestId: message.requestId,
      clientName: message.clientInfo?.name || request.fromUser || 'Cliente',
      clientPhone: message.clientInfo?.phone,
      clientLocation: {
        latitude: request.latitude,
        longitude: request.longitude
      },
      categoryName: request.categoryName || 'Servicio',
      description: request.message,
      status: JobStatus.EN_ROUTE,
      acceptedAt: new Date()
    };

    this.setActiveJob(activeJob);
    return activeJob;
  }

  completeActiveJob(): JobHistoryEntry | null {
    const activeJob = this.activeJobSubject.value;
    if (!activeJob) {
      return null;
    }

    const historyEntry: JobHistoryEntry = {
      id: activeJob.id,
      requestId: activeJob.requestId,
      clientName: activeJob.clientName,
      categoryName: activeJob.categoryName,
      description: activeJob.description,
      price: activeJob.agreedPrice,
      completedAt: new Date()
    };

    const history = this.readJobHistory();
    this.writeArray(JOB_HISTORY_KEY, [historyEntry, ...history]);
    this.setActiveJob(null);

    return historyEntry;
  }

  getActiveJob(): ProviderActiveJob | null {
    return this.activeJobSubject.value;
  }

  updateActiveJob(job: ProviderActiveJob | null): void {
    this.setActiveJob(job);
  }

  readJobHistory(): JobHistoryEntry[] {
    return this.readArray<any>(JOB_HISTORY_KEY).map(job => ({
      ...job,
      completedAt: new Date(job.completedAt)
    }));
  }

  private hasPending(request: ServiceRequest): boolean {
    const requestKey = this.getRequestKey(request);
    return this.pendingRequestsSubject.value.some(item => this.getRequestKey(item) === requestKey);
  }

  private getRequestKey(request: ServiceRequest): string {
    return request.requestId || String(request.id);
  }

  private setPendingRequests(requests: ServiceRequest[]): void {
    this.pendingRequestsSubject.next(requests);
    this.writeArray(PENDING_REQUESTS_KEY, requests);
  }

  private setSentResponses(responses: ProviderSentResponse[]): void {
    this.sentResponsesSubject.next(responses);
    this.writeArray(SENT_RESPONSES_KEY, responses);
  }

  private setActiveJob(job: ProviderActiveJob | null): void {
    this.activeJobSubject.next(job);
    if (job) {
      localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(job));
    } else {
      localStorage.removeItem(ACTIVE_JOB_KEY);
    }
  }

  private readActiveJob(): ProviderActiveJob | null {
    const stored = localStorage.getItem(ACTIVE_JOB_KEY);
    if (!stored) {
      return null;
    }

    try {
      const parsed = JSON.parse(stored);
      if (parsed.id === 'job_1' && parsed.requestId === 'req_123') {
        localStorage.removeItem(ACTIVE_JOB_KEY);
        return null;
      }

      return {
        ...parsed,
        acceptedAt: new Date(parsed.acceptedAt),
        arrivedAt: parsed.arrivedAt ? new Date(parsed.arrivedAt) : undefined,
        completedAt: parsed.completedAt ? new Date(parsed.completedAt) : undefined
      };
    } catch (error) {
      localStorage.removeItem(ACTIVE_JOB_KEY);
      return null;
    }
  }

  private readArray<T>(key: string): T[] {
    const stored = localStorage.getItem(key);
    if (!stored) {
      return [];
    }

    try {
      return JSON.parse(stored) as T[];
    } catch (error) {
      localStorage.removeItem(key);
      return [];
    }
  }

  private writeArray<T>(key: string, value: T[]): void {
    localStorage.setItem(key, JSON.stringify(value));
  }
}
