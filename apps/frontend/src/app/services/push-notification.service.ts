import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

interface PushConfig {
  publicKey: string;
  enabled: boolean;
}

/**
 * Manages the browser's Web Push subscription for the current provider.
 *
 * The Angular SwPush wraps `navigator.serviceWorker.ready.pushManager`;
 * on iOS Safari this only works if the user has installed the app to the
 * home screen (iOS 16.4+). On Android/desktop Chrome/Firefox it works
 * directly from the browser.
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private http = inject(HttpClient);
  private swPush = inject(SwPush);

  private cachedConfig?: PushConfig;

  isSupported(): boolean {
    // SwPush.isEnabled is false in dev builds (no SW). In production, Chrome,
    // Firefox, Edge and iOS 16.4+ (as PWA) support it.
    return this.swPush.isEnabled && 'Notification' in window && 'PushManager' in window;
  }

  currentPermission(): NotificationPermission | 'unsupported' {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }

  async isSubscribed(): Promise<boolean> {
    try {
      const sub = await firstValueFrom(this.swPush.subscription);
      return sub != null;
    } catch {
      return false;
    }
  }

  async enable(): Promise<'ok' | 'denied' | 'unsupported' | 'error'> {
    if (!this.isSupported()) return 'unsupported';

    const config = await this.getConfig();
    if (!config?.publicKey) {
      console.warn('Web Push disabled on backend (no VAPID public key).');
      return 'unsupported';
    }

    try {
      const sub = await this.swPush.requestSubscription({
        serverPublicKey: config.publicKey
      });

      const keys = sub.toJSON().keys ?? {};
      await firstValueFrom(
        this.http.post(`${environment.baseUrl}/providers/push-subscriptions`, {
          endpoint: sub.endpoint,
          p256dh: keys['p256dh'],
          auth: keys['auth'],
          userAgent: navigator.userAgent
        })
      );
      return 'ok';
    } catch (err: any) {
      if (err?.message?.includes('denied') || Notification.permission === 'denied') {
        return 'denied';
      }
      console.error('Push enable failed:', err);
      return 'error';
    }
  }

  async disable(): Promise<void> {
    try {
      const sub = await firstValueFrom(this.swPush.subscription);
      if (sub) {
        await firstValueFrom(
          this.http.request('DELETE', `${environment.baseUrl}/providers/push-subscriptions`, {
            body: { endpoint: sub.endpoint }
          })
        );
        await this.swPush.unsubscribe();
      }
    } catch (err) {
      console.warn('Push disable failed:', err);
    }
  }

  /** Handles notification clicks — routes to whatever URL the payload asked for. */
  wireClickHandler(defaultUrl = '/provider/home'): void {
    if (!this.swPush.isEnabled) return;
    this.swPush.notificationClicks.subscribe(({ notification }) => {
      const url = (notification.data as any)?.url ?? defaultUrl;
      if (typeof window !== 'undefined') {
        window.focus();
        window.location.href = url;
      }
    });
  }

  private async getConfig(): Promise<PushConfig | undefined> {
    if (this.cachedConfig) return this.cachedConfig;
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: PushConfig }>(`${environment.baseUrl}/providers/push-config`)
      );
      this.cachedConfig = res.data;
      return this.cachedConfig;
    } catch (err) {
      console.warn('push-config fetch failed', err);
      return undefined;
    }
  }
}
