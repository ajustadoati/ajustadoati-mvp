import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { map, take } from 'rxjs/operators';

export interface DemoRequest {
  id: string;
  userId: string;
  userType: 'registered' | 'guest';
  productName: string;
  categoryId: string;
  categoryName: string;
  userLocation: {
    lat: number;
    lng: number;
    address?: string;
  };
  timestamp: string;
  distance: number; // distancia en km desde el proveedor
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  expiresAt: string;
  estimatedValue?: number;
  urgency: 'low' | 'medium' | 'high';
  userProfile?: {
    name: string;
    isFrequent: boolean;
    rating?: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class DemoRequestsService {
  private demoRequests$ = new BehaviorSubject<DemoRequest[]>([]);
  private isGeneratingRequests = false;
  private requestCounter = 1;

  // Datos de muestra para generar peticiones realistas
  private sampleProducts = [
    { name: 'Laptop Gaming', category: 'electronics', urgency: 'medium' as const, value: 2500 },
    { name: 'Smartphone iPhone', category: 'electronics', urgency: 'high' as const, value: 1200 },
    { name: 'Cámara DSLR', category: 'electronics', urgency: 'low' as const, value: 800 },
    { name: 'Zapatos deportivos', category: 'fashion', urgency: 'medium' as const, value: 150 },
    { name: 'Vestido de fiesta', category: 'fashion', urgency: 'high' as const, value: 200 },
    { name: 'Maquillaje profesional', category: 'beauty', urgency: 'medium' as const, value: 80 },
    { name: 'Sofá esquinero', category: 'furniture', urgency: 'low' as const, value: 1500 },
    { name: 'Mesa de comedor', category: 'furniture', urgency: 'medium' as const, value: 600 },
    { name: 'Proteína en polvo', category: 'sports', urgency: 'medium' as const, value: 45 },
    { name: 'Bicicleta montaña', category: 'sports', urgency: 'low' as const, value: 800 }
  ];

  private sampleUsers = [
    { name: 'María González', isFrequent: true, rating: 4.8 },
    { name: 'Carlos Rodríguez', isFrequent: false, rating: 4.5 },
    { name: 'Ana Martínez', isFrequent: true, rating: 4.9 },
    { name: 'Luis Herrera', isFrequent: false, rating: 4.3 },
    { name: 'Sofía López', isFrequent: true, rating: 4.7 },
    { name: 'Diego Morales', isFrequent: false, rating: 4.2 },
    { name: 'Usuario Invitado', isFrequent: false, rating: undefined }
  ];

  private categoryNames = {
    'electronics': 'Electrónicos',
    'fashion': 'Moda y Ropa',
    'beauty': 'Belleza y Cuidado',
    'furniture': 'Muebles y Hogar',
    'sports': 'Deportes y Fitness'
  };

  constructor() {
    console.log('🎭 DemoRequestsService initialized');
  }

  /**
   * Obtiene las peticiones demo actuales
   */
  getDemoRequests(): Observable<DemoRequest[]> {
    return this.demoRequests$.asObservable();
  }

  /**
   * Inicia la generación automática de peticiones demo
   */
  startGeneratingDemoRequests(): void {
    if (this.isGeneratingRequests) {
      console.log('⚠️ Demo requests generation already running');
      return;
    }

    this.isGeneratingRequests = true;
    console.log('🚀 Starting demo requests generation');

    // Generar primera petición inmediatamente
    setTimeout(() => {
      this.generateRandomRequest();
    }, 2000);

    // Generar peticiones periódicamente (cada 15-45 segundos)
    interval(20000).subscribe(() => {
      if (this.isGeneratingRequests && Math.random() > 0.3) {
        this.generateRandomRequest();
      }
    });

    // Limpiar peticiones expiradas cada minuto
    interval(60000).subscribe(() => {
      this.cleanExpiredRequests();
    });
  }

  /**
   * Detiene la generación de peticiones demo
   */
  stopGeneratingDemoRequests(): void {
    this.isGeneratingRequests = false;
    console.log('🛑 Stopped demo requests generation');
  }

  /**
   * Genera una petición aleatoria
   */
  public generateRandomRequest(): void {
    const currentRequests = this.demoRequests$.value;
    
    // Límite máximo de peticiones activas
    if (currentRequests.length >= 8) {
      return;
    }

    const product = this.sampleProducts[Math.floor(Math.random() * this.sampleProducts.length)];
    const user = this.sampleUsers[Math.floor(Math.random() * this.sampleUsers.length)];
    const isGuestUser = user.name === 'Usuario Invitado';
    
    // Generar ubicación aleatoria cerca del usuario (simulada)
    const baseLocation = { lat: 4.7110, lng: -74.0721 }; // Bogotá como base
    const locationOffset = 0.1; // ~10km radio
    
    const userLocation = {
      lat: baseLocation.lat + (Math.random() - 0.5) * locationOffset,
      lng: baseLocation.lng + (Math.random() - 0.5) * locationOffset,
      address: this.generateRandomAddress()
    };

    const distance = Math.round((Math.random() * 8 + 1) * 10) / 10; // 0.1 - 8.0 km
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (5 * 60 * 1000)); // Expira en 5 minutos

    const newRequest: DemoRequest = {
      id: `demo_req_${this.requestCounter++}_${Date.now()}`,
      userId: isGuestUser ? `guest_${Date.now()}` : `user_${Date.now()}`,
      userType: isGuestUser ? 'guest' : 'registered',
      productName: product.name,
      categoryId: product.category,
      categoryName: this.categoryNames[product.category as keyof typeof this.categoryNames] || product.category,
      userLocation,
      timestamp: now.toISOString(),
      distance,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      estimatedValue: product.value,
      urgency: product.urgency,
      userProfile: {
        name: user.name,
        isFrequent: user.isFrequent,
        rating: user.rating
      }
    };

    const updatedRequests = [...currentRequests, newRequest];
    this.demoRequests$.next(updatedRequests);

    console.log('📝 Generated demo request:', {
      id: newRequest.id,
      product: newRequest.productName,
      user: newRequest.userProfile?.name,
      userType: newRequest.userType,
      distance: newRequest.distance + 'km'
    });
  }

  /**
   * Genera una dirección aleatoria para la demo
   */
  private generateRandomAddress(): string {
    const streets = [
      'Carrera 15', 'Calle 26', 'Avenida 19', 'Carrera 7', 'Calle 72',
      'Transversal 45', 'Diagonal 39', 'Carrera 30', 'Calle 100', 'Avenida 68'
    ];
    
    const neighborhoods = [
      'La Candelaria', 'Zona Rosa', 'Chapinero', 'Usaquén', 'La Macarena',
      'El Chicó', 'Teusaquillo', 'Salitre', 'Ciudad Salitre', 'Quinta Camacho'
    ];

    const street = streets[Math.floor(Math.random() * streets.length)];
    const number = Math.floor(Math.random() * 200) + 1;
    const neighborhood = neighborhoods[Math.floor(Math.random() * neighborhoods.length)];
    
    return `${street} #${number}, ${neighborhood}`;
  }

  /**
   * Responde a una petición demo (aceptar/rechazar)
   */
  respondToRequest(requestId: string, response: 'accepted' | 'rejected'): void {
    const currentRequests = this.demoRequests$.value;
    const updatedRequests = currentRequests.map(request => {
      if (request.id === requestId && request.status === 'pending') {
        return { ...request, status: response };
      }
      return request;
    });

    this.demoRequests$.next(updatedRequests);
    
    console.log(`✅ Request ${requestId} ${response}`);
    
    // Simular que la petición se elimina después de ser respondida
    setTimeout(() => {
      this.removeRequest(requestId);
    }, 3000);
  }

  /**
   * Elimina una petición específica
   */
  private removeRequest(requestId: string): void {
    const currentRequests = this.demoRequests$.value;
    const updatedRequests = currentRequests.filter(request => request.id !== requestId);
    this.demoRequests$.next(updatedRequests);
  }

  /**
   * Limpia peticiones expiradas
   */
  private cleanExpiredRequests(): void {
    const now = new Date();
    const currentRequests = this.demoRequests$.value;
    
    const nonExpiredRequests = currentRequests.filter(request => {
      const expiresAt = new Date(request.expiresAt);
      const isExpired = now > expiresAt;
      
      if (isExpired && request.status === 'pending') {
        console.log(`⏰ Request ${request.id} expired`);
        return false;
      }
      
      return true;
    });

    if (nonExpiredRequests.length !== currentRequests.length) {
      this.demoRequests$.next(nonExpiredRequests);
    }
  }

  /**
   * Obtiene estadísticas de las peticiones demo
   */
  getRequestStats(): Observable<{total: number, pending: number, accepted: number, rejected: number}> {
    return this.demoRequests$.pipe(
      map(requests => ({
        total: requests.length,
        pending: requests.filter(r => r.status === 'pending').length,
        accepted: requests.filter(r => r.status === 'accepted').length,
        rejected: requests.filter(r => r.status === 'rejected').length
      }))
    );
  }

  /**
   * Limpia todas las peticiones (útil para reset)
   */
  clearAllRequests(): void {
    this.demoRequests$.next([]);
    console.log('🧹 All demo requests cleared');
  }

  /**
   * Verifica si el servicio está generando peticiones
   */
  isGenerating(): boolean {
    return this.isGeneratingRequests;
  }
}
