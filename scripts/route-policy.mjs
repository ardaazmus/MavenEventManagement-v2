#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

// ─── P04.4: Özel Route Envanteri & Politika Sınıflandırması ───────────────────
// §9 P04.4 gereği tüm API route'ları aşağıdaki 4 sınıftan birine açıkça ait olmalıdır:
//   * PUBLIC:        Dışa açık / oturumsuz erişilebilen uçlar (sağlık, login, public vitrin vb.)
//   * STAFF:         Etkinlik personeli / arka ofis yönetim uçları (yöneticiler, raporlar vb.)
//   * ADMIN:         Üst yönetici / SaaS / Altyapı uçları (ORG_OWNER, ORG_ADMIN, seed vb.)
//   * DOMAIN_POLICY: Özel etki alanı kapıları (Generic CRUD [entity], QR scan, KVKK vb.)

export const CATEGORIES = ["PUBLIC", "STAFF", "ADMIN", "DOMAIN_POLICY"];

export const ROUTE_POLICY_DEFINITIONS = {
  // ── Generic CRUD & Domain Policy Uçları ───────────────────────────────────
  "src/app/api/[entity]/route.ts": {
    category: "DOMAIN_POLICY",
    authRequired: true,
    enforcement: "authorizeEntity(GET:VIEW, POST:CREATE) + applyListGuard/applyWriteGuard",
    description: "Merkezi generic collection CRUD rotası",
  },
  "src/app/api/[entity]/[id]/route.ts": {
    category: "DOMAIN_POLICY",
    authRequired: true,
    enforcement: "authorizeEntity(GET:VIEW, PUT:UPDATE, DELETE:DELETE) + ensureInScope IDOR guard",
    description: "Merkezi generic tekil kayıt CRUD rotası",
  },
  "src/app/api/kvkk/erasure/route.ts": {
    category: "DOMAIN_POLICY",
    authRequired: false,
    enforcement: "GET/PATCH: requireStaff() + preview/hold-checked complete; POST: public anonim silme talebi girişi",
    description: "KVKK unutulma hakkı ve veri silme talepleri",
  },
  "src/app/api/kvkk/dsar/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant scope + audit log + rate-limit + no-store",
    description: "P18.3 kişi verisi dışa aktarımı (JSON/CSV)",
  },
  "src/app/api/editions/[id]/archive/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "POST: requireAdmin() + blockers 409 + dryRun; GET: requireStaff() + tenant scope",
    description: "P18.2 edisyon arşivleme + görüntü okuma",
  },
  "src/app/api/scan/route.ts": {
    category: "DOMAIN_POLICY",
    authRequired: false,
    enforcement: "Normal: public cihaz/yaka doğrulama; forceReason istisnası: operatör oturumu zorunlu (401)",
    description: "Saha yaka kartı / QR okuma ve erişim kontrolü",
  },

  // ── Public Uçlar (Kimliksiz / Portal / Sağlık) ───────────────────────────
  "src/app/api/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Public ping / api bilgisi",
    description: "API kök endpoint",
  },
  "src/app/api/health/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Public izleme / sağlık kontrolü",
    description: "Sistem sağlık durumu",
  },
  "src/app/api/health/liveness/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Public process liveness kontrolü",
    description: "Konteyner liveness kontrolü",
  },
  "src/app/api/health/readiness/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Public db/migration readiness kontrolü",
    description: "Konteyner ve veritabanı readiness kontrolü",
  },
  "src/app/api/auth/login/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Public kimlik doğrulama",
    description: "Kullanıcı girişi",
  },
  "src/app/api/auth/logout/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Public oturum kapatma",
    description: "Oturum sonlandırma",
  },
  "src/app/api/auth/me/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Oturum durumunu kontrol eder (varsa aktör, yoksa anon)",
    description: "Aktif kullanıcı oturum bilgisi",
  },
  "src/app/api/auth/register/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Public hesap oluşturma",
    description: "Yeni kullanıcı kaydı",
  },
  "src/app/api/auth/session/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Public oturum doğrulama",
    description: "Oturum geçerlilik sorgusu",
  },
  "src/app/api/auth/mfa/setup/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Giriş sürecinde mfa-pending oturumuyla TOTP kurulumu",
    description: "MFA TOTP kurulumu",
  },
  "src/app/api/auth/mfa/verify/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Giriş sürecinde TOTP kodu doğrulaması",
    description: "MFA kod doğrulaması",
  },
  "src/app/api/auth/passkeys/options/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Passkey kayıt parametreleri",
    description: "WebAuthn kayıt parametreleri",
  },
  "src/app/api/auth/passkeys/verify/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Passkey kayıt imzası doğrulaması",
    description: "WebAuthn kayıt doğrulama",
  },
  "src/app/api/auth/passkeys/auth/options/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Passkey giriş challenge oluşturma",
    description: "WebAuthn giriş parametreleri",
  },
  "src/app/api/auth/passkeys/auth/verify/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Passkey giriş imzası doğrulaması",
    description: "WebAuthn giriş doğrulama",
  },
  "src/app/api/auth/recovery/use/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Kurtarma kodu doğrulaması",
    description: "Hesap kurtarma kodu kullanımı",
  },
  "src/app/api/public-register/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Açık katılımcı kayıt formu kabulü",
    description: "Halka açık etkinlik kayıt alımı",
  },
  "src/app/api/public/tenant/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Kiracı vitrin bilgisi",
    description: "Açık kiracı ve edisyon marka bilgisi",
  },
  "src/app/api/public-forms/[idOrSlug]/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Dış form okuma ve cevap iletimi",
    description: "Açık form görüntüleme ve yanıtlama",
  },
  "src/app/api/public-forms/[idOrSlug]/results/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Açık oylama / anket sonuçları",
    description: "Form ve anket sonuç paneli",
  },
  "src/app/api/payments/iyzico/callback/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Ödeme sağlayıcı webhook / callback doğrulaması",
    description: "İyzico ödeme bildirim callback'i",
  },
  "src/app/api/payments/iyzico/create/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Ödeme formu başlatma",
    description: "İyzico checkout başlatma",
  },
  "src/app/api/integrations/hook/[token]/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Inbound webhook belirteç kontrolü",
    description: "Dış entegrasyon webhook alıcısı",
  },
  "src/app/api/portal/access/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Portal belirteci doğrulaması",
    description: "Katılımcı portalı erişim doğrulaması",
  },
  "src/app/api/portal/action/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Portal token doğrulamalı katılımcı eylemi",
    description: "Katılımcı portalı etkileşim aksiyonu",
  },
  "src/app/api/portal/analytics/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Portal telemetri kaydı",
    description: "Portal kullanım istatistiği",
  },
  "src/app/api/portal/announcements/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Etkinlik duyuru akışı",
    description: "Katılımcı duyuruları",
  },
  "src/app/api/portal/config/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Portal konfigürasyonu okuma",
    description: "Portal tema ve blok ayarları",
  },
  "src/app/api/portal/content/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Açık portal içerik verisi",
    description: "Etkinlik içerik ve program akışı",
  },
  "src/app/api/portal/game/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Portal oyunlaştırma ve görevler",
    description: "Katılımcı oyun puanları",
  },
  "src/app/api/portal/interact/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Oturum içi canlı etkileşim",
    description: "Canlı anket ve soru-cevap",
  },
  "src/app/api/portal/magic-links/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Sihirli bağlantı e-posta gönderimi",
    description: "Portal sihirli giriş bağlantısı oluşturma",
  },
  "src/app/api/portal/me/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Portal token ile katılımcı profil sorgusu",
    description: "Portal oturum profil bilgisi",
  },
  "src/app/api/portal/participant/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Portal token ile katılımcı rozet/bakiye/cv verisi",
    description: "Katılımcı özel portal paneli",
  },
  "src/app/api/portal/questions/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Konuşmacıya soru iletme",
    description: "Katılımcı soru havuzu",
  },
  "src/app/api/portal/sponsor/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Sponsor portal tokenı ile stand yönetimi",
    description: "Sponsor self-service portalı",
  },
  "src/app/api/portal/leads/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "SPONSOR token kapsamı + rıza maskeli liste + denetimli xlsx + rate-limit",
    description: "P20.2 sponsor lead listesi ve dışa aktarımı",
  },
  "src/app/api/portal/meetings/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "SPONSOR/PARTICIPANT token kapsamı + slot denetimi + rate-limit",
    description: "P20.3 görüşme talepleri",
  },
  "src/app/api/portal/sponsor/roi/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "SPONSOR token kapsamı + canlı agregasyon + rate-limit",
    description: "P20.4 sponsor ROI özeti",
  },
  "src/app/api/portal/wallet/apple/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Apple PKPass ikili çıktısı",
    description: "Apple Wallet cüzdan kartı",
  },
  "src/app/api/portal/wallet/google/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "Google Wallet JWT nesnesi",
    description: "Google Wallet cüzdan kartı",
  },

  // ── Admin Uçları (ORG_OWNER / ORG_ADMIN / SaaS / Altyapı) ─────────────────
  "src/app/api/admin/db-migration/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "Veritabanı migration yönetim arayüzü",
  },
  "src/app/api/bootstrap/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "Sistem başlangıç yapılandırması",
    description: "Varsayılan kiracı ve ortam kurulumu",
  },
  "src/app/api/compliance/documents/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin() / EVENT_MANAGER",
    description: "Uyumluluk ve yasal doküman kasası",
  },
  "src/app/api/compliance/jurisdiction/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "Yargı bölgesi uyumluluk kuralları",
  },
  "src/app/api/compliance/presets/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "Uyumluluk ön ayar tanımları",
  },
  "src/app/api/compliance/report/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "Uyumluluk denetim raporu çıktısı",
  },
  "src/app/api/custom-fields/batch/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "Özel alan tanımlarının toplu güncellenmesi",
  },
  "src/app/api/custom-fields/definitions/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "Özel alan sözlüğü ve tanımları",
  },
  "src/app/api/integrations/run/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "API entegrasyon işini tetikleme",
  },
  "src/app/api/internal/bus-authorize/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "İç servis tokenı / requireAdmin()",
    description: "Canlı haberleşme bus yetkilendirmesi",
  },
  "src/app/api/notifications/channels/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "Bildirim sağlayıcı ve kanal ayarları",
  },
  "src/app/api/portal/blocks/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "Dış portal blok düzenleme",
  },
  "src/app/api/portal/preview-token/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "Portal önizleme belirteci üretimi",
  },
  "src/app/api/portal/sponsor-grants/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin() + resolveEditionContext + single-display + rate-limit",
    description: "P20.1 sponsor erişim izni çıkarımı/liste/iptal",
  },
  "src/app/api/saas/access-review/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "SaaS kiracı erişim ve hak denetimi",
  },
  "src/app/api/saas/onboarding/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "SaaS yeni müşteri onboarding akışı",
  },
  "src/app/api/saas/provision/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "x-maven-saas-key / super-admin key",
    description: "SaaS yeni kiracı oluşturma ve tahsis",
  },
  "src/app/api/saas/subscription/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "SaaS abonelik ve limit yönetimi",
  },
  "src/app/api/saas/uptime-report/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "SaaS servis kesintisizlik raporu",
  },
  "src/app/api/saas/usage/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin()",
    description: "SaaS kaynak kullanım metrikleri",
  },
  "src/app/api/seed/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin() + NON_PROD_GUARD",
    description: "Demo veritabanı tohumlama (yalnız non-prod)",
  },
  "src/app/api/users/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin() + resolveContext server tenant + PII-minimal projection",
    description: "P06.1 salt-okunur kiracı kullanıcı listesi (GET yalnız)",
  },
  "src/app/api/users/invites/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin() + resolveContext server tenant + create rate-limit + one-time token",
    description: "P06.2 davet oluşturma / yeniden gönderme",
  },
  "src/app/api/users/invites/accept/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "single-use token gate + expiry/replay/revoke checks + IP rate-limit 429",
    description: "P06.2 davet kabulü (oturumsuz token akışı)",
  },
  "src/app/api/users/[id]/roles/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin() + effective rank + escalation/last-owner rules + server tenant",
    description: "P06.3 rol/kapsam atama ve geri alma",
  },
  "src/app/api/users/[id]/status/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin() + rank/last-owner rules + sessionVersion bump + server tenant",
    description: "P06.4a kullanıcı devre dışı bırakma / etkinleştirme",
  },
  "src/app/api/exports/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + verifyEditionTenant + rate-limit",
    description: "P14.3b denetimli ihracat talebi",
  },
  "src/app/api/exports/[id]/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin() + resolveContext tenant bind",
    description: "P14.3b ihracat işi onayı/reddi",
  },
  "src/app/api/exports/[id]/file/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "HMAC download token + expiry + hash match + rate-limit + no-store",
    description: "P14.3b jetonlu dosya indirimi",
  },

  // ── Staff Uçları (Etkinlik ve Saha Yönetim Kadrosu) ───────────────────────
  "src/app/api/accounting/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / FINANCE_MANAGER",
    description: "Muhasebe defteri ve bakiye özeti",
  },
  "src/app/api/accounting/export/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / FINANCE_MANAGER",
    description: "Muhasebe dışa aktarım dosyası",
  },
  "src/app/api/badges/print-queue/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / ONSITE_MANAGER",
    description: "Yaka kartı baskı kuyruğu",
  },
  "src/app/api/badges/print-sheet/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / ONSITE_MANAGER",
    description: "Toplu yaka kartı tabaka çıktısı",
  },
  "src/app/api/campaigns/schedule/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "İletişim kampanyası zamanlama",
  },
  "src/app/api/campaigns/send/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Kampanya gönderim tetikleme",
  },
  "src/app/api/campaigns/tick/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / Internal worker",
    description: "Kampanya gönderim kuyruğu işletimi",
  },
  "src/app/api/certificates/print-sheet/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / ONSITE_MANAGER",
    description: "Toplu katılım belgesi tabaka çıktısı",
  },
  "src/app/api/cme/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / SCIENTIFIC_MANAGER",
    description: "CME sürekli tıp eğitimi kredilendirme",
  },
  "src/app/api/cme/report/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / SCIENTIFIC_MANAGER",
    description: "CME katılım ve kredi raporu",
  },
  "src/app/api/customer-contacts/export/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Müşteri rehberi dışa aktarma",
  },
  "src/app/api/customer-contacts/import/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Müşteri rehberi içe aktarma",
  },
  "src/app/api/customer-contacts/import-participants/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Etkinlik katılımcılarını CRM rehberine çekme",
  },
  "src/app/api/dashboard/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Yönetici operasyonel dashboard verisi",
  },
  "src/app/api/floor-studio/plan/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / SPONSORSHIP_MANAGER",
    description: "Yerleşim planı verisi",
  },
  "src/app/api/floor-studio/sync/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / SPONSORSHIP_MANAGER",
    description: "Fuar alanı stand senkronizasyonu",
  },
  "src/app/api/flows/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "İş akış motoru tetikleyicileri",
  },
  "src/app/api/form-fields/reorder/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Form alanı sıralama kaydetme",
  },
  "src/app/api/form-stats/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Form yanıt istatistikleri",
  },
  "src/app/api/form-submissions/[id]/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + ensureInScope",
    description: "Tekil form yanıt detayı",
  },
  "src/app/api/form-submissions/export/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Form yanıtlarını dışa aktarma",
  },
  "src/app/api/mail/send/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Tekil sistem e-postası gönderimi",
  },
  "src/app/api/media/export/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + P14.1 containment (varsayılan .url, flag-gated fetch) + deadline",
    description: "Medya arşivini ZIP olarak paketleme",
  },
  "src/app/api/account/theme/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "session (auth-on) + THEME_COOKIE read/write + tenant default read",
    description: "P15.2 kullanıcı tema tercihi (çerez)",
  },
  "src/app/api/people/directory/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant scope + rate-limit + MERGED-hidden default",
    description: "P16.1 şirket rehberi (kiracı master)",
  },
  "src/app/api/people/event/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + verifyEditionTenant + rate-limit",
    description: "P16.2 etkinlik kişileri (ilişkili)",
  },
  "src/app/api/people/quick-add/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant/edition guards + normalize/dedupe + rate-limit",
    description: "P16.3 hızlı ekleme (aday kararı)",
  },
  "src/app/api/people/attach/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + verifyEditionTenant + tenant person check + rate-limit",
    description: "P16.2 etkinliğe ekle/çıkar (ilişki-only)",
  },
  "src/app/api/comms/templates/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant scope + rate-limit + 500KB cap",
    description: "P17.1 şirket şablon kütüphanesi liste/oluştur",
  },
  "src/app/api/comms/templates/[id]/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant ownership + version bump + rate-limit",
    description: "P17.1 kütüphane şablon bakımı",
  },
  "src/app/api/comms/consents/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant scope + normalize/upsert + IYS queue + rate-limit",
    description: "P17.2 rıza kaydı/sorgusu",
  },
  "src/app/api/comms/send-decisions/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant scope + read-only + rate-limit",
    description: "P17.2 gönderim kararı denetimi",
  },
  "src/app/api/admin/iys/drain/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin() + provider resolve + rate-limit",
    description: "P17.3 İYS kuyruk tarama",
  },
  "src/app/api/admin/iys/reconcile/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin() + tenant scope + rate-limit",
    description: "P17.3 İYS mutabakatı",
  },
  "src/app/api/admin/outbox/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin() + tenant scope + redacted payload + rate-limit",
    description: "P22.5 outbox operasyon listesi/iadesi",
  },
  "src/app/api/admin/outbox/drain/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin() + lease claim + signed dispatch + rate-limit",
    description: "P22.2 outbox tarama işçisi",
  },
  "src/app/api/promo/assets/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant scope + hash/version + rate-limit",
    description: "P19.1 varlık kütüphanesi liste/oluştur",
  },
  "src/app/api/promo/assets/[id]/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant ownership + version bump + rate-limit",
    description: "P19.1 varlık bakımı",
  },
  "src/app/api/promo/refs/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + verifyEditionTenant + ref-only + rate-limit",
    description: "P19.2 edisyon varlık referansları",
  },
  "src/app/api/promo/utm-terms/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant scope + slug normalize + rate-limit",
    description: "P19.4 UTM sözlüğü",
  },
  "src/app/api/promo/utm-links/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant scope + strict validate + usage + rate-limit",
    description: "P19.4 UTM kurucu",
  },
  "src/app/api/promo/usage/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant scope + rate-limit",
    description: "P19.4 kullanım analitiği",
  },
  "src/app/api/campaigns/approval/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "request: requireStaff(); approve/reject: requireAdmin() + four-eyes + rate-limit",
    description: "P19.3 kampanya onay akışı",
  },
  "src/app/api/admin/theme/route.ts": {
    category: "ADMIN",
    authRequired: true,
    enforcement: "requireAdmin() + tenant scope + brand contrast gate + rate-limit",
    description: "P15.2/P15.3 kiracı varsayılan teması + marka rengi",
  },
  "src/app/api/media/export-jobs/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + verifyEditionTenant + rate-limit + Idempotency-Key → 202",
    description: "P14.3 asenkron medya iş talebi",
  },
  "src/app/api/media/export-jobs/[id]/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant-scoped getMediaJob/cancelMediaJob + rate-limit",
    description: "P14.3 medya iş durum/ilerleme + iptal",
  },
  "src/app/api/media/export-jobs/[id]/token/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant scope + SUCCEEDED-only + rate-limit",
    description: "P14.4 imzalı indirme jetonu verilişi",
  },
  "src/app/api/media/export-jobs/[id]/file/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "HMAC download token + expiry + hash match + trusted-only zip + rate-limit + no-store",
    description: "P14.4 jetonlu güvenilir medya arşivi indirimi",
  },
  "src/app/api/media/system-folders/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Medya sistemi varsayılan dizinleri",
  },
  "src/app/api/media/upload-linked/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Varlıkla ilişkili medya yükleme",
  },
  "src/app/api/notifications/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Sistem içi bildirim listesi",
  },
  "src/app/api/notifications/channels/reports/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Bildirim teslimat raporları",
  },
  "src/app/api/notifications/instant/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Anlık bildirim gönderme",
  },
  "src/app/api/organizations/[id]/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + ensureInScope",
    description: "Kurum detay ve düzenleme",
  },
  "src/app/api/organizations/[id]/vcard/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + ensureInScope",
    description: "Kurum vCard kartvizit çıktısı",
  },
  "src/app/api/payments/[id]/process/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / FINANCE_MANAGER",
    description: "Ödeme işlemi manüel tetikleme",
  },
  "src/app/api/people/[id]/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + ensureInScope",
    description: "Kişi detay ve düzenleme",
  },
  "src/app/api/people/[id]/vcard/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + ensureInScope",
    description: "Kişi vCard kartvizit çıktısı",
  },
  "src/app/api/people/duplicates/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Mükerrer kişi kayıtları tespiti",
  },
  "src/app/api/people/merge-preview/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff()",
    description: "Kişi birleştirme önizlemesi",
  },
  "src/app/api/program/import/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / PROGRAM_MANAGER",
    description: "Program takvimini içe aktarma",
  },
  "src/app/api/reconciliation/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / FINANCE_MANAGER",
    description: "Finansal banka mutabakat arayüzü",
  },
  "src/app/api/registrations/approval-mail/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / REGISTRATION_MANAGER",
    description: "Kayıt onay e-postası gönderimi",
  },
  "src/app/api/registrations/export/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / REGISTRATION_MANAGER",
    description: "Kayıt listesini dışa aktarma",
  },
  "src/app/api/registrations/import/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / REGISTRATION_MANAGER",
    description: "Kayıtları toplu içe aktarma",
  },
  "src/app/api/registrations/manual/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / REGISTRATION_MANAGER",
    description: "Manüel kayıt oluşturma",
  },
  "src/app/api/reservations/export/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / ACCOMMODATION_MANAGER",
    description: "Konaklama rezervasyonlarını dışa aktarma",
  },
  "src/app/api/reservations/import/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / ACCOMMODATION_MANAGER",
    description: "Konaklama rezervasyonlarını içe aktarma",
  },
  "src/app/api/reservations/manual/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / ACCOMMODATION_MANAGER",
    description: "Manüel konaklama rezervasyonu oluşturma",
  },
  "src/app/api/room-stock/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / ACCOMMODATION_MANAGER",
    description: "Otel oda blok ve kontenjan durumu",
  },
  "src/app/api/waitlist/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() / REGISTRATION_MANAGER",
    description: "Kapasite aşımı yedek liste yönetimi",
  },
  "src/app/api/analytics/funnel/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + verifyEditionTenant + rate-limit",
    description: "P21.1 kayıt→ödeme→giriş hunisi",
  },
  "src/app/api/analytics/cohorts/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant scope + rate-limit",
    description: "P21.2 kohort / tekrar katılımı",
  },
  "src/app/api/analytics/segments/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + verifyEditionTenant + rate-limit",
    description: "P21.3 segment + RFM + gelir",
  },
  "src/app/api/analytics/cockpit/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + verifyEditionTenant + rate-limit + denetimli xlsx",
    description: "P21.4 düzenleyici kokpiti + dışa aktarım",
  },
  "src/app/api/analytics/templates/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + rate-limit + read-only",
    description: "P21.4 BI SQL şablonları",
  },
  "src/app/api/analytics/benchmark/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() ya da SPONSOR token kapsamı + K-anonimlik + rate-limit",
    description: "P21.4 sponsor benchmark kıyası",
  },
  "src/app/api/analytics/catalog/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + rate-limit + read-only",
    description: "P21.1 metrik kataloğu",
  },
  "src/app/api/analytics/portfolio/route.ts": {
    category: "STAFF",
    authRequired: true,
    enforcement: "requireStaff() + tenant scope + açık kur girdisi + rate-limit",
    description: "P21.3 portföy analitiği",
  },
  "src/app/api/portal/availability/route.ts": {
    category: "PUBLIC",
    authRequired: false,
    enforcement: "SPONSOR yazma kapsamı + PARTICIPANT okuma + rate-limit",
    description: "P20.3 görüşme uygunluk pencereleri",
  },
};

