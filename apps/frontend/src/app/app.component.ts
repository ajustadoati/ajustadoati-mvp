import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { AdminService } from './services/admin.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor(private adminService: AdminService) {
    // Hacer disponible el servicio de admin globalmente para desarrollo
    (window as any).adminService = this.adminService;
  }

  // Método deshabilitado - las categorías se obtienen directamente del backend
  // /**
  //  * Método para cargar categorías en el backend
  //  * Ejecuta esto una sola vez en la consola del navegador: app.loadCategories()
  //  */
  // async loadCategories(): Promise<void> {
  //   try {
  //     await this.adminService.initializeCategories();
  //     console.log('✅ Proceso completado. Las categorías han sido cargadas en el backend.');
  //   } catch (error) {
  //     console.error('❌ Error en el proceso:', error);
  //   }
  // }
}
