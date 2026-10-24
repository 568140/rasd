/**
 * RASD Custom Service Worker with Web Push & Notification Click Handling
 */

const CACHE_NAME = 'rasd-cache-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push Event: triggers when server broadcasts a scheduled or overdue appointment alert
self.addEventListener('push', (event) => {
  let data = {
    title: 'اقترب موعد الالتزام — رَصْد',
    body: 'لديك موعد التزام ميداني مستحق المتابعة.',
    icon: '/pwa-192x192.png',
    badge: '/icon.svg',
    tag: 'rasd-appointment-alert',
    renotify: false,
    data: {
      url: '/?screen=appointments',
    },
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = {
        ...data,
        ...payload,
        data: {
          ...(data.data || {}),
          ...(payload.data || {}),
        },
      };
    }
  } catch {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const isOverdue = Boolean(data.data && data.data.isOverdue);

  const options = {
    body: data.body,
    dir: 'rtl',
    lang: 'ar',
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/icon.svg',
    tag: data.tag || 'rasd-appointment-alert',
    renotify: typeof data.renotify === 'boolean' ? data.renotify : isOverdue,
    vibrate: isOverdue ? [240, 100, 240, 100, 320] : [180, 90, 180],
    data: data.data || { url: '/?screen=appointments' },
    requireInteraction: true,
    actions: [
      { action: 'open', title: 'فتح الموعد والسجل' },
      { action: 'dismiss', title: 'إغلاق' },
    ],
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients) => {
          for (const client of clients) {
            try {
              client.postMessage({
                type: 'RASD_PUSH_RECEIVED',
                payload: data,
              });
            } catch {
              // ignore postMessage errors
            }
          }
        }),
    ])
  );
});

// Notification Click: focuses app and deep-links to the exact appointment or taxpayer dossier
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || '/?screen=appointments';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            client.postMessage({
              type: 'RASD_NOTIFICATION_CLICK',
              data: notifData,
            });
          } catch {
            // ignore
          }
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl).catch(() => {});
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
