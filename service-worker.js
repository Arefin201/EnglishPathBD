/* ══════════════════════════════════════════════════════════════════
   EnglishPath BD — Service Worker
   Provides offline-first caching for the PWA.
   ══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'englishpath-bd-v4';
const CACHE_VERSION = '4.0.0';

/* Files to cache immediately on install (app shell). */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest'
];

/* ─────────────────── INSTALL ─────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME + '-' + CACHE_VERSION)
      .then((cache) => {
        return Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn('[SW] Precache miss:', url, err);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

/* ─────────────────── ACTIVATE ─────────────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key.startsWith('englishpath-bd-') && key !== CACHE_NAME + '-' + CACHE_VERSION)
            .map((key) => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

/* ─────────────────── FETCH ───────────────────
   Strategy:
   - Navigation requests (HTML) → Network-first, fallback to cache.
   - Static assets (fonts, Tailwind CDN) → Cache-first, network fallback.
   - All other requests → Network-first with cache fallback.
*/
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Skip cross-origin requests we don't want to cache (except fonts + tailwind CDN)
  const isSameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');
  const isTailwind = url.hostname.includes('cdn.tailwindcss.com');

  if (!isSameOrigin && !isFont && !isTailwind) {
    return; // let browser handle it normally
  }

  // Navigation requests: network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME + '-' + CACHE_VERSION).then((cache) => cache.put(req, copy));
          return response;
        })
        .catch(() => {
          return caches.match(req).then((cached) => {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // Other GET requests: cache-first with network fallback
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Return cached immediately, update cache in background
        fetch(req)
          .then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              const copy = response.clone();
              caches.open(CACHE_NAME + '-' + CACHE_VERSION).then((cache) => cache.put(req, copy));
            }
          })
          .catch(() => { /* offline — ignore */ });
        return cached;
      }

      return fetch(req)
        .then((response) => {
          if (!response || response.status !== 200) return response;
          const copy = response.clone();
          caches.open(CACHE_NAME + '-' + CACHE_VERSION).then((cache) => cache.put(req, copy));
          return response;
        })
        .catch(() => {
          // Offline fallback for HTML
          if (req.headers.get('accept') && req.headers.get('accept').includes('text/html')) {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
    })
  );
});

/* ─────────────────── MESSAGE (skip waiting) ─────────────────── */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
});

console.log('[EnglishPath BD] Service Worker loaded · v' + CACHE_VERSION);