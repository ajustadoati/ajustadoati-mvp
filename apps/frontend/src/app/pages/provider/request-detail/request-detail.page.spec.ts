import { FormBuilder } from '@angular/forms';
import { RequestDetailPage } from './request-detail.page';

describe('RequestDetailPage location recovery', () => {
  function createPage(geolocation: any) {
    return new RequestDetailPage(
      new FormBuilder(),
      { getCurrentNavigation: () => null } as any,
      {} as any, {} as any, {} as any, {} as any,
      {} as any, geolocation, {} as any
    );
  }

  it('reuses the recent GPS fix from provider home', async () => {
    const position = { latitude: 41.1886, longitude: 1.4530, timestamp: Date.now() };
    const geolocation = {
      getLastKnownPosition: () => position,
      getCurrentPosition: jasmine.createSpy('getCurrentPosition')
    };
    const page = createPage(geolocation);

    await (page as any).loadCurrentPosition();

    expect(page.currentPosition).toEqual(position);
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('explains GPS failure and leaves a retry option rather than a generic error', async () => {
    const geolocation = {
      getLastKnownPosition: () => null,
      getCurrentPosition: jasmine.createSpy('getCurrentPosition')
        .and.rejectWith({ code: 3, message: 'Location request timeout' })
    };
    const page = createPage(geolocation);
    spyOn(console, 'error');

    await (page as any).loadCurrentPosition();

    expect(page.currentPosition).toBeNull();
    expect(page.locationErrorMessage).toContain('vuelve a intentarlo');
  });
});
