# Maven Event Management — Ortak Organizasyonel Mimari

> **Sürüm:** 2.0 · **Durum:** Mimari genel bakış (bu dosya özet niteliğindedir)
> Model düzeyinde tek doğruluk kaynağı `prisma/schema.prisma` dosyasıdır;
> yetki sözlüğü `src/lib/api/permissions.ts`, modül listesi
> `src/lib/constants.ts` (`MODULES`) içindedir. Bu doküman onlarla çelişirse
> kod geçerlidir. (v1.0'daki "20 model / birebir" iddiası 2026-09-28'de
> H-15 kapsamında düzeltilmiştir.)

---

## 1. Mimari Katmanlar

```
┌─────────────────────────────────────────────────────────┐
│  UI KATMANI (SPA /)                                     │
│  27 modül · 7 yaşam-döngüsü grubu · shell + modül       │
│  kayıt noktası: src/lib/module-components.tsx           │
├─────────────────────────────────────────────────────────┤
│  API KATMANI (App Router Route Handlers — 156 route)    │
│  /api/{entity} + /api/{entity}/[id] generic CRUD        │
│  /api/flows (15 iş-aksiyonu) · /api/portal/* (jetonlu)  │
│  /api/public-* (açık) · tenant-guard + dual-read RBAC   │
├─────────────────────────────────────────────────────────┤
│  VERİ KATMANI (Prisma ORM + SQLite)                     │
│  125 model — §3'te aggregate gruplarıyla özetlenir      │
└─────────────────────────────────────────────────────────┘
```

## 2. Organizasyon Yapısı (Hiyerarşi)

```
Tenant (Üst Şirket / Kiracı)
│
├── User (personel) + RoleDefinition/RolePermission/UserRoleAssignment (RBAC)
├── Person / Organization / CustomerContact (şirket CRM havuzu)
│
└── EventSeries ── 1:N ── EventEdition (Etkinlik)
        │                    │
        │                    ├── EventCapability (modül yetenek anahtarları)
        │                    ├── EventParticipation (kişi × etkinlik köprüsü)
        │                    ├── Registration / Order / Payment / Refund
        │                    ├── SponsorTierDefinition/Package/Agreement
        │                    └── Program, Form, Campaign, Hotel, Booth, …
```

Temel ilke (§2): `Person ≠ Participation ≠ Registration ≠ Role ≠ Payment`.

## 3. Domain Modeli (125 Model — Aggregate Özeti)

Tam liste `prisma/schema.prisma` içindedir. Başlıca kümeler:

| Küme | Çekirdek Modeller |
|------|-------------------|
| Foundation/IAM | `Tenant`, `User`, `Passkey`, `OAuthAccount`, `RoleDefinition`, `RolePermission`, `UserRoleAssignment`, `UserInvite`, `ActivityLog` |
| CRM | `Person`, `Organization`, `OrganizationContact`, `CustomerContact`, `CvEntry` |
| Etkinlik İskeleti | `EventSeries`, `EventEdition`, `EventCapability`, `EventOrganizationAssignment` |
| Kayıt | `EventParticipation`, `Registration`, `RegistrationCategory`, `Invitation`, `Entitlement`, `EntitlementClaim`, `WaitlistEntry` |
| Finans | `Order`, `OrderLine`, `Payment`, `Refund`, `Expense`, `Income`, `CatalogItem` |
| Sponsorluk/Fuar | `SponsorTierDefinition`, `SponsorPackage`, `SponsorAgreement`, `Deliverable`, `BoothUnit`, `BoothAllocation` |
| Program/Bilim | `Session`, `Room`, `ProgramAssignment`, `Submission`, `Review`, `CertificateDefinition`, `CertificateIssue` |
| Saha | `BadgeProfile`, `BadgeInstance`, `Credential`, `ScanEvent` |
| İletişim | `Campaign`, `EmailTemplate`, `MailProviderConfig`, `MailSuppression`, `NotificationChannelConfig` |
| Medya/Operasyon | `MediaFolder`, `MediaAsset`, `Task`, `ApiIntegration`, `IntegrationLog`, `DocumentRecord` |

