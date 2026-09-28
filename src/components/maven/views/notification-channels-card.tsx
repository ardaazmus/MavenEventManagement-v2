"use client";
// ─── GENEL İLETİŞİM — Dış Bildirim Kanalları: WhatsApp (şirket mobil telefonu) + SMS ──
// Kullanıcı kararı: bu özellik Mobil Portal ayarlarının DEĞİL, etkinlik geneli GENEL
// İLETİŞİM özelliğidir — Ayarlar → "İletişim & Bildirim Kanalları" grubunda yaşar
// (portal-settings.tsx'ten buraya taşındı; API uçları ve davranış aynıdır).
// Bağımsız kaydetme akışı: /api/notifications/channels (GET/PUT) + /test.
// Sırlar API'den daima maskeli döner; maske değeri gönderilirse değişmez.
import { useCallback, useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard, Loading } from "@/components/maven/bits";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import { apiGet, apiSend } from "@/lib/client";
import { cn } from "@/lib/utils";

type ChannelConfig = {
  channelsEnabled: boolean;
  waEnabled: boolean; waProvider: string | null; waEndpoint: string | null;
  waPhoneId: string | null; waAccountId: string | null; waFrom: string | null;
  smsEnabled: boolean; smsProvider: string | null; smsEndpoint: string | null;
  smsSenderId: string | null; smsFrom: string | null; smsAccountId: string | null;
  eventsJson: string | null;
  lastTestAt: string | null; lastTestStatus: string | null;
};

const WA_PROVIDERS = ["META_CLOUD", "TWILIO", "ULTRAMSG", "WAHA", "GENERIC_WEBHOOK", "DEMO"] as const;
const SMS_PROVIDERS = ["TWILIO", "NETGSM", "ILETIMERKEZI", "VERIMOR", "GENERIC_WEBHOOK", "DEMO"] as const;
// sağlayıcı alan gereksinimleri — sadece ilgili alanlar gösterilir
const WA_FIELDS: Record<string, ("endpoint" | "phoneId" | "accountId" | "from")[]> = {
  META_CLOUD: ["phoneId"],
  TWILIO: ["accountId", "from"],
  ULTRAMSG: ["phoneId"],
  WAHA: ["endpoint", "phoneId"],
  GENERIC_WEBHOOK: ["endpoint"],
  DEMO: [],
};
const SMS_FIELDS: Record<string, ("endpoint" | "senderId" | "accountId" | "from")[]> = {
  TWILIO: ["accountId", "senderId"],
  NETGSM: ["senderId", "accountId"],
  ILETIMERKEZI: ["senderId"],
  VERIMOR: ["senderId"],
  GENERIC_WEBHOOK: ["endpoint", "senderId"],
  DEMO: [],
};

