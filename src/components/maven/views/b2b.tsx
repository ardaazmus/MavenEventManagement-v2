"use client";
// B2B Planı modülü (kullanıcı isteği):
// — Kişilere B2B planı ATANIR (rol ile)
// — Gelecek olan Mobil Uygulamadan kişi planı KABUL eder, sonrasında GÖRÜŞ bildirir
// — Plan kişilerin kendi özelinde kalır (isPrivate), KARŞILIKLI ONAY sonrası ACTIVE olur
// — Giriş alanları: Saat (startsAt/endsAt), Etkinlik yeri (venue), Konum (location), Konu (subject)
import { useMemo, useState } from "react";
import { apiSend, listEntity } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, PageHeader, StatusBadge, Chip, useApi, KpiCard, ConfirmDialog } from "../bits";
import { B2B_PLAN_STATUS, B2B_ASSIGNMENT_STATUS, B2B_ROLES, label } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, t } from "@/lib/i18n";

function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface B2bPerson { id: string; firstName: string; lastName: string; email?: string | null; company?: string | null; title?: string | null; photoUrl?: string | null }

interface B2bAssignmentRow {
  id: string; planId: string; personId: string; role: string;
  status: string; organizerApproved: boolean; personApproved: boolean;
  feedback?: string | null; feedbackAt?: string | null; respondedAt?: string | null;
  person?: B2bPerson;
}

interface B2bPlanRow {
  id: string; editionId: string; subject: string; description?: string | null;
  startsAt?: string | null; endsAt?: string | null; venue?: string | null; location?: string | null;
  isPrivate: boolean; status: string; notes?: string | null;
  assignments?: B2bAssignmentRow[];
  _count?: { assignments?: number };
}

const emptyForm = {
  subject: "", description: "", startsAt: "", endsAt: "", venue: "", location: "",
  isPrivate: true, status: "DRAFT", notes: "",
};

