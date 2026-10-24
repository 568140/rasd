/**
 * Web Push & PWA Notification Client Service
 */

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
      typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

    if (!isSupported) {
      return {
        isSupported: false,
        permission: 'default',
        isSubscribed: false,
        registration: null,
      };
    }

    try {
      const reg = this.registration || (await navigator.serviceWorker.getRegistration('/sw.js')) || null;
      this.registration = reg;
      const sub = reg ? await reg.pushManager.getSubscription() : null;

      return {
        isSupported: true,
        permission: Notification.permission,
        isSubscribed: Boolean(sub),
        registration: reg,
      };
    } catch {
      return {
        isSupported: true,
        permission: Notification.permission,
        isSubscribed: false,
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
    if (!reg) throw new Error('تعذر تسجيل Service Worker للإشعارات');

    const perm = await this.requestNotificationPermission();
    if (perm !== 'granted') {
      throw new Error('لم يتم منح إذن الإشعارات من المتصفح');
    }

    // Fetch public VAPID key from backend
    let vapidKey = '';
    try {
      const res = await fetch('/api/push/vapid-key');
      if (res.ok) {
        const data = await res.json();
        vapidKey = data.publicKey;
      }
    } catch {
      // server endpoint fallback
    }

    if (!vapidKey) {
      throw new Error('تعذر استرداد مفتاح VAPID العام من الخادم.');
    }

    const convertedKey = urlBase64ToUint8Array(vapidKey);
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey as unknown as BufferSource,
    });

    // Send subscription to backend
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription,
        userId: userId || 'anonymous',
        workspaceId: workspaceId || 'default',
      }),
    });

    return subscription;
  }

  public async sendTestNotification(): Promise<boolean> {
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const pushService = new PushService();
