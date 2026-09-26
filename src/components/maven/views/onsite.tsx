"use client";
// Sahada — canlı onsite kontrol (§07/§42): kapı seçimi, arama, tarama, tekrar/ret kuyruğu
// + Sertifikalar (§43) + İletişim + Operasyon + Ayarlar
import { useEffect, useMemo, useRef, useState } from "react";
import { listEntity, listEntityPaged, apiSend, apiGet } from "@/lib/client";
import { useApp } from "@/lib/store";
import { sanitizePreviewHtml } from "@/lib/safe-html";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { ATTENDANCE_STATUS, BADGE_STATUS, BADGE_FONTS, CAMPAIGN_PHASE, CERTIFICATE_STATUS, EMAIL_TEMPLATE_CATEGORY, MAIL_PROVIDER_KIND, TASK_STATUS, TASK_PRIORITY, fmtDateTime, fmtDate, label, CAPABILITIES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useLang, t, tLabel, exportI18nJson, importI18nJson } from "@/lib/i18n";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { DatabaseMigrationCard } from "./db-migration-card";
import { NotificationChannelsCard } from "./notification-channels-card";
import { CustomerDataCard, InstantBroadcastDialog, parseSendReport, BROADCAST_CHANNEL_LIST, type SendReportLite } from "./comms-crm";

// ─── SAHA ───────────────────────────────────────────────────────────────────

interface ScanRow {
  id: string; location: string; doorName?: string | null; action: string; result: string; reason?: string | null; device?: string | null; operator?: string | null; scannedAt: string;
  participation?: { id: string; person: { firstName: string; lastName: string } } | null;
}
interface ScanResult {
  result: string; tone?: string; reason?: string | null;
  person?: { id: string; name: string; company?: string | null; title?: string | null };
  registration?: { status: string; category?: string | null; funding: string } | null;
  badge?: { status: string; profile?: string | null } | null;
}

