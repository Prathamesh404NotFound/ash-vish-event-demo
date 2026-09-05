const CACHE_NAME = 'ashvish-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon-192.png',
  '/favicon-512.png',
];

// Install: cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for hashed build assets & navigations (so a fresh
// deploy is always picked up and stale chunks are never served from cache —
// prevents 'text/html is not a valid JavaScript MIME type' after deploys),
// cache-first for other static assets.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and API calls — always go to network
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // Vite emits content-hashed filenames under /assets/. Always try network
  // first for these and for page navigations; fall back to cache when offline.
  const isBuildAsset = url.pathname.startsWith('/assets/');
  const isNavigation = request.mode === 'navigate';

  event.respondWith(
    (async () => {
      if (isBuildAsset || isNavigation) {
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok) {
            const clone = fresh.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return fresh;
        } catch (err) {
          const cached = await caches.match(request);
          if (cached) return cached;
          // Offline navigation fallback
          if (isNavigation) {
            const shell = await caches.match('/index.html');
            if (shell) return shell;
          }
          throw err;
        }
      }

      const cached = await caches.match(request);
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })()
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'Ash-vish Events';
  const options = {
    body: data.body || 'You have a new update.',
    icon: '/favicon-192.png',
    badge: '/favicon-192.png',
    data: data.url || '/',
    actions: data.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
