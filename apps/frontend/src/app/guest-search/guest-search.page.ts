import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, LoadingController, ToastController } from '@ionic/angular';
import { Subscription, firstValueFrom } from 'rxjs';
import { addIcons } from 'ionicons';
import {
  callOutline,
  chevronDownOutline,
  flashOutline,
  informationCircleOutline,
  location,
  locationOutline,
  logInOutline,
  mapOutline,
  personAdd,
  searchOutline,
  timeOutline
} from 'ionicons/icons';
import { CategoryService } from '../services/category.service';
import { GeolocationService, UserLocation } from '../services/geolocation.service';
import { SearchRequestService, SearchSession } from '../services/search-request.service';
import { GuestUserService } from '../services/guest-user.service';
import { Category } from '../interfaces/category';

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

  private subscriptions: Subscription[] = [];

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
      callOutline,
      chevronDownOutline,
      flashOutline,
      informationCircleOutline,
      location,
      locationOutline,
      logInOutline,
      mapOutline,
      personAdd,
      searchOutline,
      timeOutline
    });
  }

  async ngOnInit() {
    await this.ensureGuestUser();
    await this.loadCategories();
    this.loadGuestStats();
    this.setupSearchSubscriptions();
    await this.refreshLocation(false);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
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

  async refreshLocation(showSuccess = true) {
    this.isLocationLoading = true;

    try {
      this.userLocation = await this.geolocationService.getCurrentPosition();
      if (showSuccess) {
        await this.showToast('Ubicacion actualizada', 'success');
      }
    } catch (error) {
      console.warn('Guest location unavailable:', error);
      this.userLocation = null;
      if (showSuccess) {
        await this.showAlert(
          'Ubicacion requerida',
          'Necesitamos tu ubicacion para buscar proveedores cercanos. Activa los permisos GPS e intenta nuevamente.'
        );
      }
    } finally {
      this.isLocationLoading = false;
    }
  }

  async onSearch() {
    if (!this.selectedCategory) {
      await this.showAlert('Categoria requerida', 'Selecciona la categoria del servicio que necesitas.');
      return;
    }

    if (!this.serviceDescription.trim() || this.serviceDescription.trim().length < 3) {
      await this.showAlert('Descripcion requerida', 'Escribe que servicio o producto necesitas.');
      return;
    }

    if (!this.userLocation) {
      await this.refreshLocation(true);
      if (!this.userLocation) return;
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

      if (searchSession.providers.length === 0) {
        await this.showAlert(
          'Sin proveedores cercanos',
          'No encontramos proveedores disponibles para esta categoria en tu zona. Prueba otra categoria o vuelve a intentarlo mas tarde.'
        );
        return;
      }

      await this.router.navigate(['/map'], {
        queryParams: {
          guest: 'true',
          requestId: searchSession.searchRequest.id,
          lat: this.userLocation!.lat,
          lng: this.userLocation!.lng,
          search: this.serviceDescription.trim(),
          categoryId: this.selectedCategory
        }
      });
    } catch (error: any) {
      await loading.dismiss();
      console.error('Error creating guest search request:', error);

      const errorMessage = error?.message || 'No se pudo realizar la busqueda. Intentalo de nuevo.';

      await this.showAlert('Error', errorMessage);
    }
  }

  onCategoryChange(event: any) {
    this.selectedCategory = event.detail.value;
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
    return !!this.selectedCategory && this.serviceDescription.trim().length >= 3 && !!this.userLocation && !this.isLoading;
  }

  get locationText(): string {
    if (this.isLocationLoading) return 'Obteniendo ubicacion...';
    if (!this.userLocation) return 'Activa tu ubicacion para buscar cerca de ti';
    return `${this.userLocation.lat.toFixed(4)}, ${this.userLocation.lng.toFixed(4)}`;
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
      { id: 10, name: 'Transporte', description: 'Mudanzas y transporte de mercancias' }
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
