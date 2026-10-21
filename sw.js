/* アプリのコードや見た目を更新したら、このバージョン番号を上げます。 */
const CACHE_VERSION = 'exam-trainer-shell-v1';
const MEDIA_CACHE = 'exam-trainer-media-v1';
const APP_ASSETS = [
  './', './index.html', './style.css', './app.js', './questions.csv',
  './manifest.webmanifest', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('exam-trainer-') && name !== CACHE_VERSION && name !== MEDIA_CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  const networkFirst = request.mode === 'navigate' || url.pathname.endsWith('/questions.csv');
  event.respondWith((async () => {
    if (networkFirst) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        return await caches.match(request) || (request.mode === 'navigate' ? await caches.match('./index.html') : undefined) || Response.error();
      }
    }
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(MEDIA_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (_) { return Response.error(); }
  })());
});
