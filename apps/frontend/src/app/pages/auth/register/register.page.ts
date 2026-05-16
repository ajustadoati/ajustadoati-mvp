import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { BackendAuthService, BackendRegisterRequest } from '../../../services/backend-auth.service';
import { CategoryService } from '../../../services/category.service';
import { Category } from '../../../interfaces/category';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonicModule]
})
export class RegisterPage implements OnInit {
  registerForm: FormGroup;
  isLoading = false;
  userType: 'user' | 'provider' = 'user';
  availableCategories: Category[] = [];
  selectedCategories: number[] = [];
  loadingCategories = false;

  constructor(
    private fb: FormBuilder,
    private backendAuth: BackendAuthService,
    private categoryService: CategoryService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController
  ) {
    this.registerForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
      phone: ['', [Validators.required, Validators.pattern(/^\+?[\d\s\-\(\)]+$/)]],
      userType: ['user', [Validators.required]],
      // Provider specific fields
      businessName: [''],
      categories: [[]],
      description: [''],
      acceptTerms: [false, [Validators.requiredTrue]]
    }, { validators: this.passwordMatchValidator });
  }

  async ngOnInit() {
    console.log('📝 Register page initialized');
    await this.loadCategories();
  }

  onUserTypeChange(event: any) {
    this.userType = event?.detail?.value ?? event?.target?.value ?? 'user';
    this.updateProviderValidators();
    
    // Reset selected categories when switching user types
    if (this.userType !== 'provider') {
      this.selectedCategories = [];
      this.registerForm.patchValue({ categories: [] });
    }
  }

  private updateProviderValidators() {
    const businessNameControl = this.registerForm.get('businessName');
    const categoriesControl = this.registerForm.get('categories');
    const descriptionControl = this.registerForm.get('description');

    if (this.userType === 'provider') {
      businessNameControl?.setValidators([Validators.required, Validators.minLength(2)]);
      categoriesControl?.setValidators([Validators.required, this.minArrayLength(1)]);
      descriptionControl?.setValidators([Validators.required, Validators.minLength(10)]);
    } else {
      businessNameControl?.clearValidators();
      categoriesControl?.clearValidators();
      descriptionControl?.clearValidators();
    }

    businessNameControl?.updateValueAndValidity();
    categoriesControl?.updateValueAndValidity();
    descriptionControl?.updateValueAndValidity();
  }

  async onSubmit() {
    console.log('📝 Form submitted');
    console.log('Form valid:', this.registerForm.valid);
    console.log('Form value:', this.registerForm.value);
    console.log('Form errors:', this.getFormErrors());
    
    if (this.registerForm.valid) {
      await this.register();
    } else {
      this.markFormGroupTouched();
      await this.showErrorToast('Por favor completa todos los campos requeridos');
    }
  }

  private async register() {
    const loading = await this.loadingCtrl.create({
      message: 'Creando cuenta...',
      spinner: 'crescent'
    });
    await loading.present();
    this.isLoading = true;

    try {
      const formData = this.registerForm.value;
      console.log('📝 Attempting registration for:', formData.email);
      
      // Prepare user data for backend registration
      const userData: BackendRegisterRequest = {
        email: formData.email,
        password: formData.password,
        fullName: formData.email.split('@')[0], // Use email username as name
        username: this.generateValidUsername(formData.email),
        phone: formData.phone,
        isProvider: formData.userType === 'provider',
        categories: formData.userType === 'provider' ? this.selectedCategories : [],
        location: {
          latitude: -33.4489, // Default location (Santiago, Chile)
          longitude: -70.6693,
          address: 'Santiago, Chile'
        }
      };
      
      // Register user with backend
      const response = await this.backendAuth.register(userData);
      
      if (!response.success) {
        throw new Error(response.message || 'Error en el registro');
      }

      console.log('✅ Registration successful:', response);
      await this.showSuccessAlert();
      
    } catch (error: any) {
      console.error('🚨 Registration error:', error);
      await this.handleRegistrationError(error);
    } finally {
      await loading.dismiss();
      this.isLoading = false;
    }
  }

  goToLogin() {
    this.router.navigate(['/auth/login']);
  }

  private async showSuccessAlert() {
    const isProvider = this.backendAuth.isProvider();
    const userType = isProvider ? 'proveedor' : 'usuario';
    const homeRoute = isProvider ? '/provider/home' : '/user/home';
    
    const alert = await this.alertCtrl.create({
      header: '¡Cuenta Creada!',
      message: `Tu cuenta de ${userType} ha sido creada exitosamente. Ya puedes comenzar a usar la aplicación.`,
      buttons: [
        {
          text: 'Comenzar',
          handler: () => {
            this.router.navigate([homeRoute], { replaceUrl: true });
          }
        }
      ]
    });

    await alert.present();
  }

  private async handleRegistrationError(error: any) {
    let message = 'Error al crear la cuenta';
    
    // Handle backend API errors
    if (error.error?.message) {
      message = error.error.message;
    } else if (error.status === 409) {
      message = 'Ya existe una cuenta con este email o nombre de usuario';
    } else if (error.status === 400) {
      message = 'Datos inválidos. Por favor revisa la información ingresada';
    } else if (error.status === 0) {
      message = 'No se pudo conectar al servidor. Verifica tu conexión a internet';
    } else if (error.message?.includes('User already registered')) {
      message = 'Ya existe una cuenta con este email';
    } else if (error.message?.includes('Password should be at least')) {
      message = 'La contraseña debe tener al menos 6 caracteres';
    } else if (error.message?.includes('Invalid email')) {
      message = 'Por favor ingresa un email válido';
    } else if (error.message) {
      message = error.message;
    }

    console.error('🚨 Registration error details:', {
      status: error.status,
      statusText: error.statusText,
      message: error.message,
      error: error.error
    });

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
    Object.keys(this.registerForm.controls).forEach(key => {
      const control = this.registerForm.get(key);
      control?.markAsTouched();
    });
  }

  private passwordMatchValidator(group: FormGroup) {
    const password = group.get('password');
    const confirmPassword = group.get('confirmPassword');
    
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }
    
    return null;
  }

  // Load categories from service
  private async loadCategories() {
    this.loadingCategories = true;
    
    try {
      console.log('🔄 Loading categories from backend API...');
      this.availableCategories = await firstValueFrom(this.categoryService.getCategories());
      console.log('✅ Categories loaded from API:', this.availableCategories.length, 'categories');
      
      // Validate that we got valid categories
      if (!this.availableCategories || this.availableCategories.length === 0) {
        throw new Error('No categories returned from API');
      }
      
    } catch (error) {
      console.warn('⚠️ Error loading categories from backend:', error);
      console.log('🔄 Falling back to default categories');
      this.availableCategories = this.getFallbackCategories();
    } finally {
      this.loadingCategories = false;
    }
  }

  private getFallbackCategories(): Category[] {
    return [
      { id: 1, name: 'Electrónicos', description: 'Reparación de dispositivos electrónicos' },
      { id: 2, name: 'Electrodomésticos', description: 'Reparación de electrodomésticos' },
      { id: 3, name: 'Automotriz', description: 'Servicios automotrices' },
      { id: 4, name: 'Hogar', description: 'Servicios para el hogar' },
      { id: 5, name: 'Tecnología', description: 'Servicios tecnológicos' },
      { id: 6, name: 'Otros', description: 'Otros servicios' }
    ];
  }

  // Toggle category selection
  toggleCategory(categoryId: number) {
    const index = this.selectedCategories.indexOf(categoryId);
    if (index === -1) {
      this.selectedCategories.push(categoryId);
    } else {
      this.selectedCategories.splice(index, 1);
    }
    
    // Update form control
    this.registerForm.patchValue({ categories: this.selectedCategories });
    console.log('Selected categories:', this.selectedCategories);
  }

  // Check if category is selected
  isCategorySelected(categoryId: number): boolean {
    return this.selectedCategories.includes(categoryId);
  }

  // Custom validator for minimum array length
  private minArrayLength(min: number) {
    return (control: any) => {
      if (control.value && control.value.length >= min) {
        return null;
      }
      return { minArrayLength: { requiredLength: min, actualLength: control.value?.length || 0 } };
    };
  }

  // Get category name by ID
  getCategoryName(categoryId: number): string {
    const category = this.availableCategories.find(cat => cat.id === categoryId);
    return category ? category.name : `Categoría ${categoryId}`;
  }

  // Generate a valid username that complies with backend constraints
  private generateValidUsername(email: string): string {
    // Extract username part from email
    let username = email.split('@')[0];
    
    // Remove invalid characters (keep only letters, numbers, underscores)
    username = username.replace(/[^a-zA-Z0-9_]/g, '');
    
    // Ensure it starts with a letter
    if (!/^[a-zA-Z]/.test(username)) {
      username = 'user' + username;
    }
    
    // Ensure minimum length of 3 characters
    if (username.length < 3) {
      username = username + '123';
    }
    
    // Ensure maximum length (common limit is 20-30 chars)
    if (username.length > 20) {
      username = username.substring(0, 20);
    }
    
    // Convert to lowercase for consistency
    username = username.toLowerCase();
    
    console.log('Generated username:', username, 'from email:', email);
    return username;
  }
  
  // Debug helper to get all form errors
  private getFormErrors(): any {
    let errors: any = {};
    Object.keys(this.registerForm.controls).forEach(key => {
      const control = this.registerForm.get(key);
      if (control && control.errors) {
        errors[key] = control.errors;
      }
    });
    return errors;
  }

  // Getters para validación en template
  get email() { return this.registerForm.get('email'); }
  get password() { return this.registerForm.get('password'); }
  get confirmPassword() { return this.registerForm.get('confirmPassword'); }
  get phone() { return this.registerForm.get('phone'); }
  get businessName() { return this.registerForm.get('businessName'); }
  get categories() { return this.registerForm.get('categories'); }
  get description() { return this.registerForm.get('description'); }
  get acceptTerms() { return this.registerForm.get('acceptTerms'); }
}
