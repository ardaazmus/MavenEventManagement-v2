# Implementation Plan: Kademeli Etkinlik Kurulum Rehberi / Setup Checklist (F-07)

**Branch**: `main`  
**Feature**: F-07 / Feature 005

---

## 1. Mimari Tasarım

### A. Kurulum Checklist Hesaplama Motoru (`src/lib/events/setup-checklist.ts`)
- Fonksiyon: `computeEditionSetupChecklist(editionId: string, prismaClient?: PrismaClient)`
- Veri Kaynakları:
  - `edition`: name, startDate, endDate, logoUrl, headerImageUrl, description, isPublished, portalHeaderTitle, portalHeaderImageUrl
  - `orgAssignments`: `EventOrganizationAssignment` (özellikle `CLIENT`, `EVENT_OWNER`, `HOST`)
  - `staffAssignments`: `EventRoleAssignment` (edisyon bazlı kullanıcı rolleri)
  - `categories`: `RegistrationCategory` (kategori sayısı, ödeme talimatları)
  - `sessions`: `ProgramSession` (oturum sayısı)
  - `readiness`: `readinessCheck` sonuçları (blockers, warnings)
- Checklist Adımları (`ChecklistStep`):
  1. `BASICS` (Kimlik & Görsel):
     - Şart: `logoUrl` veya `headerImageUrl` veya `description` mevcut.
     - Modül: `editions` / `settings`
  2. `STAKEHOLDER` (Müşteri / Düzenleyen Kurum):
     - Şart: En az 1 `orgAssignment` (CLIENT, EVENT_OWNER veya HOST rolünde).
     - Modül: `people`
  3. `STAFF` (Operasyon Ekibi):
     - Şart: En az 1 kullanıcı atanmış veya tenant admini mevcut.
     - Modül: `team`
  4. `REGISTRATION` (Kayıt Kategorisi):
     - Şart: En az 1 `RegistrationCategory`.
     - Modül: `registrations`
  5. `PROGRAM` (Program & Oturumlar):
     - Şart: En az 1 `ProgramSession` veya capability kapalıysa OPTIONAL.
     - Modül: `program`
  6. `PORTAL` (Dış Portal Görünümü):
     - Şart: `portalHeaderTitle` veya `portalHeaderImageUrl` tanımlı.
     - Modül: `portals`
  7. `PUBLISH` (Yayın Hazırlığı):
     - Şart: `blockers.length === 0` ve `isPublished === true`.
     - Modül: `editions`
- Çıktı Yapısı (`SetupChecklistResult`):
  - `steps`: Step[] (key, title, description, status, required, targetModule, actionLabel)
  - `completedCount`: number
  - `totalRequired`: number
  - `percent`: number
  - `nextStep`: Step | null
  - `isReadyForPublish`: boolean

### B. API Uç Noktası (`src/app/api/editions/[id]/setup-checklist/route.ts`)
- `GET`:
  - `requireStaff()` yetki denetimi.
  - `resolveEditionContext(params.id, { required: true })` kiracı izolasyonu.
  - `computeEditionSetupChecklist(id)` çağrısı.
  - JSON yanıt döner.

### C. Route Policy & Envanter
- `scripts/route-policy.mjs` içinde:
  - `"src/app/api/editions/[id]/setup-checklist/route.ts"`:
    `category: "STAFF"`, `authRequired: true`, `enforcement: "requireStaff() + resolveEditionContext"`, `description: "F-07 kademeli etkinlik kurulum checklist değerlendirmesi"`

### D. UI Bileşeni (`src/components/maven/views/setup-checklist-card.tsx` & `editions.tsx`)
- `SetupChecklistCard`:
  - İlerleme çubuğu (% tamamlanma).
  - Adım listesi (tamamlananlar yeşil tik, bekleyenler yönlendirici buton ve açıklama metni).
  - Modül sıçrama eylemleri (`setModule(targetModule)`).

---

## 2. Risk & Regresyon Önlemleri
- Node test runner ESM uyumluluğu için `computeEditionSetupChecklist` lazy prisma resolver ile desteklenecek.
- Mevcut 3 adımlı sihirbaz akışı hızlı kalacak, bozulmayacak.
- Tüm 6 kalite kapısı (%100) korunacak.
