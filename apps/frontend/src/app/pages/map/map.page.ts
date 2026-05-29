import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { SearchRequestService, SearchSession } from '../../services/search-request.service';

declare var google: any;

@Component({
  selector: 'app-map',
  templateUrl: './map.page.html',
  styleUrls: ['./map.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterLink]
})
export class MapPage implements OnInit, AfterViewInit, OnDestroy {
  private map: any = null;
  private markers: any[] = [];

  currentSession: SearchSession | null = null;
  userLocation: { lat: number; lng: number } | null = null;
  isMapReady = false;
  isGuestView = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private searchService: SearchRequestService
  ) {}

  ngOnInit() {
    console.log('🗺️ Map page initialized');

    // Suscribirse a la sesión del servicio
    this.searchService.getCurrentSearchSession().subscribe(session => {
      console.log('📦 Session received from service:', session);
      this.currentSession = session;

      if (session) {
        this.userLocation = {
          lat: session.searchRequest.userLatitude,
          lng: session.searchRequest.userLongitude
        };
        console.log('📍 User location from session:', this.userLocation);
        console.log('👥 Providers count:', session.providers.length);
      } else {
        console.warn('⚠️ No session available, trying query params...');
      }
    });

    // También intentar obtener ubicación de query params como fallback
    this.route.queryParams.subscribe(params => {
      console.log('📋 Query params:', params);
      this.isGuestView = params['guest'] === 'true';

      if (params['lat'] && params['lng'] && !this.userLocation) {
        this.userLocation = {
          lat: parseFloat(params['lat']),
          lng: parseFloat(params['lng'])
        };
        console.log('📍 User location from query params:', this.userLocation);
      }
    });

    // Esperar un momento y luego intentar inicializar el mapa
    setTimeout(() => {
      console.log('🔄 Starting map initialization...');
      this.waitForGoogleMapsAndData();
    }, 500);
  }

  ngAfterViewInit() {
    console.log('🔄 AfterViewInit called');
    // No hacemos nada aquí porque el mapa se inicializa cuando llega la sesión
  }

  private waitForGoogleMapsAndData(attempts: number = 0) {
    const maxAttempts = 20; // 10 segundos máximo

    if (attempts >= maxAttempts) {
      console.error('❌ Timeout: Google Maps or map element not available');
      return;
    }

    // Verificar que Google Maps esté cargado, tengamos ubicación Y el elemento exista
    const mapElement = document.getElementById('providers-map');

    if (typeof google !== 'undefined' && google.maps && this.userLocation && mapElement) {
      console.log('✅ All requirements met - initializing map...');
      setTimeout(() => this.initializeMap(), 100);
    } else {
      const missing = [];
      if (typeof google === 'undefined' || !google.maps) missing.push('Google Maps');
      if (!this.userLocation) missing.push('User location');
      if (!mapElement) missing.push('Map element');

      console.log(`⏳ Waiting for: ${missing.join(', ')} (attempt ${attempts + 1}/${maxAttempts})`);

      setTimeout(() => this.waitForGoogleMapsAndData(attempts + 1), 300);
    }
  }

  ngOnDestroy() {
    // Limpiar marcadores
    this.markers.forEach(marker => {
      if (marker.setMap) {
        marker.setMap(null);
      }
    });
    this.markers = [];
  }

  private initializeMap() {
    const mapElement = document.getElementById('providers-map');
    if (!mapElement) {
      console.error('❌ Map element not found - ID: providers-map');
      return;
    }

    console.log('✅ Map element found:', mapElement);
    console.log('📐 Map element dimensions:', {
      width: mapElement.offsetWidth,
      height: mapElement.offsetHeight,
      display: window.getComputedStyle(mapElement).display
    });

    if (!this.userLocation) {
      console.error('❌ No user location available');
      return;
    }

    console.log('📌 Current session:', this.currentSession ? 'Available' : 'Not available');

    try {
      console.log('🗺️ Creating Google Map...');
      console.log('📍 Center:', this.userLocation);

      // Crear el mapa
      this.map = new google.maps.Map(mapElement, {
        center: this.userLocation,
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });

      console.log('✅ Map created successfully');

      // Marcador del usuario (azul)
      console.log('📌 Adding user marker...');
      const userMarker = new google.maps.Marker({
        position: this.userLocation,
        map: this.map,
        title: 'Tu ubicación',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3
        }
      });

      this.markers.push(userMarker);
      console.log('✅ User marker added');

      // Marcadores de proveedores (verdes) - solo si hay sesión
      if (this.currentSession?.providers && this.currentSession.providers.length > 0) {
        console.log(`📌 Adding ${this.currentSession.providers.length} provider markers...`);

        this.currentSession.providers.forEach((provider, index) => {
          console.log(`Provider ${index + 1}:`, provider);

          if (provider.locations && provider.locations.length > 0) {
            const location = provider.locations[0];
            console.log(`  - Location:`, location);

            if (location.latitude && location.longitude) {
              const providerMarker = new google.maps.Marker({
                position: {
                  lat: location.latitude,
                  lng: location.longitude
                },
                map: this.map,
                title: provider.name || 'Proveedor',
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: '#34C759',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 2
                }
              });

              // Info window con detalles
              const infoWindow = new google.maps.InfoWindow({
                content: `
                  <div style="padding: 8px;">
                    <h3 style="margin: 0 0 4px 0; font-size: 14px;">${provider.name}</h3>
                    ${location.distance ? `<p style="margin: 4px 0; font-size: 12px;">📍 ${location.distance.toFixed(1)} km</p>` : ''}
                  </div>
                `
              });

              providerMarker.addListener('click', () => {
                infoWindow.open(this.map, providerMarker);
              });

              this.markers.push(providerMarker);
              console.log(`  ✅ Provider marker added for ${provider.name}`);
            } else {
              console.warn(`  ⚠️ Missing coordinates for ${provider.name}`);
            }
          } else {
            console.warn(`  ⚠️ No locations for provider ${provider.name}`);
          }
        });
      } else {
        console.log('ℹ️ No providers to show on map (showing only user location)');
      }

      // Ajustar bounds para mostrar todos los marcadores
      if (this.markers.length > 1) {
        console.log('🔍 Fitting bounds to show all markers...');
        const bounds = new google.maps.LatLngBounds();
        this.markers.forEach(marker => {
          bounds.extend(marker.getPosition());
        });
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
      console.log('✅ Map initialized successfully with', this.markers.length, 'markers');

    } catch (error) {
      console.error('❌ Error initializing map:', error);
    }
  }

  goBack() {
    // Intentar navegar de vuelta usando el historial del navegador
    if (window.history.length > 1) {
      window.history.back();
    } else {
      // Si no hay historial, ir a search-results
        this.router.navigate(['/guest-search']);
    }
  }

  get providersCount(): number {
    return this.currentSession?.providers.length || 0;
  }

  get responsesCount(): number {
    return this.currentSession?.responses.length || 0;
  }

  get notifiedProvidersCount(): number {
    return this.currentSession?.notifiedProvidersCount || 0;
  }
}
