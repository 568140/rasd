/**
 * RASD Unified Service Worker (Workbox injectManifest + Web Push & Notification Click Handling)
 */

const CACHE_NAME = 'rasd-cache-v5';
const PRECACHE_MANIFEST = self.__WB_MANIFEST || [];
const PRECACHE_URLS = Array.from(
  new Set([
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/icon.svg',
    '/apple-touch-icon.png',
    '/pwa-192x192.png',
    '/pwa-512x512.png',
    ...PRECACHE_MANIFEST.map((entry) => {
      const rawUrl = typeof entry === 'string' ? entry : entry.url;
      return rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
    }),
  ])
);

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of PRECACHE_URLS) {
        try {
          await cache.add(url);
        } catch {
          // Ignore individual asset precache failures so SW installation never aborts
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && (key.startsWith('rasd-cache-') || key.startsWith('workbox-')))
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim(),
    ])
  );
});

// Offline & Static Asset Caching (skips API and Firebase/Firestore dynamic requests)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Never intercept backend API endpoints or Firebase/Google dynamic RPCs
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com')
  ) {
    return;
  }

  // SPA Navigation requests: Network-first with offline fallback to cached /index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match('/index.html')) ||
            (await cache.match('/')) ||
            Response.error()
          );
        })
    );
    return;
  }

  // Same-origin JS/CSS bundles: Network-first with cache fallback so deployed UI changes appear immediately
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))
  ) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || Response.error();
        })
    );
    return;
  }

  // Same-origin static icons/images & Google Fonts: Cache-first with network fallback & cache update
  if (
    url.origin === self.location.origin ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const networkFetch = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone)).catch(() => {});
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || networkFetch;
      })
    );
  }
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
