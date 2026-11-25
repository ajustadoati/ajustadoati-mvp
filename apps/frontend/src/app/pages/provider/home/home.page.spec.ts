import { BehaviorSubject, of, Subject } from 'rxjs';
import { ProviderHomePage } from './home.page';

describe('ProviderHomePage location', () => {
  it('observes WebSocket state even if GPS failed before the first connection', () => {
    const connected = new BehaviorSubject(false);
    const authenticated = new BehaviorSubject(false);
    const notifications = new Subject<any>();
    const removeExpiredRequest = jasmine.createSpy('removeExpiredRequest');
    const page = new ProviderHomePage(
      {} as any, {} as any, {} as any, {} as any, {} as any,
      { getConnectionStatus: () => connected, getAuthenticationStatus: () => authenticated,
        getNotifications: () => notifications } as any,
      {} as any, { removeExpiredRequest } as any, {} as any, {} as any
    );

    (page as any).subscribeToWebSocketState();
    connected.next(true);
    authenticated.next(true);
    notifications.next({ type: 'request_expired', requestId: 'old-request' });

    expect(page.isConnectedToWebSocket).toBeTrue();
    expect(page.isAuthenticated).toBeTrue();
    expect(removeExpiredRequest).toHaveBeenCalledWith('old-request');
  });

  it('shows a retry message when server activity cannot be refreshed', async () => {
    const refreshProviderActivity = jasmine.createSpy().and.resolveTo(false);
    const page = new ProviderHomePage(
      {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, { refreshProviderActivity } as any,
      {} as any, {} as any
    );

    await page.refreshActivity();
    expect(page.activityErrorMessage).toContain('No pudimos actualizar');

    refreshProviderActivity.and.resolveTo(true);
    await page.refreshActivity();
    expect(page.activityErrorMessage).toBe('');
  });

  it('saves the device position before using it for matching', async () => {
    const position = { latitude: 10.5, longitude: -66.9 };
    const updateProfile = jasmine.createSpy('updateProfile').and.resolveTo({
      location: position
    });
    const geolocation = {
      getCurrentPosition: jasmine.createSpy('getCurrentPosition').and.resolveTo(position),
      startWatching: jasmine.createSpy('startWatching').and.resolveTo(),
      getCurrentPositionObservable: () => of(position)
    };
    const websocket = { disconnect: jasmine.createSpy('disconnect') };
    const page = new ProviderHomePage(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { updateProfile } as any,
      websocket as any,
      geolocation as any,
      {} as any,
      {} as any,
      {} as any
    );
    page.user = { location: { latitude: 41.18, longitude: 1.45 } } as any;

    const ready = await (page as any).initializeLocation();

    expect(ready).toBeTrue();
    expect(updateProfile).toHaveBeenCalledWith({ location: position });
    expect(websocket.disconnect).toHaveBeenCalled();
    expect(page.isLocationSynced).toBeTrue();
  });

  it('stays unavailable when the device cannot provide a location', async () => {
    const websocket = { disconnect: jasmine.createSpy('disconnect') };
    const geolocation = {
      getCurrentPosition: jasmine.createSpy('getCurrentPosition').and.rejectWith({ code: 1, message: 'User denied Geolocation' })
    };
    const page = new ProviderHomePage(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      websocket as any,
      geolocation as any,
      {} as any,
      {} as any,
      {} as any
    );
    spyOn<any>(page, 'showToast').and.resolveTo();
    spyOn(console, 'error');

    const ready = await (page as any).initializeLocation();

    expect(ready).toBeFalse();
    expect(page.isAvailable).toBeFalse();
    expect(page.isLocationSynced).toBeFalse();
    expect(page.locationErrorMessage).toContain('permiso de ubicación');
    expect(websocket.disconnect).toHaveBeenCalled();
  });

  it('explains a GPS timeout and lets the provider retry without becoming available automatically', async () => {
    const position = { latitude: 41.18, longitude: 1.45 };
    const getCurrentPosition = jasmine.createSpy('getCurrentPosition')
      .and.rejectWith({ code: 3, message: 'Location request timeout' });
    const page = new ProviderHomePage(
      {} as any, {} as any, {} as any, {} as any,
      {} as any, { disconnect: jasmine.createSpy() } as any,
      { getCurrentPosition, startWatching: jasmine.createSpy().and.resolveTo(),
        getCurrentPositionObservable: () => of(position) } as any,
      {} as any, {} as any, {} as any
    );
    page.user = { location: position } as any;
    spyOn<any>(page, 'showToast').and.resolveTo();
    spyOn(console, 'error');

    await page.refreshLocation();
    expect(page.locationErrorMessage).toContain('tardó demasiado');
    expect(page.isAvailable).toBeFalse();

    getCurrentPosition.and.resolveTo(position);
    await page.refreshLocation();
    expect(page.locationErrorMessage).toBe('');
    expect(page.isLocationSynced).toBeTrue();
    expect(page.isAvailable).toBeFalse();
  });
});
