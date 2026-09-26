"use client";
// MODÜL BİLEŞEN HARİTASI — "yeni özellik eklenince tüm kod yapısı etkileniyor" sorununa
// mimari çözüm (UI-AKIS 2026). Modül → bileşen bağı TEK NOKTADAN yönetilir:
//   1) src/lib/constants.ts MODULES  → modül tanımı (grup, yetenek, ROL, ikon, sıra)
//   2) bu dosya                      → modül bileşeni (dinamik import + kod bölme)
//   3) i18n modules.<id>             → görünen ad (tr/en)
// Nav menüsü, yetenek kilidi, rol filtresi, kayıpsızlık testi bu iki kaynaktan OTOMATİK
// türetilir — yeni modül eklemek nav/kilit/rol/test kodlarına DOKUNMAYI gerektirmez.
// Ağır modüller next/dynamic ile ilk boyamadan çıkarılır (P2: kod bölme korunur);
// dashboard + editions statik kalır (ilk boyama hedefi).
import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import { DashboardView } from "@/components/maven/views/dashboard";
import { EditionsView } from "@/components/maven/views/editions";

const ModuleSkeleton = () => (
  <div className="grid min-h-[50vh] place-items-center text-muted-foreground" role="status" aria-label="Modül yükleniyor">
    <div className="flex flex-col items-center gap-2">
      <svg className="size-6 animate-spin text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" className="opacity-75" />
      </svg>
      <p className="text-xs">Modül yükleniyor…</p>
    </div>
  </div>
);

const dyn = (load: () => Promise<{ default: ComponentType }>): ComponentType =>
  dynamic(load, { loading: ModuleSkeleton, ssr: false });

export const MODULE_COMPONENTS: Record<string, ComponentType> = {
  dashboard: DashboardView,
  editions: EditionsView,
  portals: dyn(() => import("@/components/maven/views/portals").then((m) => ({ default: m.PortalsView }))),
  people: dyn(() => import("@/components/maven/views/people").then((m) => ({ default: m.PeopleView }))),
  organizations: dyn(() => import("@/components/maven/views/people").then((m) => ({ default: m.OrganizationsView }))),
  registrations: dyn(() => import("@/components/maven/views/registrations").then((m) => ({ default: m.RegistrationsView }))),
  scientific: dyn(() => import("@/components/maven/views/scientific").then((m) => ({ default: m.ScientificView }))),
  program: dyn(() => import("@/components/maven/views/scientific").then((m) => ({ default: m.ProgramView }))),
  social: dyn(() => import("@/components/maven/views/social").then((m) => ({ default: m.SocialView }))),
  b2b: dyn(() => import("@/components/maven/views/b2b").then((m) => ({ default: m.B2bView }))),
  sponsorship: dyn(() => import("@/components/maven/views/sponsorship").then((m) => ({ default: m.SponsorshipView }))),
  floors: dyn(() => import("@/components/maven/views/floors").then((m) => ({ default: m.FloorsView }))),
  accommodation: dyn(() => import("@/components/maven/views/accommodation").then((m) => ({ default: m.AccommodationView }))),
  finance: dyn(() => import("@/components/maven/views/finance").then((m) => ({ default: m.FinanceView }))),
  forms: dyn(() => import("@/components/maven/views/form-center").then((m) => ({ default: m.FormCenterView }))),
  accounting: dyn(() => import("@/components/maven/views/accounting").then((m) => ({ default: m.AccountingView }))),
  onsite: dyn(() => import("@/components/maven/views/onsite").then((m) => ({ default: m.OnsiteView }))),
  badges: dyn(() => import("@/components/maven/views/badge-queue").then((m) => ({ default: m.BadgeQueueView }))),
  certificates: dyn(() => import("@/components/maven/views/onsite").then((m) => ({ default: m.CertificatesView }))),
  communications: dyn(() => import("@/components/maven/views/onsite").then((m) => ({ default: m.CommunicationsView }))),
  operations: dyn(() => import("@/components/maven/views/onsite").then((m) => ({ default: m.OperationsView }))),
  media: dyn(() => import("@/components/maven/views/media").then((m) => ({ default: m.MediaArchiveView }))),
  archive: dyn(() => import("@/components/maven/views/archive").then((m) => ({ default: m.ArchiveView }))),
  integrations: dyn(() => import("@/components/maven/views/integrations").then((m) => ({ default: m.ApiGatewayView }))),
  compliance: dyn(() => import("@/components/maven/views/compliance").then((m) => ({ default: m.ComplianceView }))),
  settings: dyn(() => import("@/components/maven/views/onsite").then((m) => ({ default: m.SettingsView }))),
};

export function renderModuleComponent(moduleId: string): ComponentType {
  return MODULE_COMPONENTS[moduleId] ?? DashboardView;
}
