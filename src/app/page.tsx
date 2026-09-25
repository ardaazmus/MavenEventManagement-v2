"use client";
// Maven Event Management — tek sayfa uygulama (SPA)
// P2: modül parçalama — ağır modüller next/dynamic ile ilk boyamadan çıkarılır
// (form-center, portals, media, floors, onsite, badges en ağır paketler); dashboard + editions
// statik kalır (ilk boyama hedefi). Yüklenme anında hafif iskelet gösterilir.
// F-EXP: ?form=<id|slug> → dış paylaşım sayfası (shell'siz form motoru); embed=1 → iframe gömme modu.
import { Suspense, useEffect } from "react";
import type React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useApp, hasCapability } from "@/lib/store";
import { MODULES } from "@/lib/constants";
import { Shell } from "@/components/maven/shell";
import { EmptyState } from "@/components/maven/bits";
import { DashboardView } from "@/components/maven/views/dashboard";
import { EditionsView } from "@/components/maven/views/editions";
import { Loader2, Lock } from "lucide-react";

const ModuleSkeleton = () => (
  <div className="grid min-h-[50vh] place-items-center text-muted-foreground" role="status" aria-label="Modül yükleniyor">
    <div className="flex flex-col items-center gap-2">
      <Loader2 className="size-6 animate-spin text-primary" />
      <p className="text-xs">Modül yükleniyor…</p>
    </div>
  </div>
);

const dyn = (load: () => Promise<{ default: React.ComponentType }>) =>
  dynamic(load, { loading: ModuleSkeleton, ssr: false });

const PeopleView = dyn(() => import("@/components/maven/views/people").then((m) => ({ default: m.PeopleView })));
const OrganizationsView = dyn(() => import("@/components/maven/views/people").then((m) => ({ default: m.OrganizationsView })));
const RegistrationsView = dyn(() => import("@/components/maven/views/registrations").then((m) => ({ default: m.RegistrationsView })));
const ScientificView = dyn(() => import("@/components/maven/views/scientific").then((m) => ({ default: m.ScientificView })));
const ProgramView = dyn(() => import("@/components/maven/views/scientific").then((m) => ({ default: m.ProgramView })));
const SponsorshipView = dyn(() => import("@/components/maven/views/sponsorship").then((m) => ({ default: m.SponsorshipView })));
const FloorsView = dyn(() => import("@/components/maven/views/floors").then((m) => ({ default: m.FloorsView })));
const PortalsView = dyn(() => import("@/components/maven/views/portals").then((m) => ({ default: m.PortalsView })));
const AccommodationView = dyn(() => import("@/components/maven/views/accommodation").then((m) => ({ default: m.AccommodationView })));
const FinanceView = dyn(() => import("@/components/maven/views/finance").then((m) => ({ default: m.FinanceView })));
const FormCenterView = dyn(() => import("@/components/maven/views/form-center").then((m) => ({ default: m.FormCenterView })));
const AccountingView = dyn(() => import("@/components/maven/views/accounting").then((m) => ({ default: m.AccountingView })));
const BadgeQueueView = dyn(() => import("@/components/maven/views/badge-queue").then((m) => ({ default: m.BadgeQueueView })));
const OnsiteView = dyn(() => import("@/components/maven/views/onsite").then((m) => ({ default: m.OnsiteView })));
const CertificatesView = dyn(() => import("@/components/maven/views/onsite").then((m) => ({ default: m.CertificatesView })));
const CommunicationsView = dyn(() => import("@/components/maven/views/onsite").then((m) => ({ default: m.CommunicationsView })));
const OperationsView = dyn(() => import("@/components/maven/views/onsite").then((m) => ({ default: m.OperationsView })));
const SettingsView = dyn(() => import("@/components/maven/views/onsite").then((m) => ({ default: m.SettingsView })));
const SocialView = dyn(() => import("@/components/maven/views/social").then((m) => ({ default: m.SocialView })));
const B2bView = dyn(() => import("@/components/maven/views/b2b").then((m) => ({ default: m.B2bView })));
const MediaArchiveView = dyn(() => import("@/components/maven/views/media").then((m) => ({ default: m.MediaArchiveView })));
const ArchiveView = dyn(() => import("@/components/maven/views/archive").then((m) => ({ default: m.ArchiveView })));
const ApiGatewayView = dyn(() => import("@/components/maven/views/integrations").then((m) => ({ default: m.ApiGatewayView })));
const ComplianceView = dyn(() => import("@/components/maven/views/compliance").then((m) => ({ default: m.ComplianceView })));
const PublicFormPage = dynamic(
  () => import("@/components/maven/public-form").then((m) => ({ default: m.PublicFormPage })),
  { loading: ModuleSkeleton, ssr: false },
) as React.ComponentType<{ idOrSlug: string; embed?: boolean }>;

