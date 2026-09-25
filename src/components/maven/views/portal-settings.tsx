"use client";
// ─── Admin Yapılandırma Modülü — "Katılımcı Portalı Ayarları" (§5) ────────────
// Etkinlik altına bağlı konfigürasyon sekmesi: erişim & güvenlik (5.1), görsel
// yapılandırma (5.2), widget/modül yönetimi (5.3), bildirimler + canlı duyuru
// paneli (5.4), içerik bağlama (5.5), canlı istatistikler (5.6).
// Kapsülleme: yalnız /api/portal/config + /api/portal/analytics +
// /api/portal/magic-links + duyuru ucuyla konuşur — bilet/muhasebe modüllerine
// DOKUNMAZ (§Teknik 3). Mevcut ana tablolar bozulmaz; yalnız görünürlük kuralları.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { SectionCard, EmptyState, Loading, ErrorState } from "@/components/maven/bits";
import { useToast } from "@/hooks/use-toast";
import { useLang, t } from "@/lib/i18n";
import { apiGet, apiSend } from "@/lib/client";
import { fmtDate } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── tipler ─────────────────────────────────────────────────────────────────
type PortalConfig = {
  id: string; editionId: string;
  portalEnabled: boolean; maintenanceMessage: string | null; countdownTo: string | null;
  eventCode: string | null; allowRegistrationRedirect: boolean; registrationFormId: string | null;
  portalLogoUrl: string | null; portalBannerUrl: string | null; themeColor: string | null;
  headerEventsJson: string | null; bottomNavJson: string | null; widgetsJson: string | null;
  notificationsEnabled: boolean; notifyOffsetsJson: string | null;
  sponsorIdsJson: string | null; venueMapUrl: string | null; venueMapEnabled: boolean;
  pwaEnabled: boolean;
  // ── tasarım kontrolü (§5.2+) ──
  fontFamily: string | null; fontScale: number | null;
  headerBgColor: string | null; footerBgColor: string | null; contentBgColor: string | null;
  headerBgImage: string | null; footerBgImage: string | null; contentBgImage: string | null;
  portalSponsorLogoUrl: string | null; portalSponsorName: string | null; portalSponsorUrl: string | null;
  iconOverridesJson: string | null; iconLayoutJson: string | null;
};
type Lookups = {
  editions: { id: string; name: string; editionLabel: string | null; startDate: string | null; isPublished: boolean }[];
  forms: { id: string; name: string; type: string; status: string }[];
  sponsors: { id: string; name: string; logoUrl: string | null; tierName: string | null }[];
  people: { id: string; firstName: string; lastName: string; email: string | null; company: string | null }[];
};
type ConfigPayload = { config: PortalConfig; header: { title: string; subtitle: string }; lookups: Lookups };
type WidgetRow = { key: string; enabled: boolean; visibility: "ALL" | "AUTH"; order: number };
type Analytics = {
  uniqueVisitors: { guest: number; auth: number; total: number };
  visits: { total: number; byDay: { day: string; count: number }[] };
  widgetClicks: { widgetKey: string; count: number }[];
  installs: number;
  formEngagement: { opens: number; submissions: number; forms: { id: string; name: string; submissions: number }[] };
  b2b: { total: number; accepted: number; declined: number; completed: number; completionRate: number };
  questions: { pending: number; answered: number; hidden: number; total: number };
  announcements: number;
};
type MagicResult = { items: { personId: string; name: string; email: string | null; token: string; expiresAt: string; mailed: boolean }[]; skipped: { personId: string; reason: string }[] };

const WIDGET_ORDER: { key: string; icon: typeof Icons.Home }[] = [
  { key: "agenda", icon: Icons.CalendarDays },
  { key: "speakers", icon: Icons.Mic2 },
  { key: "forms", icon: Icons.ClipboardList },
  { key: "qa", icon: Icons.MessageCircleQuestion },
  { key: "map", icon: Icons.Map },
  { key: "b2b", icon: Icons.Handshake },
];
const THEME_PRESETS = ["#0d9488", "#7c3aed", "#dc2626", "#ea580c", "#16a34a", "#0891b2"];

// ── tasarım sabitleri (§5.2+) ──
const NAV_KEYS = ["home", "program", "sponsors", "map", "profile"] as const;
const DEFAULT_ICON_LAYOUT: Record<string, number> = { home: 0, program: 1, sponsors: 2, map: 3, profile: 4 };
type IconOverride = { svg?: string; color?: string };
const FONT_OPTIONS = ["system", "serif", "rounded", "mono", "condensed"] as const;

function parseIconOverrides(raw: string | null): Record<string, IconOverride> {
  if (!raw) return {};
  try {
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    const out: Record<string, IconOverride> = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (v && typeof v === "object") out[k] = v as IconOverride;
    }
    return out;
  } catch {
    return {};
  }
}
function parseIconLayout(raw: string | null): Record<string, number> {
  if (!raw) return { ...DEFAULT_ICON_LAYOUT };
  try {
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object" || Array.isArray(p)) return { ...DEFAULT_ICON_LAYOUT };
    const out: Record<string, number> = { ...DEFAULT_ICON_LAYOUT };
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0 && n <= 9) out[k] = n;
    }
    return out;
  } catch {
    return { ...DEFAULT_ICON_LAYOUT };
  }
}

// dataURL okuyucu — boyut kotalı (logo 300KB / banner-kroki 600KB)
// Hata mesajları kod döner; çağrı yerinde i18n ile çevrilir (tarama temiz).
function readImage(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new RangeError("IMG_TOO_LARGE"));
      return;
    }
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new RangeError("IMG_READ_FAILED"));
    r.readAsDataURL(file);
  });
}

function parseWidgetsJson(raw: string | null): WidgetRow[] {
  const defaults: WidgetRow[] = WIDGET_ORDER.map((w, i) => ({ key: w.key, enabled: true, visibility: w.key === "b2b" ? "AUTH" : "ALL", order: i }));
  if (!raw) return defaults;
  try {
    const p = JSON.parse(raw) as Record<string, { enabled?: boolean; visibility?: string; order?: number }>;
    return WIDGET_ORDER.map((w, i) => {
      const o = p[w.key];
      if (!o) return defaults[i];
      return {
        key: w.key,
        enabled: o.enabled === undefined ? true : Boolean(o.enabled),
        visibility: w.key === "b2b" ? "AUTH" : o.visibility === "AUTH" ? "AUTH" : "ALL",
        order: Number.isFinite(o.order) ? Number(o.order) : i,
      };
    });
  } catch {
    return defaults;
  }
}

