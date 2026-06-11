import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AdminProvider {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  categories: number[];
  latitude?: number;
  longitude?: number;
  address?: string;
  createdAt: string;
  isActive: boolean;
  welcomeRequestSent: boolean;
  connected: boolean;
}

export interface AdminStats {
  totalProviders: number;
  totalUsers: number;
  connectedProviders: number;
  connectedUsers: number;
  demoRequestsSent: number;
  demoRequestsResponded: number;
}

export interface DemoRequestSummary {
  requestId: string;
  providerEmail: string;
  categoryName: string;
  message: string;
  status: string;
  responsesCount: number;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {

  constructor(private http: HttpClient) {}

  async getStats(): Promise<AdminStats> {
    const response = await firstValueFrom(
      this.http.get<any>(`${environment.baseUrl}/admin/stats`)
    );
    return response.data;
  }

  async getProviders(): Promise<AdminProvider[]> {
    const response = await firstValueFrom(
      this.http.get<any>(`${environment.baseUrl}/admin/providers`)
    );
    return response.data || [];
  }

  async getDemoRequests(): Promise<DemoRequestSummary[]> {
    const response = await firstValueFrom(
      this.http.get<any>(`${environment.baseUrl}/admin/demo-requests`)
    );
    return response.data || [];
  }
}
