"use client";
// API Geçidi — çift yönlü veri akışı merkezi (düşünce bulutu 4)
// Entegrasyon kartları + çalıştırma (dry-run destekli) + webhook adresi/testi + canlı log akışı.
import { useEffect, useMemo, useState } from "react";
import { listEntity, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { PageHeader, SectionCard, EmptyState, Loading, ErrorState, useApi, StatusBadge, Chip, KpiCard } from "../bits";
import { INTEGRATION_KIND, INTEGRATION_DIRECTION, INTEGRATION_STATUS, label, fmtDate } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLang, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import * as Icons from "lucide-react";

interface ApiIntegrationRow {
  id: string; tenantId: string; editionId?: string | null; name: string; direction: string; kind: string;
  provider?: string | null; baseUrl?: string | null; authType: string; authConfig?: string | null; inboundToken?: string | null;
  status: string; lastRunAt?: string | null; lastStatus?: string | null; successCount: number; failCount: number;
  notes?: string | null; createdAt: string;
}
interface IntegrationLogRow {
  id: string; integrationId?: string | null; editionId?: string | null; direction: string; method?: string | null;
  endpoint?: string | null; statusCode?: number | null; ok: boolean; durationMs?: number | null; summary?: string | null;
  payload?: string | null; createdAt: string;
}

const KIND_ICON: Record<string, keyof typeof Icons> = {
  REST: "Braces", WEBHOOK: "Webhook", PAYMENT: "CreditCard", MAIL: "Mail", SMS: "MessageSquare", CRM: "Database", TICKETING: "Ticket",
};
const AUTH_LABEL: Record<string, string> = {
  NONE: "Kimliksiz", API_KEY: "API Key", BEARER: "Bearer Token", BASIC: "Basic Auth", OAUTH2: "OAuth 2.0", SIGNATURE: "İmzalı",
};
const INT_TONE: Record<string, string> = {
  ERROR: "bg-rose-50 text-rose-700 border-rose-200",
  PAUSED: "bg-amber-50 text-amber-700 border-amber-200",
  DRAFT: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

// hızlı şablonlar — yeni entegrasyon diyalogu
const PRESETS: { label: string; icon: keyof typeof Icons; values: { kind: string; provider: string; authType: string; direction: string } }[] = [
  { label: "Ödeme (Iyzico/PayTR)", icon: "CreditCard", values: { kind: "PAYMENT", provider: "IYZICO", authType: "BASIC", direction: "OUTBOUND" } },
  { label: "REST API", icon: "Braces", values: { kind: "REST", provider: "", authType: "API_KEY", direction: "OUTBOUND" } },
  { label: "Webhook", icon: "Webhook", values: { kind: "WEBHOOK", provider: "", authType: "NONE", direction: "INBOUND" } },
  { label: "Mail", icon: "Mail", values: { kind: "MAIL", provider: "MAILJET", authType: "API_KEY", direction: "OUTBOUND" } },
];

const EMPTY_FORM = {
  name: "", direction: "OUTBOUND", kind: "REST", provider: "", baseUrl: "", authType: "API_KEY",
  key: "", token: "", user: "", pass: "", notes: "", tenantLevel: false,
};

function relTime(d?: string | null): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 0) return "az önce";
  if (diff < 60_000) return "az önce";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} dk önce`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} sa önce`;
  return `${Math.floor(diff / 86_400_000)} g önce`;
}

// authConfig JSON'u → { key, maskeli değer } — UI'da değerler asla düz gösterilmez
function maskAuthConfig(configJson?: string | null): { key: string; masked: string }[] {
  if (!configJson) return [];
  try {
    const obj = JSON.parse(configJson) as Record<string, unknown>;
    return Object.entries(obj).map(([key, v]) => ({
      key,
      masked: typeof v === "string" && v.length > 0 ? "•".repeat(Math.max(6, Math.min(v.length, 16))) : String(v),
    }));
  } catch {
    return [{ key: "authConfig", masked: "••••••" }];
  }
}

