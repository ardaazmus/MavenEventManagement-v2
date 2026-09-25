// ─── Maven Katılımcı Portalı — Service Worker (PWA shell) ────────────────────
// Strateji: API her zaman ağ (canlı veri; hata → 503 JSON), statik varlıklar
// cache-first + arka plan güncellemesi, gezinme istekleri çevrimdışında
// offline.html'e düşer (PWA offline fallback). Kanca sürüm anahtarı CACHE
// adında — güncelleme dağıtımında ad değişirse eski önbellek activate'te temizlenir.
const CACHE = "maven-portal-v2";
const SHELL = ["/portal-icon-192.png", "/portal-icon-512.png", "/manifest.webmanifest", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // API: canlı veri — her zaman ağ; çevrimdışında net 503 JSON
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    return;
  }

  // gezinme (SPA kökü): önce ağ; çevrimdışı → offline fallback sayfası
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match("/offline.html")) || Response.error()),
    );
    return;
  }

  // statik: cache-first + arka plan yenileme
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});

// bildirim tıklaması → uygulamayı odakla/aç
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    }),
  );
});
