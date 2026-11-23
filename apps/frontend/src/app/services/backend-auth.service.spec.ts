import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { BackendAuthService } from './backend-auth.service';

describe('BackendAuthService token expiry', () => {
  const user = {
    id: 'provider-1', email: 'provider@example.test', fullName: 'Proveedor',
    username: 'provider', isProvider: true
  };

  function tokenExpiringAt(milliseconds: number): string {
    return `${btoa('{"alg":"HS512"}')}.${btoa(JSON.stringify({ exp: Math.floor(milliseconds / 1000) }))}.signature`;
  }

  beforeEach(() => {
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_token');
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
  });

  afterEach(() => {
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_token');
  });

  it('rejects a saved token that already expired', () => {
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('auth_token', tokenExpiringAt(Date.now() - 60_000));

    const auth = TestBed.inject(BackendAuthService);

    expect(auth.isAuthenticated()).toBeFalse();
    expect(auth.getJwtToken()).toBeNull();
    expect(auth.currentUser).toBeNull();
  });

  it('stops returning a token once it expires during an open session', () => {
    const now = Date.now();
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('auth_token', tokenExpiringAt(now + 60_000));
    const auth = TestBed.inject(BackendAuthService);

    expect(auth.isAuthenticated()).toBeTrue();
    spyOn(Date, 'now').and.returnValue(now + 120_000);

    expect(auth.isAuthenticated()).toBeFalse();
    expect(auth.getJwtToken()).toBeNull();
  });
});
