/**
 * MedChain PWA Service Worker
 * Enables offline caching for Councilor Preview dashboard
 * Optimized for demo presentations in poor Wi-Fi environments
 */

const CACHE_NAME = 'medchain-councilor-v1';
const STATIC_CACHE = 'medchain-static-v1';

// Critical assets to cache for offline use
const PRECACHE_ASSETS = [
  '/',
  '/gov-preview',
  '/index.html',
  '/manifest.json',
];

// Cache strategies
const CACHE_STRATEGIES = {
  // Network-first for API calls and verification pages (always fresh)
  networkFirst: ['/api/', '/verify/'],
  // Cache-first for static assets
  cacheFirst: ['.js', '.css', '.png', '.jpg', '.svg', '.woff', '.woff2'],
  // Stale-while-revalidate for HTML
  staleWhileRevalidate: ['.html', '/gov-preview'],
};

// Install event - precache critical assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing MedChain Service Worker...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Precaching critical assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[SW] Precache complete');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Precache failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating MedChain Service Worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Determine cache strategy based on request URL
  const isAPI = CACHE_STRATEGIES.networkFirst.some(pattern => url.pathname.includes(pattern));
  const isStatic = CACHE_STRATEGIES.cacheFirst.some(ext => url.pathname.endsWith(ext));
  const isHTML = CACHE_STRATEGIES.staleWhileRevalidate.some(pattern =>
    url.pathname.endsWith(pattern) || url.pathname === pattern
  );

  if (isAPI) {
    // Network-first strategy for API calls
    event.respondWith(networkFirst(event.request));
  } else if (isStatic) {
    // Cache-first strategy for static assets
    event.respondWith(cacheFirst(event.request));
  } else if (isHTML || url.pathname === '/gov-preview') {
    // Stale-while-revalidate for HTML pages
    event.respondWith(staleWhileRevalidate(event.request));
  } else {
    // Default: try network, fall back to cache
    event.respondWith(networkFirst(event.request));
  }
});

// Cache-first strategy
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, no cache available:', request.url);
    return new Response('Offline - Asset not cached', { status: 503 });
  }
}

// Network-first strategy
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] Serving from cache:', request.url);
      return cachedResponse;
    }
    return new Response(JSON.stringify({ offline: true, cached: false }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Stale-while-revalidate strategy
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // Fetch in background
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  // Return cached response immediately if available
  if (cachedResponse) {
    console.log('[SW] Serving stale, revalidating:', request.url);
    return cachedResponse;
  }

  // Otherwise wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  // Last resort: offline page
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>MedChain - Offline</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: -apple-system, system-ui, sans-serif;
          background: #030712;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          text-align: center;
          padding: 20px;
        }
        .container { max-width: 400px; }
        h1 { font-size: 1.5rem; margin-bottom: 1rem; }
        p { color: #94a3b8; margin-bottom: 1.5rem; }
        button {
          background: linear-gradient(135deg, #0d9488, #06b6d4);
          color: white;
          border: none;
          padding: 16px 32px;
          border-radius: 12px;
          font-weight: bold;
          font-size: 1rem;
          cursor: pointer;
          min-height: 56px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>You're Offline</h1>
        <p>The Councilor Dashboard requires an internet connection. Please check your Wi-Fi and try again.</p>
        <button onclick="location.reload()">Retry Connection</button>
      </div>
    </body>
    </html>
  `, {
    status: 200,
    headers: { 'Content-Type': 'text/html' }
  });
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(syncData());
  }
});

async function syncData() {
  // Sync any pending offline actions when connection is restored
  console.log('[SW] Syncing offline data...');
}

// Push notifications (future use)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
    });
  }
});

console.log('[SW] MedChain Service Worker loaded');
