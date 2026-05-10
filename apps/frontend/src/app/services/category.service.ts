import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom, of, catchError, map } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Category } from '../interfaces/category';

// Re-export Category for convenience
export { Category } from '../interfaces/category';

// Interfaz para la respuesta del backend
interface BackendResponse<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private apiUrl = environment.baseUrl + '/categories';

  constructor(private http: HttpClient) {}

  getCategories(): Observable<Category[]> {
    console.log('Fetching categories from backend:', this.apiUrl);
    return this.http.get<BackendResponse<Category[]>>(this.apiUrl).pipe(
      map(response => {
        console.log('Backend response:', response);
        if (response && response.success && response.data) {
          console.log('✅ Categories extracted from response:', response.data.length);
          return response.data;
        }
        console.warn('Backend returned unsuccessful response or missing data:', response);
        return [];
      }),
      catchError(error => {
        console.error('❌ HTTP error fetching categories:', error);
        console.error('Error details:', {
          status: error.status,
          statusText: error.statusText,
          url: error.url,
          message: error.message
        });
        throw error; // Re-throw to be handled by the component
      })
    );
  }



  getCategoryById(id: string): Observable<Category> {
    return this.http.get<Category>(`${this.apiUrl}/${id}`);
  }

  async searchProductsByCategory(categoryId: string, productName: string): Promise<any[]> {
    try {
      // Mock de búsqueda de productos por categoría
      return this.getMockProducts(categoryId, productName);
      
      // Descomenta cuando tengas tu API:
      // const params = { categoryId, productName };
      // return await firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/search`, { params }));
    } catch (error) {
      console.error('Error searching products:', error);
      throw new Error('Error en la búsqueda de productos');
    }
  }

  private getMockProducts(categoryId: string, productName: string): any[] {
    // Datos mock de productos que coinciden con la búsqueda
    const mockProducts = [
      {
        id: '1',
        name: `${productName} - Producto 1`,
        category: categoryId,
        provider: {
          name: 'Proveedor 1',
          location: { lat: -33.4489, lng: -70.6693 },
          address: 'Santiago Centro'
        }
      },
      {
        id: '2',
        name: `${productName} - Producto 2`,
        category: categoryId,
        provider: {
          name: 'Proveedor 2',
          location: { lat: -33.4372, lng: -70.6506 },
          address: 'Las Condes'
        }
      }
    ];
    
    return mockProducts;
  }
}
