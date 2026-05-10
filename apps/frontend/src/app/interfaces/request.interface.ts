/**
 * Request Status Enum - Tracks the lifecycle of a service request
 */
export enum RequestStatus {
  SEARCHING = 'searching',           // Request sent, searching for providers
  WAITING_RESPONSES = 'waiting',     // Responses are arriving
  OFFER_ACCEPTED = 'accepted',       // User accepted an offer
  IN_PROGRESS = 'in_progress',       // Provider is on the way/working
  COMPLETED = 'completed',           // Service completed
  CANCELLED = 'cancelled',           // Request cancelled
  EXPIRED = 'expired'                // No responses received
}

/**
 * Urgency level for service requests
 */
export enum RequestUrgency {
  NOW = 'now',           // Need it immediately
  TODAY = 'today',       // Need it today
  THIS_WEEK = 'this_week' // Need it this week
}

/**
 * User service request - Represents a request made by a user
 */
export interface UserServiceRequest {
  id: string;
  userId: string;
  categoryId: string;
  categoryName: string;
  description: string;
  urgency: RequestUrgency;
  maxBudget?: number;
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;

  // Provider responses
  responses: ProviderOffer[];

  // Accepted offer details (when status is OFFER_ACCEPTED or later)
  acceptedOffer?: AcceptedOfferDetails;
}

/**
 * Provider offer - A response from a provider to a user request
 */
export interface ProviderOffer {
  id: string;
  requestId: string;
  providerId: string;
  providerName: string;
  providerEmail: string;
  providerPhone?: string;
  providerPhoto?: string;

  message: string;
  estimatedTime?: number; // in minutes
  price?: number;

  // Provider's location at time of response
  latitude?: number;
  longitude?: number;
  distanceKm?: number;

  accepted: boolean;
  timestamp: Date;
}

/**
 * Accepted offer details - Extended info when an offer is accepted
 */
export interface AcceptedOfferDetails {
  offerId: string;
  providerId: string;
  providerName: string;
  providerEmail: string;
  providerPhone?: string;
  providerPhoto?: string;

  agreedPrice?: number;
  estimatedArrival?: Date;

  // Job progress tracking
  jobStatus: JobStatus;
  providerLocation?: {
    latitude: number;
    longitude: number;
    lastUpdated: Date;
  };

  acceptedAt: Date;
  arrivedAt?: Date;
  completedAt?: Date;
}

/**
 * Job status - Tracks provider's progress after offer acceptance
 */
export enum JobStatus {
  EN_ROUTE = 'en_route',       // Provider is on the way
  ARRIVING = 'arriving',        // Provider is close (< 1km)
  ON_SITE = 'on_site',         // Provider has arrived
  WORKING = 'working',         // Work in progress
  COMPLETED = 'completed'      // Job finished
}

/**
 * Active job for provider - When a provider's offer is accepted
 */
export interface ProviderActiveJob {
  id: string;
  requestId: string;

  // Client info
  clientName: string;
  clientPhone?: string;
  clientLocation: {
    latitude: number;
    longitude: number;
    address?: string;
  };

  // Job details
  categoryName: string;
  description: string;
  agreedPrice?: number;

  // Status
  status: JobStatus;
  acceptedAt: Date;
  arrivedAt?: Date;
  completedAt?: Date;
}

/**
 * Job history entry - Completed jobs for provider
 */
export interface JobHistoryEntry {
  id: string;
  requestId: string;
  clientName: string;
  categoryName: string;
  description: string;
  price?: number;
  completedAt: Date;
  rating?: number;
  review?: string;
}