export function NotificationChannelsCard({ editionId }: { editionId: string }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [cfg, setCfg] = useState<ChannelConfig | null>(null);
  const [hasWaToken, setHasWaToken] = useState(false);
  const [hasSmsToken, setHasSmsToken] = useState(false);
  const [waToken, setWaToken] = useState("");
  const [smsToken, setSmsToken] = useState("");
  const [events, setEvents] = useState<Record<string, boolean>>({ announcement: true, b2b: true, reminder: false, magicLink: false });
  const [busy, setBusy] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testBusy, setTestBusy] = useState<"WHATSAPP" | "SMS" | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ config: ChannelConfig; hasWaToken: boolean; hasSmsToken: boolean }>(
        `/api/notifications/channels?editionId=${encodeURIComponent(editionId)}`,
      );
      setCfg(d.config);
      setHasWaToken(d.hasWaToken);
      setHasSmsToken(d.hasSmsToken);
      if (d.config.eventsJson) {
        try {
          setEvents({ announcement: true, b2b: true, reminder: false, magicLink: false, ...(JSON.parse(d.config.eventsJson) as Record<string, boolean>) });
        } catch { /* varsayılan kalır */ }
      }
    } catch (e) {
      toast({ title: t("portalSettings.channels.loadFail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  }, [editionId, t, toast]);

  useEffect(() => {
    // N-06: yükleme commit-sonrası microtask'te başlar — effect gövdesinde senkron setState yok.
    queueMicrotask(() => void load());
  }, [load]);

  if (!cfg) return <Loading rows={3} />;

  const save = async () => {
    setBusy(true);
    try {
      await apiSend("/api/notifications/channels", "PUT", {
        editionId,
        channelsEnabled: cfg.channelsEnabled,
        waEnabled: cfg.waEnabled,
        waProvider: cfg.waProvider,
        waEndpoint: cfg.waEndpoint,
        waPhoneId: cfg.waPhoneId,
        waAccountId: cfg.waAccountId,
        waFrom: cfg.waFrom,
        waToken: waToken || undefined,
        smsEnabled: cfg.smsEnabled,
        smsProvider: cfg.smsProvider,
        smsEndpoint: cfg.smsEndpoint,
        smsSenderId: cfg.smsSenderId,
        smsFrom: cfg.smsFrom,
        smsAccountId: cfg.smsAccountId,
        smsToken: smsToken || undefined,
        events,
      });
      setWaToken("");
      setSmsToken("");
      toast({ title: t("portalSettings.channels.saved"), description: t("portalSettings.channels.savedDesc") });
      await load();
    } catch (e) {
      toast({ title: t("portalSettings.channels.saveFail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const runTest = async (channel: "WHATSAPP" | "SMS") => {
    if (!testPhone.trim()) {
      toast({ title: t("portalSettings.channels.testNeedPhone"), variant: "destructive" });
      return;
    }
    setTestBusy(channel);
    try {
      const r = await apiSend<{ ok: boolean; provider: string | null; status: number; detail: string }>(
        "/api/notifications/channels/test",
        "POST",
        { editionId, channel, phone: testPhone },
      );
      toast({
        title: r.ok ? t("portalSettings.channels.testOk") : t("portalSettings.channels.testFail"),
        description: `${r.provider ?? "—"} · ${r.status} · ${r.detail.slice(0, 120)}`,
        variant: r.ok ? "default" : "destructive",
      });
      await load();
    } catch (e) {
      toast({ title: t("portalSettings.channels.testFail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setTestBusy(null);
    }
  };

  const patchCfg = (p: Partial<ChannelConfig>) => setCfg((c) => (c ? { ...c, ...p } : c));
  const waF = WA_FIELDS[cfg.waProvider ?? ""] ?? [];
  const smsF = SMS_FIELDS[cfg.smsProvider ?? ""] ?? [];

  return (
    <SectionCard title={t("portalSettings.channels.title")} desc={t("portalSettings.channels.desc")}>
      <div className="space-y-4">
        {/* ana anahtar */}
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
          <div>
            <Label className="text-xs">{t("portalSettings.channels.master")}</Label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("portalSettings.channels.masterHint")}</p>
          </div>
          <Switch checked={cfg.channelsEnabled} onCheckedChange={(v) => patchCfg({ channelsEnabled: v })} />
        </div>

        {/* ── WhatsApp ── */}
        <div className={cn("rounded-lg border p-3", cfg.waEnabled ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-900/10" : "bg-muted/10")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-emerald-500 text-white"><Icons.MessageCircle className="size-4" /></span>
              <div>
                <p className="text-xs font-semibold">{t("portalSettings.channels.waTitle")}</p>
                <p className="text-[11px] text-muted-foreground">{t("portalSettings.channels.waDesc")}</p>
              </div>
            </div>
            <Switch checked={cfg.waEnabled} onCheckedChange={(v) => patchCfg({ waEnabled: v })} aria-label={t("portalSettings.channels.waTitle")} />
          </div>
          {cfg.waEnabled && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("portalSettings.channels.provider")}</Label>
                <Select value={cfg.waProvider ?? "none"} onValueChange={(v) => patchCfg({ waProvider: v === "none" ? null : v })}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("portalSettings.channels.providerNone")}</SelectItem>
                    {WA_PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>{t(`portalSettings.channels.wa_${p}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cfg.waProvider === "DEMO" && <p className="text-[10px] text-amber-600">{t("portalSettings.channels.demoNote")}</p>}
              </div>
              {waF.includes("endpoint") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("portalSettings.channels.endpoint")}</Label>
                  <Input value={cfg.waEndpoint ?? ""} onChange={(e) => patchCfg({ waEndpoint: e.target.value })} placeholder="https://waha.example…" className="text-xs" />
                </div>
              )}
              {waF.includes("phoneId") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("portalSettings.channels.waPhoneId")}</Label>
                  <Input value={cfg.waPhoneId ?? ""} onChange={(e) => patchCfg({ waPhoneId: e.target.value })} className="text-xs" />
                </div>
              )}
              {waF.includes("accountId") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("portalSettings.channels.accountId")}</Label>
                  <Input value={cfg.waAccountId ?? ""} onChange={(e) => patchCfg({ waAccountId: e.target.value })} className="text-xs" />
                </div>
              )}
              {waF.includes("from") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("portalSettings.channels.waFrom")}</Label>
                  <Input value={cfg.waFrom ?? ""} onChange={(e) => patchCfg({ waFrom: e.target.value })} placeholder="+90555…" className="text-xs" dir="ltr" />
                  <p className="text-[10px] text-muted-foreground">{t("portalSettings.channels.waFromHint")}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">{t("portalSettings.channels.token")}</Label>
                <Input type="password" value={waToken} onChange={(e) => setWaToken(e.target.value)} placeholder={hasWaToken ? t("portalSettings.channels.tokenSet") : t("portalSettings.channels.tokenPh")} className="text-xs" autoComplete="new-password" />
                {hasWaToken && (
                  <button className="text-[10px] text-muted-foreground underline hover:text-foreground" onClick={() => setWaToken("__CLEAR__")}>
                    {t("portalSettings.channels.tokenClear")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── SMS ── */}
        <div className={cn("rounded-lg border p-3", cfg.smsEnabled ? "border-sky-300 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-900/10" : "bg-muted/10")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-sky-500 text-white"><Icons.Smartphone className="size-4" /></span>
              <div>
                <p className="text-xs font-semibold">{t("portalSettings.channels.smsTitle")}</p>
                <p className="text-[11px] text-muted-foreground">{t("portalSettings.channels.smsDesc")}</p>
              </div>
            </div>
            <Switch checked={cfg.smsEnabled} onCheckedChange={(v) => patchCfg({ smsEnabled: v })} aria-label={t("portalSettings.channels.smsTitle")} />
          </div>
          {cfg.smsEnabled && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("portalSettings.channels.provider")}</Label>
                <Select value={cfg.smsProvider ?? "none"} onValueChange={(v) => patchCfg({ smsProvider: v === "none" ? null : v })}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("portalSettings.channels.providerNone")}</SelectItem>
                    {SMS_PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>{t(`portalSettings.channels.sms_${p}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cfg.smsProvider === "DEMO" && <p className="text-[10px] text-amber-600">{t("portalSettings.channels.demoNote")}</p>}
              </div>
              {smsF.includes("endpoint") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("portalSettings.channels.endpoint")}</Label>
                  <Input value={cfg.smsEndpoint ?? ""} onChange={(e) => patchCfg({ smsEndpoint: e.target.value })} className="text-xs" />
                </div>
              )}
              {smsF.includes("senderId") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("portalSettings.channels.smsSender")}</Label>
                  <Input value={cfg.smsSenderId ?? ""} onChange={(e) => patchCfg({ smsSenderId: e.target.value.slice(0, 11) })} maxLength={11} className="text-xs" />
                  <p className="text-[10px] text-muted-foreground">{t("portalSettings.channels.smsSenderHint")}</p>
                </div>
              )}
              {smsF.includes("accountId") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("portalSettings.channels.accountId")}</Label>
                  <Input value={cfg.smsAccountId ?? ""} onChange={(e) => patchCfg({ smsAccountId: e.target.value })} className="text-xs" />
                </div>
              )}
              {smsF.includes("from") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("portalSettings.channels.smsFrom")}</Label>
                  <Input value={cfg.smsFrom ?? ""} onChange={(e) => patchCfg({ smsFrom: e.target.value })} className="text-xs" dir="ltr" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">{t("portalSettings.channels.token")}</Label>
                <Input type="password" value={smsToken} onChange={(e) => setSmsToken(e.target.value)} placeholder={hasSmsToken ? t("portalSettings.channels.tokenSet") : t("portalSettings.channels.tokenPh")} className="text-xs" autoComplete="new-password" />
                {hasSmsToken && (
                  <button className="text-[10px] text-muted-foreground underline hover:text-foreground" onClick={() => setSmsToken("__CLEAR__")}>
                    {t("portalSettings.channels.tokenClear")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* olay yönlendirme */}
        <div>
          <Label className="text-xs">{t("portalSettings.channels.routing")}</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            {(["announcement", "b2b", "reminder", "magicLink"] as const).map((k) => (
              <div key={k} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-2.5">
                <span className="text-xs">{t(`portalSettings.channels.route_${k}`)}</span>
                <Switch checked={Boolean(events[k])} onCheckedChange={(v) => setEvents((e) => ({ ...e, [k]: v }))} aria-label={t(`portalSettings.channels.route_${k}`)} />
              </div>
            ))}
          </div>
        </div>

        {/* test + kaydet */}
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("portalSettings.channels.testPhone")}</Label>
            <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+90555…" className="w-44 text-xs" dir="ltr" />
          </div>
          <Button variant="outline" size="sm" onClick={() => void runTest("WHATSAPP")} disabled={testBusy !== null || !cfg.waEnabled}>
            {testBusy === "WHATSAPP" ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.MessageCircle className="size-4" />} {t("portalSettings.channels.testWa")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void runTest("SMS")} disabled={testBusy !== null || !cfg.smsEnabled}>
            {testBusy === "SMS" ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.Smartphone className="size-4" />} {t("portalSettings.channels.testSms")}
          </Button>
          <Button size="sm" className="ml-auto" onClick={() => void save()} disabled={busy}>
            {busy ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.Save className="size-4" />} {t("portalSettings.channels.save")}
          </Button>
          {cfg.lastTestStatus && (
            <p className="w-full text-[10px] text-muted-foreground">{t("portalSettings.channels.lastTest")}: {cfg.lastTestStatus}</p>
          )}
        </div>

        {/* gönderim raporları — IntegrationLog (channel:*) son kayıtlar */}
        <ChannelReportsSection editionId={editionId} />
      </div>
    </SectionCard>
  );
}

// Gönderim raporları bölümü — notify.ts logChannelBatch IntegrationLog kayıtları.
// Tekil gönderim kanıtı + hata ayıklama; özet alanları PII içermez.
type ChannelReport = {
  id: string; method: string | null; endpoint: string | null; ok: boolean;
  statusCode: number | null; summary: string | null; createdAt: string;
};

function ChannelReportsSection({ editionId }: { editionId: string }) {
  const { t } = useLang();
  const [items, setItems] = useState<ChannelReport[] | null>(null);
  const [counts, setCounts] = useState<{ total: number; ok: number; fail: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const d = await apiGet<{ items: ChannelReport[]; counts: { total: number; ok: number; fail: number } }>(
        `/api/notifications/channels/reports?editionId=${encodeURIComponent(editionId)}`,
      );
      setItems(d.items);
      setCounts(d.counts);
    } catch {
      // rapor yüklenemese kanal yapılandırması etkilenmez — sessiz
    } finally {
      setBusy(false);
    }
  }, [editionId]);

  useEffect(() => {
    // N-06: yükleme commit-sonrası microtask'te başlar — effect gövdesinde senkron setState yok.
    queueMicrotask(() => void load());
  }, [load]);

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icons.ListChecks className="size-4 text-teal-600" />
          <p className="text-xs font-semibold">{t("portalSettings.channels.reports")}</p>
        </div>
        <Button variant="ghost" size="sm" className="h-7" onClick={() => void load()} disabled={busy}>
          {busy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.RefreshCw className="size-3.5" />} {t("portalSettings.channels.reportsRefresh")}
        </Button>
      </div>
      {counts && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{t("portalSettings.channels.reportsTotal", { count: counts.total })}</span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{t("portalSettings.channels.reportsOk", { count: counts.ok })}</span>
          {counts.fail > 0 && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] text-red-700 dark:bg-red-900/30 dark:text-red-300">{t("portalSettings.channels.reportsFail", { count: counts.fail })}</span>
          )}
        </div>
      )}
      <div className="maven-scroll mt-2 max-h-56 space-y-1.5 overflow-y-auto">
        {!items || items.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-muted-foreground">{t("portalSettings.channels.reportsEmpty")}</p>
        ) : (
          items.map((r) => (
            <div key={r.id} className="flex items-start gap-2 rounded-lg border bg-muted/10 px-2 py-1.5">
              <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", r.ok ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300")}>
                {r.ok ? <Icons.Check className="size-3" /> : <Icons.X className="size-3" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium">
                  {r.method === "WHATSAPP" ? t("portalSettings.channels.waTitle") : r.method === "SMS" ? t("portalSettings.channels.smsTitle") : (r.method ?? "—")}
                  {r.statusCode ? <span className="ml-1 font-normal text-muted-foreground">· {r.statusCode}</span> : null}
                </p>
                <p className="truncate text-[10px] text-muted-foreground" title={r.summary ?? ""}>{r.summary ?? "—"}</p>
              </div>
              <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
                {new Date(r.createdAt).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
