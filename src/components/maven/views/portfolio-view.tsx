"use client";
import React, { useState, useMemo } from "react";
import { useApp } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import { listEntity } from "@/lib/client";
import { useApi } from "../bits";
import { PeopleView, OrganizationsView } from "./people";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

interface OrgItem {
  id: string;
  name: string;
  type?: string | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
  generalEmail?: string | null;
  _count?: {
    eventAssignments?: number;
    sponsorAgreements?: number;
  };
}

interface PersonItem {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  company?: string | null;
  title?: string | null;
}

interface OrgAssignmentItem {
  id: string;
  role: string;
  editionId: string;
  organizationId: string;
  organization: {
    name: string;
  };
  edition: {
    name: string;
  };
}

export function PortfolioView({ initialTab = "people" }: { initialTab?: string }) {
  const { tenant, editions, setCurrentEdition, setModule, moduleSubView } = useApp();
  const { t } = useLang();
  const [prevSubView, setPrevSubView] = useState(moduleSubView);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [clientSearch, setClientSearch] = useState("");
  const [relSearch, setRelSearch] = useState("");

  if (moduleSubView !== prevSubView) {
    setPrevSubView(moduleSubView);
    if (moduleSubView && ["people", "organizations", "clients", "relationships", "segments", "portfolio-forms"].includes(moduleSubView)) {
      setActiveTab(moduleSubView);
    }
  }

  // Kurumlar listesi
  const { data: orgs } = useApi<OrgItem[]>(() => listEntity("organizations"), []);
  // Kişiler listesi
  const { data: people } = useApi<PersonItem[]>(() => listEntity("people"), []);
  // Kurum iş atamaları (İlişkiler)
  const { data: assignments } = useApi<OrgAssignmentItem[]>(
    () => listEntity("org-assignments"),
    []
  );

  // Müşteri kurumları filtreleme
  const clientOrgs = useMemo(() => {
    if (!orgs) return [];
    return orgs.filter((o) => {
      const isClientType = o.type === "CLIENT" || o.type === "MUSTERI";
      const hasClientAssignment = assignments?.some(
        (a) => a.organizationId === o.id && (a.role === "CLIENT" || a.role === "EVENT_OWNER")
      );
      if (!isClientType && !hasClientAssignment && !o.name.toLowerCase().includes("müşteri")) {
        // Eğer açıkça müşteri olarak etiketlenmediyse ama iş ataması varsa dahil et
        if ((o._count?.eventAssignments ?? 0) === 0) return false;
      }
      if (clientSearch.trim()) {
        const q = clientSearch.toLowerCase();
        return o.name.toLowerCase().includes(q) || o.city?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [orgs, assignments, clientSearch]);

  // Filtrelenmiş ilişkiler listesi
  const filteredAssignments = useMemo(() => {
    if (!assignments) return [];
    if (!relSearch.trim()) return assignments;
    const q = relSearch.toLowerCase();
    return assignments.filter(
      (a) =>
        a.organization?.name.toLowerCase().includes(q) ||
        a.edition?.name.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q)
    );
  }, [assignments, relSearch]);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Üst Başlık ve Tanıtım ── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("portfolio.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tenant?.name ?? "Firma"} {t("portfolio.desc")}
          </p>
        </div>
      </div>

      {/* ── Portföy Ana Kaydı vs İş Katılımı Kavramsal Uyarı Bandı ── */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-foreground/90">
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icons.ShieldCheck className="size-4" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-primary">
            {t("portfolio.noticeTitle")}
          </p>
          <p className="leading-relaxed text-muted-foreground">
            {t("portfolio.noticeDesc")}
          </p>
        </div>
      </div>

      {/* ── Portföy KPI Kartları ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border bg-card shadow-2xs">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-medium text-muted-foreground">
              {t("portfolio.kpiPeople")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-foreground">
              {people?.length ?? "—"}
            </div>
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-2xs">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-medium text-muted-foreground">
              {t("portfolio.kpiOrgs")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-foreground">
              {orgs?.length ?? "—"}
            </div>
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-2xs">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-medium text-muted-foreground">
              {t("portfolio.kpiClients")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-foreground">
              {clientOrgs.length}
            </div>
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-2xs">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-medium text-muted-foreground">
              {t("portfolio.kpiRelationships")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-foreground">
              {assignments?.length ?? "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 6 Portföy Sekmesi (Kişiler, Kurumlar, Müşteriler, İlişkiler, Segmentler, Formlar) ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1 bg-muted/60 p-1">
          <TabsTrigger value="people" className="gap-1.5 text-xs py-1.5">
            <Icons.Users className="size-3.5" />
            {t("portfolio.tabPeople")}
          </TabsTrigger>
          <TabsTrigger value="organizations" className="gap-1.5 text-xs py-1.5">
            <Icons.Building2 className="size-3.5" />
            {t("portfolio.tabOrgs")}
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-1.5 text-xs py-1.5">
            <Icons.Briefcase className="size-3.5" />
            {t("portfolio.tabClients")}
          </TabsTrigger>
          <TabsTrigger value="relationships" className="gap-1.5 text-xs py-1.5">
            <Icons.GitMerge className="size-3.5" />
            {t("portfolio.tabRelationships")}
          </TabsTrigger>
          <TabsTrigger value="segments" className="gap-1.5 text-xs py-1.5">
            <Icons.Layers className="size-3.5" />
            {t("portfolio.tabSegments")}
          </TabsTrigger>
          <TabsTrigger value="portfolio-forms" className="gap-1.5 text-xs py-1.5">
            <Icons.FileText className="size-3.5" />
            {t("portfolio.tabForms")}
          </TabsTrigger>
        </TabsList>

        {/* 1. Kişiler Ana Kayıtları */}
        <TabsContent value="people" className="mt-4">
          <PeopleView />
        </TabsContent>

        {/* 2. Kurumlar Ana Kayıtları */}
        <TabsContent value="organizations" className="mt-4">
          <OrganizationsView />
        </TabsContent>

        {/* 3. Müşteriler Sekmesi */}
        <TabsContent value="clients" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 sm:max-w-xs">
              <Icons.Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder={t("portfolio.searchClientsPh")}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {clientOrgs.length} müşteri hesabı listeleniyor
            </p>
          </div>

          {clientOrgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center text-muted-foreground">
              <Icons.Briefcase className="size-8 opacity-40 mb-2" />
              <p className="text-xs">{t("portfolio.noClients")}</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {clientOrgs.map((client) => {
                const clientAssignments = assignments?.filter(
                  (a) => a.organizationId === client.id
                ) ?? [];
                return (
                  <Card key={client.id} className="border p-4 transition hover:border-primary/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="truncate font-semibold text-foreground text-sm">
                          {client.name}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {client.city ? `${client.city}, ` : ""}{client.country ?? "Türkiye"}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {client.type ?? "Müşteri"}
                      </Badge>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                      <span>{clientAssignments.length} Bağlı İş</span>
                      <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                        <Icons.CheckCircle className="size-3" />
                        {t("portfolio.portalGranted")}
                      </span>
                    </div>

                    {clientAssignments.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {clientAssignments.slice(0, 3).map((ca) => (
                          <Badge
                            key={ca.id}
                            variant="outline"
                            className="cursor-pointer text-[9px] hover:bg-muted"
                            onClick={() => {
                              setCurrentEdition(ca.editionId);
                              setModule("dashboard");
                            }}
                          >
                            {ca.edition?.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* 4. İş İlişkileri Çapraz Görünümü */}
        <TabsContent value="relationships" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 sm:max-w-xs">
              <Icons.Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={relSearch}
                onChange={(e) => setRelSearch(e.target.value)}
                placeholder={t("portfolio.searchRelationshipsPh")}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {filteredAssignments.length} aktif iş ilişkisi
            </p>
          </div>

          {filteredAssignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center text-muted-foreground">
              <Icons.GitMerge className="size-8 opacity-40 mb-2" />
              <p className="text-xs">{t("portfolio.noRelationships")}</p>
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden shadow-2xs">
              <div className="grid grid-cols-12 border-b bg-muted/40 p-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span className="col-span-4">Kurum / Paydaş</span>
                <span className="col-span-3">İşteki Rolü</span>
                <span className="col-span-3">İş / Organizasyon</span>
                <span className="col-span-2 text-right">Eylem</span>
              </div>
              <div className="divide-y divide-border/60">
                {filteredAssignments.map((a) => (
                  <div
                    key={a.id}
                    className="grid grid-cols-12 items-center p-3 text-xs transition hover:bg-muted/30"
                  >
                    <span className="col-span-4 font-medium text-foreground truncate">
                      {a.organization?.name}
                    </span>
                    <span className="col-span-3">
                      <Badge variant="outline" className="text-[10px]">
                        {a.role}
                      </Badge>
                    </span>
                    <span className="col-span-3 text-muted-foreground truncate">
                      {a.edition?.name}
                    </span>
                    <span className="col-span-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          setCurrentEdition(a.editionId);
                          setModule("dashboard");
                        }}
                      >
                        İşe Git
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* 5. Segmentler Sekmesi */}
        <TabsContent value="segments" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Portföy Kitle Segmentleri</h3>
                <p className="text-xs text-muted-foreground">Kişi ve kurumlardan filtrelenmiş hedef kitle kümeleri.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => setModule("company-communications", "campaigns")}
              >
                <Icons.Megaphone className="size-3.5 text-primary" />
                İletişim Kampanyası Başlat
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-2">
              {[
                { title: "VIP & Protokol Portföyü", count: people?.length ? Math.min(people.length, 12) : 0, badge: "Öncelikli", desc: "Özel davetli ve protokol muhatapları" },
                { title: "Kurumsal Karar Vericiler", count: clientOrgs.length, badge: "Müşteri", desc: "İş veren ve sponsorluk yetkilileri" },
                { title: "Konuşmacı & Akademisyen Havuzu", count: people?.length ? Math.min(people.length, 24) : 0, badge: "Bilimsel", desc: "Geçmiş işlerde konuşmacı ve hakemlik yapanlar" },
                { title: "Sponsor & Ticari Temsilciler", count: assignments?.length ?? 0, badge: "Partner", desc: "Sponsor ve stant katılımcısı şirket temsilcileri" },
              ].map((seg, i) => (
                <div key={i} className="flex flex-col justify-between rounded-lg border bg-background/50 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs text-foreground">{seg.title}</span>
                    <Badge variant="outline" className="text-[10px]">{seg.badge}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{seg.desc}</p>
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="font-semibold text-primary">{seg.count} Kayıt</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[11px]"
                      onClick={() => {
                        setActiveTab("people");
                      }}
                    >
                      Kişileri İncele →
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* 6. Portföy Formları Sekmesi */}
        <TabsContent value="portfolio-forms" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Genel Portföy ve Başvuru Formları</h3>
                <p className="text-xs text-muted-foreground">İşlerden bağımsız firma geneli iletişim, talep ve aday kayıt formları.</p>
              </div>
              <Button
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setModule("forms")}
              >
                <Icons.Plus className="size-3.5" />
                Form Stüdyosu Aç
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-2">
              {[
                { title: t("portfolio.sampleForm1"), type: "Genel Talep", status: "Yayında", responses: 14 },
                { title: t("portfolio.sampleForm2"), type: "Tedarikçi", status: "Yayında", responses: 8 },
                { title: t("portfolio.sampleForm3"), type: "Ön Başvuru", status: "Taslak", responses: 0 },
              ].map((f, i) => (
                <div key={i} className="flex flex-col justify-between rounded-lg border bg-background/50 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs text-foreground">{f.title}</span>
                    <Badge variant={f.status === "Yayında" ? "default" : "secondary"} className="text-[10px]">
                      {f.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                    <span>{f.type}</span>
                    <span className="font-medium text-foreground">{f.responses} Yanıt</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
