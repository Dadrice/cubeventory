const CACHE = 'cubeventory-v1';

// All CDN scripts the app needs to run offline
const CDN_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.4.4/lz-string.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
];

// On install: cache index.html immediately, then CDN scripts best-effort.
// A single CDN failure won't block the install.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.add('/cubeventory/index.html').then(() =>
        Promise.all(
          CDN_URLS.map(url =>
            fetch(url, { mode: 'no-cors' })
              .then(r => cache.put(url, r))
              .catch(() => { /* CDN unavailable — skip, will cache on next real load */ })
          )
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// On activate: delete any old cache versions so stale files don't linger.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy:
//   PeerJS signaling server  → always bypass (WebRTC needs live network)
//   CDN resources            → cache-first (fast, offline-capable after first load)
//   Local files (index.html) → network-first, fall back to cache
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept PeerJS signaling — it needs a live connection
  if (url.hostname.endsWith('peerjs.com')) return;

  if (url.origin !== self.location.origin) {
    // CDN: serve from cache, update in background on cache hit; fetch+cache on miss
    event.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          const networkFetch = fetch(event.request, { mode: 'no-cors' })
            .then(r => { cache.put(event.request, r.clone()); return r; })
            .catch(() => null);
          return cached || networkFetch;
        })
      )
    );
  } else {
    // Local files: network-first so updates land immediately; cache as fallback
    event.respondWith(
      caches.open(CACHE).then(cache =>
        fetch(event.request)
          .then(r => { if (r.ok) cache.put(event.request, r.clone()); return r; })
          .catch(() => cache.match(event.request)
            .then(cached => cached || cache.match('/cubeventory/index.html')))
      )
    );
  }
});
