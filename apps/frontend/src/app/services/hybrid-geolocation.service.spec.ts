import { HybridGeolocationService } from './hybrid-geolocation.service';

describe('HybridGeolocationService on the web', () => {
  let service: HybridGeolocationService;
  let positionRequest: jasmine.Spy;

  beforeEach(() => {
    service = new HybridGeolocationService();
    positionRequest = spyOn(navigator.geolocation, 'getCurrentPosition');
    spyOn(console, 'error');
  });

  afterEach(() => service.destroy());

  it('retries with normal precision after a high-accuracy timeout', async () => {
    const position = {
      coords: { latitude: 41.18, longitude: 1.45, accuracy: 30 },
      timestamp: Date.now()
    } as GeolocationPosition;
    positionRequest.and.callFake((success: PositionCallback, error: PositionErrorCallback, options: PositionOptions) => {
      if (options.enableHighAccuracy) error({ code: 3 } as GeolocationPositionError);
      else success(position);
    });

    const result = await service.getCurrentPosition();
    expect(result.latitude).toBe(41.18);
    expect(positionRequest).toHaveBeenCalledTimes(2);
    expect(positionRequest.calls.argsFor(1)[2].enableHighAccuracy).toBeFalse();
  });

  it('does not retry when location permission is denied', async () => {
    positionRequest.and.callFake((_success: PositionCallback, error: PositionErrorCallback) => {
      error({ code: 1 } as GeolocationPositionError);
    });

    await expectAsync(service.getCurrentPosition()).toBeRejected();
    expect(positionRequest).toHaveBeenCalledTimes(1);
  });
});
