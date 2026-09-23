"use client";
// Maven Event Management — tek sayfa uygulama (SPA)
import { useEffect } from "react";
import { useApp, hasCapability } from "@/lib/store";
import { MODULES } from "@/lib/constants";
import { Shell } from "@/components/maven/shell";
import { EmptyState } from "@/components/maven/bits";
import { DashboardView } from "@/components/maven/views/dashboard";
import { EditionsView } from "@/components/maven/views/editions";
import { PeopleView, OrganizationsView } from "@/components/maven/views/people";
import { RegistrationsView } from "@/components/maven/views/registrations";
import { ScientificView, ProgramView } from "@/components/maven/views/scientific";
import { SponsorshipView } from "@/components/maven/views/sponsorship";
import { AccommodationView } from "@/components/maven/views/accommodation";
import { FinanceView } from "@/components/maven/views/finance";
import { OnsiteView, CertificatesView, CommunicationsView, OperationsView, SettingsView } from "@/components/maven/views/onsite";
import { Lock } from "lucide-react";

export default function Home() {
  const { module, bootstrap, currentEditionId, editions, setModule } = useApp();

  useEffect(() => {
    bootstrap();
     
  }, []);

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
    case "people": return <PeopleView />;
    case "organizations": return <OrganizationsView />;
    case "registrations": return <RegistrationsView />;
    case "scientific": return <ScientificView />;
    case "program": return <ProgramView />;
    case "sponsorship": return <SponsorshipView />;
    case "accommodation": return <AccommodationView />;
    case "finance": return <FinanceView />;
    case "onsite": return <OnsiteView />;
    case "certificates": return <CertificatesView />;
    case "communications": return <CommunicationsView />;
    case "operations": return <OperationsView />;
    case "settings": return <SettingsView />;
    default: return <DashboardView />;
  }
}
