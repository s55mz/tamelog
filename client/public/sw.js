const BUILD_VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = `tamelog-${BUILD_VERSION}`;
const STATIC_ASSETS = ['/', '/index.html'];

function isCacheableAsset(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname === '/sw.js') return false;
  return true;
}

// Install: キャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: 古いキャッシュ削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      ),
      self.registration.navigationPreload?.enable?.()
    ])
  );
  self.clients.claim();
});

// Fetch: HTML=NetworkFirst, assets=StaleWhileRevalidate, API=pass-through
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('{"error":"offline"}', {
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  if (!isCacheableAsset(event.request, url)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        const fresh = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('/index.html', fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match('/index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    const networkPromise = fetch(event.request)
      .then((response) => {
        if (response.ok) {
          cache.put(event.request, response.clone());
        }
        return response;
      })
      .catch(() => cached);

    return cached || networkPromise;
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push通知受信
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? { title: 'TameLog', body: '通知があります' };
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'TameLog', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag ?? 'tamelog-block',
      renotify: true,
      data: { url: data.url ?? '/' }
    })
  );
});

// 通知クリック
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      const existing = windowClients.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
