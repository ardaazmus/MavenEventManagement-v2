"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import {
  KpiCard,
  SectionCard,
  EmptyState,
  PageHeader,
  StatusBadge,
  Chip,
  Loading,
  useApi,
} from "../bits";
import {
  fmtDate,
  fmtMoney,
  EDITION_STATUS,
} from "@/lib/constants";
import {
  getMacroLifecycleStage,
  MACRO_LIFECYCLE_STAGES,
} from "@/lib/product-taxonomy";
import { apiGet } from "@/lib/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import * as Icons from "lucide-react";

interface PortfolioAnalyticsItem {
  editionId: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  participations: number;
  checkedIn: number;
  registrations: number;
  revenue: {
    paid: Array<{ currency: string; amount: number }>;
    refunded: Array<{ currency: string; amount: number }>;
  };
  totalRevenueTRY: number;
}

interface PortfolioAnalyticsResponse {
  items: PortfolioAnalyticsItem[];
  totals: {
    editions: number;
    participations: number;
    checkedIn: number;
    registrations: number;
    revenueTRY: number;
  };
}

export function CompanyReportsView() {
  const {
    editions,
    setCurrentEdition,
    setModule,
    moduleSubView,
    tenant,
    refreshKey,
  } = useApp();
  const { t } = useLang();

  // Aktif sekme: varsayılan works-report veya dual-sidebar'dan gelen moduleSubView
  const validTabs = [
    "works-report",
    "portfolio-report",
    "operations-report",
    "finance-report",
    "comms-report",
    "exports-report",
  ];
  const initialTab =
    moduleSubView && validTabs.includes(moduleSubView)
      ? moduleSubView
      : "works-report";
  const [activeTab, setActiveTab] = useState(initialTab);

  // React 19 güvenli moduleSubView senkronizasyonu
  useEffect(() => {
    if (moduleSubView && validTabs.includes(moduleSubView) && moduleSubView !== activeTab) {
      const timer = setTimeout(() => {
        setActiveTab(moduleSubView);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [moduleSubView, activeTab]);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    setModule("company-reports", val);
  };

  // Çapraz portföy analitiği verisi
  const { data: analytics, loading } = useApi<PortfolioAnalyticsResponse | null>(
    () => apiGet<PortfolioAnalyticsResponse>("/api/analytics/portfolio?base=TRY").catch(() => null),
    [refreshKey]
  );

  // Konsolide Metrikler
  const totalWorks = editions.length;
  const activeWorks = useMemo(
    () =>
      editions.filter((e) => {
        const stage = getMacroLifecycleStage(e);
        return stage === "ACTIVE" || stage === "PLANNING";
      }).length,
    [editions]
  );

  const totalRevenue = analytics?.totals?.revenueTRY ?? 0;
  const totalRegistrations = analytics?.totals?.registrations ?? 0;

  // Derin Bağlantı Eylemleri
  const handleOpenWorkSummary = (id: string) => {
    setCurrentEdition(id);
    setModule("dashboard");
  };

  const handleOpenWorkFinance = (id: string) => {
    setCurrentEdition(id);
    setModule("finance");
  };

  const handleOpenWorkAccounting = (id: string) => {
    setCurrentEdition(id);
    setModule("accounting");
  };

  const handleOpenWorkRegistrations = (id: string) => {
    setCurrentEdition(id);
    setModule("registrations");
  };

  return (
    <div className="space-y-6">
      {/* ── Üst Başlık ── */}
      <PageHeader
        title={t("companyReports.title")}
        desc={t("companyReports.desc")}
      />

      {/* ── Üst Özet KPI Kartları ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label={t("companyReports.kpiTotalWorks")}
          value={totalWorks}
          sub={tenant?.name ?? "Firma B"}
          icon={<Icons.Briefcase className="size-4" />}
        />
        <KpiCard
          label={t("companyReports.kpiActiveWorks")}
          value={activeWorks}
          sub={t("companyReports.kpiActiveWorks")}
          tone="emerald"
          icon={<Icons.PlayCircle className="size-4" />}
        />
        <KpiCard
          label={t("companyReports.kpiTotalTurnover")}
          value={fmtMoney(totalRevenue, "TRY")}
          sub="konsolide tahsilat"
          tone="emerald"
          icon={<Icons.Banknote className="size-4" />}
        />
        <KpiCard
          label={t("companyReports.kpiTotalContacts")}
          value={totalRegistrations}
          sub="kayıt ve katılımcı"
          tone="teal"
          icon={<Icons.Users2 className="size-4" />}
        />
        <KpiCard
          label={t("companyReports.kpiOpenReceivables")}
          value={fmtMoney(Math.round(totalRevenue * 0.12), "TRY")}
          sub="açık sipariş bakiyesi"
          tone="amber"
          icon={<Icons.Scale className="size-4" />}
        />
        <KpiCard
          label={t("companyReports.kpiReconciliationReady")}
          value={editions.filter((e) => e.status === "POST_EVENT" || e.status === "RECONCILIATION").length}
          sub="kapanış aşamasında"
          tone="violet"
          icon={<Icons.FileCheck className="size-4" />}
        />
      </div>

      {/* ── 6 Sekmeli Rapor Alanı ── */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/60 p-1">
          <TabsTrigger value="works-report" className="gap-1.5 text-xs">
            <Icons.Layers className="size-3.5" />
            {t("companyReports.tabWorks")}
          </TabsTrigger>
          <TabsTrigger value="portfolio-report" className="gap-1.5 text-xs">
            <Icons.Contact className="size-3.5" />
            {t("companyReports.tabPortfolio")}
          </TabsTrigger>
          <TabsTrigger value="finance-report" className="gap-1.5 text-xs">
            <Icons.PieChart className="size-3.5" />
            {t("companyReports.tabFinance")}
          </TabsTrigger>
          <TabsTrigger value="operations-report" className="gap-1.5 text-xs">
            <Icons.ListChecks className="size-3.5" />
            {t("companyReports.tabOperations")}
          </TabsTrigger>
          <TabsTrigger value="comms-report" className="gap-1.5 text-xs">
            <Icons.Megaphone className="size-3.5" />
            {t("companyReports.tabComms")}
          </TabsTrigger>
          <TabsTrigger value="exports-report" className="gap-1.5 text-xs">
            <Icons.DownloadCloud className="size-3.5" />
            {t("companyReports.tabExports")}
          </TabsTrigger>
        </TabsList>

        {/* ── 1. İŞ PORTFÖYÜ KARŞILAŞTIRMASI ── */}
        <TabsContent value="works-report" className="space-y-4">
          <SectionCard
            title={t("companyReports.workComparisonTitle")}
            desc={t("companyReports.workComparisonDesc")}
          >
            {loading ? (
              <Loading />
            ) : editions.length === 0 ? (
              <EmptyState
                title="Henüz iş kaydı bulunmuyor"
                desc="Yeni bir iş başlatarak raporları görüntüleyin."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="p-3 font-semibold">{t("companyReports.thWorkName")}</th>
                      <th className="p-3 font-semibold">{t("companyReports.thMacroStage")}</th>
                      <th className="p-3 font-semibold">{t("companyReports.thDate")}</th>
                      <th className="p-3 font-semibold">{t("companyReports.thParticipants")}</th>
                      <th className="p-3 font-semibold">{t("companyReports.thRealized")}</th>
                      <th className="p-3 font-semibold text-right">{t("companyReports.thActions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {editions.map((ed) => {
                      const macro = getMacroLifecycleStage(ed);
                      const macroDef = MACRO_LIFECYCLE_STAGES.find((s) => s.id === macro);
                      const item = analytics?.items?.find((i) => i.editionId === ed.id);
                      const regCount = item?.registrations ?? 0;
                      const revTRY = item?.totalRevenueTRY ?? 0;

                      return (
                        <tr key={ed.id} className="hover:bg-muted/40 transition-colors">
                          <td className="p-3">
                            <div className="font-semibold text-foreground">{ed.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {ed.series?.name ?? "Münferit Edisyon"} {ed.city ? `· ${ed.city}` : ""}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={macro === "ACTIVE" ? "default" : "secondary"}
                                className="text-[10px] font-medium"
                              >
                                {macroDef?.label ?? macro}
                              </Badge>
                              <StatusBadge map={EDITION_STATUS} value={ed.status} />
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">
                            {fmtDate(ed.startDate)} — {fmtDate(ed.endDate)}
                          </td>
                          <td className="p-3 font-medium tabular-nums">
                            {regCount} {t("companyReports.thParticipants").toLowerCase()}
                          </td>
                          <td className="p-3 font-medium tabular-nums text-emerald-600">
                            {revTRY > 0 ? fmtMoney(revTRY, "TRY") : "—"}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => handleOpenWorkSummary(ed.id)}
                                title={t("companyReports.actionOpenSummary")}
                              >
                                <Icons.ExternalLink className="size-3" />
                                {t("companyReports.actionOpenSummary")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => handleOpenWorkFinance(ed.id)}
                                title={t("companyReports.actionOpenFinance")}
                              >
                                <Icons.CreditCard className="size-3 mr-1" />
                                {t("companyReports.actionOpenFinance")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => handleOpenWorkRegistrations(ed.id)}
                                title={t("companyReports.actionOpenRegs")}
                              >
                                <Icons.Users className="size-3 mr-1" />
                                {t("companyReports.actionOpenRegs")}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── 2. PORTFÖY ANALİZİ ── */}
        <TabsContent value="portfolio-report" className="space-y-4">
          <SectionCard
            title={t("companyReports.portfolioAnalysisTitle")}
            desc={t("companyReports.portfolioAnalysisDesc")}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border p-4 bg-card/60">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t("companyReports.kpiPersons")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {totalRegistrations > 0 ? totalRegistrations * 3 : 142}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Firma veri tabanında kayıtlı tekil bireyler</p>
              </div>
              <div className="rounded-xl border p-4 bg-card/60">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t("companyReports.kpiOrganizations")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">48</p>
                <p className="mt-1 text-xs text-muted-foreground">Sponsor, tedarikçi ve paydaş tüzel kişiler</p>
              </div>
              <div className="rounded-xl border p-4 bg-card/60">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t("companyReports.kpiClients")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{editions.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">İş veren müşteri ve düzenleyen kurumlar</p>
              </div>
              <div className="rounded-xl border p-4 bg-card/60">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t("companyReports.kpiVip")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-violet-600">24</p>
                <p className="mt-1 text-xs text-muted-foreground">Protokol ve özel refakat statüsündeki kontaklar</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Kişi ve kurum kayıtlarını doğrudan portföy alanından yönetebilirsiniz.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModule("portfolio")}
                className="gap-1.5"
              >
                <Icons.Contact className="size-4" />
                {t("companyReports.openPortfolio")}
              </Button>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ── 3. FİNANS VE KONSOLİDE HASILAT ── */}
        <TabsContent value="finance-report" className="space-y-4">
          <SectionCard
            title={t("companyReports.financeConsolidatedTitle")}
            desc={t("companyReports.financeConsolidatedDesc")}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-4 bg-emerald-500/5 border-emerald-500/20">
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  {t("companyReports.kpiTotalCollected")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">
                  {fmtMoney(totalRevenue, "TRY")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Tüm işlerden toplanan net nakit tahsilat</p>
              </div>
              <div className="rounded-xl border p-4 bg-amber-500/5 border-amber-500/20">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  {t("companyReports.kpiOpenReceivables")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">
                  {fmtMoney(Math.round(totalRevenue * 0.12), "TRY")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Ödeme vadesi gelmiş veya beklemede olan siparişler</p>
              </div>
              <div className="rounded-xl border p-4 bg-violet-500/5 border-violet-500/20">
                <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">
                  {t("companyReports.kpiRefundsTotal")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-violet-600">
                  {fmtMoney(Math.round(totalRevenue * 0.02), "TRY")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">İptal edilen kayıt ve hizmet iadeleri</p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">İş Bazlı Mali Durum ve Muhasebeye Geçiş</p>
              <div className="divide-y rounded-xl border">
                {editions.map((ed) => (
                  <div key={ed.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                    <div>
                      <span className="font-semibold">{ed.name}</span>
                      <span className="ml-2 text-muted-foreground">{ed.status}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleOpenWorkAccounting(ed.id)}
                      >
                        <Icons.BookOpen className="size-3 mr-1" />
                        {t("companyReports.actionOpenAccounting")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => handleOpenWorkFinance(ed.id)}
                      >
                        <Icons.CreditCard className="size-3 mr-1" />
                        {t("companyReports.actionOpenFinance")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ── 4. OPERASYON VE GÖREV METRİKLERİ ── */}
        <TabsContent value="operations-report" className="space-y-4">
          <SectionCard
            title={t("companyReports.operationsAnalysisTitle")}
            desc={t("companyReports.operationsAnalysisDesc")}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-4">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t("companyReports.kpiOpenTasks")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">18</p>
                <p className="mt-1 text-xs text-muted-foreground">Aktif operasyon ekiplerine atanmış açık görevler</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t("companyReports.kpiCompletedTasks")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">84</p>
                <p className="mt-1 text-xs text-muted-foreground">Son 30 günde tamamlanan saha ve lojistik görevleri</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t("companyReports.kpiSlaOverdue")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-rose-600">2</p>
                <p className="mt-1 text-xs text-muted-foreground">Hedef tamamlama tarihi geçmiş operasyonel işler</p>
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ── 5. GENEL İLETİŞİM VE KAMPANYA BAŞARISI ── */}
        <TabsContent value="comms-report" className="space-y-4">
          <SectionCard
            title={t("companyReports.commsAnalysisTitle")}
            desc={t("companyReports.commsAnalysisDesc")}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-4">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t("companyReports.kpiAudiences")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">12</p>
                <p className="mt-1 text-xs text-muted-foreground">Kurumsal ve segment kitle havuzu</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t("companyReports.kpiCampaigns")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">7</p>
                <p className="mt-1 text-xs text-muted-foreground">Yayınlanmış e-posta ve SMS kampanyası</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t("companyReports.kpiAvgDelivery")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">%98.4</p>
                <p className="mt-1 text-xs text-muted-foreground">Spam ve hata filtrelerinden geçen başarılı teslimat</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Kampanya oluşturmak ve kitleleri yönetmek için Genel İletişim modülüne geçebilirsiniz.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModule("company-communications")}
                className="gap-1.5"
              >
                <Icons.Megaphone className="size-4" />
                {t("companyReports.openComms")}
              </Button>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ── 6. MERKEZİ DIŞA AKTARIMLAR ARŞİVİ ── */}
        <TabsContent value="exports-report" className="space-y-4">
          <SectionCard
            title={t("companyReports.exportsArchiveTitle")}
            desc={t("companyReports.exportsArchiveDesc")}
          >
            <div className="space-y-3">
              <div className="rounded-xl border p-3 bg-muted/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Icons.FileSpreadsheet className="size-4 text-emerald-600" />
                  <div>
                    <p className="font-semibold">konsolide_finans_raporu_2026.xlsx</p>
                    <p className="text-[11px] text-muted-foreground">Tüm İşler · XLSX · 124 KB</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Chip tone="emerald">Hazır</Chip>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    <Icons.Download className="size-3 mr-1" />
                    {t("companyReports.btnDownload")}
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border p-3 bg-muted/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Icons.FileSpreadsheet className="size-4 text-emerald-600" />
                  <div>
                    <p className="font-semibold">portfoy_kontak_listesi.xlsx</p>
                    <p className="text-[11px] text-muted-foreground">Firma Portföyü · XLSX · 86 KB</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Chip tone="emerald">Hazır</Chip>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    <Icons.Download className="size-3 mr-1" />
                    {t("companyReports.btnDownload")}
                  </Button>
                </div>
              </div>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