function walkDir(dir, filterFn) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walkDir(full, filterFn));
    } else if (!filterFn || filterFn(entry.name, full)) {
      files.push(full.replace(/\\/g, "/"));
    }
  }
  return files;
}

export function validateAndGenerateReport() {
  const rootDir = process.cwd().replace(/\\/g, "/");
  const apiDir = path.resolve("src/app/api");
  const discoveredRoutes = walkDir(apiDir, (name) => name === "route.ts" || name === "route.js")
    .map((f) => f.replace(rootDir + "/", ""))
    .sort();

  const unclassified = [];
  const reportRoutes = [];
  const categoryCounts = {
    PUBLIC: 0,
    STAFF: 0,
    ADMIN: 0,
    DOMAIN_POLICY: 0,
  };

  for (const routePath of discoveredRoutes) {
    const policy = ROUTE_POLICY_DEFINITIONS[routePath];
    if (!policy) {
      unclassified.push(routePath);
    } else {
      categoryCounts[policy.category] = (categoryCounts[policy.category] || 0) + 1;
      reportRoutes.push({
        path: routePath,
        category: policy.category,
        authRequired: policy.authRequired,
        enforcement: policy.enforcement,
        description: policy.description,
      });
    }
  }

  const report = {
    totalDiscovered: discoveredRoutes.length,
    totalClassified: reportRoutes.length,
    unclassifiedCount: unclassified.length,
    categoryCounts,
    unclassifiedRoutes: unclassified,
    routes: reportRoutes,
  };

  const reportPath = path.resolve("artifacts/route-policy-report.json");
  const dir = path.dirname(reportPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/route-policy.mjs")) {
  const report = validateAndGenerateReport();
  console.log(`P04.4 - Route Policy Raporu Üretildi: ${report.totalClassified}/${report.totalDiscovered} sınıflandırıldı.`);
  console.log("Kategori Dağılımı:", report.categoryCounts);
  if (report.unclassifiedCount > 0) {
    console.error(`HATA: ${report.unclassifiedCount} rota sınıflandırılamadı!`, report.unclassifiedRoutes);
    process.exit(1);
  }
  console.log("Tüm rotalar başarıyla sınıflandırıldı (CI PASS).");
}
