/**
 * Maven Event Management Portal Service Worker
 * Strategies: StaleWhileRevalidate for assets, NetworkFirst for portal data
 */

const CACHE_NAME = "maven-pwa-cache-v1";
const STATIC_ASSETS = [
  "/portal",
  "/manifest.json",
  "/favicon.ico"
];

// 1. Install & Precaching
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate & Stale Cache Cleanup
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Routing Strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (they pass directly to server or IndexedDB offline-queue)
  if (event.request.method !== "GET") {
    return;
  }

  // Next.js static assets -> StaleWhileRevalidate
  if (url.pathname.startsWith("/_next/static/") || url.pathname.match(/\.(png|jpg|jpeg|svg|woff2|css|js)$/)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // HTML and dynamic API -> NetworkFirst with Cache Fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse.ok) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            return caches.match("/portal");
          }
          return new Response(JSON.stringify({ error: "Offline mode active" }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
          });
        });
      })
  );
});
