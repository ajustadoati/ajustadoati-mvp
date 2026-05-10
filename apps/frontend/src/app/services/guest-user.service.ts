import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Preferences } from '@capacitor/preferences';

export interface GuestUser {
  id: string;
  type: 'guest';
  deviceId: string;
  sessionId: string;
  createdAt: string;
  lastActivity: string;
  searchCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class GuestUserService {
  private currentGuestUser$ = new BehaviorSubject<GuestUser | null>(null);
  private guestStorageKey = 'ajustadoati_guest_user';

  constructor() {
    this.initializeGuestUser();
  }

  /**
   * Inicializa un usuario invitado si no existe
   */
  private async initializeGuestUser() {
    try {
      // Verificar si ya existe un usuario invitado guardado
      const storedGuest = await this.getStoredGuestUser();
      
      if (storedGuest && this.isValidGuestSession(storedGuest)) {
        // Usuario invitado válido encontrado
        this.currentGuestUser$.next(storedGuest);
      }
    } catch (error) {
      console.error('Error inicializando usuario invitado:', error);
    }
  }

  /**
   * Crea un nuevo usuario invitado
   */
  async createGuestUser(): Promise<GuestUser> {
    try {
      const deviceId = await this.getDeviceId();
      const sessionId = this.generateSessionId();
      const now = new Date().toISOString();

      const guestUser: GuestUser = {
        id: `guest_${deviceId}_${Date.now()}`,
        type: 'guest',
        deviceId,
        sessionId,
        createdAt: now,
        lastActivity: now,
        searchCount: 0
      };

      // Guardar en almacenamiento local
      await this.saveGuestUser(guestUser);
      
      // Actualizar observable
      this.currentGuestUser$.next(guestUser);

      console.log('✅ Usuario invitado creado:', guestUser);
      return guestUser;
    } catch (error) {
      console.error('Error creando usuario invitado:', error);
      throw error;
    }
  }

  /**
   * Obtiene el usuario invitado actual
   */
  getCurrentGuestUser(): Observable<GuestUser | null> {
    return this.currentGuestUser$.asObservable();
  }

  /**
   * Verifica si hay un usuario invitado activo
   */
  hasActiveGuestUser(): boolean {
    const currentGuest = this.currentGuestUser$.value;
    return currentGuest !== null && this.isValidGuestSession(currentGuest);
  }

  /**
   * Actualiza la actividad del usuario invitado
   */
  async updateGuestActivity(): Promise<void> {
    const currentGuest = this.currentGuestUser$.value;
    if (currentGuest) {
      const updatedGuest: GuestUser = {
        ...currentGuest,
        lastActivity: new Date().toISOString()
      };
      
      await this.saveGuestUser(updatedGuest);
      this.currentGuestUser$.next(updatedGuest);
    }
  }

  /**
   * Incrementa el contador de búsquedas
   */
  async incrementSearchCount(): Promise<void> {
    const currentGuest = this.currentGuestUser$.value;
    if (currentGuest) {
      const updatedGuest: GuestUser = {
        ...currentGuest,
        searchCount: currentGuest.searchCount + 1,
        lastActivity: new Date().toISOString()
      };
      
      await this.saveGuestUser(updatedGuest);
      this.currentGuestUser$.next(updatedGuest);
    }
  }

  /**
   * Limpia el usuario invitado (logout)
   */
  async clearGuestUser(): Promise<void> {
    try {
      await Preferences.remove({ key: this.guestStorageKey });
      this.currentGuestUser$.next(null);
      console.log('✅ Usuario invitado eliminado');
    } catch (error) {
      console.error('Error eliminando usuario invitado:', error);
    }
  }

  /**
   * Obtiene información de identificación del dispositivo
   */
  private async getDeviceId(): Promise<string> {
    try {
      // Intentar obtener un ID del dispositivo guardado
      const { value } = await Preferences.get({ key: 'ajustadoati_device_id' });
      
      if (value) {
        return value;
      }

      // Crear nuevo ID del dispositivo
      const deviceId = this.generateDeviceId();
      await Preferences.set({ 
        key: 'ajustadoati_device_id', 
        value: deviceId 
      });
      
      return deviceId;
    } catch (error) {
      console.error('Error obteniendo device ID:', error);
      return this.generateDeviceId();
    }
  }

  /**
   * Genera un ID único para el dispositivo
   */
  private generateDeviceId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `device_${timestamp}_${random}`;
  }

  /**
   * Genera un ID único para la sesión
   */
  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `session_${timestamp}_${random}`;
  }

  /**
   * Guarda el usuario invitado en el almacenamiento local
   */
  private async saveGuestUser(guestUser: GuestUser): Promise<void> {
    try {
      await Preferences.set({
        key: this.guestStorageKey,
        value: JSON.stringify(guestUser)
      });
    } catch (error) {
      console.error('Error guardando usuario invitado:', error);
      throw error;
    }
  }

  /**
   * Obtiene el usuario invitado del almacenamiento local
   */
  private async getStoredGuestUser(): Promise<GuestUser | null> {
    try {
      const { value } = await Preferences.get({ key: this.guestStorageKey });
      
      if (value) {
        return JSON.parse(value) as GuestUser;
      }
      
      return null;
    } catch (error) {
      console.error('Error obteniendo usuario invitado guardado:', error);
      return null;
    }
  }

  /**
   * Verifica si la sesión del usuario invitado es válida
   */
  private isValidGuestSession(guestUser: GuestUser): boolean {
    const now = new Date();
    const lastActivity = new Date(guestUser.lastActivity);
    const hoursSinceLastActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
    
    // La sesión es válida por 24 horas
    return hoursSinceLastActivity < 24;
  }

  /**
   * Obtiene estadísticas del usuario invitado
   */
  getGuestStats(): { searchCount: number; createdAt: string; lastActivity: string } | null {
    const currentGuest = this.currentGuestUser$.value;
    
    if (currentGuest) {
      return {
        searchCount: currentGuest.searchCount,
        createdAt: currentGuest.createdAt,
        lastActivity: currentGuest.lastActivity
      };
    }
    
    return null;
  }
}
