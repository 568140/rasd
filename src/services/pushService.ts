/**
 * Web Push & PWA Notification Client Service
 * Supports full Web Push (VAPID via Vercel Serverless / Express) + 100% Offline Service Worker Fallback
 */

import { alertSound } from './alertSound';
import {
  AppointmentNotificationInput,
  buildAppointmentNotificationPayload,
} from '../utils/dateUtils';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const cleaned = base64String.trim();
  const padding = '='.repeat((4 - (cleaned.length % 4)) % 4);
  const base64 = (cleaned + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Validates that a decoded VAPID public key is a valid uncompressed P-256 public key (65 bytes starting with 0x04)
 */
function isValidVapidPublicKeyBytes(keyBytes: Uint8Array): boolean {
  return keyBytes.byteLength === 65 && keyBytes[0] === 0x04;
}

function areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function getSubscriptionServerKeyBytes(sub: PushSubscription): Uint8Array | null {
  try {
    const rawKey = sub.options?.applicationServerKey;
    if (!rawKey) return null;
    return new Uint8Array(rawKey);
  } catch {
    return null;
  }
}

export interface PushStatus {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  registration: ServiceWorkerRegistration | null;
}

const LOCAL_NOTIF_FLAG_KEY = 'rasd_local_notif_enabled_v1';

class PushService {
  private registration: ServiceWorkerRegistration | null = null;
  private registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

  public async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }
    if (this.registration) {
      return this.registration;
    }
    if (this.registrationPromise) {
      return this.registrationPromise;
    }

    this.registrationPromise = (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        void reg.update().catch(() => {});
        await navigator.serviceWorker.ready;
        this.registration = reg;
        return reg;
      } catch (err) {
        console.warn('Service worker registration failed:', err);
        return null;
      } finally {
        this.registrationPromise = null;
      }
    })();

    return this.registrationPromise;
  }

  public async getStatus(): Promise<PushStatus> {
    const isSupported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'Notification' in window;

    if (!isSupported) {
      return {
        isSupported: false,
        permission: 'default',
        isSubscribed: false,
        registration: null,
      };
    }

    try {
      const reg =
        this.registration ||
        (await navigator.serviceWorker.getRegistration('/sw.js')) ||
        (await navigator.serviceWorker.getRegistration()) ||
        null;
      this.registration = reg;
      const sub = reg && 'pushManager' in reg ? await reg.pushManager.getSubscription() : null;
      const localEnabled = localStorage.getItem(LOCAL_NOTIF_FLAG_KEY) === 'true';

      return {
        isSupported: true,
        permission: Notification.permission,
        isSubscribed: Boolean(sub) || (Notification.permission === 'granted' && localEnabled),
        registration: reg,
      };
    } catch {
      return {
        isSupported: true,
        permission: Notification.permission,
        isSubscribed: Notification.permission === 'granted',
        registration: null,
      };
    }
  }

  public async requestNotificationPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    return await Notification.requestPermission();
  }

  public async subscribeToPush(userId?: string, workspaceId?: string): Promise<PushSubscription | null> {
    const reg = await this.registerServiceWorker();
    const perm = await this.requestNotificationPermission();
    if (perm !== 'granted') {
      throw new Error('لم يتم منح إذن الإشعارات من المتصفح');
    }

    localStorage.setItem(LOCAL_NOTIF_FLAG_KEY, 'true');

    // 1. Check build-time Vite environment variable first (VITE_VAPID_PUBLIC_KEY)
    const envVapidKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim();
    let vapidKey =
      envVapidKey && envVapidKey !== 'YOUR_VAPID_PUBLIC_KEY' ? envVapidKey : '';

    // 2. Fetch public VAPID key from backend / Vercel Serverless Function (/api/push/vapid-key)
    if (!vapidKey) {
      try {
        const res = await fetch('/api/push/vapid-key');
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (data?.publicKey) {
            vapidKey = String(data.publicKey).trim();
          }
        }
      } catch {
        // Offline or static host without /api/push route
      }
    }

    // 3. If VAPID key is available and PushManager is supported, validate and subscribe/renew safely
    if (vapidKey && reg && 'pushManager' in reg) {
      try {
        let convertedKey: Uint8Array;
        try {
          convertedKey = urlBase64ToUint8Array(vapidKey);
          if (!isValidVapidPublicKeyBytes(convertedKey)) {
            console.warn('Invalid VAPID public key format (expected 65-byte uncompressed P-256 key); falling back to local notifications.');
            return null;
          }
        } catch (keyErr) {
          console.warn('Failed to decode VAPID public key; falling back to local notifications:', keyErr);
          return null;
        }

        const existingSub = await reg.pushManager.getSubscription();
        let subscription: PushSubscription | null = null;

        if (existingSub) {
          const existingKeyBytes = getSubscriptionServerKeyBytes(existingSub);
          const keysMatch =
            existingKeyBytes !== null && areUint8ArraysEqual(existingKeyBytes, convertedKey);

          if (keysMatch) {
            subscription = existingSub;
          } else {
            // Existing subscription was bound to a different/outdated VAPID key — safely unsubscribe and re-subscribe
            try {
              await existingSub.unsubscribe();
            } catch (unsubErr) {
              console.warn('Failed to unsubscribe stale PushSubscription before key rotation:', unsubErr);
            }
            subscription = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedKey as unknown as BufferSource,
            });
          }
        } else {
          subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey as unknown as BufferSource,
          });
        }

        try {
          await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subscription,
              userId: userId || 'anonymous',
              workspaceId: workspaceId || 'default',
            }),
          });
        } catch {
          // Ignore network error on subscribe store
        }

        return subscription;
      } catch (subErr) {
        console.warn('WebPush subscription fallback to local SW notifications:', subErr);
      }
    }

    // 4. Graceful Local Service Worker Notification Fallback (works 100% offline & on static hosts)
    return null;
  }

  public async sendTestNotification(): Promise<boolean> {
    alertSound.playNotificationSound();

    try {
      const reg =
        this.registration ||
        (await this.registerServiceWorker());
      const sub = reg && 'pushManager' in reg ? await reg.pushManager.getSubscription() : null;

      if (sub) {
        const res = await fetch('/api/push/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub }),
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (data?.delivered > 0) {
            return true;
          }
        }
      }
    } catch {
      // Fallback to local Service Worker notification below
    }

    // Trigger direct Service Worker / System Notification if serverless push did not deliver
    await alertSound.triggerOfflineSystemNotification(
      'تنبيه موعد مستحق — رَصْد (اختبار)',
      'تبقّى 30 دقيقة على موعد المكلف التجريبي بشأن «معاينة عقارية ومتابعة التزام». نظام التنبيهات والصوت يعمل بنجاح.',
      {
        tag: 'rasd-push-test',
        url: '/?screen=appointments',
        renotify: false,
      }
    );
    return true;
  }

  /**
   * Dispatches a structured appointment alert via Web Push (with active PushSubscription)
   * and falls back seamlessly to local Service Worker notification so only one clean notification appears.
   */
  public async sendAppointmentAlert(
    appt: AppointmentNotificationInput,
    minutesRemaining?: number,
    workspaceId?: string
  ): Promise<boolean> {
    const formatted = buildAppointmentNotificationPayload(appt, minutesRemaining);
    const idempotencyKey = `alert_${appt.id}_${appt.scheduledDate || ''}_${appt.scheduledTime}_${formatted.isOverdue ? 'overdue' : 'upcoming'}`;

    try {
      const reg =
        this.registration ||
        (await navigator.serviceWorker?.getRegistration('/sw.js')) ||
        (await navigator.serviceWorker?.getRegistration()) ||
        null;
      if (reg) this.registration = reg;
      const sub = reg && 'pushManager' in reg ? await reg.pushManager.getSubscription() : null;

      if (sub) {
        const res = await fetch('/api/push/send-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: sub,
            appointmentId: appt.id,
            title: appt.title,
            notificationTitle: formatted.title,
            notificationBody: formatted.body,
            taxpayerName: appt.taxpayerName,
            taxpayerId: appt.taxpayerId,
            propertyId: appt.propertyId,
            scheduledDate: appt.scheduledDate,
            scheduledTime: appt.scheduledTime,
            propertyTitle: appt.propertyTitle,
            minutesRemaining: formatted.minutesRemaining,
            isOverdue: formatted.isOverdue,
            tag: formatted.tag,
            idempotencyKey,
            workspaceId: workspaceId || 'default',
          }),
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (data?.sentCount > 0 || data?.skippedDuplicate) {
            return true;
          }
        }
      }
    } catch {
      // Fall back to local Service Worker / System Notification below
    }

    await alertSound.triggerOfflineSystemNotification(formatted.title, formatted.body, {
      tag: formatted.tag,
      url: formatted.url,
      appointmentId: appt.id,
      taxpayerId: appt.taxpayerId,
      propertyId: appt.propertyId,
      isOverdue: formatted.isOverdue,
      renotify: formatted.renotify,
      data: formatted.data,
    });
    return true;
  }
}

export const pushService = new PushService();
