/**
 * RASD Custom Service Worker with Web Push & Notification Click Handling
 */

const CACHE_NAME = 'rasd-cache-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push Event: triggers when server broadcasts a scheduled appointment alert
self.addEventListener('push', (event) => {
  let data = {
    title: 'تذكير موعد ميداني — رَصْد',
    body: 'لديك موعد ميداني مستحق الآن.',
    icon: '/pwa-192x192.png',
    badge: '/icon.svg',
    tag: 'rasd-appointment-alert',
    data: {
      url: '/?screen=appointments',
    },
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = { ...data, ...payload };
    }
  } catch (err) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/icon.svg',
    tag: data.tag || 'rasd-appointment-alert',
    vibrate: [200, 100, 200, 100, 250],
    data: data.data || { url: '/?screen=appointments' },
    requireInteraction: true,
    actions: [
      { action: 'open', title: 'عرض الموعد' },
      { action: 'dismiss', title: 'إغلاق' },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification Click: opens the targeted appointment screen in the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/?screen=appointments';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
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
