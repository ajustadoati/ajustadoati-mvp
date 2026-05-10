import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

// Interfaces
export interface Position {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  address?: string;
  timestamp?: number;
}

export interface LocationError {
  code: number | string;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class HybridGeolocationService {
  private currentPosition$ = new BehaviorSubject<Position | null>(null);
  private watchId: string | number | null = null;
  private isWatching = false;
  private platform: string;

  constructor() {
    this.platform = Capacitor.getPlatform();
    console.log(`🗺️ Hybrid Geolocation service initialized for platform: ${this.platform}`);
  }

  /**
   * Obtener posición actual
   */
  async getCurrentPosition(): Promise<Position> {
    try {
      let result: Position;
      
      if (this.platform === 'web') {
        result = await this.getCurrentPositionWeb();
      } else {
        result = await this.getCurrentPositionNative();
      }
      
      this.currentPosition$.next(result);
      console.log('✅ Current position obtained:', result);
      
      return result;
      
    } catch (error) {
      console.error('🚨 Error getting geolocation:', error);
      throw this.handleLocationError(error);
    }
  }

  /**
   * Obtener posición usando HTML5 Geolocation API (para web)
   */
  private async getCurrentPositionWeb(): Promise<Position> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject({
          code: 'NOT_SUPPORTED',
          message: 'Geolocation is not supported by this browser'
        });
        return;
      }
      
      console.log('🌐 Getting position using HTML5 Geolocation API...');
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const result: Position = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude || undefined,
            heading: position.coords.heading || undefined,
            speed: position.coords.speed || undefined,
            timestamp: position.timestamp
          };
          
          console.log('🌐 Web position obtained:', result);
          resolve(result);
        },
        (error) => {
          console.error('🚨 HTML5 Geolocation error:', error);
          reject({
            code: error.code,
            message: this.getWebLocationErrorMessage(error.code)
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 300000 // 5 minutos
        }
      );
    });
  }

  /**
   * Obtener posición usando Capacitor Geolocation (para móvil)
   */
  private async getCurrentPositionNative(): Promise<Position> {
    try {
      await this.checkAndRequestPermissions();
      
      console.log('📱 Getting position using Capacitor Geolocation...');
      
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000 // 1 minuto
      });
      
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude || undefined,
        heading: position.coords.heading || undefined,
        speed: position.coords.speed || undefined,
        timestamp: position.timestamp
      };
      
    } catch (error) {
      console.error('🚨 Native geolocation error:', error);
      throw error;
    }
  }

  /**
   * Comenzar a observar la posición
   */
  async startWatching(): Promise<void> {
    if (this.isWatching) {
      console.log('🗺️ Already watching position');
      return;
    }

    try {
      if (this.platform === 'web') {
        await this.startWatchingWeb();
      } else {
        await this.startWatchingNative();
      }
      
      this.isWatching = true;
      console.log('✅ Position watching started');
      
    } catch (error) {
      console.error('🚨 Error starting position watch:', error);
      throw this.handleLocationError(error);
    }
  }

  /**
   * Observar posición en web
   */
  private async startWatchingWeb(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          const result: Position = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude || undefined,
            heading: position.coords.heading || undefined,
            speed: position.coords.speed || undefined,
            timestamp: position.timestamp
          };
          
          this.currentPosition$.next(result);
          console.log('🌐 Web position updated:', result);
        },
        (error) => {
          console.error('🚨 Web watch position error:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000
        }
      );
      
      resolve();
    });
  }

  /**
   * Observar posición en nativo
   */
  private async startWatchingNative(): Promise<void> {
    await this.checkAndRequestPermissions();
    
    this.watchId = await Geolocation.watchPosition(
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      },
      (position, error) => {
        if (error) {
          console.error('📱 Native watch position error:', error);
        } else if (position) {
          const result: Position = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude || undefined,
            heading: position.coords.heading || undefined,
            speed: position.coords.speed || undefined,
            timestamp: position.timestamp
          };
          
          this.currentPosition$.next(result);
          console.log('📱 Native position updated:', result);
        }
      }
    );
  }

  /**
   * Detener observación de posición
   */
  async stopWatching(): Promise<void> {
    if (!this.isWatching || !this.watchId) {
      console.log('🗺️ Not currently watching position');
      return;
    }

    try {
      if (this.platform === 'web') {
        navigator.geolocation.clearWatch(this.watchId as number);
      } else {
        await Geolocation.clearWatch({ id: this.watchId as string });
      }
      
      this.watchId = null;
      this.isWatching = false;
      console.log('✅ Position watching stopped');
    } catch (error) {
      console.error('🚨 Error stopping position watch:', error);
    }
  }

  /**
   * Obtener observable de la posición actual
   */
  getCurrentPositionObservable(): Observable<Position | null> {
    return this.currentPosition$.asObservable();
  }

  /**
   * Obtener última posición conocida
   */
  getLastKnownPosition(): Position | null {
    return this.currentPosition$.value;
  }

  /**
   * Verificar si se está observando la posición
   */
  isCurrentlyWatching(): boolean {
    return this.isWatching;
  }

  /**
   * Calcular distancia entre dos puntos usando fórmula Haversine
   */
  calculateDistance(
    pos1: { latitude: number; longitude: number },
    pos2: { latitude: number; longitude: number }
  ): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.toRadians(pos2.latitude - pos1.latitude);
    const dLon = this.toRadians(pos2.longitude - pos1.longitude);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(pos1.latitude)) *
      Math.cos(this.toRadians(pos2.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distancia en km
  }

  /**
   * Verificar y solicitar permisos de geolocalización (solo para nativo)
   */
  private async checkAndRequestPermissions(): Promise<void> {
    if (this.platform === 'web') {
      // En web, los permisos se manejan automáticamente
      return;
    }
    
    try {
      const permission = await Geolocation.checkPermissions();
      console.log('🗺️ Geolocation permission status:', permission);

      if (permission.location === 'denied') {
        throw new Error('Geolocation permission denied. Please enable location services in settings.');
      }

      if (permission.location === 'prompt') {
        console.log('🗺️ Requesting geolocation permissions...');
        const requestResult = await Geolocation.requestPermissions();
        
        if (requestResult.location === 'denied') {
          throw new Error('Geolocation permission denied. Location services are required.');
        }
        
        console.log('✅ Geolocation permissions granted');
      }
    } catch (error) {
      console.error('🚨 Permission error:', error);
      throw error;
    }
  }

  /**
   * Manejar errores de geolocalización
   */
  private handleLocationError(error: any): LocationError {
    if (typeof error.code === 'number') {
      switch (error.code) {
        case 1:
          return {
            code: 1,
            message: 'Location access denied. Please enable location services.'
          };
        case 2:
          return {
            code: 2,
            message: 'Location unavailable. Please check your GPS settings.'
          };
        case 3:
          return {
            code: 3,
            message: 'Location request timeout. Please try again.'
          };
        default:
          return {
            code: error.code,
            message: error.message || 'Unknown location error'
          };
      }
    }
    
    return {
      code: error.code || 'UNKNOWN',
      message: error.message || 'Failed to get location'
    };
  }

  /**
   * Obtener mensaje de error para web
   */
  private getWebLocationErrorMessage(code: number): string {
    switch (code) {
      case 1:
        return 'Geolocation access denied by user';
      case 2:
        return 'Location information unavailable';
      case 3:
        return 'Location request timeout';
      default:
        return 'Unknown geolocation error';
    }
  }

  /**
   * Convertir grados a radianes
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Limpiar recursos al destruir el servicio
   */
  destroy(): void {
    this.stopWatching();
    this.currentPosition$.complete();
  }
}