# Implementation Plan: Rol ve Paydaş Esnekliği (F-06 & CONTEXT.md)

**Branch**: `main`  
**Feature**: F-06 / Feature 004

---

## 1. Mimari Tasarım

### A. Kurum Event Rol Modülü (`src/lib/organization-roles.ts`)
- Standart semantik roller (`StandardOrgRole`):
  `HOST`, `EVENT_OWNER`, `CLIENT`, `PCO`, `CO_ORGANIZER`, `SCIENTIFIC_OWNER`, `PUBLIC_AUTHORITY`, `SUPPORTER`, `SPONSOR`, `EXHIBITOR`, `VENUE`, `HOTEL`, `SUPPLIER`, `MEDIA_PARTNER`, `ACADEMIC_PARTNER`, `ASSOCIATION`, `WORKSHOP_SPONSOR`.
- Rol Kategorileri (`OrgRoleCategory`):
  - `COMMISSIONER`: `CLIENT`, `EVENT_OWNER`
  - `ORGANIZER`: `HOST`, `PCO`, `CO_ORGANIZER`, `SCIENTIFIC_OWNER`
  - `PARTNER`: `SUPPORTER`, `ASSOCIATION`, `ACADEMIC_PARTNER`, `PUBLIC_AUTHORITY`, `MEDIA_PARTNER`
  - `COMMERCIAL`: `SPONSOR`, `EXHIBITOR`, `WORKSHOP_SPONSOR`
  - `FACILITY`: `VENUE`, `HOTEL`, `SUPPLIER`
- Yardımcı Fonksiyonlar:
  - `isValidOrgRole(role: string): boolean`
  - `getOrgRoleCategory(role: string): OrgRoleCategory`
  - `resolveOrgRoleDisplay(role: string, customLabel?: string | null): string`
  - `parseOrgRoleMetadata(notes?: string | null): { customLabel?: string; priority?: number; isClientStakeholder?: boolean }`
  - `serializeOrgRoleMetadata(baseNotes: string | null | undefined, meta: { customLabel?: string; priority?: number; isClientStakeholder?: boolean }): string`

### B. Portal Belirteç Kapsamı Genişletme (`src/lib/api/portal-tokens.ts`)
- `export type PortalTokenScope = "PARTICIPANT" | "SPONSOR" | "CLIENT";`
- Mevcut `issuePortalToken`, `validatePortalToken` ve `touchToken` işlevleri doğrudan yeni `"CLIENT"` kapsamı ile uyumlu çalışır.

### C. Müşteri (Client) Portal API Uç Noktası (`src/app/api/portal/client/route.ts`)
- `GET`:
  - `extractToken(req)` ile ham jetonu alır, `validatePortalToken` ile hash doğrulaması yapar.
  - `check.token.scope !== "CLIENT"` ise 403 döner.
  - Edisyon ve Kurum bilgilerini çeker.
  - İcra / İdare Özet Metrikleri (Executive Overview):
    - `edition`: id, name, editionLabel, status, startDate, endDate, city, venueName, description, logoUrl, coverColor.
    - `organization`: id, name, type, city, website, customLabel.
    - `metrics`:
      - `confirmedRegistrationsCount`: onaylı kayıt sayısı.
      - `pendingRegistrationsCount`: onay bekleyen kayıt sayısı.
      - `totalSessionsCount`: planlanan oturum sayısı.
      - `activeSponsorsCount`: aktif sponsor anlaşması sayısı.
    - **Güvenlik & İzolasyon**: İç finansal marjlar, tedarikçi maliyetleri, ham kullanıcı şifreleri/hash'leri ve personel iç notları yanıtta ASLA yer almaz.

### D. Müşteri (Client) Portal Grants API Uç Noktası (`src/app/api/portal/client-grants/route.ts`)
- `POST`:
  - `requireAdmin()` + `resolveEditionContext` + rate limit.
  - Hedef kurumun edisyonda rolü (`EventOrganizationAssignment`) olduğunu veya kiracıya ait olduğunu doğrular.
  - `issuePortalToken({ scope: "CLIENT", editionId, organizationId, ttlMs, issuedBy: "ADMIN" })` çağırır.
  - `ActivityLog` kaydı üretir (`ActivityType.ORG_ASSIGNMENT` veya `PORTAL_GRANT`).
  - Single-display ham jetonu döner.
- `GET`:
  - `requireAdmin()` + `resolveEditionContext`.
  - `PortalToken` tablosundan `scope: "CLIENT"` olanları listeler (tokenHash gizli tutulur).
- `DELETE`:
  - `requireAdmin()` + `resolveEditionContext`.
  - `revokedAt = new Date()` ile belirteci iptal eder.

### E. Route Policy & Quality Envanteri
- `scripts/route-policy.mjs` dosyasına:
  - `src/app/api/portal/client/route.ts` -> `PUBLIC` (token korumalı dış portal)
  - `src/app/api/portal/client-grants/route.ts` -> `ADMIN` (yönetici izin yönetimi)
- Git tracking: `git add` ile yeni rotalar git indeksine kaydedilir.

---

## 2. Risk & Regresyon Önlemleri
- Node test runner ESM uyumluluğu için `organization-roles.ts` bağımsız ve saf (pure functions) tutulacak.
- Route policy 167/167 tam kapsam kontrolü yapılacak.
- Hiçbir mevcut `PARTICIPANT` veya `SPONSOR` testi bozulmayacak.
