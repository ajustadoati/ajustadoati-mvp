declare var google: any;

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { Provider, ProviderSearchRequest, ProviderSearchResponse, ApiUser } from '../interfaces/provider';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ProviderService {
  private apiUrl = `${environment.baseUrl}/providers`;

  constructor(private http: HttpClient) { }

  async searchProviders(searchRequest: ProviderSearchRequest): Promise<ProviderSearchResponse> {
    try {
      console.log('Buscando proveedores para categoría:', searchRequest.categoryId);
      console.log('Producto:', searchRequest.productName);
      console.log('Ubicación usuario:', searchRequest.userLatitude, searchRequest.userLongitude);
      
      // Validar que tenemos ubicación del usuario
      if (!searchRequest.userLatitude || !searchRequest.userLongitude) {
        console.error('No se proporcionó ubicación del usuario');
        return this.getMockProviders(searchRequest);
      }
      
      // URL real de tu API
      const apiUrl = `${environment.baseUrl}/users/${searchRequest.categoryId}/category`;
      
      // Llamar a tu API real
      const apiUsers = await firstValueFrom(
        this.http.get<ApiUser[]>(apiUrl)
      );

      console.log('Respuesta de la API:', apiUsers);

      // Si hay proveedores, transformarlos y retornarlos
      if (apiUsers && apiUsers.length > 0) {
        const providers = this.transformApiUsersToProviders(apiUsers, searchRequest);
        
        return {
          providers,
          totalCount: providers.length,
          userLocation: {
            lat: searchRequest.userLatitude,
            lng: searchRequest.userLongitude
          }
        };
      }

      // Si no hay proveedores de la API, usar datos mock
      console.log('No se encontraron proveedores en la API, usando datos mock');
      return this.getMockProviders(searchRequest);
      
    } catch (error) {
      console.error('Error searching providers:', error);
      console.log('Fallback a datos mock debido a error');
      return this.getMockProviders(searchRequest);
    }
  }

  async getProviderById(id: string): Promise<Provider> {
    try {
      return await firstValueFrom(
        this.http.get<Provider>(`${this.apiUrl}/${id}`)
      );
    } catch (error) {
      console.error('Error getting provider:', error);
      throw new Error('No se pudo obtener la información del proveedor');
    }
  }

  private transformApiUsersToProviders(apiUsers: ApiUser[], searchRequest: ProviderSearchRequest): Provider[] {
    const userLocation = {
      lat: searchRequest.userLatitude || -33.4489,
      lng: searchRequest.userLongitude || -70.6693
    };

    return apiUsers.map(user => {
      // Convertir todas las ubicaciones del usuario a formato app
      const locations = user.locations.map(loc => ({
        lat: loc.latitude,
        lng: loc.longitude
      }));

      // Calcular distancia a la ubicación más cercana
      let minDistance = Infinity;
      if (locations.length > 0) {
        locations.forEach(location => {
          const distance = this.calculateDistance(
            userLocation.lat, 
            userLocation.lng,
            location.lat, 
            location.lng
          );
          if (distance < minDistance) {
            minDistance = distance;
          }
        });
      }

      return {
        id: user.userId.toString(),
        name: user.name,
        email: user.email,
        phone: user.mobileNumber,
        username: user.username,
        categories: user.categories,
        locations: locations,
        distance: minDistance === Infinity ? undefined : Math.round(minDistance * 10) / 10,
        isOnline: Math.random() > 0.3, // 70% probabilidad de estar online
        createdAt: user.createdAt,
        roles: user.roles
      };
    }).sort((a, b) => (a.distance || 0) - (b.distance || 0)); // Ordenar por distancia
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLng = this.deg2rad(lng2 - lng1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c; // Distancia en km
    return d;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }

  private getMockProviders(searchRequest: ProviderSearchRequest): ProviderSearchResponse {
    // Ubicación del usuario
    const userLocation = {
      lat: searchRequest.userLatitude || -33.4489,
      lng: searchRequest.userLongitude || -70.6693
    };

    console.log('Generando proveedores mock para ubicación:', userLocation);

    // Generar 5 proveedores ficticios dentro de un radio de 3-5km
    const mockProviders: Provider[] = this.generateMockProvidersAroundLocation(
      userLocation, 
      searchRequest.categoryId
    );

    return {
      providers: mockProviders,
      totalCount: mockProviders.length,
      userLocation: userLocation
    };
  }


  private generateMockProvidersAroundLocation(userLocation: {lat: number, lng: number}, categoryId: string): Provider[] {
    const providers: Provider[] = [];
    
    // Nombres de proveedores ficticios
    const providerNames = [
      'Juan Pérez',
      'María González', 
      'Carlos Rodriguez',
      'Ana Martinez',
      'Luis Fernandez'
    ];

    for (let i = 0; i < 5; i++) {
      // Generar ubicación aleatoria dentro de 3-5km
      const distance = 3 + Math.random() * 2; // Entre 3 y 5 km
      const angle = Math.random() * 2 * Math.PI; // Ángulo aleatorio
      
      // Calcular nueva posición (aproximación simple)
      // 1 grado ≈ 111km, entonces para distancia en km:
      const deltaLat = (distance * Math.cos(angle)) / 111;
      const deltaLng = (distance * Math.sin(angle)) / (111 * Math.cos(userLocation.lat * Math.PI / 180));
      
      const providerLocation = {
        lat: userLocation.lat + deltaLat,
        lng: userLocation.lng + deltaLng
      };

      // Calcular distancia real
      const realDistance = this.calculateDistance(
        userLocation.lat, userLocation.lng,
        providerLocation.lat, providerLocation.lng
      );

      providers.push({
        id: `mock_${i + 1}`,
        name: providerNames[i],
        email: `${providerNames[i].toLowerCase().replace(/\s+/g, '')}@email.com`,
        phone: `+56 9 ${Math.floor(Math.random() * 90000000) + 10000000}`,
        username: `user${i + 1}`,
        categories: [categoryId],
        locations: [providerLocation],
        distance: Math.round(realDistance * 10) / 10,
        isOnline: Math.random() > 0.3, // 70% probabilidad de estar online
        roles: ['PROVIDER', 'USER']
      });
    }

    // Ordenar por distancia
    providers.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    
    return providers;
  }

  async contactProvider(providerId: string, message: string): Promise<boolean> {
    try {
      const body = { providerId, message };
      await firstValueFrom(
        this.http.post(`${this.apiUrl}/${providerId}/contact`, body)
      );
      return true;
    } catch (error) {
      console.error('Error contacting provider:', error);
      return false;
    }
  }
}
