// Service Worker for ABS Interiors Admin Panel
const VERSION = 'v3';
const RUNTIME_CACHE = `rabs-runtime-${VERSION}`;
const ALLOWED_CACHES = [RUNTIME_CACHE];

// Only long-lived, content-stable public assets may be served from cache.
// HTML documents and Next.js build output must never be cached here: their
// URLs change every deploy, and a stale document references chunks that no
// longer exist, which renders the app unstyled and unhydrated.
function isCacheableAsset(url) {
  if (url.pathname === '/manifest.json') return true;
  if (url.pathname.startsWith('/brand/')) return true;
  return false;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => !ALLOWED_CACHES.includes(name)).map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== location.origin) return;
  if (!isCacheableAsset(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
