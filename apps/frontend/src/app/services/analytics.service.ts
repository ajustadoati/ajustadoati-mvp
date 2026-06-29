import { Injectable } from '@angular/core';

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, string | number | boolean> }
    ) => void;
  }
}

/**
 * Thin wrapper around Plausible's `window.plausible()` so the rest of the
 * app doesn't have to know it exists or worry about whether the script has
 * finished loading. Calls are silently noop if Plausible isn't there —
 * useful for local dev and for the period before the dashboard is
 * configured on plausible.io.
 *
 * Custom event names go straight to Plausible; props become filterable
 * dimensions in the dashboard.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  track(event: string, props?: Record<string, string | number | boolean>): void {
    try {
      if (typeof window === 'undefined' || typeof window.plausible !== 'function') {
        return;
      }
      window.plausible(event, props ? { props } : undefined);
    } catch {
      // Analytics must never break user flow.
    }
  }
}
