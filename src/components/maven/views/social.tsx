"use client";
// Sosyal Etkinlik & Tur Planı — BİRLEŞİK modül (kullanıcı isteği):
// Sosyal etkinlik planları ile tur planları tek ekranda; planların çeşidi (type)
// ve resmi/resmi olmayan ayrımı (isOfficial) olur; planlar kişilere DUYURULUR.
import { useMemo, useState } from "react";
import { apiSend, listEntity } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, PageHeader, StatusBadge, Chip, useApi, KpiCard } from "../bits";
import {
  SOCIAL_KINDS, SOCIAL_PLAN_TYPES, SOCIAL_PLAN_STATUS, SOCIAL_ANNOUNCE_CHANNELS, SOCIAL_RESPONSE,
  label,
} from "@/lib/constants";
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

// datetime-local ↔ ISO yardımcıları
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface PlanAnnouncement {
  id: string;
  personId?: string | null;
  fullName?: string | null;
  channel: string;
  message?: string | null;
  response?: string | null;
  respondedAt?: string | null;
  sentAt: string;
}

interface SocialPlanRow {
  id: string;
  editionId: string;
  kind: string; // SOCIAL | TOUR
  type: string;
  isOfficial: boolean;
  title: string;
  description?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  venue?: string | null;
  meetingPoint?: string | null;
  capacity?: number | null;
  price?: number | null;
  currency: string;
  status: string;
  notes?: string | null;
  announcements?: PlanAnnouncement[];
  _count?: { announcements?: number };
}

interface PersonLite { id: string; firstName: string; lastName: string; company?: string | null; email?: string | null }

const emptyForm = {
  title: "", kind: "SOCIAL", type: "GALA", isOfficial: false,
  startsAt: "", endsAt: "", venue: "", meetingPoint: "",
  capacity: "", price: "", currency: "TRY", status: "DRAFT",
  description: "", notes: "",
};

