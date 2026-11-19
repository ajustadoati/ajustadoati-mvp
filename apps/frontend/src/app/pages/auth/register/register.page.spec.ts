import { FormBuilder } from '@angular/forms';
import { Observable, of, throwError } from 'rxjs';
import { Category } from '../../../interfaces/category';
import { RegisterPage } from './register.page';

describe('RegisterPage', () => {
  function createPage(getCategories: () => Observable<Category[]>) {
    const geolocation = { getCurrentPosition: jasmine.createSpy('getCurrentPosition') };
    const page = new RegisterPage(
      new FormBuilder(),
      {} as any,
      { getCategories } as any,
      geolocation as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
    return { page, geolocation };
  }

  it('waits for an explicit action before asking for GPS', async () => {
    const { page, geolocation } = createPage(() => of([{ id: 8, name: 'Construcción', description: '' }]));

    await page.ngOnInit();

    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
    expect(page.availableCategories.map(category => category.id)).toEqual([8]);
  });

  it('does not invent categories if the backend is unavailable', async () => {
    const { page } = createPage(() => throwError(() => new Error('offline')));
    spyOn(console, 'error');

    await page.ngOnInit();

    expect(page.availableCategories).toEqual([]);
    expect(page.categoryError).toContain('No pudimos cargar');
    expect(page.selectedCategories).toEqual([]);
  });
});
