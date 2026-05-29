import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router, ActivatedRoute } from '@angular/router';
import { LoadingController, ToastController, AlertController } from '@ionic/angular';
import {
  AjustadoAtiWebSocketService,
  ServiceRequest
} from '../../../services/ajustadoati-websocket.service';
import { HybridGeolocationService, Position } from '../../../services/hybrid-geolocation.service';
import {
  ProviderSentResponse,
  ProviderWorkspaceService
} from '../../../services/provider-workspace.service';

declare var google: any;

@Component({
  selector: 'app-request-detail',
  templateUrl: './request-detail.page.html',
  styleUrls: ['./request-detail.page.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class RequestDetailPage implements OnInit, OnDestroy {
  request: ServiceRequest | null = null;
  responseForm: FormGroup;
  currentPosition: Position | null = null;
  isLoadingLocation = false;
  isSendingResponse = false;
  sentResponse: ProviderSentResponse | null = null;

  // Google Maps (Web)
  private map: any = null;
  private markers: any[] = [];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private websocket: AjustadoAtiWebSocketService,
    private geolocation: HybridGeolocationService,
    private providerWorkspace: ProviderWorkspaceService
  ) {
    this.responseForm = this.fb.group({
      message: ['', [Validators.required, Validators.minLength(10)]],
      estimatedTime: ['', Validators.required],
      estimatedCost: ['']
    });

    // Get request from navigation state
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state) {
      this.request = navigation.extras.state['request'];
    }
  }

  async ngOnInit() {
    console.log('📋 Request Detail page initialized');

    if (!this.request) {
      await this.showToast('Solicitud no encontrada', 'danger');
      this.router.navigate(['/provider/home']);
      return;
    }

    this.sentResponse = this.providerWorkspace.getResponseForRequest(this.request) || null;
    if (this.sentResponse) {
      this.responseForm.disable();
    }

    await this.loadCurrentPosition();
    this.waitForGoogleMapsAndElement();
  }

  ngOnDestroy() {
    this.destroyMap();
  }

  private async loadCurrentPosition() {
    try {
      this.isLoadingLocation = true;
      this.currentPosition = await this.geolocation.getCurrentPosition();
      console.log('📍 Current position:', this.currentPosition);
    } catch (error) {
      console.error('Error loading position:', error);
      await this.showToast('No se pudo obtener tu ubicación', 'warning');
    } finally {
      this.isLoadingLocation = false;
    }
  }

  private waitForGoogleMapsAndElement(attempts: number = 0) {
    const maxAttempts = 20; // ~6s
    if (!this.request) return;

    const mapElement = document.getElementById('request-map');
    const googleReady = typeof google !== 'undefined' && google.maps;

    if (googleReady && mapElement) {
      this.initializeMap(mapElement);
      return;
    }

    if (attempts >= maxAttempts) {
      console.error('❌ Timeout waiting for Google Maps or map element');
      return;
    }

    setTimeout(() => this.waitForGoogleMapsAndElement(attempts + 1), 300);
  }

  private initializeMap(mapElement: HTMLElement) {
    if (!this.request) return;

    try {
      this.map = new google.maps.Map(mapElement, {
        center: { lat: this.request.latitude, lng: this.request.longitude },
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });

      const clientMarker = new google.maps.Marker({
        position: { lat: this.request.latitude, lng: this.request.longitude },
        map: this.map,
        title: 'Cliente',
        icon: this.createPinIcon('#2563eb', 'C')
      });
      this.markers.push(clientMarker);

      if (this.currentPosition) {
        const providerMarker = new google.maps.Marker({
          position: { lat: this.currentPosition.latitude, lng: this.currentPosition.longitude },
          map: this.map,
          title: 'Tu ubicación',
          icon: this.createPinIcon('#16a34a', 'T')
        });
        this.markers.push(providerMarker);

        // Fit bounds to show both points
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(clientMarker.getPosition());
        bounds.extend(providerMarker.getPosition());
        this.map.fitBounds(bounds, 80);
        google.maps.event.addListenerOnce(this.map, 'idle', () => {
          if (this.map && this.map.getZoom() > 15) {
            this.map.setZoom(15);
          }
        });
      } else if (this.map) {
        this.map.setZoom(15);
      }
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  }

  private createPinIcon(color: string, label: string) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="rgba(15,23,42,0.28)"/>
          </filter>
        </defs>
        <g filter="url(#shadow)">
          <path d="M22 2C12.06 2 4 10.06 4 20c0 13.18 14.64 27.39 17.2 29.79a1.2 1.2 0 0 0 1.6 0C25.36 47.39 40 33.18 40 20 40 10.06 31.94 2 22 2Z" fill="${color}"/>
          <circle cx="22" cy="20" r="11" fill="#ffffff" fill-opacity="0.95"/>
          <text x="22" y="24.5" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="${color}">${label}</text>
        </g>
      </svg>
    `.trim();

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(44, 52),
      anchor: new google.maps.Point(22, 52)
    };
  }

  private destroyMap() {
    this.markers.forEach(marker => {
      if (marker?.setMap) marker.setMap(null);
    });
    this.markers = [];
    this.map = null;
  }

  async sendResponse() {
    if (this.sentResponse) {
      await this.showToast('Ya respondiste esta solicitud', 'warning');
      return;
    }

    if (this.responseForm.invalid) {
      this.markFormGroupTouched();
      await this.showToast('Por favor completa todos los campos requeridos', 'warning');
      return;
    }

    if (!this.request || !this.currentPosition) {
      await this.showToast('Información incompleta para enviar respuesta', 'danger');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Confirmar Respuesta',
      message: '¿Estás seguro de que quieres enviar esta respuesta al cliente?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Enviar',
          handler: async () => {
            await this.performSendResponse();
          }
        }
      ]
    });

    await alert.present();
  }

  private async performSendResponse() {
    if (!this.request || !this.currentPosition) return;

    const loading = await this.loadingCtrl.create({
      message: 'Enviando respuesta...',
      spinner: 'crescent'
    });
    await loading.present();

    this.isSendingResponse = true;

    try {
      const formValues = this.responseForm.value;

      // Build response message
      const responseMessage = `
${formValues.message}

⏱️ Tiempo estimado: ${formValues.estimatedTime}
${formValues.estimatedCost ? `💰 Costo estimado: ${formValues.estimatedCost}` : ''}

¿Te interesa? Respóndeme para coordinar.
      `.trim();

      // Send response via WebSocket
      this.websocket.sendProviderResponse(
        this.request.requestId,
        [this.request.fromUser],
        responseMessage,
        this.currentPosition.latitude,
        this.currentPosition.longitude
      );

      this.sentResponse = this.providerWorkspace.markResponded(
        this.request,
        responseMessage,
        this.currentPosition
      );
      this.responseForm.disable();

      await loading.dismiss();
      await this.showToast('✅ Respuesta enviada correctamente', 'success');

      // Navigate back
      setTimeout(() => {
        this.router.navigate(['/provider/home']);
      }, 1500);

    } catch (error) {
      await loading.dismiss();
      console.error('Error sending response:', error);
      await this.showToast('Error al enviar respuesta. Inténtalo de nuevo.', 'danger');
    } finally {
      this.isSendingResponse = false;
    }
  }

  async callClient() {
    // TODO: Implement call functionality
    await this.showToast('Función de llamada en desarrollo', 'warning');
  }

  async getDirections() {
    if (!this.request) return;

    const url = `https://www.google.com/maps/dir/?api=1&destination=${this.request.latitude},${this.request.longitude}`;
    window.open(url, '_blank');
  }

  private markFormGroupTouched() {
    Object.keys(this.responseForm.controls).forEach(key => {
      const control = this.responseForm.get(key);
      control?.markAsTouched();
    });
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger' = 'success') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'top'
    });
    await toast.present();
  }

  goBack() {
    this.router.navigate(['/provider/home']);
  }

  // Getters for template
  get message() { return this.responseForm.get('message'); }
  get estimatedTime() { return this.responseForm.get('estimatedTime'); }
  get estimatedCost() { return this.responseForm.get('estimatedCost'); }

  getDistanceKm(): number {
    if (!this.currentPosition || !this.request) return 0;

    const R = 6371; // Radio de la Tierra en km
    const dLat = this.deg2rad(this.request.latitude - this.currentPosition.latitude);
    const dLon = this.deg2rad(this.request.longitude - this.currentPosition.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(this.currentPosition.latitude)) *
      Math.cos(this.deg2rad(this.request.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 10) / 10;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
