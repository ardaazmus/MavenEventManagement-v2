# SaaS Provisioning — Ar-Ge Dosyası (TASK-B 21)

Proje bağlamı: Maven Event Management, Next.js 16 App Router + Prisma 6 (SQLite),
tek kiracı demo → çok kiracılı provizyona geçiş kapısı. Kod: `src/lib/api/provision-core.ts`,
`src/lib/api/super-admin.ts`, `src/app/api/saas/provision/route.ts`.

## 1. Atomik çoklu-create + tazminatlı geri alma (compensating rollback)

- Problem: provizyon TEK istekte 4 yazma yapar (Tenant → User → TenantSubscription →
  ActivityLog). SQLiteinteractive transaction ile sarmak mümkün; ancak geri-alma
  anlatısı için bilinçli seçim: SIRALI create + TERS-SIRA tazminat silmesi.
- Sıra izleme: her create'ten önce `step` değişkeni güncellenir (TENANT/USER/
  SUBSCRIPTION/ACTIVITY). Herhangi bir adım hata atarsa:
  - `rollbackProvision()` yaratılan kayıtları TERS sırada siler
    (subscription → user → tenant), her silme kendi try/catch'inde — tek bir
    silme hatası zinciri kırmaz; son çare tenant silme FK cascade'i devreye alır
    (User/TenantSubscription/ActivityLog kayıtları onDelete: Cascade).
  - Hata yanıtı hangi adımın patladığını bildirir: `{error, failedStep}` + 500.
- Pre-flight ayrımı: TÜM 4xx doğrulamaları (zorunlu alan, e-posta biçimi,
  e-posta benzersizliği → 409, plan enum) satır yaratılmadan ÖNCE yapılır —
  istemci hatası hiçbir zaman geri-alma yolu tetiklemez. Geri-alma yalnız
  beklenmeyen DB arızalarına ayrılır.
- idempotent-ish slug: isimden deterministik slug (TR karakter normalizasyonu);
  çakışırsa 2-bayt rastgele ek → aynı isimle tekrar provizyon güvenli.

## 2. Süper-yönetici kapısı (OWASP notları)

- Üç ayrı saldırı yüzeyi, üç ayrı yanıt:
  1. Konfigürasyon sızıntısı: `MAVEN_SUPERADMIN_KEY` yok → 503 (varsayılan anahtar
     YOK — secrets.ts'teki DEV_FALLBACK ilkesi burada bilinçli UYGULANMAZ).
  2. Endpoint enumeration: yanlış/eksik anahtar → 404 "Kayıt bulunamadı" — uç
     varmış gibi davranış İFŞA ETMEZ (404, yoklama sinyali vermez).
  3. Timing keşfi: `crypto.timingSafeEqual`; girişle beklenenin sha256 özetleri
     karşılaştırılır → uzunluk farkı sızıntısı da kapanır (eşit uzunluk garantisi).
- Oran sınırı: 5 istek / 10 dk / IP (`enforceRateLimit`, kayan pencere, süreç-içi
  bellek) — brute-force + istismar denetimi; 429 + Retry-After döner.
- Yanıt yüzeyi: `{tenantId, userId, subscriptionId}` — parola/anahtar/başka PII yok.
  Kullanıcı `passwordHash` olmadan yaratılır (ORG_OWNER) — şifre normal auth akışıyla
  sonradan tanımlanır (hash-only depolama, argon2id — A4 ile uyumlu).
- Log hijyeni: kapı/log kodları anahtar değeri ASLA yazmaz; e-posta loglanmaz.

## 3. Bu demoda kanıtlananlar

- env unset → POST /api/saas/provision → 503 (kapı kapalı — canlı curl).
- env set + yanlış anahtar → 404 (kapı birim kanıtı, dev sunucusuna restart gerekmeden).
- Geri-alma semantiği: inject-throw + `rollbackProvision` ile satır sayıları
  başlangıca birebir döner (worklog'da sayılarla).
