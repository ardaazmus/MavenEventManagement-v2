"use client";
import React, { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import {
  WORK_TYPES,
  WORK_LIFECYCLE_STAGES,
  MACRO_LIFECYCLE_STAGES,
  getMacroLifecycleStage,
  type WorkTypeId,
} from "@/lib/product-taxonomy";
import { EDITION_STATUS, label, fmtDate } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

interface JobsViewProps {
  initialFilter?: string;
  onFilterChange?: (filter: string) => void;
}

export function JobsView({ initialFilter = "all", onFilterChange }: JobsViewProps) {
  const {
    editions,
    currentEditionId,
    setCurrentEdition,
    setModule,
    openEditionWizard,
    tenant,
  } = useApp();
  const { t } = useLang();

  const [search, setSearch] = useState("");
  const [prevInitialFilter, setPrevInitialFilter] = useState(initialFilter);
  const [activeTab, setActiveTab] = useState(initialFilter);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  if (initialFilter !== prevInitialFilter) {
    setPrevInitialFilter(initialFilter);
    setActiveTab(initialFilter);
  }

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    onFilterChange?.(val);
  };

  // Filtrelenmiş iş listesi
  const filteredJobs = useMemo(() => {
    return editions.filter((edition) => {
      // 1. Arama filtresi
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = edition.name.toLowerCase().includes(query);
        const matchesCity = edition.city?.toLowerCase().includes(query);
        const matchesSeries = edition.series?.name?.toLowerCase().includes(query);
        if (!matchesName && !matchesCity && !matchesSeries) return false;
      }

      // 2. Durum / Yaşam Döngüsü Filtresi
      if (activeTab === "all" || activeTab === "my-jobs") return true;
      if (activeTab === "draft") {
        return getMacroLifecycleStage(edition) === "DRAFT";
      }
      if (activeTab === "planning") {
        return getMacroLifecycleStage(edition) === "PLANNING";
      }
      if (activeTab === "active") {
        return getMacroLifecycleStage(edition) === "ACTIVE";
      }
      if (activeTab === "completed") {
        return getMacroLifecycleStage(edition) === "COMPLETED";
      }
      if (activeTab === "archive") {
        return getMacroLifecycleStage(edition) === "ARCHIVED";
      }
      if (activeTab === "attention") {
        return !edition.isPublished || edition.status === "CONFIGURATION";
      }
      return true;
    });
  }, [editions, search, activeTab]);

  // Dikkat gereken işler sayısı
  const attentionCount = useMemo(() => {
    return editions.filter((e) => !e.isPublished || e.status === "CONFIGURATION").length;
  }, [editions]);

  const handleOpenWork = (id: string) => {
    setCurrentEdition(id);
    setModule("dashboard"); // İş Özeti
  };

  const handleContinueSetup = (id: string) => {
    setCurrentEdition(id);
    setModule("editions"); // Kurulum kontrol listesi
  };

  const handleOpenSettings = (id: string) => {
    setCurrentEdition(id);
    setModule("settings"); // İş ayarları
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Üst Başlık ve Birincil Aksiyonlar ── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">İşler ve Organizasyonlar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tenant?.name ?? "Firma"} bünyesindeki tüm etkinlik, fuar, seyahat ve müşteri organizasyonları portföyü.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openEditionWizard} className="gap-1.5" aria-label="Yeni Etkinlik">
            <Icons.Plus className="size-4" />
            Yeni Etkinlik
          </Button>
          <Button onClick={openEditionWizard} className="gap-2 shadow-sm" aria-label="Yeni İş Başlat">
            <Icons.Plus className="size-4" />
            Yeni İş Başlat
          </Button>
        </div>
      </div>

      {/* ── Dikkat Gerekenler Şeridi ── */}
      {attentionCount > 0 && activeTab !== "archive" && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <Icons.AlertCircle className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                {attentionCount} iş için kurulum veya karar aksiyonu gerekiyor
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300/80">
                Tamamlanmamış kurulum adımları ve yayına hazırlık kontrolleri mevcut.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTabChange("attention")}
            className="border-amber-300 bg-white text-xs text-amber-900 hover:bg-amber-100/50 dark:border-amber-800 dark:bg-zinc-900 dark:text-amber-200"
          >
            İncele
          </Button>
        </div>
      )}

      {/* ── Arama, Filtre Sekmeleri ve Görünüm Seçici ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full sm:w-auto">
          <TabsList className="h-9 w-full justify-start overflow-x-auto p-1 sm:w-auto">
            <TabsTrigger value="all" className="text-xs">{t("lifecycle.tabAll")} ({editions.length})</TabsTrigger>
            <TabsTrigger value="draft" className="text-xs">
              {t("lifecycle.tabDraft")} ({editions.filter((e) => getMacroLifecycleStage(e) === "DRAFT").length})
            </TabsTrigger>
            <TabsTrigger value="planning" className="text-xs">
              {t("lifecycle.tabPlanning")} ({editions.filter((e) => getMacroLifecycleStage(e) === "PLANNING").length})
            </TabsTrigger>
            <TabsTrigger value="active" className="text-xs">
              {t("lifecycle.tabActive")} ({editions.filter((e) => getMacroLifecycleStage(e) === "ACTIVE").length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="text-xs">
              {t("lifecycle.tabCompleted")} ({editions.filter((e) => getMacroLifecycleStage(e) === "COMPLETED").length})
            </TabsTrigger>
            <TabsTrigger value="attention" className="text-xs">
              Dikkat ({attentionCount})
            </TabsTrigger>
            <TabsTrigger value="archive" className="text-xs">{t("lifecycle.tabArchive")}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Icons.Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İş adı, şehir veya kurum ara..."
              className="h-9 pl-8 text-xs"
            />
          </div>

          <div className="flex items-center rounded-lg border bg-background p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-8", viewMode === "grid" && "bg-muted")}
              onClick={() => setViewMode("grid")}
              aria-label="Kart Görünümü"
            >
              <Icons.LayoutGrid className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-8", viewMode === "list" && "bg-muted")}
              onClick={() => setViewMode("list")}
              aria-label="Liste Görünümü"
            >
              <Icons.List className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── İş Listesi / Kartları ── */}
      {filteredJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
          <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <Icons.Briefcase className="size-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold">Bu filtrede gösterilecek iş bulunamadı</h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            {search
              ? "Arama kriterlerinize uyan bir iş kaydı yok. Filtreleri temizleyebilirsiniz."
              : "Henüz bu kategoride bir iş kaydı oluşturulmadı."}
          </p>
          <div className="mt-5 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openEditionWizard} className="gap-1.5" aria-label="Yeni Etkinlik">
              <Icons.Plus className="size-4" />
              Yeni Etkinlik
            </Button>
            <Button onClick={openEditionWizard} className="gap-2 shadow-sm" aria-label="Yeni İş Başlat">
              <Icons.Plus className="size-4" />
              Yeni İş Başlat
            </Button>
          </div>
        </div>
      ) : viewMode === "grid" ? (
        /* KART GÖRÜNÜMÜ */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredJobs.map((job) => {
            const isSelected = job.id === currentEditionId;
            const enabledCaps = job.capabilities?.filter((c) => c.enabled) ?? [];

            return (
              <Card
                key={job.id}
                className={cn(
                  "group flex flex-col justify-between transition-all duration-150 hover:border-primary/50 hover:shadow-sm",
                  isSelected && "border-primary ring-1 ring-primary/20"
                )}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {job.series?.name ?? "Etkinlik"}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {MACRO_LIFECYCLE_STAGES.find((s) => s.id === getMacroLifecycleStage(job))?.label}
                      </Badge>
                      <Badge
                        variant={job.status === "ONSITE" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {label(EDITION_STATUS, job.status)}
                      </Badge>
                    </div>
                  </div>
                  <CardTitle className="mt-2 text-base font-semibold leading-tight">
                    {job.name}
                  </CardTitle>
                </CardHeader>

                <CardContent className="flex-1 p-4 pt-1 text-xs text-muted-foreground">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <Icons.Calendar className="size-3.5 shrink-0" />
                      <span>{fmtDate(job.startDate)} — {fmtDate(job.endDate)}</span>
                    </div>

                    {job.city && (
                      <div className="flex items-center gap-1.5">
                        <Icons.MapPin className="size-3.5 shrink-0" />
                        <span>{job.city}</span>
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                        {enabledCaps.length} Etkin Modül
                      </Badge>
                      {job.isPublished ? (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          Yayında
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          Taslak
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="flex items-center justify-between border-t p-3 bg-muted/20">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => handleOpenSettings(job.id)}
                  >
                    <Icons.Sliders className="mr-1.5 size-3.5" />
                    Ayarlar
                  </Button>

                  <div className="flex items-center gap-1.5">
                    {!job.isPublished && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => handleContinueSetup(job.id)}
                      >
                        Kurulum
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => handleOpenWork(job.id)}
                    >
                      İşi Aç
                      <Icons.ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        /* LİSTE GÖRÜNÜMÜ */
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
              <tr>
                <th className="p-3">İş Adı</th>
                <th className="p-3">Tür / Seri</th>
                <th className="p-3">Durum</th>
                <th className="p-3">Tarih</th>
                <th className="p-3">Şehir</th>
                <th className="p-3 text-right">Eylemler</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredJobs.map((job) => (
                <tr key={job.id} className="transition-colors hover:bg-muted/30">
                  <td className="p-3 font-medium text-foreground">{job.name}</td>
                  <td className="p-3 text-muted-foreground">{job.series?.name ?? "Etkinlik"}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {MACRO_LIFECYCLE_STAGES.find((s) => s.id === getMacroLifecycleStage(job))?.label}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {label(EDITION_STATUS, job.status)}
                      </Badge>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{fmtDate(job.startDate)}</td>
                  <td className="p-3 text-muted-foreground">{job.city ?? "—"}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleOpenSettings(job.id)}
                      >
                        Ayarlar
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleOpenWork(job.id)}
                      >
                        İşi Aç
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
