import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { BackendAuthService } from './backend-auth.service';
import { environment } from '../../environments/environment';

// Mensajes entrantes (cliente -> servidor)
export interface OutgoingWebSocketMessage {
  id?: number;
  type: 'request' | 'response' | 'ping' | 'offer_accepted' | 'job_started' | 'job_completed';
  fromUser: string;
  toUsers?: string[];
  categoryId?: number;
  latitude?: number;
  longitude?: number;
  message: string;
  maxDistanceKm?: number;
  requestId?: string;
  offerId?: string;
}

// Mensajes salientes (servidor -> cliente)
export interface IncomingWebSocketMessage {
  id?: number;
  type: 'request' | 'response' | 'notification' | 'error' | 'pong' | 'authenticated' | 'offer_accepted' | 'job_started' | 'job_completed';
  fromUser?: string;
  user?: string; // Para compatibilidad
  message: string;
  latitude?: number;
  longitude?: number;
  categoryId?: number;
  categoryName?: string;
  requestId?: string;
  offerId?: string;
  timestamp?: string;
  distanceKm?: number;
  providerInfo?: ProviderInfo;
  clientInfo?: ClientInfo;
  status?: string; // Para mensajes de conexion
  userId?: string; // Para mensajes de autenticacion
}

export interface ClientInfo {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

export interface ProviderInfo {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  categories: number[];
  rating?: number;
  responseTime?: string;
}

export interface ServiceRequest {
  id: number;
  type: string;
  fromUser: string;
  message: string;
  latitude: number;
  longitude: number;
  categoryId: number;
  categoryName: string;
  requestId: string;
  timestamp: string;
  maxDistanceKm?: number;
}

export interface ProviderResponse {
  id: number;
  type: string;
  fromUser: string;
  message: string;
  latitude: number;
  longitude: number;
  requestId: string;
  timestamp: string;
  providerInfo: ProviderInfo;
}

@Injectable({
  providedIn: 'root'
})
export class AjustadoAtiWebSocketService {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: any;
  private heartbeatTimer: any;
  private isAuthenticated = false;
  private pendingConnectResolve: (() => void) | null = null;
  private pendingConnectReject: ((error: any) => void) | null = null;

  // Observables para diferentes tipos de mensajes
  private connectionStatus$ = new BehaviorSubject<boolean>(false);
  private authenticationStatus$ = new BehaviorSubject<boolean>(false);
  private serviceRequests$ = new Subject<ServiceRequest>();
  private providerResponses$ = new Subject<ProviderResponse>();
  private notifications$ = new Subject<IncomingWebSocketMessage>();
  private errors$ = new Subject<IncomingWebSocketMessage>();

  // Configuración del WebSocket
  private readonly rawWsUrl = environment.websocket?.url || '/api/ws-native';
  private readonly wsUrl: string;
  private readonly maxReconnectAttempts = environment.websocket?.maxReconnectAttempts || 5;
  private readonly reconnectInterval = environment.websocket?.reconnectInterval || 3000;
  private readonly heartbeatInterval = environment.websocket?.heartbeatInterval || 30000;

  constructor(private auth: BackendAuthService) {
    this.wsUrl = this.resolveWebSocketUrl(this.rawWsUrl);
    console.log('🔌 AjustadoAti WebSocket service initialized for Spring Boot backend');
    console.log('🔗 WebSocket URL:', this.wsUrl);
  }

