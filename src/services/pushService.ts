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
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
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

  public async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }
    try {
      this.registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      return this.registration;
    } catch (err) {
      console.warn('Service worker registration failed:', err);
      return null;
    }
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

    // 3. If VAPID key is available and PushManager is supported, subscribe to Web Push
    if (vapidKey && reg && 'pushManager' in reg) {
      try {
        const existingSub = await reg.pushManager.getSubscription();
        const convertedKey = urlBase64ToUint8Array(vapidKey);
        const subscription =
          existingSub ||
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey as unknown as BufferSource,
          }));

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
