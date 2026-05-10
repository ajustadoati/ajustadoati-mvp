// Interfaz que coincide con tu API response
export interface ApiUser {
  userId: number;
  name: string;
  email: string;
  username: string;
  mobileNumber: string;
  createdAt: string;
  roles: string[];
  categories: string[];
  locations: {
    latitude: number;
    longitude: number;
  }[];
}

// Interfaz transformada para la app
export interface Provider {
  id: string;
  name: string;
  email: string;
  phone: string;
  username: string;
  categories: string[];
  locations: {
    lat: number;
    lng: number;
  }[];
  distance?: number;
  isOnline?: boolean;
  createdAt?: string;
  roles: string[];
}

export interface ProviderSearchRequest {
  categoryId: string;
  productName?: string;
  userLatitude?: number;
  userLongitude?: number;
  radius?: number; // en kilómetros
  useGoogleMapsFallback?: boolean;
}

export interface ProviderSearchResponse {
  providers: Provider[];
  totalCount: number;
  userLocation?: {
    lat: number;
    lng: number;
  };
}
