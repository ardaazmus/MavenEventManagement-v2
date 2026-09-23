"use client";
// Bilimsel — çağrı, bildiri, hakem, karar (kabul ≠ otomatik program slotu, Kimlik kuralı 6)
// Program — oturum, salon, görevler, yayın durumu + CME kredi defteri (§08, CME_CREDITS yeteneği)
import { useEffect, useState } from "react";
import { listEntity, apiSend, apiGet } from "@/lib/client";
import { useApp, hasCapability } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { SUBMISSION_STATUS, SESSION_STATUS, fmtDateTime, fmtDate, EVENT_ROLES, MATERIAL_TYPE, label } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CmeReportOverlay } from "../cme-report";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

interface SubmissionRow {
  id: string; code: string; title: string; abstract?: string | null; type: string; status: string; presentingAuthorName?: string | null; keywords?: string | null; fileStatus?: string | null; submittedAt?: string | null;
  track?: { name: string } | null;
  authorships: { id: string; name: string; organizationName?: string | null; isPresenting: boolean; position: number }[];
  reviewAssignments: { id: string; status: string; dueDate?: string | null; reviewer?: { firstName: string; lastName: string } | null; reviews: { id: string; score?: number | null; recommendation?: string | null; comment?: string | null }[] }[];
  decisions: { id: string; decision: string; rationale?: string | null; decidedBy?: string | null; decidedAt: string; version: number }[];
}
interface SessionRow {
  id: string; title: string; description?: string | null; type: string; status: string; startTime: string; endTime: string; capacity?: number | null; accessRule?: string | null; isVisible: boolean;
  room?: { name: string; capacity: number } | null;
  track?: { name: string } | null;
  submission?: { code: string; title: string } | null;
  assignments: { id: string; role: string; status: string; person?: { firstName: string; lastName: string } | null; participation?: { person: { firstName: string; lastName: string } } | null }[];
}

// ── R9-c: içe aktarım raporu (/api/program/import sözleşmesi) ──────────────
interface ImportMatchDetail { row: number; name?: string; email?: string; result: string; personId?: string }
interface ImportReport {
  ok?: boolean; kind: string; dryRun: boolean; totalRows: number;
  sessionsCreated: number; sessionsUpdated: number; roomsCreated: number;
  personsMatched: number; personsCreated: number; personsUnmatched: number;
  participationsCreated: number; assignmentsCreated: number;
  matchDetails: ImportMatchDetail[];
  errors: { row: number; message: string }[];
}

// ── R9-c: oturum materyalleri (SessionMaterial sözleşmesi) ─────────────────
interface MaterialRow {
  id: string; sessionId: string; editionId: string; type: string; title: string;
  personId?: string | null; url?: string | null; durationMin?: number | null;
  status: string; notes?: string | null; order: number;
  person?: { firstName: string; lastName: string } | null;
}
const MATERIAL_STATUS_LABEL: Record<string, string> = { PENDING: "Bekliyor", READY: "Hazır", MISSING: "Eksik" };
// eşleşme sonucu tonu — teal: eşleşti · emerald: yeni · amber: sınama · rose: eşleşmedi
const importTone = (r: string): "teal" | "emerald" | "amber" | "rose" | "neutral" =>
  r.includes("ile eşleşti") ? "teal"
  : r.includes("Yeni kişi") ? "emerald"
  : r.includes("oluşturulacak") || r.includes("sına") ? "amber"
  : r.includes("Eşleşmedi") || r.includes("kapalı") ? "rose"
  : "neutral";

// CME Kredi Defteri verileri (/api/cme sözleşmesi — R2-a)
interface CmeSession {
  id: string; title: string; type: string; startTime: string; cmeCredits: number | null; status: string; attendanceCount: number;
}
interface CmeLedgerRow {
  participationId: string;
  person: { fullName: string; company: string | null; title: string | null };
  roles: string[];
  registrationStatus: string | null;
  attendedCount: number; eligibleCount: number;
  credits: number; maxPossible: number; percent: number;
  lastActivity: string | null;
}
interface CmeData {
  editionId: string;
  sessions: CmeSession[];
  ledger: CmeLedgerRow[];
  summary: { sessionsTotal: number; sessionsWithCredits: number; creditsPotential: number; attendees: number; creditsIssued: number; avgCredits: number; maxEarned: number; coveragePercent: number };
  byType: { type: string; sessions: number; withCredits: number; creditsSum: number; attendance: number }[];
}

// SESSION_TYPES sabiti constants.ts'te tanımlı değil — CME tür şablonu için yerel sabit dizi
const CME_SESSION_TYPES = ["KEYNOTE", "TALK", "PANEL", "WORKSHOP", "POSTER_SESSION"] as const;

const cmeTime = (iso: string) => new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
const cmeTypeTone = (t: string): "violet" | "neutral" | "teal" => (t === "KEYNOTE" ? "violet" : t === "BREAK" ? "neutral" : "teal");

