import { Injectable } from '@angular/core';

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

@Injectable({
  providedIn: 'root'
})
export class GeolocationService {

  constructor() { }

  async getCurrentPosition(): Promise<UserLocation> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalización no soportada por este navegador'));
        return;
      }

      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000 // 1 minuto
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          let errorMessage = 'Error al obtener ubicación';
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Permisos de ubicación denegados';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Ubicación no disponible';
              break;
            case error.TIMEOUT:
              errorMessage = 'Tiempo de espera agotado para obtener ubicación';
              break;
          }
          
          reject(new Error(errorMessage));
        },
        options
      );
    });
  }

  watchPosition(callback: (position: UserLocation) => void, errorCallback: (error: string) => void): number {
    if (!navigator.geolocation) {
      errorCallback('Geolocalización no soportada');
      return -1;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    };

    return navigator.geolocation.watchPosition(
      (position) => {
        callback({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        errorCallback(`Error: ${error.message}`);
      },
      options
    );
  }

  clearWatch(watchId: number): void {
    navigator.geolocation.clearWatch(watchId);
  }
}