export function SocialView() {
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();

  const { data: plans, reload } = useApi<SocialPlanRow[]>(
    () => listEntity<SocialPlanRow>("social-plans", { editionId: currentEditionId ?? undefined, limit: 200 }),
    [currentEditionId, refreshKey],
  );

  // duyuru için kişi kaynağı: edisyon katılımları (person include)
  const { data: participations } = useApi<{ id: string; person: PersonLite }[]>(
    () => listEntity("participations", { editionId: currentEditionId ?? undefined, limit: 500 }),
    [currentEditionId, refreshKey],
  );

  const [kindFilter, setKindFilter] = useState<"ALL" | "SOCIAL" | "TOUR">("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [officialFilter, setOfficialFilter] = useState<"ALL" | "OFFICIAL" | "NORMAL">("ALL");

  // ── plan formu (create + edit — çift tık ile açılır) ──
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);

  // ── duyuru diyaloğu ──
  const [announcePlan, setAnnouncePlan] = useState<SocialPlanRow | null>(null);
  const [announceChannel, setAnnounceChannel] = useState("IN_APP");
  const [announceMessage, setAnnounceMessage] = useState("");
  const [announceSelected, setAnnounceSelected] = useState<string[]>([]);
  const [announceBusy, setAnnounceBusy] = useState(false);
  const [announceSearch, setAnnounceSearch] = useState("");

  // ── duyuru listesi görünümü ──
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const personOptions = useMemo(() => {
    const map = new Map<string, PersonLite>();
    for (const p of participations ?? []) if (p.person && !map.has(p.person.id)) map.set(p.person.id, p.person);
    return Array.from(map.values());
  }, [participations]);

  const filtered = useMemo(() => (plans ?? []).filter((p) => {
    if (kindFilter !== "ALL" && p.kind !== kindFilter) return false;
    if (typeFilter !== "ALL" && p.type !== typeFilter) return false;
    if (officialFilter === "OFFICIAL" && !p.isOfficial) return false;
    if (officialFilter === "NORMAL" && p.isOfficial) return false;
    return true;
  }), [plans, kindFilter, typeFilter, officialFilter]);

  const stats = useMemo(() => {
    const all = plans ?? [];
    const announcedPeople = new Set<string>();
    for (const p of all) for (const a of p.announcements ?? []) if (a.personId) announcedPeople.add(a.personId);
    return {
      total: all.length,
      social: all.filter((p) => p.kind === "SOCIAL").length,
      tour: all.filter((p) => p.kind === "TOUR").length,
      official: all.filter((p) => p.isOfficial).length,
      announcedPeople: announcedPeople.size,
      accepted: all.reduce((s, p) => s + (p.announcements ?? []).filter((a) => a.response === "ACCEPTED").length, 0),
    };
  }, [plans]);

  const openCreate = () => { setEditingId(null); setForm({ ...emptyForm }); setFormOpen(true); };

  const openEdit = (p: SocialPlanRow) => {
    setEditingId(p.id);
    setForm({
      title: p.title, kind: p.kind, type: p.type, isOfficial: p.isOfficial,
      startsAt: toLocalInput(p.startsAt), endsAt: toLocalInput(p.endsAt),
      venue: p.venue ?? "", meetingPoint: p.meetingPoint ?? "",
      capacity: p.capacity != null ? String(p.capacity) : "",
      price: p.price != null ? String(p.price) : "",
      currency: p.currency ?? "TRY", status: p.status,
      description: p.description ?? "", notes: p.notes ?? "",
    });
    setFormOpen(true);
  };

  const saveForm = async () => {
    if (!currentEditionId) return;
    if (!form.title.trim()) { toast({ title: "Başlık zorunlu", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const body = {
        title: form.title.trim(), kind: form.kind, type: form.type, isOfficial: form.isOfficial,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        venue: form.venue || null, meetingPoint: form.meetingPoint || null,
        capacity: form.capacity ? Number(form.capacity) : null,
        price: form.price ? Number(form.price) : null,
        currency: form.currency, status: form.status,
        description: form.description || null, notes: form.notes || null,
        editionId: currentEditionId,
      };
      if (editingId) await apiSend(`/api/social-plans/${editingId}`, "PUT", body);
      else await apiSend("/api/social-plans", "POST", body);
      toast({ title: editingId ? "Plan güncellendi" : "Plan oluşturuldu", description: `${form.title} — ${label(SOCIAL_KINDS, form.kind)}` });
      setFormOpen(false);
      reload(); bump();
    } catch (e) {
      toast({ title: "Kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const removePlan = async (p: SocialPlanRow) => {
    if (!window.confirm(`"${p.title}" planı ve tüm duyuruları silinsin mi?`)) return;
    try {
      await apiSend(`/api/social-plans/${p.id}`, "DELETE");
      toast({ title: "Plan silindi" });
      reload(); bump();
    } catch (e) {
      toast({ title: "Silinemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    }
  };

  const openAnnounce = (p: SocialPlanRow) => {
    setAnnouncePlan(p);
    setAnnounceChannel("IN_APP");
    setAnnounceMessage(`${p.title} — ${p.startsAt ? new Date(p.startsAt).toLocaleString("tr-TR") : "tarih açıklanacak"} tarihli ${label(SOCIAL_KINDS, p.kind).toLowerCase()} planına davetlisiniz.`);
    setAnnounceSelected([]);
    setAnnounceSearch("");
  };

  const sendAnnouncements = async () => {
    if (!announcePlan || announceSelected.length === 0) {
      toast({ title: "Kişi seçin", variant: "destructive" }); return;
    }
    setAnnounceBusy(true);
    try {
      let n = 0;
      for (const personId of announceSelected) {
        const person = personOptions.find((p) => p.id === personId);
        await apiSend("/api/social-announcements", "POST", {
          planId: announcePlan.id, personId,
          fullName: person ? `${person.firstName} ${person.lastName}` : null,
          channel: announceChannel, message: announceMessage || null, response: "INVITED",
        });
        n++;
      }
      if (announcePlan.status === "DRAFT") {
        await apiSend(`/api/social-plans/${announcePlan.id}`, "PUT", { status: "ANNOUNCED" });
      }
      toast({ title: "Duyuru gönderildi", description: `${n} kişiye ${label(SOCIAL_ANNOUNCE_CHANNELS, announceChannel).toLowerCase()} ile duyuruldu.` });
      setAnnouncePlan(null);
      reload(); bump();
    } catch (e) {
      toast({ title: "Duyuru gönderilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setAnnounceBusy(false); }
  };

  // duyuru yanıtı (mobil/portal simülasyonu — listeden yanıt değiştirilebilir)
  const setResponse = async (a: PlanAnnouncement, response: "ACCEPTED" | "DECLINED") => {
    try {
      await apiSend(`/api/social-announcements/${a.id}`, "PUT", { response, respondedAt: new Date().toISOString() });
      toast({ title: response === "ACCEPTED" ? "Katılıyor işaretlendi" : "Katılmıyor işaretlendi" });
      reload(); bump();
    } catch (e) {
      toast({ title: "Yanıt kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    }
  };

  const removeAnnouncement = async (a: PlanAnnouncement) => {
    try {
      await apiSend(`/api/social-announcements/${a.id}`, "DELETE");
      reload(); bump();
    } catch (e) {
      toast({ title: "Duyuru silinemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    }
  };

  if (!currentEditionId) return <EmptyState title="Edisyon seçin" desc="Sosyal & tur planları edisyona bağlıdır." />;

  const typeOptions = Object.entries(SOCIAL_PLAN_TYPES).filter(([k]) =>
    kindFilter === "TOUR" ? ["CULTURAL_TOUR", "CITY_TOUR", "TECHNICAL_TOUR", "OTHER"].includes(k) : true);

  return (
    <div className="space-y-5">
      <PageHeader title="Sosyal & Tur Planı" desc="Sosyal etkinlik planları ile tur planları tek modülde — çeşit seçilir, resmi plandır, kişilere duyurulur">
        <Button size="sm" onClick={openCreate}><Icons.Plus className="size-4" /> Yeni Plan</Button>
      </PageHeader>

      {/* KPI şeridi */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Toplam Plan" value={stats.total} icon={<Icons.CalendarDays className="size-4" />} />
        <KpiCard label="Sosyal Etkinlik" value={stats.social} tone="amber" icon={<Icons.PartyPopper className="size-4" />} />
        <KpiCard label="Tur Planı" value={stats.tour} tone="teal" icon={<Icons.Bus className="size-4" />} />
        <KpiCard label="Resmi Plan" value={stats.official} tone="violet" icon={<Icons.Landmark className="size-4" />} />
        <KpiCard label="Duyurulan Kişi" value={stats.announcedPeople} tone="neutral" icon={<Icons.Megaphone className="size-4" />} />
        <KpiCard label="Katılıyor" value={stats.accepted} tone="emerald" icon={<Icons.CheckCircle2 className="size-4" />} />
      </div>

      {/* filtreler */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border p-1">
          {(["ALL", "SOCIAL", "TOUR"] as const).map((k) => (
            <button key={k} onClick={() => setKindFilter(k)}
              className={cn("rounded px-2.5 py-1 text-xs font-medium transition", kindFilter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {k === "ALL" ? "Tümü" : label(SOCIAL_KINDS, k)}
            </button>
          ))}
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-[170px]" aria-label="Tür filtresi"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm türler</SelectItem>
            {typeOptions.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-1 rounded-lg border p-1">
          {([["ALL", "Tümü"], ["OFFICIAL", "Resmi"], ["NORMAL", "Resmi Değil"]] as const).map(([k, v]) => (
            <button key={k} onClick={() => setOfficialFilter(k)}
              className={cn("rounded px-2.5 py-1 text-xs font-medium transition", officialFilter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {v}
            </button>
          ))}
        </div>
        <Chip tone="teal">{filtered.length} plan</Chip>
      </div>

      {/* plan kartları — çift tık ile düzenle (her öğe kuralı) */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Henüz plan yok"
          desc="Gala, kokteyl, resmi yemek, kültür/teknik tur… Tüm sosyal planlar ve turlar bu ekranda toplanır."
          action={<Button onClick={openCreate}><Icons.Plus className="size-4" /> İlk planı oluştur</Button>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((p) => {
            const isTour = p.kind === "TOUR";
            const anns = p.announcements ?? [];
            const accepted = anns.filter((a) => a.response === "ACCEPTED").length;
            return (
              <SectionCard
                key={p.id}
                title={p.title}
                desc={[label(SOCIAL_PLAN_TYPES, p.type), p.venue].filter(Boolean).join(" · ")}
                action={<StatusBadge map={SOCIAL_PLAN_STATUS} value={p.status} />}
                className="cursor-pointer transition hover:shadow-md"
              >
                <div onDoubleClick={() => openEdit(p)} title="Çift tıkla → düzenle">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip tone={isTour ? "teal" : "amber"}><span className="inline-flex items-center gap-1">{isTour ? <Icons.Bus className="size-3" /> : <Icons.PartyPopper className="size-3" />}{label(SOCIAL_KINDS, p.kind)}</span></Chip>
                    {p.isOfficial && <Chip tone="violet"><span className="inline-flex items-center gap-1"><Icons.Landmark className="size-3" />Resmi</span></Chip>}
                    {p.capacity != null && <Chip>{p.capacity} kişi kapasite</Chip>}
                    {p.price != null && /* F6: kuruş→₺ */ (<Chip tone="emerald">{(p.price / 100).toLocaleString("tr-TR")} {p.currency}</Chip>)}
                    {anns.length > 0 && <Chip>{anns.length} duyuru{accepted > 0 ? ` · ${accepted} katılıyor` : ""}</Chip>}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {p.startsAt && <p className="flex items-center gap-1.5"><Icons.CalendarDays className="size-3.5" /> {new Date(p.startsAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })}{p.endsAt ? ` — ${new Date(p.endsAt).toLocaleTimeString("tr-TR", { timeStyle: "short" })}` : ""}</p>}
                    {p.venue && <p className="flex items-center gap-1.5"><Icons.MapPin className="size-3.5" /> {p.venue}</p>}
                    {p.meetingPoint && <p className="flex items-center gap-1.5"><Icons.Flag className="size-3.5" /> Buluşma: {p.meetingPoint}</p>}
                    {p.description && <p className="line-clamp-2 pt-0.5">{p.description}</p>}
                    {p.notes && <p className="line-clamp-1 italic"><Icons.StickyNote className="mr-1 inline size-3.5" />{p.notes}</p>}
                  </div>
                </div>

                {/* duyurular */}
                {expandedId === p.id && (
                  <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto rounded-lg border bg-muted/30 p-2 maven-scroll">
                    {anns.length === 0 && <p className="p-2 text-xs text-muted-foreground">Henüz duyuru yok — “Duyur” ile kişi seçin.</p>}
                    {anns.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 rounded border bg-background px-2 py-1.5 text-xs">
                        <Icons.User className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-medium">{a.fullName ?? "Kişi"}</span>
                        <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">{label(SOCIAL_ANNOUNCE_CHANNELS, a.channel)}</span>
                        {a.response === "ACCEPTED" ? <Chip tone="emerald">{label(SOCIAL_RESPONSE, a.response)}</Chip>
                          : a.response === "DECLINED" ? <Chip tone="rose">{label(SOCIAL_RESPONSE, a.response)}</Chip>
                          : <Chip tone="amber">{label(SOCIAL_RESPONSE, "INVITED")}</Chip>}
                        <Button size="icon" variant="ghost" className="size-6" aria-label="Katılıyor" onClick={() => setResponse(a, "ACCEPTED")}><Icons.Check className="size-3 text-emerald-600" /></Button>
                        <Button size="icon" variant="ghost" className="size-6" aria-label="Katılmıyor" onClick={() => setResponse(a, "DECLINED")}><Icons.X className="size-3 text-rose-500" /></Button>
                        <Button size="icon" variant="ghost" className="size-6" aria-label="Duyuruyu sil" onClick={() => removeAnnouncement(a)}><Icons.Trash2 className="size-3 text-muted-foreground" /></Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => openAnnounce(p)}><Icons.Megaphone className="size-3.5" /> Duyur</Button>
                  {anns.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                      <Icons.BellRing className="size-3.5" /> Duyurular ({anns.length})
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)} aria-label={`${p.title} düzenle`}><Icons.Pencil className="size-3.5" /> Düzenle</Button>
                  <Button size="sm" variant="ghost" className="ml-auto text-rose-500 hover:text-rose-600" onClick={() => removePlan(p)} aria-label={`${p.title} sil`}><Icons.Trash2 className="size-3.5" /></Button>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}

      {/* Plan formu — create + edit aynı diyalo */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl maven-scroll">
          <DialogHeader>
            <DialogTitle>{editingId ? "Planı Düzenle" : "Yeni Sosyal / Tur Planı"} </DialogTitle>
            <DialogDescription>Sosyal etkinlik ve tur planları bu tek formdan yönetilir; tür ve resmi ayrımı seçilir.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm({ ...form, kind: "SOCIAL" })}
                className={cn("flex items-center justify-center gap-2 rounded-lg border-2 p-2.5 text-sm font-medium transition", form.kind === "SOCIAL" ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:border-primary/30")}>
                <Icons.PartyPopper className="size-4" /> Sosyal Etkinlik
              </button>
              <button type="button" onClick={() => setForm({ ...form, kind: "TOUR", type: form.type.startsWith("GALA") || ["GALA", "COCKTAIL", "OFFICIAL_DINNER", "WELCOME_RECEPTION", "CLOSING", "NETWORKING"].includes(form.type) ? "CULTURAL_TOUR" : form.type })}
                className={cn("flex items-center justify-center gap-2 rounded-lg border-2 p-2.5 text-sm font-medium transition", form.kind === "TOUR" ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:border-primary/30")}>
                <Icons.Bus className="size-4" /> Tur Planı
              </button>
            </div>
            <div><Label>Başlık *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Açılış Galası / Eski Şehir Turu" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tür</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SOCIAL_PLAN_TYPES).filter(([k]) => form.kind === "TOUR" ? ["CULTURAL_TOUR", "CITY_TOUR", "TECHNICAL_TOUR", "OTHER"].includes(k) : !["CULTURAL_TOUR", "CITY_TOUR", "TECHNICAL_TOUR"].includes(k)).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Durum</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SOCIAL_PLAN_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Resmi plan</p>
                <p className="text-xs text-muted-foreground">Kurum / konakçı adına düzenlenen resmi sosyal plan (protokol).</p>
              </div>
              <Switch checked={form.isOfficial} onCheckedChange={(v) => setForm({ ...form, isOfficial: v })} aria-label="Resmi plan" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Başlangıç</Label><Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="mt-1" /></div>
              <div><Label>Bitiş</Label><Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="mt-1" /></div>
              <div><Label>{form.kind === "TOUR" ? "Tur Başlangıç Noktası" : "Mekân"}</Label><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder={form.kind === "TOUR" ? "Kongre merkezi girişi" : "Haliç Kongre Merkezi"} className="mt-1" /></div>
              <div><Label>Buluşma Noktası / Notu</Label><Input value={form.meetingPoint} onChange={(e) => setForm({ ...form, meetingPoint: e.target.value })} placeholder="18:30'da lobby'de buluşma" className="mt-1" /></div>
              <div><Label>Kapasite</Label><Input type="number" min={0} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="200" className="mt-1" /></div>
              <div className="grid grid-cols-[1fr_90px] gap-2">
                <div><Label>Ücret</Label><Input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0 = ücretsiz" className="mt-1" /></div>
                <div><Label>Dvz.</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} className="mt-1" /></div>
              </div>
            </div>
            <div><Label>Açıklama</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Kısa program akışı, dress code, ikram…" className="mt-1" /></div>
            <div><Label>Notlar (ekip içi)</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Vazgeç</Button>
            <Button onClick={saveForm} disabled={busy}>{busy ? "Kaydediliyor…" : editingId ? "Değişiklikleri Kaydet" : "Planı Oluştur"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duyuru diyaloğu */}
      <Dialog open={Boolean(announcePlan)} onOpenChange={(v) => !v && setAnnouncePlan(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Plana Duyur — {announcePlan?.title}</DialogTitle>
            <DialogDescription>Katılımcı listesinden kişi seçin; duyuru kaydı bu plana işlenir ve plan Duyuruldu durumuna geçer.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kanal</Label>
                <Select value={announceChannel} onValueChange={setAnnounceChannel}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SOCIAL_ANNOUNCE_CHANNELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Duyurulacak kişi sayısı</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Chip tone="teal">{announceSelected.length} / {personOptions.length}</Chip>
                  {announceSelected.length > 0 && <Button size="sm" variant="ghost" onClick={() => setAnnounceSelected([])}>Temizle</Button>}
                </div>
              </div>
            </div>
            <div><Label>Mesaj</Label><Textarea rows={3} value={announceMessage} onChange={(e) => setAnnounceMessage(e.target.value)} className="mt-1" /></div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label>Kişiler (edisyon katılımcıları)</Label>
                <Button size="sm" variant="outline" onClick={() => setAnnounceSelected(personOptions.map((p) => p.id))}>Tümünü seç</Button>
              </div>
              <Input placeholder="Kişi ara…" value={announceSearch} onChange={(e) => setAnnounceSearch(e.target.value)} className="mb-2" />
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2 maven-scroll">
                {personOptions.length === 0 && <p className="p-2 text-xs text-muted-foreground">Bu edisyonda katılım kaydı yok — önce Kayıt & Katılımcılar ekranından katılım ekleyin.</p>}
                {personOptions.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(announceSearch.toLowerCase())).map((p) => {
                  const checked = announceSelected.includes(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => setAnnounceSelected((prev) => checked ? prev.filter((id) => id !== p.id) : [...prev, p.id])}
                      className={cn("flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition", checked ? "border-primary bg-primary/5" : "hover:bg-muted")}>
                      <span className={cn("grid size-4 shrink-0 place-items-center rounded border", checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                        {checked && <Icons.Check className="size-3" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{p.firstName} {p.lastName}</span>
                      {p.company && <span className="max-w-[140px] truncate text-xs text-muted-foreground">{p.company}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAnnouncePlan(null)}>Vazgeç</Button>
            <Button onClick={sendAnnouncements} disabled={announceBusy || announceSelected.length === 0}>
              <Icons.Send className="size-4" /> {announceBusy ? "Gönderiliyor…" : `${announceSelected.length} kişiye duyur`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
