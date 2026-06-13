import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { ActionSheetController, LoadingController, ToastController } from '@ionic/angular';
import { BackendAuthService } from '../../../services/backend-auth.service';

@Component({
  selector: 'app-user-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class UserProfilePage implements OnInit {
  userProfile: any = null;
  isLoading = true;

  constructor(
    private router: Router,
    private auth: BackendAuthService,
    private actionSheetCtrl: ActionSheetController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  async ngOnInit() {
    await this.loadProfile();
  }

  async loadProfile() {
    this.isLoading = true;
    try {
      this.userProfile = await this.auth.getFullUserProfile();
      console.log('✅ Profile loaded:', this.userProfile);
    } catch (error) {
      console.error('❌ Error loading profile:', error);
    } finally {
      this.isLoading = false;
    }
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
              this.auth.logout();
              await loading.dismiss();
              this.router.navigate(['/auth/login'], { replaceUrl: true });
              await this.showToast('Sesión cerrada correctamente', 'success');
            } catch (error) {
              await loading.dismiss();
              console.error('❌ Error logging out:', error);
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
    this.router.navigate(['/user/home']);
  }

  navigateToRequests() {
    this.router.navigate(['/user/requests']);
  }
}
