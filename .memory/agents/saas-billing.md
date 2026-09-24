# SaaS Billing — Ar-Ge Dosyası (TASK-B 22)

Proje bağlamı: Maven Event Management — abonelik + manuel fatura uçları.
Kod: `src/app/api/saas/subscription/route.ts`, `src/app/api/saas/usage/route.ts`,
`src/app/api/saas/onboarding/route.ts`. Modeller: `TenantSubscription`, `TenantInvoice`
(zaten şemada; kuruş alanları Int).

## 1. Minor-unit (kuruş) disiplini

- KURAL (F6'dan): DB'de para = kuruş, `Int`. Float YASAK — ikili kayan nokta
  yuvarlama hatası finansal toplamları bozar (0.1+0.2 ≠ 0.3 sınıfı hatalar).
- API sözleşmesi: `priceMonthlyMinor`, `amountMinor` — negatif olmayan TAM SAYI
  zorunlu; `Number.isInteger(v) && v ≥ 0` doğrulaması 400 ile uygulanır.
  (₺5.000,00 = 500000 kuruş — gösterim `fmtMoney`/money.ts ile.)
- Toplamlar `aggregate._sum.amountMinor` ile DB'de hesaplanır (JS float toplamı yok);
  boş küme `null` döner → `?? 0` ile integer sıfır normalize edilir.
- Fatura özeti: `count` + `paidMinor` (status=PAID) + `openMinor`
  (status ∈ DRAFT|ISSUED — tahakkuk eden, ödenmemiş; VOID hariç).

## 2. Manuel-ilk aşama planı (manuel → gateway)

- Aşama 1 (bugün): TAMAMEN MANUEL — fatura `ISSUE` (kesim), `MARK_PAID` (tahsilat),
  `VOID` (iptal) aksiyonları; ödeme geçidi çağrısı YOK. number @unique; çift
  numara → 409 (kibar ön-kontrol + P2002 yarış yakalama, iki yol da 409).
  MARK_PAID `paidAt` yazar; VOID fatura açık toplama girmez.
- Aşama 2 (ileride): gateway (iyzico/Stripe) — ApiIntegration tablosu hazır
  (kind=PAYMENT); bu uçların sözleşmesi kuruş-Int olduğu için gateway adapter
  sadece minor-unit kabul eden bir katman ekler, şema değişikliği gerekmez.
- IDOR kontrolü: MARK_PAID/VOID numarayla bulur ama zincir filtresi
  `subscription.tenantId === bağlam` — başka kiracının faturası 404.
- Her geçiş ActivityLog'a düşer (INVOICE_ISSUED/PAID/VOID, SUBSCRIPTION_UPDATED)
  — mesaj kuruş + ₺ biçimli; PII yok.

## 3. Report-before-enforce kullanım politikası

- Kullanım ActivityLog'dan hesaplanır (ayrı sayaç tablosu/kaydırma penceresi yok):
  Prisma `groupBy(type)` son 30 gün + `count` (30g/tüm zaman) + edisyon/kişi sayımı +
  medya baytı `aggregate._sum.sizeKb` — fetch-all YOK.
- Bu uç RAPORLAR, ASLA engellemez: yanıt `enforcement:"REPORT_ONLY"` +
  `softBlocked:false` SABİT. Soft-block yalnız-ilke: deneme kotası
  (trialQuotaBytes, varsayılan 512 MB) aşılsa bile bugün hiçbir akış durdurulmaz;
  ileride ayrı bir kapı (middleware/flow guard) bu raporu tüketerek karar verir.
- Onboarding denetim listesi de aynı ilkeye hizmet eder: sabit 4 adım
  (tenant-created, edition-created, owner-mfa, subscription-active) + `done`
  bayrakları; yanıt sayım dışında PII içermez (e-posta/ad yok).
