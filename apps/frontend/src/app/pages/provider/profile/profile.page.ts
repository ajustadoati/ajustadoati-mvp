import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { LoadingController, ToastController, ActionSheetController } from '@ionic/angular';
import { HybridGeolocationService, Position } from '../../../services/hybrid-geolocation.service';
import { AjustadoAtiWebSocketService } from '../../../services/ajustadoati-websocket.service';
import { CategoryService } from '../../../services/category.service';
import { BackendAuthService, BackendUserInfo } from '../../../services/backend-auth.service';
import { Category } from '../../../interfaces/category';
import { take } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-provider-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonicModule]
})
export class ProviderProfilePage implements OnInit {
  user: BackendUserInfo | null = null;
  profileForm: FormGroup;
  currentPosition: Position | null = null;
  isEditMode = false;
  isSaving = false;

  // Categories
  availableCategories: Category[] = [];
  selectedCategories: number[] = [];
  loadingCategories = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private actionSheetCtrl: ActionSheetController,
    private geolocation: HybridGeolocationService,
    private websocket: AjustadoAtiWebSocketService,
    private categoryService: CategoryService,
    private backendAuth: BackendAuthService
  ) {
    this.profileForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.required],
      categories: [[]],
      address: ['']
    });
  }

  async ngOnInit() {
    console.log('👤 Provider Profile page initialized');

    // Ensure WebSocket is connected
    await this.ensureWebSocketConnection();

    await this.loadCategories();
    await this.loadUserProfile();
    await this.loadCurrentPosition();
  }

  private async loadCategories() {
    this.loadingCategories = true;
    try {
      this.availableCategories = await firstValueFrom(this.categoryService.getCategories());
      console.log('Categories loaded:', this.availableCategories);
    } catch (error) {
      console.error('Error loading categories:', error);
      // Fallback categories
      this.availableCategories = [
        { id: 1, name: 'Electrónicos', description: '' },
        { id: 2, name: 'Electrodomésticos', description: '' },
        { id: 3, name: 'Automotriz', description: '' },
        { id: 4, name: 'Hogar', description: '' },
        { id: 5, name: 'Tecnología', description: '' },
        { id: 6, name: 'Otros', description: '' }
      ];
    } finally {
      this.loadingCategories = false;
    }
  }

  getCategoryName(categoryId: number): string {
    const category = this.availableCategories.find(c => c.id === categoryId);
    return category?.name || `Categoría ${categoryId}`;
  }

  isCategorySelected(categoryId: number): boolean {
    return this.selectedCategories.includes(categoryId);
  }

  toggleCategory(categoryId: number) {
    if (!this.isEditMode) return;

    const index = this.selectedCategories.indexOf(categoryId);
    if (index === -1) {
      this.selectedCategories.push(categoryId);
    } else {
      this.selectedCategories.splice(index, 1);
    }
    this.profileForm.patchValue({ categories: this.selectedCategories });
  }

  private async ensureWebSocketConnection() {
    try {
      const isConnected = await new Promise<boolean>((resolve) => {
        this.websocket.getConnectionStatus().pipe(
          take(1)
        ).subscribe(status => resolve(status));
      });

      if (!isConnected) {
        console.log('🔌 WebSocket not connected, connecting now...');
        await this.websocket.connect();
        console.log('✅ WebSocket connected successfully');
      } else {
        console.log('✅ WebSocket already connected');
      }
    } catch (error) {
      console.error('❌ Error connecting WebSocket:', error);
    }
  }

  private async loadUserProfile() {
    try {
      this.user = await this.backendAuth.getFullUserProfile();

      if (!this.user) {
        await this.showToast('No se pudo cargar el perfil', 'warning');
        return;
      }

      this.selectedCategories = this.user.categories || [];

      this.profileForm.patchValue({
        name: this.user.fullName || '',
        email: this.user.email || '',
        phone: this.user.phone || '',
        categories: this.selectedCategories,
        address: this.user.location?.address || ''
      });

      this.profileForm.disable();
    } catch (error) {
      console.error('Error loading user profile:', error);
      await this.showToast('Error al cargar perfil', 'danger');
    }
  }

  private async loadCurrentPosition() {
    try {
      this.currentPosition = await this.geolocation.getCurrentPosition();
      console.log('Current position:', this.currentPosition);
    } catch (error) {
      console.error('Error loading position:', error);
    }
  }

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;

    if (this.isEditMode) {
      this.profileForm.enable();
      // Keep email disabled
      this.profileForm.get('email')?.disable();
    } else {
      this.profileForm.disable();
      // Restore original values
      const backendUser = this.backendAuth.currentUser;
      this.selectedCategories = backendUser?.categories || this.user?.categories || [];
      this.profileForm.patchValue({
        name: backendUser?.fullName || this.user?.fullName || '',
        phone: backendUser?.phone || this.user?.phone || '',
        address: backendUser?.location?.address || this.user?.location?.address || '',
        categories: this.selectedCategories
      });
    }
  }

  async saveProfile() {
    if (this.profileForm.invalid) {
      this.markFormGroupTouched();
      await this.showToast('Revisa los campos requeridos', 'warning');
      return;
    }

    if (this.selectedCategories.length === 0) {
      await this.showToast('Selecciona al menos una categoría de servicio', 'warning');
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Guardando perfil...',
      spinner: 'crescent'
    });

    try {
      this.isSaving = true;
      await loading.present();

      const formValue = this.profileForm.getRawValue();
      const baseLocation = this.currentPosition || this.user?.location;
      const location = baseLocation
        ? {
            latitude: baseLocation.latitude,
            longitude: baseLocation.longitude,
            address: formValue.address || baseLocation.address || null,
            city: this.user?.location?.city || null,
            state: this.user?.location?.state || null,
            country: this.user?.location?.country || null
          }
        : null;

      const updatedUser = await this.backendAuth.updateProfile({
        fullName: formValue.name,
        phone: formValue.phone,
        categories: this.selectedCategories,
        location
      });

      this.user = updatedUser;
      this.selectedCategories = updatedUser.categories || [];
      this.profileForm.patchValue({
        name: updatedUser.fullName || '',
        email: updatedUser.email || '',
        phone: updatedUser.phone || '',
        address: updatedUser.location?.address || '',
        categories: this.selectedCategories
      });
      this.profileForm.disable();
      this.isEditMode = false;

      try {
        this.websocket.disconnect();
        await this.websocket.connect();
      } catch (socketError) {
        console.warn('Profile saved but WebSocket refresh failed:', socketError);
      }

      await loading.dismiss();
      await this.showToast('Perfil actualizado correctamente', 'success');
    } catch (error) {
      await loading.dismiss();
      console.error('Error saving profile:', error);
      await this.showToast('Error al guardar perfil', 'danger');
    } finally {
      this.isSaving = false;
    }
  }

  async updateLocation() {
    const loading = await this.loadingCtrl.create({
      message: 'Actualizando ubicación...',
      spinner: 'crescent'
    });
    await loading.present();

    try {
      this.currentPosition = await this.geolocation.getCurrentPosition();

      if (this.currentPosition) {
        await loading.dismiss();
        await this.showToast('Ubicación actualizada (solo en esta sesión).', 'success');

        // Update address in form
        if (this.currentPosition.address) {
          this.profileForm.patchValue({ address: this.currentPosition.address });
        }
      }
    } catch (error) {
      await loading.dismiss();
      console.error('Error updating location:', error);
      await this.showToast('Error al actualizar ubicación', 'danger');
    }
  }

  private markFormGroupTouched() {
    Object.keys(this.profileForm.controls).forEach(key => {
      const control = this.profileForm.get(key);
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

  async logout() {
    const actionSheet = await this.actionSheetCtrl.create({
      header: '¿Cerrar Sesión?',
      subHeader: 'Se desconectará de la aplicación',
      buttons: [
        {
          text: 'Cerrar Sesión',
          role: 'destructive',
          icon: 'power',
          handler: async () => {
            const loading = await this.loadingCtrl.create({
              message: 'Cerrando sesión...',
              spinner: 'crescent'
            });
            await loading.present();

            try {
              this.backendAuth.logout();
              this.websocket.disconnect();
              await loading.dismiss();
              this.router.navigate(['/auth/login'], { replaceUrl: true });
              await this.showToast('Sesión cerrada correctamente', 'success');
            } catch (error) {
              await loading.dismiss();
              console.error('Error logging out:', error);
              await this.showToast('Error al cerrar sesión', 'danger');
            }
          }
        },
        {
          text: 'Cancelar',
          icon: 'close',
          role: 'cancel'
        }
      ]
    });

    await actionSheet.present();
  }

  // Getters for template
  get name() { return this.profileForm.get('name'); }
  get email() { return this.profileForm.get('email'); }
  get phone() { return this.profileForm.get('phone'); }
  get address() { return this.profileForm.get('address'); }
  get userCategories() { return this.user?.categories || []; }
}