export function OnsiteView() {
  useLang(); // dil değişiminde yeniden render
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const [door, setDoor] = useState("Kapı A");
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [last, setLast] = useState<ScanResult | null>(null);
  const [denyTarget, setDenyTarget] = useState<string | null>(null);
  const [forceReason, setForceReason] = useState("");

  const { data: scans, error, reload, loading } = useApi<ScanRow[]>(() => listEntity<ScanRow>("scan-events", { limit: 60 }), [currentEditionId, refreshKey]);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todays = (scans ?? []).filter((s) => new Date(s.scannedAt) >= todayStart);
  const uniqueArrived = new Set(todays.filter((s) => s.action === "ENTRY" && s.result === "ALLOWED").map((s) => s.participation?.id)).size;
  const rescans = todays.filter((s) => s.result === "RESCAN_WARNING");
  const denied = todays.filter((s) => s.result === "DENIED");

  const scan = async (force?: string) => {
    if (!code.trim()) return;
    setScanning(true);
    try {
      const res = await apiSend<ScanResult>("/api/scan", "POST", { code: code.trim(), door, forceReason: force });
      setLast(res);
      if (res.result === "ALLOWED") setCode("");
      if (force) setDenyTarget(null); setForceReason("");
      toast({
        title: res.result === "ALLOWED" ? t("onsite.toastAllowed") : res.result === "RESCAN_WARNING" ? t("onsite.toastRescan") : t("onsite.toastDenied"),
        variant: res.result === "DENIED" ? "destructive" : "default",
        description: res.person ? `${res.person.name}${res.reason ? ` — ${res.reason}` : ""}` : res.reason,
      });
      reload(); bump();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("onsite.scanError");
      if (msg.includes("bulunamadı")) {
        setLast({ result: "DENIED", tone: "red", reason: msg });
      }
      toast({ title: t("onsite.scanToast"), description: msg, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t("onsite.title")} desc={t("onsite.desc")} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label={t("onsite.kpiUnique")} value={uniqueArrived} sub={t("onsite.kpiUniqueSub")} tone="emerald" icon={<Icons.UserCheck className="size-4" />} />
        <KpiCard label={t("onsite.kpiRescan")} value={rescans.length} sub={t("onsite.kpiRescanSub")} tone="amber" icon={<Icons.RotateCcw className="size-4" />} />
        <KpiCard label={t("onsite.kpiDenied")} value={denied.length} sub={t("onsite.kpiDeniedSub")} tone="rose" icon={<Icons.UserX className="size-4" />} />
        <KpiCard label={t("onsite.kpiTotal")} value={todays.length} sub={t("onsite.kpiTotalSub")} icon={<Icons.Activity className="size-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <SectionCard title={t("onsite.scanDesk")} desc={t("onsite.scanDeskDesc", { door })} className="min-w-0 lg:col-span-2">
          <div className="flex gap-2">
            {["Kapı A", "Kapı B", "Gala", "VIP Lounge"].map((d) => (
              <button key={d} onClick={() => setDoor(d)} className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition", door === d ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-primary/40")}>
                {d}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input placeholder={t("onsite.codePlaceholder")} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && scan()} className="font-mono" />
            <Button onClick={() => scan()} disabled={scanning || !code.trim()}>
              <Icons.ScanLine className="size-4" /> {scanning ? t("onsite.scanning") : t("onsite.scan")}
            </Button>
          </div>

          {/* sonuç kartı */}
          {last && (
            <div className={cn("mt-3 rounded-lg border-2 p-3",
              last.result === "ALLOWED" ? "border-emerald-300 bg-emerald-50/70" : last.result === "RESCAN_WARNING" ? "border-amber-300 bg-amber-50/70" : "border-rose-300 bg-rose-50/70")}>
              <div className="flex items-center gap-2">
                {last.result === "ALLOWED" ? <Icons.CircleCheck className="size-5 text-emerald-600" /> : last.result === "RESCAN_WARNING" ? <Icons.TriangleAlert className="size-5 text-amber-600" /> : <Icons.Ban className="size-5 text-rose-600" />}
                <p className="text-sm font-bold">{last.result === "ALLOWED" ? t("onsite.resultAllowed") : last.result === "RESCAN_WARNING" ? t("onsite.resultRescan") : t("onsite.resultDenied")}</p>
              </div>
              {last.person && (
                <div className="mt-2 space-y-0.5 text-xs">
                  <p className="font-semibold">{last.person.name} <span className="font-normal text-muted-foreground">{last.person.title ? `· ${last.person.title}` : ""}</span></p>
                  <p className="text-muted-foreground">{last.person.company ?? "—"}</p>
                </div>
              )}
              {last.registration && (
                <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                  <Chip tone="teal">{last.registration.category ?? t("onsite.noCategory")}</Chip>
                  <Chip tone={last.registration.status === "CONFIRMED" ? "emerald" : "amber"}>{t("onsite.regChip", { status: last.registration.status })}</Chip>
                  {last.badge && <Chip tone="violet">{t("onsite.badgeChip", { profile: last.badge.profile ?? "", status: last.badge.status })}</Chip>}
                </div>
              )}
              {last.reason && <p className="mt-2 text-xs text-muted-foreground">{last.reason}</p>}
              {last.result === "DENIED" && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setDenyTarget(last.person?.id ?? "")}>
                  {t("onsite.manualException")}
                </Button>
              )}
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">{t("onsite.demoNote")}</p>
        </SectionCard>

        <SectionCard title={t("onsite.liveFeed")} desc={t("onsite.liveFeedDesc")} className="min-w-0 lg:col-span-3" bodyClass="max-h-[420px] overflow-y-auto maven-scroll">
          {loading ? <Loading rows={6} /> : error ? <ErrorState message={error} onRetry={reload} /> : (scans ?? []).length === 0 ? (
            <EmptyState title={t("onsite.emptyTitle")} desc={t("onsite.emptyDesc")} />
          ) : (
            <div className="space-y-1.5">
              {(scans ?? []).map((s) => (
                <div key={s.id} className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                  s.result === "ALLOWED" ? "border-emerald-100 bg-emerald-50/40" : s.result === "RESCAN_WARNING" ? "border-amber-200 bg-amber-50/60" : "border-rose-200 bg-rose-50/60")}>
                  <span className={cn("grid size-6 place-items-center rounded-full text-white",
                    s.result === "ALLOWED" ? "bg-emerald-500" : s.result === "RESCAN_WARNING" ? "bg-amber-500" : "bg-rose-500")}>
                    {s.result === "ALLOWED" ? <Icons.Check className="size-3.5" /> : s.result === "RESCAN_WARNING" ? <Icons.RotateCcw className="size-3.5" /> : <Icons.X className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {s.participation ? `${s.participation.person.firstName} ${s.participation.person.lastName}` : t("onsite.unknownCode")}
                    <span className="ml-2 text-xs text-muted-foreground">{s.action} · {s.location}{s.doorName ? ` (${s.doorName})` : ""}</span>
                  </span>
                  {s.reason && <span className="hidden max-w-56 truncate text-xs text-muted-foreground md:inline">{s.reason}</span>}
                  <span className="text-xs tabular-nums text-muted-foreground">{fmtDateTime(s.scannedAt)}</span>
                  <span className="text-[11px] text-muted-foreground">{s.operator}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <Dialog open={Boolean(denyTarget)} onOpenChange={(o) => !o && setDenyTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t("onsite.exceptionTitle")}</DialogTitle><DialogDescription>{t("onsite.exceptionDesc")}</DialogDescription></DialogHeader>
          <div><Label>{t("onsite.reasonLabel")}</Label><Textarea value={forceReason} onChange={(e) => setForceReason(e.target.value)} placeholder={t("onsite.reasonPlaceholder")} className="mt-1" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDenyTarget(null)}>{t("common.cancel")}</Button>
            <Button disabled={!forceReason} onClick={() => scan(forceReason)}>{t("onsite.applyException")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── SERTİFİKALAR ───────────────────────────────────────────────────────────

interface CertDefRow {
  id: string; name: string; type: string; eligibilityRule?: string | null; signerName?: string | null;
  widthMm: number; heightMm: number; bleedMm: number; orientation: string; backgroundDataUrl: string | null;
  fontKey: string; textColor: string; bodyTemplate: string | null; tierNote: string | null;
  designJson?: string | null; issues: { id: string; status: string; eligibilityNote?: string | null }[];
}
interface CertIssueRow {
  id: string; status: string; eligibilityNote?: string | null; generatedAt?: string | null; deliveredAt?: string | null;
  participation?: { id: string; person: { firstName: string; lastName: string; company: string | null; title: string | null } } | null;
}
interface CertDraft {
  id: string; name: string;
  widthMm: number; heightMm: number; bleedMm: number; orientation: string;
  fontKey: string; textColor: string; tierNote: string | null;
  backgroundDataUrl: string | null; bodyTemplate: string | null; designJson: string | null;
}

// gövde şablonu yer tutucuları — tıkla, metnin sonuna eklenir
const CERT_TOKENS = ["{{fullName}}", "{{title}}", "{{company}}", "{{edition}}", "{{tier}}", "{{date}}", "{{serial}}"] as const;
const MAX_BG_BYTES = 600 * 1024;

// ── R10-b: KANVAS sertifika tasarımcısı — yaka kartı tasarımcısı mimarisi ───
const CERT_PX_PER_MM = 2.2; // kanvas ölçeği (mobilde overflow-x kabı ile kaydırılır)

type CertElementType = "text" | "image" | "line" | "qr";
interface CertElement {
  id: string;
  type: CertElementType;
  x: number; y: number; w: number; h: number; // mm
  text?: string;               // metin içeriği — {{}} yer tutucuları serbest / görsel alan etiketi
  placeholderBinding?: string; // ayrılmış bağlama: bodyTemplate | tierNote ...
  fontSize?: number; fontWeight?: number; color?: string; align?: string;
  imageDataUrl?: string;       // image elemanı dataURL (≤600KB)
  radius?: number;             // köşe yarıçapı (mm)
}
const CERT_ELEMENT_LABELS: Record<CertElementType, string> = { text: "Metin", image: "Görsel", line: "Çizgi", qr: "QR" };
const certR1 = (n: number) => Math.round(n * 10) / 10;
const certClamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const certUid = () => `ce${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function parseCertElements(json: string | null): CertElement[] {
  try {
    const arr = json ? (JSON.parse(json) as CertElement[]) : [];
    return Array.isArray(arr) ? arr.filter((e) => e && typeof e.x === "number" && typeof e.y === "number") : [];
  } catch { return []; }
}

// yeni tasarım varsayılan eleman seti: başlık, gövde, düzey notu, imza, tarih, logo alanı
const defaultCertElements = (editionName: string, bodyTemplate: string, tierNote: string): CertElement[] => [
  { id: certUid(), type: "text", x: 20, y: 15, w: 257, h: 12, text: editionName, fontSize: 7.5, fontWeight: 800, color: "0f766e", align: "center" },
  { id: certUid(), type: "text", x: 40, y: 62, w: 217, h: 9, text: tierNote || "{{tier}}", placeholderBinding: "tierNote", fontSize: 4, fontWeight: 600, color: "6b7280", align: "center" },
  { id: certUid(), type: "text", x: 40, y: 84, w: 217, h: 42, text: bodyTemplate || t("certificates.defaultBody"), placeholderBinding: "bodyTemplate", fontSize: 4.4, fontWeight: 400, color: "1f2937", align: "center" },
  { id: certUid(), type: "line", x: 200, y: 168, w: 50, h: 0.8, color: "1f2937" },
  { id: certUid(), type: "text", x: 190, y: 170.5, w: 70, h: 8, text: "{{signer}}", fontSize: 3.4, fontWeight: 700, color: "1f2937", align: "center" },
  { id: certUid(), type: "text", x: 24, y: 188, w: 60, h: 7, text: "{{date}}", fontSize: 3, fontWeight: 400, color: "6b7280", align: "left" },
  { id: certUid(), type: "image", x: 252, y: 180, w: 28, h: 16, text: t("certificates.canvasLogoArea"), color: "94a3b8", radius: 1 },
];

// yerleşim şablonları — kullanıcı: "farklı alanlara farklı yerleşimler yapabileyim"
interface CertPresetCtx { editionName: string; bodyTemplate: string; tierNote: string; widthMm: number; heightMm: number }
const CERT_PRESETS: { key: string; label: string; orientation: string; build: (c: CertPresetCtx) => CertElement[] }[] = [
  {
    key: "classic", label: "Yatay Klasik", orientation: "LANDSCAPE",
    build: (c) => {
      const W = c.widthMm, H = c.heightMm;
      return [
        { id: certUid(), type: "text", x: certR1(W * 0.07), y: certR1(H * 0.075), w: certR1(W * 0.86), h: 12, text: c.editionName, fontSize: 7.5, fontWeight: 800, color: "0f766e", align: "center" },
        { id: certUid(), type: "text", x: certR1(W * 0.13), y: certR1(H * 0.28), w: certR1(W * 0.74), h: 8, text: c.tierNote || "{{tier}}", fontSize: 4, fontWeight: 600, color: "6b7280", align: "center" },
        { id: certUid(), type: "text", x: certR1(W * 0.13), y: certR1(H * 0.40), w: certR1(W * 0.74), h: 42, text: c.bodyTemplate || t("certificates.defaultBodyShort"), fontSize: 4.4, fontWeight: 400, color: "1f2937", align: "center" },
        { id: certUid(), type: "line", x: certR1(W * 0.62), y: certR1(H * 0.80), w: certR1(W * 0.20), h: 0.8, color: "1f2937" },
        { id: certUid(), type: "text", x: certR1(W * 0.60), y: certR1(H * 0.815), w: certR1(W * 0.24), h: 8, text: "{{signer}}", fontSize: 3.4, fontWeight: 700, color: "1f2937", align: "center" },
        { id: certUid(), type: "text", x: certR1(W * 0.08), y: certR1(H * 0.90), w: 60, h: 7, text: "{{date}}", fontSize: 3, fontWeight: 400, color: "6b7280", align: "left" },
        { id: certUid(), type: "image", x: certR1(W * 0.86), y: certR1(H * 0.86), w: 28, h: 16, text: t("certificates.canvasLogoArea"), color: "94a3b8", radius: 1 },
      ];
    },
  },
  {
    key: "modern", label: "Dikey Modern", orientation: "PORTRAIT",
    build: (c) => {
      const W = c.widthMm, H = c.heightMm;
      return [
        { id: certUid(), type: "image", x: 16, y: 16, w: 36, h: 18, text: t("certificates.canvasLogoArea"), color: "94a3b8", radius: 1 },
        { id: certUid(), type: "text", x: 16, y: certR1(H * 0.15), w: W - 32, h: 14, text: c.editionName, fontSize: 7, fontWeight: 800, color: "0f172a", align: "left" },
        { id: certUid(), type: "text", x: 16, y: certR1(H * 0.22), w: W - 32, h: 8, text: c.tierNote || "{{tier}}", fontSize: 3.6, fontWeight: 600, color: "0f766e", align: "left" },
        { id: certUid(), type: "text", x: 16, y: certR1(H * 0.33), w: W - 32, h: certR1(H * 0.24), text: c.bodyTemplate || t("certificates.defaultBodyShort"), fontSize: 4, fontWeight: 400, color: "1f2937", align: "left" },
        { id: certUid(), type: "line", x: 16, y: certR1(H * 0.85), w: 60, h: 0.8, color: "1f2937" },
        { id: certUid(), type: "text", x: 16, y: certR1(H * 0.865), w: 90, h: 8, text: "{{signer}}", fontSize: 3.4, fontWeight: 700, color: "1f2937", align: "left" },
        { id: certUid(), type: "text", x: 16, y: certR1(H * 0.93), w: 90, h: 7, text: "{{date}}", fontSize: 3, fontWeight: 400, color: "6b7280", align: "left" },
        { id: certUid(), type: "qr", x: W - 42, y: certR1(H * 0.86), w: 26, h: 26, color: "0f766e" },
      ];
    },
  },
  {
    key: "minimal", label: "Minimal", orientation: "LANDSCAPE",
    build: (c) => {
      const W = c.widthMm, H = c.heightMm;
      return [
        { id: certUid(), type: "text", x: certR1(W * 0.13), y: certR1(H * 0.36), w: certR1(W * 0.74), h: 12, text: c.editionName, fontSize: 7, fontWeight: 700, color: "1f2937", align: "center" },
        { id: certUid(), type: "text", x: certR1(W * 0.17), y: certR1(H * 0.48), w: certR1(W * 0.66), h: 34, text: c.bodyTemplate || t("certificates.defaultBodyShort"), fontSize: 4.4, fontWeight: 400, color: "374151", align: "center" },
      ];
    },
  },
  {
    key: "prestige", label: "Prestij", orientation: "LANDSCAPE",
    build: (c) => {
      const W = c.widthMm, H = c.heightMm;
      const gold = "8a6d1a";
      return [
        { id: certUid(), type: "line", x: 12, y: 12, w: W - 24, h: 0.8, color: gold },
        { id: certUid(), type: "line", x: 12, y: H - 12.8, w: W - 24, h: 0.8, color: gold },
        { id: certUid(), type: "line", x: 12, y: 12, w: 0.8, h: H - 24, color: gold },
        { id: certUid(), type: "line", x: W - 12.8, y: 12, w: 0.8, h: H - 24, color: gold },
        { id: certUid(), type: "text", x: certR1(W * 0.10), y: certR1(H * 0.14), w: certR1(W * 0.80), h: 13, text: c.editionName, fontSize: 8.5, fontWeight: 800, color: gold, align: "center" },
        { id: certUid(), type: "line", x: certR1(W * 0.37), y: certR1(H * 0.235), w: certR1(W * 0.26), h: 0.6, color: gold },
        { id: certUid(), type: "text", x: certR1(W * 0.20), y: certR1(H * 0.28), w: certR1(W * 0.60), h: 8, text: c.tierNote || "{{tier}}", fontSize: 4, fontWeight: 600, color: "57534e", align: "center" },
        { id: certUid(), type: "text", x: certR1(W * 0.17), y: certR1(H * 0.40), w: certR1(W * 0.66), h: 42, text: c.bodyTemplate || t("certificates.defaultBodyShort"), fontSize: 4.4, fontWeight: 400, color: "292524", align: "center" },
        { id: certUid(), type: "line", x: certR1(W * 0.18), y: certR1(H * 0.80), w: 50, h: 0.8, color: "292524" },
        { id: certUid(), type: "text", x: certR1(W * 0.15), y: certR1(H * 0.815), w: 70, h: 8, text: "{{signer}}", fontSize: 3.4, fontWeight: 700, color: "292524", align: "center" },
        { id: certUid(), type: "line", x: certR1(W * 0.62), y: certR1(H * 0.80), w: 50, h: 0.8, color: "292524" },
        { id: certUid(), type: "text", x: certR1(W * 0.59), y: certR1(H * 0.815), w: 70, h: 8, text: t("certificates.accreditation"), fontSize: 3.2, fontWeight: 700, color: "292524", align: "center" },
        { id: certUid(), type: "text", x: certR1(W * 0.08), y: certR1(H * 0.90), w: 60, h: 7, text: "{{date}}", fontSize: 3, fontWeight: 400, color: "57534e", align: "left" },
        { id: certUid(), type: "image", x: certR1(W / 2 - 14), y: certR1(H * 0.85), w: 28, h: 16, text: t("certificates.canvasLogoArea"), color: "94a3b8", radius: 1 },
      ];
    },
  },
];

export function CertificatesView() {
  useLang(); // dil değişiminde yeniden render
  const { currentEditionId, tenant, editions, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedDefId, setSelectedDefId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CertDraft | null>(null);
  const [savingDesign, setSavingDesign] = useState(false);
  const [issueSel, setIssueSel] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [mailBusyId, setMailBusyId] = useState<string | null>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);
  // ── R10-b: kanvas durumu ──
  const [selElId, setSelElId] = useState<string | null>(null);
  const [certPreviewMode, setCertPreviewMode] = useState(false);
  const [previewPid, setPreviewPid] = useState<string | null>(null);
  const [presetKey, setPresetKey] = useState("none");
  const elFileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number } | null>(null);

  const edition = editions.find((e) => e.id === currentEditionId);

  const { data: defs, error, reload, loading } = useApi<CertDefRow[]>(
    () => listEntity<CertDefRow>("certificate-definitions", { editionId: currentEditionId ?? undefined }),
    [currentEditionId, refreshKey],
  );

  const selectedDef = (defs ?? []).find((d) => d.id === selectedDefId) ?? null;

  // seçili tanımın belge listesi — kişi dahil (registry include: participation.person)
  const { data: issues, error: issueError, reload: reloadIssues, loading: issueLoading } = useApi<CertIssueRow[]>(
    () => (selectedDefId ? listEntity<CertIssueRow>("certificate-issues", { definitionId: selectedDefId, limit: 100 }) : Promise.resolve([])),
    [selectedDefId, refreshKey],
  );

  const selectDef = (d: CertDefRow) => {
    setSelectedDefId(d.id);
    setIssueSel(new Set());
    setDraft({
      id: d.id, name: d.name,
      widthMm: d.widthMm ?? 297, heightMm: d.heightMm ?? 210, bleedMm: d.bleedMm ?? 0,
      orientation: d.orientation ?? "LANDSCAPE", fontKey: d.fontKey ?? "playfair",
      textColor: `#${(d.textColor ?? "1f2937").replace("#", "")}`, tierNote: d.tierNote ?? null,
      backgroundDataUrl: d.backgroundDataUrl ?? null, bodyTemplate: d.bodyTemplate ?? "",
      designJson: d.designJson ?? null,
    });
    setSelElId(null); setCertPreviewMode(false); setPreviewPid(null); setPresetKey("none");
  };

  const patchDraft = (patch: Partial<CertDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const generate = async (def: CertDefRow) => {
    setBusy(def.id);
    try {
      const res = await apiSend<{ eligible: number }>("/api/flows", "POST", { action: "certificate.generate", definitionId: def.id });
      toast({ title: t("certificates.generateDone"), description: t("certificates.generateDoneDesc", { count: res.eligible }) });
      reload(); bump();
    } catch (e) {
      toast({ title: t("certificates.generateFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const saveDesign = async () => {
    if (!draft) return;
    setSavingDesign(true);
    try {
      const saved = await apiSend<CertDefRow>(`/api/certificate-definitions/${draft.id}`, "PUT", {
        widthMm: draft.widthMm, heightMm: draft.heightMm, bleedMm: draft.bleedMm,
        orientation: draft.orientation, fontKey: draft.fontKey,
        textColor: draft.textColor.replace("#", ""), tierNote: draft.tierNote,
        backgroundDataUrl: draft.backgroundDataUrl, bodyTemplate: draft.bodyTemplate,
        designJson: draft.designJson, // R10-b: kanvas eleman dizisi
      });
      toast({ title: t("certificates.designSaved"), description: t("certificates.designSavedDesc", { name: saved.name, w: saved.widthMm, h: saved.heightMm, orient: saved.orientation === "PORTRAIT" ? t("certificates.portraitShort") : t("certificates.landscapeShort"), elements: parseCertElements(draft.designJson).length }) });
      reload(); bump();
    } catch (e) {
      toast({ title: t("certificates.designSaveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setSavingDesign(false); }
  };

  // arka plan yükleme — Medya Arşivi → Sertifikalar klasörüne benzersiz adla kaydedilir
  const uploadBackground = (file: File) => {
    if (file.size > MAX_BG_BYTES) {
      toast({ title: t("certificates.imageTooLarge"), description: t("certificates.imageTooLargeDesc", { size: (file.size / 1024).toFixed(0) }), variant: "destructive" });
      return;
    }
    if (!draft || !currentEditionId) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      try {
        const res = await apiSend<{ asset: { dataUrl: string; name: string } }>("/api/media/upload-linked", "POST", {
          editionId: currentEditionId, systemFolder: "SERTIFIKA", linkedType: "CERTIFICATE", linkedId: draft.id,
          name: `${selectedDef?.name ?? draft.name}-arkaplan`, dataUrl,
        });
        patchDraft({ backgroundDataUrl: res.asset.dataUrl });
        toast({ title: t("certificates.bgUploaded"), description: t("certificates.bgUploadedDesc", { name: res.asset.name }) });
      } catch (e) {
        // arşiv yazılamazsa tasarımcıya yerel uygula — kayıt yine de mümkün
        patchDraft({ backgroundDataUrl: dataUrl });
        toast({ title: t("certificates.bgLocalOnly"), description: e instanceof Error ? e.message : t("certificates.mediaArchiveFail"), variant: "destructive" });
      }
    };
    reader.readAsDataURL(file);
  };

  // sertifika baskı sayfası — text/html döner, blob URL yeni sekmede (popup engellenirse iframe)
  const openCertSheet = async (participationIds: string[]) => {
    if (!currentEditionId || !selectedDefId) return;
    if (participationIds.length === 0) {
      toast({ title: t("certificates.noneSelected"), description: t("certificates.noneSelectedDesc"), variant: "destructive" });
      return;
    }
    setPrinting(true);
    try {
      const res = await fetch("/api/certificates/print-sheet", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionId: currentEditionId, definitionId: selectedDefId, participationIds }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t("certificates.sheetFailed", { status: res.status }));
      }
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url);
      if (!win) {
        const frame = document.createElement("iframe");
        frame.style.position = "fixed";
        frame.style.right = "0"; frame.style.bottom = "0";
        frame.style.width = "0"; frame.style.height = "0"; frame.style.border = "0";
        frame.src = url;
        document.body.appendChild(frame);
        toast({ title: t("certificates.sheetReady"), description: t("certificates.sheetReadyDesc") });
      }
      // ELIGIBLE → GENERATED geçişi sunucu tarafında otomatik; listeyi tazele
      reloadIssues(); reload(); bump();
    } catch (e) {
      toast({ title: t("certificates.printFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setPrinting(false); }
  };

  // e-posta ile gönder (simülasyon) — deliveredAt işlenir, toast şablon bilgisini verir
  const mailDeliver = async (issue: CertIssueRow) => {
    if (!issue.participation) return;
    setMailBusyId(issue.id);
    try {
      await apiSend(`/api/certificate-issues/${issue.id}`, "PUT", { status: "DELIVERED", deliveredAt: new Date().toISOString() });
      toast({ title: t("certificates.mailSent"), description: t("certificates.mailSentDesc", { name: issue.participation.person.firstName + " " + issue.participation.person.lastName }) });
      reloadIssues(); reload(); bump();
    } catch (e) {
      toast({ title: t("certificates.mailFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setMailBusyId(null); }
  };

  // ── R10-b: kanvas yardımcıları — kişi-özel doldurma + eleman CRUD + sürükleme ──
  const editionName = edition ? `${edition.name}${edition.editionLabel ? ` — ${edition.editionLabel}` : ""}` : t("certificates.fallbackEdition");

  const certElements = useMemo<CertElement[]>(() => {
    if (!draft) return [];
    const parsed = parseCertElements(draft.designJson);
    if (parsed.length > 0) return parsed;
    return defaultCertElements(editionName, draft.bodyTemplate ?? "", draft.tierNote ?? "");
  }, [draft?.designJson, draft?.bodyTemplate, draft?.tierNote, editionName]);

  // önizleme kişisi — seçili issue'nun katılımcı adı (print-sheet fill eşlemesi)
  const previewIssue = (issues ?? []).find((i) => i.participation && i.participation.id === previewPid) ?? (issues ?? []).find((i) => i.participation) ?? null;
  const fillFor = (tpl: string): string =>
    (tpl ?? "")
      .replace(/\{\{fullName\}\}/g, previewIssue?.participation ? `${previewIssue.participation.person.firstName} ${previewIssue.participation.person.lastName}` : "Ahmet Yılmaz")
      .replace(/\{\{title\}\}/g, previewIssue?.participation?.person.title || "Ar-Ge Müdürü")
      .replace(/\{\{company\}\}/g, previewIssue?.participation?.person.company || "ABC Pharma")
      .replace(/\{\{edition\}\}/g, editionName)
      .replace(/\{\{series\}\}/g, tenant?.name ?? "Maven")
      .replace(/\{\{type\}\}/g, draft?.name ?? "Sertifika")
      .replace(/\{\{tier\}\}/g, draft?.tierNote || "Katılımcı")
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }))
      .replace(/\{\{serial\}\}/g, "PAR-000001")
      .replace(/\{\{signer\}\}/g, selectedDef?.signerName ?? "Yetkili")
      .replace(/\n/g, " ");

  const setCertElements = (els: CertElement[]) => patchDraft({ designJson: JSON.stringify(els) });
  const updateCertElement = (id: string, patch: Partial<CertElement>) =>
    setCertElements(certElements.map((el) => (el.id === id ? { ...el, ...patch } : el)));
  const addCertElement = (type: CertElementType) => {
    const offset = certElements.length * 4;
    const base: CertElement = {
      id: certUid(), type, x: certR1(20 + offset), y: certR1(20 + offset),
      w: type === "line" ? 60 : type === "qr" ? 24 : 60, h: type === "line" ? 0.8 : type === "qr" ? 24 : 12,
      text: type === "text" ? t("certificates.elTypeText") : type === "image" ? t("certificates.elementImageArea") : undefined,
      fontSize: type === "text" ? 4.2 : undefined, fontWeight: type === "text" ? 400 : undefined,
      color: "1f2937", align: type === "text" ? "left" : undefined, radius: type === "image" ? 1 : undefined,
    };
    setCertElements([...certElements, base]);
    setSelElId(base.id);
  };
  const removeCertElement = (id: string) => {
    setCertElements(certElements.filter((el) => el.id !== id));
    setSelElId(null);
  };
  // katman sırası: dizi sırası = çizim sırası; öne → sona taşı, arkaya → başa taşı
  const reorderCertElement = (id: string, dir: 1 | -1) => {
    const idx = certElements.findIndex((el) => el.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= certElements.length) return;
    const els = [...certElements];
    [els[idx], els[target]] = [els[target], els[idx]];
    setCertElements(els);
  };

  const applyPreset = (key: string) => {
    const preset = CERT_PRESETS.find((p) => p.key === key);
    if (!preset || !draft) return;
    const isPortrait = preset.orientation === "PORTRAIT";
    const widthMm = isPortrait ? Math.min(draft.widthMm, draft.heightMm) : Math.max(draft.widthMm, draft.heightMm);
    const heightMm = isPortrait ? Math.max(draft.widthMm, draft.heightMm) : Math.min(draft.widthMm, draft.heightMm);
    patchDraft({
      designJson: JSON.stringify(preset.build({ editionName, bodyTemplate: draft.bodyTemplate ?? "", tierNote: draft.tierNote ?? "", widthMm, heightMm })),
      orientation: preset.orientation, widthMm, heightMm,
    });
    setSelElId(null);
    setPresetKey(key);
    toast({ title: t("certificates.presetApplied"), description: presetLabel(preset.key) });
  };

  // sürükleme: pointer capture ile taşima + sağ alt köşe tutamacıyla boyutlandırma
  const startDrag = (e: React.PointerEvent, el: CertElement, mode: "move" | "resize") => {
    e.stopPropagation();
    setSelElId(el.id);
    dragRef.current = { id: el.id, mode, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y, origW: el.w, origH: el.h };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !draft) return;
    const dx = (e.clientX - d.startX) / CERT_PX_PER_MM;
    const dy = (e.clientY - d.startY) / CERT_PX_PER_MM;
    if (d.mode === "move") {
      updateCertElement(d.id, { x: certR1(certClamp(d.origX + dx, 0, draft.widthMm)), y: certR1(certClamp(d.origY + dy, 0, draft.heightMm)) });
    } else {
      updateCertElement(d.id, { w: Math.max(1, certR1(d.origW + dx)), h: Math.max(0.4, certR1(d.origH + dy)) });
    }
  };
  const endDrag = () => { dragRef.current = null; };

  // klavye: ok tuşları 1mm (Shift = 5mm), Delete/Backspace elemanı siler
  const onCanvasKeyDown = (e: React.KeyboardEvent) => {
    if (!selElId) return;
    const el = certElements.find((x) => x.id === selElId);
    if (!el) return;
    const step = e.shiftKey ? 5 : 1;
    if (e.key === "ArrowLeft") { updateCertElement(selElId, { x: certR1(Math.max(0, el.x - step)) }); e.preventDefault(); }
    else if (e.key === "ArrowRight") { updateCertElement(selElId, { x: certR1(el.x + step) }); e.preventDefault(); }
    else if (e.key === "ArrowUp") { updateCertElement(selElId, { y: certR1(Math.max(0, el.y - step)) }); e.preventDefault(); }
    else if (e.key === "ArrowDown") { updateCertElement(selElId, { y: certR1(el.y + step) }); e.preventDefault(); }
    else if (e.key === "Delete" || e.key === "Backspace") { removeCertElement(selElId); e.preventDefault(); }
  };

  const renderCertElement = (el: CertElement) => {
    const selected = selElId === el.id;
    const color = `#${(el.color ?? "1f2937").replace("#", "")}`;
    const style: React.CSSProperties = {
      position: "absolute", left: el.x * CERT_PX_PER_MM, top: el.y * CERT_PX_PER_MM,
      width: el.w * CERT_PX_PER_MM, height: el.h * CERT_PX_PER_MM,
      color, overflow: "hidden",
    };
    let content: React.ReactNode = null;
    if (el.type === "text") {
      style.fontSize = (el.fontSize ?? 4) * CERT_PX_PER_MM;
      style.fontWeight = (el.fontWeight ?? 400) as React.CSSProperties["fontWeight"];
      style.textAlign = (el.align ?? "left") as React.CSSProperties["textAlign"];
      content = <span className="block whitespace-pre-wrap" style={{ wordBreak: "break-word" }}>{certPreviewMode ? fillFor(el.text ?? "") : (el.text || t("certificates.elTypeText"))}</span>;
    } else if (el.type === "line") {
      content = <div className="size-full" style={{ background: color, opacity: 0.85, borderRadius: (el.radius ?? 0) * CERT_PX_PER_MM }} />;
    } else if (el.type === "image") {
      content = el.imageDataUrl
        ? <img src={el.imageDataUrl} alt={t("certificates.imageAlt")} className="size-full object-cover" style={{ borderRadius: (el.radius ?? 0) * CERT_PX_PER_MM }} />
        : <span className={cn("flex size-full items-center justify-center rounded border border-dashed px-1 text-center text-[10px] leading-tight", selected ? "border-teal-500 text-teal-700" : "border-slate-400/70 text-slate-500")}>{el.text || t("certificates.elementImageArea")}</span>;
    } else {
      content = (
        <span className={cn("flex size-full items-center justify-center rounded-[2px] border border-dashed", certPreviewMode ? "border-teal-600/50 bg-teal-50/60" : "border-teal-500/70 bg-teal-50")}>
          <Icons.QrCode className="text-teal-700" style={{ width: el.h * CERT_PX_PER_MM * 0.62, height: el.h * CERT_PX_PER_MM * 0.62 }} />
        </span>
      );
    }
    return (
      <div
        key={el.id}
        style={style}
        onPointerDown={(e) => startDrag(e, el, "move")}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        className={cn(
          "cursor-move touch-none select-none",
          selected && "ring-2 ring-teal-500 ring-offset-1 ring-offset-white",
          el.type === "text" && "bg-slate-500/5",
        )}
        title={t("certificates.elementDragTitle", { type: elTypeLabel(el.type) })}
      >
        {content}
        {selected && (
          <span
            onPointerDown={(e) => startDrag(e, el, "resize")}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border border-teal-600 bg-teal-500"
            aria-label={t("certificates.resizeHandle")}
          />
        )}
      </div>
    );
  };

  const certNumField = (lbl: string, value: number, onChange: (n: number) => void, step = 1, min = 0, max = 600) => (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{lbl}</Label>
      <Input type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(certR1(Number(e.target.value) || 0))}
        className="h-8 text-xs tabular-nums" />
    </div>
  );

  const selectedIssuePids = (issues ?? []).filter((i) => issueSel.has(i.id) && i.participation).map((i) => i.participation!.id);

  // Faz E: sabit etiketler dil sözlüğünden + durum map'i tLabel köprüsüyle
  const elTypeLabel = (ty: CertElementType): string =>
    ty === "text" ? t("certificates.elTypeText") : ty === "image" ? t("certificates.elTypeImage") : ty === "line" ? t("certificates.elTypeLine") : t("certificates.elTypeQr");
  const presetLabel = (key: string): string =>
    key === "classic" ? t("certificates.presetClassic") : key === "modern" ? t("certificates.presetModern") : key === "minimal" ? t("certificates.presetMinimal") : t("certificates.presetPrestige");
  const tokenAddTitle = (tok: string) => t("certificates.tokenAddTitle", { token: tok });
  const tokenAddTextTitle = (tok: string) => t("certificates.tokenAddTextTitle", { token: tok });
  const certStatusMap = Object.fromEntries(Object.entries(CERTIFICATE_STATUS).map(([k]) => [k, tLabel(CERTIFICATE_STATUS, k)]));

  return (
    <div className="space-y-5">
      <PageHeader title={t("certificates.title")} desc={t("certificates.desc")} />
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (defs ?? []).length === 0 ? (
        <EmptyState title={t("certificates.emptyDefs")} desc={t("certificates.emptyDefsDesc")} />
      ) : (
        <>
          {/* 1 — tanım kartları (seçilebilir) */}
          <div className="grid gap-3 lg:grid-cols-3">
            {(defs ?? []).map((d) => {
              const cnt = (s: string) => d.issues.filter((i) => i.status === s).length;
              const selected = selectedDefId === d.id;
              return (
                <SectionCard
                  key={d.id}
                  title={d.name}
                  desc={d.eligibilityRule ?? t("certificates.noRule")}
                  className={cn("transition", selected && "ring-2 ring-teal-500")}
                  action={
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant={selected ? "default" : "outline"} onClick={() => selectDef(d)} title={t("certificates.designerTitle")}>
                        <Icons.Palette className="size-3.5" /> {t("certificates.designer")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => generate(d)} disabled={busy === d.id}>
                        {busy === d.id ? t("certificates.generating") : t("certificates.generate")}
                      </Button>
                    </div>
                  }
                >
                  <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                    <div className="rounded-md bg-emerald-50 p-1.5"><p className="text-base font-bold text-emerald-700 tabular-nums">{cnt("GENERATED") + cnt("DELIVERED")}</p><p className="text-emerald-600/80">{t("certificates.cntEligible")}</p></div>
                    <div className="rounded-md bg-sky-50 p-1.5"><p className="text-base font-bold text-sky-700 tabular-nums">{cnt("GENERATED")}</p><p className="text-sky-600/80">{t("certificates.cntGenerated")}</p></div>
                    <div className="rounded-md bg-teal-50 p-1.5"><p className="text-base font-bold text-teal-700 tabular-nums">{cnt("DELIVERED")}</p><p className="text-teal-600/80">{t("certificates.cntDelivered")}</p></div>
                    <div className="rounded-md bg-rose-50 p-1.5"><p className="text-base font-bold text-rose-700 tabular-nums">{cnt("NOT_ELIGIBLE") + cnt("REVOKED")}</p><p className="text-rose-600/80">{t("certificates.cntMissing")}</p></div>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">{t("certificates.signerLine", { signer: d.signerName ?? "—" })}</p>
                </SectionCard>
              );
            })}
          </div>

          {/* 2 — Tasarımcı + canlı önizleme */}
          {!draft || !selectedDef ? (
            <EmptyState
              title={t("certificates.pickDef")}
              desc={t("certificates.pickDefDesc")}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none min-w-0 lg:col-span-5">
                <SectionCard title={t("certificates.designProps", { name: selectedDef.name })} desc={t("certificates.designPropsDesc")}>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([
                      [t("certificates.fWidth"), "widthMm", 100, 500, 5], [t("certificates.fHeight"), "heightMm", 100, 500, 5], [t("certificates.fBleed"), "bleedMm", 0, 15, 1],
                    ] as [string, "widthMm" | "heightMm" | "bleedMm", number, number, number][]).map(([lbl, key, min, max, step]) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">{lbl}</Label>
                        <Input type="number" min={min} max={max} step={step} value={draft[key]} className="h-8 text-xs tabular-nums"
                          onChange={(e) => patchDraft({ [key]: Math.round(Number(e.target.value) * 10) / 10 } as Partial<CertDraft>)} />
                      </div>
                    ))}
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{t("certificates.orientation")}</Label>
                      <Select value={draft.orientation} onValueChange={(v) => patchDraft({ orientation: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LANDSCAPE">{t("certificates.landscape")}</SelectItem>
                          <SelectItem value="PORTRAIT">{t("certificates.portrait")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{t("certificates.font")}</Label>
                      <Select value={draft.fontKey} onValueChange={(v) => patchDraft({ fontKey: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(BADGE_FONTS).map(([k, f]) => <SelectItem key={k} value={k}>{f.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{t("certificates.textColor")}</Label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={draft.textColor} onChange={(e) => patchDraft({ textColor: e.target.value })} className="h-8 w-10 cursor-pointer rounded border" aria-label={t("certificates.textColor")} />
                        <Input value={draft.textColor} onChange={(e) => patchDraft({ textColor: e.target.value })} className="h-8 font-mono text-[11px]" />
                      </div>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{t("certificates.tierNote")}</Label>
                      <Input value={draft.tierNote ?? ""} onChange={(e) => patchDraft({ tierNote: e.target.value })} className="h-8 text-xs" placeholder={t("certificates.tierNotePlaceholder")} />
                    </div>
                  </div>

                  {/* arka plan yükleme */}
                  <div className="mt-3 rounded-lg border border-dashed bg-muted/20 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium"><Icons.ImageUp className="size-3.5 text-teal-600" /> {t("certificates.bgImage")}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{t("certificates.bgImageDesc")}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input ref={bgFileRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBackground(f); e.target.value = ""; }} />
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => bgFileRef.current?.click()}>
                        <Icons.Upload className="size-3" /> {t("certificates.pickImage")}
                      </Button>
                      {draft.backgroundDataUrl && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-600 hover:text-rose-700" onClick={() => patchDraft({ backgroundDataUrl: null })}>
                          <Icons.Trash2 className="size-3" /> {t("certificates.remove")}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* gövde şablonu */}
                  <div className="mt-3 space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">{t("certificates.bodyTemplate")}</Label>
                    <div className="flex flex-wrap gap-1">
                      {CERT_TOKENS.map((t) => (
                        <button key={t} type="button"
                          onClick={() => patchDraft({ bodyTemplate: (draft.bodyTemplate ?? "") + t })}
                          className="rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-teal-700 transition hover:border-teal-400 hover:bg-teal-50"
                          title={tokenAddTitle(t)}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <Textarea value={draft.bodyTemplate ?? ""} onChange={(e) => patchDraft({ bodyTemplate: e.target.value })} rows={5}
                      className="font-mono text-[11px]" placeholder={t("certificates.bodyPlaceholder")} />
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Button size="sm" onClick={saveDesign} disabled={savingDesign}>
                      {savingDesign ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Save className="size-3.5" />} {t("certificates.saveDesign")}
                    </Button>
                    <span className="text-[11px] text-muted-foreground">{t("certificates.saveDesignNote")}</span>
                  </div>
                </SectionCard>
              </div>

              {/* R10-b: kanvas — mm koordinatlı eleman yerleşimi (yaka kartı tasarımcısı mimarisi) */}
              <div className="animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none min-w-0 lg:col-span-7" style={{ animationDelay: "60ms" }}>
                <SectionCard
                  title={t("certificates.canvas", { name: selectedDef.name })}
                  desc={t("certificates.canvasDesc", { w: draft.widthMm, h: draft.heightMm })}
                >
                  {/* araç çubuğu: yerleşim şablonu + önizleme + kaydet + eleman ekle */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={presetKey} onValueChange={applyPreset}>
                      <SelectTrigger className="h-8 w-44 text-xs" aria-label={t("certificates.presetSelect")}><SelectValue placeholder={t("certificates.presetPlaceholder")} /></SelectTrigger>
                      <SelectContent>
                        {CERT_PRESETS.map((p) => <SelectItem key={p.key} value={p.key}>{presetLabel(p.key)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant={certPreviewMode ? "default" : "outline"} size="sm" className="h-8 text-xs"
                      onClick={() => { setCertPreviewMode((v) => !v); setSelElId(null); }}
                      title={t("certificates.previewToggleTitle")}>
                      {certPreviewMode ? <Icons.Pencil className="size-3.5" /> : <Icons.Eye className="size-3.5" />} {certPreviewMode ? t("certificates.backToDesign") : t("certificates.previewReal")}
                    </Button>
                    <Button size="sm" className="h-8 text-xs" onClick={saveDesign} disabled={savingDesign}>
                      {savingDesign ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Save className="size-3.5" />} {t("common.save")}
                    </Button>
                    <span className="ms-auto flex items-center gap-1">
                      <span className="mr-1 hidden text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline">{t("certificates.addElement")}</span>
                      <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => addCertElement("text")} aria-label={t("certificates.addText")}><Icons.Type className="size-3" /> {t("certificates.elTypeText")}</Button>
                      <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => addCertElement("line")} aria-label={t("certificates.addLine")}><Icons.Minus className="size-3" /> {t("certificates.elTypeLine")}</Button>
                      <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => addCertElement("image")} aria-label={t("certificates.addImage")}><Icons.Image className="size-3" /> {t("certificates.elTypeImage")}</Button>
                      <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => addCertElement("qr")} aria-label={t("certificates.addQr")}><Icons.QrCode className="size-3" /> {t("certificates.elTypeQr")}</Button>
                    </span>
                  </div>

                  {/* kanvas yüzeyi — mobilde yatay kaydırma kabı */}
                  <div className="maven-scroll mt-3 overflow-x-auto">
                    {/* üst cetvel (mm) */}
                    <div className="flex" style={{ marginLeft: 18 }}>
                      {Array.from({ length: Math.floor(draft.widthMm / 10) + 1 }).map((_, i) => (
                        <span key={i} className="shrink-0 border-l border-slate-300 text-[9px] tabular-nums text-muted-foreground" style={{ width: 10 * CERT_PX_PER_MM, paddingLeft: 2 }}>
                          {i * 10}
                        </span>
                      ))}
                    </div>
                    <div className="flex">
                      {/* sol cetvel (mm) */}
                      <div className="flex w-[18px] shrink-0 flex-col">
                        {Array.from({ length: Math.floor(draft.heightMm / 10) + 1 }).map((_, i) => (
                          <span key={i} className="shrink-0 border-t border-slate-300 text-[9px] leading-none tabular-nums text-muted-foreground" style={{ height: 10 * CERT_PX_PER_MM }}>{i * 10}</span>
                        ))}
                      </div>
                      <div
                        tabIndex={0} role="application" aria-label={t("certificates.canvasAria")}
                        onKeyDown={onCanvasKeyDown}
                        onPointerDown={() => setSelElId(null)}
                        className="relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                        style={{
                          width: draft.widthMm * CERT_PX_PER_MM,
                          height: draft.heightMm * CERT_PX_PER_MM,
                          fontFamily: BADGE_FONTS[draft.fontKey]?.css ?? "Georgia, serif",
                          background: draft.backgroundDataUrl ? `url('${draft.backgroundDataUrl}') center / cover no-repeat` : "linear-gradient(150deg,#fffdf6 0%,#faf6ea 55%,#f1ead4 100%)",
                          color: draft.textColor,
                          boxShadow: "0 1px 3px rgba(0,0,0,.18)",
                        }}
                      >
                        {!draft.backgroundDataUrl && (
                          <div
                            className="pointer-events-none absolute inset-0"
                            style={{
                              backgroundImage:
                                `repeating-linear-gradient(to right, rgba(13,148,136,.10) 0 1px, transparent 1px ${5 * CERT_PX_PER_MM}px),` +
                                `repeating-linear-gradient(to bottom, rgba(13,148,136,.10) 0 1px, transparent 1px ${5 * CERT_PX_PER_MM}px),` +
                                `repeating-linear-gradient(to right, rgba(13,148,136,.18) 0 1px, transparent 1px ${10 * CERT_PX_PER_MM}px),` +
                                `repeating-linear-gradient(to bottom, rgba(13,148,136,.18) 0 1px, transparent 1px ${10 * CERT_PX_PER_MM}px)`,
                            }}
                          />
                        )}
                        {/* baskı payı kılavuzu */}
                        {draft.bleedMm > 0 && (
                          <div className="pointer-events-none absolute" title={t("certificates.bleedTitle", { mm: draft.bleedMm })}
                            style={{ left: draft.bleedMm * CERT_PX_PER_MM, top: draft.bleedMm * CERT_PX_PER_MM, right: draft.bleedMm * CERT_PX_PER_MM, bottom: draft.bleedMm * CERT_PX_PER_MM, border: "1.5px dashed rgba(217,119,6,.45)" }} />
                        )}
                        {certElements.map((el) => renderCertElement(el))}
                        {certPreviewMode && previewIssue?.participation && (
                          <span className="absolute bottom-1 right-2 rounded-full bg-teal-600/85 px-2 py-0.5 text-[9px] font-medium text-white">
                            {previewIssue.participation.person.firstName} {previewIssue.participation.person.lastName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">{t("certificates.canvasHelp")}</p>

                  {/* önizleme kişisi seçimi */}
                  {certPreviewMode && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Label className="text-[11px] text-muted-foreground">{t("certificates.previewPerson")}</Label>
                      <Select value={previewPid ?? previewIssue?.participation?.id ?? ""} onValueChange={setPreviewPid}>
                        <SelectTrigger className="h-7 w-56 text-xs"><SelectValue placeholder={t("certificates.previewPersonPlaceholder")} /></SelectTrigger>
                        <SelectContent className="maven-scroll max-h-64">
                          {(issues ?? []).filter((i) => i.participation).map((i) => (
                            <SelectItem key={i.id} value={i.participation!.id}>{i.participation!.person.firstName} {i.participation!.person.lastName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </SectionCard>

                {/* eleman listesi + özellik paneli */}
                <SectionCard title={t("certificates.elements")} className="mt-4" desc={selElId ? t("certificates.elementsPropsDesc") : t("certificates.elementsHint")}>
                  <div className="maven-scroll max-h-40 space-y-1 overflow-y-auto">
                    {certElements.length === 0 ? (
                      <p className="py-2 text-center text-[11px] text-muted-foreground">{t("certificates.noElements")}</p>
                    ) : certElements.map((el, i) => (
                      <button key={el.id} type="button" onClick={() => setSelElId(el.id)}
                        className={cn("flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition hover:border-teal-400 hover:bg-teal-50/40", selElId === el.id && "border-teal-500 bg-teal-50/60")}>
                        <Icons.GripVertical className="size-3 shrink-0 text-muted-foreground" />
                        <span className="shrink-0 font-medium">{elTypeLabel(el.type)}</span>
                        {el.text && <span className="min-w-0 flex-1 truncate text-muted-foreground">{el.text}</span>}
                        <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{el.x},{el.y} mm</span>
                        <span className="sr-only">{t("certificates.elementN", { n: i + 1 })}</span>
                      </button>
                    ))}
                  </div>

                  {selElId && certElements.find((el) => el.id === selElId) && (() => {
                    const el = certElements.find((c) => c.id === selElId)!;
                    const hex = `#${(el.color ?? "1f2937").replace("#", "")}`;
                    return (
                      <div className="mt-3 space-y-2.5 rounded-lg border bg-muted/20 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Chip tone="teal">{elTypeLabel(el.type)}</Chip>
                          <span className="flex items-center gap-1">
                            <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => reorderCertElement(el.id, -1)} aria-label={t("certificates.backwardAria")} title={t("certificates.sendBackwardTitle")}>
                              <Icons.ArrowDownToLine className="size-3" /> {t("certificates.sendBackward")}
                            </Button>
                            <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => reorderCertElement(el.id, 1)} aria-label={t("certificates.forwardAria")} title={t("certificates.bringForwardTitle")}>
                              <Icons.ArrowUpToLine className="size-3" /> {t("certificates.bringForward")}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-rose-600 hover:text-rose-700" onClick={() => removeCertElement(el.id)}>
                              <Icons.Trash2 className="size-3" /> {t("certificates.deleteElement")}
                            </Button>
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {certNumField(t("certificates.fX"), el.x, (n) => updateCertElement(el.id, { x: n }))}
                          {certNumField(t("certificates.fY"), el.y, (n) => updateCertElement(el.id, { y: n }))}
                          {certNumField(t("certificates.fW"), el.w, (n) => updateCertElement(el.id, { w: Math.max(n, 1) }))}
                          {certNumField(t("certificates.fH"), el.h, (n) => updateCertElement(el.id, { h: Math.max(n, 0.4) }))}
                        </div>
                        {el.type === "text" && (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              {certNumField(t("certificates.fontSize"), el.fontSize ?? 4, (n) => updateCertElement(el.id, { fontSize: certClamp(n, 0.5, 30) }), 0.2, 0.5, 30)}
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">{t("certificates.weight")}</Label>
                                <Select value={String(el.fontWeight ?? 400)} onValueChange={(v) => updateCertElement(el.id, { fontWeight: Number(v) })}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {[["400", "Normal"], ["500", "Medium"], ["600", "Semi Bold"], ["700", "Bold"], ["800", "Extra Bold"]].map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">{t("certificates.color")}</Label>
                                <div className="flex items-center gap-2">
                                  <input type="color" value={hex} onChange={(e) => updateCertElement(el.id, { color: e.target.value.replace("#", "") })} className="h-8 w-10 cursor-pointer rounded border" aria-label={t("certificates.elementColor")} />
                                  <Input value={hex} onChange={(e) => updateCertElement(el.id, { color: e.target.value.replace("#", "") })} className="h-8 font-mono text-[11px]" />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">{t("certificates.align")}</Label>
                                <Select value={el.align ?? "left"} onValueChange={(v) => updateCertElement(el.id, { align: v })}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="left">{t("certificates.alignLeft")}</SelectItem>
                                    <SelectItem value="center">{t("certificates.alignCenter")}</SelectItem>
                                    <SelectItem value="right">{t("certificates.alignRight")}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">{t("certificates.textContent")}</Label>
                              <Textarea value={el.text ?? ""} onChange={(e) => updateCertElement(el.id, { text: e.target.value })} rows={3} className="text-xs" />
                              <div className="flex flex-wrap gap-1">
                                {([...CERT_TOKENS, "{{signer}}"] as string[]).map((t) => (
                                  <button key={t} type="button"
                                    onClick={() => updateCertElement(el.id, { text: (el.text ?? "") + t })}
                                    className="rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-teal-700 transition hover:border-teal-400 hover:bg-teal-50"
                                    title={tokenAddTextTitle(t)}>
                                    {t}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                        {el.type === "image" && (
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">{t("certificates.imagePropLabel")}</Label>
                            <div className="flex flex-wrap items-center gap-2">
                              <input ref={elFileRef} type="file" accept="image/*" className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) {
                                    if (f.size > MAX_BG_BYTES) {
                                      toast({ title: t("certificates.imageTooLarge"), description: t("certificates.imageTooLargeDesc2", { size: (f.size / 1024).toFixed(0) }), variant: "destructive" });
                                    } else {
                                      const reader = new FileReader();
                                      reader.onload = () => updateCertElement(el.id, { imageDataUrl: String(reader.result) });
                                      reader.readAsDataURL(f);
                                    }
                                  }
                                  e.target.value = "";
                                }} />
                              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => elFileRef.current?.click()} aria-label={t("certificates.pickElementImage")}>
                                <Icons.Upload className="size-3" /> {t("certificates.pickImage")}
                              </Button>
                              {el.imageDataUrl && (
                                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-rose-600 hover:text-rose-700" onClick={() => updateCertElement(el.id, { imageDataUrl: undefined })} aria-label={t("certificates.removeElementImage")}>
                                  <Icons.Trash2 className="size-3" /> {t("certificates.remove")}
                                </Button>
                              )}
                              <Input type="number" min={0} max={20} step={0.5} value={el.radius ?? 0} onChange={(e) => updateCertElement(el.id, { radius: Number(e.target.value) || 0 })} className="h-7 w-20 text-xs tabular-nums" aria-label={t("certificates.radiusAria")} placeholder="radius mm" />
                            </div>
                            <p className="text-[10px] text-muted-foreground">{t("certificates.logoNote")}</p>
                          </div>
                        )}
                        {el.type === "line" && (
                          <p className="text-[10px] text-muted-foreground">{t("certificates.lineNote")}</p>
                        )}
                        {el.type === "qr" && (
                          <p className="text-[10px] text-muted-foreground">{t("certificates.qrNote")}</p>
                        )}
                      </div>
                    );
                  })()}
                </SectionCard>
              </div>

              {/* 3 — belge listesi */}
              <div className="min-w-0 lg:col-span-12">
                <SectionCard
                  title={t("certificates.issueList", { name: selectedDef.name })}
                  desc={t("certificates.issueListDesc")}
                  action={
                    <div className="flex items-center gap-2">
                      <Chip tone="teal">{t("certificates.selectedCount", { count: issueSel.size })}</Chip>
                      <Button size="sm" variant="outline" onClick={() => openCertSheet(selectedIssuePids)} disabled={printing || selectedIssuePids.length === 0}>
                        {printing ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Printer className="size-3.5" />} {t("certificates.printAll")}
                      </Button>
                    </div>
                  }
                >
                  {issueLoading ? <Loading rows={5} /> : issueError ? <ErrorState message={issueError} onRetry={reloadIssues} /> : (issues ?? []).length === 0 ? (
                    <EmptyState title={t("certificates.noIssues")} desc={t("certificates.noIssuesDesc")} />
                  ) : (
                    <div className="maven-scroll max-h-96 overflow-y-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10 bg-card text-left text-muted-foreground">
                          <tr>
                            <th className="w-10 px-3 py-2 font-medium"><span className="sr-only">{t("certificates.thSelect")}</span></th>
                            <th className="px-3 py-2 font-medium">{t("certificates.thPerson")}</th>
                            <th className="px-3 py-2 font-medium">{t("certificates.thStatus")}</th>
                            <th className="hidden px-3 py-2 font-medium sm:table-cell">{t("certificates.thGenerated")}</th>
                            <th className="hidden px-3 py-2 font-medium sm:table-cell">{t("certificates.thDelivered")}</th>
                            <th className="px-3 py-2 text-right font-medium">{t("certificates.thAction")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(issues ?? []).map((i, idx) => (
                            <tr key={i.id} className={cn("border-t transition", issueSel.has(i.id) ? "bg-teal-50/60" : "hover:bg-muted/40")}>
                              <td className="px-3 py-2">
                                <Checkbox
                                  checked={issueSel.has(i.id)}
                                  disabled={!i.participation}
                                  onCheckedChange={() =>
                                    setIssueSel((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(i.id)) next.delete(i.id); else next.add(i.id);
                                      return next;
                                    })
                                  }
                                  aria-label={t("certificates.selectIssueAria", { name: i.participation?.person.firstName ?? "" })}
                                />
                              </td>
                              <td className="animate-in fade-in px-3 py-2 motion-reduce:animate-none" style={{ animationDelay: `${idx * 25}ms` }}>
                                <div className="font-medium">{i.participation ? `${i.participation.person.firstName} ${i.participation.person.lastName}` : "—"}</div>
                                {i.participation?.person.company && <div className="text-[11px] text-muted-foreground">{i.participation.person.company}</div>}
                              </td>
                              <td className="px-3 py-2"><StatusBadge map={certStatusMap} value={i.status} /></td>
                              <td className="hidden whitespace-nowrap px-3 py-2 text-[11px] tabular-nums text-muted-foreground sm:table-cell">{fmtDateTime(i.generatedAt)}</td>
                              <td className="hidden whitespace-nowrap px-3 py-2 text-[11px] tabular-nums text-muted-foreground sm:table-cell">{fmtDateTime(i.deliveredAt)}</td>
                              <td className="px-3 py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={printing || !i.participation} onClick={() => openCertSheet([i.participation!.id])} title={t("certificates.openOneTitle")}>
                                    <Icons.ExternalLink className="size-3" /> {t("certificates.openOne")}
                                  </Button>
                                  {(i.status === "GENERATED" || i.status === "DELIVERED") && (
                                    <Button variant="outline" size="sm" className="h-7 gap-1 border-teal-300 bg-teal-50 px-2 text-xs text-teal-800 hover:bg-teal-100 hover:text-teal-900"
                                      disabled={mailBusyId === i.id || !i.participation}
                                      onClick={() => mailDeliver(i)}
                                      title={t("certificates.mailBtnTitle")}>
                                      {mailBusyId === i.id ? <Icons.Loader2 className="size-3 animate-spin" /> : <Icons.MailCheck className="size-3" />} {t("certificates.mailBtn")}
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── İLETİŞİM (360 Branding) ────────────────────────────────────────────────

interface CampaignRow {
  id: string; name: string; segmentRule: string; audienceCount: number; status: string; isSegmentFixed: boolean;
  phase: string; audienceMode: string; customRecipients: string | null;
  templateId: string | null; providerId: string | null; formId: string | null; subject?: string | null;
  sentAt?: string | null; sentCount: number; deliveredCount: number; openCount: number; clickCount: number; failCount: number;
  // — çok kanallı gönderim + hiyerarşik kapsam (comms-broadcast) —
  channel?: string | null; channels?: string | null; audienceJson?: string | null; lastSendReport?: string | null;
}
interface TemplateRow { id: string; name: string; category: string; phase: string; subject: string; htmlBody: string; usageCount: number; isActive: boolean }
interface ProviderRow {
  id: string; name: string; kind: string; host?: string | null; port?: number | null; username?: string | null;
  fromEmail: string; fromName?: string | null; replyTo?: string | null; dailyLimit?: number | null;
  isDefault: boolean; status: string; lastTestAt?: string | null; lastTestStatus?: string | null;
}
interface FormLite { id: string; name: string }
interface CategoryLite { id: string; name: string; code: string | null }

const AUDIENCE_MODE: Record<string, string> = { SEGMENT: "Segment (kural)", CUSTOM: "Özel Liste", BOTH: "Segment + Özel Liste" };
const CAMPAIGN_STATUS: Record<string, string> = { DRAFT: "Taslak", TESTED: "Test edildi", SCHEDULED: "Zamanlandı", SENT: "Gönderildi", FAILED: "Başarısız" };
const PROVIDER_STATUS: Record<string, string> = { ACTIVE: "Aktif", PAUSED: "Duraklatıldı" };
const PHASE_TONE: Record<string, "teal" | "amber" | "violet"> = { PRE_EVENT: "teal", DURING_EVENT: "amber", POST_EVENT: "violet" };

const PHASE_PILLS: { key: string; label: string }[] = [
  { key: "ALL", label: "Tüm Aşamalar" },
  { key: "PRE_EVENT", label: CAMPAIGN_PHASE.PRE_EVENT },
  { key: "DURING_EVENT", label: CAMPAIGN_PHASE.DURING_EVENT },
  { key: "POST_EVENT", label: CAMPAIGN_PHASE.POST_EVENT },
];

export function CommunicationsView() {
  useLang(); // dil değişiminde yeniden render
  const { currentEditionId, tenant, bump, refreshKey } = useApp();
  const { toast } = useToast();

  const [phaseFilter, setPhaseFilter] = useState("ALL");

  // ── veriler ──
  const { data: campaigns, error, reload, loading } = useApi<CampaignRow[]>(
    () => listEntity<CampaignRow>("campaigns", { editionId: currentEditionId ?? undefined, limit: 100 }),
    [currentEditionId, refreshKey],
  );
  const { data: templates, reload: reloadTemplates } = useApi<TemplateRow[]>(
    () => (currentEditionId ? listEntity<TemplateRow>("email-templates", { editionId: currentEditionId }) : Promise.resolve([])),
    [currentEditionId, refreshKey],
  );
  const { data: providers, reload: reloadProviders } = useApi<ProviderRow[]>(
    () => (tenant ? listEntity<ProviderRow>("mail-providers", { tenantId: tenant.id }) : Promise.resolve([])),
    [tenant?.id, refreshKey],
  );
  const { data: forms } = useApi<FormLite[]>(
    () => (currentEditionId ? listEntity<FormLite>("forms", { editionId: currentEditionId, limit: 50 }) : Promise.resolve([])),
    [currentEditionId, refreshKey],
  );
  // hedef kapsam filtreleri için kategori listesi (hiyerarşik kapsam)
  const { data: categories } = useApi<CategoryLite[]>(
    () => (currentEditionId ? listEntity<CategoryLite>("registration-categories", { editionId: currentEditionId, limit: 100 }) : Promise.resolve([])),
    [currentEditionId, refreshKey],
  );
  // anlık yayın diyaloğu
  const [instantOpen, setInstantOpen] = useState(false);

  const templateName = (id: string | null) => (templates ?? []).find((t) => t.id === id)?.name ?? null;
  const providerName = (id: string | null) => (providers ?? []).find((p) => p.id === id)?.name ?? null;
  const defaultProvider = (providers ?? []).find((p) => p.isDefault) ?? (providers ?? [])[0] ?? null;

  const visibleCampaigns = (campaigns ?? []).filter((c) => phaseFilter === "ALL" || c.phase === phaseFilter);

  // ── kampanya formu ──
  const emptyCampaign = {
    name: "", segmentRule: "", phase: "PRE_EVENT", audienceMode: "SEGMENT", customRecipients: "", templateId: "", providerId: "", formId: "", subject: "", isSegmentFixed: true,
    channels: ["EMAIL"] as string[],
    filters: { customerOnly: false, categories: [] as string[], requireEmail: false, requirePhone: false },
  };
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignEdit, setCampaignEdit] = useState<CampaignRow | null>(null);
  const [campaignForm, setCampaignForm] = useState(emptyCampaign);
  const [campaignBusy, setCampaignBusy] = useState(false);
  // DÜZELTME (kampanya formu): zorunlu istemci durumu buton disabled/aria-disabled'a
  // YANSITILIR + satır-içi hata gösterilir. Devre dışı buton güvenlik kontrolü DEĞİLDİR —
  // saveCampaign içindeki istemci kontrolleri ve sunucu doğrulaması aynen korunur.
  const campaignInvalid = !campaignForm.name.trim()
    || (campaignForm.audienceMode !== "SEGMENT" && !campaignForm.customRecipients.trim());

  const openCampaignNew = (preselect?: Partial<typeof emptyCampaign>) => {
    setCampaignEdit(null);
    setCampaignForm({ ...emptyCampaign, ...preselect });
    setCampaignOpen(true);
  };
  const openCampaignEdit = (c: CampaignRow) => {
    setCampaignEdit(c);
    let filters = { customerOnly: false, categories: [] as string[], requireEmail: false, requirePhone: false };
    if (c.audienceJson) {
      try {
        const p = JSON.parse(c.audienceJson) as Partial<typeof filters>;
        filters = {
          customerOnly: Boolean(p.customerOnly),
          categories: Array.isArray(p.categories) ? p.categories.filter((x): x is string => typeof x === "string") : [],
          requireEmail: Boolean(p.requireEmail),
          requirePhone: Boolean(p.requirePhone),
        };
      } catch { /* bozuk json — varsayılan */ }
    }
    const channels = (c.channels ?? c.channel ?? "EMAIL").split(/[;,\s]+/).map((s) => s.trim().toUpperCase()).filter((s) => ["EMAIL", "SMS", "WHATSAPP"].includes(s));
    setCampaignForm({
      name: c.name, segmentRule: c.segmentRule, phase: c.phase ?? "PRE_EVENT", audienceMode: c.audienceMode ?? "SEGMENT",
      customRecipients: c.customRecipients ?? "", templateId: c.templateId ?? "", providerId: c.providerId ?? "",
      formId: c.formId ?? "", subject: c.subject ?? "", isSegmentFixed: c.isSegmentFixed,
      channels: channels.length > 0 ? channels : ["EMAIL"], filters,
    });
    setCampaignOpen(true);
  };

  const saveCampaign = async () => {
    if (!currentEditionId) return;
    if (!campaignForm.name.trim()) { toast({ title: t("communications.nameRequired"), variant: "destructive" }); return; }
    if (campaignForm.audienceMode !== "SEGMENT" && !campaignForm.customRecipients.trim()) {
      toast({ title: t("communications.customEmpty"), description: t("communications.customEmptyDesc"), variant: "destructive" });
      return;
    }
    setCampaignBusy(true);
    try {
      const f = campaignForm.filters;
      const filtersActive = f.customerOnly || f.categories.length > 0 || f.requireEmail || f.requirePhone;
      const payload = {
        editionId: currentEditionId, name: campaignForm.name.trim(), segmentRule: campaignForm.segmentRule.trim() || "özel liste",
        phase: campaignForm.phase, audienceMode: campaignForm.audienceMode, customRecipients: campaignForm.customRecipients,
        channels: campaignForm.channels.join(","),
        audienceJson: filtersActive ? JSON.stringify(f) : null,
        templateId: campaignForm.templateId || null, providerId: campaignForm.providerId || null, formId: campaignForm.formId || null,
        subject: campaignForm.subject || null, isSegmentFixed: campaignForm.isSegmentFixed,
      };
      if (campaignEdit) await apiSend(`/api/campaigns/${campaignEdit.id}`, "PUT", payload);
      else await apiSend("/api/campaigns", "POST", payload);
      toast({ title: campaignEdit ? t("communications.updated") : t("communications.created"), description: t("communications.savedDesc", { name: campaignForm.name, phase: tLabel(CAMPAIGN_PHASE, campaignForm.phase) }) });
      setCampaignOpen(false);
      reload(); bump();
    } catch (e) {
      toast({ title: t("communications.saveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setCampaignBusy(false); }
  };

  // gönderim — GERÇEK çok kanallı dağıtım (e-posta: sağlayıcı/kota; SMS/WA: kanal çekirdeği)
  const [sendBusyId, setSendBusyId] = useState<string | null>(null);
  const sendCampaign = async (c: CampaignRow) => {
    setSendBusyId(c.id);
    try {
      const rep = await apiSend<SendReportLite>("/api/campaigns/send", "POST", { campaignId: c.id, mode: "LIVE" });
      const detail = Object.entries(rep.channels ?? {})
        .filter(([, v]) => (v?.attempted ?? 0) > 0)
        .map(([k, v]) => `${t(`commsCrm.ch_${k}`)}: ${v?.sent}/${v?.attempted}`)
        .join(" · ");
      toast({
        title: rep.totalSent ? t("commsCrm.camp.sentLiveTitle") : t("commsCrm.camp.sendFailed"),
        description: detail || t("commsCrm.camp.sentNoChannel"),
        variant: rep.totalSent ? "default" : "destructive",
      });
      reload(); bump();
    } catch (e) {
      toast({ title: t("commsCrm.camp.sendFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setSendBusyId(null); }
  };

  // test gönderimi — yalnız test alıcısına (tek e-posta / tek telefon)
  const [testOpen, setTestOpen] = useState(false);
  const [testCampaign, setTestCampaign] = useState<CampaignRow | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const sendTest = async () => {
    if (!testCampaign) return;
    setTestBusy(true);
    try {
      const rep = await apiSend<SendReportLite>("/api/campaigns/send", "POST", {
        campaignId: testCampaign.id, mode: "TEST",
        testEmail: testEmail.trim() || undefined, testPhone: testPhone.trim() || undefined,
      });
      toast({
        title: rep.totalSent ? t("commsCrm.camp.testOkTitle") : t("commsCrm.camp.testFailTitle"),
        description: Object.entries(rep.channels ?? {}).filter(([, v]) => (v?.attempted ?? 0) > 0).map(([k, v]) => `${t(`commsCrm.ch_${k}`)}: ${v?.sent}/${v?.attempted}`).join(" · ") || t("commsCrm.camp.sentNoChannel"),
        variant: rep.totalSent ? "default" : "destructive",
      });
      setTestOpen(false);
      reload(); bump();
    } catch (e) {
      toast({ title: t("commsCrm.camp.testFailTitle"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setTestBusy(false); }
  };

  // ── şablon formu ──
  const emptyTemplate = { name: "", subject: "", category: "INFORMATION", phase: "PRE_EVENT", htmlBody: "" };
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateEdit, setTemplateEdit] = useState<TemplateRow | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateRow | null>(null);

  const openTemplateNew = () => { setTemplateEdit(null); setTemplateForm(emptyTemplate); setTemplateOpen(true); };
  const openTemplateEdit = (t: TemplateRow) => {
    setTemplateEdit(t);
    setTemplateForm({ name: t.name, subject: t.subject, category: t.category ?? "INFORMATION", phase: t.phase ?? "PRE_EVENT", htmlBody: t.htmlBody ?? "" });
    setTemplateOpen(true);
  };

  const saveTemplate = async () => {
    if (!currentEditionId) return;
    if (!templateForm.name.trim() || !templateForm.subject.trim()) {
      toast({ title: t("communications.tplNameRequired"), variant: "destructive" }); return;
    }
    setTemplateBusy(true);
    try {
      const payload = { editionId: currentEditionId, name: templateForm.name.trim(), subject: templateForm.subject.trim(), category: templateForm.category, phase: templateForm.phase, htmlBody: templateForm.htmlBody };
      if (templateEdit) await apiSend(`/api/email-templates/${templateEdit.id}`, "PUT", payload);
      else await apiSend("/api/email-templates", "POST", payload);
      toast({ title: templateEdit ? t("communications.tplUpdated") : t("communications.tplCreated"), description: t("communications.tplSavedDesc", { name: templateForm.name, category: catLabel(templateForm.category) }) });
      setTemplateOpen(false);
      reloadTemplates(); bump();
    } catch (e) {
      toast({ title: t("communications.tplSaveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setTemplateBusy(false); }
  };

  // ── sağlayıcı formu ──
  const emptyProvider = { name: "", kind: "SMTP", host: "", port: "587", username: "", password: "", fromEmail: "", fromName: "", replyTo: "", dailyLimit: "1000", isDefault: false };
  const [providerOpen, setProviderOpen] = useState(false);
  const [providerEdit, setProviderEdit] = useState<ProviderRow | null>(null);
  const [providerForm, setProviderForm] = useState(emptyProvider);
  const [providerBusy, setProviderBusy] = useState(false);
  const [testBusyId, setTestBusyId] = useState<string | null>(null);

  const openProviderNew = () => { setProviderEdit(null); setProviderForm(emptyProvider); setProviderOpen(true); };
  const openProviderEdit = (p: ProviderRow) => {
    setProviderEdit(p);
    setProviderForm({
      name: p.name, kind: p.kind ?? "SMTP", host: p.host ?? "", port: p.port ? String(p.port) : "",
      username: p.username ?? "", password: "", fromEmail: p.fromEmail ?? "", fromName: p.fromName ?? "",
      replyTo: p.replyTo ?? "", dailyLimit: p.dailyLimit ? String(p.dailyLimit) : "", isDefault: p.isDefault,
    });
    setProviderOpen(true);
  };

  const saveProvider = async () => {
    if (!tenant) return;
    if (!providerForm.name.trim() || !providerForm.fromEmail.trim()) {
      toast({ title: t("communications.provNameRequired"), variant: "destructive" }); return;
    }
    setProviderBusy(true);
    try {
      const payload: Record<string, unknown> = {
        tenantId: tenant.id, name: providerForm.name.trim(), kind: providerForm.kind, host: providerForm.host || null,
        port: providerForm.port ? Number(providerForm.port) : null, username: providerForm.username || null,
        fromEmail: providerForm.fromEmail.trim(), fromName: providerForm.fromName || null, replyTo: providerForm.replyTo || null,
        dailyLimit: providerForm.dailyLimit ? Number(providerForm.dailyLimit) : null, isDefault: providerForm.isDefault,
      };
      if (providerForm.password) payload.password = providerForm.password; // boşsa mevcut şifre korunur
      if (providerEdit) await apiSend(`/api/mail-providers/${providerEdit.id}`, "PUT", payload);
      else await apiSend("/api/mail-providers", "POST", payload);
      toast({ title: providerEdit ? t("communications.provUpdated") : t("communications.provCreated"), description: t("communications.provSavedDesc", { name: providerForm.name, kind: tLabel(MAIL_PROVIDER_KIND, providerForm.kind) }) });
      setProviderOpen(false);
      reloadProviders(); bump();
    } catch (e) {
      toast({ title: t("communications.provSaveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setProviderBusy(false); }
  };

  // test gönderimi — kontrol listesi döner (sandbox: gönderim simülasyonu)
  const testProvider = async (p: ProviderRow) => {
    setTestBusyId(p.id);
    try {
      const res = await apiSend<{ ok: boolean; checks: { label: string; ok: boolean; note: string }[]; to: string; durationMs: number }>("/api/mail/test", "POST", { providerId: p.id });
      const passed = res.checks.filter((c) => c.ok).length;
      const failed = res.checks.filter((c) => !c.ok).map((c) => c.label);
      toast({
        title: res.ok ? t("communications.testOk", { passed, total: res.checks.length }) : t("communications.testPartial", { passed, total: res.checks.length }),
        description: t("communications.testChecks", { checks: res.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.label}: ${c.note}`).join(" · ") }) + (failed.length ? t("communications.testMissing", { list: failed.join(", ") }) : ""),
        variant: res.ok ? "default" : "destructive",
      });
      reloadProviders(); bump();
    } catch (e) {
      toast({ title: t("communications.testFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setTestBusyId(null); }
  };

  // Faz E: sabit map'leri tLabel köprüsüyle çevir + kategori/gölge-yardımcıları (t gölgelemesine karşı)
  const phasePillLabel = (key: string): string => (key === "ALL" ? t("communications.allPhases") : tLabel(CAMPAIGN_PHASE, key));
  const catLabel = (c: string): string =>
    c === "INVITATION" ? t("communications.catInvitation")
    : c === "CONFIRMATION" ? t("communications.catConfirmation")
    : c === "PAYMENT_REMINDER" ? t("communications.catPaymentReminder")
    : c === "QUIZ" ? t("communications.catQuiz")
    : c === "THANK_YOU" ? t("communications.catThankYou")
    : c === "CUSTOM" ? t("communications.catCustom")
    : t("communications.catInformation");
  const previewAria = (name: string) => t("communications.previewAria", { name });
  const editAria = (name: string) => t("communications.editAria", { name });
  const usageLabel = (n: number) => t("communications.usageCount", { count: n });
  const subjectLine = (s: string) => t("communications.subjectLine", { subject: s });
  const tplPreviewTitle = t("communications.tplPreviewTitle");
  const rowEditTitle = t("communications.edit");
  const useInCampaignTitle = t("communications.useInCampaignTitle");
  const useInCampaignLabel = t("communications.useInCampaign");
  const campaignStatusMap = Object.fromEntries(Object.entries(CAMPAIGN_STATUS).map(([k]) => [k, tLabel(CAMPAIGN_STATUS, k)]));
  const providerStatusMap = Object.fromEntries(Object.entries(PROVIDER_STATUS).map(([k]) => [k, tLabel(PROVIDER_STATUS, k)]));

  return (
    <div className="space-y-5">
      <PageHeader title={t("communications.title")} desc={t("communications.desc")}>
        <Button size="sm" variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900" onClick={() => setInstantOpen(true)} disabled={!currentEditionId} title={currentEditionId ? undefined : t("commsCrm.customer.needEdition")}>
          <Icons.Zap className="size-3.5" /> {t("commsCrm.instant.btn")}
        </Button>
        <Button size="sm" onClick={() => openCampaignNew()}>
          <Icons.Megaphone className="size-3.5" /> {t("communications.newCampaign")}
        </Button>
      </PageHeader>

      {/* 1 — aşama filtre şeridi */}
      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1.5 shadow-sm">
        {PHASE_PILLS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPhaseFilter(p.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${phaseFilter === p.key ? "bg-teal-600 text-white shadow-sm" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
          >
            {phasePillLabel(p.key)}
          </button>
        ))}
        <span className="ms-auto self-center px-3 text-xs text-muted-foreground">{t("communications.count", { count: visibleCampaigns.length })}</span>
      </div>

      {/* 1b — aşama hiyerarşisi özeti: her aşamada kampanya/gönderim sayısı */}
      <div className="grid gap-2 sm:grid-cols-3">
        {["PRE_EVENT", "DURING_EVENT", "POST_EVENT"].map((ph) => {
          const list = (campaigns ?? []).filter((c) => c.phase === ph);
          const sent = list.filter((c) => c.status === "SENT").length;
          return (
            <button
              key={ph}
              type="button"
              onClick={() => setPhaseFilter(ph)}
              className={`flex items-center gap-2 rounded-xl border p-2.5 text-start transition ${phaseFilter === ph ? "border-teal-300 bg-teal-50/50" : "bg-card hover:bg-muted/40"}`}
            >
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", ph === "PRE_EVENT" ? "bg-teal-100 text-teal-700" : ph === "DURING_EVENT" ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700")}>
                {ph === "PRE_EVENT" ? <Icons.CalendarClock className="size-4" /> : ph === "DURING_EVENT" ? <Icons.RadioTower className="size-4" /> : <Icons.MailCheck className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{tLabel(CAMPAIGN_PHASE, ph)}</span>
                <span className="block text-[10px] text-muted-foreground">{t("commsCrm.camp.phaseCount", { total: list.length, sent })}</span>
              </span>
              <Icons.ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          );
        })}
      </div>

      {/* 1c — MÜŞTERİ DATASI: katılımcılardan üretilen iletişim havuzu + tekil/toplu gönderim */}
      <CustomerDataCard onContactsChanged={() => bump()} />

      {/* 2 — kampanya listesi */}
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : visibleCampaigns.length === 0 ? (
        <EmptyState
          title={(campaigns ?? []).length === 0 ? t("communications.emptyAll") : t("communications.emptyPhase")}
          desc={(campaigns ?? []).length === 0 ? t("communications.emptyAllDesc") : t("communications.emptyPhaseDesc")}
          action={(campaigns ?? []).length === 0 ? <Button size="sm" variant="outline" onClick={() => openCampaignNew()}>{t("communications.createCampaign")}</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {visibleCampaigns.map((c, i) => (
            <div key={c.id} className="animate-in fade-in slide-in-from-bottom-1 rounded-xl border bg-card p-4 shadow-sm transition hover:shadow-md motion-reduce:animate-none" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex flex-wrap items-center gap-2">
                <Icons.Megaphone className="size-4 text-teal-600" />
                <p className="font-semibold">{c.name}</p>
                <StatusBadge map={campaignStatusMap} value={c.status} />
                <Chip tone={PHASE_TONE[c.phase] ?? "neutral"}>{tLabel(CAMPAIGN_PHASE, c.phase)}</Chip>
                <Chip>{tLabel(AUDIENCE_MODE, c.audienceMode)}</Chip>
                {/* kanal çipleri — çok kanallı gönderim kapsamı */}
                {((c.channels ?? c.channel ?? "EMAIL").split(/[;,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)).map((chKey) => {
                  const meta = BROADCAST_CHANNEL_LIST.find((x) => x.key === chKey);
                  if (!meta) return null;
                  const IconCmp = meta.icon;
                  return (
                    <Chip key={chKey} tone="neutral">
                      <span className="inline-flex items-center gap-1"><IconCmp className={cn("size-3", meta.tone)} aria-hidden /> {t(`commsCrm.ch_${chKey}`)}</span>
                    </Chip>
                  );
                })}
                {c.audienceJson && <Chip tone="teal">{t("commsCrm.camp.filteredAudience")}</Chip>}
                <Chip tone={c.isSegmentFixed ? "teal" : "amber"}>{c.isSegmentFixed ? t("communications.fixedSegment") : t("communications.liveList")}</Chip>
                <span className="ml-auto text-xs text-muted-foreground">{c.sentAt ? fmtDateTime(c.sentAt) : t("communications.notSent")}</span>
                <div className="flex items-center gap-1">
                  {["DRAFT", "TESTED"].includes(c.status) && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" disabled={sendBusyId === c.id} onClick={() => { setTestCampaign(c); setTestEmail(""); setTestPhone(""); }} title={t("commsCrm.camp.testBtnTitle")}>
                        {sendBusyId === c.id ? <Icons.Loader2 className="size-3 animate-spin" /> : <Icons.FlaskConical className="size-3" />} {t("commsCrm.camp.testBtn")}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 border-teal-300 bg-teal-50 px-2 text-xs text-teal-800 hover:bg-teal-100 hover:text-teal-900" disabled={sendBusyId === c.id} onClick={() => void sendCampaign(c)} title={t("communications.sendBtnTitle")}>
                        {sendBusyId === c.id ? <Icons.Loader2 className="size-3 animate-spin" /> : <Icons.Send className="size-3" />} {t("communications.sendBtn")}
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openCampaignEdit(c)}>
                    <Icons.Pencil className="size-3" /> {t("communications.edit")}
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("communications.segmentLine", { segment: c.segmentRule, target: c.audienceCount })}{c.customRecipients ? t("communications.segmentCustom", { count: c.customRecipients.split(/[\n,;]+/).filter((s) => s.trim()).length }) : ""}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                <span>{t("communications.templateLine", { name: c.templateId ? templateName(c.templateId) ?? "—" : "—" })}</span>
                <span>{t("communications.providerLine", { name: c.providerId ? providerName(c.providerId) ?? "—" : "—" })}</span>
                {c.formId && <span>{t("communications.quizLinked")}</span>}
              </p>
              {c.status === "SENT" && (
                <div className="mt-3 grid grid-cols-5 gap-2 text-center text-xs">
                  {[[t("communications.mSent"), c.sentCount], [t("communications.mDelivered"), c.deliveredCount], [t("communications.mOpen"), c.openCount], [t("communications.mClick"), c.clickCount], [t("communications.mFailed"), c.failCount]].map(([lbl, v]) => (
                    <div key={lbl as string} className="rounded-lg bg-muted p-2">
                      <p className="text-base font-semibold tabular-nums">{v as number}</p>
                      <p className="text-muted-foreground">{lbl as string}</p>
                    </div>
                  ))}
                </div>
              )}
              {(() => {
                const rep = parseSendReport(c.lastSendReport);
                if (!rep) return null;
                return (
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Icons.ReceiptText className="size-3" aria-hidden />
                    <span>{t("commsCrm.camp.lastReport", { mode: rep.mode === "TEST" ? t("commsCrm.camp.testBtn") : t("commsCrm.camp.liveSend") })}</span>
                    {Object.entries(rep.channels ?? {}).filter(([, v]) => (v?.attempted ?? 0) > 0).map(([k, v]) => (
                      <span key={k} className="rounded-full bg-muted px-1.5 py-0.5 tabular-nums">{t(`commsCrm.ch_${k}`)}: {v?.sent}/{v?.attempted}{v?.error ? " ⚠" : ""}</span>
                    ))}
                  </p>
                );
                  })()}
              {c.status === "TESTED" && <p className="mt-2 text-xs text-amber-700">{t("communications.testedNote", { name: c.name.split(" ")[0] })}</p>}
            </div>
          ))}
        </div>
      )}

      {/* 3 — Şablonlar */}
      <SectionCard
        title={t("communications.templates")}
        desc={t("communications.templatesDesc")}
        action={<Button size="sm" variant="outline" onClick={openTemplateNew}><Icons.FilePlus2 className="size-3.5" /> {t("communications.newTemplate")}</Button>}
      >
        {(templates ?? []).length === 0 ? (
          <EmptyState title={t("communications.noTemplates")} desc={t("communications.noTemplatesDesc")} />
        ) : (
          <div className="maven-scroll max-h-96 space-y-1.5 overflow-y-auto">
            {(templates ?? []).map((t, i) => (
              <div key={t.id} className="animate-in fade-in slide-in-from-left-1 rounded-lg border bg-card px-3 py-2.5 transition hover:border-teal-300 hover:bg-teal-50/30 motion-reduce:animate-none" style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex flex-wrap items-center gap-2">
                  <Icons.FileText className="size-3.5 shrink-0 text-teal-600" />
                  <span className="text-xs font-semibold">{t.name}</span>
                  <Chip tone="teal">{catLabel(t.category)}</Chip>
                  <Chip tone={PHASE_TONE[t.phase] ?? "neutral"}>{tLabel(CAMPAIGN_PHASE, t.phase)}</Chip>
                  <Chip>{usageLabel(t.usageCount)}</Chip>
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => setPreviewTemplate(t)} aria-label={previewAria(t.name)} title={tplPreviewTitle}>
                      <Icons.Eye className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => openTemplateEdit(t)} aria-label={editAria(t.name)} title={rowEditTitle}>
                      <Icons.Pencil className="size-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => openCampaignNew({ templateId: t.id, name: t.name + " — Kampanya", subject: t.subject })} title={useInCampaignTitle}>
                      <Icons.Link2 className="size-3" /> {useInCampaignLabel}
                    </Button>
                  </div>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{subjectLine(t.subject)}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 4 — Mail Sağlayıcıları */}
      <SectionCard
        title={t("communications.providers")}
        desc={t("communications.providersDesc")}
        action={<Button size="sm" variant="outline" onClick={openProviderNew}><Icons.PlusCircle className="size-3.5" /> {t("communications.newProvider")}</Button>}
      >
        {(providers ?? []).length === 0 ? (
          <EmptyState title={t("communications.noProviders")} desc={t("communications.noProvidersDesc")} />
        ) : (
          <div className="maven-scroll max-h-96 space-y-1.5 overflow-y-auto">
            {(providers ?? []).map((p, i) => (
              <div key={p.id} className="animate-in fade-in slide-in-from-left-1 rounded-lg border bg-card px-3 py-2.5 transition hover:border-teal-300 hover:bg-teal-50/30 motion-reduce:animate-none" style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex flex-wrap items-center gap-2">
                  <Icons.Server className="size-3.5 shrink-0 text-teal-600" />
                  <span className="text-xs font-semibold">{p.name}</span>
                  {p.isDefault && <Icons.Star className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label={t("communications.defaultStar")} />}
                  <Chip tone="teal">{tLabel(MAIL_PROVIDER_KIND, p.kind)}</Chip>
                  <StatusBadge map={providerStatusMap} value={p.status} />
                  {p.lastTestStatus && (
                    <Chip tone={p.lastTestStatus === "OK" ? "emerald" : "rose"}>{t("communications.lastTest", { result: p.lastTestStatus === "OK" ? t("communications.testPass") : t("communications.testFail") })}</Chip>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={testBusyId === p.id} onClick={() => testProvider(p)} title="POST /api/mail/test — kontrol listesi döner">
                      {testBusyId === p.id ? <Icons.Loader2 className="size-3 animate-spin" /> : <Icons.SendHorizontal className="size-3" />} {t("communications.testBtn")}
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => openProviderEdit(p)} aria-label={editAria(p.name)} title={t("communications.edit")}>
                      <Icons.Pencil className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                  <span>from: {p.fromName ? `${p.fromName} <${p.fromEmail}>` : p.fromEmail}</span>
                  <span>{t("communications.limitLine", { limit: p.dailyLimit ?? t("communications.unlimited") })}</span>
                  {p.kind === "SMTP" && p.host && <span>host: {p.host}{p.port ? `:${p.port}` : ""}</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 5 — Kampanya oluşturma/düzenleme dialogu */}
      <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg maven-scroll">
          <DialogHeader>
            <DialogTitle>{campaignEdit ? t("communications.editCampaign") : t("communications.newCampaign")}</DialogTitle>
            <DialogDescription>{t("communications.campaignDlgDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="campaign-name-input">{t("communications.fName")}</Label>
              <Input
                id="campaign-name-input"
                value={campaignForm.name}
                onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                placeholder={t("communications.fNamePlaceholder")}
                className="h-8 text-xs"
                aria-required="true"
                aria-invalid={campaignInvalid && !campaignForm.name.trim() ? true : undefined}
                aria-describedby={campaignInvalid && !campaignForm.name.trim() ? "campaign-name-error" : undefined}
              />
              {campaignInvalid && !campaignForm.name.trim() && (
                <p id="campaign-name-error" role="alert" className="text-[11px] font-medium text-rose-600">{t("communications.nameRequired")}</p>
              )}
              {campaignInvalid && campaignForm.name.trim() && campaignForm.audienceMode !== "SEGMENT" && (
                <p role="alert" className="text-[11px] font-medium text-rose-600">{t("communications.customEmpty")}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fPhase")}</Label>
                <Select value={campaignForm.phase} onValueChange={(v) => setCampaignForm({ ...campaignForm, phase: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CAMPAIGN_PHASE).map(([k, v]) => <SelectItem key={k} value={k}>{tLabel(CAMPAIGN_PHASE, k)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fAudience")}</Label>
                <Select value={campaignForm.audienceMode} onValueChange={(v) => setCampaignForm({ ...campaignForm, audienceMode: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(AUDIENCE_MODE).map(([k, v]) => <SelectItem key={k} value={k}>{tLabel(AUDIENCE_MODE, k)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("communications.fSegment")}</Label>
              <Input value={campaignForm.segmentRule} onChange={(e) => setCampaignForm({ ...campaignForm, segmentRule: e.target.value })} placeholder={t("communications.fSegmentPlaceholder")} className="h-8 text-xs" disabled={campaignForm.audienceMode === "CUSTOM"} />
            </div>
            {campaignForm.audienceMode !== "SEGMENT" && (
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fCustom")}</Label>
                <Textarea value={campaignForm.customRecipients} onChange={(e) => setCampaignForm({ ...campaignForm, customRecipients: e.target.value })}
                  rows={3} className="text-xs" placeholder={t("communications.fCustomPlaceholder")} />
                <p className="text-[10px] text-muted-foreground">{t("communications.recipientCount", { count: campaignForm.customRecipients.split(/[\n,;]+/).filter((s) => s.trim()).length })}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fTemplate")}</Label>
                <Select value={campaignForm.templateId || "NONE"} onValueChange={(v) => setCampaignForm({ ...campaignForm, templateId: v === "NONE" ? "" : v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">{t("communications.noTemplate")}</SelectItem>
                    {(templates ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fProvider")}</Label>
                <Select value={campaignForm.providerId || "NONE"} onValueChange={(v) => setCampaignForm({ ...campaignForm, providerId: v === "NONE" ? "" : v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">{t("communications.noProvider")}</SelectItem>
                    {(providers ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.isDefault ? " ★" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fForm")}</Label>
                <Select value={campaignForm.formId || "NONE"} onValueChange={(v) => setCampaignForm({ ...campaignForm, formId: v === "NONE" ? "" : v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">{t("communications.noForm")}</SelectItem>
                    {(forms ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fSubject")}</Label>
                <Input value={campaignForm.subject} onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })} className="h-8 text-xs" placeholder="{{series}} davetiniz" />
              </div>
            </div>
            <div className="space-y-1.5 rounded-lg border p-2.5">
              <Label className="text-xs">{t("commsCrm.camp.channelsLabel")}</Label>
              <p className="text-[10px] text-muted-foreground">{t("commsCrm.camp.channelsHint")}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {BROADCAST_CHANNEL_LIST.map((ch) => {
                  const active = campaignForm.channels.includes(ch.key);
                  return (
                    <label key={ch.key} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs font-medium transition", active ? "border-teal-400 bg-teal-50/60 dark:bg-teal-900/20" : "bg-muted/20 hover:bg-muted/40")}>
                      <Checkbox checked={active} onCheckedChange={(v) => setCampaignForm((s) => ({ ...s, channels: v ? [...s.channels, ch.key] : s.channels.filter((x) => x !== ch.key) }))} aria-label={t(`commsCrm.ch_${ch.key}`)} />
                      <ch.icon className={cn("size-3.5", ch.tone)} aria-hidden /> {t(`commsCrm.ch_${ch.key}`)}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2 rounded-lg border p-2.5">
              <p className="text-xs font-semibold">{t("commsCrm.camp.audFiltersTitle")}</p>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className="text-xs">{t("commsCrm.camp.audCustomerOnly")}</Label>
                  <p className="text-[10px] text-muted-foreground">{t("commsCrm.camp.audCustomerOnlyHint")}</p>
                </div>
                <Switch checked={campaignForm.filters.customerOnly} onCheckedChange={(v) => setCampaignForm((s) => ({ ...s, filters: { ...s.filters, customerOnly: v } }))} aria-label={t("commsCrm.camp.audCustomerOnly")} />
              </div>
              {(categories ?? []).length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("commsCrm.camp.audCategories")}</Label>
                  <div className="grid max-h-28 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2 maven-scroll">
                    {(categories ?? []).map((cat) => (
                      <label key={cat.id} className="flex cursor-pointer items-center gap-2 text-xs">
                        <Checkbox
                          checked={campaignForm.filters.categories.includes(cat.id)}
                          onCheckedChange={(v) => setCampaignForm((s) => ({ ...s, filters: { ...s.filters, categories: v ? [...s.filters.categories, cat.id] : s.filters.categories.filter((x) => x !== cat.id) } }))}
                          aria-label={cat.name}
                        />
                        <span className="truncate">{cat.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-2.5 py-1.5">
                  <Label className="text-xs">{t("commsCrm.camp.audRequireEmail")}</Label>
                  <Switch checked={campaignForm.filters.requireEmail} onCheckedChange={(v) => setCampaignForm((s) => ({ ...s, filters: { ...s.filters, requireEmail: v } }))} aria-label={t("commsCrm.camp.audRequireEmail")} />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-2.5 py-1.5">
                  <Label className="text-xs">{t("commsCrm.camp.audRequirePhone")}</Label>
                  <Switch checked={campaignForm.filters.requirePhone} onCheckedChange={(v) => setCampaignForm((s) => ({ ...s, filters: { ...s.filters, requirePhone: v } }))} aria-label={t("commsCrm.camp.audRequirePhone")} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
              <span className="text-xs font-medium">{t("communications.fFixedSegment")}</span>
              <Switch checked={campaignForm.isSegmentFixed} onCheckedChange={(v) => setCampaignForm({ ...campaignForm, isSegmentFixed: v })} aria-label={t("communications.fFixedSegment")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampaignOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={saveCampaign}
              disabled={campaignBusy || campaignInvalid}
              aria-disabled={campaignBusy || campaignInvalid}
            >
              {campaignBusy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Save className="size-3.5" />} {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6 — Şablon önizleme dialogu (korumalı mock e-posta çerçevesi) */}
      <Dialog open={previewTemplate !== null} onOpenChange={(o) => { if (!o) setPreviewTemplate(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("communications.previewDlgTitle", { name: previewTemplate?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("communications.previewDlgDesc")}</DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <div className="overflow-hidden rounded-lg border">
              <div className="flex items-center gap-2 bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                <Icons.Mail className="size-3.5 shrink-0" />
                <span className="truncate">{t("communications.fromLine", { from: defaultProvider ? `${defaultProvider.fromName ? defaultProvider.fromName + " " : ""}<${defaultProvider.fromEmail}>` : t("communications.noDefaultProvider") })}</span>
                <Chip tone={PHASE_TONE[previewTemplate.phase] ?? "neutral"}>{tLabel(CAMPAIGN_PHASE, previewTemplate.phase)}</Chip>
              </div>
              <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold">{previewTemplate.subject}</div>
              <div className="maven-scroll max-h-80 overflow-y-auto bg-white p-4 text-sm text-slate-900" dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(previewTemplate.htmlBody) }} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>{t("common.close")}</Button>
            {previewTemplate && (
              <Button onClick={() => { const t = previewTemplate; setPreviewTemplate(null); openCampaignNew({ templateId: t.id, name: t.name + " — Kampanya", subject: t.subject }); }}>
                <Icons.Link2 className="size-3.5" /> {useInCampaignLabel}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7 — Şablon oluşturma/düzenleme dialogu */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg maven-scroll">
          <DialogHeader>
            <DialogTitle>{templateEdit ? t("communications.editTemplate") : t("communications.newTemplateDlg")}</DialogTitle>
            <DialogDescription>{t("communications.templateDlgDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fTplName")}</Label>
                <Input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} className="h-8 text-xs" placeholder={t("communications.fTplNamePlaceholder")} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fSubjectShort")}</Label>
                <Input value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} className="h-8 text-xs" placeholder={t("communications.fSubjectReadyPlaceholder")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fCategory")}</Label>
                <Select value={templateForm.category} onValueChange={(v) => setTemplateForm({ ...templateForm, category: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(EMAIL_TEMPLATE_CATEGORY).map(([k, v]) => <SelectItem key={k} value={k}>{catLabel(k)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fPhase")}</Label>
                <Select value={templateForm.phase} onValueChange={(v) => setTemplateForm({ ...templateForm, phase: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CAMPAIGN_PHASE).map(([k, v]) => <SelectItem key={k} value={k}>{tLabel(CAMPAIGN_PHASE, k)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("communications.fHtml")}</Label>
              <Textarea value={templateForm.htmlBody} onChange={(e) => setTemplateForm({ ...templateForm, htmlBody: e.target.value })}
                rows={8} className="font-mono text-[11px]" placeholder={'<div style="font-family:Arial"><h2>Merhaba {{fullName}}</h2>…</div>'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveTemplate} disabled={templateBusy}>
              {templateBusy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Save className="size-3.5" />} {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 8 — Sağlayıcı oluşturma/düzenleme dialogu */}
      <Dialog open={providerOpen} onOpenChange={setProviderOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg maven-scroll">
          <DialogHeader>
            <DialogTitle>{providerEdit ? t("communications.editProvider") : t("communications.newProviderDlg")}</DialogTitle>
            <DialogDescription>{t("communications.providerDlgDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fProvName")}</Label>
                <Input value={providerForm.name} onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })} className="h-8 text-xs" placeholder={t("communications.fProvNamePlaceholder")} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fKind")}</Label>
                <Select value={providerForm.kind} onValueChange={(v) => setProviderForm({ ...providerForm, kind: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(MAIL_PROVIDER_KIND).map(([k, v]) => <SelectItem key={k} value={k}>{tLabel(MAIL_PROVIDER_KIND, k)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">{t("communications.fHost")}</Label>
                <Input value={providerForm.host} onChange={(e) => setProviderForm({ ...providerForm, host: e.target.value })} className="h-8 text-xs" placeholder="smtp.firma.com" disabled={providerForm.kind !== "SMTP"} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fPort")}</Label>
                <Input type="number" value={providerForm.port} onChange={(e) => setProviderForm({ ...providerForm, port: e.target.value })} className="h-8 text-xs tabular-nums" placeholder="587" disabled={providerForm.kind !== "SMTP"} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fUsername")}</Label>
                <Input value={providerForm.username} onChange={(e) => setProviderForm({ ...providerForm, username: e.target.value })} className="h-8 text-xs" autoComplete="off" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fPassword")}</Label>
                <Input type="password" value={providerForm.password} onChange={(e) => setProviderForm({ ...providerForm, password: e.target.value })} className="h-8 text-xs" autoComplete="new-password" placeholder="••••••" />
                <p className="text-[10px] text-muted-foreground">{t("communications.pwMaskedLine", { keep: providerEdit ? t("communications.pwKeep") : "" })}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fFromEmail")}</Label>
                <Input value={providerForm.fromEmail} onChange={(e) => setProviderForm({ ...providerForm, fromEmail: e.target.value })} className="h-8 text-xs" placeholder="etkinlik@firma.com" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fFromName")}</Label>
                <Input value={providerForm.fromName} onChange={(e) => setProviderForm({ ...providerForm, fromName: e.target.value })} className="h-8 text-xs" placeholder={t("communications.fFromNamePlaceholder")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fReplyTo")}</Label>
                <Input value={providerForm.replyTo} onChange={(e) => setProviderForm({ ...providerForm, replyTo: e.target.value })} className="h-8 text-xs" placeholder="destek@firma.com" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("communications.fDailyLimit")}</Label>
                <Input type="number" value={providerForm.dailyLimit} onChange={(e) => setProviderForm({ ...providerForm, dailyLimit: e.target.value })} className="h-8 text-xs tabular-nums" placeholder="2000" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
              <span className="text-xs font-medium">{t("communications.fDefault")}</span>
              <Switch checked={providerForm.isDefault} onCheckedChange={(v) => setProviderForm({ ...providerForm, isDefault: v })} aria-label={t("communications.fDefault")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProviderOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveProvider} disabled={providerBusy}>
              {providerBusy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Save className="size-3.5" />} {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 9 — ANLIK YAYIN (program değişikliği vb. — tek/toplu, çok kanallı) */}
      <InstantBroadcastDialog open={instantOpen} onOpenChange={setInstantOpen} onSent={() => { reload(); bump(); }} />

      {/* 10 — KAMPANYA TEST GÖNDERİMİ (yalnız test alıcısı) */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("commsCrm.camp.testTitle", { name: testCampaign?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("commsCrm.camp.testDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="camp-test-email">{t("commsCrm.camp.testEmail")}</Label>
              <Input id="camp-test-email" type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="h-8 text-xs" placeholder="test@firma.com" dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="camp-test-phone">{t("commsCrm.camp.testPhone")}</Label>
              <Input id="camp-test-phone" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="h-8 text-xs" placeholder="+90555…" dir="ltr" />
              <p className="text-[10px] text-muted-foreground">{t("commsCrm.camp.testChannelHint")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => void sendTest()} disabled={testBusy || (!testEmail.trim() && !testPhone.trim())} aria-disabled={testBusy || (!testEmail.trim() && !testPhone.trim())}>
              {testBusy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.FlaskConical className="size-3.5" />} {testBusy ? t("commsCrm.camp.testing") : t("commsCrm.camp.testSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── OPERASYON ──────────────────────────────────────────────────────────────

interface TaskRow { id: string; title: string; module: string; status: string; priority: string; dueDate?: string | null; assignee?: { firstName: string; lastName: string } | null; edition?: { name: string } | null }

const KANBAN: { key: string; tone: string }[] = [
  { key: "BACKLOG", tone: "bg-neutral-100" }, { key: "TODO", tone: "bg-sky-50" }, { key: "IN_PROGRESS", tone: "bg-amber-50" },
  { key: "REVIEW", tone: "bg-violet-50" }, { key: "DONE", tone: "bg-emerald-50" }, { key: "BLOCKED", tone: "bg-rose-50" },
];

export function OperationsView() {
  useLang(); // dil değişiminde yeniden render
  const { refreshKey, bump } = useApp();
  // TASK-A F6: görevler imleçli load-more — 200 satırlık sessiz kesme kaldırıldı
  const { data: tasksPaged, error, reload, loading, more: taskMore } = useApi<{ items: TaskRow[]; nextCursor?: string | null }>(
    (cursor?: string) => listEntityPaged<TaskRow>("tasks", { limit: 200 }, cursor),
    [refreshKey],
    { append: true },
  );
  const taskData = useMemo(() => tasksPaged?.items ?? [], [tasksPaged]);
  const generalLabel = t("operations.general"); // items.map içinde t gölgelendiği için yukarıdan

  const move = async (t: TaskRow, status: string) => {
    await apiSend(`/api/tasks/${t.id}`, "PUT", { status, completedAt: status === "DONE" ? new Date().toISOString() : null });
    reload(); bump();
  };

  return (
    <div>
      <PageHeader title={t("operations.title")} desc={t("operations.desc")}>
        <Button variant="ghost" size="sm" onClick={reload}><Icons.RefreshCw className="size-4" /></Button>
      </PageHeader>
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <div className="grid gap-3 overflow-x-auto maven-scroll md:grid-cols-3 xl:grid-cols-6">
          {KANBAN.map((col) => {
            const items = taskData.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className={cn("min-w-52 rounded-xl p-2.5", col.tone)}>
                <p className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
                  {tLabel(TASK_STATUS, col.key)}
                  <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] tabular-nums">{items.length}</span>
                </p>
                <div className="space-y-2">
                  {items.map((t) => (
                    <div key={t.id} className="rounded-lg border bg-card p-2.5 shadow-sm">
                      <p className="text-xs font-medium leading-snug">{t.title}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {t.edition?.name ?? generalLabel} · {t.module}
                        {t.dueDate && <span className={cn("ml-1", new Date(t.dueDate) < new Date() && t.status !== "DONE" && "font-semibold text-rose-600")}>· {fmtDate(t.dueDate)}</span>}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between">
                        <Chip tone={t.priority === "URGENT" ? "rose" : t.priority === "HIGH" ? "amber" : "neutral"}>{tLabel(TASK_PRIORITY, t.priority)}</Chip>
                        <Select value={t.status} onValueChange={(v) => move(t, v)}>
                          <SelectTrigger className="h-6 w-24 text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(TASK_STATUS).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{tLabel(TASK_STATUS, k)}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">{t("operations.empty")}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* TASK-A F6: kesintisiz yükleme */}
      {taskMore?.hasMore && (
        <div className="mt-3 flex items-center justify-center">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={taskMore.loading} onClick={taskMore.next}>
            {taskMore.loading ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.ChevronsDown className="size-3.5" />}
            {t("operations.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── AYARLAR ────────────────────────────────────────────────────────────────

export function SettingsView() {
  useLang(); // dil değişiminde yeniden render
  const { editions, currentEditionId, bump, refreshKey, patchCapability } = useApp();
  const { toast } = useToast();
  const edition = editions.find((e) => e.id === currentEditionId);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: assignments } = useApi<{ id: string; role: string; organization: { name: string } }[]>(() => listEntity("org-assignments", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);

  // Yetenek aç/kapa: satır varsa güncelle, hiç yoksa editionId+key ile OLUŞTUR (upsert akışı).
  // Başarılı olunca store patchCapability ile anında düzeltilir — eskiden switch bağlı değildi.
  const toggleCap = async (key: string, capabilityId: string | undefined, enabled: boolean) => {
    if (!currentEditionId) return;
    const busyKey = capabilityId ?? `new-${key}`;
    setBusy(busyKey);
    try {
      const cap = await apiSend<{ id: string; key: string; enabled: boolean; setupNote?: string | null }>("/api/flows", "POST", { action: "capability.toggle", capabilityId, editionId: currentEditionId, key, enabled });
      patchCapability(currentEditionId, { id: cap.id ?? busyKey.replace("new-", "cap-"), key, enabled, setupNote: cap.setupNote ?? (enabled ? "hazır" : null) });
      toast({ title: enabled ? t("settingsView.capOn") : t("settingsView.capOff"), description: t("settingsView.capToastDesc") });
      bump();
    } catch (e) {
      toast({ title: t("settingsView.capToggleFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setBusy(null); }
  };

  if (!edition) return <EmptyState title={t("settingsView.pickEdition")} />;

  const enabledCount = CAPABILITIES.filter((cap) => edition.capabilities?.find((c) => c.key === cap.key && c.enabled)).length;

  // KULLANICI MİMARİSİ: ayarlar İKİ kapsama ayrılır —
  //  1) ÜST FİRMA (kiracı geneli): firma logosu, slogan, iletişim, arayüz dili (bir kez seçilir)
  //  2) BU ETKİNLİK (edisyon bazlı): etkinlik logosu, kart görselleri, yetenekler, atamalar
  return (
    <div className="space-y-5">
      <PageHeader title={t("settingsView.title")} desc={t("settingsView.desc")} />

      {/* ── GRUP 1 · ÜST FİRMA — tüm etkinliklerde ortak ── */}
      <SettingsGroup
        icon="Building2"
        title={t("settingsView.orgGroupTitle")}
        desc={t("settingsView.orgGroupDesc")}
        scope={<Chip tone="violet"><Icons.Globe2 className="size-3" /> {t("settingsView.orgGroupScope")}</Chip>}
      />
      <TenantIdentityCard />
      <LanguageCard />

      {/* ── GRUP 2 · BU ETKİNLİK — yalnız seçili edisyonda geçerli ── */}
      <SettingsGroup
        icon="CalendarRange"
        title={t("settingsView.editionGroupTitle")}
        desc={t("settingsView.editionGroupDesc")}
        scope={
          <Chip tone="teal">
            <Icons.CalendarDays className="size-3" /> {t("settingsView.editionGroupScope")}
          </Chip>
        }
      />
      <EventIdentityCard />
      <SectionCard
        title={t("settingsView.capabilities")}
        desc={t("settingsView.capabilitiesDesc")}
        action={<Chip tone="teal">{t("settingsView.enabledCount", { count: enabledCount, total: CAPABILITIES.length })}</Chip>}
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((cap) => {
            const state = edition.capabilities?.find((c) => c.key === cap.key);
            const capId = state?.id;
            return (
              <div key={cap.key} className={cn("flex items-start justify-between gap-3 rounded-lg border p-3 transition", !state?.enabled && "opacity-60", state?.enabled && "border-primary/30 bg-primary/[0.04]")}>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {cap.label}
                    {state?.enabled && <Icons.CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" aria-label={t("settingsView.onAria")} />}
                  </p>
                  <p className="text-xs text-muted-foreground">{cap.desc}</p>
                  {state?.setupNote && state.setupNote !== "hazır" && <Chip tone="amber">{state.setupNote}</Chip>}
                </div>
                <Switch
                  checked={Boolean(state?.enabled)}
                  onCheckedChange={(v) => toggleCap(cap.key, capId, v)}
                  disabled={busy === capId || busy === `new-${cap.key}`}
                  aria-label={t("settingsView.capAria", { name: cap.label })}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("settingsView.capNote")}</p>
      </SectionCard>

      <SectionCard title={t("settingsView.assignments")} desc={t("settingsView.assignmentsDesc")}>
        {(assignments ?? []).length === 0 ? <EmptyState title={t("settingsView.noAssignments")} /> : (
          <div className="flex flex-wrap gap-2">
            {(assignments ?? []).map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Icons.Building2 className="size-4 text-violet-500" />
                <span className="font-medium">{a.organization.name}</span>
                <Chip tone="teal">{a.role}</Chip>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── GRUP 3 · GENEL İLETİŞİM: Bildirim Kanalları — WhatsApp & SMS (etkinlik geneli,
          mobil portal ayarlarından BAĞIMSIZ — kullanıcı kararı) ── */}
      <SettingsGroup
        icon="MessagesSquare"
        title={t("settingsView.comms.groupTitle")}
        desc={t("settingsView.comms.groupDesc")}
        scope={<Chip tone="teal"><Icons.MessageCircle className="size-3" /> {t("settingsView.comms.scopeChip")}</Chip>}
      />
      <NotificationChannelsCard editionId={edition.id} />

      {/* ── GRUP 4 · GEÇİCİ: Veritabanı & Migration — SQLite → MySQL/MariaDB taşınma denetimi ── */}
      <SettingsGroup
        icon="DatabaseBackup"
        title={t("settingsView.dbm.groupTitle")}
        desc={t("settingsView.dbm.groupDesc")}
        scope={<Chip tone="amber"><Icons.Wrench className="size-3" /> {t("settingsView.dbm.tempChip")}</Chip>}
      />
      <DatabaseMigrationCard />
    </div>
  );
}

// ─── Ayarlar: kapsam grubu başlığı (kullanıcı mimarisi — üst firma vs etkinlik ayrımı) ──
// Kırık-kenarlı ayırıcı: hangi kartların KİM için olduğunu görsel olarak netleştirir.
function SettingsGroup({ icon, title, desc, scope }: { icon: string; title: string; desc: string; scope: React.ReactNode }) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[icon] ?? Icons.Settings;
  // mobil: dikey yığın (ikon+başlık / açıklama / kapsam çipi) · sm+: tek satır — başlık | çizgili açıklama | çip
  return (
    <div aria-label={title} className="flex flex-col gap-2 rounded-xl border border-dashed border-primary/25 bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <p className="text-sm font-semibold leading-tight">{title}</p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground sm:min-w-0 sm:flex-1 sm:border-l sm:border-border/70 sm:pl-3">{desc}</p>
      <div className="sm:ml-auto">{scope}</div>
    </div>
  );
}

// ─── Ayarlar: Etkinlik Kimliği (kullanıcı mimarisi — üst firmadan AYRI, edisyon bazlı) ──
// Etkinlik logosu + kart başlık görseli + temel bilgiler. PUT /api/editions/{id} YALNIZCA bu
// edisyona yazar; üst firma kartı (TenantIdentityCard) ve dil (LanguageCard) etkilenmez.
const EVENT_COLORS: { key: string; labelKey: string }[] = [
  { key: "teal", labelKey: "settingsView.colorTeal" },
  { key: "amber", labelKey: "settingsView.colorAmber" },
  { key: "violet", labelKey: "settingsView.colorViolet" },
  { key: "rose", labelKey: "settingsView.colorRose" },
  { key: "", labelKey: "settingsView.colorNeutral" },
];

export function EventIdentityCard() {
  useLang(); // dil değişiminde yeniden render
  const { editions, currentEditionId, bootstrap, bump } = useApp();
  const { toast } = useToast();
  const edition = editions.find((e) => e.id === currentEditionId);
  const [busy, setBusy] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "", description: "", city: "", venueName: "", startDate: "", endDate: "", coverColor: "", logoUrl: "", headerImageUrl: "",
  });

  // edisyon değişince formu doldur (async desen — TenantIdentityCard ile aynı, lint uyumlu)
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive || !edition) return;
      setForm({
        name: edition.name ?? "",
        description: edition.description ?? "",
        city: edition.city ?? "",
        venueName: edition.venueName ?? "",
        startDate: edition.startDate ? String(edition.startDate).slice(0, 10) : "",
        endDate: edition.endDate ? String(edition.endDate).slice(0, 10) : "",
        coverColor: edition.coverColor ?? "",
        logoUrl: edition.logoUrl ?? "",
        headerImageUrl: edition.headerImageUrl ?? "",
      });
    });
    return () => { alive = false; };
  }, [edition?.id]);  

  // tarih sözleşmesi — kurulum sihirbazı ve registry validate ile birebir aynı kural
  const dateError = (() => {
    if (!form.startDate) return t("settingsView.eventStartRequired");
    const s = new Date(form.startDate);
    if (Number.isNaN(s.getTime())) return t("settingsView.eventStartInvalid");
    if (form.endDate) {
      const e = new Date(form.endDate);
      if (Number.isNaN(e.getTime())) return t("settingsView.eventEndInvalid");
      if (e < s) return t("settingsView.eventEndBeforeStart");
    }
    return null;
  })();

  const pickImage = (file: File | null, maxKb: number, field: "logoUrl" | "headerImageUrl", tooBigDesc: string) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: t("settingsView.invalidFile"), description: t("settingsView.invalidFileDesc"), variant: "destructive" });
      return;
    }
    if (file.size > maxKb * 1024) {
      toast({ title: t("settingsView.fileTooLarge"), description: tooBigDesc, variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, [field]: String(reader.result ?? "") }));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!edition) return;
    if (dateError) {
      toast({ title: dateError, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiSend(`/api/editions/${edition.id}`, "PUT", {
        name: form.name.trim(),
        description: form.description || null,
        city: form.city || null,
        venueName: form.venueName || null,
        startDate: new Date(form.startDate).toISOString(),
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        coverColor: form.coverColor || null,
        logoUrl: form.logoUrl || null,
        headerImageUrl: form.headerImageUrl || null,
      });
      await bootstrap(); // store tazelenir — üst şerit, etkinlik kartları ve önizleme güncellenir
      bump();
      toast({ title: t("settingsView.eventSaved"), description: t("settingsView.eventSavedDesc") });
    } catch (e) {
      toast({ title: t("settingsView.eventSaveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <SectionCard
      title={t("settingsView.eventIdentity")}
      desc={t("settingsView.eventIdentityDesc")}
      action={<Chip tone="teal">{edition?.slug ?? "—"}</Chip>}
    >
      {/* Canlı önizleme — etkinlik kartının (Etkinlikler görünümü) bandı + logo satırının aynısı */}
      <div className="mb-4">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("settingsView.eventPreviewTitle")}</p>
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="relative h-24 bg-muted sm:h-28">
            {form.headerImageUrl ? (
               
              <img src={form.headerImageUrl} alt={t("settingsView.eventHeaderAlt", { name: edition?.name ?? "" })} className="absolute inset-0 size-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-xs text-muted-foreground/70">{t("settingsView.noHeaderImage")}</div>
            )}
          </div>
          <div className="flex items-center gap-3 p-3">
            {form.logoUrl ? (
               
              <img src={form.logoUrl} alt={t("settingsView.eventLogoAlt", { name: edition?.name ?? "" })} className="size-11 shrink-0 rounded-lg border bg-white object-contain p-0.5" />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-lg border bg-muted/50 font-bold text-muted-foreground">{(form.name || edition?.name || "E").slice(0, 1)}</span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{form.name || edition?.name || "—"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {form.startDate ? fmtDate(form.startDate) : "—"}{form.city ? ` · ${form.city}` : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* medya seçiciler — logo (kare) + başlık görseli (geniş) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-semibold">{t("settingsView.pickEventLogo")}</p>
          <div className="mt-2 flex items-center gap-2.5">
            {form.logoUrl ? (
               
              <img src={form.logoUrl} alt={t("settingsView.eventLogoAlt", { name: edition?.name ?? "" })} className="size-12 shrink-0 rounded-md border bg-white object-contain p-0.5" />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-md border border-dashed bg-background text-muted-foreground"><Icons.Image className="size-4" /></span>
            )}
            <div className="flex flex-col items-start gap-1">
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0] ?? null, 300, "logoUrl", t("settingsView.fileTooLargeDesc"))} />
              <Button size="sm" variant="outline" className="h-7" onClick={() => logoRef.current?.click()}>
                <Icons.ImagePlus className="size-3.5" /> {t("settingsView.pickEventLogo")}
              </Button>
              {form.logoUrl && (
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-rose-600 hover:text-rose-700" onClick={() => setForm((f) => ({ ...f, logoUrl: "" }))}>
                  <Icons.Trash2 className="size-3" /> {t("settingsView.remove")}
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">{t("settingsView.eventLogoHint")}</p>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-semibold">{t("settingsView.pickHeaderImage")}</p>
          <div className="mt-2 flex items-center gap-2.5">
            {form.headerImageUrl ? (
               
              <img src={form.headerImageUrl} alt={t("settingsView.eventHeaderAlt", { name: edition?.name ?? "" })} className="h-12 w-20 shrink-0 rounded-md border object-cover" />
            ) : (
              <span className="grid h-12 w-20 shrink-0 place-items-center rounded-md border border-dashed bg-background text-muted-foreground"><Icons.Images className="size-4" /></span>
            )}
            <div className="flex flex-col items-start gap-1">
              <input ref={headerRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0] ?? null, 600, "headerImageUrl", t("settingsView.headerTooLargeDesc"))} />
              <Button size="sm" variant="outline" className="h-7" onClick={() => headerRef.current?.click()}>
                <Icons.Images className="size-3.5" /> {t("settingsView.pickHeaderImage")}
              </Button>
              {form.headerImageUrl && (
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-rose-600 hover:text-rose-700" onClick={() => setForm((f) => ({ ...f, headerImageUrl: "" }))}>
                  <Icons.Trash2 className="size-3" /> {t("settingsView.remove")}
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">{t("settingsView.headerImageHint")}</p>
        </div>
      </div>

      {/* bilgi alanları — yalnız bu etkinliğe yazar */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ed-name">{t("settingsView.fEventName")}</Label>
          <Input id="ed-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ed-desc">{t("settingsView.fEventDesc")}</Label>
          <Textarea id="ed-desc" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-city">{t("settingsView.fCity")}</Label>
          <Input id="ed-city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-venue">{t("settingsView.fVenue")}</Label>
          <Input id="ed-venue" value={form.venueName} onChange={(e) => setForm((f) => ({ ...f, venueName: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-start">{t("settingsView.fStart")}</Label>
          <Input id="ed-start" type="date" aria-required="true" aria-invalid={dateError ? true : undefined} value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-end">{t("settingsView.fEnd")}</Label>
          <Input id="ed-end" type="date" aria-invalid={dateError ? true : undefined} value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("settingsView.fCoverColor")}</Label>
          <Select value={form.coverColor || "none"} onValueChange={(v) => setForm((f) => ({ ...f, coverColor: v === "none" ? "" : v }))}>
            <SelectTrigger aria-label={t("settingsView.fCoverColor")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {/* DÜZELTME: Radix SelectItem value:"" yasak — nötr "none" ile harmanlanır */}
              {EVENT_COLORS.map((c) => (
                <SelectItem key={c.key || "none"} value={c.key || "none"}>{t(c.labelKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {dateError && (
          <p role="alert" className="sm:col-span-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
            {dateError}
          </p>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={busy || !form.name.trim() || !form.startDate}>
          {busy ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.Check className="size-4" />} {t("settingsView.saveEvent")}
        </Button>
      </div>
    </SectionCard>
  );
}

// ─── Ayarlar: Firma Kimliği (Faz C / R11) ──────────────────────────────────────
// Tenant logo/tagline/about/iletişim alanlarını düzenler — shell logosu ve
// Dış Portal → Firma Vitrini bu alanlardan beslenir. PUT /api/tenants/{id} (guard: self).
export function TenantIdentityCard() {
  useLang(); // dil değişiminde yeniden render
  const { tenant, bootstrap } = useApp();
  const { toast } = useToast();
  const [form, setForm] = useState({
    tagline: "", aboutText: "", contactName: "", contactPhone: "", contactEmail: "", website: "", logoUrl: "",
  });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // store tenant değişince formu doldur (async desen — lint set-state-in-effect uyumlu)
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive || !tenant) return;
      setForm({
        tagline: tenant.tagline ?? "",
        aboutText: tenant.aboutText ?? "",
        contactName: tenant.contactName ?? "",
        contactPhone: tenant.contactPhone ?? "",
        contactEmail: tenant.contactEmail ?? "",
        website: tenant.website ?? "",
        logoUrl: tenant.logoUrl ?? "",
      });
    });
    return () => { alive = false; };
  }, [tenant?.id]);

  const pickLogo = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: t("settingsView.invalidFile"), description: t("settingsView.invalidFileDesc"), variant: "destructive" });
      return;
    }
    if (file.size > 300 * 1024) {
      toast({ title: t("settingsView.fileTooLarge"), description: t("settingsView.fileTooLargeDesc"), variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logoUrl: String(reader.result ?? "") }));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!tenant) return;
    setBusy(true);
    try {
      await apiSend(`/api/tenants/${tenant.id}`, "PUT", {
        tagline: form.tagline || null,
        aboutText: form.aboutText || null,
        contactName: form.contactName || null,
        contactPhone: form.contactPhone || null,
        contactEmail: form.contactEmail || null,
        website: form.website || null,
        logoUrl: form.logoUrl || null,
      });
      await bootstrap();
      toast({ title: t("settingsView.identitySaved"), description: t("settingsView.identitySavedDesc") });
    } catch (e) {
      toast({ title: t("settingsView.saveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title={t("settingsView.identity")}
      desc={t("settingsView.identityDesc")}
      action={<Chip tone="teal">{tenant?.slug ?? "—"}</Chip>}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* logo önizleme + seçici */}
        <div className="flex flex-col items-center gap-2">
          {form.logoUrl ? (
            <img src={form.logoUrl} alt={t("settingsView.logoAlt")} className="size-20 rounded-2xl border object-cover shadow-sm" />
          ) : (
            <div className="grid size-20 place-items-center rounded-2xl border border-dashed bg-muted/40 text-2xl font-bold text-muted-foreground">
              {(tenant?.name ?? "M").slice(0, 1)}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0] ?? null)} />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Icons.ImagePlus className="size-3.5" /> {t("settingsView.pickLogo")}
          </Button>
          {form.logoUrl && (
            <Button size="sm" variant="ghost" className="h-7 text-rose-600 hover:text-rose-700" onClick={() => setForm((f) => ({ ...f, logoUrl: "" }))}>
              <Icons.Trash2 className="size-3.5" /> {t("settingsView.remove")}
            </Button>
          )}
          <p className="max-w-36 text-center text-[10px] text-muted-foreground">{t("settingsView.logoHint")}</p>
        </div>

        {/* alanlar */}
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="t-tagline">{t("settingsView.fTagline")}</Label>
            <Input id="t-tagline" value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} placeholder={t("settingsView.fTaglinePlaceholder")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="t-about">{t("settingsView.fAbout")}</Label>
            <Textarea id="t-about" rows={3} value={form.aboutText} onChange={(e) => setForm((f) => ({ ...f, aboutText: e.target.value }))} placeholder={t("settingsView.fAboutPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("settingsView.fContactName")}</Label>
            <Input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} placeholder={t("settingsView.fContactNamePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("settingsView.fContactPhone")}</Label>
            <Input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} placeholder="+90 212 555 0142" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("settingsView.fContactEmail")}</Label>
            <Input type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} placeholder="info@firma.com" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("settingsView.fWebsite")}</Label>
            <Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://firma.com" />
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.Check className="size-4" />} {t("settingsView.saveIdentity")}
        </Button>
      </div>
    </SectionCard>
  );
}

// ─── Ayarlar: Dil / Language (Faz E — tek-dosyalı i18n) ────────────────────────
export function LanguageCard() {
  const { lang, setLang: setUiLang } = useLang();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const blob = new Blob([exportI18nJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maven-i18n-${lang}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: t("settings.jsonExported") });
  };

  const importJson = async (file: File | null) => {
    if (!file) return;
    try {
      const raw = await file.text();
      const err = importI18nJson(raw);
      if (err) toast({ title: t("settings.jsonImportFailed"), description: err, variant: "destructive" });
      else toast({ title: t("settings.jsonImported") });
    } catch {
      toast({ title: t("settings.jsonImportFailed"), variant: "destructive" });
    }
  };

  return (
    <SectionCard
      title={t("settings.languageTitle")}
      desc={t("settings.languageDesc")}
      action={<Chip tone="teal">{lang === "tr" ? "Türkçe" : "English"}</Chip>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={lang === "tr" ? "default" : "outline"}
          onClick={() => setUiLang("tr")}
          aria-pressed={lang === "tr"}
        >
          Türkçe
        </Button>
        <Button
          variant={lang === "en" ? "default" : "outline"}
          onClick={() => setUiLang("en")}
          aria-pressed={lang === "en"}
        >
          English
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={exportJson}>
            <Icons.Download className="size-4" /> {t("settings.exportJson")}
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => importJson(e.target.files?.[0] ?? null)} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Icons.Upload className="size-4" /> {t("settings.importJson")}
          </Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("settingsView.langNoteA")}<span className="font-mono">maven.lang</span>{t("settingsView.langNoteB")}<span className="font-mono">src/i18n/tr.json</span>.
      </p>
    </SectionCard>
  );
}
