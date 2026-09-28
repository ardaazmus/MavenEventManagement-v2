"use client";
// Bilimsel — çağrı, bildiri, hakem, karar (kabul ≠ otomatik program slotu, Kimlik kuralı 6)
// Program — oturum, salon, görevler, yayın durumu + CME kredi defteri (§08, CME_CREDITS yeteneği)
import { useMemo, useRef, useState } from "react";
import { listEntity, listEntityPaged, apiSend, apiGet } from "@/lib/client";
import { useApp, hasCapability } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { SUBMISSION_STATUS, SESSION_STATUS, fmtDateTime, fmtDate, EVENT_ROLES, MATERIAL_TYPE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLang, t, tLabel } from "@/lib/i18n";
import { CmeReportOverlay } from "../cme-report";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { TimetableGrid } from "@/components/maven/scientific/timetable-grid";
import { PeerReviewModal } from "@/components/maven/scientific/peer-review-modal";

interface SubmissionRow {
  id: string; code: string; title: string; abstract?: string | null; type: string; status: string; presentingAuthorName?: string | null; keywords?: string | null; fileStatus?: string | null; submittedAt?: string | null;
  trackId?: string | null; submitterId?: string | null; fileUrl?: string | null; posterNo?: string | null;
  track?: { name: string } | null;
  authorships: { id: string; name: string; organizationName?: string | null; isPresenting: boolean; position: number }[];
  reviewAssignments: { id: string; status: string; dueDate?: string | null; reviewer?: { firstName: string; lastName: string } | null; reviews: { id: string; score?: number | null; recommendation?: string | null; comment?: string | null }[] }[];
  decisions: { id: string; decision: string; rationale?: string | null; decidedBy?: string | null; decidedAt: string; version: number }[];
}
interface SessionRow {
  id: string; title: string; description?: string | null; type: string; status: string; startTime: string; endTime: string; capacity?: number | null; accessRule?: string | null; isVisible: boolean;
  roomId?: string | null; trackId?: string | null; submissionId?: string | null; cmeCredits?: number | null;
  room?: { id: string; name: string; capacity: number } | null;
  track?: { name: string } | null;
  submission?: { code: string; title: string } | null;
  assignments: { id: string; role: string; status: string; person?: { firstName: string; lastName: string } | null; participation?: { person: { firstName: string; lastName: string } } | null }[];
}
interface PersonRow { id: string; firstName: string; lastName: string; company?: string | null }

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

// ── R10-b: manuel oturum/bildiri girişi sabitleri — import akışıyla tutarlı ─
const SESSION_TYPES: Record<string, string> = { KEYNOTE: "Ana Konuşma", TALK: "Sunum", PANEL: "Panel", WORKSHOP: "Atölye", BREAK: "Ara", NETWORKING: "Ağ Oluşturma", POSTER_SESSION: "Poster Oturumu" };
const SESSION_ACCESS: Record<string, string> = { OPEN: "scientific.sessAccessOpen", REGISTRATION_REQUIRED: "scientific.sessAccessRegistrationRequired", SCAN: "scientific.sessAccessScan" }; // F9-R-d: sözlük anahtarları (t() kullanım yerinde)
const SUBMISSION_TYPES: Record<string, string> = { ORAL: "Sözlü", POSTER: "Poster", E_POSTER: "E-Poster", PANEL: "Panel", WORKSHOP: "Atölye" };
const FILE_STATUS_OPTIONS: Record<string, string> = { MISSING: "Dosya Yok", FORMAT_ISSUE: "Biçim Hatalı", AV_PENDING: "AV Bekliyor", APPROVED: "Onaylı" };
const ASSIGN_ROLES = ["SPEAKER", "MODERATOR", "SESSION_CHAIR", "PANELIST"] as const; // §29 + program import akışıyla aynı küme
const MAX_FILE_BYTES = 600 * 1024; // Medya Arşivi gömme tavanı

