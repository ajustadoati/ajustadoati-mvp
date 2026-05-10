import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

export interface LocationDto {
  latitude: number;
  longitude: number;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface BackendRegisterRequest {
  fullName: string;
  username: string;
  email: string;
  password: string;
  phone?: string;
  isProvider: boolean;
  categories?: number[];
  location?: LocationDto;
}

export interface BackendLoginRequest {
  email: string;
  password: string;
}

export interface BackendUserInfo {
  id: string;
  email: string;
  fullName: string;
  username: string;
  phone?: string | null;
  isProvider: boolean;
  categories?: number[];
  location?: LocationDto | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  isActive?: boolean;
}

export interface BackendAuthPayload {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresIn: number;
  user: BackendUserInfo;
}

export interface BackendProfileUpdateRequest {
  fullName?: string;
  phone?: string | null;
  categories?: number[];
  location?: LocationDto | null;
}

const STORAGE_USER_KEY = 'auth_user';
const STORAGE_TOKEN_KEY = 'auth_token';

@Injectable({
  providedIn: 'root'
})
export class BackendAuthService {
  private readonly apiUrl = environment.baseUrl + '/auth';
  private readonly profilesApiUrl = environment.baseUrl + '/profiles';
  private currentUser$ = new BehaviorSubject<BackendUserInfo | null>(null);
  private authToken: string | null = null;

  constructor(private http: HttpClient) {
    this.loadStoredSession();
  }

  async register(payload: BackendRegisterRequest): Promise<ApiResponse<BackendAuthPayload>> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': '*/*'
    });

    const response = await firstValueFrom(
      this.http.post<ApiResponse<BackendAuthPayload>>(`${this.apiUrl}/register`, payload, { headers })
    );

    if (response.success && response.data?.accessToken && response.data?.user) {
      this.setSession(response.data.user, response.data.accessToken);
    }

    return response;
  }

  async login(payload: BackendLoginRequest): Promise<ApiResponse<BackendAuthPayload>> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': '*/*'
    });

    const response = await firstValueFrom(
      this.http.post<ApiResponse<BackendAuthPayload>>(`${this.apiUrl}/login`, payload, { headers })
    );

    if (response.success && response.data?.accessToken && response.data?.user) {
      this.setSession(response.data.user, response.data.accessToken);
    }

    return response;
  }

  logout(): void {
    this.clearSession();
  }

  getCurrentUser(): Observable<BackendUserInfo | null> {
    return this.currentUser$.asObservable();
  }

  get currentUser(): BackendUserInfo | null {
    return this.currentUser$.value;
  }

  isAuthenticated(): boolean {
    return this.currentUser$.value !== null && this.isLikelyJwt(this.authToken);
  }

  isProvider(): boolean {
    return this.currentUser$.value?.isProvider || false;
  }

  getJwtToken(): string | null {
    return this.isLikelyJwt(this.authToken) ? this.authToken : null;
  }

  async getUserProfile(): Promise<BackendUserInfo | null> {
    return this.currentUser$.value;
  }

  async getFullUserProfile(): Promise<BackendUserInfo | null> {
    if (!this.isAuthenticated()) {
      return null;
    }

    const response = await firstValueFrom(
      this.http.get<ApiResponse<BackendUserInfo>>(`${this.profilesApiUrl}/me`)
    );

    if (response.success && response.data) {
      this.updateStoredUser(response.data);
      return response.data;
    }

    return this.currentUser$.value;
  }

  async updateProfile(payload: BackendProfileUpdateRequest): Promise<BackendUserInfo> {
    const response = await firstValueFrom(
      this.http.put<ApiResponse<BackendUserInfo>>(`${this.profilesApiUrl}/me`, payload)
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || 'No se pudo actualizar el perfil');
    }

    this.updateStoredUser(response.data);
    return response.data;
  }

  private setSession(user: BackendUserInfo, token: string): void {
    this.currentUser$.next(user);
    this.authToken = token;
    try {
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
    } catch (e) {
      // Ignore storage failures (private mode, etc.)
    }
  }

  private updateStoredUser(user: BackendUserInfo): void {
    const mergedUser = {
      ...this.currentUser$.value,
      ...user
    } as BackendUserInfo;

    this.currentUser$.next(mergedUser);
    try {
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(mergedUser));
    } catch (e) {
      // ignore
    }
  }

  private loadStoredSession(): void {
    try {
      const storedUser = localStorage.getItem(STORAGE_USER_KEY);
      const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
      if (storedUser && this.isLikelyJwt(storedToken)) {
        this.currentUser$.next(JSON.parse(storedUser));
        this.authToken = storedToken;
      } else {
        this.clearSession();
      }
    } catch (e) {
      this.clearSession();
    }
  }

  private clearSession(): void {
    this.currentUser$.next(null);
    this.authToken = null;
    try {
      localStorage.removeItem(STORAGE_USER_KEY);
      localStorage.removeItem(STORAGE_TOKEN_KEY);
    } catch (e) {
      // ignore
    }
  }

  private isLikelyJwt(token: string | null | undefined): token is string {
    if (!token) return false;
    const parts = token.split('.');
    return parts.length === 3 && parts[0].length > 0 && parts[1].length > 0 && parts[2].length > 0;
  }
}
