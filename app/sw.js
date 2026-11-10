// Offline support: cache the app's own files. Bump CACHE when files change.
const CACHE = 'wg-v8';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'cart-core.js',
  'js/main.js', 'js/model.js', 'js/seed.js', 'js/list.js', 'js/store.js',
  'js/ui/dom.js', 'js/ui/meals.js', 'js/ui/week.js', 'js/ui/list.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first for our own files (so updates show up), cache as fallback offline.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; }
        return caches.match(e.request, { ignoreSearch: true }).then(r => r || res);
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
