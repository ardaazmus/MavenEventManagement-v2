"use client";
// Bilimsel — çağrı, bildiri, hakem, karar (kabul ≠ otomatik program slotu, Kimlik kuralı 6)
// Program — oturum, salon, görevler, yayın durumu
import { useState } from "react";
import { listEntity, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { SUBMISSION_STATUS, SESSION_STATUS, fmtDateTime, fmtDate, EVENT_ROLES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
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
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const [dayFilter, setDayFilter] = useState("ALL");
  const [publishTarget, setPublishTarget] = useState<SessionRow | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: sessions, error, reload, loading } = useApi<SessionRow[]>(() => listEntity<SessionRow>("sessions", { editionId: currentEditionId ?? undefined, limit: 200 }), [currentEditionId, refreshKey]);
  const { data: rooms } = useApi<{ id: string; name: string; capacity: number }[]>(() => listEntity("rooms", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);

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

  return (
    <div className="space-y-5">
      <PageHeader title="Program" desc="Salon, zaman, görevli — çakışmalı yayın engellenir; bilimsel kararı program modülü değiştirmez">
        <Select value={dayFilter} onValueChange={setDayFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm günler</SelectItem>
            {days.map((d) => <SelectItem key={d} value={d}>{fmtDate(d)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={reload}><Icons.RefreshCw className="size-4" /></Button>
      </PageHeader>

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
              {s.status !== "PUBLISHED" && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setPublishTarget(s)} disabled={clashes.has(s.id)}>
                  <Icons.Upload className="size-4" /> Yayınla
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

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
    </div>
  );
}

function label2(map: Record<string, string>, key: string) {
  return map[key] ?? key;
}
