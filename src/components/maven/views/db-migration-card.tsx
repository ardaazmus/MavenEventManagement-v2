"use client";
// ─── Veritabanı & Migration (GEÇİCİ) — SQLite → MySQL/MariaDB Hostinger taşınma denetimi ──
// Kullanıcı isteği: "tüm database ve yolları bu migrationu kolay yapabilmesi adına geçici
// bir ayar sekmesi ekle ve mysql tarafının kontrollerini de şimdiden yaz."
// Yalnız /api/admin/db-migration okuma ucunu konuşur — hiçbir yazım yapmaz.
// Taşınma tamamlandığında bu kart ve API kaldırılabilir (geçici etiketi buradan).
import { useState } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard, EmptyState, Loading, ErrorState, useApi } from "../bits";
import { Chip } from "../bits";
import { useLang, t } from "@/lib/i18n";
import { apiGet } from "@/lib/client";
import { canManageTeam } from "@/lib/constants";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type Check = { key: string; label: string; status: "PASS" | "WARN" | "TODO" | "INFO"; detail: string };
type MigrationStatus = {
  datasource: { provider: string; label: string; path: string | null; sizeBytes: number | null };
  modelCount: number;
  tables: { name: string; rows: number }[];
  checks: Check[];
  runbook: { step: number; title: string; command: string }[];
  generatedAt: string;
};

const STATUS_TONE: Record<Check["status"], "teal" | "amber" | "rose" | "violet"> = {
  PASS: "teal",
  INFO: "violet",
  WARN: "amber",
  TODO: "rose",
};
const STATUS_ICON: Record<Check["status"], typeof Icons.CheckCircle2> = {
  PASS: Icons.CheckCircle2,
  INFO: Icons.Info,
  WARN: Icons.AlertTriangle,
  TODO: Icons.CircleDashed,
};

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DatabaseMigrationCard() {
  const { t } = useLang();
  const { me } = useApp();
  const canManage = canManageTeam(me?.role ?? null);
  // sanctionsız veri yüklemesi — paylaşılan useApi deseni (lint uyumlu)
  const { data, error, reload, loading } = useApi<MigrationStatus>(
    () => (canManage ? apiGet<MigrationStatus>("/api/admin/db-migration") : Promise.resolve(null as unknown as MigrationStatus)),
    [canManage],
  );
  const [tablesOpen, setTablesOpen] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const copy = async (step: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(step);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* pano izni yok — sessiz */
    }
  };

  return (
    <SectionCard
      title={t("settingsView.dbm.title")}
      desc={t("settingsView.dbm.desc")}
      action={<Chip tone="amber">{t("settingsView.dbm.tempChip")}</Chip>}
    >
      {!canManage ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed bg-muted/20 p-6 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-amber-50 text-amber-600">
            <Icons.Lock className="size-5" />
          </span>
          <p className="text-sm font-medium">{t("common.adminLockedTitle")}</p>
          <p className="max-w-sm text-xs text-muted-foreground">{t("common.adminLockedDesc")}</p>
        </div>
      ) : error ? (
        <ErrorState message={error === "Hata" ? t("settingsView.dbm.loadFail") : error} onRetry={() => reload()} />
      ) : !data ? (
        <Loading rows={4} />
      ) : (
        <div className="space-y-4">
          {/* özet şeridi */}
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Icons.Database className="size-3" /> {t("settingsView.dbm.provider")}
              </p>
              <p className="mt-1 text-sm font-bold">{data.datasource.label}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Icons.FolderOpen className="size-3" /> {t("settingsView.dbm.path")}
              </p>
              <p className="mt-1 truncate text-xs font-mono" title={data.datasource.path ?? ""}>{data.datasource.path ?? "—"}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Icons.HardDrive className="size-3" /> {t("settingsView.dbm.size")}
              </p>
              <p className="mt-1 text-sm font-bold tabular-nums">{fmtBytes(data.datasource.sizeBytes)}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Icons.Table2 className="size-3" /> {t("settingsView.dbm.tables")}
              </p>
              <p className="mt-1 text-sm font-bold tabular-nums">
                {data.tables.filter((x) => x.rows >= 0).length} / {data.modelCount} {t("settingsView.dbm.models")}
              </p>
            </div>
          </div>

          {/* MySQL hazır-bulunurluk kontrolleri */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
              <Icons.ShieldCheck className="size-3.5 text-teal-600" /> {t("settingsView.dbm.checksTitle")}
            </p>
            <div className="space-y-1.5">
              {data.checks.map((c) => {
                const SI = STATUS_ICON[c.status];
                return (
                  <div key={c.key} className="flex items-start gap-2 rounded-lg border bg-muted/10 p-2.5">
                    <SI className={cn("mt-0.5 size-4 shrink-0",
                      c.status === "PASS" && "text-emerald-500",
                      c.status === "INFO" && "text-violet-500",
                      c.status === "WARN" && "text-amber-500",
                      c.status === "TODO" && "text-rose-500")} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{c.label}</p>
                      <p className="text-[11px] leading-snug text-muted-foreground">{c.detail}</p>
                    </div>
                    <span className="ml-auto shrink-0"><Chip tone={STATUS_TONE[c.status]}>{c.status}</Chip></span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* runbook */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
              <Icons.ListChecks className="size-3.5 text-teal-600" /> {t("settingsView.dbm.runbookTitle")}
            </p>
            <div className="space-y-1.5">
              {data.runbook.map((r) => (
                <div key={r.step} className="flex items-start gap-2 rounded-lg border p-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{r.step}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{r.title}</p>
                    <code className="mt-0.5 block overflow-x-auto whitespace-nowrap rounded bg-muted/60 px-2 py-1 text-[10px] text-muted-foreground">{r.command}</code>
                  </div>
                  <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => void copy(r.step, r.command)} aria-label={t("settingsView.dbm.copy")}>
                    {copied === r.step ? <Icons.Check className="size-3.5 text-emerald-500" /> : <Icons.Copy className="size-3.5 text-muted-foreground" />}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* tablo satır sayıları */}
          <div>
            <button
              className="flex w-full items-center gap-1.5 text-xs font-semibold"
              onClick={() => setTablesOpen((v) => !v)}
              aria-expanded={tablesOpen}
            >
              <Icons.Table2 className="size-3.5 text-teal-600" /> {t("settingsView.dbm.tableCounts")}
              {tablesOpen ? <Icons.ChevronUp className="ml-auto size-3.5" /> : <Icons.ChevronDown className="ml-auto size-3.5" />}
            </button>
            {tablesOpen && (
              <div className="maven-scroll mt-2 grid max-h-64 gap-x-4 gap-y-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.tables.map((x) => (
                  <div key={x.name} className="flex items-center justify-between gap-2 border-b border-dashed px-1 py-0.5 text-[11px] last:border-0">
                    <span className="truncate font-mono">{x.name}</span>
                    <span className="tabular-nums text-muted-foreground">{x.rows < 0 ? "—" : x.rows.toLocaleString("tr-TR")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">{t("settingsView.dbm.generatedAt")}: {new Date(data.generatedAt).toLocaleString("tr-TR")}</p>
            <Button variant="outline" size="sm" onClick={() => reload()}>
              <Icons.RefreshCw className="size-3.5" /> {t("settingsView.dbm.refresh")}
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
