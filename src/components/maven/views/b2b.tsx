"use client";
// B2B Planı modülü (kullanıcı isteği):
// — Kişilere B2B planı ATANIR (rol ile)
// — Gelecek olan Mobil Uygulamadan kişi planı KABUL eder, sonrasında GÖRÜŞ bildirir
// — Plan kişilerin kendi özelinde kalır (isPrivate), KARŞILIKLI ONAY sonrası ACTIVE olur
// — Giriş alanları: Saat (startsAt/endsAt), Etkinlik yeri (venue), Konum (location), Konu (subject)
import { useMemo, useState } from "react";
import { apiSend, listEntity } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, PageHeader, StatusBadge, Chip, useApi, KpiCard } from "../bits";
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
    if (!form.subject.trim()) { toast({ title: "Konu zorunlu", variant: "destructive" }); return; }
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
      toast({ title: editingId ? "B2B planı güncellendi" : "B2B planı oluşturuldu", description: form.subject });
      setFormOpen(false);
      reload(); bump();
    } catch (e) {
      toast({ title: "Kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const removePlan = async (p: B2bPlanRow) => {
    if (!window.confirm(`"${p.subject}" B2B planı ve tüm atamaları silinsin mi?`)) return;
    try {
      await apiSend(`/api/b2b-plans/${p.id}`, "DELETE");
      toast({ title: "Plan silindi" });
      reload(); bump();
    } catch (e) {
      toast({ title: "Silinemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
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
      toast({ title: "Atama tamamlandı", description: `${n} kişiye B2B planı atandı — mobil uygulamadan yanıt bekleniyor.` });
      setAssignPlan(null);
      reload(); bump();
    } catch (e) {
      toast({ title: "Atanamadı", description: e instanceof Error ? e.message : "Hata (aynı kişiye çift atama olabilir)", variant: "destructive" });
    } finally { setAssignBusy(false); }
  };

  const removeAssignment = async (a: B2bAssignmentRow) => {
    try {
      await apiSend(`/api/b2b-assignments/${a.id}`, "DELETE");
      reload(); bump();
    } catch (e) {
      toast({ title: "Atama kaldırılamadı", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    }
  };

  const organizerApprove = async (a: B2bAssignmentRow, approved: boolean) => {
    try {
      const r = await apiSend<{ planActivated?: boolean }>("/api/flows", "POST", { action: "b2b.approve", assignmentId: a.id, approved });
      toast({ title: approved ? "Organizatör onayı verildi" : "Organizatör onayı geri alındı", description: r.planActivated ? "Karşılıklı onay tamam — plan ETKİN duruma geçti!" : undefined });
      reload(); bump();
    } catch (e) {
      toast({ title: "Onay işlenemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    }
  };

  const setPlanStatus = async (p: B2bPlanRow, status: string) => {
    try {
      await apiSend(`/api/b2b-plans/${p.id}`, "PUT", { status });
      toast({ title: `Plan durumu: ${label(B2B_PLAN_STATUS, status)}` });
      reload(); bump();
    } catch (e) {
      toast({ title: "Durum değiştirilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
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
      toast({ title: accepted ? "Plan kabul edildi ✓" : "Plan reddedildi", description: r.planActivated ? "Karşılıklı onay tamamlandı — plan etkin." : "Organizatör onayı bekleniyor." });
      reload(); bump();
    } catch (e) {
      toast({ title: "Yanıt gönderilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    }
  };

  const saveFeedbackMobile = async (a: B2bAssignmentRow) => {
    try {
      const feedback = (mobileFeedback[a.id] ?? "").trim();
      if (!feedback) { toast({ title: "Görüş yazın", variant: "destructive" }); return; }
      await apiSend(`/api/b2b-assignments/${a.id}`, "PUT", { feedback, feedbackAt: new Date().toISOString() });
      toast({ title: "Görüş kaydedildi", description: "Organizatör görüşü panoda görebilir." });
      reload(); bump();
    } catch (e) {
      toast({ title: "Görüş kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    }
  };

  const mobilePersons = useMemo(() => {
    const map = new Map<string, B2bPerson>();
    for (const p of plans ?? []) for (const a of p.assignments ?? []) if (a.person && !map.has(a.person.id)) map.set(a.person.id, a.person);
    return Array.from(map.values());
  }, [plans]);

  if (!currentEditionId) return <EmptyState title="Edisyon seçin" desc="B2B planları edisyona bağlıdır." />;

  return (
    <div className="space-y-5">
      <PageHeader title="B2B Planı" desc="Konu · Saat · Etkinlik yeri · Konum girişli B2B planları — kişilere atanır, mobil uygulamadan kabul edilir, karşılıklı onayla etkinleşir">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setMobilePersonId(""); setMobileOpen(true); }}>
            <Icons.Smartphone className="size-4" /> Mobil Önizleme
          </Button>
          <Button size="sm" onClick={openCreate}><Icons.Plus className="size-4" /> Yeni B2B Planı</Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Toplam Plan" value={stats.total} icon={<Icons.Briefcase className="size-4" />} />
        <KpiCard label="Etkin" value={stats.active} tone="emerald" icon={<Icons.CheckCircle2 className="size-4" />} />
        <KpiCard label="Onay Bekleyen" value={stats.pending} tone="amber" icon={<Icons.Hourglass className="size-4" />} />
        <KpiCard label="Atama" value={stats.assignments} tone="violet" icon={<Icons.UserPlus className="size-4" />} />
        <KpiCard label="Kabul" value={stats.accepted} tone="teal" icon={<Icons.ThumbsUp className="size-4" />} />
        <KpiCard label="Görüş Bildiren" value={stats.feedbacks} tone="rose" icon={<Icons.MessageSquare className="size-4" />} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[210px]" aria-label="Durum filtresi"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm durumlar</SelectItem>
            {Object.entries(B2B_PLAN_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Chip tone="teal">{filtered.length} plan</Chip>
        <p className="text-xs text-muted-foreground">Karşılıklı onay: kişinin mobil kabulü + organizatör onayı → plan ETKİN olur.</p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Henüz B2B planı yok"
          desc="Konu, saat, etkinlik yeri ve konum bilgisi girip planı kişilere atayın; mobil uygulamadan gelen kabul ve görüşleri buradan izleyin."
          action={<Button onClick={openCreate}><Icons.Plus className="size-4" /> İlk B2B planını oluştur</Button>}
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
                desc={[p.venue, p.location].filter(Boolean).join(" · ") || "Yer/konum girilmedi"}
                action={<StatusBadge map={B2B_PLAN_STATUS} value={p.status} />}
                className="transition hover:shadow-md"
              >
                <div onDoubleClick={() => openEdit(p)} title="Çift tıkla → düzenle">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.isPrivate ? <Chip tone="violet"><span className="inline-flex items-center gap-1"><Icons.Lock className="size-3" />Kişiye özel</span></Chip> : <Chip tone="teal">Genel</Chip>}
                    {p.startsAt && <Chip><span className="inline-flex items-center gap-1"><Icons.Clock className="size-3" />{new Date(p.startsAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</span></Chip>}
                    {p.location && <Chip><span className="inline-flex items-center gap-1"><Icons.MapPin className="size-3" />{p.location}</span></Chip>}
                    <Chip tone={allAccepted && asg.some((a) => a.organizerApproved) ? "emerald" : "amber"}><Icons.Users className="mr-1 inline size-3" />{asg.length} kişi</Chip>
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
                          <span className="min-w-0 flex-1 truncate font-medium">{a.person ? `${a.person.firstName} ${a.person.lastName}` : "Kişi"}{a.person?.company ? ` — ${a.person.company}` : ""}</span>
                          <Chip>{label(B2B_ROLES, a.role)}</Chip>
                          {a.status === "ACCEPTED" ? <Chip tone="emerald">{label(B2B_ASSIGNMENT_STATUS, a.status)}</Chip>
                            : a.status === "DECLINED" ? <Chip tone="rose">{label(B2B_ASSIGNMENT_STATUS, a.status)}</Chip>
                            : <Chip tone="amber">{label(B2B_ASSIGNMENT_STATUS, a.status)}</Chip>}
                          {a.organizerApproved ? (
                            <Button size="icon" variant="ghost" className="size-6" aria-label="Organizatör onayını geri al" onClick={() => organizerApprove(a, false)} title="Onaylı — geri almak için tıkla"><Icons.BadgeCheck className="size-3.5 text-emerald-600" /></Button>
                          ) : (
                            <Button size="icon" variant="ghost" className="size-6" aria-label="Organizatör onayı ver" onClick={() => organizerApprove(a, true)} title="Organizatör onayı ver"><Icons.Circle className="size-3.5 text-muted-foreground" /></Button>
                          )}
                          <Button size="icon" variant="ghost" className="size-6" aria-label="Atamayı kaldır" onClick={() => removeAssignment(a)}><Icons.Trash2 className="size-3 text-muted-foreground" /></Button>
                        </div>
                        {a.feedback && (
                          <p className="mt-1 flex items-start gap-1 rounded bg-teal-500/10 px-1.5 py-1 text-[11px] text-teal-700">
                            <Icons.MessageSquare className="mt-0.5 size-3 shrink-0" /> Görüş: {a.feedback}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => openAssign(p)}><Icons.UserPlus className="size-3.5" /> Kişi Ata</Button>
                  {asg.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                      <Icons.List className="size-3.5" /> Atamalar ({asg.length})
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => { setMobilePersonId(""); setMobileOpen(true); }} aria-label="Mobil önizleme"><Icons.Smartphone className="size-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)} aria-label="Düzenle"><Icons.Pencil className="size-3.5" /> Düzenle</Button>
                  {p.status === "ACTIVE" && <Button size="sm" variant="ghost" onClick={() => setPlanStatus(p, "COMPLETED")}>Tamamlandı</Button>}
                  <Button size="sm" variant="ghost" className="ml-auto text-rose-500 hover:text-rose-600" onClick={() => removePlan(p)} aria-label={`${p.subject} sil`}><Icons.Trash2 className="size-3.5" /></Button>
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
            <DialogTitle>{editingId ? "B2B Planını Düzenle" : "Yeni B2B Planı"}</DialogTitle>
            <DialogDescription>Konu, saat, etkinlik yeri ve konum girilir; plan kişiye atanır, mobil uygulamadan karşılıklı onayla etkinleşir.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Konu *</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Ölçüm altyapıları iş birliği görüşmesi" className="mt-1" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Başlangıç (Saat)</Label><Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="mt-1" /></div>
              <div><Label>Bitiş</Label><Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="mt-1" /></div>
              <div><Label>Etkinlik Yeri</Label><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Lütfi Kırdar — B2B Salonu" className="mt-1" /></div>
              <div><Label>Konum (masa / stand / oda)</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Masa 12 / Stand B-04" className="mt-1" /></div>
              <div>
                <Label>Durum</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(B2B_PLAN_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <div className="flex w-full items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Kişiye özel</p>
                    <p className="text-xs text-muted-foreground">Plan yalnız atanan kişilerin özelinde kalır.</p>
                  </div>
                  <Switch checked={form.isPrivate} onCheckedChange={(v) => setForm({ ...form, isPrivate: v })} aria-label="Kişiye özel" />
                </div>
              </div>
            </div>
            <div><Label>Açıklama / Gündem</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Görüşme gündemi, hedefler…" className="mt-1" /></div>
            <div><Label>Notlar (ekip içi)</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Vazgeç</Button>
            <Button onClick={saveForm} disabled={busy}>{busy ? "Kaydediliyor…" : editingId ? "Değişiklikleri Kaydet" : "Planı Oluştur"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kişi atama diyaloğu */}
      <Dialog open={Boolean(assignPlan)} onOpenChange={(v) => !v && setAssignPlan(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Kişi Ata — {assignPlan?.subject}</DialogTitle>
            <DialogDescription>Atanan kişiler mobil uygulamadan planı kabul eder veya reddeder; organizatör onayıyla birlikte plan etkinleşir.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Rol (seçilenlere uygulanır)</Label>
                <Select value={assignRole} onValueChange={setAssignRole}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(B2B_ROLES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Seçim</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Chip tone="teal">{assignSelected.length} / {personOptions.length}</Chip>
                  {assignSelected.length > 0 && <Button size="sm" variant="ghost" onClick={() => setAssignSelected([])}>Temizle</Button>}
                </div>
              </div>
            </div>
            <Input placeholder="Kişi ara…" value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} />
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2 maven-scroll">
              {personOptions.length === 0 && <p className="p-2 text-xs text-muted-foreground">Bu edisyonda katılım kaydı yok.</p>}
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
                    {already && <span className="text-[10px] text-muted-foreground">zaten atanmış</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignPlan(null)}>Vazgeç</Button>
            <Button onClick={sendAssignments} disabled={assignBusy || assignSelected.length === 0}>
              <Icons.UserPlus className="size-4" /> {assignBusy ? "Atanıyor…" : `${assignSelected.length} kişiye ata`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobil Uygulama Önizlemesi — kişinin B2B kabul & görüş akışı */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Icons.Smartphone className="size-4" /> Mobil Uygulama Önizlemesi</DialogTitle>
            <DialogDescription>Gelen mobil uygulamada kişi, kendisine atanan B2B planlarını görür; kabul eder ve görüş bildirir.</DialogDescription>
          </DialogHeader>
          <div className="mx-auto w-full max-w-[320px] rounded-[2rem] border-4 border-slate-800 bg-slate-950 p-2 shadow-xl">
            <div className="mb-2 flex items-center justify-between px-2 pt-1 text-[10px] font-medium text-slate-400">
              <span>MAVEN Mobil</span>
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-400" /> B2B Davetlerim</span>
            </div>
            <div className="rounded-2xl bg-background p-3">
              {mobilePersons.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Henüz kimseye atama yapılmadı.<br />Bir plana “Kişi Ata” ile başlayın.</p>
              ) : (
                <>
                  <Select value={mobilePersonId} onValueChange={setMobilePersonId}>
                    <SelectTrigger className="h-9 w-full text-xs" aria-label="Mobil kullanıcı seçimi"><SelectValue placeholder="Kişi seçin (mobil kullanıcı)" /></SelectTrigger>
                    <SelectContent>
                      {mobilePersons.map((p) => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.company ? ` — ${p.company}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto maven-scroll">
                    {mobilePersonId === "" && <p className="py-4 text-center text-xs text-muted-foreground">Davetlerini görmek için kişi seçin.</p>}
                    {mobileAssignments.map(({ plan, a }) => (
                      <div key={a.id} className="rounded-xl border p-2.5 text-xs shadow-sm">
                        <p className="flex items-center gap-1 font-semibold"><Icons.Briefcase className="size-3.5 text-primary" /> {plan.subject}</p>
                        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                          {plan.startsAt && <p className="flex items-center gap-1"><Icons.Clock className="size-3" /> {new Date(plan.startsAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</p>}
                          {plan.venue && <p className="flex items-center gap-1"><Icons.MapPin className="size-3" /> {plan.venue}{plan.location ? ` · ${plan.location}` : ""}</p>}
                        </div>
                        <div className="mt-1.5">
                          {a.status === "ACCEPTED" ? <Chip tone="emerald">{label(B2B_ASSIGNMENT_STATUS, a.status)}{a.organizerApproved ? " · Onaylı" : " · Org. onayı bekleniyor"}</Chip>
                            : a.status === "DECLINED" ? <Chip tone="rose">{label(B2B_ASSIGNMENT_STATUS, a.status)}</Chip>
                            : <Chip tone="amber">{label(B2B_ASSIGNMENT_STATUS, a.status)}</Chip>}
                        </div>
                        {a.status !== "DECLINED" && (
                          <div className="mt-2 flex gap-1.5">
                            {a.status !== "ACCEPTED" && <Button size="sm" className="h-7 flex-1 text-xs" onClick={() => respondMobile(a, true)}><Icons.Check className="size-3.5" /> Kabul Et</Button>}
                            {a.status !== "ACCEPTED" && <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => respondMobile(a, false)}><Icons.X className="size-3.5" /> Reddet</Button>}
                          </div>
                        )}
                        <Textarea rows={2} className="mt-2 text-[11px]" placeholder="Görüşünüzü yazın…" value={mobileFeedback[a.id] ?? a.feedback ?? ""} onChange={(e) => setMobileFeedback((prev) => ({ ...prev, [a.id]: e.target.value }))} />
                        <Button size="sm" variant="secondary" className="mt-1.5 h-7 w-full text-xs" onClick={() => saveFeedbackMobile(a)}>
                          <Icons.Send className="size-3" /> Görüşü Gönder
                        </Button>
                      </div>
                    ))}
                    {mobilePersonId !== "" && mobileAssignments.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Bu kişiye atanmış B2B planı yok.</p>}
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMobileOpen(false)}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
