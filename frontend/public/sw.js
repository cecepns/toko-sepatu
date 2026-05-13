/* Offline ringan — hindari cache HTML agar deploy SPA selalu segar */
const CACHE = 'pos-mc-v2';
const ASSETS = ['/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  if (request.url.includes('/api/')) return;

  // Navigasi / dokumen: selalu jaringan dulu supaya index.html & chunk JS baru ter-load setelah update
  if (request.mode === 'navigate' || request.destination === 'document') {
    e.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});
