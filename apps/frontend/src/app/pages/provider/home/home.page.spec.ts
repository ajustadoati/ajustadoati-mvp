import { of } from 'rxjs';
import { ProviderHomePage } from './home.page';

describe('ProviderHomePage location', () => {
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
