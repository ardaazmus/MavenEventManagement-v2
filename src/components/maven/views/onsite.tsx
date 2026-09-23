"use client";
// Sahada — canlı onsite kontrol (§07/§42): kapı seçimi, arama, tarama, tekrar/ret kuyruğu
// + Sertifikalar (§43) + İletişim + Operasyon + Ayarlar
import { useRef, useState } from "react";
import { listEntity, apiSend, apiGet } from "@/lib/client";
import { useApp } from "@/lib/store";
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
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

// ─── SAHA ───────────────────────────────────────────────────────────────────

interface ScanRow {
  id: string; location: string; doorName?: string | null; action: string; result: string; reason?: string | null; device?: string | null; operator?: string | null; scannedAt: string;
  participation?: { person: { firstName: string; lastName: string } } | null;
}
interface ScanResult {
  result: string; tone?: string; reason?: string | null;
  person?: { id: string; name: string; company?: string | null; title?: string | null };
  registration?: { status: string; category?: string | null; funding: string } | null;
  badge?: { status: string; profile?: string | null } | null;
}

export function OnsiteView() {
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
        title: res.result === "ALLOWED" ? "Giriş izin verildi" : res.result === "RESCAN_WARNING" ? "Tekrar tarama — sarı durum" : "Giriş reddedildi",
        variant: res.result === "DENIED" ? "destructive" : "default",
        description: res.person ? `${res.person.name}${res.reason ? ` — ${res.reason}` : ""}` : res.reason,
      });
      reload(); bump();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Tarama hatası";
      if (msg.includes("bulunamadı")) {
        setLast({ result: "DENIED", tone: "red", reason: msg });
      }
      toast({ title: "Tarama", description: msg, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Sahada — Canlı Kontrol" desc="Kapı masası: kimlik doğrulama, tekrar tarama ayrı sarı durum; tarama geçmişi silinmez" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Benzersiz Gelen (bugün)" value={uniqueArrived} sub="geçerli ilk giriş — oturum girişi sayılmaz" tone="emerald" icon={<Icons.UserCheck className="size-4" />} />
        <KpiCard label="Tekrar Tarama" value={rescans.length} sub="ilk girişin yerine geçmez" tone="amber" icon={<Icons.RotateCcw className="size-4" />} />
        <KpiCard label="Reddedilen" value={denied.length} sub="yetkiliye yönlendirme" tone="rose" icon={<Icons.UserX className="size-4" />} />
        <KpiCard label="Toplam Olay" value={todays.length} sub="son 24 saat" icon={<Icons.Activity className="size-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <SectionCard title="Tarama Masası" desc={`${door} · görevli kapsamı: etkinlik girişi + oturum`} className="lg:col-span-2">
          <div className="flex gap-2">
            {["Kapı A", "Kapı B", "Gala", "VIP Lounge"].map((d) => (
              <button key={d} onClick={() => setDoor(d)} className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition", door === d ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-primary/40")}>
                {d}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input placeholder="QR kodu (örn. QR-0001) veya part_id…" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && scan()} className="font-mono" />
            <Button onClick={() => scan()} disabled={scanning || !code.trim()}>
              <Icons.ScanLine className="size-4" /> {scanning ? "Okutuluyor…" : "Tara"}
            </Button>
          </div>

          {/* sonuç kartı */}
          {last && (
            <div className={cn("mt-3 rounded-lg border-2 p-3",
              last.result === "ALLOWED" ? "border-emerald-300 bg-emerald-50/70" : last.result === "RESCAN_WARNING" ? "border-amber-300 bg-amber-50/70" : "border-rose-300 bg-rose-50/70")}>
              <div className="flex items-center gap-2">
                {last.result === "ALLOWED" ? <Icons.CircleCheck className="size-5 text-emerald-600" /> : last.result === "RESCAN_WARNING" ? <Icons.TriangleAlert className="size-5 text-amber-600" /> : <Icons.Ban className="size-5 text-rose-600" />}
                <p className="text-sm font-bold">{last.result === "ALLOWED" ? "Girişe izin ver" : last.result === "RESCAN_WARNING" ? "Tekrar tarama" : "Yetkiliye yönlendir"}</p>
              </div>
              {last.person && (
                <div className="mt-2 space-y-0.5 text-xs">
                  <p className="font-semibold">{last.person.name} <span className="font-normal text-muted-foreground">{last.person.title ? `· ${last.person.title}` : ""}</span></p>
                  <p className="text-muted-foreground">{last.person.company ?? "—"}</p>
                </div>
              )}
              {last.registration && (
                <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                  <Chip tone="teal">{last.registration.category ?? "kategori yok"}</Chip>
                  <Chip tone={last.registration.status === "CONFIRMED" ? "emerald" : "amber"}>kayıt: {last.registration.status}</Chip>
                  {last.badge && <Chip tone="violet">rozet: {last.badge.profile} {last.badge.status}</Chip>}
                </div>
              )}
              {last.reason && <p className="mt-2 text-xs text-muted-foreground">{last.reason}</p>}
              {last.result === "DENIED" && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setDenyTarget(last.person?.id ?? "")}>
                  Manuel İstisna (gerekçe ile)
                </Button>
              )}
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">Demo: QR-0001 … QR-0024 aktif rozetler; iptal/reddedilen katılımcı kodu yoktur → kırmızı durum.</p>
        </SectionCard>

        <SectionCard title="Canlı Tarama Akışı" desc="olay bazlı — ilk geçerli giriş ve tekrar tarama ayrı satır" className="lg:col-span-3" bodyClass="max-h-[420px] overflow-y-auto maven-scroll">
          {loading ? <Loading rows={6} /> : error ? <ErrorState message={error} onRetry={reload} /> : (scans ?? []).length === 0 ? (
            <EmptyState title="Bu kapı için giriş kaydı yok" desc="Doğru gün ve kapıyı seçtiğinizden emin olun." />
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
                    {s.participation ? `${s.participation.person.firstName} ${s.participation.person.lastName}` : "Bilinmeyen kod"}
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
          <DialogHeader><DialogTitle>Manuel İstisna</DialogTitle><DialogDescription>Gerekçe zorunlu; karar tarama geçmişine DENIED + istisna olarak işlenir.</DialogDescription></DialogHeader>
          <div><Label>Gerekçe</Label><Textarea value={forceReason} onChange={(e) => setForceReason(e.target.value)} placeholder="Örn. rozet basımı sürüyor, kimlik ibraz edildi…" className="mt-1" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDenyTarget(null)}>Vazgeç</Button>
            <Button disabled={!forceReason} onClick={() => scan(forceReason)}>İstisna Uygula</Button>
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
  issues: { id: string; status: string; eligibilityNote?: string | null }[];
}
interface CertIssueRow {
  id: string; status: string; eligibilityNote?: string | null; generatedAt?: string | null; deliveredAt?: string | null;
  participation?: { id: string; person: { firstName: string; lastName: string; company: string | null; title: string | null } } | null;
}
interface CertDraft {
  id: string; name: string;
  widthMm: number; heightMm: number; bleedMm: number; orientation: string;
  fontKey: string; textColor: string; tierNote: string | null;
  backgroundDataUrl: string | null; bodyTemplate: string | null;
}

// gövde şablonu yer tutucuları — tıkla, metnin sonuna eklenir
const CERT_TOKENS = ["{{fullName}}", "{{title}}", "{{company}}", "{{edition}}", "{{tier}}", "{{date}}", "{{serial}}"] as const;
const MAX_BG_BYTES = 600 * 1024;

export function CertificatesView() {
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
    });
  };

  const patchDraft = (patch: Partial<CertDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const generate = async (def: CertDefRow) => {
    setBusy(def.id);
    try {
      const res = await apiSend<{ eligible: number }>("/api/flows", "POST", { action: "certificate.generate", definitionId: def.id });
      toast({ title: "Sertifika üretimi tamamlandı", description: `${res.eligible} uygun belge oluşturuldu. İsim önizlemesi snapshot'tan alınır.` });
      reload(); bump();
    } catch (e) {
      toast({ title: "Üretim başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
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
      });
      toast({ title: "Sertifika tasarımı kaydedildi", description: `${saved.name} · ${saved.widthMm}×${saved.heightMm} mm · ${saved.orientation === "PORTRAIT" ? "dikey" : "yatay"}` });
      reload(); bump();
    } catch (e) {
      toast({ title: "Tasarım kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setSavingDesign(false); }
  };

  const uploadBackground = (file: File) => {
    if (file.size > MAX_BG_BYTES) {
      toast({ title: "Görsel çok büyük", description: `En fazla 600 KB yüklenebilir — seçilen dosya ${(file.size / 1024).toFixed(0)} KB.`, variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      patchDraft({ backgroundDataUrl: String(reader.result) });
      toast({ title: "Arka plan eklendi", description: "Tasarımcıdan gelen görsel en arka layer'a eklenir." });
    };
    reader.readAsDataURL(file);
  };

  // sertifika baskı sayfası — text/html döner, blob URL yeni sekmede (popup engellenirse iframe)
  const openCertSheet = async (participationIds: string[]) => {
    if (!currentEditionId || !selectedDefId) return;
    if (participationIds.length === 0) {
      toast({ title: "Belge seçilmedi", description: "Listeden en az bir katılımcı seçin.", variant: "destructive" });
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
        throw new Error(body.error ?? `Sertifika sayfası üretilemedi (${res.status})`);
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
        toast({ title: "Sertifika sayfası hazır", description: "Açılır pencere engellendi — sayfa yerleşik çerçevede açıldı." });
      }
      // ELIGIBLE → GENERATED geçişi sunucu tarafında otomatik; listeyi tazele
      reloadIssues(); reload(); bump();
    } catch (e) {
      toast({ title: "Sertifika yazdırma başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setPrinting(false); }
  };

  // e-posta ile gönder (simülasyon) — deliveredAt işlenir, toast şablon bilgisini verir
  const mailDeliver = async (issue: CertIssueRow) => {
    if (!issue.participation) return;
    setMailBusyId(issue.id);
    try {
      await apiSend(`/api/certificate-issues/${issue.id}`, "PUT", { status: "DELIVERED", deliveredAt: new Date().toISOString() });
      toast({ title: "Sertifika e-postayla gönderildi (simülasyon)", description: "Şablon: Teşekkür + Sertifika Teslimi — alıcı: " + issue.participation.person.firstName + " " + issue.participation.person.lastName });
      reloadIssues(); reload(); bump();
    } catch (e) {
      toast({ title: "Gönderim başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setMailBusyId(null); }
  };

  // canlı önizleme — örnek veriyle gövde doldurma (print-sheet eşlemesiyle aynı)
  const fillTemplate = (tpl: string): string => {
    const editionName = edition ? edition.name + (edition.editionLabel ? ` — ${edition.editionLabel}` : "") : "Etkinlik";
    return (tpl ?? "")
      .replace(/\{\{fullName\}\}/g, "Ahmet Yılmaz")
      .replace(/\{\{title\}\}/g, "Ar-Ge Müdürü")
      .replace(/\{\{company\}\}/g, "ABC Pharma")
      .replace(/\{\{edition\}\}/g, editionName)
      .replace(/\{\{series\}\}/g, tenant?.name ?? "Maven")
      .replace(/\{\{type\}\}/g, draft?.name ?? "Sertifika")
      .replace(/\{\{tier\}\}/g, draft?.tierNote || "Katılımcı")
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }))
      .replace(/\{\{serial\}\}/g, "PAR-000001")
      .replace(/\n/g, "<br/>");
  };

  const selectedIssuePids = (issues ?? []).filter((i) => issueSel.has(i.id) && i.participation).map((i) => i.participation!.id);

  return (
    <div className="space-y-5">
      <PageHeader title="Sertifikalar" desc="Uygunluk kuralı → uygunluk listesi → üretim → gönderim; 'Üretildi' ile 'Gönderildi' ayrı metrik" />
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (defs ?? []).length === 0 ? (
        <EmptyState title="Henüz sertifika türü oluşturulmadı" desc="Önce uygunluk koşullarını tanımlayın." />
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
                  desc={d.eligibilityRule ?? "kural tanımsız"}
                  className={cn("transition", selected && "ring-2 ring-teal-500")}
                  action={
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant={selected ? "default" : "outline"} onClick={() => selectDef(d)} title="Tasarımcı + belge listesi">
                        <Icons.Palette className="size-3.5" /> Tasarımcı
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => generate(d)} disabled={busy === d.id}>
                        {busy === d.id ? "Üretiliyor…" : "Üret"}
                      </Button>
                    </div>
                  }
                >
                  <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                    <div className="rounded-md bg-emerald-50 p-1.5"><p className="text-base font-bold text-emerald-700 tabular-nums">{cnt("GENERATED") + cnt("DELIVERED")}</p><p className="text-emerald-600/80">uygun</p></div>
                    <div className="rounded-md bg-sky-50 p-1.5"><p className="text-base font-bold text-sky-700 tabular-nums">{cnt("GENERATED")}</p><p className="text-sky-600/80">üretildi</p></div>
                    <div className="rounded-md bg-teal-50 p-1.5"><p className="text-base font-bold text-teal-700 tabular-nums">{cnt("DELIVERED")}</p><p className="text-teal-600/80">gönderildi</p></div>
                    <div className="rounded-md bg-rose-50 p-1.5"><p className="text-base font-bold text-rose-700 tabular-nums">{cnt("NOT_ELIGIBLE") + cnt("REVOKED")}</p><p className="text-rose-600/80">eksik/iptal</p></div>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">İmzacı: {d.signerName ?? "—"} · belgedeki ad: EventProfileSnapshot&apos;tan</p>
                </SectionCard>
              );
            })}
          </div>

          {/* 2 — Tasarımcı + canlı önizleme */}
          {!draft || !selectedDef ? (
            <EmptyState
              title="Tasarımcı için bir sertifika türü seçin"
              desc="Yukarıdaki kartlardan 'Tasarımcı' düğmesine basın — boyut, arka plan, gövde şablonu ve canlı önizleme burada açılır."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none lg:col-span-7">
                <SectionCard title={`Sertifika Tasarımcısı — ${selectedDef.name}`} desc="ölçüler mm · gövde şablonu kişi-özeldir (yer tutuculara tıkla)">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([
                      ["Genişlik (mm)", "widthMm", 100, 500, 5], ["Yükseklik (mm)", "heightMm", 100, 500, 5], ["Baskı payı (mm)", "bleedMm", 0, 15, 1],
                    ] as [string, "widthMm" | "heightMm" | "bleedMm", number, number, number][]).map(([lbl, key, min, max, step]) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">{lbl}</Label>
                        <Input type="number" min={min} max={max} step={step} value={draft[key]} className="h-8 text-xs tabular-nums"
                          onChange={(e) => patchDraft({ [key]: Math.round(Number(e.target.value) * 10) / 10 } as Partial<CertDraft>)} />
                      </div>
                    ))}
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Yön</Label>
                      <Select value={draft.orientation} onValueChange={(v) => patchDraft({ orientation: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LANDSCAPE">Yatay</SelectItem>
                          <SelectItem value="PORTRAIT">Dikey</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Yazı tipi</Label>
                      <Select value={draft.fontKey} onValueChange={(v) => patchDraft({ fontKey: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(BADGE_FONTS).map(([k, f]) => <SelectItem key={k} value={k}>{f.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Metin rengi</Label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={draft.textColor} onChange={(e) => patchDraft({ textColor: e.target.value })} className="h-8 w-10 cursor-pointer rounded border" aria-label="Metin rengi" />
                        <Input value={draft.textColor} onChange={(e) => patchDraft({ textColor: e.target.value })} className="h-8 font-mono text-[11px]" />
                      </div>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Düzey notu (tier)</Label>
                      <Input value={draft.tierNote ?? ""} onChange={(e) => patchDraft({ tierNote: e.target.value })} className="h-8 text-xs" placeholder="Katılımcı düzeyi" />
                    </div>
                  </div>

                  {/* arka plan yükleme */}
                  <div className="mt-3 rounded-lg border border-dashed bg-muted/20 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium"><Icons.ImageUp className="size-3.5 text-teal-600" /> Arka plan görseli</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Tasarımcıdan gelen görsel en arka layer&apos;a eklenir · en fazla 600 KB</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input ref={bgFileRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBackground(f); e.target.value = ""; }} />
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => bgFileRef.current?.click()}>
                        <Icons.Upload className="size-3" /> Görsel seç
                      </Button>
                      {draft.backgroundDataUrl && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-600 hover:text-rose-700" onClick={() => patchDraft({ backgroundDataUrl: null })}>
                          <Icons.Trash2 className="size-3" /> Kaldır
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* gövde şablonu */}
                  <div className="mt-3 space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Gövde şablonu (HTML destekli)</Label>
                    <div className="flex flex-wrap gap-1">
                      {CERT_TOKENS.map((t) => (
                        <button key={t} type="button"
                          onClick={() => patchDraft({ bodyTemplate: (draft.bodyTemplate ?? "") + t })}
                          className="rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-teal-700 transition hover:border-teal-400 hover:bg-teal-50"
                          title={`Şablona ${t} ekle`}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <Textarea value={draft.bodyTemplate ?? ""} onChange={(e) => patchDraft({ bodyTemplate: e.target.value })} rows={5}
                      className="font-mono text-[11px]" placeholder="Bu belge, {{edition}} etkinliğine {{tier}} olarak katılımını belgelemek üzere düzenlenmiştir…" />
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Button size="sm" onClick={saveDesign} disabled={savingDesign}>
                      {savingDesign ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Save className="size-3.5" />} Tasarımı Kaydet
                    </Button>
                    <span className="text-[11px] text-muted-foreground">Kayıtlı boyutlar baskı sayfasının @page ölçüsünü belirler.</span>
                  </div>
                </SectionCard>
              </div>

              {/* canlı önizleme */}
              <div className="animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none lg:col-span-5" style={{ animationDelay: "60ms" }}>
                <SectionCard title="Canlı Önizleme" desc="örnek veri: Ahmet Yılmaz · ABC Pharma">
                  <div
                    className="relative mx-auto flex w-full max-w-sm flex-col overflow-hidden rounded-md border shadow-sm"
                    style={{
                      aspectRatio: `${draft.widthMm} / ${draft.heightMm}`,
                      background: draft.backgroundDataUrl ? `url('${draft.backgroundDataUrl}') center / cover no-repeat` : "linear-gradient(150deg,#fffdf6 0%,#faf6ea 55%,#f1ead4 100%)",
                      color: draft.textColor,
                      fontFamily: BADGE_FONTS[draft.fontKey]?.css ?? "Georgia, serif",
                      padding: "6% 8%",
                    }}
                  >
                    <p className="text-center uppercase tracking-[3px] opacity-70" style={{ fontSize: "clamp(8px,2.4cqw,12px)" }}>{tenant?.name ?? "Maven"}</p>
                    <p className="mt-2 text-center font-bold" style={{ fontSize: "clamp(14px,5cqw,26px)" }}>{draft.name}</p>
                    <p className="mt-1 text-center font-mono opacity-55" style={{ fontSize: "clamp(7px,1.8cqw,10px)" }}>PAR-000001</p>
                    <div className="flex-1" />
                    <div className="text-center leading-relaxed" style={{ fontSize: "clamp(9px,2.6cqw,13px)" }}
                      dangerouslySetInnerHTML={{ __html: fillTemplate(draft.bodyTemplate ?? "<p>Gövde şablonu boş — soldaki yer tutucularla oluşturun.</p>") }} />
                    <div className="flex-1" />
                    <div className="flex items-end justify-between gap-2">
                      <div className="text-center" style={{ minWidth: "26%" }}>
                        <div className="border-t border-current opacity-60" />
                        <p className="mt-1 font-bold" style={{ fontSize: "clamp(7px,1.8cqw,10px)" }}>{selectedDef.signerName ?? "Yetkili"}</p>
                        <p className="opacity-65" style={{ fontSize: "clamp(6px,1.5cqw,9px)" }}>Organizasyon Sekreteri</p>
                      </div>
                      <div className="grid aspect-square shrink-0 place-items-center rounded-full border-2 border-current font-extrabold opacity-85" style={{ width: "22%", borderWidth: "3px double currentColor" }}>
                        <span className="text-center" style={{ fontSize: "clamp(6px,1.6cqw,10px)" }}>MAVEN<small className="block font-normal opacity-80">{new Date().toLocaleDateString("tr-TR")}</small></span>
                      </div>
                      <div className="text-center" style={{ minWidth: "26%" }}>
                        <div className="border-t border-current opacity-60" />
                        <p className="mt-1 font-bold" style={{ fontSize: "clamp(7px,1.8cqw,10px)" }}>Akreditasyon</p>
                        <p className="opacity-65" style={{ fontSize: "clamp(6px,1.5cqw,9px)" }}>Bilimsel Komite</p>
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">QR (kimlik/vCard) yalnız baskı sayfasında üretilir — önizlemede gösterilmez.</p>
                </SectionCard>
              </div>

              {/* 3 — belge listesi */}
              <div className="lg:col-span-12">
                <SectionCard
                  title={`Belge Listesi — ${selectedDef.name}`}
                  desc="satır seç → toplu yazdır; ELIGIBLE belge baskıda otomatik GENERATED olur"
                  action={
                    <div className="flex items-center gap-2">
                      <Chip tone="teal">{issueSel.size} seçili</Chip>
                      <Button size="sm" variant="outline" onClick={() => openCertSheet(selectedIssuePids)} disabled={printing || selectedIssuePids.length === 0}>
                        {printing ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Printer className="size-3.5" />} Toplu Yazdır
                      </Button>
                    </div>
                  }
                >
                  {issueLoading ? <Loading rows={5} /> : issueError ? <ErrorState message={issueError} onRetry={reloadIssues} /> : (issues ?? []).length === 0 ? (
                    <EmptyState title="Bu tanım için belge yok" desc="'Üret' ile uygunluk listesinden belge oluşturun." />
                  ) : (
                    <div className="maven-scroll max-h-96 overflow-y-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10 bg-card text-left text-muted-foreground">
                          <tr>
                            <th className="w-10 px-3 py-2 font-medium"><span className="sr-only">Seçim</span></th>
                            <th className="px-3 py-2 font-medium">Kişi</th>
                            <th className="px-3 py-2 font-medium">Durum</th>
                            <th className="hidden px-3 py-2 font-medium sm:table-cell">Üretim</th>
                            <th className="hidden px-3 py-2 font-medium sm:table-cell">Gönderim</th>
                            <th className="px-3 py-2 text-right font-medium">İşlem</th>
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
                                  aria-label={`${i.participation?.person.firstName ?? ""} belgesini seç`}
                                />
                              </td>
                              <td className="animate-in fade-in px-3 py-2 motion-reduce:animate-none" style={{ animationDelay: `${idx * 25}ms` }}>
                                <div className="font-medium">{i.participation ? `${i.participation.person.firstName} ${i.participation.person.lastName}` : "—"}</div>
                                {i.participation?.person.company && <div className="text-[11px] text-muted-foreground">{i.participation.person.company}</div>}
                              </td>
                              <td className="px-3 py-2"><StatusBadge map={CERTIFICATE_STATUS} value={i.status} /></td>
                              <td className="hidden whitespace-nowrap px-3 py-2 text-[11px] tabular-nums text-muted-foreground sm:table-cell">{fmtDateTime(i.generatedAt)}</td>
                              <td className="hidden whitespace-nowrap px-3 py-2 text-[11px] tabular-nums text-muted-foreground sm:table-cell">{fmtDateTime(i.deliveredAt)}</td>
                              <td className="px-3 py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={printing || !i.participation} onClick={() => openCertSheet([i.participation!.id])} title="Tek belge baskı sayfası">
                                    <Icons.ExternalLink className="size-3" /> Sertifikayı aç
                                  </Button>
                                  {(i.status === "GENERATED" || i.status === "DELIVERED") && (
                                    <Button variant="outline" size="sm" className="h-7 gap-1 border-teal-300 bg-teal-50 px-2 text-xs text-teal-800 hover:bg-teal-100 hover:text-teal-900"
                                      disabled={mailBusyId === i.id || !i.participation}
                                      onClick={() => mailDeliver(i)}
                                      title="deliveredAt işlenir + Teşekkür şablonu (simülasyon)">
                                      {mailBusyId === i.id ? <Icons.Loader2 className="size-3 animate-spin" /> : <Icons.MailCheck className="size-3" />} E-posta ile gönder
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
}
interface TemplateRow { id: string; name: string; category: string; phase: string; subject: string; htmlBody: string; usageCount: number; isActive: boolean }
interface ProviderRow {
  id: string; name: string; kind: string; host?: string | null; port?: number | null; username?: string | null;
  fromEmail: string; fromName?: string | null; replyTo?: string | null; dailyLimit?: number | null;
  isDefault: boolean; status: string; lastTestAt?: string | null; lastTestStatus?: string | null;
}
interface FormLite { id: string; name: string }

const AUDIENCE_MODE: Record<string, string> = { SEGMENT: "Segment (kural)", CUSTOM: "Özel Liste", BOTH: "Segment + Özel Liste" };
const CAMPAIGN_STATUS: Record<string, string> = { DRAFT: "Taslak", TESTED: "Test edildi", SCHEDULED: "Zamanlandı", SENT: "Gönderildi", FAILED: "Başarısız" };
const PHASE_TONE: Record<string, "teal" | "amber" | "violet"> = { PRE_EVENT: "teal", DURING_EVENT: "amber", POST_EVENT: "violet" };

const PHASE_PILLS: { key: string; label: string }[] = [
  { key: "ALL", label: "Tüm Aşamalar" },
  { key: "PRE_EVENT", label: CAMPAIGN_PHASE.PRE_EVENT },
  { key: "DURING_EVENT", label: CAMPAIGN_PHASE.DURING_EVENT },
  { key: "POST_EVENT", label: CAMPAIGN_PHASE.POST_EVENT },
];

export function CommunicationsView() {
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

  const templateName = (id: string | null) => (templates ?? []).find((t) => t.id === id)?.name ?? null;
  const providerName = (id: string | null) => (providers ?? []).find((p) => p.id === id)?.name ?? null;
  const defaultProvider = (providers ?? []).find((p) => p.isDefault) ?? (providers ?? [])[0] ?? null;

  const visibleCampaigns = (campaigns ?? []).filter((c) => phaseFilter === "ALL" || c.phase === phaseFilter);

  // ── kampanya formu ──
  const emptyCampaign = { name: "", segmentRule: "", phase: "PRE_EVENT", audienceMode: "SEGMENT", customRecipients: "", templateId: "", providerId: "", formId: "", subject: "", isSegmentFixed: true };
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignEdit, setCampaignEdit] = useState<CampaignRow | null>(null);
  const [campaignForm, setCampaignForm] = useState(emptyCampaign);
  const [campaignBusy, setCampaignBusy] = useState(false);

  const openCampaignNew = (preselect?: Partial<typeof emptyCampaign>) => {
    setCampaignEdit(null);
    setCampaignForm({ ...emptyCampaign, ...preselect });
    setCampaignOpen(true);
  };
  const openCampaignEdit = (c: CampaignRow) => {
    setCampaignEdit(c);
    setCampaignForm({
      name: c.name, segmentRule: c.segmentRule, phase: c.phase ?? "PRE_EVENT", audienceMode: c.audienceMode ?? "SEGMENT",
      customRecipients: c.customRecipients ?? "", templateId: c.templateId ?? "", providerId: c.providerId ?? "",
      formId: c.formId ?? "", subject: c.subject ?? "", isSegmentFixed: c.isSegmentFixed,
    });
    setCampaignOpen(true);
  };

  const saveCampaign = async () => {
    if (!currentEditionId) return;
    if (!campaignForm.name.trim()) { toast({ title: "Kampanya adı zorunlu", variant: "destructive" }); return; }
    if (campaignForm.audienceMode !== "SEGMENT" && !campaignForm.customRecipients.trim()) {
      toast({ title: "Özel liste boş", description: "CUSTOM/BOTH modda alıcı e-postaları zorunlu.", variant: "destructive" });
      return;
    }
    setCampaignBusy(true);
    try {
      const payload = {
        editionId: currentEditionId, name: campaignForm.name.trim(), segmentRule: campaignForm.segmentRule.trim() || "özel liste",
        phase: campaignForm.phase, audienceMode: campaignForm.audienceMode, customRecipients: campaignForm.customRecipients,
        templateId: campaignForm.templateId || null, providerId: campaignForm.providerId || null, formId: campaignForm.formId || null,
        subject: campaignForm.subject || null, isSegmentFixed: campaignForm.isSegmentFixed,
      };
      if (campaignEdit) await apiSend(`/api/campaigns/${campaignEdit.id}`, "PUT", payload);
      else await apiSend("/api/campaigns", "POST", payload);
      toast({ title: campaignEdit ? "Kampanya güncellendi" : "Kampanya oluşturuldu", description: `${campaignForm.name} · ${label(CAMPAIGN_PHASE, campaignForm.phase)}` });
      setCampaignOpen(false);
      reload(); bump();
    } catch (e) {
      toast({ title: "Kampanya kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setCampaignBusy(false); }
  };

  // gönderim (simülasyon) — metrikleri doldurur, bağlı şablonun usageCount'unu PUT ile +1 yapar
  const sendCampaign = async (c: CampaignRow) => {
    const customCount = c.audienceMode !== "SEGMENT" && c.customRecipients
      ? c.customRecipients.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).length : 0;
    const total = c.audienceCount + customCount;
    try {
      await apiSend(`/api/campaigns/${c.id}`, "PUT", {
        status: "SENT", sentAt: new Date().toISOString(), sentCount: total, deliveredCount: total, failCount: 0,
      });
      if (c.templateId) {
        const t = (templates ?? []).find((x) => x.id === c.templateId);
        if (t) await apiSend(`/api/email-templates/${t.id}`, "PUT", { usageCount: (t.usageCount ?? 0) + 1 });
      }
      toast({ title: "Kampanya gönderildi (simülasyon)", description: `${total} alıcı${c.templateId ? " · şablon kullanım sayısı +1" : ""}${c.providerId ? ` · sağlayıcı: ${providerName(c.providerId)}` : ""}` });
      reload(); reloadTemplates(); bump();
    } catch (e) {
      toast({ title: "Gönderim başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    }
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
      toast({ title: "Ad ve konu zorunlu", variant: "destructive" }); return;
    }
    setTemplateBusy(true);
    try {
      const payload = { editionId: currentEditionId, name: templateForm.name.trim(), subject: templateForm.subject.trim(), category: templateForm.category, phase: templateForm.phase, htmlBody: templateForm.htmlBody };
      if (templateEdit) await apiSend(`/api/email-templates/${templateEdit.id}`, "PUT", payload);
      else await apiSend("/api/email-templates", "POST", payload);
      toast({ title: templateEdit ? "Şablon güncellendi" : "Şablon oluşturuldu", description: `${templateForm.name} · ${label(EMAIL_TEMPLATE_CATEGORY, templateForm.category)}` });
      setTemplateOpen(false);
      reloadTemplates(); bump();
    } catch (e) {
      toast({ title: "Şablon kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
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
      toast({ title: "Ad ve gönderen e-posta zorunlu", variant: "destructive" }); return;
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
      toast({ title: providerEdit ? "Sağlayıcı güncellendi" : "Sağlayıcı eklendi", description: `${providerForm.name} · ${label(MAIL_PROVIDER_KIND, providerForm.kind)}` });
      setProviderOpen(false);
      reloadProviders(); bump();
    } catch (e) {
      toast({ title: "Sağlayıcı kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
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
        title: res.ok ? `Test gönderimi hazır (${passed}/${res.checks.length} kontrol geçti)` : `Ayar eksik — ${passed}/${res.checks.length} kontrol geçti`,
        description: `${res.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.label}: ${c.note}`).join(" · ")}${failed.length ? " — eksik: " + failed.join(", ") : ""}`,
        variant: res.ok ? "default" : "destructive",
      });
      reloadProviders(); bump();
    } catch (e) {
      toast({ title: "Test gönderimi başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setTestBusyId(null); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="İletişim — 360 Branding" desc="3 aşamalı süreç (öncesi/zamanı/sonrası) · izinli hedef segment → önizleme → test → canlı gönderim">
        <Button size="sm" onClick={() => openCampaignNew()}>
          <Icons.Megaphone className="size-3.5" /> Yeni Kampanya
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
            {p.label}
          </button>
        ))}
        <span className="ms-auto self-center px-3 text-xs text-muted-foreground">{visibleCampaigns.length} kampanya</span>
      </div>

      {/* 2 — kampanya listesi */}
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : visibleCampaigns.length === 0 ? (
        <EmptyState
          title={(campaigns ?? []).length === 0 ? "Henüz kampanya hazırlamadınız" : "Bu aşamada kampanya yok"}
          desc={(campaigns ?? []).length === 0 ? "Yeni Kampanya ile başlayın — segment veya özel liste hedefleyin." : "Aşama filtresini değiştirin."}
          action={(campaigns ?? []).length === 0 ? <Button size="sm" variant="outline" onClick={() => openCampaignNew()}>Kampanya Oluştur</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {visibleCampaigns.map((c, i) => (
            <div key={c.id} className="animate-in fade-in slide-in-from-bottom-1 rounded-xl border bg-card p-4 shadow-sm transition hover:shadow-md motion-reduce:animate-none" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex flex-wrap items-center gap-2">
                <Icons.Megaphone className="size-4 text-teal-600" />
                <p className="font-semibold">{c.name}</p>
                <StatusBadge map={CAMPAIGN_STATUS} value={c.status} />
                <Chip tone={PHASE_TONE[c.phase] ?? "neutral"}>{label(CAMPAIGN_PHASE, c.phase)}</Chip>
                <Chip>{label(AUDIENCE_MODE, c.audienceMode)}</Chip>
                <Chip tone={c.isSegmentFixed ? "teal" : "amber"}>{c.isSegmentFixed ? "sabit segment" : "gönderim anında güncel"}</Chip>
                <span className="ml-auto text-xs text-muted-foreground">{c.sentAt ? fmtDateTime(c.sentAt) : "gönderilmedi"}</span>
                <div className="flex items-center gap-1">
                  {["DRAFT", "TESTED"].includes(c.status) && (
                    <Button size="sm" variant="outline" className="h-7 gap-1 border-teal-300 bg-teal-50 px-2 text-xs text-teal-800 hover:bg-teal-100 hover:text-teal-900" onClick={() => sendCampaign(c)} title="Gönderim simülasyonu — bağlı şablon kullanımı +1">
                      <Icons.Send className="size-3" /> Gönder (sim.)
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openCampaignEdit(c)}>
                    <Icons.Pencil className="size-3" /> Düzenle
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Segment: {c.segmentRule} · hedef {c.audienceCount}{c.customRecipients ? ` · özel liste: ${c.customRecipients.split(/[\n,;]+/).filter((s) => s.trim()).length} alıcı` : ""}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                <span>Şablon: {c.templateId ? templateName(c.templateId) ?? "—" : "—"}</span>
                <span>Sağlayıcı: {c.providerId ? providerName(c.providerId) ?? "—" : "—"}</span>
                {c.formId && <span>Quiz formu bağlı</span>}
              </p>
              {c.status === "SENT" && (
                <div className="mt-3 grid grid-cols-5 gap-2 text-center text-xs">
                  {[["gönderilen", c.sentCount], ["teslim", c.deliveredCount], ["açılma", c.openCount], ["tıklama", c.clickCount], ["başarısız", c.failCount]].map(([lbl, v]) => (
                    <div key={lbl as string} className="rounded-lg bg-muted p-2">
                      <p className="text-base font-semibold tabular-nums">{v as number}</p>
                      <p className="text-muted-foreground">{lbl as string}</p>
                    </div>
                  ))}
                </div>
              )}
              {c.status === "TESTED" && <p className="mt-2 text-xs text-amber-700">Test gönderimi yapıldı: {c.name.split(" ")[0]} paneli — kitle önizlemesi onaylandıktan sonra canlı gönderim açılır.</p>}
            </div>
          ))}
        </div>
      )}

      {/* 3 — Şablonlar */}
      <SectionCard
        title="Şablonlar (E-posta)"
        desc="HTML mailing şablonları — kategori ve aşama etiketli, kullanım sayacı gönderimle artar"
        action={<Button size="sm" variant="outline" onClick={openTemplateNew}><Icons.FilePlus2 className="size-3.5" /> Yeni Şablon</Button>}
      >
        {(templates ?? []).length === 0 ? (
          <EmptyState title="Şablon yok" desc="Davet, onay, quiz, teşekkür gibi aşama şablonları oluşturun." />
        ) : (
          <div className="maven-scroll max-h-96 space-y-1.5 overflow-y-auto">
            {(templates ?? []).map((t, i) => (
              <div key={t.id} className="animate-in fade-in slide-in-from-left-1 rounded-lg border bg-card px-3 py-2.5 transition hover:border-teal-300 hover:bg-teal-50/30 motion-reduce:animate-none" style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex flex-wrap items-center gap-2">
                  <Icons.FileText className="size-3.5 shrink-0 text-teal-600" />
                  <span className="text-xs font-semibold">{t.name}</span>
                  <Chip tone="teal">{label(EMAIL_TEMPLATE_CATEGORY, t.category)}</Chip>
                  <Chip tone={PHASE_TONE[t.phase] ?? "neutral"}>{label(CAMPAIGN_PHASE, t.phase)}</Chip>
                  <Chip>{t.usageCount} kullanım</Chip>
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => setPreviewTemplate(t)} aria-label={`${t.name} önizle`} title="HTML gövde önizleme">
                      <Icons.Eye className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => openTemplateEdit(t)} aria-label={`${t.name} düzenle`} title="Düzenle">
                      <Icons.Pencil className="size-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => openCampaignNew({ templateId: t.id, name: t.name + " — Kampanya", subject: t.subject })} title="Bu şablonla kampanya oluştur">
                      <Icons.Link2 className="size-3" /> Kampanyada kullan
                    </Button>
                  </div>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">Konu: {t.subject}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 4 — Mail Sağlayıcıları */}
      <SectionCard
        title="Mail Sağlayıcıları"
        desc="SMTP / Mailjet / SendGrid — günlük limit, varsayılan yıldızı, test gönderimi kontrol listesi"
        action={<Button size="sm" variant="outline" onClick={openProviderNew}><Icons.PlusCircle className="size-3.5" /> Yeni Sağlayıcı</Button>}
      >
        {(providers ?? []).length === 0 ? (
          <EmptyState title="Sağlayıcı yok" desc="Kampanya gönderimi için bir mail sağlayıcı tanımlayın." />
        ) : (
          <div className="maven-scroll max-h-96 space-y-1.5 overflow-y-auto">
            {(providers ?? []).map((p, i) => (
              <div key={p.id} className="animate-in fade-in slide-in-from-left-1 rounded-lg border bg-card px-3 py-2.5 transition hover:border-teal-300 hover:bg-teal-50/30 motion-reduce:animate-none" style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex flex-wrap items-center gap-2">
                  <Icons.Server className="size-3.5 shrink-0 text-teal-600" />
                  <span className="text-xs font-semibold">{p.name}</span>
                  {p.isDefault && <Icons.Star className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="varsayılan" />}
                  <Chip tone="teal">{label(MAIL_PROVIDER_KIND, p.kind)}</Chip>
                  <StatusBadge map={{ ACTIVE: "Aktif", PAUSED: "Duraklatıldı" }} value={p.status} />
                  {p.lastTestStatus && (
                    <Chip tone={p.lastTestStatus === "OK" ? "emerald" : "rose"}>son test: {p.lastTestStatus === "OK" ? "başarılı" : "başarısız"}</Chip>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={testBusyId === p.id} onClick={() => testProvider(p)} title="POST /api/mail/test — kontrol listesi döner">
                      {testBusyId === p.id ? <Icons.Loader2 className="size-3 animate-spin" /> : <Icons.SendHorizontal className="size-3" />} Test gönderimi
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => openProviderEdit(p)} aria-label={`${p.name} düzenle`} title="Düzenle">
                      <Icons.Pencil className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                  <span>from: {p.fromName ? `${p.fromName} <${p.fromEmail}>` : p.fromEmail}</span>
                  <span>limit: {p.dailyLimit ?? "sınırsız"}/gün</span>
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
            <DialogTitle>{campaignEdit ? "Kampanyayı Düzenle" : "Yeni Kampanya"}</DialogTitle>
            <DialogDescription>Aşama, hedef kitle modu, şablon ve sağlayıcı bağlantıları — 360 branding akışı.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Kampanya adı</Label>
              <Input value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} placeholder="örn. Erken Kayıt Daveti" className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Aşama</Label>
                <Select value={campaignForm.phase} onValueChange={(v) => setCampaignForm({ ...campaignForm, phase: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CAMPAIGN_PHASE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hedef kitle modu</Label>
                <Select value={campaignForm.audienceMode} onValueChange={(v) => setCampaignForm({ ...campaignForm, audienceMode: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(AUDIENCE_MODE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Segment kuralı</Label>
              <Input value={campaignForm.segmentRule} onChange={(e) => setCampaignForm({ ...campaignForm, segmentRule: e.target.value })} placeholder="kayıt onaylı ama ödeme bekliyor" className="h-8 text-xs" disabled={campaignForm.audienceMode === "CUSTOM"} />
            </div>
            {campaignForm.audienceMode !== "SEGMENT" && (
              <div className="space-y-1">
                <Label className="text-xs">Özel alıcı listesi</Label>
                <Textarea value={campaignForm.customRecipients} onChange={(e) => setCampaignForm({ ...campaignForm, customRecipients: e.target.value })}
                  rows={3} className="text-xs" placeholder={"satır veya virgülle ayırın:\nome@firma.com, ikinci@firma.com"} />
                <p className="text-[10px] text-muted-foreground">{campaignForm.customRecipients.split(/[\n,;]+/).filter((s) => s.trim()).length} alıcı</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">E-posta şablonu</Label>
                <Select value={campaignForm.templateId || "NONE"} onValueChange={(v) => setCampaignForm({ ...campaignForm, templateId: v === "NONE" ? "" : v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— şablon yok —</SelectItem>
                    {(templates ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Gönderim sağlayıcısı</Label>
                <Select value={campaignForm.providerId || "NONE"} onValueChange={(v) => setCampaignForm({ ...campaignForm, providerId: v === "NONE" ? "" : v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— sağlayıcı yok —</SelectItem>
                    {(providers ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.isDefault ? " ★" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Quiz formu (isteğe bağlı)</Label>
                <Select value={campaignForm.formId || "NONE"} onValueChange={(v) => setCampaignForm({ ...campaignForm, formId: v === "NONE" ? "" : v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— form yok —</SelectItem>
                    {(forms ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">E-posta konusu</Label>
                <Input value={campaignForm.subject} onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })} className="h-8 text-xs" placeholder="{{series}} davetiniz" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
              <span className="text-xs font-medium">Sabit segment</span>
              <Switch checked={campaignForm.isSegmentFixed} onCheckedChange={(v) => setCampaignForm({ ...campaignForm, isSegmentFixed: v })} aria-label="Sabit segment" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampaignOpen(false)}>Vazgeç</Button>
            <Button onClick={saveCampaign} disabled={campaignBusy}>
              {campaignBusy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Save className="size-3.5" />} Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6 — Şablon önizleme dialogu (korumalı mock e-posta çerçevesi) */}
      <Dialog open={previewTemplate !== null} onOpenChange={(o) => { if (!o) setPreviewTemplate(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Şablon Önizleme — {previewTemplate?.name}</DialogTitle>
            <DialogDescription>HTML gövde korumalı mock e-posta çerçevesinde gösterilir.</DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <div className="overflow-hidden rounded-lg border">
              <div className="flex items-center gap-2 bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                <Icons.Mail className="size-3.5 shrink-0" />
                <span className="truncate">Kimden: {defaultProvider ? `${defaultProvider.fromName ? defaultProvider.fromName + " " : ""}<${defaultProvider.fromEmail}>` : "varsayılan sağlayıcı tanımlı değil"}</span>
                <Chip tone={PHASE_TONE[previewTemplate.phase] ?? "neutral"}>{label(CAMPAIGN_PHASE, previewTemplate.phase)}</Chip>
              </div>
              <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold">{previewTemplate.subject}</div>
              <div className="maven-scroll max-h-80 overflow-y-auto bg-white p-4 text-sm text-slate-900" dangerouslySetInnerHTML={{ __html: previewTemplate.htmlBody }} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>Kapat</Button>
            {previewTemplate && (
              <Button onClick={() => { const t = previewTemplate; setPreviewTemplate(null); openCampaignNew({ templateId: t.id, name: t.name + " — Kampanya", subject: t.subject }); }}>
                <Icons.Link2 className="size-3.5" /> Kampanyada kullan
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7 — Şablon oluşturma/düzenleme dialogu */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg maven-scroll">
          <DialogHeader>
            <DialogTitle>{templateEdit ? "Şablonu Düzenle" : "Yeni E-posta Şablonu"}</DialogTitle>
            <DialogDescription>HTML gövde — yer tutucular gönderim anında alıcı verisiyle doldurulur.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Şablon adı</Label>
                <Input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} className="h-8 text-xs" placeholder="Davet — Erken Kayıt" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Konu</Label>
                <Input value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} className="h-8 text-xs" placeholder="{{series}} davetiniz hazır" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Kategori</Label>
                <Select value={templateForm.category} onValueChange={(v) => setTemplateForm({ ...templateForm, category: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(EMAIL_TEMPLATE_CATEGORY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Aşama</Label>
                <Select value={templateForm.phase} onValueChange={(v) => setTemplateForm({ ...templateForm, phase: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CAMPAIGN_PHASE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">HTML gövde</Label>
              <Textarea value={templateForm.htmlBody} onChange={(e) => setTemplateForm({ ...templateForm, htmlBody: e.target.value })}
                rows={8} className="font-mono text-[11px]" placeholder={'<div style="font-family:Arial"><h2>Merhaba {{fullName}}</h2>…</div>'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>Vazgeç</Button>
            <Button onClick={saveTemplate} disabled={templateBusy}>
              {templateBusy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Save className="size-3.5" />} Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 8 — Sağlayıcı oluşturma/düzenleme dialogu */}
      <Dialog open={providerOpen} onOpenChange={setProviderOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg maven-scroll">
          <DialogHeader>
            <DialogTitle>{providerEdit ? "Sağlayıcıyı Düzenle" : "Yeni Mail Sağlayıcı"}</DialogTitle>
            <DialogDescription>SMTP sunucusu veya e-posta platformu — kimlik bilgileri maskelenir.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Sağlayıcı adı</Label>
                <Input value={providerForm.name} onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })} className="h-8 text-xs" placeholder="Şirket SMTP" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tür</Label>
                <Select value={providerForm.kind} onValueChange={(v) => setProviderForm({ ...providerForm, kind: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(MAIL_PROVIDER_KIND).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Host (SMTP)</Label>
                <Input value={providerForm.host} onChange={(e) => setProviderForm({ ...providerForm, host: e.target.value })} className="h-8 text-xs" placeholder="smtp.firma.com" disabled={providerForm.kind !== "SMTP"} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Port</Label>
                <Input type="number" value={providerForm.port} onChange={(e) => setProviderForm({ ...providerForm, port: e.target.value })} className="h-8 text-xs tabular-nums" placeholder="587" disabled={providerForm.kind !== "SMTP"} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Kullanıcı adı</Label>
                <Input value={providerForm.username} onChange={(e) => setProviderForm({ ...providerForm, username: e.target.value })} className="h-8 text-xs" autoComplete="off" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Şifre</Label>
                <Input type="password" value={providerForm.password} onChange={(e) => setProviderForm({ ...providerForm, password: e.target.value })} className="h-8 text-xs" autoComplete="new-password" placeholder="••••••" />
                <p className="text-[10px] text-muted-foreground">UI&apos;da maskelenir{providerEdit ? " — boş bırakılırsa mevcut şifre korunur" : ""}.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Gönderen e-posta (from)</Label>
                <Input value={providerForm.fromEmail} onChange={(e) => setProviderForm({ ...providerForm, fromEmail: e.target.value })} className="h-8 text-xs" placeholder="etkinlik@firma.com" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Gönderen adı</Label>
                <Input value={providerForm.fromName} onChange={(e) => setProviderForm({ ...providerForm, fromName: e.target.value })} className="h-8 text-xs" placeholder="Firma Etkinlik Ekibi" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Yanıt adresi (reply-to)</Label>
                <Input value={providerForm.replyTo} onChange={(e) => setProviderForm({ ...providerForm, replyTo: e.target.value })} className="h-8 text-xs" placeholder="destek@firma.com" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Günlük limit</Label>
                <Input type="number" value={providerForm.dailyLimit} onChange={(e) => setProviderForm({ ...providerForm, dailyLimit: e.target.value })} className="h-8 text-xs tabular-nums" placeholder="2000" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
              <span className="text-xs font-medium">Varsayılan sağlayıcı</span>
              <Switch checked={providerForm.isDefault} onCheckedChange={(v) => setProviderForm({ ...providerForm, isDefault: v })} aria-label="Varsayılan sağlayıcı" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProviderOpen(false)}>Vazgeç</Button>
            <Button onClick={saveProvider} disabled={providerBusy}>
              {providerBusy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Save className="size-3.5" />} Kaydet
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
  const { refreshKey, bump } = useApp();
  const { data, error, reload, loading } = useApi<TaskRow[]>(() => listEntity<TaskRow>("tasks", { limit: 200 }), [refreshKey]);

  const move = async (t: TaskRow, status: string) => {
    await apiSend(`/api/tasks/${t.id}`, "PUT", { status, completedAt: status === "DONE" ? new Date().toISOString() : null });
    reload(); bump();
  };

  return (
    <div>
      <PageHeader title="Operasyon" desc="Görevler modül bazlı — kapalı yeteneğin görevi baştan görünmez">
        <Button variant="ghost" size="sm" onClick={reload}><Icons.RefreshCw className="size-4" /></Button>
      </PageHeader>
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <div className="grid gap-3 overflow-x-auto maven-scroll md:grid-cols-3 xl:grid-cols-6">
          {KANBAN.map((col) => {
            const items = (data ?? []).filter((t) => t.status === col.key);
            return (
              <div key={col.key} className={cn("min-w-52 rounded-xl p-2.5", col.tone)}>
                <p className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
                  {label(TASK_STATUS, col.key)}
                  <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] tabular-nums">{items.length}</span>
                </p>
                <div className="space-y-2">
                  {items.map((t) => (
                    <div key={t.id} className="rounded-lg border bg-card p-2.5 shadow-sm">
                      <p className="text-xs font-medium leading-snug">{t.title}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {t.edition?.name ?? "Genel"} · {t.module}
                        {t.dueDate && <span className={cn("ml-1", new Date(t.dueDate) < new Date() && t.status !== "DONE" && "font-semibold text-rose-600")}>· {fmtDate(t.dueDate)}</span>}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between">
                        <Chip tone={t.priority === "URGENT" ? "rose" : t.priority === "HIGH" ? "amber" : "neutral"}>{label(TASK_PRIORITY, t.priority)}</Chip>
                        <Select value={t.status} onValueChange={(v) => move(t, v)}>
                          <SelectTrigger className="h-6 w-24 text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(TASK_STATUS).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">boş</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AYARLAR ────────────────────────────────────────────────────────────────

export function SettingsView() {
  const { editions, currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const edition = editions.find((e) => e.id === currentEditionId);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: assignments } = useApi<{ id: string; role: string; organization: { name: string } }[]>(() => listEntity("org-assignments", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);

  const toggleCap = async (capabilityId: string, enabled: boolean) => {
    setBusy(capabilityId);
    try {
      await apiSend("/api/flows", "POST", { action: "capability.toggle", capabilityId, enabled });
      toast({ title: enabled ? "Yetenek açıldı" : "Yetenek kapatıldı", description: "Navigasyon, wizard, yetki, formlar ve raporlar birlikte değişir." });
      bump();
    } finally { setBusy(null); }
  };

  if (!edition) return <EmptyState title="Edisyon seçin" />;

  return (
    <div className="space-y-5">
      <PageHeader title="Etkinlik Ayarları" desc="Kimlik, tarih, ekip, yayın ve modül seçimleri — kapalı yeteneğin menüsü baştan gizlenir" />
      <SectionCard title="Yetenekler (Capabilities)" desc="Modül kartı: açılınca hangi menü/form/rapor geleceği buradan görünür (§6)">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((cap) => {
            const state = edition.capabilities?.find((c) => c.key === cap.key);
            return (
              <div key={cap.key} className={cn("flex items-start justify-between gap-3 rounded-lg border p-3", !state?.enabled && "opacity-60")}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{cap.label}</p>
                  <p className="text-xs text-muted-foreground">{cap.desc}</p>
                  {state?.setupNote && state.setupNote !== "hazır" && <Chip tone="amber">{state.setupNote}</Chip>}
                </div>
                {state ? (
                  <Switch checked={state.enabled} onCheckedChange={(v) => toggleCap(state.id, v)} disabled={busy === state.id} aria-label={`${cap.label} yeteneği`} />
                ) : (
                  <Chip>yok</Chip>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Kurum / Ekip Atamaları" desc="Aynı kurum çok rol alabilir; rolün görünürlüğü seçilir (§4)">
        {(assignments ?? []).length === 0 ? <EmptyState title="Atama yok" /> : (
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
    </div>
  );
}
