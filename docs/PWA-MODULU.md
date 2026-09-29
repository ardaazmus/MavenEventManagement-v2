# Mobil Uygulama (PWA) Modülü — v1

Sektör karşılığı: Cvent Branded App Builder / EventMobi app designer.
Organizatör; uygulama kimliğini, kısayolları, kurulum teşvikini ve çevrimdışı
davranışı **Dış Portal → Portal Ayarları → Mobil Uygulama (PWA)** kartından yönetir.

## Veri modeli

- `EventPortalConfig.pwaJson` (nullable TEXT) — ayarlar JSON'u.
- `EventPortalConfig.pwaEnabled` (master anahtar, eskiden beri var).
- Şema + varsayılanlar: `src/lib/pwa-settings.ts` (zod).
  - `null`/bozuk kayıt → `PWA_DEFAULTS` (asla çökmez).
  - Yapısal hata (5+ kısayol, yanlış enum, uzun etiket) → API 400.
  - Kozmetik alan (renk/URL) → sessizce temizlenir, 400 vermez.

## Manifest

`GET /api/portal/manifest?slug=<slug>` — dinamik, kiracı-özel:

| Alan | Kaynak |
|---|---|
| `name` / `short_name` / `description` / `lang` | PWA ayarı (boşsa edisyon adı + varsayılan) |
| `start_url` / `id` | `/?portal=<slug>` (sabit kural) |
| `display` / `orientation` | PWA ayarı |
| `theme_color` | Portal tema rengi (hex değilse `#0d9488`) |
| `background_color` | PWA ayarı |
| `icons` (192+512+maskable) | Özel URL veya yerleşik `/portal-icon-*.png` |
| `shortcuts` (0-4) | Etiket + portal-içi derin bağ (`#p=<ekran>`, scope-içi) |
| `screenshots` (0-8) | Zengin kurulum arayüzü (narrow/wide) |

Portal sayfası slug'a özel manifesti `<link rel="manifest">` ile takar;
statik `/manifest.webmanifest` yedek olarak kalır. `theme-color` ve iOS
durum-çubuğu (`apple-mobile-web-app-status-bar-style`) da edisyona göre enjekte edilir.

## Mobil kabuk desenleri

- **Derin-bağ**: ilk açılışta geçerli `#p=<ekran>` onurlandırılır (yığın
  `[home, hedef]` başlar → geri home'a döner). `form` hash ile açılmaz
  (formRef gerekir); geçersiz hash güvenli home'a düşer. Kısayol hedefleri
  `PORTAL_NAV_SCREENS` ile birebirdir (10 ekran, `game` dahil).
- **PWA kapalıyken** (`pwaEnabled=false`): manifest 404 döner, sayfadaki
  manifest bağı kaldırılır (kurulum teklifi yok), SW kaydolmaz, sheet/kart
  gizlenir. Kayıt yoksa varsayılan AÇIK sayılır.
- **Kompakt bar**: home'da hero yarıdan fazla kayınca belirir (logo + ad + zil).
- **Kurulum bottom-sheet**: giriş sonrası + `installDelaySec` (varsayılan 45sn);
  iOS'ta 3-adım Paylaş yönergesi; kapatma `installDismissDays` (7 gün) ertelenir
  (`localStorage: maven.pwa.dismiss.<slug>`); kurulumda 1 yıl susturulur.
- **Çevrimdışı şerit**: `navigator.onLine=false` iken ince üst şerit + Yeniden dene
  (`offlineBanner` açıkken). SW navigate-yedeği (`/offline.html`/önbellek) korunur.
- Mevcut kurulum kartı (home) + profil butonu aynen durur — kayıp yok.

## Admin kartı bölümleri

Kimlik → Görünüm → İkonlar → Hızlı Eylemler (≤4) → Ekran Görüntüleri (≤8) →
Kurulum Teşviki/Çevrimdışı → **Kurulabilirlik kontrolü (9 madde)** + manifest JSON önizleme.

## Test yöntemleri (bu modülle gelen 4 yeni yöntem)

1. **Viewport matrisi** (`tests/pwa/_pwa-helpers.ts` + `32-…`): 390/768/1280 —
   yatay taşma yok + dokunma hedefi ≥40px + 5 sekme.
2. **PWA denetimi** (`31-…`): manifest şeması, ikon 200 + PNG imzası, kısayol
   kapsamı, dinamik bağ, şerit, çevrimdışı yedek, kompakt bar, sheet (iOS UA).
3. **Görsel golden** (`33-…`): kapı + home + admin kartı PNG'leri
   (`-snapshots/`, win32 seti commitli; tasarım değişiminde `--update-snapshots`
   + MANUEL inceleme, kör güncelleme yasak).
4. **Sözleşme testleri** (`tests-mini/pwa-settings.test.mjs`, 15 test): şema,
   varsayılanlar, 400/sanitize ayrımı, manifest regresyon kilidi, tur testi.

Singleton kuralı: `pwaJson` YAZAN E2E testleri yalnız `demo-auth-off` projesinde
koşar ve sonunda `pwa:null` ile temizler; okuyan testler kirlenme-toleranslıdır
(değer-eşitliği değil yapısal iddia).

## Bilinen sınırlar / yol haritası

- **Arka-plan push**: SW'de `push` dinleyicisi yok; duyurular ön-plan
  `Notification` + polling ile çalışır (izin, hatırlatıcı/profil akışında istenir).
  Tam push: VAPID + abonelik + SW push + admin gönderici (ayrı epic).
- **İkon yükleme**: medya kitaplığı dataURL-tabanlıdır (sunulabilir dosya ucu
  yok); kartta "Etkinlik logosunu kullan" kısayolu + manuel URL vardır.
  Gerçek resize/sunum hattı yol haritasındadır.
- **iOS kurulum sayımı**: `beforeinstallprompt` iOS'ta yoktur; standalone
  açılışta bayrakla bir kez `PWA_INSTALL` ateşlenerek telafi edilir.