// ISO → datetime-local girdi değeri (tarayıcı yerel saati)
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// dosya → dataURL (boyut sınırı aşılırsa null)
const fileToDataUrl = (file: File, maxBytes: number): Promise<string | null> =>
  new Promise((resolve) => {
    if (file.size > maxBytes) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
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
  useLang(); // dil değişiminde yeniden render
  // Faz E: sabit enum map'lerini tLabel ile çevir (status sözlüğü köprüsü)
  const subStatusMap = Object.fromEntries(Object.entries(SUBMISSION_STATUS).map(([k]) => [k, tLabel(SUBMISSION_STATUS, k)]));
  const subTypeMap = Object.fromEntries(Object.entries(SUBMISSION_TYPES).map(([k]) => [k, tLabel(SUBMISSION_TYPES, k)]));
  const fileStatusMap = Object.fromEntries(Object.entries(FILE_STATUS_OPTIONS).map(([k]) => [k, tLabel(FILE_STATUS_OPTIONS, k)]));
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const [decideTarget, setDecideTarget] = useState<SubmissionRow | null>(null);
  const [decision, setDecision] = useState("ACCEPT_ORAL");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<SubmissionRow | null>(null);

  // ── R10-b: bildiri ayrıntılı giriş/düzenleme ──
  const [subOpen, setSubOpen] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [editingSub, setEditingSub] = useState<SubmissionRow | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const emptySub = { title: "", abstract: "", type: "ORAL", keywords: "", presentingAuthorName: "", status: "SUBMITTED", trackId: "none", fileUrl: "", posterNo: "", fileStatus: "MISSING", submittedAt: "" };
  const [subForm, setSubForm] = useState(emptySub);

  // TASK-A F6: bildiriler imleçli load-more — 300 satırlık sessiz kesme kaldırıldı
  const { data: subsPaged, error, reload, loading, more: subMore } = useApi<{ items: SubmissionRow[]; nextCursor?: string | null }>(
    (cursor?: string) => listEntityPaged<SubmissionRow>("submissions", { editionId: currentEditionId ?? undefined, limit: 200 }, cursor),
    [currentEditionId, refreshKey],
    { append: true },
  );
  const subs = useMemo(() => subsPaged?.items ?? [], [subsPaged]);
  const { data: tracks } = useApi<{ id: string; name: string }[]>(() => listEntity("tracks", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);

  const byStatus = (s: string) => subs.filter((x) => x.status === s).length;
  const overdue = subs.flatMap((s) => s.reviewAssignments).filter((r) => r.status === "OVERDUE").length;

  const submitDecision = async () => {
    if (!decideTarget) return;
    setBusy(true);
    try {
      await apiSend("/api/decisions", "POST", { submissionId: decideTarget.id, decision, rationale, decidedBy: "Bilimsel Komite" });
      const statusMap: Record<string, string> = { ACCEPT_ORAL: "ACCEPTED", ACCEPT_POSTER: "ACCEPTED", ACCEPT_E_POSTER: "ACCEPTED", ACCEPT_PANEL: "ACCEPTED", REJECT: "REJECTED", REVISION_REQUIRED: "REVISION_REQUIRED", WAITLIST: "WAITLIST", WITHDRAWN: "WITHDRAWN" };
      await apiSend(`/api/submissions/${decideTarget.id}`, "PUT", { status: statusMap[decision] ?? decideTarget.status });
      toast({ title: t("scientific.decisionSaved"), description: t("scientific.decisionSavedDesc", { code: decideTarget.code, decision }) });
      setDecideTarget(null); setRationale(""); reload(); bump();
    } catch (e) {
      toast({ title: t("scientific.decisionSaveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setBusy(false); }
  };

  // ── R10-b: bildiri ekle/düzenle + hızlı durum değişimi ──
  const openSubNew = () => { setEditingSub(null); setSubForm(emptySub); setSubOpen(true); };
  const openSubEdit = (s: SubmissionRow) => {
    setEditingSub(s);
    setSubForm({
      title: s.title, abstract: s.abstract ?? "", type: s.type, keywords: s.keywords ?? "",
      presentingAuthorName: s.presentingAuthorName ?? "", status: s.status,
      trackId: s.trackId ?? "none", fileUrl: s.fileUrl ?? "", posterNo: s.posterNo ?? "",
      fileStatus: s.fileStatus ?? "MISSING", submittedAt: s.submittedAt ? toLocalInput(s.submittedAt) : "",
    });
    setSubOpen(true);
  };
  const changeStatus = async (s: SubmissionRow, status: string) => {
    if (status === s.status || statusBusyId) return;
    setStatusBusyId(s.id);
    try {
      await apiSend(`/api/submissions/${s.id}`, "PUT", { status });
      toast({ title: t("scientific.submissionStatusUpdated"), description: t("scientific.submissionStatusUpdatedDesc", { code: s.code, status: tLabel(SUBMISSION_STATUS, status) }) });
      reload(); bump();
    } catch (e) {
      toast({ title: t("scientific.statusUpdateFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setStatusBusyId(null); }
  };
  const saveSub = async () => {
    if (!subForm.title.trim() || !currentEditionId) return;
    setSubBusy(true);
    try {
      const payload = {
        title: subForm.title.trim(), abstract: subForm.abstract || null,
        type: subForm.type, keywords: subForm.keywords || null,
        presentingAuthorName: subForm.presentingAuthorName || null,
        status: subForm.status,
        trackId: subForm.trackId === "none" ? null : subForm.trackId,
        fileUrl: subForm.fileUrl || null, posterNo: subForm.posterNo || null,
        fileStatus: subForm.fileStatus || null,
        submittedAt: subForm.submittedAt ? new Date(subForm.submittedAt).toISOString() : null,
      };
      if (editingSub) await apiSend(`/api/submissions/${editingSub.id}`, "PUT", payload);
      else await apiSend("/api/submissions", "POST", { editionId: currentEditionId, ...payload, code: `SUB-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 9)}` });
      toast({ title: editingSub ? t("scientific.submissionUpdated") : t("scientific.submissionSaved"), description: subForm.title.trim() });
      setSubOpen(false); reload(); bump();
    } catch (e) {
      toast({ title: t("scientific.submissionSaveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setSubBusy(false); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t("scientific.title")} desc={t("scientific.desc")}>
        <Button size="sm" onClick={openSubNew} disabled={!currentEditionId} aria-label={t("scientific.addSubmissionAria")}>
          <Icons.FilePlus2 className="size-4" /> {t("scientific.addSubmission")}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label={t("scientific.kpiSubmitted")} value={subs.filter((s) => s.status !== "DRAFT").length} sub={t("scientific.kpiSubmittedSub")} icon={<Icons.FileText className="size-4" />} />
        <KpiCard label={t("scientific.kpiInReview")} value={byStatus("UNDER_REVIEW")} sub={t("scientific.kpiInReviewSub", { n: overdue })} tone="amber" icon={<Icons.Hourglass className="size-4" />} />
        <KpiCard label={t("scientific.kpiAccepted")} value={byStatus("ACCEPTED")} sub={t("scientific.kpiAcceptedSub")} tone="emerald" icon={<Icons.CircleCheck className="size-4" />} />
        <KpiCard label={t("scientific.kpiRevision")} value={byStatus("REVISION_REQUIRED")} sub={t("scientific.kpiRevisionSub")} tone="amber" />
        <KpiCard label={t("scientific.kpiRejected")} value={byStatus("REJECTED") + byStatus("WITHDRAWN")} tone="rose" />
      </div>

      {tracks && tracks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tracks.map((trk) => <Chip key={trk.id} tone="teal">{t("scientific.trackChip", { name: trk.name, n: subs.filter((s) => s.track?.name === trk.name).length })}</Chip>)}
        </div>
      )}

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : subs.length === 0 ? (
        <EmptyState title={t("scientific.emptyTitle")} desc={t("scientific.emptyDesc")} />
      ) : (
        <div className="space-y-2">
          {subs.map((s) => (
            <details key={s.id} className="rounded-xl border bg-card">
              <summary
                className="flex cursor-pointer flex-wrap items-center gap-2 p-3.5 text-sm"
                onDoubleClick={() => openSubEdit(s)}
                title={t("scientific.doubleClickEdit")}
              >
                <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
                <Chip tone={s.type === "POSTER" ? "violet" : "teal"}>{s.type}</Chip>
                {s.track && <span className="hidden text-xs text-muted-foreground md:inline">{s.track.name}</span>}
                <StatusBadge map={subStatusMap} value={s.status} />
                {s.fileStatus && <Chip tone={s.fileStatus === "APPROVED" ? "emerald" : "amber"}>{t("scientific.fileChip", { status: s.fileStatus })}</Chip>}
              </summary>
              {/* R10-b: hızlı durum değişimi — yalnız status alanına PUT */}
              <div className="flex flex-wrap items-center gap-1.5 border-t px-4 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("scientific.quickStatus")}</span>
                {Object.entries(subStatusMap).map(([k, v]) => (
                  <button
                    key={k} type="button" disabled={statusBusyId === s.id}
                    onClick={() => void changeStatus(s, k)}
                    aria-label={t("scientific.quickStatusAria", { code: s.code, status: v })}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] transition",
                      s.status === k ? "border-primary bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      statusBusyId === s.id && "opacity-50",
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 border-t p-4 lg:grid-cols-3">
                <div className="min-w-0 lg:col-span-2 space-y-3">
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("scientific.authorsLabel")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {s.authorships.map((a) => (
                        <Chip key={a.id} tone={a.isPresenting ? "emerald" : "neutral"}>
                          {a.position}. {a.name}{a.organizationName ? ` — ${a.organizationName}` : ""}{a.isPresenting ? " ★" : ""}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  {s.abstract && <p className="text-xs leading-relaxed text-muted-foreground">{s.abstract}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    {s.presentingAuthorName && <span>{t("scientific.presenting")} <span className="font-medium text-foreground">{s.presentingAuthorName}</span></span>}
                    {s.keywords && <span className="min-w-0">{t("scientific.keywordsPrefix")} <span className="break-words">{s.keywords}</span></span>}
                    {s.posterNo && <span>{t("scientific.posterNo", { no: s.posterNo })}</span>}
                    {s.submittedAt && <span>{t("scientific.submittedAt", { date: fmtDateTime(s.submittedAt) })}</span>}
                    {s.fileUrl && (
                      <a href={s.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-600 transition hover:text-teal-800" aria-label={t("scientific.openFileAria")}>
                        <Icons.FileDown className="size-3" /> {t("scientific.fileLink")}
                      </a>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("scientific.reviewAssignments")}</p>
                    {s.reviewAssignments.length === 0 ? <p className="text-xs text-muted-foreground">{t("scientific.notAssigned")}</p> : (
                      <div className="space-y-1">
                        {s.reviewAssignments.map((r) => (
                          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
                            <span>{r.reviewer ? `${r.reviewer.firstName} ${r.reviewer.lastName}` : "—"} {r.dueDate && <span className="text-muted-foreground">{t("scientific.reviewDue", { date: fmtDate(r.dueDate) })}</span>}</span>
                            <span className="flex items-center gap-1">
                              <Chip tone={r.status === "COMPLETED" ? "emerald" : r.status === "OVERDUE" ? "rose" : "amber"}>{r.status}</Chip>
                              {r.reviews[0]?.score != null && <Chip tone="teal">{t("scientific.score", { score: r.reviews[0].score })}</Chip>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{t("scientific.decisionHistory")}</p>
                  {s.decisions.length === 0 ? <p className="text-xs text-muted-foreground">{t("scientific.awaitingDecision")}</p> : s.decisions.map((d) => (
                    <div key={d.id} className="rounded-lg border p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{d.decision}</span>
                        <span className="text-muted-foreground">{t("scientific.decisionVersion", { version: d.version, date: fmtDate(d.decidedAt) })}</span>
                      </div>
                      {d.rationale && <p className="mt-1 text-muted-foreground">{d.rationale}</p>}
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="w-full" onClick={() => openSubEdit(s)} aria-label={t("scientific.editSubmissionAria", { title: s.title })}>
                    <Icons.Pencil className="size-4" /> {t("scientific.editSubmission")}
                  </Button>
                  <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setReviewTarget(s)}>
                    <Icons.Scale className="size-4 text-primary" /> Hakem Değerlendirmesi & Rubrik
                  </Button>
                  {["SUBMITTED", "UNDER_REVIEW", "REVISION_REQUIRED"].includes(s.status) && (
                    <Button size="sm" className="w-full" onClick={() => setDecideTarget(s)}>
                      <Icons.Gavel className="size-4" /> {t("scientific.makeDecision")}
                    </Button>
                  )}
                </div>
              </div>
            </details>
          ))}
          {/* TASK-A F6: kesintisiz yükleme */}
          {subMore?.hasMore && (
            <div className="flex items-center justify-center pt-1">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={subMore.loading} onClick={subMore.next}>
                {subMore.loading ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.ChevronsDown className="size-3.5" />}
                {t("scientific.loadMore")}
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={Boolean(decideTarget)} onOpenChange={(o) => !o && setDecideTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("scientific.decisionDialogTitle", { code: decideTarget?.code ?? "" })}</DialogTitle>
            <DialogDescription>{decideTarget?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("scientific.decisionLabel")}</Label>
              <Select value={decision} onValueChange={setDecision}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACCEPT_ORAL">{t("scientific.decisionAcceptOral")}</SelectItem>
                  <SelectItem value="ACCEPT_POSTER">{t("scientific.decisionAcceptPoster")}</SelectItem>
                  <SelectItem value="ACCEPT_E_POSTER">{t("scientific.decisionAcceptEPoster")}</SelectItem>
                  <SelectItem value="ACCEPT_PANEL">{t("scientific.decisionAcceptPanel")}</SelectItem>
                  <SelectItem value="REVISION_REQUIRED">{t("scientific.decisionRevisionRequired")}</SelectItem>
                  <SelectItem value="WAITLIST">{t("scientific.decisionWaitlist")}</SelectItem>
                  <SelectItem value="REJECT">{t("scientific.decisionReject")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("scientific.rationaleLabel")}</Label>
              <Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder={t("scientific.rationalePlaceholder")} className="mt-1" />
            </div>
            <p className="rounded-lg bg-sky-50 p-2.5 text-xs text-sky-800">{t("scientific.acceptNoSlotNote")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideTarget(null)}>{t("common.cancel")}</Button>
            <Button onClick={submitDecision} disabled={busy || !rationale}>{busy ? t("common.saving") : t("scientific.decisionSave")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── R10-b: Bildiri ayrıntılı giriş/düzenleme diyaloğu ── */}
      <Dialog open={subOpen} onOpenChange={setSubOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSub ? t("scientific.editSubmission") : t("scientific.newSubmission")}</DialogTitle>
            <DialogDescription>{editingSub ? t("scientific.editSubmissionDesc", { code: editingSub.code }) : t("scientific.newSubmissionDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t("scientific.titleLabel")}</Label>
              <Input className="mt-1" value={subForm.title} onChange={(e) => setSubForm({ ...subForm, title: e.target.value })} placeholder={t("scientific.titlePlaceholder")} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("scientific.abstractLabel")}</Label>
              <Textarea className="mt-1" rows={5} value={subForm.abstract} onChange={(e) => setSubForm({ ...subForm, abstract: e.target.value })} placeholder={t("scientific.abstractPlaceholder")} />
            </div>
            <div>
              <Label>{t("scientific.typeLabel")}</Label>
              <Select value={subForm.type} onValueChange={(v) => setSubForm({ ...subForm, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(subTypeMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("scientific.statusLabel")}</Label>
              <Select value={subForm.status} onValueChange={(v) => setSubForm({ ...subForm, status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(subStatusMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("scientific.trackLabel")}</Label>
              <Select value={subForm.trackId} onValueChange={(v) => setSubForm({ ...subForm, trackId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t("scientific.none")} /></SelectTrigger>
                <SelectContent className="maven-scroll max-h-64">
                  <SelectItem value="none">{t("scientific.noTrack")}</SelectItem>
                  {(tracks ?? []).map((tk) => <SelectItem key={tk.id} value={tk.id}>{tk.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("scientific.presentingAuthorLabel")}</Label>
              <Input className="mt-1" value={subForm.presentingAuthorName} onChange={(e) => setSubForm({ ...subForm, presentingAuthorName: e.target.value })} placeholder={t("scientific.presentingAuthorPlaceholder")} />
            </div>
            <div>
              <Label>{t("scientific.keywordsLabel")}</Label>
              <Input className="mt-1" value={subForm.keywords} onChange={(e) => setSubForm({ ...subForm, keywords: e.target.value })} placeholder={t("scientific.keywordsPlaceholder")} />
            </div>
            <div>
              <Label>{t("scientific.fileStatusLabel")}</Label>
              <Select value={subForm.fileStatus} onValueChange={(v) => setSubForm({ ...subForm, fileStatus: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(fileStatusMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("scientific.posterNoLabel")}</Label>
              <Input className="mt-1 tabular-nums" value={subForm.posterNo} onChange={(e) => setSubForm({ ...subForm, posterNo: e.target.value })} placeholder={t("scientific.posterNoPlaceholder")} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("scientific.fileUrlLabel")}</Label>
              <Input className="mt-1" type="url" value={subForm.fileUrl} onChange={(e) => setSubForm({ ...subForm, fileUrl: e.target.value })} placeholder={t("scientific.urlPlaceholder")} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("scientific.submittedAtLabel")}</Label>
              <Input className="mt-1 tabular-nums" type="datetime-local" value={subForm.submittedAt} onChange={(e) => setSubForm({ ...subForm, submittedAt: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveSub} disabled={subBusy || !subForm.title.trim()}>
              {subBusy ? t("common.saving") : editingSub ? t("scientific.update") : t("scientific.saveSubmission")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ICCA/IAPCO Çift-Kör Hakem Değerlendirmesi & Rubrik Modalı */}
      {reviewTarget && (
        <PeerReviewModal
          open={Boolean(reviewTarget)}
          onOpenChange={(o) => !o && setReviewTarget(null)}
          submission={reviewTarget}
          onSubmitReview={async (subId, rubric, comments, rec) => {
            try {
              const overall = rubric.originality * 0.25 + rubric.methodology * 0.35 + rubric.relevance * 0.25 + rubric.clarity * 0.15;
              await apiSend("/api/reviews", "POST", {
                submissionId: subId,
                originality: rubric.originality,
                methodology: rubric.methodology,
                relevance: rubric.relevance,
                clarity: rubric.clarity,
                overallScore: Math.round(overall * 100) / 100,
                score: Math.round(overall * 100) / 100,
                recommendation: rec,
                comment: comments,
              });
              toast({ title: "Hakem Değerlendirmesi Kaydedildi", description: `Öneri: ${rec}` });
              reload();
            } catch (err: any) {
              toast({ title: t("scientific.saveFailed"), description: err.message, variant: "destructive" });
            }
          }}
        />
      )}
    </div>
  );
}

export function ProgramView() {
  useLang(); // dil değişiminde yeniden render
  // Faz E: sabit enum map'lerini tLabel ile çevir (status sözlüğü köprüsü)
  const sessionTypeMap = Object.fromEntries(Object.entries(SESSION_TYPES).map(([k]) => [k, tLabel(SESSION_TYPES, k)]));
  const sessionAccessMap = Object.fromEntries(Object.entries(SESSION_ACCESS).map(([k, v]) => [k, t(v)])); // F9-R-d: parça sözlükten etiket
  const sessionStatusMap = Object.fromEntries(Object.entries(SESSION_STATUS).map(([k]) => [k, tLabel(SESSION_STATUS, k)]));
  const materialTypeMap = Object.fromEntries(Object.entries(MATERIAL_TYPE).map(([k]) => [k, tLabel(MATERIAL_TYPE, k)]));
  const matStatusMap = Object.fromEntries(Object.entries(MATERIAL_STATUS_LABEL).map(([k]) => [k, tLabel(MATERIAL_STATUS_LABEL, k)]));
  const { currentEditionId, tenant, bump, refreshKey, editions } = useApp();
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
  const emptyMat = { type: "SLIDES", title: "", url: "", personId: "none", durationMin: "", status: "PENDING", notes: "", dataUrl: "" };
  const matFileRef = useRef<HTMLInputElement>(null);
  const [matForm, setMatForm] = useState(emptyMat);

  // CME Kredi Defteri — yalnız edisyonun CME_CREDITS yeteneği açıksa görünür
  const edition = editions.find((e) => e.id === currentEditionId);
  const cmeEnabled = hasCapability(edition, "CME_CREDITS");
  const [creditInputs, setCreditInputs] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkDefaults, setBulkDefaults] = useState<Record<string, string>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // ── R10-b: manuel oturum girişi/düzenleme ──
  const [sesOpen, setSesOpen] = useState(false);
  const [sesBusy, setSesBusy] = useState(false);
  const [editingSes, setEditingSes] = useState<SessionRow | null>(null);
  const [sesError, setSesError] = useState("");
  const emptySes = { title: "", description: "", type: "TALK", roomId: "none", trackId: "none", submissionId: "none", startTime: "", endTime: "", capacity: "", accessRule: "OPEN", status: "DRAFT", isVisible: false, cmeCredits: "" };
  const [sesForm, setSesForm] = useState(emptySes);
  // görev atama satırı (diyalog içi)
  const [asgPerson, setAsgPerson] = useState("none");
  const [asgRole, setAsgRole] = useState("SPEAKER");
  const [asgBusy, setAsgBusy] = useState(false);

  const handleSessionMove = async (sessionId: string, newRoomId: string, newStartTime: string, newEndTime: string) => {
    try {
      await apiSend(`/api/sessions/${sessionId}`, "PUT", {
        roomId: newRoomId,
        startTime: newStartTime,
        endTime: newEndTime,
      });
      toast({ title: t("scientific.sessionMoved"), description: t("scientific.timetableUpdated") });
      reload();
    } catch (e) {
      toast({ title: "Taşıma Başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    }
  };

  // TASK-A F6: oturumlar imleçli load-more — 200 satırlık sessiz kesme kaldırıldı
  const { data: sessionsPaged, error, reload, loading, more: sesMore } = useApi<{ items: SessionRow[]; nextCursor?: string | null }>(
    (cursor?: string) => listEntityPaged<SessionRow>("sessions", { editionId: currentEditionId ?? undefined, limit: 200 }, cursor),
    [currentEditionId, refreshKey],
    { append: true },
  );
  const sessions = useMemo(() => sessionsPaged?.items ?? [], [sessionsPaged]);
  const { data: rooms } = useApi<{ id: string; name: string; capacity: number }[]>(() => listEntity("rooms", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);
  // ── R10-b: görev atama için kişiler + kaynak bildiri seçenekleri ──
  const { data: people } = useApi<PersonRow[]>(() =>
    tenant ? listEntity<PersonRow>("people", { tenantId: tenant.id, limit: 500 }) : Promise.resolve([]),
    [tenant, refreshKey]);
  const { data: subOptions } = useApi<{ id: string; code: string; title: string }[]>(() =>
    currentEditionId ? listEntity("submissions", { editionId: currentEditionId, limit: 300 }) : Promise.resolve([]),
    [currentEditionId, refreshKey]);
  const { data: tracks } = useApi<{ id: string; name: string }[]>(() =>
    currentEditionId ? listEntity("tracks", { editionId: currentEditionId }) : Promise.resolve([]),
    [currentEditionId, refreshKey]);
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
  // N-06: render-fazında sıfırla (resmî "önceki render" deseni) — effect içi senkron setState yok.
  const [creditsFor, setCreditsFor] = useState(cme);
  if (cme && creditsFor !== cme) {
    setCreditsFor(cme);
    const next: Record<string, string> = {};
    for (const s of cme.sessions) next[s.id] = s.cmeCredits != null ? String(s.cmeCredits) : "";
    setCreditInputs(next);
  }

  const days = Array.from(new Set(sessions.map((s) => s.startTime.slice(0, 10)))).sort();
  const filtered = sessions.filter((s) => dayFilter === "ALL" || s.startTime.slice(0, 10) === dayFilter);
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
      toast({ title: t("cme.invalidCredits"), description: t("cme.invalidCreditsDesc"), variant: "destructive" });
      return;
    }
    setSavingId(s.id);
    try {
      await apiSend("/api/cme", "POST", { action: "set-credits", sessionId: s.id, credits });
      toast({ title: t("cme.creditsAssigned", { credits, title: s.title }) });
      reloadCme(); bump();
    } catch (e) {
      toast({ title: t("cme.creditsAssignFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
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
      if (res.updated > 0) toast({ title: t("cme.bulkApplied", { n: res.updated }), description: t("cme.bulkAppliedDesc") });
      else toast({ title: t("cme.nothingToApply"), description: t("cme.nothingToApplyDesc") });
      reloadCme(); bump();
    } catch (e) {
      toast({ title: t("cme.bulkApplyFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setBulkBusy(false); }
  };

  const publish = async () => {
    if (!publishTarget) return;
    setBusy(true);
    try {
      await apiSend(`/api/sessions/${publishTarget.id}`, "PUT", { status: "PUBLISHED", isVisible: true });
      toast({ title: t("scientific.sessionPublished"), description: t("scientific.sessionPublishedDesc") });
      setPublishTarget(null); reload(); bump();
    } catch (e) {
      toast({ title: t("scientific.publishFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
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
        toast({ title: t("scientific.importSaved"), description: importKind === "SESSIONS" ? t("scientific.importSavedSessions", { created: res.sessionsCreated, updated: res.sessionsUpdated }) : t("scientific.importSavedPersons", { matched: res.personsMatched, created: res.personsCreated }) });
        reload(); reloadMaterials(); bump();
      }
    } catch (e) {
      toast({ title: t("scientific.importFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setImportBusy(false); }
  };

  // ── R9-c: materyal CRUD ──
  const openMatNew = (s: SessionRow) => { setEditingMat(null); setMatTarget(s); setMatForm(emptyMat); setMatOpen(true); };
  const openMatEdit = (m: MaterialRow) => {
    setEditingMat(m); setMatTarget(null);
    setMatForm({ type: m.type, title: m.title, url: m.url ?? "", personId: m.personId ?? "none", durationMin: m.durationMin != null ? String(m.durationMin) : "", status: m.status, notes: m.notes ?? "", dataUrl: "" });
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
      const created = editingMat
        ? await apiSend<MaterialRow>(`/api/session-materials/${editingMat.id}`, "PUT", payload)
        : await apiSend<MaterialRow>("/api/session-materials", "POST", { sessionId: matTarget?.id, editionId: currentEditionId, ...payload });
      // R10-b: Medya Arşivi kopyası — dosya seçildiyse dataUrl, yoksa URL (yalnız yeni kayıt/yeni dosya)
      const sessionId = editingMat?.sessionId ?? matTarget?.id ?? null;
      let mediaNote = "";
      if (currentEditionId && sessionId && (matForm.dataUrl || (!editingMat && matForm.url))) {
        try {
          const res = await apiSend<{ asset: { name: string } }>("/api/media/upload-linked", "POST", {
            editionId: currentEditionId, systemFolder: "MATERYAL", name: matForm.title.trim(),
            dataUrl: matForm.dataUrl || undefined,
            externalUrl: matForm.dataUrl ? undefined : matForm.url || undefined,
            linkedType: "SESSION", linkedId: sessionId,
          });
          mediaNote = `Medya: ${res.asset.name} (Materyaller klasörü)`;
        } catch { /* arşiv yazımı materyal kaydını engellemez */ }
      }
      if (mediaNote) {
        const merged = [created.notes ?? matForm.notes ?? "", mediaNote].filter(Boolean).join("\n");
        await apiSend(`/api/session-materials/${created.id}`, "PUT", { notes: merged });
      }
      toast({ title: editingMat ? t("scientific.materialUpdated") : t("scientific.materialAdded"), description: mediaNote ? t("scientific.materialArchived", { title: matForm.title.trim() }) : matForm.title.trim() });
      setMatOpen(false); reloadMaterials(); bump();
    } catch (e) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : t("scientific.materialSaveFailed"), variant: "destructive" });
    } finally { setMatBusy(false); }
  };
  const removeMat = async (m: MaterialRow) => {
    try {
      await apiSend(`/api/session-materials/${m.id}`, "DELETE");
      toast({ title: t("scientific.materialDeleted"), description: m.title });
      reloadMaterials();
    } catch (e) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : t("scientific.deleteFailed"), variant: "destructive" });
    }
  };

  // ── R10-b: manuel oturum CRUD + görev yönetimi ──
  const openSesNew = () => { setEditingSes(null); setSesForm(emptySes); setSesError(""); setAsgPerson("none"); setSesOpen(true); };
  const openSesEdit = (s: SessionRow) => {
    setEditingSes(s);
    setSesForm({
      title: s.title, description: s.description ?? "", type: s.type,
      roomId: s.roomId ?? "none", trackId: s.trackId ?? "none", submissionId: s.submissionId ?? "none",
      startTime: toLocalInput(s.startTime), endTime: toLocalInput(s.endTime),
      capacity: s.capacity != null ? String(s.capacity) : "",
      accessRule: s.accessRule ?? "OPEN", status: s.status, isVisible: s.isVisible,
      cmeCredits: s.cmeCredits != null ? String(s.cmeCredits) : "",
    });
    setSesError(""); setAsgPerson("none"); setAsgRole("SPEAKER"); setSesOpen(true);
  };
  const saveSes = async () => {
    if (!sesForm.title.trim() || !currentEditionId) return;
    if (!sesForm.startTime || !sesForm.endTime) { setSesError(t("scientific.errTimeRequired")); return; }
    const start = new Date(sesForm.startTime);
    const end = new Date(sesForm.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) { setSesError(t("scientific.errTimeInvalid")); return; }
    if (end <= start) { setSesError(t("scientific.errEndBeforeStart")); return; }
    setSesError("");
    setSesBusy(true);
    try {
      const payload = {
        title: sesForm.title.trim(), description: sesForm.description || null,
        type: sesForm.type,
        roomId: sesForm.roomId === "none" ? null : sesForm.roomId,
        trackId: sesForm.trackId === "none" ? null : sesForm.trackId,
        submissionId: sesForm.submissionId === "none" ? null : sesForm.submissionId,
        startTime: start.toISOString(), endTime: end.toISOString(),
        capacity: sesForm.capacity ? Number(sesForm.capacity) : null,
        accessRule: sesForm.accessRule, status: sesForm.status,
        isVisible: sesForm.isVisible,
        cmeCredits: sesForm.cmeCredits ? Number(sesForm.cmeCredits) : null,
      };
      if (editingSes) await apiSend(`/api/sessions/${editingSes.id}`, "PUT", payload);
      else await apiSend("/api/sessions", "POST", { editionId: currentEditionId, ...payload });
      toast({ title: editingSes ? t("scientific.sessionUpdated") : t("scientific.sessionAdded"), description: sesForm.title.trim() });
      setSesOpen(false); reload(); bump();
    } catch (e) {
      toast({ title: t("scientific.sessionSaveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setSesBusy(false); }
  };
  // diyaloğun açık olduğu oturumun taze verisi (reload sonrası atamalar güncel kalsın)
  const sesDraft = editingSes ? (sessions.find((x) => x.id === editingSes.id) ?? editingSes) : null;
  const addAssignment = async () => {
    if (!editingSes || asgPerson === "none") return;
    setAsgBusy(true);
    try {
      await apiSend("/api/program-assignments", "POST", { sessionId: editingSes.id, personId: asgPerson, role: asgRole });
      const pname = (people ?? []).find((p) => p.id === asgPerson);
      toast({ title: t("scientific.assignmentAdded"), description: t("scientific.assignmentAddedDesc", { name: pname ? `${pname.firstName} ${pname.lastName}` : t("scientific.personFallback"), role: tLabel(EVENT_ROLES, asgRole) }) });
      setAsgPerson("none");
      reload();
    } catch (e) {
      toast({ title: t("scientific.assignmentAddFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setAsgBusy(false); }
  };
  const removeAssignment = async (a: { id: string; role: string }) => {
    try {
      await apiSend(`/api/program-assignments/${a.id}`, "DELETE");
      toast({ title: t("scientific.assignmentRemoved"), description: tLabel(EVENT_ROLES, a.role) });
      reload();
    } catch (e) {
      toast({ title: t("scientific.assignmentRemoveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
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
      <PageHeader title={t("scientific.programTitle")} desc={t("scientific.programDesc")}>
        <Button size="sm" onClick={openSesNew} disabled={!currentEditionId} aria-label={t("scientific.addSessionAria")}>
          <Icons.CalendarPlus className="size-4" /> {t("scientific.addSession")}
        </Button>
        <Button size="sm" variant="outline" onClick={openImport} disabled={!currentEditionId} aria-label={t("scientific.importAria")}>
          <Icons.FileUp className="size-4" /> {t("scientific.import")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { reload(); reloadCme(); }} aria-label={t("scientific.refreshAria")}><Icons.RefreshCw className="size-4" /></Button>
      </PageHeader>

      <Tabs defaultValue="sessions">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="sessions">{t("scientific.tabSessions")}</TabsTrigger>
          <TabsTrigger value="timetable" className="gap-1.5">
            <Icons.CalendarRange className="size-4" /> Timetable Matrisi
          </TabsTrigger>
          {cmeEnabled && <TabsTrigger value="cme"><Icons.GraduationCap className="size-4" /> {t("cme.tabCredits")}</TabsTrigger>}
        </TabsList>

        <TabsContent value="sessions" className="mt-4 space-y-4">
          <Select value={dayFilter} onValueChange={setDayFilter}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("scientific.allDays")}</SelectItem>
              {days.map((d) => <SelectItem key={d} value={d}>{fmtDate(d)}</SelectItem>)}
            </SelectContent>
          </Select>

          {clashes.size > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-800">
              <Icons.OctagonAlert className="mt-0.5 size-4 shrink-0" />
              {t("scientific.clashWarning", { n: clashes.size })}
            </div>
          )}

          {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : filtered.length === 0 ? (
            <EmptyState title={t("scientific.noSessionsTitle")} desc={t("scientific.noSessionsDesc")} />
          ) : (
            <div className="space-y-2.5">
              {filtered.map((s) => (
                <div key={s.id} className={cn("rounded-xl border bg-card p-4", clashes.has(s.id) && "border-rose-300")} onDoubleClick={() => openSesEdit(s)} title={t("scientific.doubleClickEdit")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold tabular-nums text-primary">
                      {new Date(s.startTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}–{new Date(s.endTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <p className="min-w-0 flex-1 truncate font-semibold">{s.title}</p>
                    <Chip tone={s.type === "KEYNOTE" ? "violet" : s.type === "BREAK" ? "neutral" : "teal"}>{s.type}</Chip>
                    {s.room && <Chip>{s.room.name}</Chip>}
                    <StatusBadge map={sessionStatusMap} value={s.status} />
                    {clashes.has(s.id) && <Chip tone="rose">{t("scientific.clashChip")}</Chip>}
                    {!s.isVisible && s.status === "PUBLISHED" && <Chip tone="amber">{t("scientific.hiddenChip")}</Chip>}
                  </div>
                  {s.submission && <p className="mt-1 text-xs text-muted-foreground">{t("scientific.sourceSubmission", { code: s.submission.code, title: s.submission.title })}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.assignments.map((a) => {
                      const name = a.person ? `${a.person.firstName} ${a.person.lastName}` : a.participation ? `${a.participation.person.firstName} ${a.participation.person.lastName}` : "—";
                      return <Chip key={a.id} tone={a.status === "CONFIRMED" ? "emerald" : "amber"}>{tLabel(EVENT_ROLES, a.role)}: {name}</Chip>;
                    })}
                  </div>
                  {/* ── R9-c: oturum materyalleri alt listesi ── */}
                  {(materialsBySession.get(s.id)?.length ?? 0) > 0 && (
                    <div className="mt-3 rounded-lg border bg-muted/20 p-2.5">
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <Icons.Paperclip className="size-3.5" aria-hidden /> {t("scientific.materials")}
                        <span className="font-normal tabular-nums">({materialsBySession.get(s.id)!.length})</span>
                      </p>
                      <div className="space-y-1">
                        {materialsBySession.get(s.id)!.map((m) => (
                          <div key={m.id} className="group flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-card px-2 py-1.5 text-xs transition-colors hover:bg-teal-500/5">
                            <Chip tone="teal">{tLabel(MATERIAL_TYPE, m.type)}</Chip>
                            {m.notes?.includes("Medya:") && (
                              <Chip tone="violet"><Icons.FolderOpen className="size-3" aria-hidden /> {t("scientific.mediaChip")}</Chip>
                            )}
                            <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                            {m.type === "VIDEO" && m.durationMin != null && <span className="tabular-nums text-muted-foreground">{t("scientific.minutes", { n: m.durationMin })}</span>}
                            {m.personId && personOptions.get(m.personId) && <span className="hidden text-muted-foreground sm:inline">{personOptions.get(m.personId)}</span>}
                            <StatusBadge map={matStatusMap} value={m.status} />
                            {m.url && (
                              <a href={m.url} target="_blank" rel="noreferrer" className="rounded p-0.5 text-teal-600 transition hover:text-teal-800" aria-label={t("scientific.openLinkAria", { title: m.title })}>
                                <Icons.ExternalLink className="size-3.5" />
                              </a>
                            )}
                            <span className="flex items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
                              <button onClick={() => openMatEdit(m)} className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={t("scientific.editMaterialAria", { title: m.title })}>
                                <Icons.Pencil className="size-3" />
                              </button>
                              <button onClick={() => removeMat(m)} className="rounded p-1 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600" aria-label={t("scientific.deleteMaterialAria", { title: m.title })}>
                                <Icons.Trash2 className="size-3" />
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => openMatNew(s)} aria-label={t("scientific.addMaterialAria", { title: s.title })}>
                      <Icons.Paperclip className="size-3.5" /> {t("scientific.addMaterial")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => openSesEdit(s)} aria-label={t("scientific.editSessionAria", { title: s.title })}>
                      <Icons.Pencil className="size-3.5" /> {t("scientific.edit")}
                    </Button>
                  </div>
                  {s.status !== "PUBLISHED" && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => setPublishTarget(s)} disabled={clashes.has(s.id)}>
                      <Icons.Upload className="size-4" /> {t("scientific.publish")}
                    </Button>
                  )}
                </div>
              ))}
              {/* TASK-A F6: kesintisiz yükleme */}
              {sesMore?.hasMore && (
                <div className="flex items-center justify-center pt-1">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={sesMore.loading} onClick={sesMore.next}>
                    {sesMore.loading ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.ChevronsDown className="size-3.5" />}
                    {t("scientific.loadMore")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timetable" className="mt-4 space-y-4">
          <TimetableGrid
            sessions={sessions as any}
            rooms={rooms ?? []}
            onSessionMove={handleSessionMove}
            onSessionClick={(ts) => {
              const full = sessions.find((s) => s.id === ts.id);
              if (full) openSesEdit(full);
            }}
          />
        </TabsContent>

        {cmeEnabled && (
          <TabsContent value="cme" className="mt-4 space-y-4">
            {cmeLoading ? <Loading rows={5} /> : cmeError ? <ErrorState message={cmeError} onRetry={reloadCme} /> : !cme ? (
              <EmptyState title={t("cme.noDataTitle")} desc={t("cme.noDataDesc")} />
            ) : (
              <>
                {/* Üst KPI satırı */}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard label={t("cme.kpiSessionsWithCredits")} value={cme.summary.sessionsWithCredits} sub={t("cme.kpiSessionsSub", { n: cme.summary.sessionsTotal })} icon={<Icons.GraduationCap className="size-4" />} />
                  <KpiCard label={t("cme.kpiPotential")} value={cme.summary.creditsPotential} sub={t("cme.kpiPotentialSub")} tone="violet" icon={<Icons.Sigma className="size-4" />} />
                  <KpiCard label={t("cme.kpiAttendees")} value={cme.summary.attendees} sub={t("cme.kpiAttendeesSub")} tone="emerald" icon={<Icons.UserCheck className="size-4" />} />
                  <KpiCard label={t("cme.kpiIssued")} value={cme.summary.creditsIssued} sub={t("cme.kpiIssuedSub", { avg: cme.summary.avgCredits })} tone="amber" icon={<Icons.Award className="size-4" />} />
                </div>

                {/* Kapsam satırı + resmî rapor aksiyonları */}
                <div className="flex flex-wrap items-center gap-2 gap-y-2 rounded-xl border bg-card px-4 py-3 shadow-sm sm:gap-3">
                  <span className="text-xs font-medium text-muted-foreground">{t("cme.coverage")}</span>
                  <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded bg-muted">
                    <div className="h-full w-full origin-left rounded bg-teal-500 transition-transform duration-300 ease-out" style={{ transform: `scaleX(${Math.min(100, Math.max(0, cme.summary.coveragePercent)) / 100})` }} />
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{t("cme.coveragePercent", { p: cme.summary.coveragePercent })}</span>
                  <Button size="sm" variant="outline" className="ml-auto h-8 shrink-0" onClick={() => setReportOpen(true)} disabled={!currentEditionId}>
                    <Icons.FileBadge className="size-3.5" /> {t("cme.officialReport")}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 shrink-0" onClick={() => window.open(`/api/cme/report?editionId=${encodeURIComponent(currentEditionId ?? "")}&format=csv`, "_blank")}>
                    <Icons.Download className="size-3.5" /> {t("cme.csv")}
                  </Button>
                </div>

                {/* Oturum kredi editörü */}
                <SectionCard title={t("cme.sessionCredits")} desc={t("cme.sessionCreditsDesc")}>
                  <div className="maven-scroll max-h-96 overflow-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="sticky top-0 z-10 bg-card text-left text-muted-foreground">
                        <tr className="border-b">
                          <th className="px-3 py-2 text-xs font-medium">{t("cme.thSession")}</th>
                          <th className="px-3 py-2 text-xs font-medium">{t("cme.thTime")}</th>
                          <th className="px-3 py-2 text-xs font-medium">{t("cme.thAttendance")}</th>
                          <th className="px-3 py-2 text-right text-xs font-medium">{t("cme.thCredits")}</th>
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
                            <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{t("cme.personCount", { n: s.attendanceCount })}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center justify-end gap-1.5">
                                <Input
                                  type="number" inputMode="decimal" min={0} max={99} step={0.5}
                                  value={creditInputs[s.id] ?? ""} placeholder="—"
                                  onChange={(e) => setCreditInputs((prev) => ({ ...prev, [s.id]: e.target.value }))}
                                  className="h-8 w-20" aria-label={t("cme.creditInputAria", { title: s.title })}
                                />
                                <Button
                                  size="sm" variant="outline" className="h-8"
                                  disabled={savingId !== null || (creditInputs[s.id] ?? "").trim() === ""}
                                  onClick={() => saveCredits(s)}
                                >
                                  {savingId === s.id ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Check className="size-3.5" />}
                                  {t("common.save")}
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
                <SectionCard title={t("cme.bulkTitle")} desc={t("cme.bulkDesc")}>
                  <div className="flex flex-wrap items-end gap-3">
                    {CME_SESSION_TYPES.map((ty) => (
                      <div key={ty} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{ty}</Label>
                        <Input
                          type="number" min={0} max={99} step={0.5} placeholder="0"
                          value={bulkDefaults[ty] ?? ""}
                          onChange={(e) => setBulkDefaults((prev) => ({ ...prev, [ty]: e.target.value }))}
                          className="h-8 w-20" aria-label={t("cme.bulkInputAria", { type: ty })}
                        />
                      </div>
                    ))}
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t("cme.bulkOnlyEmpty")}</span>
                      <Button size="sm" onClick={applyBulk} disabled={bulkBusy || !bulkFilled}>
                        {bulkBusy && <Icons.Loader2 className="size-4 animate-spin" />}
                        {t("cme.bulkApply")}
                      </Button>
                    </div>
                  </div>
                </SectionCard>

                {/* Kişi bazlı kredi defteri */}
                <SectionCard title={t("cme.ledgerTitle")} desc={t("cme.ledgerDesc")}>
                  {cme.ledger.length === 0 ? (
                    <EmptyState title={t("cme.ledgerEmptyTitle")} desc={t("cme.ledgerEmptyDesc")} />
                  ) : (
                    <div className="maven-scroll max-h-96 overflow-auto">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead className="sticky top-0 z-10 bg-card text-left text-muted-foreground">
                          <tr className="border-b">
                            <th className="px-3 py-2 text-xs font-medium">{t("cme.thPerson")}</th>
                            <th className="px-3 py-2 text-xs font-medium">{t("cme.thRoles")}</th>
                            <th className="px-3 py-2 text-xs font-medium">{t("cme.thAttendance")}</th>
                            <th className="px-3 py-2 text-right text-xs font-medium">{t("cme.thCredits")}</th>
                            <th className="px-3 py-2 text-xs font-medium">{t("cme.thProgress")}</th>
                            <th className="px-3 py-2 text-xs font-medium">{t("cme.thLastActivity")}</th>
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
                                  {l.roles.slice(0, 2).map((r) => <Chip key={r} tone="teal">{tLabel(EVENT_ROLES, r)}</Chip>)}
                                  {l.roles.length > 2 && <Chip tone="neutral">+{l.roles.length - 2}</Chip>}
                                  {l.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{t("cme.attendedOf", { attended: l.attendedCount, eligible: l.eligibleCount })}</td>
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
          <DialogHeader><DialogTitle>{t("scientific.publishDialogTitle")}</DialogTitle><DialogDescription>{publishTarget?.title}</DialogDescription></DialogHeader>
          <p className="text-xs text-muted-foreground">{t("scientific.publishDialogDesc")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishTarget(null)}>{t("common.cancel")}</Button>
            <Button onClick={publish} disabled={busy}>{busy ? t("scientific.publishing") : t("scientific.publish")}</Button>
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
            <DialogTitle>{t("scientific.importDialogTitle")}</DialogTitle>
            <DialogDescription>{t("scientific.importDialogDesc")}</DialogDescription>
          </DialogHeader>

          <RadioGroup
            value={importKind}
            onValueChange={(v) => { setImportKind(v as "SESSIONS" | "PARTICIPANTS"); setImportReport(null); }}
            className="grid gap-2 sm:grid-cols-2"
          >
            <Label htmlFor="imp-sessions" className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition", importKind === "SESSIONS" ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40")}>
              <RadioGroupItem value="SESSIONS" id="imp-sessions" className="mt-0.5" />
              <span>
                <span className="block text-sm font-semibold">{t("scientific.importKindSessions")}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{t("scientific.importKindSessionsDesc")}</span>
              </span>
            </Label>
            <Label htmlFor="imp-parts" className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition", importKind === "PARTICIPANTS" ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40")}>
              <RadioGroupItem value="PARTICIPANTS" id="imp-parts" className="mt-0.5" />
              <span>
                <span className="block text-sm font-semibold">{t("scientific.importKindParticipants")}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{t("scientific.importKindParticipantsDesc")}</span>
              </span>
            </Label>
          </RadioGroup>

          <div>
            <Label>{t("scientific.importDataLabel")}</Label>
            <Textarea
              className="mt-1 min-h-40 font-mono text-xs"
              rows={8}
              value={importText}
              onChange={(e) => { setImportText(e.target.value); setImportReport(null); }}
              placeholder={importKind === "SESSIONS"
                ? t("scientific.importPlaceholderSessions")
                : t("scientific.importPlaceholderParticipants")}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {importKind === "SESSIONS"
                ? t("scientific.importHeadersSessions")
                : t("scientific.importHeadersParticipants")}
              {" "}{t("scientific.importTimeFormatNote")}
            </p>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="imp-cmp" checked={createMissingPersons} onCheckedChange={(v) => setCreateMissingPersons(v === true)} />
              <Label htmlFor="imp-cmp" className="cursor-pointer text-sm font-normal">{t("scientific.importCreatePersons")}</Label>
            </div>
            {importKind === "SESSIONS" && (
              <div className="flex items-center gap-2">
                <Checkbox id="imp-cmr" checked={createMissingRooms} onCheckedChange={(v) => setCreateMissingRooms(v === true)} />
                <Label htmlFor="imp-cmr" className="cursor-pointer text-sm font-normal">{t("scientific.importCreateRooms")}</Label>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox id="imp-dry" checked={dryRun} onCheckedChange={(v) => { setDryRun(v === true); setImportReport(null); }} />
              <Label htmlFor="imp-dry" className="cursor-pointer text-sm font-normal">{t("scientific.importDryRun")}</Label>
            </div>
          </div>

          {/* ── sonuç raporu ── */}
          {importBusy && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Icons.Loader2 className="size-3.5 animate-spin" /> {t("scientific.importProcessing")}</p>
          )}
          {importReport && !importBusy && (
            <div className="maven-stagger-item space-y-3 rounded-xl border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {importKind === "SESSIONS" ? (
                  <>
                    <Chip tone="emerald">{t("scientific.importSessionsCreated", { n: importReport.sessionsCreated })}</Chip>
                    {importReport.sessionsUpdated > 0 && <Chip tone="teal">{t("scientific.importUpdated", { n: importReport.sessionsUpdated })}</Chip>}
                    {importReport.roomsCreated > 0 && <Chip tone="violet">{t("scientific.importRoomsCreated", { n: importReport.roomsCreated })}</Chip>}
                    <Chip tone="teal">{t("scientific.importPersonsMatched", { n: importReport.personsMatched })}</Chip>
                    {importReport.personsCreated > 0 && <Chip tone="emerald">{t("scientific.importPersonsCreated", { n: importReport.personsCreated })}</Chip>}
                    {importReport.assignmentsCreated > 0 && <Chip tone="neutral">{t("scientific.importAssignments", { n: importReport.assignmentsCreated })}</Chip>}
                    {importReport.personsUnmatched > 0 && <Chip tone="rose">{t("scientific.importPersonsUnmatched", { n: importReport.personsUnmatched })}</Chip>}
                  </>
                ) : (
                  <>
                    <Chip tone="teal">{t("scientific.importPersonsMatched", { n: importReport.personsMatched })}</Chip>
                    <Chip tone="emerald">{t("scientific.importPersonsCreated", { n: importReport.personsCreated })}</Chip>
                    <Chip tone="rose">{t("scientific.importPersonsUnmatched", { n: importReport.personsUnmatched })}</Chip>
                    {importReport.participationsCreated > 0 && <Chip tone="violet">{t("scientific.importParticipationsCreated", { n: importReport.participationsCreated })}</Chip>}
                  </>
                )}
                {importReport.dryRun && <Chip tone="amber">{t("scientific.importDryRunChip")}</Chip>}
                <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{t("scientific.importRows", { n: importReport.totalRows })}</span>
              </div>

              {importReport.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-rose-700">{t("scientific.importErrors")}</p>
                  {importReport.errors.map((e) => (
                    <p key={`${e.row}-${e.message}`} className="flex items-start gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                      <Icons.TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                      <span>{t("scientific.row")} <span className="tabular-nums font-semibold">{e.row}</span> — {e.message}</span>
                    </p>
                  ))}
                </div>
              )}

              {importReport.matchDetails.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("scientific.importMatchDetails")}</p>
                  {/* mobilde kart, sm+ üstünde tablo */}
                  <div className="maven-scroll hidden max-h-52 overflow-y-auto rounded-lg border bg-card sm:block">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                        <tr className="border-b">
                          <th className="px-2.5 py-1.5 font-medium">{t("scientific.row")}</th>
                          <th className="px-2.5 py-1.5 font-medium">{t("scientific.thFullName")}</th>
                          <th className="px-2.5 py-1.5 font-medium">{t("scientific.thEmail")}</th>
                          <th className="px-2.5 py-1.5 font-medium">{t("scientific.thResult")}</th>
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
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{t("scientific.rowShort")} {d.row}</span>
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
                  <p className="text-xs text-teal-800">{t("scientific.importClean")}</p>
                  <Button size="sm" onClick={() => void runImport(false)} disabled={importBusy}>
                    <Icons.Check className="size-4" /> {t("scientific.importSaveNow")}
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportReport(null); }}>{t("common.close")}</Button>
            <Button onClick={() => void runImport(dryRun)} disabled={importBusy || !importText.trim() || !currentEditionId}>
              {importBusy ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.FileUp className="size-4" />}
              {dryRun ? t("scientific.importDryRunButton") : t("scientific.import")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── R9-c: Materyal ekle/düzenle diyaloğu ── */}
      <Dialog open={matOpen} onOpenChange={setMatOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMat ? t("scientific.editMaterial") : t("scientific.newMaterial")}</DialogTitle>
            <DialogDescription>{editingMat ? editingMat.title : matTarget?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("scientific.typeLabel")}</Label>
              <Select value={matForm.type} onValueChange={(v) => setMatForm({ ...matForm, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(materialTypeMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("scientific.statusLabel")}</Label>
              <Select value={matForm.status} onValueChange={(v) => setMatForm({ ...matForm, status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">{t("status.PENDING")}</SelectItem>
                  <SelectItem value="READY">{t("status.READY")}</SelectItem>
                  <SelectItem value="MISSING">{t("status.MISSING")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>{t("scientific.titleLabel")}</Label><Input className="mt-1" value={matForm.title} onChange={(e) => setMatForm({ ...matForm, title: e.target.value })} placeholder={t("scientific.materialTitlePlaceholder")} /></div>
            <div className="sm:col-span-2"><Label>{t("scientific.materialUrlLabel")}</Label><Input className="mt-1" type="url" value={matForm.url} onChange={(e) => setMatForm({ ...matForm, url: e.target.value })} placeholder={t("scientific.urlPlaceholder")} /></div>
            {/* R10-b: dosya modu — Medya Arşivi'ne benzersiz adla kopyalanır */}
            <div className="sm:col-span-2 rounded-lg border border-dashed bg-muted/20 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium"><Icons.FolderUp className="size-3.5 text-teal-600" /> {t("scientific.fileUploadLabel")}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{t("scientific.fileUploadDesc")}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  ref={matFileRef} type="file" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > MAX_FILE_BYTES) {
                        toast({ title: t("scientific.fileTooBig"), description: t("scientific.fileTooBigDesc", { size: (f.size / 1024).toFixed(0) }), variant: "destructive" });
                      } else {
                        void fileToDataUrl(f, MAX_FILE_BYTES).then((d) => { if (d) setMatForm((p) => ({ ...p, dataUrl: d })); });
                      }
                    }
                    e.target.value = "";
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => matFileRef.current?.click()} aria-label={t("scientific.chooseFileAria")}>
                  <Icons.Upload className="size-3" /> {t("scientific.chooseFile")}
                </Button>
                {matForm.dataUrl && <Chip tone="teal">{t("scientific.fileReady")}</Chip>}
                {matForm.dataUrl && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-rose-600 hover:text-rose-700" onClick={() => setMatForm((p) => ({ ...p, dataUrl: "" }))} aria-label={t("scientific.removeFileAria")}>
                    <Icons.Trash2 className="size-3" /> {t("scientific.remove")}
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label>{t("scientific.materialPersonLabel")}</Label>
              <Select value={matForm.personId} onValueChange={(v) => setMatForm({ ...matForm, personId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t("scientific.none")} /></SelectTrigger>
                <SelectContent className="maven-scroll max-h-64">
                  <SelectItem value="none">{t("scientific.noOwner")}</SelectItem>
                  {Array.from(personOptions.entries()).map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {matForm.type === "VIDEO" && (
              <div>
                <Label>{t("scientific.durationLabel")}</Label>
                <Input className="mt-1 tabular-nums" type="number" min={0} max={999} value={matForm.durationMin} onChange={(e) => setMatForm({ ...matForm, durationMin: e.target.value })} placeholder={t("scientific.durationPlaceholder")} />
              </div>
            )}
            <div className="sm:col-span-2"><Label>{t("scientific.notesLabel")}</Label><Textarea className="mt-1" rows={2} value={matForm.notes} onChange={(e) => setMatForm({ ...matForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveMat} disabled={matBusy || !matForm.title.trim()}>{matBusy ? t("common.saving") : t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── R10-b: Oturum Ekle/Düzenle diyaloğu — tüm ProgramSession alanları + görevler ── */}
      <Dialog open={sesOpen} onOpenChange={(o) => { if (!o) { setSesOpen(false); setSesError(""); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSes ? t("scientific.editSession") : t("scientific.newSession")}</DialogTitle>
            <DialogDescription>{editingSes ? editingSes.title : t("scientific.newSessionDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t("scientific.titleLabel")}</Label>
              <Input className="mt-1" value={sesForm.title} onChange={(e) => setSesForm({ ...sesForm, title: e.target.value })} placeholder={t("scientific.sessionTitlePlaceholder")} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("scientific.descriptionLabel")}</Label>
              <Textarea className="mt-1" rows={2} value={sesForm.description} onChange={(e) => setSesForm({ ...sesForm, description: e.target.value })} placeholder={t("scientific.sessionDescPlaceholder")} />
            </div>
            <div>
              <Label>{t("scientific.typeLabel")}</Label>
              <Select value={sesForm.type} onValueChange={(v) => setSesForm({ ...sesForm, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(sessionTypeMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("scientific.roomLabel")}</Label>
              <Select value={sesForm.roomId} onValueChange={(v) => setSesForm({ ...sesForm, roomId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t("scientific.none")} /></SelectTrigger>
                <SelectContent className="maven-scroll max-h-64">
                  <SelectItem value="none">{t("scientific.noRoom")}</SelectItem>
                  {(rooms ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("scientific.trackLabel")}</Label>
              <Select value={sesForm.trackId} onValueChange={(v) => setSesForm({ ...sesForm, trackId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t("scientific.none")} /></SelectTrigger>
                <SelectContent className="maven-scroll max-h-64">
                  <SelectItem value="none">{t("scientific.noTrack")}</SelectItem>
                  {(tracks ?? []).map((tk) => <SelectItem key={tk.id} value={tk.id}>{tk.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("scientific.sourceSubmissionLabel")}</Label>
              <Select value={sesForm.submissionId} onValueChange={(v) => setSesForm({ ...sesForm, submissionId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t("scientific.none")} /></SelectTrigger>
                <SelectContent className="maven-scroll max-h-64">
                  <SelectItem value="none">{t("scientific.noSubmissionLink")}</SelectItem>
                  {(subOptions ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.code} — {s.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("scientific.startLabel")}</Label>
              <Input className="mt-1 tabular-nums" type="datetime-local" value={sesForm.startTime} onChange={(e) => setSesForm({ ...sesForm, startTime: e.target.value })} />
            </div>
            <div>
              <Label>{t("scientific.endLabel")}</Label>
              <Input className="mt-1 tabular-nums" type="datetime-local" value={sesForm.endTime} onChange={(e) => setSesForm({ ...sesForm, endTime: e.target.value })} />
            </div>
            <div>
              <Label>{t("scientific.capacityLabel")}</Label>
              <Input className="mt-1 tabular-nums" type="number" min={0} max={100000} value={sesForm.capacity} onChange={(e) => setSesForm({ ...sesForm, capacity: e.target.value })} placeholder={t("scientific.capacityPlaceholder")} />
            </div>
            <div>
              <Label>{t("scientific.cmeCreditsLabel")}</Label>
              <Input className="mt-1 tabular-nums" type="number" min={0} max={99} step={0.5} value={sesForm.cmeCredits} onChange={(e) => setSesForm({ ...sesForm, cmeCredits: e.target.value })} placeholder={t("scientific.creditsPlaceholder")} />
            </div>
            <div>
              <Label>{t("scientific.accessRuleLabel")}</Label>
              <Select value={sesForm.accessRule} onValueChange={(v) => setSesForm({ ...sesForm, accessRule: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(sessionAccessMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("scientific.statusLabel")}</Label>
              <Select value={sesForm.status} onValueChange={(v) => setSesForm({ ...sesForm, status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(sessionStatusMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
              <div>
                <p className="text-xs font-medium">{t("scientific.visibleInPersonal")}</p>
                <p className="text-[11px] text-muted-foreground">{t("scientific.visibleDesc")}</p>
              </div>
              <Switch checked={sesForm.isVisible} onCheckedChange={(v) => setSesForm({ ...sesForm, isVisible: v })} aria-label={t("scientific.visibleAria")} />
            </div>
            {sesError && (
              <p className="flex items-start gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 sm:col-span-2">
                <Icons.TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden /> {sesError}
              </p>
            )}
          </div>

          {/* görevler — kayıtlı oturumda ekle/kaldır */}
          {editingSes ? (
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Icons.Users className="size-3.5" /> {t("scientific.assignmentsTitle")}</p>
              {(sesDraft?.assignments ?? []).length === 0 ? (
                <p className="text-[11px] text-muted-foreground">{t("scientific.noAssignments")}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(sesDraft?.assignments ?? []).map((a) => {
                    const name = a.person ? `${a.person.firstName} ${a.person.lastName}` : a.participation ? `${a.participation.person.firstName} ${a.participation.person.lastName}` : "—";
                    return (
                      <span key={a.id} className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-0.5">
                        <Chip tone={a.status === "CONFIRMED" ? "emerald" : "amber"}>{tLabel(EVENT_ROLES, a.role)}: {name}</Chip>
                        <button type="button" onClick={() => void removeAssignment(a)} className="rounded p-0.5 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600" aria-label={t("scientific.removeAssignmentAria", { name })}>
                          <Icons.X className="size-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={asgPerson} onValueChange={setAsgPerson}>
                  <SelectTrigger className="h-8 flex-1 text-xs" aria-label={t("scientific.selectPersonAria")}><SelectValue placeholder={t("scientific.selectPerson")} /></SelectTrigger>
                  <SelectContent className="maven-scroll max-h-64">
                    <SelectItem value="none">{t("scientific.selectPersonItem")}</SelectItem>
                    {(people ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.company ? ` — ${p.company}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={asgRole} onValueChange={setAsgRole}>
                  <SelectTrigger className="h-8 w-full text-xs sm:w-40" aria-label={t("scientific.selectRoleAria")}><SelectValue /></SelectTrigger>
                  <SelectContent>{ASSIGN_ROLES.map((r) => <SelectItem key={r} value={r}>{tLabel(EVENT_ROLES, r)}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" className="h-8 shrink-0" disabled={asgBusy || asgPerson === "none"} onClick={() => void addAssignment()} aria-label={t("scientific.addAssignmentAria")}>
                  {asgBusy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Plus className="size-3.5" />} {t("scientific.add")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-sky-50 p-2.5 text-[11px] text-sky-800">{t("scientific.assignAfterSave")}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSesOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveSes} disabled={sesBusy || !sesForm.title.trim()}>
              {sesBusy ? t("common.saving") : editingSes ? t("scientific.update") : t("scientific.saveSession")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
