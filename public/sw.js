/**
 * Maven Event Management Portal — Service Worker (v2)
 *
 * Denetim bulguları (PWA-3..PWA-6) üzerine yeniden yazıldı:
 *  • ÖNCEDEN: precache listesinde 404 URL'ler vardı ve toplu ekleme
 *    atomik başarısız olduğu için SW HİÇ kurulamıyordu.
 *  • ÖNCEDEN: "SKIP_WAITING" message dinleyicisi yoktu — güncelleme toast'ının
 *    butonu (portal-app applySwUpdate) hiçbir şey yapmıyordu.
 *  • ÖNCEDEN: /api/* GET yanıtları önbelleğe yazılıyordu (paylaşımlı cihazda
 *    oturum verisi sızıntısı riski).
 *
 * Stratejiler:
 *  • Uygulama kabuğu (offline.html, ikonlar, manifest): precache + CacheFirst
 *  • Next.js statik derlemeleri (_next/static): StaleWhileRevalidate
 *  • Google Fonts (CSS + woff2): StaleWhileRevalidate (ayrı font önbelleği)
 *  • /api/* : HER ZAMAN ağ (önbellek YOK) — taze veri + PII güvenliği
 *  • Sayfa geçişleri (navigate): NetworkFirst, çevrimdışıyken /offline.html
 */

const APP_CACHE = "maven-pwa-app-v2";
const STATIC_CACHE = "maven-pwa-static-v2";
const FONT_CACHE = "maven-pwa-fonts-v2";
const OFFLINE_URL = "/offline.html";

// Hepsi GERÇEK, diskte var olan URL'ler — biri bile 404 olursa kurulum ölür,
// bu yüzden addAll yerine tek-tek tolerant ekleme yapılır.
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/portal-icon-192.png",
  "/portal-icon-512.png",
];

// 1. Kurulum — tolerant precache: tekil hata tüm kurulumu öldürmez
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

// 2. Aktivasyon — eski önbellek temizliği
self.addEventListener("activate", (event) => {
  const keep = new Set([APP_CACHE, STATIC_CACHE, FONT_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((key) => (keep.has(key) ? undefined : caches.delete(key)))),
      )
      .then(() => self.clients.claim()),
  );
});

// 3. İstemciden "hemen devreye gir" komutu (portal-app güncelleme toast'ı)
self.addEventListener("message", (event) => {
  const data = event.data;
  if (data === "SKIP_WAITING" || (data && data.type === "SKIP_WAITING")) {
    self.skipWaiting();
  }
});

function staleWhileRevalidate(cacheName, request) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
}

// 4. Fetch yönlendirme
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // /api/* — daima ağ, asla önbellek (taze veri + PII güvenliği)
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ error: "OFFLINE" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    return;
  }

  // Google Fonts — ayrı önbellek, StaleWhileRevalidate
  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(FONT_CACHE, request));
    return;
  }

  // Next.js derlemeleri + sürümlü görseller — StaleWhileRevalidate
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || /\.(png|jpg|jpeg|svg|webp|woff2|css|js)$/.test(url.pathname))
  ) {
    event.respondWith(staleWhileRevalidate(STATIC_CACHE, request));
    return;
  }

  // Sayfa geçişleri — NetworkFirst; çevrimdışıyken önce ziyaret edilmiş
  // sayfa, yoksa offline kabuğu
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(APP_CACHE).then((cache) => cache.put(request, copy).catch(() => undefined));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then(
            (visited) =>
              visited ||
              caches.match(OFFLINE_URL).then(
                (offline) =>
                  offline ||
                  new Response("Çevrimdışısınız", {
                    status: 503,
                    headers: { "Content-Type": "text/plain; charset=utf-8" },
                  }),
              ),
          ),
        ),
    );
    return;
  }

  // Diğer same-origin GET — NetworkFirst + önbellek yedeği
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request)),
    );
  }
});
