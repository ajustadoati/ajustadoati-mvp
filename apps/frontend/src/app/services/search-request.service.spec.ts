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

  it('shows backend clarification instead of creating a search session', async () => {
    const pending = service.createSearchRequest('Ayuda en casa', { lat: 0, lng: 0 }, true);
    http.expectOne(endpoint).flush({ code: 'NEEDS_CLARIFICATION', message: 'Describe que necesitas reparar' },
      { status: 422, statusText: 'Unprocessable Entity' });
    await expectAsync(pending).toBeRejectedWithError('Describe que necesitas reparar');
    expect(service.hasActiveSearch()).toBeFalse();
  });
});
