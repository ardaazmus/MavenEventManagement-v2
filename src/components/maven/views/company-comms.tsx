"use client";
// H-08: Şirket İletişimi — etkinlik yeteneğinden bağımsız şirket havuzu.
// Kişi/kurum iletişim kayıtları + dosya içe aktarma + dışa aktarma; kampanya ve
// zamanlanmış gönderimler etkinlik İletişim modülünde kalır (edition-kapsamlı).
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { PageHeader, SectionCard } from "../bits";
import { CustomerDataCard } from "./comms-crm";
import * as Icons from "lucide-react";

export function CompanyCommsView() {
  const { t } = useLang();
  const { bump, setModule } = useApp();

  return (
    <div className="space-y-4">
      <PageHeader title={t("companyComms.title")} desc={t("companyComms.desc")} />

      <CustomerDataCard onContactsChanged={() => bump()} />

      <SectionCard title={t("companyComms.campaignsTitle")} desc={t("companyComms.campaignsDesc")}>
        <Button size="sm" variant="outline" onClick={() => setModule("communications")}>
          <Icons.Megaphone className="size-3.5" /> {t("companyComms.openEditionComms")}
        </Button>
      </SectionCard>
    </div>
  );
}
