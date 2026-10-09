"use client";
import React from "react";
import { useApp } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import {
  KpiCard,
  SectionCard,
  EmptyState,
  PageHeader,
  StatusBadge,
  Chip,
} from "../bits";
import {
  fmtDate,
  fmtDateTime,
  fmtMoney,
  EDITION_STATUS,
  TASK_PRIORITY,
  label,
} from "@/lib/constants";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getMacroLifecycleStage,
  MACRO_LIFECYCLE_STAGES,
} from "@/lib/product-taxonomy";

export interface WorkSummaryData {
  scope: "PORTFOLIO" | "EDITION";
  edition?: {
    id: string;
    name: string;
    status: string;
    startDate: string;
    endDate: string;
    venueName?: string;
    city?: string;
    series?: { name: string } | null;
    capabilities?: { key: string; enabled: boolean; setupNote?: string | null }[];
  };
  kpi?: Record<string, unknown>;
  curve?: { date: string; count: number }[];
  bySource?: Record<string, number>;
  checks?: {
    blockers: { key: string; message: string }[];
    warnings: { key: string; message: string }[];
    score: number;
    pct: number;
  };
  recentActivity?: { id: string; type: string; message: string; actorName?: string | null; createdAt: string }[];
  upcomingTasks?: { id: string; title: string; status: string; priority: string; dueDate?: string | null; edition?: { name: string } | null; assignee?: { firstName: string; lastName: string } | null }[];
  lastUpdated?: string;
}

interface WorkSummaryViewProps {
  data: WorkSummaryData;
  onReload: () => void;
}

const PIE_COLORS = ["#0f9b8e", "#58b368", "#e0a458", "#d16ba5", "#7a6ff0", "#e07a5f", "#5fa8d3", "#9aa5b1"];