interface OutboxRow {
  id: string; aggregateType: string; aggregateId: string; eventType: string;
  payload: unknown; status: string; error?: string | null; retryCount: number;
  maxAttempts: number; nextRunAt: string; deadReason?: string | null; createdAt: string;
}

// P22.5: outbox operasyon paneli — kuyruk + iade + tarama (yük sunucuda maskeli)
function OutboxOpsPanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState("__all__");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draining, setDraining] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, reload, loading } = useApi<{ counts: Record<string, number>; items: OutboxRow[] }>(
    async () => {
      const q = status === "__all__" ? "" : `?status=${status}`;
      const res = await fetch(`/api/admin/outbox${q}`);
      if (!res.ok) throw new Error(`Kuyruk alınamadı (${res.status})`);
      return (await res.json()) as { counts: Record<string, number>; items: OutboxRow[] };
    },
    [status],
  );
  const retry = async (id: string) => {
    setBusyId(id);
    try {
      await apiSend("/api/admin/outbox", "POST", { action: "retry", id });
      toast({ title: t("integrations.outboxRetried") });
      reload();
    } catch (e) {
      toast({ title: t("integrations.outboxRetryError"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setBusyId(null); }
  };
  const drain = async () => {
    setDraining(true);
    try {
      const r = await apiSend<{ completed: number; failed: number; dead: number }>("/api/admin/outbox/drain", "POST", {});
      toast({ title: t("integrations.outboxDrained"), description: `${r.completed} ok · ${r.failed} hata · ${r.dead} ölü` });
      reload();
    } catch (e) {
      toast({ title: t("integrations.outboxDrainError"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setDraining(false); }
  };
  const counts = data?.counts ?? {};
  return (
    <SectionCard
      title={t("integrations.outboxTitle")}
      desc={t("integrations.outboxDesc")}
      action={
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label={t("integrations.outboxFilter")} className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">—</SelectItem>
              {["PENDING", "PROCESSING", "COMPLETED", "FAILED", "DEAD"].map((s) => (
                <SelectItem key={s} value={s}>{s}{counts[s] ? ` (${counts[s]})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={drain} disabled={draining}>
            <Icons.Play className="size-3" /> {draining ? t("integrations.outboxDraining") : t("integrations.outboxDrain")}
          </Button>
        </div>
      }
    >
      {loading ? <Loading /> : (data?.items?.length ?? 0) === 0 ? (
        <EmptyState title={t("integrations.outboxEmpty")} />
      ) : (
        <div className="space-y-2">
          {(data?.items ?? []).map((o) => (
            <div key={o.id} className="rounded-lg border bg-card p-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={o.status === "COMPLETED" ? "teal" : o.status === "DEAD" || o.status === "FAILED" ? "rose" : "amber"}>{o.status}</Chip>
                <code className="font-mono font-semibold">{o.eventType}</code>
                <span className="text-muted-foreground">{o.aggregateType} · {o.retryCount}/{o.maxAttempts}</span>
                <span className="ml-auto text-muted-foreground">{relTime(o.createdAt)}</span>
                {(o.status === "FAILED" || o.status === "DEAD") && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={busyId === o.id} onClick={() => retry(o.id)}>
                    <Icons.RotateCcw className="size-3" /> {busyId === o.id ? t("integrations.outboxRetrying") : t("integrations.outboxRetry")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setOpenId(openId === o.id ? null : o.id)}>
                  {t("integrations.outboxPayload")}
                </Button>
              </div>
              {o.error && <p className="mt-1 text-rose-700">{o.error}</p>}
              {o.status === "DEAD" && o.deadReason && (
                <p className="mt-1 text-muted-foreground">{t("integrations.outboxDeadReason")}: {o.deadReason}</p>
              )}
              {o.status === "FAILED" && (
                <p className="mt-1 text-muted-foreground">{t("integrations.outboxNextRun")}: {fmtDate(o.nextRunAt, true)}</p>
              )}
              {openId === o.id && (
                <pre className="maven-scroll mt-1.5 max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[10.5px] text-muted-foreground">
                  {JSON.stringify(o.payload, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export function ApiGatewayView() {
  const { currentEditionId, editions, tenant, bump, refreshKey } = useApp();
  const { toast } = useToast();
  useLang();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const [dryRun, setDryRun] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiIntegrationRow | null>(null);
  const [editing, setEditing] = useState<ApiIntegrationRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiIntegrationRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logFilter, setLogFilter] = useState("__all__");
  const [logTick, setLogTick] = useState(0);

  const { data: integrations, error, reload: reloadIntegrations, loading } = useApi<ApiIntegrationRow[]>(
    () => listEntity<ApiIntegrationRow>("api-integrations", { tenantId: tenant?.id ?? undefined, limit: 200 }),
    [tenant?.id, refreshKey],
  );
  const { data: logs, reload: reloadLogs, loading: logsLoading } = useApi<IntegrationLogRow[]>(
    () => listEntity<IntegrationLogRow>("integration-logs", { limit: 60 }),
    [refreshKey, logTick],
  );

  // log akışı 20 sn'de bir kendini tazeler (canlı hissi)
  useEffect(() => {
    const timer = setInterval(() => setLogTick((x) => x + 1), 20_000);
    return () => clearInterval(timer);
  }, []);

  const activeCount = (integrations ?? []).filter((i) => i.status === "ACTIVE").length;
  const totalOk = (integrations ?? []).reduce((s, i) => s + i.successCount, 0);
  const totalFail = (integrations ?? []).reduce((s, i) => s + i.failCount, 0);
  const successRate = totalOk + totalFail > 0 ? Math.round((totalOk / (totalOk + totalFail)) * 100) : null;
  const logs24h = (logs ?? []).filter((l) => Date.now() - new Date(l.createdAt).getTime() < 86_400_000).length;

  const visibleLogs = useMemo(
    () => (logs ?? []).filter((l) => logFilter === "__all__" || l.integrationId === logFilter).slice(0, 30),
    [logs, logFilter],
  );

  const editionName = (id?: string | null) => editions.find((e) => e.id === id)?.name ?? null;
  const hookUrl = (token: string) => `${origin || ""}/api/integrations/hook/${token}`;

  const copyText = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: t("integrations.copied", { what }), description: t("integrations.copiedDesc") });
    } catch {
      toast({ title: t("integrations.copyFailed"), description: t("integrations.copyFailedDesc"), variant: "destructive" });
    }
  };

  const runIntegration = async (i: ApiIntegrationRow) => {
    setRunningId(i.id);
    try {
      const r = await apiSend<{ ok: boolean; statusCode: number | null; durationMs: number; summary: string; errorText: string | null }>(
        "/api/integrations/run", "POST", { id: i.id, dryRun },
      );
      toast({
        title: r.ok ? (dryRun ? t("integrations.dryRunDone") : t("integrations.runDone")) : t("integrations.runFailed"),
        description: `${r.summary} · ${r.durationMs}ms`,
        variant: r.ok ? "default" : "destructive",
      });
      reloadIntegrations(); reloadLogs(); bump();
    } catch (e) {
      toast({ title: t("integrations.runError"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setRunningId(null); }
  };

  const toggleStatus = async (i: ApiIntegrationRow) => {
    setBusy(true);
    try {
      const next = i.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
      await apiSend(`/api/api-integrations/${i.id}`, "PUT", { status: next });
      toast({ title: next === "ACTIVE" ? t("integrations.activated") : t("integrations.paused"), description: i.name });
      reloadIntegrations(); bump();
    } catch (e) {
      toast({ title: t("integrations.statusError"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const testWebhook = async (i: ApiIntegrationRow) => {
    if (!i.inboundToken) return;
    setTestingId(i.id);
    try {
      const res = await fetch(`/api/integrations/hook/${i.inboundToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "PARTICIPANT", fullName: "Test Webhook Kullanıcısı", email: `webhook-${Date.now()}@example.com` }),
      });
      const data = (await res.json()) as { processed?: string | null; error?: string };
      if (res.ok) {
        toast({ title: t("integrations.webhookOk"), description: t("integrations.webhookOkDesc", { result: data.processed ?? t("integrations.accepted") }) });
        reloadIntegrations(); reloadLogs(); bump();
      } else {
        toast({ title: t("integrations.webhookRejected"), description: data.error ?? `HTTP ${res.status}`, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: t("integrations.webhookError"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setTestingId(null); }
  };

  const openEdit = (i: ApiIntegrationRow) => {
    const auth = (() => {
      try { return JSON.parse(i.authConfig ?? "{}") as Record<string, string>; } catch { return {}; }
    })();
    setForm({
      name: i.name, direction: i.direction, kind: i.kind, provider: i.provider ?? "", baseUrl: i.baseUrl ?? "",
      authType: i.authType, key: auth.key ?? "", token: auth.token ?? "", user: auth.user ?? "", pass: auth.pass ?? "",
      notes: i.notes ?? "", tenantLevel: !i.editionId,
    });
    setEditing(i);
    setFormOpen(true);
  };

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, tenantLevel: false });
    setEditing(null);
    setFormOpen(true);
  };

  const buildAuthConfig = (): string | null => {
    if (form.authType === "API_KEY") return form.key ? JSON.stringify({ key: form.key }) : null;
    if (form.authType === "BEARER") return form.token ? JSON.stringify({ token: form.token }) : null;
    if (form.authType === "BASIC") return (form.user || form.pass) ? JSON.stringify({ user: form.user, pass: form.pass }) : null;
    return null;
  };

  const saveForm = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    const base = {
      name: form.name.trim(), direction: form.direction, kind: form.kind,
      provider: form.provider.trim() || null, baseUrl: form.baseUrl.trim() || null, authType: form.authType,
      authConfig: buildAuthConfig(), notes: form.notes.trim() || null,
    };
    try {
      if (editing) {
        await apiSend(`/api/api-integrations/${editing.id}`, "PUT", {
          ...base,
          editionId: form.tenantLevel ? null : editing.editionId ?? currentEditionId,
        });
        toast({ title: t("integrations.updated"), description: form.name.trim() });
      } else {
        if (!tenant?.id) throw new Error(t("integrations.tenantNotLoaded"));
        const isInbound = form.direction === "INBOUND";
        await apiSend("/api/api-integrations", "POST", {
          ...base,
          tenantId: tenant.id,
          editionId: form.tenantLevel ? null : currentEditionId,
          status: "DRAFT",
          inboundToken: isInbound ? `maven-hook-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}` : null,
        });
        toast({
          title: t("integrations.draftCreated"),
          description: isInbound ? t("integrations.draftInboundDesc") : t("integrations.draftDesc"),
        });
      }
      setFormOpen(false);
      reloadIntegrations(); bump();
    } catch (e) {
      toast({ title: t("integrations.saveError"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const removeIntegration = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await apiSend(`/api/api-integrations/${deleteTarget.id}`, "DELETE");
      toast({ title: t("integrations.deleted"), description: t("integrations.deletedDesc") });
      setDeleteTarget(null);
      reloadIntegrations(); reloadLogs(); bump();
    } catch (e) {
      toast({ title: t("integrations.deleteError"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (loading && !integrations) return <Loading rows={6} />;
  if (error) return <ErrorState message={error} onRetry={reloadIntegrations} />;

  return (
    <div className="space-y-5">
      <PageHeader title={t("integrations.pageTitle")} desc={t("integrations.pageDesc")}>
        <Button size="sm" onClick={openCreate}>
          <Icons.Plus className="size-4" /> {t("integrations.newButton")}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label={t("integrations.kpiActive")} value={activeCount} sub={t("integrations.kpiActiveSub", { n: (integrations ?? []).length })} tone="teal" icon={<Icons.PlugZap className="size-4" />} />
        <KpiCard
          label={t("integrations.kpiSuccessRate")}
          value={successRate === null ? "—" : `%${successRate}`}
          sub={`${totalOk} ✓ / ${totalFail} ✗`}
          tone={successRate !== null && successRate < 60 ? "rose" : "emerald"}
          icon={<Icons.Gauge className="size-4" />}
        />
        <KpiCard label={t("integrations.kpiLogs")} value={logs24h} sub={t("integrations.kpiLogsSub")} tone="amber" icon={<Icons.ScrollText className="size-4" />} />
        <KpiCard
          label={t("integrations.kpiDryRun")}
          value={dryRun ? t("integrations.dryOn") : t("integrations.dryOff")}
          sub={dryRun ? t("integrations.dryOnSub") : t("integrations.dryOffSub")}
          tone={dryRun ? "neutral" : "rose"}
          icon={<Icons.FlaskConical className="size-4" />}
          onClick={() => setDryRun((v) => !v)}
          detailHref={t("integrations.dryRunHint")}
        />
      </div>

      {/* Entegrasyon kartları */}
      <SectionCard
        title={t("integrations.listTitle")}
        desc={t("integrations.listDesc")}
        action={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={dryRun} onCheckedChange={setDryRun} aria-label={t("integrations.ariaDryRun")} id="dryrun-switch" />
            <label htmlFor="dryrun-switch" className="cursor-pointer select-none">{t("integrations.dryRunToggle")}</label>
          </div>
        }
      >
        {(integrations ?? []).length === 0 ? (
          <EmptyState
            title={t("integrations.emptyTitle")}
            desc={t("integrations.emptyDesc")}
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {(integrations ?? []).map((i, idx) => {
              const KIcon = (Icons[KIND_ICON[i.kind] ?? "Plug"] as typeof Icons.Plug);
              const total = i.successCount + i.failCount;
              const okPct = total ? Math.round((i.successCount / total) * 100) : 0;
              const isInbound = i.direction === "INBOUND";
              return (
                <div
                  key={i.id}
                  className="animate-in flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md fade-in slide-in-from-bottom-1 fill-mode-backwards"
                  style={{ animationDelay: `${Math.min(idx, 8) * 45}ms` }}
                >
                  <button type="button" onClick={() => setDetail(i)} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg" aria-label={t("integrations.openDetail", { name: i.name })}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-500/10 text-teal-600 transition-transform duration-200 hover:scale-110">
                          <KIcon className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{i.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <Chip tone={isInbound ? "amber" : "teal"}>
                              {isInbound ? <Icons.ArrowDownLeft className="mr-0.5 inline size-3" /> : <Icons.ArrowUpRight className="mr-0.5 inline size-3" />}
                              {isInbound ? t("integrations.inChip") : t("integrations.outChip")}
                            </Chip>
                            <Chip>{label(INTEGRATION_KIND, i.kind)}</Chip>
                            {i.provider && <Chip tone="violet">{i.provider}</Chip>}
                          </div>
                        </div>
                      </div>
                      <StatusBadge map={INTEGRATION_STATUS} value={i.status} className={INT_TONE[i.status]} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Icons.KeyRound className="size-3" />{AUTH_LABEL[i.authType] ?? i.authType}</span>
                      <span className="inline-flex items-center gap-1">
                        <Icons.Clock className="size-3" />
                        {i.lastRunAt ? t("integrations.lastRun", { time: relTime(i.lastRunAt) }) : t("integrations.neverRan")}
                      </span>
                      {i.lastStatus && (
                        <span className={cn("inline-flex items-center gap-1 font-medium", i.lastStatus === "OK" ? "text-emerald-600" : "text-rose-600")}>
                          {i.lastStatus === "OK" ? t("integrations.lastOk") : t("integrations.lastFail")}
                        </span>
                      )}
                    </div>

                    {/* başarı/başarısızlık mini çubuğu */}
                    <div className="mt-2.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={t("integrations.barAria", { ok: i.successCount, fail: i.failCount })}>
                        <div className="h-full w-full origin-left rounded-full bg-emerald-500 transition-transform duration-500 ease-out" style={{ transform: `scaleX(${Math.min(100, Math.max(0, okPct)) / 100})` }} />
                      </div>
                      <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">{t("integrations.barText", { ok: i.successCount, fail: i.failCount })}</p>
                    </div>
                  </button>

                  {isInbound && i.inboundToken && (
                    <div className="mt-3 rounded-lg border bg-muted/40 p-2">
                      <div className="flex items-center gap-1.5">
                        <code className="maven-scroll min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-card px-2 py-1 font-mono text-[10.5px] text-muted-foreground" title={hookUrl(i.inboundToken)}>
                          POST /api/integrations/hook/{i.inboundToken}
                        </code>
                        <button
                          type="button"
                          aria-label={t("integrations.copyHookAria")}
                          onClick={() => copyText(hookUrl(i.inboundToken ?? ""), t("integrations.webhookAddress"))}
                          className="grid size-6 shrink-0 place-items-center rounded border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Icons.Copy className="size-3" />
                        </button>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-1.5 h-7 w-full text-[11px]"
                        onClick={() => testWebhook(i)}
                        disabled={testingId === i.id || i.status !== "ACTIVE"}
                      >
                        {testingId === i.id ? t("integrations.sending") : <><Icons.SendHorizontal className="size-3" /> {t("integrations.testWebhookBtn")}</>}
                      </Button>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
                    <Button size="sm" className="h-7 text-[11px]" onClick={() => runIntegration(i)} disabled={runningId === i.id || i.status === "PAUSED"}>
                      {runningId === i.id ? <><Icons.Loader2 className="size-3 animate-spin" /> {t("integrations.running")}</> : <><Icons.Play className="size-3" /> {t("integrations.runBtn")}</>}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => toggleStatus(i)} disabled={busy}>
                      {i.status === "ACTIVE" ? <><Icons.Pause className="size-3" /> {t("integrations.pauseBtn")}</> : <><Icons.PlayCircle className="size-3" /> {t("integrations.activateBtn")}</>}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => openEdit(i)}>
                      <Icons.Pencil className="size-3" /> {t("integrations.editBtn")}
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto h-7 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setDeleteTarget(i)}>
                      <Icons.Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Ödeme sağlayıcı notu */}
      <SectionCard title={t("integrations.providersTitle")} desc={t("integrations.providersDesc")}>
        <div className="flex flex-wrap items-center gap-3">
          <Icons.CreditCard className="size-5 shrink-0 text-teal-600" aria-hidden />
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            {t("integrations.providersBody1")} <b className="text-foreground">PAYMENT</b> {t("integrations.providersBody2")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {["IYZICO", "PAYTR", "STRIPE"].map((p) => <Chip key={p} tone="violet">{p}</Chip>)}
          </div>
        </div>
      </SectionCard>

      {/* Log akışı */}
      <SectionCard
        title={t("integrations.logsTitle")}
        desc={t("integrations.logsDesc")}
        action={
          <Select value={logFilter} onValueChange={setLogFilter}>
            <SelectTrigger className="h-8 w-44 text-xs" aria-label={t("integrations.filterAria")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("integrations.allIntegrations")}</SelectItem>
              {(integrations ?? []).map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      >
        {logsLoading && !logs ? <Loading rows={3} /> : visibleLogs.length === 0 ? (
          <EmptyState title={t("integrations.logsEmptyTitle")} desc={t("integrations.logsEmptyDesc")} />
        ) : (
          <div className="maven-scroll max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {visibleLogs.map((l, idx) => (
              <div
                key={l.id}
                className="animate-in flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/40 fade-in slide-in-from-left-1 fill-mode-backwards"
                style={{ animationDelay: `${Math.min(idx, 10) * 25}ms` }}
              >
                <span className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md",
                  l.direction === "INBOUND" ? "bg-amber-500/10 text-amber-600" : "bg-teal-500/10 text-teal-600",
                )}>
                  {l.direction === "INBOUND" ? <Icons.ArrowDownLeft className="size-3" /> : <Icons.ArrowUpRight className="size-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-mono text-[11px] font-semibold text-foreground">{l.method ?? "—"}</span>
                    <span className="maven-scroll min-w-0 max-w-full flex-1 overflow-x-auto whitespace-nowrap font-mono text-[11px] text-muted-foreground" title={l.endpoint ?? ""}>{l.endpoint ?? "—"}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground" title={l.summary ?? ""}>{l.summary ?? "—"}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                      l.statusCode == null
                        ? "border-neutral-200 bg-neutral-100 text-neutral-500"
                        : l.ok
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-rose-200 bg-rose-50 text-rose-700",
                    )}
                  >
                    {l.statusCode ?? "N/A"}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{l.durationMs != null ? `${l.durationMs}ms` : "—"} · {relTime(l.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <OutboxOpsPanel />

      {/* Detay diyaloğu — uç nokta + maskeli kimlik */}
      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="maven-scroll max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-6">{detail?.name}</DialogTitle>
            <DialogDescription>
              {label(INTEGRATION_DIRECTION, detail?.direction)} · {label(INTEGRATION_KIND, detail?.kind)}{detail?.provider ? ` · ${detail.provider}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-emerald-500/10 p-2"><p className="text-lg font-semibold tabular-nums text-emerald-700">{detail.successCount}</p><p className="text-[10px] text-emerald-800">{t("integrations.statOk")}</p></div>
                <div className="rounded-lg bg-rose-500/10 p-2"><p className="text-lg font-semibold tabular-nums text-rose-700">{detail.failCount}</p><p className="text-[10px] text-rose-600/80">{t("integrations.statFail")}</p></div>
                <div className="rounded-lg bg-muted p-2"><p className="text-sm font-semibold tabular-nums">{fmtDate(detail.lastRunAt, true)}</p><p className="text-[10px] text-muted-foreground">{t("integrations.lastRunLabel", { status: detail.lastStatus ?? "—" })}</p></div>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium">{t("integrations.endpointLabel")}</p>
                <code className="maven-scroll block overflow-x-auto whitespace-nowrap rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
                  {detail.baseUrl ?? t("integrations.noBaseUrl")}
                </code>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium">{t("integrations.authHeading", { auth: AUTH_LABEL[detail.authType] ?? detail.authType })} <span className="font-normal text-muted-foreground">{t("integrations.maskedNote")}</span></p>
                {maskAuthConfig(detail.authConfig).length > 0 ? (
                  <div className="space-y-1">
                    {maskAuthConfig(detail.authConfig).map((a) => (
                      <div key={a.key} className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-[11px]">
                        <span className="font-semibold text-foreground">{a.key}</span>
                        <span className="text-muted-foreground">{a.masked}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed px-2.5 py-1.5 text-[11px] text-muted-foreground">{t("integrations.noAuthFields")}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">{t("integrations.scopeLabel")}</span>
                {detail.editionId
                  ? <Chip tone="teal"><Icons.CalendarRange className="mr-1 inline size-3" />{editionName(detail.editionId) ?? t("integrations.fallbackEdition")}</Chip>
                  : <Chip tone="violet">{t("integrations.tenantScope")}</Chip>}
                <Chip>{AUTH_LABEL[detail.authType] ?? detail.authType}</Chip>
              </div>

              {detail.notes && <p className="rounded-lg border bg-muted/30 p-2.5 text-xs text-muted-foreground">{detail.notes}</p>}

              {detail.direction === "INBOUND" && detail.inboundToken && (
                <div className="rounded-lg border bg-muted/40 p-2.5">
                  <p className="mb-1.5 text-xs font-medium">{t("integrations.hookAddressLabel")}</p>
                  <div className="flex items-center gap-1.5">
                    <code className="maven-scroll min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-card px-2 py-1 font-mono text-[10.5px] text-muted-foreground">
                      {hookUrl(detail.inboundToken)}
                    </code>
                    <Button size="sm" variant="outline" className="h-7 shrink-0 text-[11px]" onClick={() => copyText(hookUrl(detail.inboundToken ?? ""), t("integrations.webhookAddress"))}>
                      <Icons.Copy className="size-3" /> {t("integrations.copyBtn")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>{t("integrations.closeBtn")}</Button>
            {detail && <Button onClick={() => { setDetail(null); openEdit(detail); }}><Icons.Pencil className="size-3.5" /> {t("integrations.editBtn")}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Yeni / düzenle diyaloğu */}
      <Dialog open={formOpen} onOpenChange={(o) => !o && setFormOpen(false)}>
        <DialogContent className="maven-scroll max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("integrations.editTitle") : t("integrations.newTitle")}</DialogTitle>
            <DialogDescription>
              {editing ? editing.name : t("integrations.formDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!editing && (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-label={t("integrations.presetsAria")}>
                {PRESETS.map((p) => {
                  const PIcon = (Icons[p.icon] as typeof Icons.Braces);
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, ...p.values }))}
                      className="flex flex-col items-center gap-1 rounded-lg border bg-card px-2 py-2.5 text-center text-[10.5px] font-medium leading-tight transition-all hover:border-primary/40 hover:bg-muted/50 hover:shadow-sm"
                    >
                      <PIcon className="size-4 text-teal-600" />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="int-name">{t("integrations.fieldName")}</Label>
                <Input id="int-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("integrations.namePh")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("integrations.fieldDirection")}</Label>
                <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                  <SelectTrigger aria-label={t("integrations.fieldDirection")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(INTEGRATION_DIRECTION).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("integrations.fieldKind")}</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger aria-label={t("integrations.fieldKind")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(INTEGRATION_KIND).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="int-provider">{t("integrations.fieldProvider")}</Label>
                <Input id="int-provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder={t("integrations.providerPh")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="int-baseurl">Base URL</Label>
                <Input id="int-baseurl" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.ornek.com/v1" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("integrations.fieldAuthType")}</Label>
                <Select value={form.authType} onValueChange={(v) => setForm({ ...form, authType: v })}>
                  <SelectTrigger aria-label={t("integrations.authTypeAria")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(AUTH_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.authType === "API_KEY" && (
                  <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder={t("integrations.apiKeyPh")} className="mt-1.5 font-mono text-xs" />
                )}
                {form.authType === "BEARER" && (
                  <Input value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="Bearer token" className="mt-1.5 font-mono text-xs" />
                )}
                {form.authType === "BASIC" && (
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <Input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} placeholder={t("integrations.userPh")} className="font-mono text-xs" />
                    <Input type="password" value={form.pass} onChange={(e) => setForm({ ...form, pass: e.target.value })} placeholder={t("integrations.passPh")} className="font-mono text-xs" />
                  </div>
                )}
                {(form.authType === "OAUTH2" || form.authType === "SIGNATURE" || form.authType === "NONE") && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{t("integrations.noAuthHint")}</p>
                )}
              </div>

              {form.direction === "INBOUND" && !editing && (
                <div className="rounded-lg border border-dashed bg-muted/30 p-2.5 text-[11px] text-muted-foreground sm:col-span-2">
                  <Icons.Webhook className="mr-1 inline size-3" />
                  {t("integrations.hookNote1")} <code className="font-mono">/api/integrations/hook/&lt;token&gt;</code> {t("integrations.hookNote2")}
                </div>
              )}

              {!editing && (
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 sm:col-span-2">
                  <div>
                    <p className="text-xs font-medium">{t("integrations.tenantLevel")}</p>
                    <p className="text-[11px] text-muted-foreground">{t("integrations.tenantLevelDesc")}</p>
                  </div>
                  <Switch checked={form.tenantLevel} onCheckedChange={(v) => setForm({ ...form, tenantLevel: v })} aria-label={t("integrations.tenantLevel")} />
                </div>
              )}

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="int-notes">{t("integrations.fieldNotes")}</Label>
                <Textarea id="int-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder={t("integrations.notesPh")} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{t("integrations.cancelBtn")}</Button>
            <Button onClick={saveForm} disabled={busy || !form.name.trim()}>{busy ? t("integrations.saving") : editing ? t("integrations.saveBtn") : t("integrations.createBtn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Silme onayı */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("integrations.deleteTitle", { name: deleteTarget?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("integrations.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("integrations.cancelBtn")}</AlertDialogCancel>
            <AlertDialogAction onClick={removeIntegration} className="bg-rose-600 text-white hover:bg-rose-700">{busy ? t("integrations.deleting") : t("integrations.deleteBtn")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
