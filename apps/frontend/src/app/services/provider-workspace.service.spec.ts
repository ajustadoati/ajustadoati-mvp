import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { JobStatus } from '../interfaces/request.interface';
import { ServiceRequest } from './ajustadoati-websocket.service';
import { environment } from '../../environments/environment';
import { ProviderWorkspaceService } from './provider-workspace.service';

describe('ProviderWorkspaceService server activity', () => {
  let service: ProviderWorkspaceService;
  let http: HttpTestingController;
  const endpoint = `${environment.baseUrl}/providers/my-requests`;

  const request = (status: string, selected = true) => ({
    id: 'request-1', guestRef: 'guest+123@ajustadoati.local',
    categoryId: 12, categoryName: 'Taxi', message: 'Ir a Tarragona',
    latitude: 41.18, longitude: 1.45, maxDistanceKm: 50,
    status, createdAt: '2026-11-18T10:00:00', updatedAt: '2026-11-18T11:00:00',
    acceptedResponseId: selected ? 'response-1' : null,
    responses: [{ id: 'response-1', providerEmail: 'provider@example.test',
      providerName: 'Proveedor', message: 'Puedo llevarte', createdAt: '2026-11-18T10:05:00' }]
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ProviderWorkspaceService);
    service.clearAll();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.clearAll();
    http.verify();
  });

  it('restores an accepted offer missed while the phone was asleep', async () => {
    const loading = service.refreshProviderActivity();
    http.expectOne(endpoint).flush({ success: true, data: [request('accepted')] });
    expect(await loading).toBeTrue();
    expect(service.getActiveJob()?.requestId).toBe('request-1');
    expect(service.getActiveJob()?.status).toBe(JobStatus.EN_ROUTE);
    expect(service.getActiveJob()?.clientName).toBe('Cliente invitado');
    expect(JSON.parse(localStorage.getItem('provider_sent_responses') || '[]')[0].status).toBe('accepted');
  });

  it('rebuilds previous proposals and completed work without local storage', async () => {
    const loading = service.refreshProviderActivity();
    http.expectOne(endpoint).flush({ success: true, data: [request('completed'), {
      ...request('responded'), id: 'request-2', acceptedResponseId: null,
      responses: [{ ...request('responded').responses[0], id: 'response-2' }]
    }] });
    await loading;
    const proposals = JSON.parse(localStorage.getItem('provider_sent_responses') || '[]');
    expect(proposals.map((item: any) => item.status)).toEqual(['completed', 'sent']);
    expect(service.readJobHistory().map(item => item.requestId)).toEqual(['request-1']);
  });

  it('does not mark an offer accepted when the client chose someone else', async () => {
    const loading = service.refreshProviderActivity();
    http.expectOne(endpoint).flush({ success: true, data: [request('accepted', false)] });
    await loading;
    expect(service.getActiveJob()).toBeNull();
    expect(JSON.parse(localStorage.getItem('provider_sent_responses') || '[]')[0].status).toBe('not_selected');
  });

  it('clears a stale local job when the backend says it is complete', async () => {
    service.updateActiveJob({
      id: 'job_request-1', requestId: 'request-1', clientName: 'Cliente',
      clientLocation: { latitude: 41.18, longitude: 1.45 },
      categoryName: 'Taxi', description: 'Viaje', status: JobStatus.ON_SITE,
      acceptedAt: new Date()
    });
    const loading = service.refreshProviderActivity();
    http.expectOne(endpoint).flush({ success: true, data: [request('completed')] });
    await loading;
    expect(service.getActiveJob()).toBeNull();
    expect(service.readJobHistory().length).toBe(1);
  });

  it('keeps local state when the server cannot confirm it', async () => {
    service.updateActiveJob({
      id: 'job_old', requestId: 'old', clientName: 'Cliente',
      clientLocation: { latitude: 41.18, longitude: 1.45 },
      categoryName: 'Taxi', description: 'Viaje', status: JobStatus.ON_SITE,
      acceptedAt: new Date()
    });
    const loading = service.refreshProviderActivity();
    http.expectOne(endpoint).flush({ success: false });
    expect(await loading).toBeFalse();
    expect(service.getActiveJob()?.requestId).toBe('old');
  });

  it('keeps a just-sent proposal until the server has recorded it', async () => {
    const local: ServiceRequest = {
      id: 1, type: 'request', fromUser: 'guest+123@ajustadoati.local',
      message: 'Ir a Tarragona', latitude: 41.18, longitude: 1.45,
      categoryId: 12, categoryName: 'Taxi', requestId: 'request-1',
      timestamp: new Date().toISOString()
    };
    service.markResponded(local, 'Puedo llevarte');
    const loading = service.refreshProviderActivity();
    http.expectOne(endpoint).flush({ success: true, data: [] });
    await loading;
    expect(JSON.parse(localStorage.getItem('provider_sent_responses') || '[]')[0].status).toBe('sent');
  });

  it('does not mix activity between providers when the account changes mid-request', async () => {
    service.ensureBelongsTo('first@example.test');
    const first = service.refreshProviderActivity();
    service.ensureBelongsTo('second@example.test');
    const second = service.refreshProviderActivity();
    const requests = http.match(endpoint);
    expect(requests.length).toBe(2);
    requests[1].flush({ success: true, data: [{
      ...request('responded'), id: 'request-2', acceptedResponseId: null,
      responses: [{ ...request('responded').responses[0], id: 'response-2' }]
    }] });
    requests[0].flush({ success: true, data: [request('accepted')] });
    await Promise.all([first, second]);
    const proposals = JSON.parse(localStorage.getItem('provider_sent_responses') || '[]');
    expect(proposals.map((item: any) => item.request.requestId)).toEqual(['request-2']);
    expect(service.getActiveJob()).toBeNull();
  });
});
