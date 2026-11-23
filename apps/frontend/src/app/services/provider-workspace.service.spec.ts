import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { JobStatus } from '../interfaces/request.interface';
import { ServiceRequest } from './ajustadoati-websocket.service';
import { environment } from '../../environments/environment';
import { ProviderWorkspaceService } from './provider-workspace.service';

describe('ProviderWorkspaceService accepted work recovery', () => {
  let service: ProviderWorkspaceService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('provider_active_job');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ProviderWorkspaceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.clearAll();
    http.verify();
  });

  it('restores a missed accepted job after opening the provider home', async () => {
    const loading = service.fetchAcceptedJob();
    http.expectOne(`${environment.baseUrl}/providers/accepted-guest-requests`).flush({
      success: true, data: [{ id: 'request-1', guestRef: 'guest+123@ajustadoati.local',
        categoryId: 12, categoryName: 'Taxi', message: 'Ir a Tarragona',
        latitude: 41.18, longitude: 1.45, maxDistanceKm: 50,
        status: 'accepted', createdAt: '2026-11-18T10:00:00' }]
    });
    await loading;
    expect(service.getActiveJob()?.requestId).toBe('request-1');
    expect(service.getActiveJob()?.status).toBe(JobStatus.EN_ROUTE);
    expect(service.getActiveJob()?.clientName).toBe('Cliente invitado');
  });

  it('removes a stale local job when the backend has no accepted work', async () => {
    service.updateActiveJob({
      id: 'job_old', requestId: 'old', clientName: 'Cliente',
      clientLocation: { latitude: 41.18, longitude: 1.45 },
      categoryName: 'Taxi', description: 'Viaje', status: JobStatus.ON_SITE,
      acceptedAt: new Date()
    });

    const loading = service.fetchAcceptedJob();
    http.expectOne(`${environment.baseUrl}/providers/accepted-guest-requests`).flush({ success: true, data: [] });
    await loading;

    expect(service.getActiveJob()).toBeNull();
    expect(localStorage.getItem('provider_active_job')).toBeNull();
  });

  it('keeps the local job when the server response is not confirmed', async () => {
    service.updateActiveJob({
      id: 'job_old', requestId: 'old', clientName: 'Cliente',
      clientLocation: { latitude: 41.18, longitude: 1.45 },
      categoryName: 'Taxi', description: 'Viaje', status: JobStatus.ON_SITE,
      acceptedAt: new Date()
    });

    const loading = service.fetchAcceptedJob();
    http.expectOne(`${environment.baseUrl}/providers/accepted-guest-requests`).flush({ success: false });

    expect(await loading).toBeFalse();
    expect(service.getActiveJob()?.requestId).toBe('old');
  });

  it('updates a sent response when its request is accepted and then completed', async () => {
    const request: ServiceRequest = {
      id: 1, type: 'request', fromUser: 'guest+123@ajustadoati.local',
      message: 'Ir a Tarragona', latitude: 41.18, longitude: 1.45,
      categoryId: 12, categoryName: 'Taxi', requestId: 'request-1',
      timestamp: new Date().toISOString()
    };
    service.markResponded(request, 'Puedo llevarte');

    const loading = service.fetchAcceptedJob();
    http.expectOne(`${environment.baseUrl}/providers/accepted-guest-requests`).flush({
      success: true, data: [{ id: 'request-1', guestRef: request.fromUser,
        categoryId: 12, categoryName: 'Taxi', message: request.message,
        latitude: request.latitude, longitude: request.longitude,
        maxDistanceKm: 50, status: 'accepted', createdAt: request.timestamp }]
    });
    await loading;
    expect(JSON.parse(localStorage.getItem('provider_sent_responses') || '[]')[0].status).toBe('accepted');

    service.completeActiveJob();
    expect(JSON.parse(localStorage.getItem('provider_sent_responses') || '[]')[0].status).toBe('completed');
  });
});