export default function Home() {
  // F-EXP: ?form= parametresi Suspense sınırıyla okunur (SSR-güvenli, effect'siz)
  return (
    <Suspense fallback={<ModuleSkeleton />}>
      <HomeClient />
    </Suspense>
  );
}

function HomeClient() {
  const { module, bootstrap, currentEditionId, editions, setModule } = useApp();
  const searchParams = useSearchParams();
  const publicFormRef = searchParams.get("form");
  const embedMode = searchParams.get("embed") === "1";

  useEffect(() => {
    bootstrap();

  }, []);

  if (publicFormRef) {
    return <PublicFormPage idOrSlug={publicFormRef} embed={embedMode} />;
  }

  // yetenek kapalıysa modül içeriği yerine açıklama göster (§03 menü ilkesi)
  const mod = MODULES.find((m) => m.id === module);
  const edition = editions.find((e) => e.id === currentEditionId);
  if (mod?.capability && edition && !hasCapability(edition, mod.capability)) {
    return (
      <Shell>
        <div className="grid min-h-[50vh] place-items-center">
          <div className="max-w-md text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
              <Lock className="size-7" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Bu modül {edition.name} için kapalı</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <b>{mod.label}</b> yeteneği bu etkinlikte etkin değil — menüde bu yüzden görünmüyor.
              Açmak için Ayarlar → Yetenekler bölümünü kullanın; navigasyon, formlar ve raporlar birlikte değişir.
            </p>
            <button
              onClick={() => setModule("settings")}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              Yetenekleri yönet →
            </button>
            <div className="mt-3">
              <EmptyState title="Erişim yok" desc="Kapalı yeteneğin menüsü baştan gizlenir." />
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {renderModule(module)}
    </Shell>
  );
}

function renderModule(module: string) {
  switch (module) {
    case "dashboard": return <DashboardView />;
    case "editions": return <EditionsView />;
    case "portals": return <PortalsView />;
    case "people": return <PeopleView />;
    case "organizations": return <OrganizationsView />;
    case "registrations": return <RegistrationsView />;
    case "scientific": return <ScientificView />;
    case "program": return <ProgramView />;
    case "social": return <SocialView />;
    case "b2b": return <B2bView />;
    case "sponsorship": return <SponsorshipView />;
    case "floors": return <FloorsView />;
    case "accommodation": return <AccommodationView />;
    case "finance": return <FinanceView />;
    case "forms": return <FormCenterView />;
    case "accounting": return <AccountingView />;
    case "onsite": return <OnsiteView />;
    case "badges": return <BadgeQueueView />;
    case "certificates": return <CertificatesView />;
    case "communications": return <CommunicationsView />;
    case "operations": return <OperationsView />;
    case "media": return <MediaArchiveView />;
    case "archive": return <ArchiveView />;
    case "integrations": return <ApiGatewayView />;
    case "compliance": return <ComplianceView />;
    case "settings": return <SettingsView />;
    default: return <DashboardView />;
  }
}
