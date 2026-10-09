# UI/UX, Information Architecture and External Experiences

## 1. Design direction

Use the supplied references for quality principles only:

- narrow global icon rail;
- contextual secondary navigation;
- strong typographic hierarchy;
- neutral, spacious surfaces;
- restrained semantic color;
- compact, meaningful metadata;
- one obvious primary action per screen;
- real empty, loading, error and permission states.

Do not copy their labels, product structure or use Kanban where the Maven workflow does not require it. Avoid gradients used as decoration, glass effects, arbitrary card grids, excessive badges, generic AI copy and technical keys in user-visible text.

## 2. Product shells

### 2.1 Firma B global shell

After login:

- global rail: Home/Works, Portfolio, Communication, Reports, Settings, Help;
- top bar: tenant identity, global search/command, notifications, language, profile;
- main content defaults to Jobs and Organizations.

No work module list appears until a work is opened.

### 2.2 Work shell

After selecting Su Fuarı:

- global rail remains;
- contextual sidebar shows work identity and workflow sections;
- top context shows work status, date/location, responsible team and quick switch;
- main content defaults to Work Summary.

### 2.3 External shells

General mobile, personal area, B2B, partner and travel experiences have their own navigation and information density. They do not reuse the desktop admin sidebar.

## 3. Firma B home

### Required zones

1. Header: `İşler ve Organizasyonlar`, search, filter, view toggle, `Yeni İş`.
2. Lifecycle filters: Active, Planning, Attention, Completed, Archived; counts are access-filtered.
3. Work cards/list.
4. Optional tenant alerts: pending approvals, overdue tasks, expiring documents, failed sends/integrations.
5. Empty state with a guided first-work action.

### Work card

- header visual or typographic identity; logo optional;
- name, type and profile;
- lifecycle/status and publication/external-experience state;
- dates, location/timezone;
- client/organizer and custom visible label;
- Firma B responsible staff/department;
- active module summary;
- key operational counters appropriate to work type;
- pending decision/open task indicator;
- last activity;
- actions: Open, Continue setup, Settings, Archive according to permission.

Do not show raw capability keys such as `ACCESS_CONTROL` to ordinary users.

## 4. Work Summary

The first work screen is a grouped decision cockpit, not a wall of generic KPIs.

Groups:

- Work health: lifecycle, setup completion, blockers, publication.
- People and registration: only when active.
- Program/scientific: only when active.
- Sponsor/exhibition: only when active.
- Finance: permission-filtered and period-aware.
- Accommodation/travel/services: only when active.
- Onsite/live operations: time-aware; historical works show final outcomes.
- Pending approvals and tasks.
- Recent activity.

Archived work defaults to final/historical summaries, not “today/live” language. Every metric names its scope, period, data freshness and destination drill-down.

## 5. Contextual work navigation

For Su Fuarı:

```text
İş Yönetimi
  İş Özeti
  Kurulum Kontrol Listesi
  İş Bilgileri
  Müşteri ve Düzenleyen
  Ekip ve Yetkiler
  Görevler ve Onaylar

Kişiler ve Kayıt
  Kişiler ve Kurumlar
  Katılımcılar
  Kategoriler ve Haklar
  Formlar
  Onay Merkezi
  İçe / Dışa Aktarım

Program ve İçerik
  Bilimsel
  Program
  Sosyal ve Tur Planı

Sponsor ve Fuar
  Sponsorlar
  Paketler ve Anlaşmalar
  Haklar ve Teslimatlar
  Stantlar / Floor Studio
  B2B

Mekân ve Saha
  Mekânlar ve Alanlar
  Saha Operasyonu
  Yaka Kartları
  Belgeler

Konaklama ve Hizmetler
  Konaklama
  Seyahat ve Transfer
  Ek Hizmetler

İletişim ve Deneyim
  İş İletişimi
  Dış Deneyimler
  Medya

Raporlar
İş Ayarları
```

Only entitled, tenant-active, work-active and actor-visible entries render. Group order stays stable so added modules do not reorganize the whole product.

## 6. New-work wizard

Short creation wizard:

1. Work group: Event/Organization, Travel/Customer Work, Custom.
2. Work type/template.
3. Basic identity: name, dates/timezone, place or travel period.
4. `Who is this work for?` shown only for client work; choose/create person/organization and display label.
5. Profile: individual/group, VIP/standard, public/private, own/client work.
6. Recommended modules within Firma A entitlement and Firma B activation; Firma B can adjust.
7. Responsible staff/department; one-person tenants default to the owner.
8. Review and create draft.

After creation, open a setup checklist rather than extending the wizard indefinitely. Each step has one-sentence helper text, an example and `Why this matters` detail. Drafts autosave with visible status.

## 7. Settings separation

### Tenant Settings

- Firma B identity, address, authorized contact, website, logo and brand.
- default language/timezone/currency.
- staff, departments, custom role names and policy bundles.
- module activation within Firma A entitlement.
- portfolio, communication, consent, integrations and global templates.

### Work Settings

- work identity and branding, including mandatory name and optional logo/header;
- lifecycle, dates, venue/travel context;
- client/organizer relationships and custom public labels;
- active modules, setup status and module-specific settings;
- work team and permission overrides;
- external experiences and publication.

### Platform Settings

Separate future Firma A module: tenants, entitlements, subscriptions, platform policies, operations and audit. Firma B never sees platform secrets, deployment or global infrastructure controls.

## 8. External experience matrix

| Surface | Entry | Identity strength | Typical content/actions |
|---|---|---|---|
| General Event Mobile | public URL or event code | anonymous/shared | public program, sponsors, map, announcements, public quiz/evaluation, help |
| Personal Participant | magic link/OTP/passkey-equivalent | verified person | own registration, QR/badge, hotel/transfer, duties, rights, notifications |
| B2B | personal area plus entitlement | verified + capability | own meetings, availability, requests and permitted directory |
| External Partner | partner invitation/session | verified partner principal | own candidates, guests, quotas, deliverables, seating drafts, leads according to grants |
| Customer Travel | customer invitation/session | verified customer/traveler | approved itinerary, bookings, documents, services, messages and allowed costs |

## 9. Mobile-native quality

- task-focused home, not compressed desktop administration;
- bottom navigation limited to 3–5 primary destinations;
- contextual top bar and full-screen subflows;
- 44px minimum interactive targets;
- safe-area support, keyboard-safe forms and readable 200% zoom/reflow;
- skeletons only when duration is uncertain; otherwise immediate content or clear progress;
- offline status, queued action, conflict and retry states with plain language;
- no irreversible optimistic updates for approval, quota, payment, credentials or seating;
- push/install prompts appear after value is demonstrated, not at first load;
- sharing a device cannot expose the previous user's personal data.

## 10. Accessibility acceptance

- logical landmarks and heading order;
- full keyboard navigation and visible focus;
- labels/instructions/errors associated programmatically;
- status changes announced without color-only meaning;
- table/grid alternatives and mobile reflow;
- contrast checked for tenant-custom colors before save;
- reduced-motion support;
- screen-reader names for cards, icon buttons, charts and status badges;
- error recovery preserves entered data;
- automated axe plus manual keyboard/screen-reader spot checks.

## 11. Evidence limitation

The roadmap used the user-provided current screen and two visual references plus source inspection. A fresh interactive capture could not be attached because the in-app computer-use runtime failed during sandbox initialization. Therefore implementation must include a new desktop/mobile flow capture before UI acceptance; this document does not claim current live-flow accessibility compliance.
