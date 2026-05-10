import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { BackendAuthService } from '../../../services/backend-auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonicModule]
})
export class LoginPage implements OnInit {
  loginForm: FormGroup;
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private backendAuth: BackendAuthService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  async ngOnInit() {
    console.log('🔐 Login page initialized');
  }

  async onSubmit() {
    if (this.loginForm.valid) {
      await this.login();
    } else {
      this.markFormGroupTouched();
    }
  }

  private async login() {
    const loading = await this.loadingCtrl.create({
      message: 'Iniciando sesión...',
      spinner: 'crescent'
    });
    await loading.present();
    this.isLoading = true;

    try {
      const { email, password } = this.loginForm.value;
      console.log('🔐 Attempting login for:', email);

      const backendResponse = await this.backendAuth.login({ email, password });
      console.log('✅ Backend login response:', backendResponse);

      if (!backendResponse.success || !backendResponse.data?.user) {
        throw new Error(backendResponse.message || 'Error al iniciar sesión');
      }

      const isProvider = backendResponse.data.user.isProvider;
      const route = isProvider ? '/provider/home' : '/user/home';
      console.log('🔀 Navigating to:', route, '(isProvider:', isProvider, ')');

      await this.showSuccessToast('¡Bienvenido!');
      await this.router.navigate([route], { replaceUrl: true });

    } catch (error: any) {
      console.error('🚨 Login error:', error);
      await this.handleLoginError(error);
    } finally {
      await loading.dismiss();
      this.isLoading = false;
    }
  }

  async forgotPassword() {
    const alert = await this.alertCtrl.create({
      header: 'Recuperar Contraseña',
      message: 'Ingresa tu email para recibir instrucciones de recuperación',
      inputs: [
        {
          name: 'email',
          type: 'email',
          placeholder: 'tu@email.com',
          attributes: {
            required: true
          }
        }
      ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Enviar',
          handler: async (data) => {
            if (data.email && this.isValidEmail(data.email)) {
              await this.sendPasswordReset(data.email);
              return true;
            } else {
              await this.showErrorToast('Por favor ingresa un email válido');
              return false;
            }
          }
        }
      ]
    });

    await alert.present();
  }

  private async sendPasswordReset(email: string) {
    try {
      // Backend no expone reset password por ahora.
      await this.showErrorToast('Recuperación de contraseña no está disponible en este MVP.');
    } catch (error: any) {
      console.error('🚨 Password reset error:', error);
      await this.showErrorToast('Error al enviar email de recuperación');
    }
  }

  goToRegister() {
    this.router.navigate(['/auth/register']);
  }

  tryAsGuest() {
    console.log('👤 User choosing guest mode');
    this.router.navigate(['/guest-search']);
  }

  private async handleLoginError(error: any) {
    let message = 'Error al iniciar sesión';
    
    if (error.message?.includes('Invalid login credentials')) {
      message = 'Email o contraseña incorrectos';
    } else if (error.message?.includes('Email not confirmed')) {
      message = 'Por favor confirma tu email antes de iniciar sesión';
    } else if (error.message?.includes('Too many requests')) {
      message = 'Demasiados intentos. Por favor espera un momento';
    } else if (error.message) {
      message = error.message;
    }

    await this.showErrorToast(message);
  }

  private async showSuccessToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color: 'success',
      position: 'top'
    });
    await toast.present();
  }

  private async showErrorToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 4000,
      color: 'danger',
      position: 'top'
    });
    await toast.present();
  }

  private markFormGroupTouched() {
    Object.keys(this.loginForm.controls).forEach(key => {
      const control = this.loginForm.get(key);
      control?.markAsTouched();
    });
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Getters para validación en template
  get email() { return this.loginForm.get('email'); }
  get password() { return this.loginForm.get('password'); }
}
