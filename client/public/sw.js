const BUILD_VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = `tamelog-${BUILD_VERSION}`;
const STATIC_ASSETS = ['/', '/index.html'];
const APP_HOSTS = new Set([
  'finance-pro.space',
  'www.finance-pro.space',
  '160.251.203.86',
  'localhost',
  '127.0.0.1'
]);

function isBlockedHostRuntime() {
  const url = new URL(self.location.href);
  return url.port === '8181' || !APP_HOSTS.has(url.hostname);
}

async function clearAllCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.map(key => caches.delete(key)));
}

function isCacheableAsset(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname === '/sw.js') return false;
  return true;
}

// Install: キャッシュ
self.addEventListener('install', (event) => {
  if (isBlockedHostRuntime()) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: 古いキャッシュ削除
self.addEventListener('activate', (event) => {
  if (isBlockedHostRuntime()) {
    event.waitUntil((async () => {
      await clearAllCaches();
      await self.registration.unregister();
    })());
    return;
  }

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
  if (isBlockedHostRuntime()) return;
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

  // NetworkFirst: 常にネットワークを試み、失敗時のみキャッシュにフォールバック
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      const cached = await cache.match(event.request);
      return cached || Response.error();
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    );
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