export function B2bView() {
  useLang();
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();

  const { data: plans, reload } = useApi<B2bPlanRow[]>(
    () => listEntity<B2bPlanRow>("b2b-plans", { editionId: currentEditionId ?? undefined, limit: 200 }),
    [currentEditionId, refreshKey],
  );

  const { data: participations } = useApi<{ id: string; person: B2bPerson }[]>(
    () => listEntity("participations", { editionId: currentEditionId ?? undefined, limit: 500 }),
    [currentEditionId, refreshKey],
  );

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── plan formu (create + edit — çift tık) ──
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<B2bPlanRow | null>(null);

  // ── kişi atama diyaloğu ──
  const [assignPlan, setAssignPlan] = useState<B2bPlanRow | null>(null);
  const [assignSelected, setAssignSelected] = useState<string[]>([]);
  const [assignRole, setAssignRole] = useState("PARTICIPANT");
  const [assignSearch, setAssignSearch] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  // ── mobil önizleme (Mobil App simülasyonu) ──
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobilePersonId, setMobilePersonId] = useState<string>("");
  const [mobileFeedback, setMobileFeedback] = useState<Record<string, string>>({});

  const personOptions = useMemo(() => {
    const map = new Map<string, B2bPerson>();
    for (const p of participations ?? []) if (p.person && !map.has(p.person.id)) map.set(p.person.id, p.person);
    return Array.from(map.values());
  }, [participations]);

  const filtered = useMemo(() => (plans ?? []).filter((p) => statusFilter === "ALL" || p.status === statusFilter), [plans, statusFilter]);

  const stats = useMemo(() => {
    const all = plans ?? [];
    return {
      total: all.length,
      active: all.filter((p) => p.status === "ACTIVE").length,
      pending: all.filter((p) => p.status === "PENDING_APPROVAL" || p.status === "DRAFT").length,
      assignments: all.reduce((s, p) => s + (p.assignments?.length ?? 0), 0),
      accepted: all.reduce((s, p) => s + (p.assignments ?? []).filter((a) => a.status === "ACCEPTED").length, 0),
      feedbacks: all.reduce((s, p) => s + (p.assignments ?? []).filter((a) => Boolean(a.feedback)).length, 0),
    };
  }, [plans]);

  const openCreate = () => { setEditingId(null); setForm({ ...emptyForm }); setFormOpen(true); };

  const openEdit = (p: B2bPlanRow) => {
    setEditingId(p.id);
    setForm({
      subject: p.subject, description: p.description ?? "",
      startsAt: toLocalInput(p.startsAt), endsAt: toLocalInput(p.endsAt),
      venue: p.venue ?? "", location: p.location ?? "",
      isPrivate: p.isPrivate, status: p.status, notes: p.notes ?? "",
    });
    setFormOpen(true);
  };

  const saveForm = async () => {
    if (!currentEditionId) return;
    if (!form.subject.trim()) { toast({ title: t("b2b.subjectRequired"), variant: "destructive" }); return; }
    setBusy(true);
    try {
      const body = {
        subject: form.subject.trim(),
        description: form.description || null,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        venue: form.venue || null, location: form.location || null,
        isPrivate: form.isPrivate, status: form.status, notes: form.notes || null,
        editionId: currentEditionId,
      };
      if (editingId) await apiSend(`/api/b2b-plans/${editingId}`, "PUT", body);
      else await apiSend("/api/b2b-plans", "POST", body);
      toast({ title: editingId ? t("b2b.planUpdated") : t("b2b.planCreated"), description: form.subject });
      setFormOpen(false);
      reload(); bump();
    } catch (e) {
      toast({ title: t("b2b.saveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const removePlan = async () => {
    const p = deleteTarget;
    if (!p) return;
    try {
      await apiSend(`/api/b2b-plans/${p.id}`, "DELETE");
      setDeleteTarget(null);
      toast({ title: t("b2b.planDeleted") });
      reload(); bump();
    } catch (e) {
      toast({ title: t("b2b.deleteFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  };

  const openAssign = (p: B2bPlanRow) => {
    setAssignPlan(p);
    setAssignSelected([]);
    setAssignRole("PARTICIPANT");
    setAssignSearch("");
  };

  const sendAssignments = async () => {
    if (!assignPlan || assignSelected.length === 0) return;
    setAssignBusy(true);
    try {
      let n = 0;
      for (const personId of assignSelected) {
        await apiSend("/api/b2b-assignments", "POST", { planId: assignPlan.id, personId, role: assignRole, status: "ASSIGNED" });
        n++;
      }
      toast({ title: t("b2b.assignDoneTitle"), description: t("b2b.assignDoneDesc", { count: n }) });
      setAssignPlan(null);
      reload(); bump();
    } catch (e) {
      toast({ title: t("b2b.assignFailed"), description: e instanceof Error ? e.message : t("b2b.assignErrorFallback"), variant: "destructive" });
    } finally { setAssignBusy(false); }
  };

  const removeAssignment = async (a: B2bAssignmentRow) => {
    try {
      await apiSend(`/api/b2b-assignments/${a.id}`, "DELETE");
      reload(); bump();
    } catch (e) {
      toast({ title: t("b2b.unassignFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  };

  const organizerApprove = async (a: B2bAssignmentRow, approved: boolean) => {
    try {
      const r = await apiSend<{ planActivated?: boolean }>("/api/flows", "POST", { action: "b2b.approve", assignmentId: a.id, approved });
      toast({ title: approved ? t("b2b.orgApproved") : t("b2b.orgApprovalRevoked"), description: r.planActivated ? t("b2b.planActivatedToast") : undefined });
      reload(); bump();
    } catch (e) {
      toast({ title: t("b2b.approveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  };

  const setPlanStatus = async (p: B2bPlanRow, status: string) => {
    try {
      await apiSend(`/api/b2b-plans/${p.id}`, "PUT", { status });
      toast({ title: t("b2b.planStatusToast", { status: label(B2B_PLAN_STATUS, status) }) });
      reload(); bump();
    } catch (e) {
      toast({ title: t("b2b.statusChangeFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  };

  // ── mobil akış: kişi yanıtı (kabul/red + görüş) ──
  const mobileAssignments = useMemo(() => {
    const out: { plan: B2bPlanRow; a: B2bAssignmentRow }[] = [];
    for (const p of plans ?? []) for (const a of p.assignments ?? []) if (a.personId === mobilePersonId) out.push({ plan: p, a });
    return out;
  }, [plans, mobilePersonId]);

  const respondMobile = async (a: B2bAssignmentRow, accepted: boolean) => {
    try {
      const feedback = (mobileFeedback[a.id] ?? "").trim() || undefined;
      const r = await apiSend<{ planActivated?: boolean }>("/api/flows", "POST", { action: "b2b.respond", assignmentId: a.id, accepted, feedback, respondedBy: "Mobil Uygulama" });
      toast({ title: accepted ? t("b2b.mobileAccepted") : t("b2b.mobileDeclined"), description: r.planActivated ? t("b2b.mobileActivatedDesc") : t("b2b.mobilePendingOrgDesc") });
      reload(); bump();
    } catch (e) {
      toast({ title: t("b2b.respondFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  };

  const saveFeedbackMobile = async (a: B2bAssignmentRow) => {
    try {
      const feedback = (mobileFeedback[a.id] ?? "").trim();
      if (!feedback) { toast({ title: t("b2b.feedbackRequired"), variant: "destructive" }); return; }
      await apiSend(`/api/b2b-assignments/${a.id}`, "PUT", { feedback, feedbackAt: new Date().toISOString() });
      toast({ title: t("b2b.feedbackSaved"), description: t("b2b.feedbackSavedDesc") });
      reload(); bump();
    } catch (e) {
      toast({ title: t("b2b.feedbackSaveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  };

  const mobilePersons = useMemo(() => {
    const map = new Map<string, B2bPerson>();
    for (const p of plans ?? []) for (const a of p.assignments ?? []) if (a.person && !map.has(a.person.id)) map.set(a.person.id, a.person);
    return Array.from(map.values());
  }, [plans]);

  if (!currentEditionId) return <EmptyState title={t("b2b.selectEditionTitle")} desc={t("b2b.selectEditionDesc")} />;

  return (
    <div className="space-y-5">
      <PageHeader title={t("b2b.title")} desc={t("b2b.desc")}>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setMobilePersonId(""); setMobileOpen(true); }}>
            <Icons.Smartphone className="size-4" /> {t("b2b.btnMobilePreview")}
          </Button>
          <Button size="sm" onClick={openCreate}><Icons.Plus className="size-4" /> {t("b2b.btnNewPlan")}</Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label={t("b2b.kpiTotal")} value={stats.total} icon={<Icons.Briefcase className="size-4" />} />
        <KpiCard label={t("b2b.kpiActive")} value={stats.active} tone="emerald" icon={<Icons.CheckCircle2 className="size-4" />} />
        <KpiCard label={t("b2b.kpiPending")} value={stats.pending} tone="amber" icon={<Icons.Hourglass className="size-4" />} />
        <KpiCard label={t("b2b.kpiAssignments")} value={stats.assignments} tone="violet" icon={<Icons.UserPlus className="size-4" />} />
        <KpiCard label={t("b2b.kpiAccepted")} value={stats.accepted} tone="teal" icon={<Icons.ThumbsUp className="size-4" />} />
        <KpiCard label={t("b2b.kpiFeedbacks")} value={stats.feedbacks} tone="rose" icon={<Icons.MessageSquare className="size-4" />} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[210px]" aria-label={t("b2b.statusFilterAria")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("b2b.allStatuses")}</SelectItem>
            {Object.entries(B2B_PLAN_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Chip tone="teal">{t("b2b.planCount", { count: filtered.length })}</Chip>
        <p className="text-xs text-muted-foreground">{t("b2b.mutualApprovalHint")}</p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={t("b2b.emptyTitle")}
          desc={t("b2b.emptyDesc")}
          action={<Button onClick={openCreate}><Icons.Plus className="size-4" /> {t("b2b.btnCreateFirst")}</Button>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((p) => {
            const asg = p.assignments ?? [];
            const allAccepted = asg.length > 0 && asg.every((a) => a.status === "ACCEPTED");
            return (
              <SectionCard
                key={p.id}
                title={p.subject}
                desc={[p.venue, p.location].filter(Boolean).join(" · ") || t("b2b.noVenue")}
                action={<StatusBadge map={B2B_PLAN_STATUS} value={p.status} />}
                className="transition hover:shadow-md"
              >
                <div onDoubleClick={() => openEdit(p)} title={t("b2b.doubleClickEdit")}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.isPrivate ? <Chip tone="violet"><span className="inline-flex items-center gap-1"><Icons.Lock className="size-3" />{t("b2b.chipPrivate")}</span></Chip> : <Chip tone="teal">{t("b2b.chipPublic")}</Chip>}
                    {p.startsAt && <Chip><span className="inline-flex items-center gap-1"><Icons.Clock className="size-3" />{new Date(p.startsAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</span></Chip>}
                    {p.location && <Chip><span className="inline-flex items-center gap-1"><Icons.MapPin className="size-3" />{p.location}</span></Chip>}
                    <Chip tone={allAccepted && asg.some((a) => a.organizerApproved) ? "emerald" : "amber"}><Icons.Users className="mr-1 inline size-3" />{t("b2b.personCount", { count: asg.length })}</Chip>
                  </div>
                  {p.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>}
                  {p.notes && <p className="mt-1 line-clamp-1 text-xs italic text-muted-foreground"><Icons.StickyNote className="mr-1 inline size-3" />{p.notes}</p>}
                </div>

                {/* atama satırları */}
                {expandedId === p.id && asg.length > 0 && (
                  <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto rounded-lg border bg-muted/30 p-2 maven-scroll">
                    {asg.map((a) => (
                      <div key={a.id} className="rounded border bg-background px-2 py-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <Icons.User className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate font-medium">{a.person ? `${a.person.firstName} ${a.person.lastName}` : t("b2b.personFallback")}{a.person?.company ? ` — ${a.person.company}` : ""}</span>
                          <Chip>{label(B2B_ROLES, a.role)}</Chip>
                          {a.status === "ACCEPTED" ? <Chip tone="emerald">{label(B2B_ASSIGNMENT_STATUS, a.status)}</Chip>
                            : a.status === "DECLINED" ? <Chip tone="rose">{label(B2B_ASSIGNMENT_STATUS, a.status)}</Chip>
                            : <Chip tone="amber">{label(B2B_ASSIGNMENT_STATUS, a.status)}</Chip>}
                          {a.organizerApproved ? (
                            <Button size="icon" variant="ghost" className="size-6" aria-label={t("b2b.orgRevokeAria")} onClick={() => organizerApprove(a, false)} title={t("b2b.orgRevokeTitle")}><Icons.BadgeCheck className="size-3.5 text-emerald-600" /></Button>
                          ) : (
                            <Button size="icon" variant="ghost" className="size-6" aria-label={t("b2b.orgApproveAria")} onClick={() => organizerApprove(a, true)} title={t("b2b.orgApproveTitle")}><Icons.Circle className="size-3.5 text-muted-foreground" /></Button>
                          )}
                          <Button size="icon" variant="ghost" className="size-6" aria-label={t("b2b.removeAssignmentAria")} onClick={() => removeAssignment(a)}><Icons.Trash2 className="size-3 text-muted-foreground" /></Button>
                        </div>
                        {a.feedback && (
                          <p className="mt-1 flex items-start gap-1 rounded bg-teal-500/10 px-1.5 py-1 text-[11px] text-teal-700">
                            <Icons.MessageSquare className="mt-0.5 size-3 shrink-0" /> {t("b2b.feedbackLabel", { feedback: a.feedback })}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => openAssign(p)}><Icons.UserPlus className="size-3.5" /> {t("b2b.btnAssign")}</Button>
                  {asg.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                      <Icons.List className="size-3.5" /> {t("b2b.btnAssignments", { count: asg.length })}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => { setMobilePersonId(""); setMobileOpen(true); }} aria-label={t("b2b.mobilePreviewAria")}><Icons.Smartphone className="size-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)} aria-label={t("b2b.editAria")}><Icons.Pencil className="size-3.5" /> {t("b2b.btnEdit")}</Button>
                  {p.status === "ACTIVE" && <Button size="sm" variant="ghost" onClick={() => setPlanStatus(p, "COMPLETED")}>{t("b2b.btnComplete")}</Button>}
                  <Button size="sm" variant="ghost" className="ml-auto text-rose-500 hover:text-rose-600" onClick={() => setDeleteTarget(p)} aria-label={t("b2b.deleteAria", { subject: p.subject })}><Icons.Trash2 className="size-3.5" /></Button>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}

      {/* Plan formu — create + edit */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl maven-scroll">
          <DialogHeader>
            <DialogTitle>{editingId ? t("b2b.editPlanTitle") : t("b2b.newPlanTitle")}</DialogTitle>
            <DialogDescription>{t("b2b.formDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>{t("b2b.labelSubject")}</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder={t("b2b.placeholderSubject")} className="mt-1" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>{t("b2b.labelStarts")}</Label><Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="mt-1" /></div>
              <div><Label>{t("b2b.labelEnds")}</Label><Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="mt-1" /></div>
              <div><Label>{t("b2b.labelVenue")}</Label><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder={t("b2b.placeholderVenue")} className="mt-1" /></div>
              <div><Label>{t("b2b.labelLocation")}</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder={t("b2b.placeholderLocation")} className="mt-1" /></div>
              <div>
                <Label>{t("b2b.labelStatus")}</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(B2B_PLAN_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <div className="flex w-full items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t("b2b.privateTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("b2b.privateDesc")}</p>
                  </div>
                  <Switch checked={form.isPrivate} onCheckedChange={(v) => setForm({ ...form, isPrivate: v })} aria-label={t("b2b.privateAria")} />
                </div>
              </div>
            </div>
            <div><Label>{t("b2b.labelDescription")}</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("b2b.placeholderDescription")} className="mt-1" /></div>
            <div><Label>{t("b2b.labelNotes")}</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>{t("b2b.btnCancel")}</Button>
            <Button onClick={saveForm} disabled={busy}>{busy ? t("b2b.saving") : editingId ? t("b2b.btnSaveChanges") : t("b2b.btnCreatePlan")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kişi atama diyaloğu */}
      <Dialog open={Boolean(assignPlan)} onOpenChange={(v) => !v && setAssignPlan(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("b2b.assignTitle", { subject: assignPlan?.subject ?? "" })}</DialogTitle>
            <DialogDescription>{t("b2b.assignDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("b2b.labelRole")}</Label>
                <Select value={assignRole} onValueChange={setAssignRole}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(B2B_ROLES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("b2b.labelSelection")}</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Chip tone="teal">{assignSelected.length} / {personOptions.length}</Chip>
                  {assignSelected.length > 0 && <Button size="sm" variant="ghost" onClick={() => setAssignSelected([])}>{t("b2b.btnClear")}</Button>}
                </div>
              </div>
            </div>
            <Input placeholder={t("b2b.searchPerson")} value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} />
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2 maven-scroll">
              {personOptions.length === 0 && <p className="p-2 text-xs text-muted-foreground">{t("b2b.noParticipations")}</p>}
              {personOptions.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(assignSearch.toLowerCase())).map((p) => {
                const checked = assignSelected.includes(p.id);
                const already = (assignPlan?.assignments ?? []).some((a) => a.personId === p.id);
                return (
                  <button key={p.id} type="button" disabled={already}
                    onClick={() => setAssignSelected((prev) => checked ? prev.filter((id) => id !== p.id) : [...prev, p.id])}
                    className={cn("flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition", checked ? "border-primary bg-primary/5" : "hover:bg-muted", already && "cursor-not-allowed opacity-40")}>
                    <span className={cn("grid size-4 shrink-0 place-items-center rounded border", checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                      {checked && <Icons.Check className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.firstName} {p.lastName}</span>
                    {p.company && <span className="max-w-[140px] truncate text-xs text-muted-foreground">{p.company}</span>}
                    {already && <span className="text-[10px] text-muted-foreground">{t("b2b.alreadyAssigned")}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignPlan(null)}>{t("b2b.btnCancel")}</Button>
            <Button onClick={sendAssignments} disabled={assignBusy || assignSelected.length === 0}>
              <Icons.UserPlus className="size-4" /> {assignBusy ? t("b2b.assigning") : t("b2b.assignN", { count: assignSelected.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={t("common.deleteTitle")}
        description={deleteTarget ? t("b2b.deleteConfirm", { subject: deleteTarget.subject }) : ""}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void removePlan()}
      />

      {/* Mobil Uygulama Önizlemesi — kişinin B2B kabul & görüş akışı */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Icons.Smartphone className="size-4" /> {t("b2b.mobilePreviewTitle")}</DialogTitle>
            <DialogDescription>{t("b2b.mobilePreviewDesc")}</DialogDescription>
          </DialogHeader>
          <div className="mx-auto w-full max-w-[320px] rounded-[2rem] border-4 border-slate-800 bg-slate-950 p-2 shadow-xl">
            <div className="mb-2 flex items-center justify-between px-2 pt-1 text-[10px] font-medium text-slate-400">
              <span>MAVEN Mobil</span>
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-400" /> {t("b2b.mobileMyInvites")}</span>
            </div>
            <div className="rounded-2xl bg-background p-3">
              {mobilePersons.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">{t("b2b.mobileEmptyA")}<br />{t("b2b.mobileEmptyB")}</p>
              ) : (
                <>
                  <Select value={mobilePersonId} onValueChange={setMobilePersonId}>
                    <SelectTrigger className="h-9 w-full text-xs" aria-label={t("b2b.mobileUserSelectAria")}><SelectValue placeholder={t("b2b.mobileSelectPerson")} /></SelectTrigger>
                    <SelectContent>
                      {mobilePersons.map((p) => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.company ? ` — ${p.company}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto maven-scroll">
                    {mobilePersonId === "" && <p className="py-4 text-center text-xs text-muted-foreground">{t("b2b.mobilePickPerson")}</p>}
                    {mobileAssignments.map(({ plan, a }) => (
                      <div key={a.id} className="rounded-xl border p-2.5 text-xs shadow-sm">
                        <p className="flex items-center gap-1 font-semibold"><Icons.Briefcase className="size-3.5 text-primary" /> {plan.subject}</p>
                        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                          {plan.startsAt && <p className="flex items-center gap-1"><Icons.Clock className="size-3" /> {new Date(plan.startsAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</p>}
                          {plan.venue && <p className="flex items-center gap-1"><Icons.MapPin className="size-3" /> {plan.venue}{plan.location ? ` · ${plan.location}` : ""}</p>}
                        </div>
                        <div className="mt-1.5">
                          {a.status === "ACCEPTED" ? <Chip tone="emerald">{label(B2B_ASSIGNMENT_STATUS, a.status)}{a.organizerApproved ? ` ${t("b2b.approvedShort")}` : ` ${t("b2b.pendingOrgShort")}`}</Chip>
                            : a.status === "DECLINED" ? <Chip tone="rose">{label(B2B_ASSIGNMENT_STATUS, a.status)}</Chip>
                            : <Chip tone="amber">{label(B2B_ASSIGNMENT_STATUS, a.status)}</Chip>}
                        </div>
                        {a.status !== "DECLINED" && (
                          <div className="mt-2 flex gap-1.5">
                            {a.status !== "ACCEPTED" && <Button size="sm" className="h-7 flex-1 text-xs" onClick={() => respondMobile(a, true)}><Icons.Check className="size-3.5" /> {t("b2b.btnAccept")}</Button>}
                            {a.status !== "ACCEPTED" && <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => respondMobile(a, false)}><Icons.X className="size-3.5" /> {t("b2b.btnDecline")}</Button>}
                          </div>
                        )}
                        <Textarea rows={2} className="mt-2 text-[11px]" placeholder={t("b2b.placeholderFeedback")} value={mobileFeedback[a.id] ?? a.feedback ?? ""} onChange={(e) => setMobileFeedback((prev) => ({ ...prev, [a.id]: e.target.value }))} />
                        <Button size="sm" variant="secondary" className="mt-1.5 h-7 w-full text-xs" onClick={() => saveFeedbackMobile(a)}>
                          <Icons.Send className="size-3" /> {t("b2b.btnSendFeedback")}
                        </Button>
                      </div>
                    ))}
                    {mobilePersonId !== "" && mobileAssignments.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{t("b2b.mobileNoPlans")}</p>}
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMobileOpen(false)}>{t("b2b.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