### 3.1 Sözlük Karşılıkları (SQLite: string + `src/lib/constants.ts` sabitleri)

- **Kayıt/katılım:** `EventParticipation.source` — `PUBLIC_FORM|IMPORT|ADMIN_ENTRY|ONSITE_WALK_IN|SPONSOR_PORTAL|…` (`REG_SOURCES`)
- **Sponsorluk durumu (kanonik):** `PROSPECT|NEGOTIATION|CONTRACTED|ACTIVE|COMPLETED|CANCELLED` (kanban bu sözlüğü kullanır)
- **Sponsor tier:** sabit DEĞİL — her etkinlik kendi `SponsorTierDefinition` satırlarını tanımlar (ad, kapasite, fiyat, haklar)
- **Yetki eylemleri:** `VIEW|CREATE|UPDATE|DELETE|EXPORT|APPROVE|MANAGE` (`permissions.ts`)
- **Personel rolleri (§48):** `ORG_OWNER|ORG_ADMIN|EVENT_MANAGER|FINANCE_MANAGER|REGISTRATION_MANAGER|SPONSORSHIP_MANAGER|SCIENTIFIC_MANAGER|PROGRAM_MANAGER|ONSITE_MANAGER` (+ `VIEWER`, `AUDITOR`)

## 4. REST API Sözleşmesi

| Desen | Metotlar | Not |
|-------|----------|-----|
| `/api/{entity}` | GET (liste+filtre), POST (oluştur) | `entity` ∈ registry; GET→VIEW, POST→CREATE |
| `/api/{entity}/[id]` | GET, PUT, DELETE | Next 16: `params` Promise — `await params` |
| `/api/flows` | POST `{ action, … }` | 15 iş-aksiyonu; aksiyon→(entity, action) kapısı (`FLOW_ACTION_POLICY`) |
| `/api/portal/*` | GET/POST | Yetenek-jetonlu sponsor/katılımcı yüzeyi |
| `/api/public-*` | GET/POST | Açık yüzey (kendi hız/önbellek kapılarıyla) |
| `/api/seed` | POST | Yalnız prod-dışı demo verisi (404 prod'da) |

Kimlik/yetki: `MAVEN_AUTH=on` iken middleware oturumsuz API isteğine 401;
route kapıları yetkisize 403. Hata sözleşmesi: `{ error: string }` + uygun
HTTP kodu (400/401/403/404/409/413/500).

## 5. UI Modül Haritası (SPA `/`)

27 modül (`MODULES`; RBAC `MODULE_IDS` 26 — `company-communications` UI-only):
dashboard, operations, archive, editions, settings,
portals, compliance, integrations, people, organizations, communications,
company-communications, registrations, forms, finance, accounting, scientific, program, social,
sponsorship, b2b, floors, media, accommodation, onsite, badges, certificates.

Kayıpsızlık üçlüsü: yeni modül `constants.ts` + `module-components.tsx` +
i18n sözlüklerine birlikte yazılır.

## 6. Kurallar

1. **Model kaynağı şemadır** — yeni alan/model önce `prisma/schema.prisma` +
   `prisma/migrations` göçüyle gelir; doküman özetler, dayatmaz.
2. **Kapsam (tenant) ile yetki (rol) ayrıdır** — `tenant-guard` kimliği/IDOR'u,
   `permissions.ts` dual-read modül/eylem iznini kapatır.
3. API istekleri istemciden **göreli yol** ile yapılır.
4. SQLite kısıtı: enum yerine string + `src/lib/constants.ts` sabitleri.
5. Tüm parasal değerler **`Int` kuruş (F6)** + `TRY` varsayılan para birimi ile
   tutulur; UI major-birim gönderir, sunucu `toMinor` ile normalize eder.
6. Mimari kapılar: `typecheck` + `lint` + `lint:arch` + `i18n:scan` + `test:unit`
   CI'da zorunludur.
