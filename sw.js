// Bump this version whenever you want all clients to ditch the old cache.
const CACHE = 'cubeventory-v3';

// All CDN scripts the app needs to run offline.
// These must exactly match the src= URLs in index.html.
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

// On install: cache index.html first (required), then CDN scripts best-effort.
// Uses default CORS mode (no 'mode: no-cors') so the responses can later be
// served for <script crossorigin="anonymous"> requests without being rejected.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.add('/cubeventory/index.html').then(() =>
        Promise.all(
          CDN_URLS.map(url =>
            fetch(url)
              .then(r => { if (r.ok) cache.put(url, r); })
              .catch(() => { /* CDN unreachable at install time — will cache on first live load */ })
          )
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// On activate: delete every old cache version so stale/broken entries don't linger.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy:
//   PeerJS signaling server  → bypass entirely (WebRTC needs a live connection)
//   CDN resources            → cache-first; on miss fetch+cache with normal CORS
//   Local files (index.html) → network-first so deploys propagate; cache fallback
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept PeerJS signaling — it needs a live connection
  if (url.hostname.endsWith('peerjs.com')) return;

  if (url.origin !== self.location.origin) {
    // CDN: cache-first, then network (no mode override — honour the request as-is)
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(r => {
          if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(event.request, c)); }
          return r;
        });
      })
    );
  } else {
    // Local: network-first so updates land immediately; fall back to cache when offline
    event.respondWith(
      fetch(event.request)
        .then(r => {
          if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(event.request, c)); }
          return r;
        })
        .catch(() => caches.match(event.request)
          .then(cached => cached || caches.match('/cubeventory/index.html')))
    );
  }
});