export function WorkSummaryView({ data, onReload }: WorkSummaryViewProps) {
  const { setModule } = useApp();
  const { t } = useLang();

  const edition = data.edition;
  const kpi = data.kpi ?? {};
  const checks = data.checks;
  const num = (k: string) => Number(kpi[k] ?? 0);

  if (!edition) return null;

  // Yaşam döngüsü: makro aşama ve tamamlanmış/arşivlenmiş mod kontrolü
  const macroStage = getMacroLifecycleStage(edition);
  const macroDef = MACRO_LIFECYCLE_STAGES.find((s) => s.id === macroStage);
  const isArchived = ["ARCHIVED", "POST_EVENT", "RECONCILIATION"].includes(edition.status);

  // Bu işte açık olan modül/yetenek kontrolü
  const hasCap = (primaryKey: string, altKeys: string[] = []): boolean => {
    if (!edition.capabilities || edition.capabilities.length === 0) return true;
    return edition.capabilities.some(
      (c) => (c.key === primaryKey || altKeys.includes(c.key)) && c.enabled
    );
  };

  // Bekleyen Kararlar ve Onaylar listesi
  const pendingItems: {
    id: string;
    title: string;
    count: number;
    tone: "rose" | "amber" | "violet" | "teal";
    actionLabel: string;
    onAction: () => void;
    icon: React.ReactNode;
  }[] = [];

  if (num("pendingApproval") > 0) {
    pendingItems.push({
      id: "pendingApproval",
      title: t("workSummary.pendingApprovalTitle"),
      count: num("pendingApproval"),
      tone: "amber",
      actionLabel: t("workSummary.pendingApprovalAction"),
      onAction: () => setModule("registrations"),
      icon: <Icons.Hourglass className="size-4 text-amber-600" />,
    });
  }

  if (num("pendingManual") > 0) {
    pendingItems.push({
      id: "pendingManual",
      title: t("workSummary.pendingManualTitle"),
      count: num("pendingManual"),
      tone: "rose",
      actionLabel: t("workSummary.pendingManualAction"),
      onAction: () => setModule("finance"),
      icon: <Icons.CreditCard className="size-4 text-rose-600" />,
    });
  }

  if (num("reviewOverdue") > 0) {
    pendingItems.push({
      id: "reviewOverdue",
      title: t("workSummary.reviewOverdueTitle"),
      count: num("reviewOverdue"),
      tone: "amber",
      actionLabel: t("workSummary.reviewOverdueAction"),
      onAction: () => setModule("scientific"),
      icon: <Icons.BookOpenCheck className="size-4 text-amber-600" />,
    });
  }

  if (num("acceptedNoSession") > 0) {
    pendingItems.push({
      id: "acceptedNoSession",
      title: t("workSummary.acceptedNoSessionTitle"),
      count: num("acceptedNoSession"),
      tone: "rose",
      actionLabel: t("workSummary.acceptedNoSessionAction"),
      onAction: () => setModule("program"),
      icon: <Icons.CalendarClock className="size-4 text-rose-600" />,
    });
  }

  if (num("deliverablePending") > 0) {
    pendingItems.push({
      id: "deliverablePending",
      title: t("workSummary.deliverablePendingTitle"),
      count: num("deliverablePending"),
      tone: "violet",
      actionLabel: t("workSummary.deliverablePendingAction"),
      onAction: () => setModule("sponsorship"),
      icon: <Icons.Award className="size-4 text-violet-600" />,
    });
  }

  if (num("taskOpen") > 0) {
    pendingItems.push({
      id: "taskOpen",
      title: t("workSummary.taskOpenTitle"),
      count: num("taskOpen"),
      tone: "teal",
      actionLabel: t("workSummary.taskOpenAction"),
      onAction: () => setModule("operations"),
      icon: <Icons.ListChecks className="size-4 text-teal-600" />,
    });
  }

  // Blokaj tıklandığında ilgili modüle yönlendirme
  const handleBlockerNavigate = (key: string) => {
    const k = key.toLowerCase();
    if (k.includes("form")) setModule("forms");
    else if (k.includes("bank") || k.includes("pay") || k.includes("fin")) setModule("finance");
    else if (k.includes("cat") || k.includes("reg")) setModule("registrations");
    else if (k.includes("sess") || k.includes("prog")) setModule("program");
    else setModule("editions");
  };

  const sciByStatus = (kpi.sciByStatus as Record<string, number>) ?? {};
  const sciTotal = Object.values(sciByStatus).reduce((a: number, b) => a + Number(b), 0);
  const sciUnderReview = sciByStatus.UNDER_REVIEW ?? 0;

  return (
    <div className="space-y-6">
      {/* ── 1. İş Başlığı ve Kimliği ── */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {edition.name}
            </h1>
            <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary text-[10px] font-semibold">
              {macroDef?.label ?? macroStage}
            </Badge>
            <StatusBadge map={EDITION_STATUS} value={edition.status} />
            {edition.series?.name && (
              <Badge variant="secondary" className="font-normal">
                {edition.series.name}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {fmtDate(edition.startDate)} — {fmtDate(edition.endDate)}
            {edition.venueName ? ` · ${edition.venueName}` : ""}
            {edition.city ? ` (${edition.city})` : ""}
          </p>

          {/* 5 Aşamalı Yaşam Döngüsü İlerleme Göstergesi */}
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto py-1">
            {MACRO_LIFECYCLE_STAGES.map((s, idx) => {
              const stages = ["DRAFT", "PLANNING", "ACTIVE", "COMPLETED", "ARCHIVED"];
              const currentIdx = stages.indexOf(macroStage);
              const isPast = idx < currentIdx;
              const isCurrent = idx === currentIdx;
              return (
                <div key={s.id} className="flex items-center gap-1.5 shrink-0">
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                      isCurrent
                        ? "bg-primary text-primary-foreground font-semibold"
                        : isPast
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {isPast && <Icons.Check className="size-3" />}
                    <span>{s.label}</span>
                  </div>
                  {idx < MACRO_LIFECYCLE_STAGES.length - 1 && (
                    <Icons.ChevronRight className="size-3 text-muted-foreground/40 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {t("workSummary.lastUpdated")}: {fmtDateTime(data.lastUpdated)}
          </span>
          <Button size="sm" variant="outline" onClick={onReload}>
            <Icons.RefreshCw className="size-3.5" />
            {t("workSummary.refresh")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setModule("editions")}>
            <Icons.ListChecks className="size-3.5" />
            {t("workSummary.setupChecklist")}
          </Button>
          <Button size="sm" onClick={() => window.open(`/e/${edition.id}`, "_blank")}>
            <Icons.ExternalLink className="size-3.5" />
            {t("workSummary.externalPreview")}
          </Button>
        </div>
      </div>

      {/* ── 2. Arşivlenmiş / Kapanmış İş Mutabakat Modu ── */}
      {isArchived && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Icons.Archive className="size-5 text-violet-600" />
                <h2 className="text-sm font-semibold text-violet-950">
                  {t("workSummary.archivedTitle")}
                </h2>
              </div>
              <p className="text-xs text-violet-800">
                {t("workSummary.archivedDesc")} {t("workSummary.archivedNotice")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-violet-300 bg-background text-violet-900 hover:bg-violet-100"
              onClick={() => setModule("finance")}
            >
              {t("workSummary.archiveReportAction")}
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-background/80 p-2.5">
              <p className="text-[11px] text-muted-foreground">{t("workSummary.finalConfirmed")}</p>
              <p className="text-lg font-bold text-foreground">{num("confirmed")}</p>
            </div>
            <div className="rounded-lg bg-background/80 p-2.5">
              <p className="text-[11px] text-muted-foreground">{t("workSummary.finalArrived")}</p>
              <p className="text-lg font-bold text-foreground">{num("arrived")}</p>
            </div>
            <div className="rounded-lg bg-background/80 p-2.5">
              <p className="text-[11px] text-muted-foreground">{t("workSummary.netCollection")}</p>
              <p className="text-lg font-bold text-emerald-600">{fmtMoney(num("collected") - num("refunded"))}</p>
            </div>
            <div className="rounded-lg bg-background/80 p-2.5">
              <p className="text-[11px] text-muted-foreground">{t("workSummary.openBalance")}</p>
              <p className="text-lg font-bold text-amber-600">{fmtMoney(num("openBalance"))}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. Kurulum Hazırlığı Denetimi (Readiness Score & Blockers) ── */}
      <SectionCard
        title={t("workSummary.readiness")}
        desc={`Hazırlık ${checks?.score ?? 0}/8 — ${t("workSummary.readinessDesc")}`}
        action={
          <div className="flex items-center gap-3">
            <div className="w-28">
              <Progress
                value={checks?.pct ?? 0}
                className="h-2"
                aria-label={`Kurulum hazırlığı yüzde ${checks?.pct ?? 0}`}
              />
              <p className="mt-1 text-right text-[11px] font-medium text-muted-foreground">
                %{checks?.pct ?? 0}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setModule("editions")}>
              {t("workSummary.openChecklist")}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {[
            ...(checks?.blockers ?? []).map((b) => ({ ...b, tone: "rose" as const })),
            ...(checks?.warnings ?? []).map((w) => ({ ...w, tone: "amber" as const })),
          ].map((c) => (
            <button
              key={c.key}
              onClick={() => handleBlockerNavigate(c.key)}
              className={cn(
                "group flex w-full items-start justify-between rounded-lg border p-2.5 text-left text-sm transition hover:shadow-xs",
                c.tone === "rose"
                  ? "border-rose-200 bg-rose-50/60 hover:border-rose-300"
                  : "border-amber-200 bg-amber-50/60 hover:border-amber-300"
              )}
            >
              <div className="flex items-start gap-2">
                {c.tone === "rose" ? (
                  <Icons.OctagonAlert className="mt-0.5 size-4 shrink-0 text-rose-500" />
                ) : (
                  <Icons.TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                )}
                <span>{c.message}</span>
              </div>
              <span className="shrink-0 text-xs font-medium text-muted-foreground transition group-hover:text-foreground">
                {t("workSummary.openModule")}
              </span>
            </button>
          ))}

          {(checks?.blockers?.length ?? 0) + (checks?.warnings?.length ?? 0) === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 text-sm text-emerald-800">
              <Icons.CircleCheck className="size-4 text-emerald-600" />
              {t("workSummary.allChecksClean")}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── 4. Bekleyen Kararlar ve Onaylar (Cockpit Paneli) ── */}
      <SectionCard
        title={t("workSummary.pendingDecisions")}
        desc={t("workSummary.pendingDecisionsDesc")}
      >
        {pendingItems.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-800">
            <Icons.CheckCircle2 className="size-4 text-emerald-600" />
            {t("workSummary.noPendingDecisions")}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex flex-col justify-between rounded-xl border p-3.5 transition",
                  item.tone === "rose" && "border-rose-200 bg-rose-50/40",
                  item.tone === "amber" && "border-amber-200 bg-amber-50/40",
                  item.tone === "violet" && "border-violet-200 bg-violet-50/40",
                  item.tone === "teal" && "border-teal-200 bg-teal-50/40"
                )}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">{item.title}</span>
                    {item.icon}
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-foreground">{item.count}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full justify-between bg-background text-xs font-medium"
                  onClick={item.onAction}
                >
                  <span>{item.actionLabel}</span>
                  <Icons.ArrowRight className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── 5. Açık Modüller Durum Özeti (Yalnız Bu İşte Etkin Olanlar) ── */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {t("workSummary.activeModules")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {t("workSummary.activeModulesDesc")}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Kayıt Modülü (Eğer bu işte açıksa) */}
          {hasCap("REGISTRATION", ["REGISTRATIONS", "REGISTRATION_PUBLIC"]) && (
            <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("workSummary.registrationsTitle")}
                </span>
                <Icons.Users className="size-4 text-primary" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("workSummary.applications")}</p>
                  <p className="text-lg font-bold tabular-nums">{num("applications")}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("workSummary.confirmed")}</p>
                  <p className="text-lg font-bold tabular-nums text-emerald-600">{num("confirmed")}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setModule("registrations")}
              >
                {t("modules.registrations")} →
              </Button>
            </div>
          )}

          {/* Program Modülü */}
          {hasCap("PROGRAM") && (
            <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("workSummary.programTitle")}
                </span>
                <Icons.Calendar className="size-4 text-primary" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("workSummary.sessions")}</p>
                  <p className="text-lg font-bold tabular-nums">{num("sessionCount")}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("workSummary.published")}</p>
                  <p className="text-lg font-bold tabular-nums text-teal-600">{num("publishedSessions")}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setModule("program")}
              >
                {t("modules.program")} →
              </Button>
            </div>
          )}

          {/* Bilimsel Modül */}
          {hasCap("SCIENTIFIC") && (
            <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("workSummary.scientificTitle")}
                </span>
                <Icons.BookOpenCheck className="size-4 text-primary" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("workSummary.submissions")}</p>
                  <p className="text-lg font-bold tabular-nums">{sciTotal}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("workSummary.underReview")}</p>
                  <p className="text-lg font-bold tabular-nums text-amber-600">{sciUnderReview}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setModule("scientific")}
              >
                {t("modules.scientific")} →
              </Button>
            </div>
          )}

          {/* Sponsorluk Modülü */}
          {hasCap("SPONSORSHIP", ["SPONSORS"]) && (
            <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("workSummary.sponsorsTitle")}
                </span>
                <Icons.Award className="size-4 text-primary" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("workSummary.sponsorshipValue")}</p>
                  <p className="text-sm font-bold tabular-nums truncate">{fmtMoney(num("sponsorshipValue"))}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("workSummary.entitlements")}</p>
                  <p className="text-sm font-bold tabular-nums">{num("consumed")}/{num("granted")}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setModule("sponsorship")}
              >
                {t("modules.sponsorship")} →
              </Button>
            </div>
          )}

          {/* Saha Modülü */}
          {hasCap("ACCESS_CONTROL", ["ONSITE", "BADGING"]) && (
            <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("workSummary.onsiteTitle")}
                </span>
                <Icons.ScanLine className="size-4 text-primary" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("workSummary.onsiteEntries")}</p>
                  <p className="text-lg font-bold tabular-nums text-emerald-600">{num("arrived")}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("workSummary.scans")}</p>
                  <p className="text-lg font-bold tabular-nums">{num("scanCount")}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setModule("onsite")}
              >
                {t("modules.onsite")} →
              </Button>
            </div>
          )}

          {/* Konaklama Modülü */}
          {hasCap("ACCOMMODATION") && (
            <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("workSummary.accommodationTitle")}
                </span>
                <Icons.Building2 className="size-4 text-primary" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("workSummary.reservations")}</p>
                  <p className="text-lg font-bold tabular-nums">{num("reservationCount")}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("workSummary.roomNights")}</p>
                  <p className="text-lg font-bold tabular-nums">{num("roomNightsSold")}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setModule("accommodation")}
              >
                {t("modules.accommodation")} →
              </Button>
            </div>
          )}

          {/* Dış Deneyimler ve Portallar */}
          {hasCap("PORTALS", ["COMMUNICATIONS"]) && (
            <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("workSummary.portalsTitle")}
                </span>
                <Icons.Globe className="size-4 text-primary" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  {t("workSummary.publicPortalActive")}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">/e/{edition.id}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setModule("portals")}
              >
                {t("modules.portals")} →
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── 6. Finans ve Bütçe Özeti ── */}
      <SectionCard
        title={t("workSummary.financeTitle")}
        desc={t("workSummary.financeDesc")}
        action={
          <Button variant="outline" size="sm" onClick={() => setModule("finance")}>
            {t("modules.finance")} →
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label={t("workSummary.ordered")} value={fmtMoney(num("ordered"))} sub="brüt sipariş toplamı" />
          <KpiCard label={t("workSummary.collected")} value={fmtMoney(num("collected"))} sub="tahsil edilen" tone="emerald" />
          <KpiCard label={t("workSummary.refunded")} value={fmtMoney(num("refunded"))} sub="iade edilen" tone="violet" />
          <KpiCard label={t("workSummary.openBalance")} value={fmtMoney(num("openBalance"))} sub="kalan borç bakiyesi" tone="amber" onClick={() => setModule("finance")} />
        </div>
      </SectionCard>

      {/* ── 7. Grafikler: Kayıt Eğrisi ve Kaynak Dağılımı ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title={t("workSummary.curveTitle")}
          desc="gönderim tarihi bazlı başvuru trendi"
          className="min-w-0 lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.curve ?? []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 190)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="count" name={t("workSummary.applications")} stroke="#0f9b8e" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title={t("workSummary.sourceTitle")} desc="kayıt kanalları dağılımı">
          <div inert>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={Object.entries(data.bySource ?? {}).map(([k, v]) => ({ name: k, value: v }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {Object.keys(data.bySource ?? {}).map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {Object.entries(data.bySource ?? {}).map(([k, v], i) => (
              <span key={k} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} /> {k}: {v}
              </span>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ── 8. Yaklaşan Görevler ve Son Hareketler ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={t("workSummary.upcomingTasks")}
          desc="termin sırasına göre iş görevleri"
          action={
            <Button variant="outline" size="sm" onClick={() => setModule("operations")}>
              {t("workSummary.viewAllTasks")}
            </Button>
          }
        >
          {(data.upcomingTasks ?? []).length === 0 ? (
            <EmptyState title={t("workSummary.noTasks")} desc="Bu iş için açık operasyonel görev bulunmuyor." />
          ) : (
            <ul className="space-y-2.5">
              {(data.upcomingTasks ?? []).map((task) => (
                <li key={task.id} className="flex items-start gap-2.5 text-sm">
                  <span
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full",
                      task.priority === "URGENT"
                        ? "bg-rose-500"
                        : task.priority === "HIGH"
                        ? "bg-amber-500"
                        : "bg-teal-500"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium leading-tight">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.dueDate ? `son ${fmtDate(task.dueDate)}` : "tarihsiz"} ·{" "}
                      {label(TASK_PRIORITY, task.priority)}
                      {task.assignee ? ` · ${task.assignee.firstName} ${task.assignee.lastName}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={t("workSummary.recentActivity")} desc="iş kapsamındaki son domain olayları">
          {(data.recentActivity ?? []).length === 0 ? (
            <EmptyState title={t("workSummary.noActivity")} />
          ) : (
            <ol className="relative space-y-3 border-l pl-4">
              {(data.recentActivity ?? []).map((activity) => (
                <li key={activity.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary/70" />
                  <p className="text-sm leading-snug">{activity.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {activity.actorName ?? "Sistem"} · {fmtDateTime(activity.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
