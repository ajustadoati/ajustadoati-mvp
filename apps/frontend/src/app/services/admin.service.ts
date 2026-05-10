import { Injectable } from '@angular/core';
import { CategoryService } from './category.service';

@Injectable({
  providedIn: 'root'
})
export class AdminService {

  constructor(private categoryService: CategoryService) {}

  // Métodos deshabilitados - las categorías se obtienen directamente del backend
  // /**
  //  * Método para inicializar todas las categorías en el backend
  //  * Ejecutar una sola vez al configurar la aplicación
  //  */
  // async initializeCategories(): Promise<void> {
  //   try {
  //     console.log('Iniciando carga de categorías...');
  //     await this.categoryService.createAllCategories();
  //     console.log('✅ Categorías cargadas exitosamente en el backend');
  //   } catch (error) {
  //     console.error('❌ Error cargando categorías:', error);
  //     throw error;
  //   }
  // }

  // /**
  //  * Método de utilidad para desarrolladores
  //  * Puede llamarse desde la consola del navegador
  //  */
  // async runCategorySetup(): Promise<void> {
  //   console.log('🔄 Configurando categorías de Google Maps...');
  //   await this.initializeCategories();
  // }
}
