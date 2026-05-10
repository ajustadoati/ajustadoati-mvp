export interface Category {
  id: number;
  name: string;
  description: string;
  iconUrl?: string | null;
  isActive?: boolean;
  displayOrder?: number;
  createdAt?: string;
  updatedAt?: string;
  googlePlaceType?: string;
  selected?: boolean;
}