  private resolveWebSocketUrl(url: string): string {
    if (url.startsWith('ws://') || url.startsWith('wss://')) {
      return url;
    }

    if (url.startsWith('/')) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}${url}`;
    }

    return url;
  }

  // =================== CONEXIÓN ===================

  // Método público para conectar WebSocket con autenticación JWT
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const token = this.auth.getJwtToken();
        console.log('🔐 WS token check:', {
          hasToken: !!token,
          parts: token ? token.split('.').length : 0,
          prefix: token ? token.slice(0, 10) : null
        });
        if (!token) {
          reject(new Error('No JWT token available'));
          return;
        }

        this.connectInternal(token, resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  private connectInternal(jwtToken: string, resolve?: () => void, reject?: (error: any) => void): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.isAuthenticatedStatus()) {
      console.log('🔌 WebSocket already connected and authenticated');
      if (resolve) resolve();
      return;
    }

    console.log('🔌 Attempting to connect to Spring Boot WebSocket...');
    
    try {
      const wsUrlWithToken = `${this.wsUrl}?token=${encodeURIComponent(jwtToken)}`;
      console.log('🔗 Connecting to:', this.wsUrl);

      this.pendingConnectResolve = resolve || null;
      this.pendingConnectReject = reject || null;
      
      this.socket = new WebSocket(wsUrlWithToken);
      
      this.socket.onopen = (event) => {
        console.log('✅ WebSocket transport opened, waiting for authentication');
        this.connectionStatus$.next(true);
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
      };

      this.socket.onmessage = (event) => {
        console.log('📨 WebSocket message received:', event.data);
        this.handleMessage(event.data);
      };

      this.socket.onclose = (event) => {
        console.log('🔌 WebSocket connection closed:', event.code, event.reason);
        const wasAuthenticated = this.isAuthenticated;
        this.connectionStatus$.next(false);
        this.authenticationStatus$.next(false);
        this.isAuthenticated = false;
        this.stopHeartbeat();
        this.rejectPendingConnect(new Error(event.reason || `WebSocket closed with code ${event.code}`));
        
        // Solo intentar reconectar si no fue un cierre manual
        if (event.code !== 1000 && wasAuthenticated) {
          this.attemptReconnect();
        }
      };

      this.socket.onerror = (error) => {
        console.error('💥 WebSocket error:', error);
        this.errors$.next({
          type: 'error',
          message: 'WebSocket connection error'
        });
        
        this.rejectPendingConnect(error);
      };

    } catch (error) {
      console.error('💥 Failed to create WebSocket connection:', error);
      this.attemptReconnect();
      this.rejectPendingConnect(error);
    }
  }

  disconnect(): void {
    console.log('🔌 Disconnecting WebSocket...');
    
    this.clearReconnectTimer();
    this.stopHeartbeat();
    
    if (this.socket) {
      this.socket.close(1000, 'Manual disconnect');
      this.socket = null;
    }
    
    this.connectionStatus$.next(false);
    this.authenticationStatus$.next(false);
    this.isAuthenticated = false;
    this.rejectPendingConnect(new Error('WebSocket disconnected'));
  }

  // =================== MANEJO DE MENSAJES ===================

  private handleMessage(rawMessage: string): void {
    try {
      console.log('📥 Parsing WebSocket message...');
      const message: IncomingWebSocketMessage = JSON.parse(rawMessage);

      // Backend connection/auth responses may arrive as {status, message, userId, timestamp} without a `type`.
      // Normalize them so the rest of the client can treat them as auth events.
      if (!message.type && (message as any).status) {
        console.log('🔐 Connection status message received:', (message as any).status);
        this.handleAuthentication(message);
        return;
      }

      console.log('📥 Parsed message type:', message.type);

      // Log non-pong messages with more detail
      if (message.type !== 'pong') {
        console.log('📥📥📥 NON-PONG MESSAGE RECEIVED:', JSON.stringify(message, null, 2));
      }

      switch (message.type) {
        case 'authenticated':
          this.handleAuthentication(message);
          break;
        case 'request':
          this.handleServiceRequest(message);
          break;
        case 'response':
          this.handleProviderResponse(message);
          break;
        case 'notification':
          this.handleNotification(message);
          break;
        case 'error':
          this.handleError(message);
          break;
        case 'pong':
          this.handlePong(message);
          break;
        case 'offer_accepted':
          this.handleOfferAccepted(message);
          break;
        case 'job_started':
        case 'job_completed':
          this.handleJobUpdate(message);
          break;
        default:
          console.warn('Unknown message type:', message.type);
          this.notifications$.next(message);
      }
    } catch (error) {
      console.error('💥 Error processing WebSocket message:', error);
      console.log('Raw message:', rawMessage);
    }
  }

  private handleAuthentication(message: IncomingWebSocketMessage): void {
    if (message.status === 'authenticated') {
      console.log('✅ WebSocket authenticated successfully');
      this.isAuthenticated = true;
      this.authenticationStatus$.next(true);
      this.startHeartbeat();
      this.resolvePendingConnect();
    } else if (message.status === 'error') {
      console.error('❌ WebSocket authentication failed:', message.message);
      this.authenticationStatus$.next(false);
      this.errors$.next(message);
      this.rejectPendingConnect(new Error(message.message || 'WebSocket authentication failed'));
    }
  }

  private handleServiceRequest(message: IncomingWebSocketMessage): void {
    console.log('🔔🔔🔔 SERVICE REQUEST HANDLER CALLED');
    console.log('🔔 Full message:', JSON.stringify(message, null, 2));

    const isProvider = this.auth.isProvider();
 
    // Verificar si es para un proveedor
    if (isProvider) {
      const serviceRequest: ServiceRequest = {
        id: message.id || Date.now(),
        type: message.type,
        fromUser: message.fromUser || '',
        message: message.message,
        latitude: message.latitude || 0,
        longitude: message.longitude || 0,
        categoryId: message.categoryId || 0,
        categoryName: message.categoryName || '',
        requestId: message.requestId || '',
        timestamp: message.timestamp || new Date().toISOString(),
        maxDistanceKm: message.distanceKm
      };

      console.log('✅ Emitting service request to subscribers:', serviceRequest);
      this.serviceRequests$.next(serviceRequest);
    } else {
      console.warn('⚠️ Service request ignored - current user is not a provider');
    }
  }

  private handleProviderResponse(message: IncomingWebSocketMessage): void {
    console.log('📡 Provider response received:', message);
    console.log('👤 Current user is provider:', this.auth.isProvider());
    console.log('👤 Current user email:', this.auth.currentUser?.email);
    console.log('📡 Message from user:', message.fromUser);
    console.log('📡 Request ID:', message.requestId);
    
    // TEMPORAL: Procesar todas las respuestas para debug
    // TODO: Cambiar por lógica correcta después del debug
    console.log('⚠️ DEBUG MODE: Processing response regardless of user type');
    
    // DEBUG: Procesar siempre para encontrar el problema
    console.log('✅ Processing provider response for user (DEBUG MODE)');
    
    const providerResponse: ProviderResponse = {
      id: message.id || Date.now(),
      type: message.type,
      fromUser: message.fromUser || message.user || '',
      message: message.message,
      latitude: message.latitude || 0,
      longitude: message.longitude || 0,
      requestId: message.requestId || '',
      timestamp: message.timestamp || new Date().toISOString(),
      providerInfo: (message.providerInfo as ProviderInfo) || {
        id: '',
        fullName: 'Proveedor',
        username: '',
        email: '',
        phone: '',
        categories: []
      }
    };
    
    console.log('📤 Emitting provider response to subscribers:', providerResponse);
    this.providerResponses$.next(providerResponse);
  }

  private handleNotification(message: IncomingWebSocketMessage): void {
    console.log('📢 Notification received:', message.message);
    this.notifications$.next(message);
  }

  private handleError(message: IncomingWebSocketMessage): void {
    console.error('❌ Error message received:', message.message);
    this.errors$.next(message);
  }

  private handlePong(message: IncomingWebSocketMessage): void {
    console.log('🏓 Pong received');
  }

  private handleOfferAccepted(message: IncomingWebSocketMessage): void {
    console.log('✅ Offer accepted notification received:', message);

    // Emit as notification so both user and provider can handle it
    this.notifications$.next({
      ...message,
      type: 'offer_accepted'
    });
  }

  private handleJobUpdate(message: IncomingWebSocketMessage): void {
    console.log('📋 Job update received:', message.type, message);

    // Emit as notification for job status updates
    this.notifications$.next(message);
  }

  // =================== ENVÍO DE MENSAJES ===================

  private sendMessage(message: OutgoingWebSocketMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('📤 Sending WebSocket message:', message);
      this.socket.send(JSON.stringify(message));
    } else {
      console.error('❌ Cannot send message: WebSocket not connected');
      throw new Error('WebSocket not connected');
    }
  }

  // Enviar solicitud de servicio (desde Usuario)
  sendServiceRequest(
    categoryId: number,
    message: string,
    latitude: number,
    longitude: number,
    maxDistanceKm: number = 10
  ): void {
    const currentUser = this.auth.currentUser;
    if (!currentUser?.email) {
      throw new Error('No authenticated user');
    }

    const request: OutgoingWebSocketMessage = {
      id: Date.now(),
      type: 'request',
      fromUser: currentUser.email,
      categoryId,
      message,
      latitude,
      longitude,
      maxDistanceKm
    };

    console.log('📤📤📤 SENDING SERVICE REQUEST:', JSON.stringify(request, null, 2));
    this.sendMessage(request);
    console.log('✅ Service request sent to WebSocket');
  }

  // Enviar respuesta de proveedor (desde Proveedor)
  sendProviderResponse(
    requestId: string,
    toUsers: string[],
    message: string,
    latitude: number,
    longitude: number
  ): void {
    const currentUser = this.auth.currentUser;
    if (!currentUser?.email) {
      throw new Error('No authenticated user');
    }

    if (!this.auth.isProvider()) {
      throw new Error('Only providers can send responses');
    }

    const response: OutgoingWebSocketMessage = {
      id: Date.now(),
      type: 'response',
      fromUser: currentUser.email,
      toUsers,
      requestId,
      message,
      latitude,
      longitude
    };

    this.sendMessage(response);
  }

  // Enviar ping para mantener conexión activa
  sendPing(): void {
    const currentUser = this.auth.currentUser;
    if (!currentUser?.email) {
      return;
    }

    const ping: OutgoingWebSocketMessage = {
      type: 'ping',
      fromUser: currentUser.email,
      message: 'ping'
    };

    this.sendMessage(ping);
  }

  // Enviar notificación de oferta aceptada (desde Usuario)
  sendOfferAccepted(
    requestId: string,
    offerId: string,
    toProvider: string
  ): void {
    const currentUser = this.auth.currentUser;
    if (!currentUser?.email) {
      throw new Error('No authenticated user');
    }

    const message: OutgoingWebSocketMessage = {
      id: Date.now(),
      type: 'offer_accepted',
      fromUser: currentUser.email,
      toUsers: [toProvider],
      requestId,
      offerId,
      message: 'Oferta aceptada'
    };

    this.sendMessage(message);
  }

  // Enviar notificación de trabajo iniciado (desde Proveedor)
  sendJobStarted(
    requestId: string,
    toClient: string
  ): void {
    const currentUser = this.auth.currentUser;
    if (!currentUser?.email) {
      throw new Error('No authenticated user');
    }

    if (!this.auth.isProvider()) {
      throw new Error('Only providers can send job updates');
    }

    const message: OutgoingWebSocketMessage = {
      id: Date.now(),
      type: 'job_started',
      fromUser: currentUser.email,
      toUsers: [toClient],
      requestId,
      message: 'Trabajo iniciado'
    };

    this.sendMessage(message);
  }

  // Enviar notificación de trabajo completado (desde Proveedor)
  sendJobCompleted(
    requestId: string,
    toClient: string
  ): void {
    const currentUser = this.auth.currentUser;
    if (!currentUser?.email) {
      throw new Error('No authenticated user');
    }

    if (!this.auth.isProvider()) {
      throw new Error('Only providers can send job updates');
    }

    const message: OutgoingWebSocketMessage = {
      id: Date.now(),
      type: 'job_completed',
      fromUser: currentUser.email,
      toUsers: [toClient],
      requestId,
      message: 'Trabajo completado'
    };

    this.sendMessage(message);
  }

  // =================== HEARTBEAT ===================

  private startHeartbeat(): void {
    this.stopHeartbeat(); // Limpiar cualquier heartbeat anterior
    
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.sendPing();
      }
    }, this.heartbeatInterval);
    
    console.log('💓 Heartbeat started');
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      console.log('💓 Heartbeat stopped');
    }
  }

  // =================== RECONEXIÓN ===================

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('🔄 Reconnection failed:', error);
      }
    }, this.reconnectInterval);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private resolvePendingConnect(): void {
    if (this.pendingConnectResolve) {
      this.pendingConnectResolve();
    }
    this.pendingConnectResolve = null;
    this.pendingConnectReject = null;
  }

  private rejectPendingConnect(error: any): void {
    if (this.pendingConnectReject) {
      this.pendingConnectReject(error);
    }
    this.pendingConnectResolve = null;
    this.pendingConnectReject = null;
  }

  // =================== OBSERVABLES PÚBLICOS ===================

  // Estado de conexión
  getConnectionStatus(): Observable<boolean> {
    return this.connectionStatus$.asObservable();
  }

  // Estado de autenticación
  getAuthenticationStatus(): Observable<boolean> {
    return this.authenticationStatus$.asObservable();
  }

  // Solicitudes de servicio (para Proveedores)
  getServiceRequests(): Observable<ServiceRequest> {
    return this.serviceRequests$.asObservable();
  }

  // Respuestas de proveedores (para Usuarios)
  getProviderResponses(): Observable<ProviderResponse> {
    return this.providerResponses$.asObservable();
  }

  // Notificaciones generales
  getNotifications(): Observable<IncomingWebSocketMessage> {
    return this.notifications$.asObservable();
  }

  // Errores
  getErrors(): Observable<IncomingWebSocketMessage> {
    return this.errors$.asObservable();
  }

  // Estado actual de conexión
  isConnected(): boolean {
    return this.connectionStatus$.value;
  }

  // Estado actual de autenticación
  isAuthenticatedStatus(): boolean {
    return this.authenticationStatus$.value;
  }

  // =================== MÉTODOS AUXILIARES ===================

  // Inicializar automáticamente cuando un usuario se autentica
  async initializeForUser(): Promise<void> {
    console.log('🚀 Initializing WebSocket for authenticated user');
    
    try {
      await this.connect();
      console.log('✅ WebSocket initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize WebSocket:', error);
      throw error;
    }
  }

  // Limpiar cuando el usuario se desconecta
  cleanup(): void {
    console.log('🧹 Cleaning up WebSocket service');
    this.disconnect();
  }

  // Obtener estadísticas de conexión
  getConnectionStats() {
    return {
      connected: this.isConnected(),
      authenticated: this.isAuthenticatedStatus(),
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts
    };
  }
}
