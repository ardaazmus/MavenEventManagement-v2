"use client";
import React, { useState } from "react";
import { useApp } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import { TenantIdentityCard, LanguageCard } from "./onsite";
import { UserAdminCard } from "./user-admin-card";
import { ExportHubCard } from "./export-hub-card";
import { AnnounceAdminCard } from "./announce-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TEMPLATES, CAPABILITIES } from "@/lib/constants";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

export function CompanySettingsView({ initialTab = "profile" }: { initialTab?: string }) {
  const { tenant, editions, currentEditionId, setModule, moduleSubView } = useApp();
  const { t } = useLang();
  const [prevSubView, setPrevSubView] = useState(moduleSubView);
  const [activeTab, setActiveTab] = useState(initialTab);

  if (moduleSubView !== prevSubView) {
    setPrevSubView(moduleSubView);
    if (moduleSubView) {
      if (moduleSubView === "modules") {
        setActiveTab("modules");
      } else if (moduleSubView === "comms-consents" || moduleSubView === "comms-consent") {
        setActiveTab("comms-consent");
      } else if (moduleSubView === "integrations" || moduleSubView === "compliance" || moduleSubView === "integrations-compliance") {
        setActiveTab("integrations-compliance");
      } else if (["profile", "staff-teams", "departments", "roles-access", "templates"].includes(moduleSubView)) {
        setActiveTab(moduleSubView);
      }
    }
  }

  const currentEdition = editions.find((e) => e.id === currentEditionId);

  const departments = [
    {
      id: "congress",
      name: "Kongre & Organizasyon Departmanı",
      head: "Başak Yılmaz (Direktör)",
      membersCount: 8,
      activeJobsCount: editions.filter((e) => e.template === "SCIENTIFIC_CONGRESS").length,
      desc: t("companySettings.deptCongressDesc"),
    },
    {
      id: "fairs",
      name: "Fuar & Sergi Departmanı",
      head: "Emre Kaya (Fuar Direktörü)",
      membersCount: 6,
      activeJobsCount: editions.filter((e) => e.template === "TRADE_FAIR").length,
      desc: t("companySettings.deptFairsDesc"),
    },
    {
      id: "corporate",
      name: "Kurumsal & Müşteri Seyahati Departmanı",
      head: "Selin Demir (Müşteri İlişkileri Lideri)",
      membersCount: 5,
      activeJobsCount: editions.filter((e) => Boolean(e.template && ["CORPORATE_EVENT", "TRAVEL_GROUP"].includes(e.template))).length,
      desc: t("companySettings.deptCorporateDesc"),
    },
    {
      id: "operations",
      name: "Operasyon & Saha Hizmetleri",
      head: "Burak Çelik (Operasyon Şefi)",
      membersCount: 12,
      activeJobsCount: editions.length,
      desc: t("companySettings.deptOperationsDesc"),
    },
    {
      id: "finance",
      name: "Finans & Muhasebe Departmanı",
      head: "Deniz Arslan (Finans Müdürü)",
      membersCount: 4,
      activeJobsCount: editions.length,
      desc: t("companySettings.deptFinanceDesc"),
    },
  ];

  const rolesCatalog = [
    {
      role: "ORG_OWNER",
      label: "Firma Sahibi / Kurucu",
      rank: 100,
      scope: "Firma (Tenant Geneli)",
      desc: "Tüm firma ayarlarına, faturalandırmaya, modüllere ve işlere tam yetkili erişim.",
    },
    {
      role: "ADMIN",
      label: "Sistem Yöneticisi",
      rank: 80,
      scope: "Firma Geneli",
      desc: "Çalışan atamaları, modül yapılandırmaları ve operasyonel ayarlar.",
    },
    {
      role: "STAFF",
      label: "Firma Çalışanı",
      rank: 50,
      scope: "Atandığı İşler / Departman",
      desc: "Yetkilendirildiği işlerde kayıt, program ve operasyon yönetimi.",
    },
    {
      role: "COLLABORATOR",
      label: "Dış Paydaş / Partner",
      rank: 30,
      scope: "Kısıtlı İş Kapsamı",
      desc: "Yalnızca ilgili oturum veya stant için dış yönetim erişimi.",
    },
    {
      role: "OBSERVER",
      label: "İzleyici / Denetçi",
      rank: 10,
      scope: "Salt Okunur",
      desc: "Raporları ve durumları inceleme yetkisi; veri değiştirme kapalı.",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* ── Üst Başlık ve Bağlam Butonu ── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("companySettings.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tenant?.name ?? "Firma"} — {t("companySettings.desc")}
          </p>
        </div>

        {currentEdition && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 self-start sm:self-auto text-xs"
            onClick={() => setModule("settings")}
          >
            <Icons.CalendarRange className="size-3.5 text-primary" />
            {currentEdition.name} {t("companySettings.workSettingsLink")}
          </Button>
        )}
      </div>

      {/* ── 7 Bölümlü Firma Ayarları Sekmeleri ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1 bg-muted/60 p-1 text-xs">
          <TabsTrigger value="profile" className="gap-1 truncate px-1 text-[11px] py-1.5">
            <Icons.Building2 className="size-3 shrink-0" />
            {t("companySettings.tabProfile")}
          </TabsTrigger>
          <TabsTrigger value="staff-teams" className="gap-1 truncate px-1 text-[11px] py-1.5">
            <Icons.Users className="size-3 shrink-0" />
            {t("companySettings.tabStaff")}
          </TabsTrigger>
          <TabsTrigger value="departments" className="gap-1 truncate px-1 text-[11px] py-1.5">
            <Icons.FolderTree className="size-3 shrink-0" />
            {t("companySettings.tabDepartments")}
          </TabsTrigger>
          <TabsTrigger value="roles-access" className="gap-1 truncate px-1 text-[11px] py-1.5">
            <Icons.Shield className="size-3 shrink-0" />
            {t("companySettings.tabRoles")}
          </TabsTrigger>
          <TabsTrigger value="modules" className="gap-1 truncate px-1 text-[11px] py-1.5">
            <Icons.Box className="size-3 shrink-0" />
            {t("companySettings.tabModules")}
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1 truncate px-1 text-[11px] py-1.5">
            <Icons.LayoutTemplate className="size-3 shrink-0" />
            {t("companySettings.tabTemplates")}
          </TabsTrigger>
          <TabsTrigger value="comms-consent" className="gap-1 truncate px-1 text-[11px] py-1.5">
            <Icons.Megaphone className="size-3 shrink-0" />
            {t("companySettings.tabConsent")}
          </TabsTrigger>
          <TabsTrigger value="integrations-compliance" className="gap-1 truncate px-1 text-[11px] py-1.5">
            <Icons.Cpu className="size-3 shrink-0" />
            {t("companySettings.tabIntegrations")}
          </TabsTrigger>
        </TabsList>

        {/* 1. Firma Profili */}
        <TabsContent value="profile" className="mt-5 space-y-5">
          <TenantIdentityCard />
          <LanguageCard />
        </TabsContent>

        {/* 2. Çalışanlar ve Ekipler */}
        <TabsContent value="staff-teams" className="mt-5">
          <UserAdminCard />
        </TabsContent>

        {/* 3. Departmanlar */}
        <TabsContent value="departments" className="mt-5 space-y-4">
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                {t("companySettings.deptTitle")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("companySettings.deptDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {departments.map((dept) => (
                <div
                  key={dept.id}
                  className="flex flex-col justify-between rounded-xl border p-4 bg-muted/20 hover:border-primary/40 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-foreground text-sm">{dept.name}</h4>
                      <Badge variant="secondary" className="text-[10px]">
                        {dept.membersCount} Çalışan
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{dept.desc}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                    <span>{dept.head}</span>
                    <span className="font-medium text-primary">{dept.activeJobsCount} Bağlı İş</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. Roller & Erişim */}
        <TabsContent value="roles-access" className="mt-5 space-y-4">
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                {t("companySettings.rolesTitle")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("companySettings.rolesDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y rounded-xl border bg-card overflow-hidden">
                <div className="grid grid-cols-12 bg-muted/40 p-3 text-[11px] font-semibold text-muted-foreground uppercase">
                  <span className="col-span-3">Rol Adı</span>
                  <span className="col-span-2">Kademe</span>
                  <span className="col-span-3">Geçerlilik</span>
                  <span className="col-span-4">Açıklama</span>
                </div>
                {rolesCatalog.map((r) => (
                  <div key={r.role} className="grid grid-cols-12 items-center p-3 text-xs">
                    <span className="col-span-3 font-semibold text-foreground flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">{r.role}</Badge>
                      <span className="truncate">{r.label}</span>
                    </span>
                    <span className="col-span-2 text-muted-foreground">
                      Rank {r.rank}
                    </span>
                    <span className="col-span-3 text-muted-foreground">
                      {r.scope}
                    </span>
                    <span className="col-span-4 text-muted-foreground text-[11px]">
                      {r.desc}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. Modüller */}
        <TabsContent value="modules" className="mt-5 space-y-4">
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Firma Modül Lisans ve Aktivasyonları
              </CardTitle>
              <CardDescription className="text-xs">
                Firma B tenant'ına tanımlı 26 sektörel modül ve kurumsal yetenek paketleri.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { id: "editions", scope: "Ana Omurga", active: true },
                  { id: "portfolio", scope: "Global", active: true },
                  { id: "registrations", scope: "İş Seviyesi", active: true },
                  { id: "scientific", scope: "İş Seviyesi", active: true },
                  { id: "program", scope: "İş Seviyesi", active: true },
                  { id: "sponsorship", scope: "İş Seviyesi", active: true },
                  { id: "floors", scope: "İş Seviyesi", active: true },
                  { id: "b2b", scope: "İş Seviyesi", active: true },
                  { id: "accommodation", scope: "İş Seviyesi", active: true },
                  { id: "onsite", scope: "İş Seviyesi", active: true },
                  { id: "badges", scope: "İş Seviyesi", active: true },
                  { id: "certificates", scope: "İş Seviyesi", active: true },
                  { id: "communications", scope: "İş Seviyesi", active: true },
                  { id: "company-communications", scope: "Global", active: true },
                  { id: "accounting", scope: "İş Seviyesi", active: true },
                  { id: "company-reports", scope: "Global", active: true },
                  { id: "portals", scope: "Harici", active: true },
                  { id: "integrations", scope: "Firma", active: true },
                  { id: "compliance", scope: "Firma", active: true },
                ].map((m) => {
                  const modName = t("modules." + m.id);
                  return (
                    <div key={m.id} className="flex items-center justify-between rounded-lg border bg-muted/10 p-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground">{modName}</p>
                      <p className="text-[10px] text-muted-foreground">{m.scope}</p>
                    </div>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-500/10 text-[10px]">
                      Aktif
                    </Badge>
                  </div>
                );
              })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 6. Genel Şablonlar */}
        <TabsContent value="templates" className="mt-5 space-y-4">
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                {t("companySettings.templatesTitle")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("companySettings.templatesDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(TEMPLATES).filter(([k]) => k !== "CUSTOM").map(([key, caps]) => (
                <div key={key} className="rounded-xl border p-4 bg-muted/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm text-foreground">{key}</h4>
                    <Badge variant="secondary" className="text-[10px]">{caps.length} Yetenek</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {caps.map((c) => {
                      const labelText = CAPABILITIES.find((cp) => cp.key === c)?.label ?? c;
                      return (
                        <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground font-medium">
                          {labelText}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 7. İletişim ve İzinler */}
        <TabsContent value="comms-consent" className="mt-5 space-y-4">
          <Card className="border p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icons.ShieldCheck className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">KVKK ve İYS Onay Politikası</h3>
                <p className="text-xs text-muted-foreground">
                  Firma B portföyündeki kişiler için ticari elektronik ileti izinleri ve aydınlatma metinleri varsayılanları.
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-2 text-muted-foreground">
              <div className="flex justify-between items-center">
                <span>Operasyonel Bildirimler (Bilet, Şifre, Fatura)</span>
                <Badge variant="outline" className="text-emerald-600 bg-emerald-50">Onay Aranmaz (Zorunlu İletişim)</Badge>
              </div>
              <div className="flex justify-between items-center border-t pt-2">
                <span>Pazarlama ve Bülten Gönderimleri</span>
                <Badge variant="outline" className="text-amber-600 bg-amber-50">Açık Rıza Gerekli (İYS Kayıtlı)</Badge>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* 8. Entegrasyonlar ve Uyumluluk */}
        <TabsContent value="integrations-compliance" className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Harici Entegrasyonlar ve Uyumluluk Modülleri</h3>
              <p className="text-xs text-muted-foreground">Ödeme ağ geçitleri, SMS/E-posta sağlayıcıları, webhook'lar ve yasal log kasası.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setModule("integrations")}>
                <Icons.Cpu className="size-3.5 text-primary" /> API & Entegrasyonlar →
              </Button>
              <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setModule("compliance")}>
                <Icons.Shield className="size-3.5 text-primary" /> Uyumluluk Kasası →
              </Button>
            </div>
          </div>
          <ExportHubCard />
          <AnnounceAdminCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
