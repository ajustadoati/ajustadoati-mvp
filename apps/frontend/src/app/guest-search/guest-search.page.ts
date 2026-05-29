import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, LoadingController, ToastController } from '@ionic/angular';
import { Subscription, firstValueFrom } from 'rxjs';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  closeOutline,
  informationCircleOutline,
  location,
  locationOutline,
  logInOutline,
  mapOutline,
  personAdd,
  searchOutline
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
      closeOutline,
      informationCircleOutline,
      location,
      locationOutline,
      logInOutline,
      mapOutline,
      personAdd,
      searchOutline
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

      if (session && this.modalStep === 'results') {
        const signature = this.buildMapSignature(session);
        if (signature !== this.lastMapSignature) {
          this.lastMapSignature = signature;
          setTimeout(() => this.initializeResultsMap(), 200);
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

  get respondedProviders(): Array<{
    response: any;
    whatsappUrl: string | null;
  }> {
    return (this.currentSearchSession?.responses || []).map(response => ({
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

    responsesWithCoords.forEach(response => {
      const responseMarker = new google.maps.Marker({
        position: { lat: response.latitude, lng: response.longitude },
        map: this.map,
        title: `${response.providerName} respondio`,
        icon: {
          path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: '#f97316',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          rotation: 45
        }
      });

      const whatsappUrl = this.getWhatsAppUrl(response);
      const safeMessage = (response.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px; min-width: 200px;">
            <strong style="display:block; margin-bottom:4px;">${response.providerName}</strong>
            <div style="font-size:12px; color:#475569; margin-bottom:6px;">Respondio a tu solicitud</div>
            <div style="font-size:13px; line-height:1.45; margin-bottom:8px;">${safeMessage}</div>
            ${response.providerPhone ? `<div style="font-size:12px; margin-bottom:8px;">WhatsApp: ${response.providerPhone}</div>` : ''}
            ${whatsappUrl ? `<a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:8px 12px; background:#16a34a; color:#fff; text-decoration:none; border-radius:999px; font-size:12px; font-weight:700;">Escribir por WhatsApp</a>` : ''}
          </div>
        `
      });

      responseMarker.addListener('click', () => infoWindow.open(this.map, responseMarker));
      this.markers.push(responseMarker);
    });

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

  private clearMap() {
    this.markers.forEach(marker => marker?.setMap?.(null));
    this.markers = [];
    this.map = null;
    this.isMapReady = false;
  }

  private buildMapSignature(session: SearchSession): string {
    const providerCoords = (session.providers || [])
      .map(provider => {
        const location = provider.locations?.[0];
        return location ? `${location.latitude},${location.longitude}` : provider.id;
      })
      .join('|');

    const responseCoords = (session.responses || [])
      .map(response => `${response.providerId}:${response.latitude ?? 'na'},${response.longitude ?? 'na'}:${response.providerPhone ?? ''}`)
      .join('|');

    return `${session.searchRequest.id}:${session.searchRequest.userLatitude},${session.searchRequest.userLongitude}:${providerCoords}:${responseCoords}`;
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
