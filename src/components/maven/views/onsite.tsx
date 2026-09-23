"use client";
// Sahada — canlı onsite kontrol (§07/§42): kapı seçimi, arama, tarama, tekrar/ret kuyruğu
// + Sertifikalar (§43) + İletişim + Operasyon + Ayarlar
import { useState } from "react";
import { listEntity, apiSend, apiGet } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { ATTENDANCE_STATUS, BADGE_STATUS, CERTIFICATE_STATUS, TASK_STATUS, TASK_PRIORITY, fmtDateTime, fmtDate, label, CAPABILITIES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
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

interface CertDefRow { id: string; name: string; type: string; eligibilityRule?: string | null; signerName?: string | null; issues: { id: string; status: string; eligibilityNote?: string | null }[] }

export function CertificatesView() {
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: defs, error, reload, loading } = useApi<CertDefRow[]>(() => listEntity<CertDefRow>("certificate-definitions", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);

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

  return (
    <div className="space-y-5">
      <PageHeader title="Sertifikalar" desc="Uygunluk kuralı → uygunluk listesi → üretim → gönderim; 'Üretildi' ile 'Gönderildi' ayrı metrik" />
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (defs ?? []).length === 0 ? (
        <EmptyState title="Henüz sertifika türü oluşturulmadı" desc="Önce uygunluk koşullarını tanımlayın." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {(defs ?? []).map((d) => {
            const cnt = (s: string) => d.issues.filter((i) => i.status === s).length;
            return (
              <SectionCard key={d.id} title={d.name} desc={d.eligibilityRule ?? "kural tanımsız"} action={
                <Button size="sm" variant="outline" onClick={() => generate(d)} disabled={busy === d.id}>
                  {busy === d.id ? "Üretiliyor…" : "Üret"}
                </Button>
              }>
                <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                  <div className="rounded-md bg-emerald-50 p-1.5"><p className="text-base font-bold text-emerald-700 tabular-nums">{cnt("GENERATED") + cnt("DELIVERED")}</p><p className="text-emerald-600/80">uygun</p></div>
                  <div className="rounded-md bg-sky-50 p-1.5"><p className="text-base font-bold text-sky-700 tabular-nums">{cnt("GENERATED")}</p><p className="text-sky-600/80">üretildi</p></div>
                  <div className="rounded-md bg-teal-50 p-1.5"><p className="text-base font-bold text-teal-700 tabular-nums">{cnt("DELIVERED")}</p><p className="text-teal-600/80">gönderildi</p></div>
                  <div className="rounded-md bg-rose-50 p-1.5"><p className="text-base font-bold text-rose-700 tabular-nums">{cnt("NOT_ELIGIBLE") + cnt("REVOKED")}</p><p className="text-rose-600/80">eksik/iptal</p></div>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">İmzacı: {d.signerName ?? "—"} · belgedeki ad: EventProfileSnapshot'tan</p>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── İLETİŞİM ───────────────────────────────────────────────────────────────

interface CampaignRow { id: string; name: string; segmentRule: string; audienceCount: number; status: string; isSegmentFixed: boolean; sentAt?: string | null; sentCount: number; deliveredCount: number; openCount: number; clickCount: number; failCount: number }

export function CommunicationsView() {
  const { currentEditionId } = useApp();
  const { data, error, reload, loading } = useApi<CampaignRow[]>(() => listEntity<CampaignRow>("campaigns", { editionId: currentEditionId ?? undefined }), [currentEditionId]);

  return (
    <div>
      <PageHeader title="İletişim" desc="İzinli hedef segment → önizleme → test gönderim → canlı gönderim; hassas soru cevabı değişken olamaz" />
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (data ?? []).length === 0 ? (
        <EmptyState title="Henüz kampanya hazırlamadınız" desc="Önce hedef kitleyi seçin." />
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((c) => (
            <div key={c.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Icons.Megaphone className="size-4 text-primary" />
                <p className="font-semibold">{c.name}</p>
                <StatusBadge map={{ DRAFT: "Taslak", TESTED: "Test edildi", SCHEDULED: "Zamanlandı", SENT: "Gönderildi", FAILED: "Başarısız" }} value={c.status} />
                <Chip tone={c.isSegmentFixed ? "teal" : "amber"}>{c.isSegmentFixed ? "sabit segment" : "gönderim anında güncel"}</Chip>
                <span className="ml-auto text-xs text-muted-foreground">{c.sentAt ? fmtDateTime(c.sentAt) : "gönderilmedi"}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Segment: {c.segmentRule} · hedef {c.audienceCount}</p>
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
