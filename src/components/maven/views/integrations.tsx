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

export function ApiGatewayView() {
  const { currentEditionId, editions, tenant, bump, refreshKey } = useApp();
  const { toast } = useToast();
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
    const t = setInterval(() => setLogTick((x) => x + 1), 20_000);
    return () => clearInterval(t);
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
      toast({ title: `${what} kopyalandı`, description: "Panoya alındı — dış sistem ekibine iletin." });
    } catch {
      toast({ title: "Kopyalanamadı", description: "Tarayıcı izni gerekli.", variant: "destructive" });
    }
  };

  const runIntegration = async (i: ApiIntegrationRow) => {
    setRunningId(i.id);
    try {
      const r = await apiSend<{ ok: boolean; statusCode: number | null; durationMs: number; summary: string; errorText: string | null }>(
        "/api/integrations/run", "POST", { id: i.id, dryRun },
      );
      toast({
        title: r.ok ? (dryRun ? "Deneme koşusu tamam" : "Çalıştırma tamamlandı") : "Çalıştırma hata ile bitti",
        description: `${r.summary} · ${r.durationMs}ms`,
        variant: r.ok ? "default" : "destructive",
      });
      reloadIntegrations(); reloadLogs(); bump();
    } catch (e) {
      toast({ title: "Çalıştırılamadı", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setRunningId(null); }
  };

  const toggleStatus = async (i: ApiIntegrationRow) => {
    setBusy(true);
    try {
      const next = i.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
      await apiSend(`/api/api-integrations/${i.id}`, "PUT", { status: next });
      toast({ title: next === "ACTIVE" ? "Entegrasyon aktifleştirildi" : "Entegrasyon duraklatıldı", description: i.name });
      reloadIntegrations(); bump();
    } catch (e) {
      toast({ title: "Durum değiştirilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
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
        toast({ title: "Webhook işlendi", description: `Sonuç: ${data.processed ?? "kabul edildi"} — yeni kişi + katılım zinciri çalıştı.` });
        reloadIntegrations(); reloadLogs(); bump();
      } else {
        toast({ title: "Webhook reddedildi", description: data.error ?? `HTTP ${res.status}`, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Webhook çağrısı başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
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
        toast({ title: "Entegrasyon güncellendi", description: form.name.trim() });
      } else {
        if (!tenant?.id) throw new Error("Tenant bilgisi yüklenmedi");
        const isInbound = form.direction === "INBOUND";
        await apiSend("/api/api-integrations", "POST", {
          ...base,
          tenantId: tenant.id,
          editionId: form.tenantLevel ? null : currentEditionId,
          status: "DRAFT",
          inboundToken: isInbound ? `maven-hook-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}` : null,
        });
        toast({
          title: "Entegrasyon taslak olarak eklendi",
          description: isInbound ? "Webhook adresi hazır — karttan kopyalayıp dış sisteme verin, hazır olunca Aktifleştirin." : "Hazır olunca Aktifleştirin.",
        });
      }
      setFormOpen(false);
      reloadIntegrations(); bump();
    } catch (e) {
      toast({ title: "Kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const removeIntegration = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await apiSend(`/api/api-integrations/${deleteTarget.id}`, "DELETE");
      toast({ title: "Entegrasyon silindi", description: "Log geçmişi de temizlendi (cascade)." });
      setDeleteTarget(null);
      reloadIntegrations(); reloadLogs(); bump();
    } catch (e) {
      toast({ title: "Silinemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (loading && !integrations) return <Loading rows={6} />;
  if (error) return <ErrorState message={error} onRetry={reloadIntegrations} />;

  return (
    <div className="space-y-5">
      <PageHeader title="API Geçidi" desc="Çift yönlü veri akışı merkezi — dışa aktarım, içe webhook ve ödeme entegrasyonları.">
        <Button size="sm" onClick={openCreate}>
          <Icons.Plus className="size-4" /> Yeni Entegrasyon
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Aktif Entegrasyon" value={activeCount} sub={`${(integrations ?? []).length} tanımlı`} tone="teal" icon={<Icons.PlugZap className="size-4" />} />
        <KpiCard
          label="Başarı Oranı"
          value={successRate === null ? "—" : `%${successRate}`}
          sub={`${totalOk} ✓ / ${totalFail} ✗`}
          tone={successRate !== null && successRate < 60 ? "rose" : "emerald"}
          icon={<Icons.Gauge className="size-4" />}
        />
        <KpiCard label="24 saatlik log" value={logs24h} sub="son 1 günde akış" tone="amber" icon={<Icons.ScrollText className="size-4" />} />
        <KpiCard
          label="Sına Modu (dry-run)"
          value={dryRun ? "AÇIK" : "KAPALI"}
          sub={dryRun ? "ağ çağrısı yapılmaz" : "gerçek istek gönderilir"}
          tone={dryRun ? "neutral" : "rose"}
          icon={<Icons.FlaskConical className="size-4" />}
          onClick={() => setDryRun((v) => !v)}
          detailHref="tıkla — ağ çağrısı yapmadan dene"
        />
      </div>

      {/* Entegrasyon kartları */}
      <SectionCard
        title="Entegrasyonlar"
        desc="karta tıkla → uç nokta ve maskeli kimlik detayı"
        action={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={dryRun} onCheckedChange={setDryRun} aria-label="Dry-run modu" id="dryrun-switch" />
            <label htmlFor="dryrun-switch" className="cursor-pointer select-none">Sına (ağ çağrısı yapma)</label>
          </div>
        }
      >
        {(integrations ?? []).length === 0 ? (
          <EmptyState
            title="Henüz entegrasyon yok"
            desc="'Yeni Entegrasyon' ile ödeme, REST, webhook veya mail kanalı açın — şablonlar alanları hazır doldurur."
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
                  <button type="button" onClick={() => setDetail(i)} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg" aria-label={`${i.name} detayını aç`}>
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
                              {isInbound ? "İçe Veri" : "Dışa Aktarım"}
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
                        {i.lastRunAt ? `son koşu ${relTime(i.lastRunAt)}` : "hiç koşmadı"}
                      </span>
                      {i.lastStatus && (
                        <span className={cn("inline-flex items-center gap-1 font-medium", i.lastStatus === "OK" ? "text-emerald-600" : "text-rose-600")}>
                          {i.lastStatus === "OK" ? "✓ OK" : "✗ hata"}
                        </span>
                      )}
                    </div>

                    {/* başarı/başarısızlık mini çubuğu */}
                    <div className="mt-2.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`Başarı ${i.successCount}, hata ${i.failCount}`}>
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${okPct}%` }} />
                      </div>
                      <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">✓ {i.successCount} başarılı · ✗ {i.failCount} hatalı</p>
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
                          aria-label="Webhook adresini kopyala"
                          onClick={() => copyText(hookUrl(i.inboundToken ?? ""), "Webhook adresi")}
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
                        {testingId === i.id ? "Gönderiliyor…" : <><Icons.SendHorizontal className="size-3" /> Test webhook gönder</>}
                      </Button>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
                    <Button size="sm" className="h-7 text-[11px]" onClick={() => runIntegration(i)} disabled={runningId === i.id || i.status === "PAUSED"}>
                      {runningId === i.id ? <><Icons.Loader2 className="size-3 animate-spin" /> Koşuyor…</> : <><Icons.Play className="size-3" /> Çalıştır</>}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => toggleStatus(i)} disabled={busy}>
                      {i.status === "ACTIVE" ? <><Icons.Pause className="size-3" /> Duraklat</> : <><Icons.PlayCircle className="size-3" /> Aktifleştir</>}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => openEdit(i)}>
                      <Icons.Pencil className="size-3" /> Düzenle
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
      <SectionCard title="Ödeme Sağlayıcıları" desc="Form Merkezi online ödemeleri PAYMENT kind entegrasyonlarından akar">
        <div className="flex flex-wrap items-center gap-3">
          <Icons.CreditCard className="size-5 shrink-0 text-teal-600" aria-hidden />
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Ödeme sağlayıcıları buraya bağlanır — Form Merkezi online ödemeleri <b className="text-foreground">PAYMENT</b> kind entegrasyonlarından akar. Sanal POS kimlikleri maskeli saklanır, koşular loglanır.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {["IYZICO", "PAYTR", "STRIPE"].map((p) => <Chip key={p} tone="violet">{p}</Chip>)}
          </div>
        </div>
      </SectionCard>

      {/* Log akışı */}
      <SectionCard
        title="Entegrasyon Log Akışı"
        desc="son 30 kayıt — 20 saniyede bir otomatik tazelenir"
        action={
          <Select value={logFilter} onValueChange={setLogFilter}>
            <SelectTrigger className="h-8 w-44 text-xs" aria-label="Entegrasyona göre filtrele"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tüm entegrasyonlar</SelectItem>
              {(integrations ?? []).map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      >
        {logsLoading && !logs ? <Loading rows={3} /> : visibleLogs.length === 0 ? (
          <EmptyState title="Log yok" desc="Entegrasyon koşturun ya da webhook testi gönderin — akış burada belirir." />
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
                <div className="rounded-lg bg-emerald-500/10 p-2"><p className="text-lg font-semibold tabular-nums text-emerald-700">{detail.successCount}</p><p className="text-[10px] text-emerald-600/80">başarılı</p></div>
                <div className="rounded-lg bg-rose-500/10 p-2"><p className="text-lg font-semibold tabular-nums text-rose-700">{detail.failCount}</p><p className="text-[10px] text-rose-600/80">hatalı</p></div>
                <div className="rounded-lg bg-muted p-2"><p className="text-sm font-semibold tabular-nums">{fmtDate(detail.lastRunAt, true)}</p><p className="text-[10px] text-muted-foreground">son koşu · {detail.lastStatus ?? "—"}</p></div>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium">Uç nokta (baseUrl)</p>
                <code className="maven-scroll block overflow-x-auto whitespace-nowrap rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
                  {detail.baseUrl ?? "— tanımlı değil"}
                </code>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium">Kimlik doğrulama — {AUTH_LABEL[detail.authType] ?? detail.authType} <span className="font-normal text-muted-foreground">(değerler maskeli)</span></p>
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
                  <p className="rounded-md border border-dashed px-2.5 py-1.5 text-[11px] text-muted-foreground">Kimlik alanı yok (NONE)</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Kapsam:</span>
                {detail.editionId
                  ? <Chip tone="teal"><Icons.CalendarRange className="mr-1 inline size-3" />{editionName(detail.editionId) ?? "Edisyon"}</Chip>
                  : <Chip tone="violet">Tenant düzeyi (edisyonsuz)</Chip>}
                <Chip>{AUTH_LABEL[detail.authType] ?? detail.authType}</Chip>
              </div>

              {detail.notes && <p className="rounded-lg border bg-muted/30 p-2.5 text-xs text-muted-foreground">{detail.notes}</p>}

              {detail.direction === "INBOUND" && detail.inboundToken && (
                <div className="rounded-lg border bg-muted/40 p-2.5">
                  <p className="mb-1.5 text-xs font-medium">Webhook alım adresi</p>
                  <div className="flex items-center gap-1.5">
                    <code className="maven-scroll min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-card px-2 py-1 font-mono text-[10.5px] text-muted-foreground">
                      {hookUrl(detail.inboundToken)}
                    </code>
                    <Button size="sm" variant="outline" className="h-7 shrink-0 text-[11px]" onClick={() => copyText(hookUrl(detail.inboundToken ?? ""), "Webhook adresi")}>
                      <Icons.Copy className="size-3" /> Kopyala
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>Kapat</Button>
            {detail && <Button onClick={() => { setDetail(null); openEdit(detail); }}><Icons.Pencil className="size-3.5" /> Düzenle</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Yeni / düzenle diyaloğu */}
      <Dialog open={formOpen} onOpenChange={(o) => !o && setFormOpen(false)}>
        <DialogContent className="maven-scroll max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Entegrasyonu Düzenle" : "Yeni Entegrasyon"}</DialogTitle>
            <DialogDescription>
              {editing ? editing.name : "Şablondan başlayın — alanlar otomatik dolar."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!editing && (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-label="Hızlı şablonlar">
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
                <Label htmlFor="int-name">Ad</Label>
                <Input id="int-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="örn. PayTR Sanal POS" />
              </div>
              <div className="space-y-1.5">
                <Label>Yön</Label>
                <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                  <SelectTrigger aria-label="Yön"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(INTEGRATION_DIRECTION).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tür</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger aria-label="Tür"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(INTEGRATION_KIND).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="int-provider">Sağlayıcı</Label>
                <Input id="int-provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="IYZICO / PAYTR / MAILJET…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="int-baseurl">Base URL</Label>
                <Input id="int-baseurl" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.ornek.com/v1" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Kimlik doğrulama tipi</Label>
                <Select value={form.authType} onValueChange={(v) => setForm({ ...form, authType: v })}>
                  <SelectTrigger aria-label="Kimlik tipi"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(AUTH_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.authType === "API_KEY" && (
                  <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="API anahtarı (key)" className="mt-1.5 font-mono text-xs" />
                )}
                {form.authType === "BEARER" && (
                  <Input value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="Bearer token" className="mt-1.5 font-mono text-xs" />
                )}
                {form.authType === "BASIC" && (
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <Input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} placeholder="kullanıcı" className="font-mono text-xs" />
                    <Input type="password" value={form.pass} onChange={(e) => setForm({ ...form, pass: e.target.value })} placeholder="şifre" className="font-mono text-xs" />
                  </div>
                )}
                {(form.authType === "OAUTH2" || form.authType === "SIGNATURE" || form.authType === "NONE") && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Bu tip için alan tanımı yok — el sıkışma detaylarını notlara yazın.</p>
                )}
              </div>

              {form.direction === "INBOUND" && !editing && (
                <div className="rounded-lg border border-dashed bg-muted/30 p-2.5 text-[11px] text-muted-foreground sm:col-span-2">
                  <Icons.Webhook className="mr-1 inline size-3" />
                  Kayıtta webhook adresi otomatik üretilir: <code className="font-mono">/api/integrations/hook/&lt;token&gt;</code> — adres kart üzerinden kopyalanır.
                </div>
              )}

              {!editing && (
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 sm:col-span-2">
                  <div>
                    <p className="text-xs font-medium">Tenant düzeyi</p>
                    <p className="text-[11px] text-muted-foreground">Ödeme sağlayıcıları gibi edisyondan bağımsız kanallar için açın.</p>
                  </div>
                  <Switch checked={form.tenantLevel} onCheckedChange={(v) => setForm({ ...form, tenantLevel: v })} aria-label="Tenant düzeyi" />
                </div>
              )}

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="int-notes">Notlar</Label>
                <Textarea id="int-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="akış kuralı, zamanlama, sorumlu kişi…" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Vazgeç</Button>
            <Button onClick={saveForm} disabled={busy || !form.name.trim()}>{busy ? "Kaydediliyor…" : editing ? "Kaydet" : "Oluştur"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Silme onayı */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>"{deleteTarget?.name}" silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Entegrasyon ve tüm koşu logları kalıcı olarak silinir. Dış sistemde yapılan çağrılar geri alınamaz — duraklatmak isterseniz &quot;Duraklat&quot; kullanın.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={removeIntegration} className="bg-rose-600 text-white hover:bg-rose-700">{busy ? "Siliniyor…" : "Sil"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
