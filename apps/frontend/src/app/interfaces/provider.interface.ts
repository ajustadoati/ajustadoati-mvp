export interface ProviderProfile {
  id: string;
  userId: string;
  businessName?: string;
  description?: string;
  rating: number;
  totalReviews: number;
  isActive: boolean;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderCategory {
  id: string;
  providerId: string;
  categoryId: string;
  categoryName: string;
  experience: number; // años de experiencia
  verified: boolean;
  createdAt: Date;
}

export interface ProviderLocation {
  id?: string;
  providerId?: string;
  address: string;
  latitude: number;
  longitude: number;
  serviceRadius: number;
  isDefault: boolean;
  createdAt: Date;
  distance?: number; // Calculado dinámicamente durante búsquedas
}
export interface ProviderServiceHours {
  id: string;
  providerId: string;
  dayOfWeek: number; // 0=Domingo, 1=Lunes, etc.
  startTime: string; // formato HH:mm
  endTime: string;   // formato HH:mm
  isOpen: boolean;
}

export interface ProviderPricing {
  id: string;
  providerId: string;
  serviceType: 'hourly' | 'fixed' | 'quote';
  serviceName: string;
  price: number;
  currency: string;
  description?: string;
}

export interface ProviderContact {
  id: string;
  providerId: string;
  phone: string;
  whatsapp?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
}

export interface ProviderVerification {
  id: string;
  providerId: string;
  documentType: string;
  status: 'pending' | 'approved' | 'rejected';
  uploadedAt: Date;
  verifiedAt?: Date;
  notes?: string;
}

// Para búsquedas y listados
export interface ProviderSearchResult {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  businessName?: string;
  description?: string;
  rating: number;
  totalReviews: number;
  isActive: boolean;
  isVerified: boolean;
  categories: Array<{
    categoryId: string;
    categoryName: string;
    experience: number;
  }>;
  locations: Array<{
    address: string;
    latitude: number;
    longitude: number;
    serviceRadius: number;
    distance?: number; // calculada durante la búsqueda
  }>;
  contact: {
    phone: string;
    whatsapp?: string;
  };
  pricing?: Array<{
    serviceType: string;
    serviceName: string;
    price: number;
    currency: string;
  }>;
}

// Para registro de nuevos proveedores
export interface ProviderRegistrationData {
  // Datos básicos del usuario
  email: string;
  password: string;
  fullName: string;
  phone: string;
  username: string;
  
  // Datos específicos del proveedor
  businessName?: string;
  description?: string;
  categories: Array<{
    categoryId: string;
    experience?: number;
  }>;
  
  // Ubicación principal
  location: {
    address: string;
    latitude: number;
    longitude: number;
    serviceRadius?: number;
  };
  
  // Contacto
  whatsapp?: string;
  website?: string;
  
  // Precios básicos (opcional en registro)
  pricing?: Array<{
    serviceType: 'hourly' | 'fixed';
    serviceName: string;
    price: number;
  }>;
}
