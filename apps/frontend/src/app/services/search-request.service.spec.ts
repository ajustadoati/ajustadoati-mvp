import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { SearchRequestService } from './search-request.service';
import { AjustadoAtiWebSocketService } from './ajustadoati-websocket.service';
import { environment } from '../../environments/environment';

describe('SearchRequestService backend classification', () => {
  let service: SearchRequestService;
  let http: HttpTestingController;
  const endpoint = `${environment.baseUrl}/search-requests`;
  const response = { success: true, data: { providers: [], request: {
    id: 'server-request', message: 'Reparar grifo', categoryId: 42, categoryName: 'Plomeria',
    latitude: 0, longitude: 0, createdAt: '2026-10-03T10:00:00', status: 'pending',
    notifiedProviders: 0, responses: []
  } } };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AjustadoAtiWebSocketService, useValue: { getProviderResponses: () => new Subject() } }
    ] });
    service = TestBed.inject(SearchRequestService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { service.clearCurrentSession(); http.verify(); });

  it('sends description and location without a category and uses the server decision', async () => {
    const pending = service.createSearchRequest('Reparar grifo', { lat: 0, lng: 0 }, true);
    const request = http.expectOne(endpoint);
    expect(request.request.body.categoryId).toBeUndefined();
    expect(request.request.body.categoryName).toBeUndefined();
    expect(request.request.body.submissionId).toMatch(/^[0-9a-f-]{36}$/);
    request.flush(response);
    const session = await pending;
    expect(session.searchRequest.categoryId).toBe('42');
    expect(session.searchRequest.id).toBe('server-request');
    expect(JSON.parse(localStorage.getItem('ajustadoati_guest_search_v1') || '{}').requestId)
      .toBe('server-request');
  });

  it('does not publish twice on a double click', async () => {
    const first = service.createSearchRequest('Reparar grifo', { lat: 0, lng: 0 });
    const second = service.createSearchRequest('Reparar grifo', { lat: 0, lng: 0 });
    http.expectOne(endpoint).flush(response);
    expect(await first).toBe(await second);
  });

  it('keeps the idempotency key when retrying a lost network response', async () => {
    const first = service.createSearchRequest('Reparar grifo', { lat: 0, lng: 0 });
    const firstRequest = http.expectOne(endpoint);
    const id = firstRequest.request.body.submissionId;
    firstRequest.error(new ProgressEvent('error'));
    await expectAsync(first).toBeRejected();
    const retry = service.createSearchRequest('Reparar grifo', { lat: 0, lng: 0 });
    const retryRequest = http.expectOne(endpoint);
    expect(retryRequest.request.body.submissionId).toBe(id);
    retryRequest.flush(response);
    await retry;
  });

  it('uses a new idempotency key after a successful search even with the same text', async () => {
    const first = service.createSearchRequest('Reparar grifo', { lat: 0, lng: 0 }, true);
    const firstRequest = http.expectOne(endpoint);
    const firstId = firstRequest.request.body.submissionId;
    firstRequest.flush(response);
    await first;

    const second = service.createSearchRequest('Reparar grifo', { lat: 0, lng: 0 }, true);
    const secondRequest = http.expectOne(endpoint);
    expect(secondRequest.request.body.submissionId).not.toBe(firstId);
    secondRequest.flush(response);
    await second;
  });

  it('shows backend clarification instead of creating a search session', async () => {
    const pending = service.createSearchRequest('Ayuda en casa', { lat: 0, lng: 0 }, true);
    http.expectOne(endpoint).flush({ code: 'NEEDS_CLARIFICATION', message: 'Describe que necesitas reparar' },
      { status: 422, statusText: 'Unprocessable Entity' });
    await expectAsync(pending).toBeRejectedWithError('Describe que necesitas reparar');
    expect(service.hasActiveSearch()).toBeFalse();
  });

  it('restores an accepted guest search after a page reload', async () => {
    const savedId = '00000000-0000-4000-8000-000000000001';
    localStorage.setItem('ajustadoati_guest_search_v1', JSON.stringify({
      requestId: savedId, providers: [], acceptedResponseId: 'response-1'
    }));
    const restoring = service.restoreGuestSearchSession();
    http.expectOne(`${environment.baseUrl}/guest-requests/${savedId}`).flush({
      success: true,
      data: {
        ...response.data.request,
        id: savedId,
        status: 'accepted',
        responses: [{
          id: 'response-1', requestId: savedId, providerName: 'Richard',
          providerEmail: 'provider@example.test', message: 'Puedo ayudar',
          latitude: 41.18, longitude: 1.45, createdAt: '2026-10-03T10:01:00'
        }]
      }
    });

    const restored = await restoring;
    expect(restored?.searchRequest.status).toBe('accepted');
    expect(restored?.acceptedResponse?.id).toBe('response-1');
    expect(restored?.responses.length).toBe(1);
  });

  it('remembers which provider was chosen for a guest search', async () => {
    const pending = service.createSearchRequest('Reparar grifo', { lat: 41.18, lng: 1.45 }, true);
    http.expectOne(endpoint).flush({
      success: true,
      data: {
        providers: [],
        request: {
          ...response.data.request,
          responses: [{
            id: 'response-1', requestId: 'server-request', providerName: 'Richard',
            providerEmail: 'provider@example.test', message: 'Puedo ayudar',
            createdAt: '2026-10-03T10:01:00'
          }]
        }
      }
    });
    await pending;
    service.acceptProviderResponse('response-1');

    const stored = JSON.parse(localStorage.getItem('ajustadoati_guest_search_v1') || '{}');
    expect(stored.acceptedResponseId).toBe('response-1');
  });

  it('restores a completed request and the selected provider from the backend', async () => {
    const savedId = '00000000-0000-4000-8000-000000000002';
    localStorage.setItem('ajustadoati_guest_search_v1', JSON.stringify({
      requestId: savedId, providers: []
    }));
    const restoring = service.restoreGuestSearchSession();
    http.expectOne(`${environment.baseUrl}/guest-requests/${savedId}`).flush({
      success: true,
      data: {
        ...response.data.request, id: savedId, status: 'completed', acceptedResponseId: 'response-1',
        responses: [{ id: 'response-1', requestId: savedId, providerName: 'Richard',
          providerEmail: 'provider@example.test', message: 'He terminado',
          createdAt: '2026-10-03T10:01:00' }]
      }
    });
    const restored = await restoring;
    expect(restored?.searchRequest.status).toBe('completed');
    expect(restored?.acceptedResponse?.id).toBe('response-1');
    expect(localStorage.getItem('ajustadoati_guest_search_v1')).toContain(savedId);
  });
});
