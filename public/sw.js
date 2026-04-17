/* =============================================
   GRAND SOLEIL — Service Worker (PWA)
   ============================================= */

const CACHE_NAME    = 'grand-soleil-v1';
const RUNTIME_CACHE = 'grand-soleil-runtime-v1';

// Recursos que se cachean en la instalación (shell de la app)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/booking.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Fuentes de Google (se cachean en runtime)
];

// ── Instalación ───────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activación — limpia cachés viejos ────────────────────────────────────────
self.addEventListener('activate', event => {
  const validCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !validCaches.includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch — estrategia por tipo de recurso ────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Nunca cachear llamadas a la API ni a Stripe
  if (url.pathname.startsWith('/api/') ||
      url.hostname.includes('stripe.com') ||
      url.hostname.includes('stripe-js') ||
      request.method !== 'GET') {
    return; // pasa directo a la red
  }

  // Fuentes de Google: Cache First (raramente cambian)
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // Archivos estáticos propios: Stale While Revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});

// ── Estrategias de caché ──────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const network = await fetch(request);
    if (network.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, network.clone());
    }
    return network;
  } catch {
    return new Response('Sin conexión', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || await networkFetch || offlinePage();
}

function offlinePage() {
  return new Response(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sin conexión — Grand Soleil</title>
      <style>
        body { font-family: Georgia, serif; background: #1C1712; color: #E8DED0;
               display: flex; align-items: center; justify-content: center;
               min-height: 100vh; margin: 0; text-align: center; padding: 2rem; }
        h1   { font-size: 2.5rem; color: #C9A84C; margin-bottom: 1rem; }
        p    { color: rgba(232,222,208,0.6); max-width: 400px; line-height: 1.7; }
        button { margin-top: 2rem; background: #C9A84C; color: #1C1712; border: none;
                 padding: 0.85rem 2rem; border-radius: 4px; font-size: 0.9rem;
                 cursor: pointer; letter-spacing: 0.1em; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div>
        <h1>Grand Soleil</h1>
        <p>Parece que no hay conexión a internet. Por favor verifica tu red e intenta nuevamente.</p>
        <button onclick="location.reload()">Reintentar</button>
      </div>
    </body>
    </html>
  `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ── Push Notifications (base para futuro) ────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'Grand Soleil', {
    body: data.body || 'Tienes una actualización sobre tu reserva.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    data: { url: data.url || '/' }
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