function parseJsonObj<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const p = JSON.parse(raw) as unknown;
    return p && typeof p === "object" && !Array.isArray(p) ? (p as T) : fallback;
  } catch {
    return fallback;
  }
}
function parseJsonArr(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw) as unknown;
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// ─── ana sekme bileşeni ─────────────────────────────────────────────────────
export function PortalSettingsTab({ editionId, portalSlug }: { editionId: string; portalSlug: string | null }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [payload, setPayload] = useState<ConfigPayload | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // taslak — config alanlarının düzenlenebilir kopyası
  const [draft, setDraft] = useState<null | {
    portalEnabled: boolean; maintenanceMessage: string; countdownTo: string;
    eventCode: string; allowRegistrationRedirect: boolean; registrationFormId: string;
    portalLogoUrl: string; portalBannerUrl: string; themeColor: string;
    headerEvents: string[]; bottomNav: Record<string, boolean>;
    widgets: WidgetRow[]; notificationsEnabled: boolean; offsets: number[];
    sponsorIds: string[]; venueMapUrl: string; venueMapEnabled: boolean; pwaEnabled: boolean;
    headerTitle: string; headerSubtitle: string;
    // ── tasarım (§5.2+) ──
    fontFamily: string; fontScale: number;
    headerBgColor: string; footerBgColor: string; contentBgColor: string;
    headerBgImage: string; footerBgImage: string; contentBgImage: string;
    portalSponsorLogoUrl: string; portalSponsorName: string; portalSponsorUrl: string;
    iconOverrides: Record<string, IconOverride>; iconLayout: Record<string, number>;
  }>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [magicOpen, setMagicOpen] = useState(false);
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicSelected, setMagicSelected] = useState<Set<string>>(new Set());
  const [magicSendMail, setMagicSendMail] = useState(false);
  const [magicResult, setMagicResult] = useState<MagicResult | null>(null);
  const [annTitle, setAnnTitle] = useState("");
  const [annMessage, setAnnMessage] = useState("");
  const [annLevel, setAnnLevel] = useState("INFO");
  const [annTarget, setAnnTarget] = useState("ALL");
  const [annBusy, setAnnBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const data = await apiGet<ConfigPayload>(`/api/portal/config?editionId=${encodeURIComponent(editionId)}`);
      setPayload(data);
      setDraft({
        portalEnabled: data.config.portalEnabled,
        maintenanceMessage: data.config.maintenanceMessage ?? "",
        countdownTo: data.config.countdownTo ? new Date(data.config.countdownTo).toISOString().slice(0, 16) : "",
        eventCode: data.config.eventCode ?? "",
        allowRegistrationRedirect: data.config.allowRegistrationRedirect,
        registrationFormId: data.config.registrationFormId ?? "",
        portalLogoUrl: data.config.portalLogoUrl ?? "",
        portalBannerUrl: data.config.portalBannerUrl ?? "",
        themeColor: data.config.themeColor ?? "#0d9488",
        headerEvents: parseJsonArr(data.config.headerEventsJson),
        bottomNav: parseJsonObj(data.config.bottomNavJson, { program: true, sponsors: true, map: true }),
        widgets: parseWidgetsJson(data.config.widgetsJson).sort((a, b) => a.order - b.order),
        notificationsEnabled: data.config.notificationsEnabled,
        offsets: parseJsonArr(data.config.notifyOffsetsJson).map(Number).filter((n) => Number.isFinite(n) && n > 0),
        sponsorIds: parseJsonArr(data.config.sponsorIdsJson),
        venueMapUrl: data.config.venueMapUrl ?? "",
        venueMapEnabled: data.config.venueMapEnabled,
        pwaEnabled: data.config.pwaEnabled,
        headerTitle: data.header.title,
        headerSubtitle: data.header.subtitle,
        // ── tasarım alanları ──
        fontFamily: data.config.fontFamily ?? "system",
        fontScale: data.config.fontScale ?? 100,
        headerBgColor: data.config.headerBgColor ?? "",
        footerBgColor: data.config.footerBgColor ?? "",
        contentBgColor: data.config.contentBgColor ?? "",
        headerBgImage: data.config.headerBgImage ?? "",
        footerBgImage: data.config.footerBgImage ?? "",
        contentBgImage: data.config.contentBgImage ?? "",
        portalSponsorLogoUrl: data.config.portalSponsorLogoUrl ?? "",
        portalSponsorName: data.config.portalSponsorName ?? "",
        portalSponsorUrl: data.config.portalSponsorUrl ?? "",
        iconOverrides: parseIconOverrides(data.config.iconOverridesJson),
        iconLayout: parseIconLayout(data.config.iconLayoutJson),
      });
      setDirty(false);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Yapılandırma alınamadı");
    }
  }, [editionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let alive = true;
    apiGet<Analytics>(`/api/portal/analytics?editionId=${encodeURIComponent(editionId)}`)
      .then((d) => alive && setAnalytics(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [editionId, payload?.config.id]);

  const pickImage = async (file: File, maxBytes: number, apply: (url: string) => void) => {
    try {
      apply(await readImage(file, maxBytes));
    } catch (err) {
      const msg = err instanceof RangeError && err.message === "IMG_TOO_LARGE"
        ? t("portalSettings.brand.imgSize", { kb: Math.round(maxBytes / 1024) })
        : t("portalSettings.brand.imgRead");
      toast({ title: t("portalSettings.brand.imgErr"), description: msg, variant: "destructive" });
    }
  };

  const patch = <K extends keyof NonNullable<typeof draft>>(k: K, v: NonNullable<typeof draft>[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
    setDirty(true);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await apiSend("/api/portal/config", "PUT", {
        editionId,
        portalEnabled: draft.portalEnabled,
        maintenanceMessage: draft.maintenanceMessage || null,
        countdownTo: draft.countdownTo ? new Date(draft.countdownTo).toISOString() : null,
        eventCode: draft.eventCode ? draft.eventCode : null,
        allowRegistrationRedirect: draft.allowRegistrationRedirect,
        registrationFormId: draft.registrationFormId || null,
        portalLogoUrl: draft.portalLogoUrl || null,
        portalBannerUrl: draft.portalBannerUrl || null,
        themeColor: draft.themeColor || null,
        headerEvents: draft.headerEvents,
        bottomNav: draft.bottomNav,
        widgets: Object.fromEntries(draft.widgets.map((w, i) => [w.key, { enabled: w.enabled, visibility: w.visibility, order: i }])),
        notificationsEnabled: draft.notificationsEnabled,
        notifyOffsets: draft.offsets.length ? draft.offsets : [60, 30, 10],
        sponsorIds: draft.sponsorIds,
        venueMapUrl: draft.venueMapUrl || null,
        venueMapEnabled: draft.venueMapEnabled,
        pwaEnabled: draft.pwaEnabled,
        headerTitle: draft.headerTitle || null,
        headerSubtitle: draft.headerSubtitle || null,
        // ── tasarım alanları ──
        fontFamily: draft.fontFamily === "system" ? null : draft.fontFamily,
        fontScale: draft.fontScale === 100 ? null : draft.fontScale,
        headerBgColor: draft.headerBgColor || null,
        footerBgColor: draft.footerBgColor || null,
        contentBgColor: draft.contentBgColor || null,
        headerBgImage: draft.headerBgImage || null,
        footerBgImage: draft.footerBgImage || null,
        contentBgImage: draft.contentBgImage || null,
        portalSponsorLogoUrl: draft.portalSponsorLogoUrl || null,
        portalSponsorName: draft.portalSponsorName || null,
        portalSponsorUrl: draft.portalSponsorUrl || null,
        iconOverrides: draft.iconOverrides,
        iconLayout: draft.iconLayout,
      });
      toast({ title: t("portalSettings.saved"), description: t("portalSettings.savedDesc") });
      await load();
    } catch (e) {
      toast({ title: t("portalSettings.saveFail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const genCode = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    patch("eventCode", out);
  };

  const issueMagic = async () => {
    setMagicBusy(true);
    try {
      const res = await apiSend<MagicResult>("/api/portal/magic-links", "POST", {
        editionId,
        personIds: [...magicSelected],
        sendMail: magicSendMail,
      });
      setMagicResult(res);
      toast({ title: t("portalSettings.magic.issued", { count: res.items.length }) });
    } catch (e) {
      toast({ title: t("portalSettings.magic.fail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setMagicBusy(false);
    }
  };

  const sendAnnouncement = async () => {
    setAnnBusy(true);
    try {
      await apiSend("/api/portal/announcements", "POST", { editionId, title: annTitle.trim(), message: annMessage.trim(), level: annLevel, target: annTarget });
      toast({ title: t("portalSettings.announce.sent"), description: t("portalSettings.announce.sentDesc") });
      setAnnTitle("");
      setAnnMessage("");
    } catch (e) {
      toast({ title: t("portalSettings.announce.fail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setAnnBusy(false);
    }
  };

  const moveWidget = (idx: number, dir: -1 | 1) => {
    if (!draft) return;
    const next = [...draft.widgets];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setDraft({ ...draft, widgets: next });
    setDirty(true);
  };

  if (loadErr) return <ErrorState message={loadErr} onRetry={() => void load()} />;
  if (!payload || !draft) return <Loading rows={6} />;

  const lookups = payload.lookups;
  const peopleList = lookups.people;

  return (
    <div className="space-y-4">
      {/* canlı önizleme butonu */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={draft.portalEnabled ? "default" : "outline"}
          onClick={() => portalSlug && window.open(`/?portal=${encodeURIComponent(portalSlug)}`, "_blank")}
          disabled={!portalSlug || !draft.portalEnabled}
        >
          <Icons.ExternalLink className="size-4" /> {t("portalSettings.openPortal")}
        </Button>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
          draft.portalEnabled ? "bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200" : "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200")}>
          {draft.portalEnabled ? <><Icons.RadioTower className="size-3" /> {t("portalSettings.statusActive")}</> : <><Icons.PauseCircle className="size-3" /> {t("portalSettings.statusPassive")}</>}
        </span>
        {dirty && <span className="text-[11px] text-amber-600">{t("portalSettings.unsaved")}</span>}
        <Button className="ml-auto" onClick={() => void save()} disabled={saving}>
          {saving ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.Save className="size-4" />} {t("portalSettings.save")}
        </Button>
      </div>

      {/* ── §5.1 Erişim ve Güvenlik ── */}
      <SectionCard title={t("portalSettings.access.title")} desc={t("portalSettings.access.desc")}>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
            <div>
              <Label className="text-xs">{t("portalSettings.access.status")}</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{draft.portalEnabled ? t("portalSettings.access.statusOn") : t("portalSettings.access.statusOff")}</p>
            </div>
            <Switch checked={draft.portalEnabled} onCheckedChange={(v) => patch("portalEnabled", v)} aria-label={t("portalSettings.access.status")} />
          </div>
          {!draft.portalEnabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("portalSettings.access.maintMsg")}</Label>
                <Textarea value={draft.maintenanceMessage} onChange={(e) => patch("maintenanceMessage", e.target.value)} placeholder={t("portalSettings.access.maintPh")} rows={2} maxLength={300} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("portalSettings.access.countdown")}</Label>
                <Input type="datetime-local" value={draft.countdownTo} onChange={(e) => patch("countdownTo", e.target.value)} />
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("portalSettings.access.code")}</Label>
              <div className="flex gap-2">
                <Input
                  value={draft.eventCode}
                  onChange={(e) => patch("eventCode", e.target.value.toUpperCase().replace(/\s+/g, "").slice(0, 24))}
                  placeholder="ABC123"
                  className="font-mono uppercase tracking-widest"
                />
                <Button variant="outline" size="icon" onClick={genCode} title={t("portalSettings.access.codeGen")} aria-label={t("portalSettings.access.codeGen")}>
                  <Icons.Dices className="size-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("portalSettings.access.codeHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("portalSettings.access.magicTitle")}</Label>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setMagicOpen(true)}>
                <Icons.Wand2 className="size-4" /> {t("portalSettings.access.magicBtn")}
              </Button>
              <p className="text-[11px] text-muted-foreground">{t("portalSettings.access.magicHint")}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
            <div>
              <Label className="text-xs">{t("portalSettings.access.regRedirect")}</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t("portalSettings.access.regRedirectHint")}</p>
            </div>
            <Switch checked={draft.allowRegistrationRedirect} onCheckedChange={(v) => patch("allowRegistrationRedirect", v)} />
          </div>
          {draft.allowRegistrationRedirect && (
            <div className="space-y-1.5 sm:max-w-sm">
              <Label className="text-xs">{t("portalSettings.access.regForm")}</Label>
              <Select value={draft.registrationFormId || "none"} onValueChange={(v) => patch("registrationFormId", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder={t("portalSettings.access.regFormPh")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("portalSettings.access.regFormNone")}</SelectItem>
                  {lookups.forms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name} ({t(`portalSettings.formStatus.${f.status}`)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── §5.2 Görsel Yapılandırma ── */}
      <SectionCard title={t("portalSettings.brand.title")} desc={t("portalSettings.brand.desc")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("portalSettings.brand.logo")}</Label>
            <div className="flex items-center gap-2">
              <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
                {draft.portalLogoUrl ? <img src={draft.portalLogoUrl} alt="" className="size-full object-contain p-0.5" /> : <Icons.ImageIcon className="size-4 text-muted-foreground" />}
              </div>
              <Input
                type="file"
                accept="image/*"
                className="h-9 text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void pickImage(f, 300_000, (url) => patch("portalLogoUrl", url));
                }}
              />
              {draft.portalLogoUrl && (
                <Button variant="ghost" size="icon" onClick={() => patch("portalLogoUrl", "")} aria-label={t("portalSettings.brand.clear")}>
                  <Icons.Trash2 className="size-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("portalSettings.brand.banner")}</Label>
            <div className="flex items-center gap-2">
              <div className="grid h-11 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
                {draft.portalBannerUrl ? <img src={draft.portalBannerUrl} alt="" className="size-full object-cover" /> : <Icons.ImageIcon className="size-4 text-muted-foreground" />}
              </div>
              <Input
                type="file"
                accept="image/*"
                className="h-9 text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void pickImage(f, 600_000, (url) => patch("portalBannerUrl", url));
                }}
              />
              {draft.portalBannerUrl && (
                <Button variant="ghost" size="icon" onClick={() => patch("portalBannerUrl", "")} aria-label={t("portalSettings.brand.clear")}>
                  <Icons.Trash2 className="size-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("portalSettings.brand.theme")}</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {THEME_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => patch("themeColor", c)}
                  aria-label={c}
                  className={cn("size-7 rounded-lg border-2 transition", draft.themeColor === c ? "border-foreground scale-110" : "border-transparent")}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={draft.themeColor}
                onChange={(e) => patch("themeColor", e.target.value)}
                className="size-7 cursor-pointer rounded-lg border bg-transparent"
                aria-label={t("portalSettings.brand.themeCustom")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("portalSettings.brand.headerTitle")}</Label>
            <Input value={draft.headerTitle} onChange={(e) => patch("headerTitle", e.target.value)} placeholder={t("portalSettings.brand.headerTitlePh")} maxLength={120} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">{t("portalSettings.brand.headerSubtitle")}</Label>
            <Input value={draft.headerSubtitle} onChange={(e) => patch("headerSubtitle", e.target.value)} placeholder={t("portalSettings.brand.headerSubtitlePh")} maxLength={200} />
          </div>
        </div>

        {/* Top Header carousel seçimi (§5.2) */}
        <div className="mt-4">
          <Label className="text-xs">{t("portalSettings.brand.headerEvents")}</Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("portalSettings.brand.headerEventsHint")}</p>
          {lookups.editions.length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">{t("portalSettings.brand.noOtherEvents")}</p>
          ) : (
            <div className="maven-scroll mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
              {lookups.editions.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50">
                  <Checkbox
                    checked={draft.headerEvents.includes(e.id)}
                    onCheckedChange={(v) => patch("headerEvents", v ? [...draft.headerEvents, e.id] : draft.headerEvents.filter((x) => x !== e.id))}
                  />
                  <span className="truncate">{e.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{[e.editionLabel, e.startDate ? fmtDate(e.startDate) : null].filter(Boolean).join(" · ")}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Alt menü özelleştirme (§5.2) */}
        <div className="mt-4">
          <Label className="text-xs">{t("portalSettings.brand.bottomNav")}</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {([["program", t("portalApp.nav.program")], ["sponsors", t("portalApp.nav.sponsors")], ["map", t("portalApp.nav.map")]] as const).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-2.5">
                <span className="text-xs">{label}</span>
                <Switch
                  checked={draft.bottomNav[key] !== false}
                  onCheckedChange={(v) => patch("bottomNav", { ...draft.bottomNav, [key]: v })}
                  aria-label={label}
                />
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("portalSettings.brand.bottomNavHint")}</p>
        </div>
      </SectionCard>

      {/* ── §5.2+ Tasarım & Tipografi — mobil portalın TAM tasarım kontrolü ── */}
      <SectionCard title={t("portalSettings.design.title")} desc={t("portalSettings.design.desc")}>
        <DesignSectionContent
          draft={draft}
          onField={(k, v) => {
            setDraft((d) => (d ? ({ ...d, [k]: v } as NonNullable<typeof draft>) : d));
            setDirty(true);
          }}
          pickImage={pickImage}
          onTouch={() => setDirty(true)}
          t={t}
        />
      </SectionCard>

      {/* ── §5.3 Widget ve Modül Yönetimi ── */}
      <SectionCard title={t("portalSettings.widgets.title")} desc={t("portalSettings.widgets.desc")}>
        <div className="space-y-2">
          {draft.widgets.map((w, i) => {
            const meta = WIDGET_ORDER.find((x) => x.key === w.key)!;
            const I = meta.icon;
            return (
              <div key={w.key} className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white shadow-sm dark:bg-card">
                  <I className="size-4" />
                </span>
                <span className="min-w-24 text-xs font-medium">{t(`portalApp.widget.${w.key}`)}</span>
                <Switch checked={w.enabled} onCheckedChange={(v) => { const next = [...draft.widgets]; next[i] = { ...w, enabled: v }; setDraft({ ...draft, widgets: next }); setDirty(true); }} aria-label={t("portalSettings.widgets.toggle")} />
                <div className="ml-auto flex items-center gap-1.5">
                  <Select
                    value={w.visibility}
                    onValueChange={(v) => {
                      const next = [...draft.widgets];
                      next[i] = { ...w, visibility: w.key === "b2b" ? "AUTH" : (v as "ALL" | "AUTH") };
                      setDraft({ ...draft, widgets: next });
                      setDirty(true);
                    }}
                    disabled={w.key === "b2b"}
                  >
                    <SelectTrigger className="h-8 w-44 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("portalSettings.widgets.visAll")}</SelectItem>
                      <SelectItem value="AUTH">{t("portalSettings.widgets.visAuth")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {w.key === "b2b" && <Icons.Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("portalSettings.widgets.b2bLocked")} />}
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => moveWidget(i, -1)} disabled={i === 0} aria-label={t("portalSettings.widgets.up")}>
                      <Icons.ChevronUp className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => moveWidget(i, 1)} disabled={i === draft.widgets.length - 1} aria-label={t("portalSettings.widgets.down")}>
                      <Icons.ChevronDown className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ── §5.4 Bildirim Yönetimi + Canlı Duyuru Paneli ── */}
      <SectionCard title={t("portalSettings.notify.title")} desc={t("portalSettings.notify.desc")}>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
            <div>
              <Label className="text-xs">{t("portalSettings.notify.enabled")}</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t("portalSettings.notify.enabledHint")}</p>
            </div>
            <Switch checked={draft.notificationsEnabled} onCheckedChange={(v) => patch("notificationsEnabled", v)} />
          </div>
          {draft.notificationsEnabled && (
            <div>
              <Label className="text-xs">{t("portalSettings.notify.offsets")}</Label>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {draft.offsets.map((o, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">
                    {o} dk
                    <button
                      onClick={() => patch("offsets", draft.offsets.filter((_, j) => j !== i))}
                      className="rounded-full hover:text-teal-900"
                      aria-label={t("portalSettings.notify.removeOffset")}
                    >
                      <Icons.X className="size-3" />
                    </button>
                  </span>
                ))}
                <Select
                  value="__add"
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (Number.isFinite(n) && n > 0 && !draft.offsets.includes(n)) patch("offsets", [...draft.offsets, n].sort((a, b) => a - b).slice(0, 5));
                  }}
                >
                  <SelectTrigger className="h-7 w-36 text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__add" disabled>{t("portalSettings.notify.addOffset")}</SelectItem>
                    {[5, 10, 15, 30, 45, 60, 120, 1440].filter((n) => !draft.offsets.includes(n)).map((n) => (
                      <SelectItem key={n} value={String(n)}>{t("portalSettings.notify.offsetMin", { n })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("portalSettings.notify.offsetsHint")}</p>
            </div>
          )}

          {/* Canlı Duyuru Paneli (§5.4) */}
          <div className="rounded-lg border border-dashed p-3">
            <div className="flex items-center gap-1.5">
              <Icons.Radio className="size-4 text-red-500" />
              <p className="text-xs font-semibold">{t("portalSettings.announce.title")}</p>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("portalSettings.announce.desc")}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_130px_130px]">
              <Input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder={t("portalSettings.announce.titlePh")} maxLength={120} />
              <Select value={annLevel} onValueChange={setAnnLevel}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INFO">{t("portalSettings.announce.levelInfo")}</SelectItem>
                  <SelectItem value="WARNING">{t("portalSettings.announce.levelWarning")}</SelectItem>
                  <SelectItem value="URGENT">{t("portalSettings.announce.levelUrgent")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={annTarget} onValueChange={setAnnTarget}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("portalSettings.announce.targetAll")}</SelectItem>
                  <SelectItem value="AUTH">{t("portalSettings.announce.targetAuth")}</SelectItem>
                  <SelectItem value="GUEST">{t("portalSettings.announce.targetGuest")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea value={annMessage} onChange={(e) => setAnnMessage(e.target.value)} placeholder={t("portalSettings.announce.msgPh")} rows={2} maxLength={500} className="mt-2" />
            <Button size="sm" className="mt-2" onClick={() => void sendAnnouncement()} disabled={annBusy || !annTitle.trim() || !annMessage.trim()}>
              {annBusy ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.Send className="size-4" />} {t("portalSettings.announce.send")}
            </Button>
            {analytics && <p className="mt-1.5 text-[11px] text-muted-foreground">{t("portalSettings.announce.sentCount", { count: analytics.announcements })}</p>}
          </div>
        </div>
      </SectionCard>

      {/* ── §5.4+ Dış Bildirim Kanalları — WhatsApp (şirket mobil telefonu) + SMS ── */}
      <NotificationChannelsCard editionId={editionId} />

      {/* ── §5.5 İçerik Bağlama ── */}
      <SectionCard title={t("portalSettings.content.title")} desc={t("portalSettings.content.desc")}>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">{t("portalSettings.content.sponsors")}</Label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {draft.sponsorIds.length > 0 ? t("portalSettings.content.sponsorsSelected", { count: draft.sponsorIds.length }) : t("portalSettings.content.sponsorsAll")}
            </p>
            {lookups.sponsors.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">{t("portalSettings.content.noSponsors")}</p>
            ) : (
              <div className="maven-scroll mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                {lookups.sponsors.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50">
                    <Checkbox
                      checked={draft.sponsorIds.includes(s.id)}
                      onCheckedChange={(v) => patch("sponsorIds", v ? [...draft.sponsorIds, s.id] : draft.sponsorIds.filter((x) => x !== s.id))}
                    />
                    {s.logoUrl ? <img src={s.logoUrl} alt="" className="size-4 rounded object-contain" /> : <Icons.Building2 className="size-3.5 text-muted-foreground" />}
                    <span className="truncate">{s.name}</span>
                    {s.tierName && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{s.tierName}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">{t("portalSettings.content.map")}</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="grid h-11 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
                {draft.venueMapUrl ? <img src={draft.venueMapUrl} alt="" className="size-full object-cover" /> : <Icons.Map className="size-4 text-muted-foreground" />}
              </div>
              <Input
                type="file"
                accept="image/*"
                className="h-9 text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void pickImage(f, 600_000, (url) => {
                    patch("venueMapUrl", url);
                    if (!draft.venueMapEnabled) patch("venueMapEnabled", true);
                  });
                }}
              />
              {draft.venueMapUrl && (
                <Button variant="ghost" size="icon" onClick={() => { patch("venueMapUrl", ""); patch("venueMapEnabled", false); }} aria-label={t("portalSettings.brand.clear")}>
                  <Icons.Trash2 className="size-4 text-muted-foreground" />
                </Button>
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                <Label className="text-[11px] text-muted-foreground">{t("portalSettings.content.mapActive")}</Label>
                <Switch checked={draft.venueMapEnabled} onCheckedChange={(v) => patch("venueMapEnabled", v)} disabled={!draft.venueMapUrl} />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
            <div>
              <Label className="text-xs">PWA</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t("portalSettings.content.pwaHint")}</p>
            </div>
            <Switch checked={draft.pwaEnabled} onCheckedChange={(v) => patch("pwaEnabled", v)} aria-label="PWA" />
          </div>
        </div>
      </SectionCard>

      {/* ── §5.6 Canlı Portal İstatistikleri ── */}
      <SectionCard title={t("portalSettings.analytics.title")} desc={t("portalSettings.analytics.desc")}>
        {!analytics ? (
          <Loading rows={3} />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard icon={Icons.Users} label={t("portalSettings.analytics.unique")} value={String(analytics.uniqueVisitors.total)} sub={`${t("portalSettings.analytics.guest")} ${analytics.uniqueVisitors.guest} · ${t("portalSettings.analytics.auth")} ${analytics.uniqueVisitors.auth}`} />
              <StatCard icon={Icons.Eye} label={t("portalSettings.analytics.visits")} value={String(analytics.visits.total)} sub={t("portalSettings.analytics.visitUnit")} />
              <StatCard icon={Icons.Smartphone} label={t("portalSettings.analytics.installs")} value={String(analytics.installs)} sub="PWA" />
              <StatCard icon={Icons.MessageCircleQuestion} label={t("portalSettings.analytics.questions")} value={String(analytics.questions.total)} sub={`${t("portalSettings.analytics.pending")} ${analytics.questions.pending}`} />
            </div>

            {/* 14 günlük ziyaret eğrisi — saf CSS çubuk */}
            <div>
              <p className="text-xs font-semibold">{t("portalSettings.analytics.visitsTrend")}</p>
              <div className="mt-1.5 flex h-16 items-end gap-1" role="img" aria-label={t("portalSettings.analytics.visitsTrend")}>
                {analytics.visits.byDay.map((d) => {
                  const max = Math.max(1, ...analytics.visits.byDay.map((x) => x.count));
                  return (
                    <div key={d.day} className="flex-1 rounded-t bg-teal-500/70 transition-all" style={{ height: `${Math.max(6, (d.count / max) * 100)}%` }} title={`${d.day}: ${d.count}`} />
                  );
                })}
              </div>
              <div className="mt-0.5 flex justify-between text-[9px] text-muted-foreground">
                <span>{analytics.visits.byDay[0]?.day.slice(5)}</span>
                <span>{analytics.visits.byDay[analytics.visits.byDay.length - 1]?.day.slice(5)}</span>
              </div>
            </div>

            {/* widget tıklama oranları */}
            <div>
              <p className="text-xs font-semibold">{t("portalSettings.analytics.clicks")}</p>
              {analytics.widgetClicks.length === 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">{t("portalSettings.analytics.noClicks")}</p>
              ) : (
                <div className="mt-1.5 space-y-1.5">
                  {analytics.widgetClicks.map((c) => {
                    const max = Math.max(...analytics.widgetClicks.map((x) => x.count));
                    return (
                      <div key={c.widgetKey} className="flex items-center gap-2">
                        <span className="w-28 shrink-0 truncate text-[11px]">{t(`portalApp.widget.${c.widgetKey}`)}</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-teal-500" style={{ width: `${(c.count / max) * 100}%` }} />
                        </div>
                        <span className="w-8 shrink-0 text-right text-[11px] tabular-nums">{c.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* B2B tamamlama + form katılımı */}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold"><Icons.Handshake className="size-3.5" /> B2B</p>
                <p className="mt-1 text-lg font-bold tabular-nums">%{analytics.b2b.completionRate}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t("portalSettings.analytics.b2bDone", { completed: analytics.b2b.completed, total: analytics.b2b.total })} · {t("portalSettings.analytics.b2bAccepted", { accepted: analytics.b2b.accepted, declined: analytics.b2b.declined })}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold"><Icons.ClipboardList className="size-3.5" /> {t("portalSettings.analytics.forms")}</p>
                <p className="mt-1 text-lg font-bold tabular-nums">{analytics.formEngagement.submissions}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t("portalSettings.analytics.formOpens", { opens: analytics.formEngagement.opens })}
                  {analytics.formEngagement.forms.length > 0 && ` · ${analytics.formEngagement.forms.map((f) => `${f.name}: ${f.submissions}`).join(", ")}`}
                </p>
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Magic Link diyaloğu (§5.1) ── */}
      <Dialog open={magicOpen} onOpenChange={(o) => { setMagicOpen(o); if (!o) setMagicResult(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("portalSettings.magic.title")}</DialogTitle>
            <DialogDescription className="text-xs">{t("portalSettings.magic.desc")}</DialogDescription>
          </DialogHeader>
          {magicResult ? (
            <div className="space-y-2">
              <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{t("portalSettings.magic.onceWarning")}</p>
              <div className="maven-scroll max-h-64 space-y-1.5 overflow-y-auto">
                {magicResult.items.map((it) => (
                  <div key={it.personId} className="rounded-lg border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-medium">{it.name}</p>
                      {it.mailed && <span className="shrink-0 rounded-full bg-teal-50 px-1.5 py-0.5 text-[9px] font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">{t("portalSettings.magic.mailed")}</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <code className="min-w-0 flex-1 truncate rounded bg-muted px-1.5 py-1 font-mono text-[11px]">{it.token}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={t("portalSettings.magic.copy")}
                        onClick={() => {
                          void navigator.clipboard.writeText(it.token);
                          toast({ title: t("portalSettings.magic.copied") });
                        }}
                      >
                        <Icons.Copy className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {magicResult.skipped.map((s) => (
                  <p key={s.personId} className="text-[11px] text-muted-foreground">— {t("portalSettings.magic.skipped")}: {s.reason}</p>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">{t("portalSettings.magic.select", { count: magicSelected.size })}</p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setMagicSelected(new Set(peopleList.map((p) => p.id)))}>{t("portalSettings.magic.all")}</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setMagicSelected(new Set())}>{t("portalSettings.magic.none")}</Button>
                </div>
              </div>
              <div className="maven-scroll max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
                {peopleList.length === 0 ? (
                  <p className="p-2 text-[11px] text-muted-foreground">{t("portalSettings.magic.noPeople")}</p>
                ) : (
                  peopleList.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50">
                      <Checkbox
                        checked={magicSelected.has(p.id)}
                        onCheckedChange={(v) => {
                          const next = new Set(magicSelected);
                          if (v) next.add(p.id);
                          else next.delete(p.id);
                          setMagicSelected(next);
                        }}
                      />
                      <span className="truncate">{p.firstName} {p.lastName}</span>
                      <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground">{p.email ?? "—"}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
                <Label className="text-[11px] font-normal text-muted-foreground">{t("portalSettings.magic.sendMail")}</Label>
                <Switch checked={magicSendMail} onCheckedChange={setMagicSendMail} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMagicOpen(false)}>{t("portalSettings.magic.close")}</Button>
            {!magicResult && (
              <Button size="sm" disabled={magicBusy || magicSelected.size === 0} onClick={() => void issueMagic()}>
                {magicBusy ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.Wand2 className="size-4" />}
                {t("portalSettings.magic.generate")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: I, label, value, sub }: { icon: typeof Icons.Users; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm dark:bg-card">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <I className="size-3.5" />
        <span className="truncate text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

// ═══ §5.2+ TASARIM & TİPOGRAFİ — mobil portalın tüm tasarım/font ayarları ═══
// Font ailesi + ölçeği, üç alan (header/footer/içerik) renk ve arka plan görselleri
// (SVG/PNG/JPEG), Mobil Portal Sponsoru logosu ve alt-menü ikonlarının kanvas
// üzerinde grid mantığıyla konumlandırılması + ikon SVG logo desteği.
type DesignFields = {
  fontFamily: string; fontScale: number;
  headerBgColor: string; footerBgColor: string; contentBgColor: string;
  headerBgImage: string; footerBgImage: string; contentBgImage: string;
  portalSponsorLogoUrl: string; portalSponsorName: string; portalSponsorUrl: string;
  iconOverrides: Record<string, IconOverride>; iconLayout: Record<string, number>;
};

// font ailesi → CSS stack eşlemesi (portal uygulamasıyla birebir aynı)
export const PORTAL_FONT_CSS: Record<string, string> = {
  system: "inherit",
  serif: "Georgia, 'Times New Roman', serif",
  rounded: "ui-rounded, 'Nunito', 'SF Pro Rounded', system-ui, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  condensed: "'Arial Narrow', 'Roboto Condensed', Arial, sans-serif",
};

const NAV_ICONS: Record<string, typeof Icons.Home> = {
  home: Icons.Home,
  program: Icons.CalendarDays,
  sponsors: Icons.Handshake,
  map: Icons.Map,
  profile: Icons.UserRound,
};

function DesignSectionContent({
  draft,
  onField,
  pickImage,
  onTouch,
  t,
}: {
  draft: DesignFields;
  onField: (k: keyof DesignFields, v: unknown) => void;
  pickImage: (file: File, maxBytes: number, apply: (url: string) => void) => Promise<void>;
  onTouch: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [sel, setSel] = useState<string>("home");
  const dragKey = useRef<string | null>(null);

  const ordered = ([...NAV_KEYS] as string[]).sort((a, b) => (draft.iconLayout[a] ?? 0) - (draft.iconLayout[b] ?? 0));
  const swap = (a: string, b: string) => {
    const la = draft.iconLayout[a] ?? 0;
    const lb = draft.iconLayout[b] ?? 0;
    onField("iconLayout", { ...draft.iconLayout, [a]: lb, [b]: la });
  };
  const moveSelected = (dir: -1 | 1) => {
    const idx = ordered.indexOf(sel);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= ordered.length) return;
    swap(ordered[idx], ordered[j]);
  };
  const setOverride = (key: string, next: IconOverride) => {
    const clean = { ...draft.iconOverrides };
    if (next.svg || next.color) clean[key] = next;
    else delete clean[key];
    onField("iconOverrides", clean);
  };

  const COLOR_ROWS: { key: "headerBgColor" | "footerBgColor" | "contentBgColor"; label: string }[] = [
    { key: "headerBgColor", label: t("portalSettings.design.headerBg") },
    { key: "footerBgColor", label: t("portalSettings.design.footerBg") },
    { key: "contentBgColor", label: t("portalSettings.design.contentBg") },
  ];
  const IMAGE_ROWS: { key: "headerBgImage" | "footerBgImage" | "contentBgImage"; label: string; hint: string }[] = [
    { key: "headerBgImage", label: t("portalSettings.design.headerImg"), hint: t("portalSettings.design.headerImgHint") },
    { key: "footerBgImage", label: t("portalSettings.design.footerImg"), hint: t("portalSettings.design.footerImgHint") },
    { key: "contentBgImage", label: t("portalSettings.design.contentImg"), hint: t("portalSettings.design.contentImgHint") },
  ];

  return (
    <div className="space-y-5">
      {/* ── Tipografi ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("portalSettings.design.fontFamily")}</Label>
          <Select value={draft.fontFamily} onValueChange={(v) => onField("fontFamily", v)}>
            <SelectTrigger aria-label={t("portalSettings.design.fontFamily")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((f) => (
                <SelectItem key={f} value={f}>
                  <span style={{ fontFamily: PORTAL_FONT_CSS[f] }}>{t(`portalSettings.design.font_${f}`)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="truncate rounded border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground" style={{ fontFamily: PORTAL_FONT_CSS[draft.fontFamily] }}>
            {t("portalSettings.design.fontPreview")}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("portalSettings.design.fontScale")} — %{draft.fontScale}</Label>
          <input
            type="range"
            min={90}
            max={120}
            step={5}
            value={draft.fontScale}
            onChange={(e) => onField("fontScale", Number(e.target.value))}
            className="mt-2 w-full accent-teal-600"
            aria-label={t("portalSettings.design.fontScale")}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground"><span>%90</span><span>%100</span><span>%120</span></div>
          <p className="text-[11px] text-muted-foreground">{t("portalSettings.design.fontScaleHint")}</p>
        </div>
      </div>

      {/* ── Alan renkleri ── */}
      <div>
        <Label className="text-xs">{t("portalSettings.design.areaColors")}</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {COLOR_ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-2.5">
              <span className="truncate text-xs">{row.label}</span>
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={draft[row.key] || "#ffffff"}
                  onChange={(e) => onField(row.key, e.target.value)}
                  className="size-7 cursor-pointer rounded border bg-transparent"
                  aria-label={row.label}
                />
                {draft[row.key] && (
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => onField(row.key, "")} aria-label={t("portalSettings.design.resetArea")}>
                    <Icons.RotateCcw className="size-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{t("portalSettings.design.areaColorsHint")}</p>
      </div>

      {/* ── Alan arka plan görselleri (SVG/PNG/JPEG) ── */}
      <div>
        <Label className="text-xs">{t("portalSettings.design.areaImages")}</Label>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {IMAGE_ROWS.map((row) => (
            <div key={row.key} className="space-y-1.5 rounded-lg border bg-muted/10 p-2.5">
              <p className="text-xs font-medium">{row.label}</p>
              <p className="text-[10px] leading-snug text-muted-foreground">{row.hint}</p>
              <div className="flex items-center gap-2">
                <div className="relative grid h-11 w-16 shrink-0 place-items-center overflow-hidden rounded border bg-muted">
                  {draft[row.key] ? (
                    <img src={draft[row.key]} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <Icons.ImageIcon className="size-4 text-muted-foreground" />
                  )}
                </div>
                <Input
                  type="file"
                  accept=".svg,.png,.jpg,.jpeg,image/svg+xml,image/png,image/jpeg"
                  className="h-9 text-xs"
                  aria-label={row.label}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    void pickImage(f, 600_000, (url) => onField(row.key, url));
                  }}
                />
                {draft[row.key] && (
                  <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onField(row.key, "")} aria-label={t("portalSettings.brand.clear")}>
                    <Icons.Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Mobil Portal Sponsoru ── */}
      <div className="rounded-lg border border-dashed p-3">
        <div className="flex items-center gap-1.5">
          <Icons.BadgeCheck className="size-4 text-amber-500" />
          <p className="text-xs font-semibold">{t("portalSettings.design.sponsorTitle")}</p>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t("portalSettings.design.sponsorDesc")}</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-[auto_1fr_1fr] sm:items-start">
          <div className="flex items-center gap-2">
            <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border bg-white dark:bg-card">
              {draft.portalSponsorLogoUrl ? (
                <img src={draft.portalSponsorLogoUrl} alt="" className="size-full object-contain p-1" />
              ) : (
                <Icons.ImageIcon className="size-4 text-muted-foreground" />
              )}
            </div>
            <Input
              type="file"
              accept=".svg,.png,.jpg,.jpeg,image/svg+xml,image/png,image/jpeg"
              className="h-9 w-44 text-xs"
              aria-label={t("portalSettings.design.sponsorLogo")}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void pickImage(f, 300_000, (url) => onField("portalSponsorLogoUrl", url));
              }}
            />
            {draft.portalSponsorLogoUrl && (
              <Button variant="ghost" size="icon" className="size-8" onClick={() => onField("portalSponsorLogoUrl", "")} aria-label={t("portalSettings.brand.clear")}>
                <Icons.Trash2 className="size-4 text-muted-foreground" />
              </Button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("portalSettings.design.sponsorName")}</Label>
            <Input value={draft.portalSponsorName} onChange={(e) => onField("portalSponsorName", e.target.value)} maxLength={120} placeholder={t("portalSettings.design.sponsorNamePh")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("portalSettings.design.sponsorUrl")}</Label>
            <Input value={draft.portalSponsorUrl} onChange={(e) => onField("portalSponsorUrl", e.target.value)} maxLength={300} placeholder="https://…" type="url" />
          </div>
        </div>
      </div>

      {/* ── İkon Kanvası — grid konumlandırma + SVG logo desteği ── */}
      <div className="rounded-lg border border-dashed p-3">
        <div className="flex items-center gap-1.5">
          <Icons.LayoutGrid className="size-4 text-teal-600" />
          <p className="text-xs font-semibold">{t("portalSettings.design.canvasTitle")}</p>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t("portalSettings.design.canvasDesc")}</p>

        {/* telefon önizleme — alt menü kanvası */}
        <div className="mx-auto mt-3 max-w-xs">
          <div
            className="overflow-hidden rounded-2xl border shadow-sm"
            style={{
              backgroundColor: draft.contentBgColor || undefined,
              backgroundImage: draft.contentBgImage ? `url(${draft.contentBgImage})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="h-16" />
            {/* alt menü — 5 kolonlu grid kanvas */}
            <div
              className="relative border-t"
              style={{
                backgroundColor: draft.footerBgColor || "hsl(var(--card))",
                backgroundImage: draft.footerBgImage ? `url(${draft.footerBgImage})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="grid grid-cols-5 gap-1.5 p-2">
                {ordered.map((k) => {
                  const I = NAV_ICONS[k] ?? Icons.Home;
                  const o = draft.iconOverrides[k];
                  const selected = sel === k;
                  return (
                    <button
                      key={k}
                      draggable
                      onDragStart={(e) => {
                        dragKey.current = k;
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = dragKey.current;
                        dragKey.current = null;
                        if (from && from !== k) {
                          swap(from, k);
                          onTouch();
                        }
                        setSel(k);
                      }}
                      onClick={() => setSel(k)}
                      aria-label={t(`portalSettings.design.nav_${k}`)}
                      className={cn(
                        "flex min-h-[52px] cursor-grab flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed p-1 text-[9px] transition active:cursor-grabbing",
                        selected ? "border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/40 dark:bg-teal-900/30" : "border-muted-foreground/25 hover:border-muted-foreground/50",
                      )}
                    >
                      {o?.svg ? (
                        <img src={o.svg} alt="" className="size-4.5 object-contain" style={{ width: 18, height: 18 }} />
                      ) : (
                        <I className="size-4" style={{ color: o?.color || undefined }} />
                      )}
                      <span className="w-full truncate text-center">{t(`portalSettings.design.nav_${k}`)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="h-3" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} />
            </div>
          </div>
        </div>

        {/* seçili ikon kontrolleri */}
        <div className="mx-auto mt-3 flex max-w-md flex-wrap items-center justify-center gap-2">
          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">
            {t("portalSettings.design.selected")}: {t(`portalSettings.design.nav_${sel}`)}
          </span>
          <Button variant="outline" size="icon" className="size-8" onClick={() => moveSelected(-1)} aria-label={t("portalSettings.design.moveLeft")}>
            <Icons.ArrowLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => moveSelected(1)} aria-label={t("portalSettings.design.moveRight")}>
            <Icons.ArrowRight className="size-4" />
          </Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs hover:bg-muted/50">
            <Icons.Upload className="size-3.5" />
            {t("portalSettings.design.uploadSvg")}
            <input
              type="file"
              className="sr-only"
              accept=".svg,.png,image/svg+xml,image/png"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void pickImage(f, 300_000, (url) => {
                  setOverride(sel, { ...draft.iconOverrides[sel], svg: url });
                  onTouch();
                });
              }}
            />
          </label>
          {draft.iconOverrides[sel]?.svg && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setOverride(sel, {}); onTouch(); }}>
              <Icons.Eraser className="size-3.5" /> {t("portalSettings.design.clearSvg")}
            </Button>
          )}
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">{t("portalSettings.design.canvasHint")}</p>
      </div>
    </div>
  );
}

// ═══ §5.4+ DIŞ BİLDİRİM KANALLARI — WhatsApp (şirket mobil telefonu) + SMS ═══
// Bağımsız kaydetme akışı: /api/notifications/channels (GET/PUT) + /test.
// Sırlar API'den daima maskeli döner; maske değeri gönderilirse değişmez.
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

function NotificationChannelsCard({ editionId }: { editionId: string }) {
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
    void load();
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
      </div>
    </SectionCard>
  );
}