export function ScientificView() {
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const [decideTarget, setDecideTarget] = useState<SubmissionRow | null>(null);
  const [decision, setDecision] = useState("ACCEPT_ORAL");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: subs, error, reload, loading } = useApi<SubmissionRow[]>(() => listEntity<SubmissionRow>("submissions", { editionId: currentEditionId ?? undefined, limit: 300 }), [currentEditionId, refreshKey]);
  const { data: tracks } = useApi<{ id: string; name: string }[]>(() => listEntity("tracks", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);

  const byStatus = (s: string) => (subs ?? []).filter((x) => x.status === s).length;
  const overdue = (subs ?? []).flatMap((s) => s.reviewAssignments).filter((r) => r.status === "OVERDUE").length;

  const submitDecision = async () => {
    if (!decideTarget) return;
    setBusy(true);
    try {
      await apiSend("/api/decisions", "POST", { submissionId: decideTarget.id, decision, rationale, decidedBy: "Bilimsel Komite" });
      const statusMap: Record<string, string> = { ACCEPT_ORAL: "ACCEPTED", ACCEPT_POSTER: "ACCEPTED", ACCEPT_E_POSTER: "ACCEPTED", ACCEPT_PANEL: "ACCEPTED", REJECT: "REJECTED", REVISION_REQUIRED: "REVISION_REQUIRED", WAITLIST: "WAITLIST", WITHDRAWN: "WITHDRAWN" };
      await apiSend(`/api/submissions/${decideTarget.id}`, "PUT", { status: statusMap[decision] ?? decideTarget.status });
      toast({ title: "Karar kaydedildi", description: `${decideTarget.code} → ${decision}. Sunum havuzu adayı oluştu; otomatik program slotu OLUŞTURULMAZ.` });
      setDecideTarget(null); setRationale(""); reload(); bump();
    } catch (e) {
      toast({ title: "Karar kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Bilimsel Süreç" desc="Çağrı → bildiri → hakem → komite kararı; bilimsel karar ile programlama ayrı modüllerdedir (§28)" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Gönderilen" value={(subs ?? []).filter((s) => s.status !== "DRAFT").length} sub="taslak hariç" icon={<Icons.FileText className="size-4" />} />
        <KpiCard label="İncelemede" value={byStatus("UNDER_REVIEW")} sub={`geciken hakem: ${overdue}`} tone="amber" icon={<Icons.Hourglass className="size-4" />} />
        <KpiCard label="Kabul" value={byStatus("ACCEPTED")} sub="sunum havuzunda" tone="emerald" icon={<Icons.CircleCheck className="size-4" />} />
        <KpiCard label="Revizyon" value={byStatus("REVISION_REQUIRED")} sub="yazara geri döndü" tone="amber" />
        <KpiCard label="Ret/Çekilme" value={byStatus("REJECTED") + byStatus("WITHDRAWN")} tone="rose" />
      </div>

      {tracks && tracks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tracks.map((t) => <Chip key={t.id} tone="teal">{t.name}: {(subs ?? []).filter((s) => s.track?.name === t.name).length} bildiri</Chip>)}
        </div>
      )}

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (subs ?? []).length === 0 ? (
        <EmptyState title="Henüz bildiri gönderilmedi" desc="Çağrıyı ve son tarihi kontrol edin." />
      ) : (
        <div className="space-y-2">
          {(subs ?? []).map((s) => (
            <details key={s.id} className="rounded-xl border bg-card">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3.5 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
                <Chip tone={s.type === "POSTER" ? "violet" : "teal"}>{s.type}</Chip>
                {s.track && <span className="hidden text-xs text-muted-foreground md:inline">{s.track.name}</span>}
                <StatusBadge map={SUBMISSION_STATUS} value={s.status} />
                {s.fileStatus && <Chip tone={s.fileStatus === "APPROVED" ? "emerald" : "amber"}>dosya: {s.fileStatus}</Chip>}
              </summary>
              <div className="grid gap-4 border-t p-4 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-3">
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Yazarlar (sıra önemli)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {s.authorships.map((a) => (
                        <Chip key={a.id} tone={a.isPresenting ? "emerald" : "neutral"}>
                          {a.position}. {a.name}{a.organizationName ? ` — ${a.organizationName}` : ""}{a.isPresenting ? " ★" : ""}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  {s.abstract && <p className="text-xs leading-relaxed text-muted-foreground">{s.abstract}</p>}
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Hakem atamaları</p>
                    {s.reviewAssignments.length === 0 ? <p className="text-xs text-muted-foreground">atanmadı</p> : (
                      <div className="space-y-1">
                        {s.reviewAssignments.map((r) => (
                          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
                            <span>{r.reviewer ? `${r.reviewer.firstName} ${r.reviewer.lastName}` : "—"} {r.dueDate && <span className="text-muted-foreground">· son {fmtDate(r.dueDate)}</span>}</span>
                            <span className="flex items-center gap-1">
                              <Chip tone={r.status === "COMPLETED" ? "emerald" : r.status === "OVERDUE" ? "rose" : "amber"}>{r.status}</Chip>
                              {r.reviews[0]?.score != null && <Chip tone="teal">skor {r.reviews[0].score}/5</Chip>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Karar geçmişi (sürümlü)</p>
                  {s.decisions.length === 0 ? <p className="text-xs text-muted-foreground">karar bekleniyor</p> : s.decisions.map((d) => (
                    <div key={d.id} className="rounded-lg border p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{d.decision}</span>
                        <span className="text-muted-foreground">v{d.version} · {fmtDate(d.decidedAt)}</span>
                      </div>
                      {d.rationale && <p className="mt-1 text-muted-foreground">{d.rationale}</p>}
                    </div>
                  ))}
                  {["SUBMITTED", "UNDER_REVIEW", "REVISION_REQUIRED"].includes(s.status) && (
                    <Button size="sm" className="w-full" onClick={() => setDecideTarget(s)}>
                      <Icons.Gavel className="size-4" /> Komite Kararı Ver
                    </Button>
                  )}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}

      <Dialog open={Boolean(decideTarget)} onOpenChange={(o) => !o && setDecideTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Komite Kararı — {decideTarget?.code}</DialogTitle>
            <DialogDescription>{decideTarget?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Karar (canonical semantik kontrollü, etiket özgür)</Label>
              <Select value={decision} onValueChange={setDecision}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACCEPT_ORAL">Kabul — Sözlü</SelectItem>
                  <SelectItem value="ACCEPT_POSTER">Kabul — Poster</SelectItem>
                  <SelectItem value="ACCEPT_E_POSTER">Kabul — E-Poster</SelectItem>
                  <SelectItem value="ACCEPT_PANEL">Kabul — Panel</SelectItem>
                  <SelectItem value="REVISION_REQUIRED">Revizyon Gerekli</SelectItem>
                  <SelectItem value="WAITLIST">Yedek</SelectItem>
                  <SelectItem value="REJECT">Ret</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gerekçe (yazara gidecek metin önizlemesi)</Label>
              <Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Karar gerekçesi…" className="mt-1" />
            </div>
            <p className="rounded-lg bg-sky-50 p-2.5 text-xs text-sky-800">Kabul kararı otomatik program slotu oluşturmaz — program ekibi ayrıca yerleştirir.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideTarget(null)}>Vazgeç</Button>
            <Button onClick={submitDecision} disabled={busy || !rationale}>{busy ? "Kaydediliyor…" : "Kararı Kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProgramView() {
  const { currentEditionId, bump, refreshKey, editions } = useApp();
  const { toast } = useToast();
  const [dayFilter, setDayFilter] = useState("ALL");
  const [publishTarget, setPublishTarget] = useState<SessionRow | null>(null);
  const [busy, setBusy] = useState(false);

  // ── R9-c: içe aktarım durumu ──
  const [importOpen, setImportOpen] = useState(false);
  const [importKind, setImportKind] = useState<"SESSIONS" | "PARTICIPANTS">("SESSIONS");
  const [importText, setImportText] = useState("");
  const [createMissingPersons, setCreateMissingPersons] = useState(true);
  const [createMissingRooms, setCreateMissingRooms] = useState(true);
  const [dryRun, setDryRun] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);

  // ── R9-c: materyal durumu ──
  const [matTarget, setMatTarget] = useState<SessionRow | null>(null); // yeni ekleme hedefi
  const [editingMat, setEditingMat] = useState<MaterialRow | null>(null);
  const [matOpen, setMatOpen] = useState(false);
  const [matBusy, setMatBusy] = useState(false);
  const emptyMat = { type: "SLIDES", title: "", url: "", personId: "none", durationMin: "", status: "PENDING", notes: "" };
  const [matForm, setMatForm] = useState(emptyMat);

  // CME Kredi Defteri — yalnız edisyonun CME_CREDITS yeteneği açıksa görünür
  const edition = editions.find((e) => e.id === currentEditionId);
  const cmeEnabled = hasCapability(edition, "CME_CREDITS");
  const [creditInputs, setCreditInputs] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkDefaults, setBulkDefaults] = useState<Record<string, string>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const { data: sessions, error, reload, loading } = useApi<SessionRow[]>(() => listEntity<SessionRow>("sessions", { editionId: currentEditionId ?? undefined, limit: 200 }), [currentEditionId, refreshKey]);
  const { data: rooms } = useApi<{ id: string; name: string; capacity: number }[]>(() => listEntity("rooms", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);
  // ── R9-c: materyaller (edisyon geneli tek istek, oturuma göre gruplanır) + kişi seçenekleri ──
  const { data: materials, reload: reloadMaterials } = useApi<MaterialRow[]>(() =>
    currentEditionId ? listEntity<MaterialRow>("session-materials", { editionId: currentEditionId, limit: 300 }) : Promise.resolve([]),
    [currentEditionId, refreshKey]);
  const { data: importParts } = useApi<{ id: string; person: { id: string; firstName: string; lastName: string } }[]>(() =>
    currentEditionId ? listEntity("participations", { editionId: currentEditionId, limit: 100 }) : Promise.resolve([]),
    [currentEditionId, refreshKey]);
  const { data: cme, error: cmeError, reload: reloadCme, loading: cmeLoading } = useApi<CmeData | null>(() => {
    if (!currentEditionId || !cmeEnabled) return Promise.resolve(null);
    return apiGet<CmeData>("/api/cme?editionId=" + currentEditionId);
  }, [currentEditionId, refreshKey]);

  // dış veri reload'unda satır kredi girişlerini sunucu değeriyle senkronize et
  useEffect(() => {
    if (!cme) return;
    const next: Record<string, string> = {};
    for (const s of cme.sessions) next[s.id] = s.cmeCredits != null ? String(s.cmeCredits) : "";
    setCreditInputs(next);
  }, [cme]);

  const days = Array.from(new Set((sessions ?? []).map((s) => s.startTime.slice(0, 10)))).sort();
  const filtered = (sessions ?? []).filter((s) => dayFilter === "ALL" || s.startTime.slice(0, 10) === dayFilter);
  // çakışma denetimi: aynı salonda zaman üstüste
  const clashes = new Set<string>();
  for (let i = 0; i < filtered.length; i++) {
    for (let j = i + 1; j < filtered.length; j++) {
      const a = filtered[i], b = filtered[j];
      if (a.room?.id && a.room.id === b.room?.id && new Date(a.startTime) < new Date(b.endTime) && new Date(b.startTime) < new Date(a.endTime)) {
        clashes.add(a.id); clashes.add(b.id);
      }
    }
  }

  // toplu atama butonu: en az bir tür girişi doluysa aktif
  const bulkFilled = CME_SESSION_TYPES.some((t) => (bulkDefaults[t] ?? "").trim() !== "");

  const saveCredits = async (s: CmeSession) => {
    const raw = (creditInputs[s.id] ?? "").trim();
    if (raw === "") return;
    const credits = Number(raw);
    if (Number.isNaN(credits) || credits < 0 || credits > 99) {
      toast({ title: "Geçersiz kredi", description: "Kredi 0–99 arasında olmalı.", variant: "destructive" });
      return;
    }
    setSavingId(s.id);
    try {
      await apiSend("/api/cme", "POST", { action: "set-credits", sessionId: s.id, credits });
      toast({ title: `${credits} kredi atandı: ${s.title}` });
      reloadCme(); bump();
    } catch (e) {
      toast({ title: "Kredi atanamadı", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setSavingId(null); }
  };

  const applyBulk = async () => {
    if (!currentEditionId) return;
    const defaults: Record<string, number> = {};
    for (const t of CME_SESSION_TYPES) {
      const raw = (bulkDefaults[t] ?? "").trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isNaN(n) && n >= 0 && n <= 99) defaults[t] = n;
    }
    if (Object.keys(defaults).length === 0) return;
    setBulkBusy(true);
    try {
      const res = await apiSend<{ ok: boolean; updated: number }>("/api/cme", "POST", { action: "bulk-apply", editionId: currentEditionId, defaults });
      if (res.updated > 0) toast({ title: `${res.updated} oturuma kredi atandı`, description: "Yalnız kredisi olmayan oturumlar güncellendi." });
      else toast({ title: "Atanacak kredisiz oturum yok", description: "Seçilen türlere ait tüm oturumlar zaten kredili." });
      reloadCme(); bump();
    } catch (e) {
      toast({ title: "Toplu atama başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBulkBusy(false); }
  };

  const publish = async () => {
    if (!publishTarget) return;
    setBusy(true);
    try {
      await apiSend(`/api/sessions/${publishTarget.id}`, "PUT", { status: "PUBLISHED", isVisible: true });
      toast({ title: "Oturum yayınlandı", description: "Kişisel programlarda görünür; etkilenen konuşmacılar bilgilendirilir." });
      setPublishTarget(null); reload(); bump();
    } catch (e) {
      toast({ title: "Yayınlanamadı", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  // ── R9-c: içe aktarım — dryRun ile sına, raporu göster, onayla kaydet ──
  const openImport = () => { setImportReport(null); setImportText(""); setImportOpen(true); };
  const runImport = async (dry: boolean) => {
    if (!currentEditionId || !importText.trim()) return;
    setImportBusy(true);
    try {
      const res = await apiSend<ImportReport>("/api/program/import", "POST", {
        editionId: currentEditionId, kind: importKind, csvText: importText,
        createMissingPersons, createMissingRooms, dryRun: dry,
      });
      setImportReport(res);
      if (!dry) {
        toast({ title: "İçe aktarım kaydedildi", description: importKind === "SESSIONS" ? `${res.sessionsCreated} yeni · ${res.sessionsUpdated} güncellenen oturum` : `${res.personsMatched} eşleşen · ${res.personsCreated} yeni kişi` });
        reload(); reloadMaterials(); bump();
      }
    } catch (e) {
      toast({ title: "İçe aktarım başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setImportBusy(false); }
  };

  // ── R9-c: materyal CRUD ──
  const openMatNew = (s: SessionRow) => { setEditingMat(null); setMatTarget(s); setMatForm(emptyMat); setMatOpen(true); };
  const openMatEdit = (m: MaterialRow) => {
    setEditingMat(m); setMatTarget(null);
    setMatForm({ type: m.type, title: m.title, url: m.url ?? "", personId: m.personId ?? "none", durationMin: m.durationMin != null ? String(m.durationMin) : "", status: m.status, notes: m.notes ?? "" });
    setMatOpen(true);
  };
  const saveMat = async () => {
    if (!matForm.title.trim()) return;
    setMatBusy(true);
    try {
      const payload = {
        type: matForm.type, title: matForm.title.trim(), url: matForm.url || null,
        personId: matForm.personId === "none" ? null : matForm.personId,
        durationMin: matForm.type === "VIDEO" && matForm.durationMin ? Number(matForm.durationMin) : null,
        status: matForm.status, notes: matForm.notes || null,
      };
      if (editingMat) await apiSend(`/api/session-materials/${editingMat.id}`, "PUT", payload);
      else await apiSend("/api/session-materials", "POST", { sessionId: matTarget?.id, editionId: currentEditionId, ...payload });
      toast({ title: editingMat ? "Materyal güncellendi" : "Materyal eklendi", description: matForm.title });
      setMatOpen(false); reloadMaterials(); bump();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Materyal kaydedilemedi", variant: "destructive" });
    } finally { setMatBusy(false); }
  };
  const removeMat = async (m: MaterialRow) => {
    try {
      await apiSend(`/api/session-materials/${m.id}`, "DELETE");
      toast({ title: "Materyal silindi", description: m.title });
      reloadMaterials();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Silinemedi", variant: "destructive" });
    }
  };

  // oturum → materyal haritası (kart içinde alt liste için)
  const materialsBySession = new Map<string, MaterialRow[]>();
  for (const m of materials ?? []) {
    const list = materialsBySession.get(m.sessionId) ?? [];
    list.push(m);
    materialsBySession.set(m.sessionId, list);
  }
  // materyal kişi seçenekleri — katılımlardan benzersiz kişiler
  const personOptions = new Map<string, string>();
  for (const p of importParts ?? []) {
    if (p.person && !personOptions.has(p.person.id)) personOptions.set(p.person.id, `${p.person.firstName} ${p.person.lastName}`);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Program" desc="Salon, zaman, görevli — çakışmalı yayın engellenir; bilimsel kararı program modülü değiştirmez">
        <Button size="sm" variant="outline" onClick={openImport} disabled={!currentEditionId} aria-label="Program veya katılımcı listesi içe aktar">
          <Icons.FileUp className="size-4" /> İçe Aktar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { reload(); reloadCme(); }} aria-label="Yenile"><Icons.RefreshCw className="size-4" /></Button>
      </PageHeader>

      <Tabs defaultValue="sessions">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="sessions">Oturumlar</TabsTrigger>
          {cmeEnabled && <TabsTrigger value="cme"><Icons.GraduationCap className="size-4" /> CME Kredi</TabsTrigger>}
        </TabsList>

        <TabsContent value="sessions" className="mt-4 space-y-4">
          <Select value={dayFilter} onValueChange={setDayFilter}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tüm günler</SelectItem>
              {days.map((d) => <SelectItem key={d} value={d}>{fmtDate(d)}</SelectItem>)}
            </SelectContent>
          </Select>

          {clashes.size > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-800">
              <Icons.OctagonAlert className="mt-0.5 size-4 shrink-0" />
              Aynı salonda çakışan oturumlar var ({clashes.size}) — çakışmalı yayın engellenir veya yetkili gerekçeyle işaretler.
            </div>
          )}

          {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : filtered.length === 0 ? (
            <EmptyState title="Bu gün için oturum yok" desc="Oturum oluşturun veya başka gün seçin." />
          ) : (
            <div className="space-y-2.5">
              {filtered.map((s) => (
                <div key={s.id} className={cn("rounded-xl border bg-card p-4", clashes.has(s.id) && "border-rose-300")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold tabular-nums text-primary">
                      {new Date(s.startTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}–{new Date(s.endTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <p className="min-w-0 flex-1 truncate font-semibold">{s.title}</p>
                    <Chip tone={s.type === "KEYNOTE" ? "violet" : s.type === "BREAK" ? "neutral" : "teal"}>{s.type}</Chip>
                    {s.room && <Chip>{s.room.name}</Chip>}
                    <StatusBadge map={SESSION_STATUS} value={s.status} />
                    {clashes.has(s.id) && <Chip tone="rose">çakışma</Chip>}
                    {!s.isVisible && s.status === "PUBLISHED" && <Chip tone="amber">gizli</Chip>}
                  </div>
                  {s.submission && <p className="mt-1 text-xs text-muted-foreground">kaynak bildiri: {s.submission.code} — {s.submission.title}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.assignments.map((a) => {
                      const name = a.person ? `${a.person.firstName} ${a.person.lastName}` : a.participation ? `${a.participation.person.firstName} ${a.participation.person.lastName}` : "—";
                      return <Chip key={a.id} tone={a.status === "CONFIRMED" ? "emerald" : "amber"}>{label2(EVENT_ROLES, a.role)}: {name}</Chip>;
                    })}
                  </div>
                  {/* ── R9-c: oturum materyalleri alt listesi ── */}
                  {(materialsBySession.get(s.id)?.length ?? 0) > 0 && (
                    <div className="mt-3 rounded-lg border bg-muted/20 p-2.5">
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <Icons.Paperclip className="size-3.5" aria-hidden /> Materyaller
                        <span className="font-normal tabular-nums">({materialsBySession.get(s.id)!.length})</span>
                      </p>
                      <div className="space-y-1">
                        {materialsBySession.get(s.id)!.map((m) => (
                          <div key={m.id} className="group flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-card px-2 py-1.5 text-xs transition-colors hover:bg-teal-500/5">
                            <Chip tone="teal">{label(MATERIAL_TYPE, m.type)}</Chip>
                            <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                            {m.type === "VIDEO" && m.durationMin != null && <span className="tabular-nums text-muted-foreground">{m.durationMin} dk</span>}
                            {m.personId && personOptions.get(m.personId) && <span className="hidden text-muted-foreground sm:inline">{personOptions.get(m.personId)}</span>}
                            <StatusBadge map={MATERIAL_STATUS_LABEL} value={m.status} />
                            {m.url && (
                              <a href={m.url} target="_blank" rel="noreferrer" className="rounded p-0.5 text-teal-600 transition hover:text-teal-800" aria-label={`${m.title} bağlantısını aç`}>
                                <Icons.ExternalLink className="size-3.5" />
                              </a>
                            )}
                            <span className="flex items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
                              <button onClick={() => openMatEdit(m)} className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={`${m.title} materyalini düzenle`}>
                                <Icons.Pencil className="size-3" />
                              </button>
                              <button onClick={() => removeMat(m)} className="rounded p-1 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600" aria-label={`${m.title} materyalini sil`}>
                                <Icons.Trash2 className="size-3" />
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => openMatNew(s)} aria-label={`${s.title} oturumuna materyal ekle`}>
                      <Icons.Paperclip className="size-3.5" /> Materyal Ekle
                    </Button>
                  </div>
                  {s.status !== "PUBLISHED" && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => setPublishTarget(s)} disabled={clashes.has(s.id)}>
                      <Icons.Upload className="size-4" /> Yayınla
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {cmeEnabled && (
          <TabsContent value="cme" className="mt-4 space-y-4">
            {cmeLoading ? <Loading rows={5} /> : cmeError ? <ErrorState message={cmeError} onRetry={reloadCme} /> : !cme ? (
              <EmptyState title="CME verisi yok" desc="Veri yüklenemedi — yenile düğmesiyle tekrar deneyin." />
            ) : (
              <>
                {/* Üst KPI satırı */}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard label="Kredili Oturum" value={cme.summary.sessionsWithCredits} sub={`${cme.summary.sessionsTotal} oturum`} icon={<Icons.GraduationCap className="size-4" />} />
                  <KpiCard label="Kredi Potansiyeli" value={cme.summary.creditsPotential} sub="kredili oturumların toplamı" tone="violet" icon={<Icons.Sigma className="size-4" />} />
                  <KpiCard label="Kredi Kazanan" value={cme.summary.attendees} sub="katılımcı" tone="emerald" icon={<Icons.UserCheck className="size-4" />} />
                  <KpiCard label="Dağıtılan Kredi" value={cme.summary.creditsIssued} sub={`ort. ${cme.summary.avgCredits} kredi/kişi`} tone="amber" icon={<Icons.Award className="size-4" />} />
                </div>

                {/* Kapsam satırı + resmî rapor aksiyonları */}
                <div className="flex flex-wrap items-center gap-2 gap-y-2 rounded-xl border bg-card px-4 py-3 shadow-sm sm:gap-3">
                  <span className="text-xs font-medium text-muted-foreground">Kapsam</span>
                  <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded bg-muted">
                    <div className="h-full rounded bg-teal-500 transition-all duration-300" style={{ width: `${cme.summary.coveragePercent}%` }} />
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{`Oturumların %${cme.summary.coveragePercent}'i kredili`}</span>
                  <Button size="sm" variant="outline" className="ml-auto h-8 shrink-0" onClick={() => setReportOpen(true)} disabled={!currentEditionId}>
                    <Icons.FileBadge className="size-3.5" /> Resmî Rapor
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 shrink-0" onClick={() => window.open(`/api/cme/report?editionId=${encodeURIComponent(currentEditionId ?? "")}&format=csv`, "_blank")}>
                    <Icons.Download className="size-3.5" /> CSV
                  </Button>
                </div>

                {/* Oturum kredi editörü */}
                <SectionCard title="Oturum Kredileri" desc="Oturuma atanacak CME kredisini girin — oturum taraması gerçekleştiğinde kişiye işlenir">
                  <div className="maven-scroll max-h-96 overflow-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="sticky top-0 z-10 bg-card text-left text-muted-foreground">
                        <tr className="border-b">
                          <th className="px-3 py-2 text-xs font-medium">Oturum</th>
                          <th className="px-3 py-2 text-xs font-medium">Saat</th>
                          <th className="px-3 py-2 text-xs font-medium">Katılım</th>
                          <th className="px-3 py-2 text-right text-xs font-medium">Kredi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cme.sessions.map((s) => (
                          <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-3 py-2.5">
                              <p className="max-w-64 truncate font-semibold">{s.title}</p>
                              <div className="mt-1"><Chip tone={cmeTypeTone(s.type)}>{s.type}</Chip></div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground">{cmeTime(s.startTime)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{s.attendanceCount} kişi</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center justify-end gap-1.5">
                                <Input
                                  type="number" inputMode="decimal" min={0} max={99} step={0.5}
                                  value={creditInputs[s.id] ?? ""} placeholder="—"
                                  onChange={(e) => setCreditInputs((prev) => ({ ...prev, [s.id]: e.target.value }))}
                                  className="h-8 w-20" aria-label={`${s.title} — CME kredisi`}
                                />
                                <Button
                                  size="sm" variant="outline" className="h-8"
                                  disabled={savingId !== null || (creditInputs[s.id] ?? "").trim() === ""}
                                  onClick={() => saveCredits(s)}
                                >
                                  {savingId === s.id ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Check className="size-3.5" />}
                                  Kaydet
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>

                {/* Tür bazlı toplu atama */}
                <SectionCard title="Tür Bazlı Toplu Ata" desc="Tür şablonunu oturumlara uygula">
                  <div className="flex flex-wrap items-end gap-3">
                    {CME_SESSION_TYPES.map((t) => (
                      <div key={t} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t}</Label>
                        <Input
                          type="number" min={0} max={99} step={0.5} placeholder="0"
                          value={bulkDefaults[t] ?? ""}
                          onChange={(e) => setBulkDefaults((prev) => ({ ...prev, [t]: e.target.value }))}
                          className="h-8 w-20" aria-label={`${t} oturumları için varsayılan kredi`}
                        />
                      </div>
                    ))}
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Yalnız kredisiz oturumlara uygulanır</span>
                      <Button size="sm" onClick={applyBulk} disabled={bulkBusy || !bulkFilled}>
                        {bulkBusy && <Icons.Loader2 className="size-4 animate-spin" />}
                        Boş Kredilere Uygula
                      </Button>
                    </div>
                  </div>
                </SectionCard>

                {/* Kişi bazlı kredi defteri */}
                <SectionCard title="Kredi Defteri" desc="Kişi bazlı CME birikimi — krediye göre sıralı">
                  {cme.ledger.length === 0 ? (
                    <EmptyState title="Defter boş" desc="Oturum taraması ve kredi bekleniyor" />
                  ) : (
                    <div className="maven-scroll max-h-96 overflow-auto">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead className="sticky top-0 z-10 bg-card text-left text-muted-foreground">
                          <tr className="border-b">
                            <th className="px-3 py-2 text-xs font-medium">Kişi</th>
                            <th className="px-3 py-2 text-xs font-medium">Roller</th>
                            <th className="px-3 py-2 text-xs font-medium">Katılım</th>
                            <th className="px-3 py-2 text-right text-xs font-medium">Kredi</th>
                            <th className="px-3 py-2 text-xs font-medium">İlerleme</th>
                            <th className="px-3 py-2 text-xs font-medium">Son Etkinlik</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cme.ledger.map((l) => (
                            <tr key={l.participationId} className={cn("border-b last:border-0", l.attendedCount === 0 && "opacity-60")}>
                              <td className="px-3 py-2.5">
                                <p className="font-semibold">{l.person.fullName}</p>
                                {(l.person.company || l.person.title) && (
                                  <p className="max-w-48 truncate text-xs text-muted-foreground">{[l.person.company, l.person.title].filter(Boolean).join(" · ")}</p>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex flex-wrap gap-1">
                                  {l.roles.slice(0, 2).map((r) => <Chip key={r} tone="teal">{label(EVENT_ROLES, r)}</Chip>)}
                                  {l.roles.length > 2 && <Chip tone="neutral">+{l.roles.length - 2}</Chip>}
                                  {l.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{l.attendedCount}/{l.eligibleCount} oturum</td>
                              <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{l.credits}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-16 overflow-hidden rounded bg-muted">
                                    <div className="h-full rounded bg-teal-500" style={{ width: `${l.percent}%` }} />
                                  </div>
                                  <span className="text-xs tabular-nums text-muted-foreground">%{l.percent}</span>
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{l.lastActivity ? fmtDateTime(l.lastActivity) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              </>
            )}
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={Boolean(publishTarget)} onOpenChange={(o) => !o && setPublishTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Oturumu Yayınla</DialogTitle><DialogDescription>{publishTarget?.title}</DialogDescription></DialogHeader>
          <p className="text-xs text-muted-foreground">Yayın düğmesi etkilenen konuşmacı ve katılımcı sayısını gösterir; kişisel programlarda görünür olur.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishTarget(null)}>Vazgeç</Button>
            <Button onClick={publish} disabled={busy}>{busy ? "Yayınlanıyor…" : "Yayınla"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reportOpen && currentEditionId && (
        <CmeReportOverlay editionId={currentEditionId} onClose={() => setReportOpen(false)} />
      )}

      {/* ── R9-c: İçe Aktar diyaloğu — CSV/TSV yapıştır, sına, kaydet ── */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) { setImportOpen(false); setImportReport(null); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>İçe Aktar — Oturum Programı / Katılımcı Listesi</DialogTitle>
            <DialogDescription>Excel&apos;den kopyala-yapıştır (TSV) veya noktalı virgül ayraçlı CSV — başlıklar Türkçe veya İngilizce olabilir.</DialogDescription>
          </DialogHeader>

          <RadioGroup
            value={importKind}
            onValueChange={(v) => { setImportKind(v as "SESSIONS" | "PARTICIPANTS"); setImportReport(null); }}
            className="grid gap-2 sm:grid-cols-2"
          >
            <Label htmlFor="imp-sessions" className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition", importKind === "SESSIONS" ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40")}>
              <RadioGroupItem value="SESSIONS" id="imp-sessions" className="mt-0.5" />
              <span>
                <span className="block text-sm font-semibold">Oturum Programı</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">Oturum adı, saat, salon, konuşmacı eşleştirme — salon yoksa oluşturulur</span>
              </span>
            </Label>
            <Label htmlFor="imp-parts" className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition", importKind === "PARTICIPANTS" ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40")}>
              <RadioGroupItem value="PARTICIPANTS" id="imp-parts" className="mt-0.5" />
              <span>
                <span className="block text-sm font-semibold">Katılımcı Listesi</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">Ad soyad + e-posta eşleştirme — katılım ve kaynak: İçe Aktarma</span>
              </span>
            </Label>
          </RadioGroup>

          <div>
            <Label>Veri (başlık + en az bir satır)</Label>
            <Textarea
              className="mt-1 min-h-40 font-mono text-xs"
              rows={8}
              value={importText}
              onChange={(e) => { setImportText(e.target.value); setImportReport(null); }}
              placeholder={importKind === "SESSIONS"
                ? "Oturum Adı;Başlangıç;Bitiş;Salon;Konuşmacı;E-posta;Rol\nAçılış Konuşması;14.05.2026 09:00;14.05.2026 09:45;Ana Salon;Prof. Dr. Ayşe Yılmaz;ayse@universite.edu.tr;SPEAKER\nPanel: Şehirleşme;14.05.2026 10:00;14.05.2026 11:30;Salon B;..."
                : "Ad Soyad;E-posta;Kurum;Unvan\nAyşe Yılmaz;ayse@ornek.com;Yılmaz A.Ş.;Direktör\nMehmet Demir;mehmet@ornek.com;Demir Ltd;Müdür"}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {importKind === "SESSIONS"
                ? "Beklenen başlıklar: Oturum Adı | Başlangıç | Bitiş | Salon | Konuşmacı | E-posta | Rol"
                : "Beklenen başlıklar: Ad Soyad | E-posta | Kurum | Unvan"}
              {" "}— saat biçimi: 14.05.2026 09:00 veya ISO.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="imp-cmp" checked={createMissingPersons} onCheckedChange={(v) => setCreateMissingPersons(v === true)} />
              <Label htmlFor="imp-cmp" className="cursor-pointer text-sm font-normal">Eşleşmeyen için yeni kişi oluştur</Label>
            </div>
            {importKind === "SESSIONS" && (
              <div className="flex items-center gap-2">
                <Checkbox id="imp-cmr" checked={createMissingRooms} onCheckedChange={(v) => setCreateMissingRooms(v === true)} />
                <Label htmlFor="imp-cmr" className="cursor-pointer text-sm font-normal">Eksik salonu oluştur</Label>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox id="imp-dry" checked={dryRun} onCheckedChange={(v) => { setDryRun(v === true); setImportReport(null); }} />
              <Label htmlFor="imp-dry" className="cursor-pointer text-sm font-normal">Önce sına — kaydetmez</Label>
            </div>
          </div>

          {/* ── sonuç raporu ── */}
          {importBusy && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Icons.Loader2 className="size-3.5 animate-spin" /> Satırlar işleniyor, kişiler eşleştiriliyor…</p>
          )}
          {importReport && !importBusy && (
            <div className="maven-stagger-item space-y-3 rounded-xl border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {importKind === "SESSIONS" ? (
                  <>
                    <Chip tone="emerald">{importReport.sessionsCreated} oturum oluşturuldu</Chip>
                    {importReport.sessionsUpdated > 0 && <Chip tone="teal">{importReport.sessionsUpdated} güncellendi</Chip>}
                    {importReport.roomsCreated > 0 && <Chip tone="violet">{importReport.roomsCreated} salon oluşturuldu</Chip>}
                    <Chip tone="teal">{importReport.personsMatched} kişi eşleşti</Chip>
                    {importReport.personsCreated > 0 && <Chip tone="emerald">{importReport.personsCreated} yeni kişi</Chip>}
                    {importReport.assignmentsCreated > 0 && <Chip tone="neutral">{importReport.assignmentsCreated} atama</Chip>}
                    {importReport.personsUnmatched > 0 && <Chip tone="rose">{importReport.personsUnmatched} eşleşmeyen</Chip>}
                  </>
                ) : (
                  <>
                    <Chip tone="teal">{importReport.personsMatched} kişi eşleşti</Chip>
                    <Chip tone="emerald">{importReport.personsCreated} yeni kişi</Chip>
                    <Chip tone="rose">{importReport.personsUnmatched} eşleşmeyen</Chip>
                    {importReport.participationsCreated > 0 && <Chip tone="violet">{importReport.participationsCreated} katılım oluşturuldu</Chip>}
                  </>
                )}
                {importReport.dryRun && <Chip tone="amber">deneme — kaydedilmedi</Chip>}
                <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{importReport.totalRows} satır</span>
              </div>

              {importReport.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-rose-700">Hatalar</p>
                  {importReport.errors.map((e) => (
                    <p key={`${e.row}-${e.message}`} className="flex items-start gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                      <Icons.TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                      <span>Satır <span className="tabular-nums font-semibold">{e.row}</span> — {e.message}</span>
                    </p>
                  ))}
                </div>
              )}

              {importReport.matchDetails.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">Kişi eşleştirme dökümü</p>
                  {/* mobilde kart, sm+ üstünde tablo */}
                  <div className="maven-scroll hidden max-h-52 overflow-y-auto rounded-lg border bg-card sm:block">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                        <tr className="border-b">
                          <th className="px-2.5 py-1.5 font-medium">Satır</th>
                          <th className="px-2.5 py-1.5 font-medium">Ad Soyad</th>
                          <th className="px-2.5 py-1.5 font-medium">E-posta</th>
                          <th className="px-2.5 py-1.5 font-medium">Sonuç</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importReport.matchDetails.map((d) => (
                          <tr key={`${d.row}-${d.name ?? d.email ?? ""}`} className="border-b last:border-0">
                            <td className="px-2.5 py-1.5 tabular-nums text-muted-foreground">{d.row}</td>
                            <td className="max-w-40 truncate px-2.5 py-1.5 font-medium">{d.name ?? "—"}</td>
                            <td className="max-w-44 truncate px-2.5 py-1.5 text-muted-foreground">{d.email ?? "—"}</td>
                            <td className="px-2.5 py-1.5"><Chip tone={importTone(d.result)}>{d.result}</Chip></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="maven-scroll max-h-52 space-y-1.5 overflow-y-auto sm:hidden">
                    {importReport.matchDetails.map((d) => (
                      <div key={`${d.row}-${d.name ?? d.email ?? ""}`} className="rounded-lg border bg-card p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold">{d.name ?? "—"}</span>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">sr. {d.row}</span>
                        </div>
                        {d.email && <p className="truncate text-[10px] text-muted-foreground">{d.email}</p>}
                        <div className="mt-1"><Chip tone={importTone(d.result)}>{d.result}</Chip></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* dryRun temizse kaydetme onayı */}
              {importReport.dryRun && (importReport.errors ?? []).length === 0 && importReport.totalRows > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
                  <p className="text-xs text-teal-800">Sınama temiz görünüyor — kaydedilmeye hazır.</p>
                  <Button size="sm" onClick={() => void runImport(false)} disabled={importBusy}>
                    <Icons.Check className="size-4" /> Şimdi kaydet
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportReport(null); }}>Kapat</Button>
            <Button onClick={() => void runImport(dryRun)} disabled={importBusy || !importText.trim() || !currentEditionId}>
              {importBusy ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.FileUp className="size-4" />}
              {dryRun ? "Sına (kaydetmez)" : "İçe Aktar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── R9-c: Materyal ekle/düzenle diyaloğu ── */}
      <Dialog open={matOpen} onOpenChange={setMatOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMat ? "Materyali Düzenle" : "Yeni Materyal"}</DialogTitle>
            <DialogDescription>{editingMat ? editingMat.title : matTarget?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Tür</Label>
              <Select value={matForm.type} onValueChange={(v) => setMatForm({ ...matForm, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MATERIAL_TYPE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Durum</Label>
              <Select value={matForm.status} onValueChange={(v) => setMatForm({ ...matForm, status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Bekliyor</SelectItem>
                  <SelectItem value="READY">Hazır</SelectItem>
                  <SelectItem value="MISSING">Eksik</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>Başlık *</Label><Input className="mt-1" value={matForm.title} onChange={(e) => setMatForm({ ...matForm, title: e.target.value })} placeholder="Örn. Açılış sunumu v2" /></div>
            <div className="sm:col-span-2"><Label>Bağlantı (URL)</Label><Input className="mt-1" type="url" value={matForm.url} onChange={(e) => setMatForm({ ...matForm, url: e.target.value })} placeholder="https://…" /></div>
            <div>
              <Label>Kişisi (opsiyonel)</Label>
              <Select value={matForm.personId} onValueChange={(v) => setMatForm({ ...matForm, personId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Yok" /></SelectTrigger>
                <SelectContent className="maven-scroll max-h-64">
                  <SelectItem value="none">— Sahip yok —</SelectItem>
                  {Array.from(personOptions.entries()).map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {matForm.type === "VIDEO" && (
              <div>
                <Label>Süre (dk)</Label>
                <Input className="mt-1 tabular-nums" type="number" min={0} max={999} value={matForm.durationMin} onChange={(e) => setMatForm({ ...matForm, durationMin: e.target.value })} placeholder="Örn. 24" />
              </div>
            )}
            <div className="sm:col-span-2"><Label>Notlar</Label><Textarea className="mt-1" rows={2} value={matForm.notes} onChange={(e) => setMatForm({ ...matForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatOpen(false)}>Vazgeç</Button>
            <Button onClick={saveMat} disabled={matBusy || !matForm.title.trim()}>{matBusy ? "Kaydediliyor…" : "Kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function label2(map: Record<string, string>, key: string) {
  return map[key] ?? key;
}
