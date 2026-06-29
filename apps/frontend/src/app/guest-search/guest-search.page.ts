import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, LoadingController, ToastController } from '@ionic/angular';
import { Subscription, firstValueFrom } from 'rxjs';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  cashOutline,
  checkmarkCircleOutline,
  closeOutline,
  informationCircleOutline,
  location,
  locationOutline,
  logInOutline,
  logoWhatsapp,
  mapOutline,
  personAdd,
  personCircleOutline,
  searchOutline,
  timeOutline
} from 'ionicons/icons';
import { CategoryService } from '../services/category.service';
import { GeolocationService, UserLocation } from '../services/geolocation.service';
import { SearchRequestService, SearchSession } from '../services/search-request.service';
import { GuestUserService } from '../services/guest-user.service';
import { Category } from '../interfaces/category';

declare const google: any;

@Component({
  selector: 'app-guest-search',
  templateUrl: './guest-search.page.html',
  styleUrls: ['./guest-search.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class GuestSearchPage implements OnInit, OnDestroy {
  categories: Category[] = [];
  selectedCategory: number | null = null;
  serviceDescription = '';
  isLoading = false;
  isLocationLoading = false;
  userLocation: UserLocation | null = null;
  guestStats: { searchCount: number; createdAt: string; lastActivity: string } | null = null;
  currentSearchSession: SearchSession | null = null;
  isSearchModalOpen = false;
  modalStep: 'form' | 'results' = 'form';
  locationErrorMessage = '';
  searchErrorMessage = '';
  isMapReady = false;

  private subscriptions: Subscription[] = [];
  private map: any = null;
  private markers: any[] = [];
  private lastMapSignature = '';
  private renderedResponseIds = new Set<string>();

  constructor(
    private router: Router,
    private categoryService: CategoryService,
    private geolocationService: GeolocationService,
    private searchRequestService: SearchRequestService,
    private guestUserService: GuestUserService,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private toastController: ToastController
  ) {
    addIcons({
      arrowBackOutline,
      cashOutline,
      checkmarkCircleOutline,
      closeOutline,
      informationCircleOutline,
      location,
      locationOutline,
      logInOutline,
      logoWhatsapp,
      mapOutline,
      personAdd,
      personCircleOutline,
      searchOutline,
      timeOutline
    });
  }

  async ngOnInit() {
    await this.ensureGuestUser();
    await this.loadCategories();
    this.loadGuestStats();
    this.setupSearchSubscriptions();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.clearMap();
  }

  async ensureGuestUser() {
    if (!this.guestUserService.hasActiveGuestUser()) {
      await this.guestUserService.createGuestUser();
      return;
    }

    await this.guestUserService.updateGuestActivity();
  }

  setupSearchSubscriptions() {
    const sessionSub = this.searchRequestService.getCurrentSearchSession().subscribe(session => {
      this.currentSearchSession = session;
      // Recompute the template-bound list once per session emission instead
      // of on every change detection tick (used to be a getter, which froze
      // the page when polling kept emitting and Angular destroyed/recreated
      // every <ion-card> response on each CD cycle).
      this.rebuildRespondedProviders();

      if (session && this.modalStep === 'results') {
        const signature = this.buildMapSignature(session);
        if (signature !== this.lastMapSignature) {
          // New search or provider list changed — full map reinit
          this.lastMapSignature = signature;
          this.renderedResponseIds.clear();
          setTimeout(() => this.initializeResultsMap(), 200);
        } else if (this.map) {
          // Same search, map already exists — only add new response markers
          this.addNewResponseMarkers(session);
        }
      }
    });

    this.subscriptions.push(sessionSub);
  }

  loadGuestStats() {
    this.guestStats = this.guestUserService.getGuestStats();
  }

  async loadCategories() {
    this.isLoading = true;

    try {
      this.categories = await firstValueFrom(this.categoryService.getCategories());
    } catch (error) {
      console.error('Error loading guest categories:', error);
      this.categories = this.getFallbackCategories();
      await this.showToast('Usando categorias basicas mientras conectamos con el servidor', 'warning');
    } finally {
      this.isLoading = false;
    }
  }

  openSearchModal() {
    this.isSearchModalOpen = true;
    this.modalStep = 'form';
    this.searchErrorMessage = '';
    this.locationErrorMessage = '';
    this.lastMapSignature = '';
    this.clearMap();
  }

  closeSearchModal() {
    this.isSearchModalOpen = false;
    this.modalStep = 'form';
    this.searchErrorMessage = '';
    this.locationErrorMessage = '';
    this.lastMapSignature = '';
    this.clearMap();
  }

  backToForm() {
    this.modalStep = 'form';
    this.searchErrorMessage = '';
    this.lastMapSignature = '';
    this.clearMap();
  }

  async requestLocation(showSuccess = true) {
    this.locationErrorMessage = '';
    this.isLocationLoading = true;

    try {
      this.userLocation = await this.geolocationService.getCurrentPosition();
      if (showSuccess) {
        await this.showToast('Ubicacion lista para la busqueda', 'success');
      }
    } catch (error) {
      console.warn('Guest location unavailable:', error);
      this.userLocation = null;
      this.locationErrorMessage = 'Tu navegador bloqueo la ubicacion o no pudo obtenerla. Activa el GPS para continuar.';
    } finally {
      this.isLocationLoading = false;
    }
  }

  async onSearch() {
    this.searchErrorMessage = '';

    if (!this.selectedCategory) {
      await this.showAlert('Categoria requerida', 'Selecciona la categoria del servicio que necesitas.');
      return;
    }

    if (!this.serviceDescription.trim() || this.serviceDescription.trim().length < 3) {
      await this.showAlert('Descripcion requerida', 'Escribe que servicio o producto necesitas.');
      return;
    }

    if (!this.userLocation) {
      await this.requestLocation(false);
      if (!this.userLocation) {
        this.searchErrorMessage = 'Necesitamos tu ubicacion para mostrar proveedores cercanos en el mapa.';
        return;
      }
    }

    await this.guestUserService.incrementSearchCount();
    this.loadGuestStats();
    await this.startNewSearch();
  }

  async startNewSearch() {
    const loading = await this.loadingController.create({
      message: 'Buscando proveedores cercanos...'
    });
    await loading.present();

    try {
      const category = this.categories.find(item => item.id === this.selectedCategory);
      const searchSession = await this.searchRequestService.createSearchRequest(
        this.serviceDescription.trim(),
        this.selectedCategory!.toString(),
        { lat: this.userLocation!.lat, lng: this.userLocation!.lng },
        category?.name || 'Servicio',
        true
      );

      await loading.dismiss();

      this.currentSearchSession = searchSession;
      this.modalStep = 'results';
      this.lastMapSignature = this.buildMapSignature(searchSession);

      if (searchSession.providers.length === 0) {
        this.searchErrorMessage = 'No encontramos proveedores disponibles cerca de tu ubicacion para esta categoria.';
      }

      setTimeout(() => this.initializeResultsMap(), 250);
    } catch (error: any) {
      await loading.dismiss();
      console.error('Error creating guest search request:', error);
      this.searchErrorMessage = error?.message || 'No se pudo realizar la busqueda. Intentalo de nuevo.';
    }
  }

  onCategoryChange(event: any) {
    this.selectedCategory = event.detail.value;
  }

  onModalDidDismiss() {
    this.closeSearchModal();
  }

  scrollToHowItWorks() {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  goToLogin() {
    this.router.navigate(['/auth/login']);
  }

  goToRegister() {
    this.router.navigate(['/auth/register']);
  }

  get canSearch(): boolean {
    return !!this.selectedCategory && this.serviceDescription.trim().length >= 3 && !this.isLoading && !this.isLocationLoading;
  }

  get locationText(): string {
    if (this.isLocationLoading) return 'Solicitando acceso al GPS...';
    if (!this.userLocation) return 'La pediremos cuando pulses "Usar mi ubicacion"';
    return `${this.userLocation.lat.toFixed(4)}, ${this.userLocation.lng.toFixed(4)}`;
  }

  get providersCount(): number {
    return this.currentSearchSession?.providers.length || 0;
  }

  get responsesCount(): number {
    return this.currentSearchSession?.responses.length || 0;
  }

  get notifiedProvidersCount(): number {
    return this.currentSearchSession?.notifiedProvidersCount || 0;
  }

  respondedProviders: Array<{ response: any; whatsappUrl: string | null }> = [];

  // *ngFor trackBy — keeps Angular from destroying and re-creating every
  // ion-card / ion-icon when respondedProviders is replaced after polling.
  trackResponseById(_index: number, item: { response: any }): string {
    return item.response?.id;
  }

  trackProviderById(_index: number, provider: any): string {
    return provider?.id;
  }

  private rebuildRespondedProviders(): void {
    this.respondedProviders = (this.currentSearchSession?.responses || []).map(response => ({
      response,
      whatsappUrl: this.getWhatsAppUrl(response)
    }));
  }

  private initializeResultsMap() {
    if (this.modalStep !== 'results' || !this.userLocation) {
      return;
    }

    const mapElement = document.getElementById('guest-results-map');
    if (!mapElement || typeof google === 'undefined' || !google.maps) {
      this.isMapReady = false;
      return;
    }

    this.clearMap();

    this.map = new google.maps.Map(mapElement, {
      center: { lat: this.userLocation.lat, lng: this.userLocation.lng },
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });

    const userMarker = new google.maps.Marker({
      position: { lat: this.userLocation.lat, lng: this.userLocation.lng },
      map: this.map,
      title: 'Tu ubicacion',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#2563eb',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3
      }
    });

    this.markers.push(userMarker);

    const responsesWithCoords = (this.currentSearchSession?.responses || []).filter(
      response => typeof response.latitude === 'number' && typeof response.longitude === 'number'
    );

    if (this.currentSearchSession?.providers?.length) {
      this.currentSearchSession.providers.forEach(provider => {
        const location = provider.locations?.[0];
        if (!location?.latitude || !location?.longitude) {
          return;
        }

        const matchedResponse = (this.currentSearchSession?.responses || []).find(response =>
          this.matchesResponseToProvider(provider, response)
        );

        if (matchedResponse && typeof matchedResponse.latitude === 'number' && typeof matchedResponse.longitude === 'number') {
          return;
        }

        const providerMarker = new google.maps.Marker({
          position: { lat: location.latitude, lng: location.longitude },
          map: this.map,
          title: provider.name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#16a34a',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          }
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 8px;">
              <strong>${provider.name}</strong>
              ${location.distance ? `<div style="margin-top: 4px;">${location.distance.toFixed(1)} km</div>` : ''}
            </div>
          `
        });

        providerMarker.addListener('click', () => infoWindow.open(this.map, providerMarker));
        this.markers.push(providerMarker);
      });
    }

    responsesWithCoords.forEach(response => this.addResponseMarkerToMap(response));

    if (this.markers.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      this.markers.forEach(marker => bounds.extend(marker.getPosition()));
      this.map.fitBounds(bounds, 80);
      google.maps.event.addListenerOnce(this.map, 'idle', () => {
        if (this.map && this.map.getZoom() > 15) {
          this.map.setZoom(15);
        }
      });
    } else if (this.map) {
      this.map.setZoom(15);
    }

    this.isMapReady = true;
  }

  private addNewResponseMarkers(session: SearchSession): void {
    (session.responses || [])
      .filter(r => !this.renderedResponseIds.has(r.id) && typeof r.latitude === 'number' && typeof r.longitude === 'number')
      .forEach(r => this.addResponseMarkerToMap(r));
  }

  private addResponseMarkerToMap(response: any): void {
    if (typeof response.latitude !== 'number' || typeof response.longitude !== 'number' || !this.map) {
      return;
    }

    const whatsappUrl = this.getWhatsAppUrl(response);

    const responseMarker = new google.maps.Marker({
      position: { lat: response.latitude, lng: response.longitude },
      map: this.map,
      title: `${response.providerName} respondio`,
      icon: this.buildResponseMarkerIcon(),
      zIndex: 10
    });

    const infoWindow = new google.maps.InfoWindow({
      content: this.buildResponseInfoWindowContent(response, whatsappUrl)
    });

    responseMarker.addListener('click', () => infoWindow.open(this.map, responseMarker));
    this.markers.push(responseMarker);
    this.renderedResponseIds.add(response.id);
  }

  private buildResponseMarkerIcon(): object {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 48" width="36" height="48">',
        '<path d="M18 4C10 4 3 11 3 19c0 13 15 28 15 28S33 32 33 19C33 11 26 4 18 4z"',
          ' fill="rgba(0,0,0,0.18)"/>',
        '<path d="M18 1C9.7 1 3 7.7 3 16c0 13 15 30 15 30S33 29 33 16C33 7.7 26.3 1 18 1z"',
          ' fill="#f97316" stroke="white" stroke-width="2.5"/>',
        '<circle cx="18" cy="16" r="10" fill="white"/>',
        '<path d="M13.5 16.5l3 3 6-6.5"',
          ' stroke="#f97316" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
      '</svg>'
    ].join('');

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(36, 48),
      anchor: new google.maps.Point(18, 48)
    };
  }

  private buildResponseInfoWindowContent(response: any, whatsappUrl: string | null): string {
    const name = response.providerName || 'Proveedor';
    const safeMessage = (response.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const chips = [
      response.estimatedTime
        ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#f1f5f9;border-radius:999px;font-size:12px;font-weight:700;color:#334155;margin-right:6px;">⏱ ${response.estimatedTime} min</span>`
        : '',
      response.price
        ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#f0fdf4;border-radius:999px;font-size:12px;font-weight:700;color:#166534;">💰 $${response.price.toLocaleString()}</span>`
        : ''
    ].join('');

    const waButton = whatsappUrl
      ? `<a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer"
           style="display:flex;align-items:center;justify-content:center;gap:7px;padding:9px 14px;
                  background:#16a34a;color:#fff;text-decoration:none;border-radius:12px;
                  font-size:13px;font-weight:800;">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
             <path d="M17.47 14.38c-.28-.14-1.65-.81-1.9-.9-.26-.1-.44-.14-.63.14-.18.28-.72.9-.88 1.08-.16.18-.33.2-.61.07a7.7 7.7 0 0 1-2.27-1.4 8.5 8.5 0 0 1-1.57-1.95c-.16-.28-.02-.43.12-.57.13-.13.28-.33.42-.5.14-.17.18-.28.28-.47.09-.18.05-.35-.02-.49-.07-.14-.63-1.52-.86-2.08-.23-.55-.46-.47-.63-.48h-.54c-.18 0-.48.07-.73.35-.25.28-.97.95-.97 2.3 0 1.36.99 2.67 1.13 2.85.14.18 1.95 2.98 4.73 4.18.66.28 1.18.45 1.58.58.67.2 1.27.17 1.75.1.53-.08 1.65-.68 1.88-1.33.23-.65.23-1.2.16-1.32-.07-.11-.25-.18-.53-.32z"/>
             <path d="M12 2a10 10 0 0 0-8.65 14.98L2 22l5.19-1.36A10 10 0 1 0 12 2zm0 18.18a8.18 8.18 0 0 1-4.17-1.14l-.3-.18-3.1.81.83-3.02-.2-.31A8.18 8.18 0 1 1 12 20.18z"/>
           </svg>
           Escribir por WhatsApp
         </a>`
      : '';

    return [
      '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:14px 16px;min-width:230px;max-width:290px;">',
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">',
          '<div style="width:38px;height:38px;background:#fff7ed;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:2px solid #fed7aa;">',
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="#f97316">',
              '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
            '</svg>',
          '</div>',
          '<div>',
            `<div style="font-weight:800;font-size:14px;color:#0f172a;line-height:1.2;">${name}</div>`,
            '<div style="font-size:11px;font-weight:700;color:#f97316;margin-top:3px;">✓ Respondió a tu solicitud</div>',
          '</div>',
        '</div>',
        safeMessage ? `<p style="margin:0 0 10px;font-size:13px;color:#334155;line-height:1.5;">${safeMessage}</p>` : '',
        chips ? `<div style="margin-bottom:10px;">${chips}</div>` : '',
        waButton,
      '</div>'
    ].join('');
  }

  private clearMap() {
    this.markers.forEach(marker => marker?.setMap?.(null));
    this.markers = [];
    this.map = null;
    this.isMapReady = false;
    this.renderedResponseIds.clear();
  }

  private buildMapSignature(session: SearchSession): string {
    const providerCoords = (session.providers || [])
      .map(provider => {
        const location = provider.locations?.[0];
        return location ? `${location.latitude},${location.longitude}` : provider.id;
      })
      .join('|');

    // Responses are handled incrementally via addNewResponseMarkers — excluded from signature
    // to avoid triggering a full map reinit each time a provider responds.
    return `${session.searchRequest.id}:${session.searchRequest.userLatitude},${session.searchRequest.userLongitude}:${providerCoords}`;
  }

  private matchesResponseToProvider(provider: any, response: any): boolean {
    if (response.providerId && provider.id && response.providerId === provider.id) {
      return true;
    }

    if (response.providerEmail && provider.email && response.providerEmail === provider.email) {
      return true;
    }

    return response.providerName === provider.name;
  }

  get hasAcceptedOffer(): boolean {
    return !!this.currentSearchSession?.acceptedResponse;
  }

  isResponseAccepted(responseId: string): boolean {
    return this.currentSearchSession?.acceptedResponse?.id === responseId;
  }

  async acceptGuestOffer(response: any) {
    const priceInfo = response.price ? `\nPrecio: $${response.price.toLocaleString()}` : '';
    const timeInfo = response.estimatedTime ? `\nTiempo estimado: ${response.estimatedTime} min` : '';

    const alert = await this.alertController.create({
      header: 'Aceptar oferta',
      message: `¿Quieres aceptar la oferta de ${response.providerName}?${priceInfo}${timeInfo}`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Aceptar',
          handler: () => this.confirmGuestAccept(response)
        }
      ]
    });
    await alert.present();
  }

  private confirmGuestAccept(response: any): void {
    // Update local session state immediately so UI reflects acceptance
    this.searchRequestService.acceptProviderResponse(response.id);
    this.showToast('¡Oferta aceptada! Contacta al proveedor para coordinar.', 'success');

    // Notify backend so it forwards offer_accepted to the provider via WebSocket
    const requestId = this.currentSearchSession?.searchRequest.id;
    if (requestId) {
      this.searchRequestService
        .acceptGuestResponse(requestId, response.id)
        .catch(err => console.warn('Could not notify provider of acceptance:', err));
    }
  }

  getWhatsAppUrl(response: { providerPhone?: string; providerName?: string }): string | null {
    if (!response.providerPhone) {
      return null;
    }

    const cleanPhone = response.providerPhone.replace(/[^\d]/g, '');
    if (!cleanPhone) {
      return null;
    }

    const text = encodeURIComponent(`Hola ${response.providerName || ''}, vi tu respuesta en AjustadoATi y quiero continuar con el servicio.`);
    return `https://wa.me/${cleanPhone}?text=${text}`;
  }

  private getFallbackCategories(): Category[] {
    return [
      { id: 1, name: 'Plomeria', description: 'Servicios de instalacion y reparacion de tuberias' },
      { id: 2, name: 'Electricidad', description: 'Instalacion y reparacion de sistemas electricos' },
      { id: 3, name: 'Carpinteria', description: 'Trabajos en madera, muebles y puertas' },
      { id: 4, name: 'Pintura', description: 'Pintura interior, exterior y acabados' },
      { id: 5, name: 'Jardineria', description: 'Mantenimiento de jardines y poda' },
      { id: 6, name: 'Limpieza', description: 'Limpieza domestica y comercial' },
      { id: 7, name: 'Reparacion de Electrodomesticos', description: 'Mantenimiento de electrodomesticos' },
      { id: 8, name: 'Construccion', description: 'Remodelacion y obra civil' },
      { id: 9, name: 'Tecnologia', description: 'Soporte tecnico y reparacion de dispositivos' },
      { id: 10, name: 'Transporte', description: 'Mudanzas y transporte de mercancias' },
      { id: 11, name: 'Delivery', description: 'Entregas y mensajeria de proximidad' }
    ];
  }

  private async showAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK']
    });
    await alert.present();
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger' = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 2400,
      color,
      position: 'top'
    });
    await toast.present();
  }
}
