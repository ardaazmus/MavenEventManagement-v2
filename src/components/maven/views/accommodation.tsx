"use client";
// Konaklama — gecelik stok (§32), rezervasyon teyidi (§09-E), oda-gece metriği
// R9-d genişletmesi: occupancy/rate/gece düzenleme, no-show akışı, misafir hiyerarşisi (bağımlı kişi + refakatçi).
import { useState } from "react";
import { listEntity, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { ACCOMMODATION_STATUS, OCCUPANCY_TYPE, RELATION_TYPE, fmtDate, fmtMoney, label } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

interface HotelRow {
  id: string; name: string; city?: string | null; district?: string | null; contactName?: string | null; contactPhone?: string | null;
  roomTypes: { id: string; name: string; capacity: number; pricePerNight: number; currency: string }[];
  blocks: { id: string; name: string; releaseDate?: string | null; cancellationPolicy?: string | null; roomType: { name: string; id: string }; inventoryNights: { id: string; date: string; totalRooms: number; reservedRooms: number }[] }[];
}
interface ReservationRow {
  id: string; guestName: string; checkIn: string; checkOut: string; status: string; payerType: string; payerName?: string | null;
  occupancyType?: string | null; ratePerNight?: number; nights?: number; noShow?: boolean; noShowFee?: number;
  block?: { name: string; hotel: { name: string }; roomType: { name: string } } | null;
  primaryGuest?: { id: string; person: { id: string; firstName: string; lastName: string } } | null;
  occupancySlots: { id: string; guestName?: string | null; position: number }[];
}
interface PersonRow {
  id: string; firstName: string; lastName: string; email?: string | null; parentPersonId?: string | null; relationType?: string | null;
}
interface CompanionRow {
  id: string; participationId: string; name: string; type: string; notes?: string | null;
}

const NO_SHOW_NOTE = "Gerçekleşmeyen konaklama ücreti faturaya no-show kalemi olarak yansır — sistemden düşme kaydıdır.";
const COMPANION_AGE = { ADULT: "Yetişkin", CHILD: "Çocuk", INFANT: "Bebek (0-2)" } as const;

export function AccommodationView() {
  const { currentEditionId, tenant, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: hotels, error, reload, loading } = useApi<HotelRow[]>(() => listEntity<HotelRow>("hotels", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);
  const { data: reservations, reload: reloadRes } = useApi<ReservationRow[]>(() => listEntity<ReservationRow>("reservations", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);
  const { data: people, reload: reloadPeople } = useApi<PersonRow[]>(() => listEntity<PersonRow>("people", { tenantId: tenant?.id ?? undefined, limit: 500 }), [tenant?.id, refreshKey]);

  // ── düzenleme / no-show / misafir diyaloğu durumları
  const [editRes, setEditRes] = useState<ReservationRow | null>(null);
  const [editForm, setEditForm] = useState({ occupancyType: "__none__", ratePerNight: 0, nights: 0, noShow: false, noShowFee: 0 });
  const [noShowRes, setNoShowRes] = useState<ReservationRow | null>(null);
  const [noShowFee, setNoShowFee] = useState(0);
  const [guestRes, setGuestRes] = useState<ReservationRow | null>(null);
  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [guestForm, setGuestForm] = useState({ firstName: "", lastName: "", relationType: "SPOUSE", ageType: "ADULT", makeCompanion: true, addSlot: true });
  const [busy, setBusy] = useState(false);
  const [guestTick, setGuestTick] = useState(0);

  const { data: companions, reload: reloadCompanions } = useApi<CompanionRow[]>(
    () => listEntity<CompanionRow>("companions", { participationId: guestRes?.primaryGuest?.id ?? "__none__" }),
    [guestRes?.primaryGuest?.id, refreshKey, guestTick],
  );

  const nightsOf = (r: ReservationRow) => Math.max(1, Math.round((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 86400000));
  const nightsSaved = (r: ReservationRow) => (r.nights && r.nights > 0 ? r.nights : nightsOf(r));
  const totalOf = (r: ReservationRow) => (r.ratePerNight ?? 0) * nightsSaved(r);
  const roomNightsSold = (reservations ?? []).filter((r) => ["RESERVED", "CONFIRMED", "CHECKED_IN"].includes(r.status)).reduce((s, r) => s + nightsSaved(r), 0);
  const pendingRes = (reservations ?? []).filter((r) => ["REQUESTED", "WAITLIST"].includes(r.status));
  const confirmedCount = (reservations ?? []).filter((r) => ["CONFIRMED", "CHECKED_IN"].includes(r.status)).length;
  const noShowList = (reservations ?? []).filter((r) => r.noShow);
  const noShowFeeTotal = noShowList.reduce((s, r) => s + (r.noShowFee ?? 0), 0);
  const occupancyBreakdown = (["SINGLE", "DOUBLE", "FAMILY_SHARED"] as const).map((t) => ({
    type: t,
    count: (reservations ?? []).filter((r) => r.occupancyType === t && !r.noShow && r.status !== "CANCELLED").length,
  }));

  const confirm = async (r: ReservationRow) => {
    setBusyId(r.id);
    try {
      await apiSend("/api/flows", "POST", { action: "reservation.confirm", reservationId: r.id });
      toast({ title: "Rezervasyon teyit edildi", description: `${nightsOf(r)} oda-gece stoktan tüketildi.` });
      reload(); bump();
    } catch (e) {
      toast({ title: "Teyit engellendi", description: e instanceof Error ? e.message : "Bir gece eksikse 'teyitli' görünmez.", variant: "destructive" });
    } finally { setBusyId(null); }
  };

  // ── rezervasyon düzenleme (occupancy / rate / gece / no-show)
  const openEdit = (r: ReservationRow) => {
    setEditForm({
      occupancyType: r.occupancyType ?? "__none__",
      ratePerNight: r.ratePerNight ?? 0,
      nights: nightsSaved(r),
      noShow: r.noShow ?? false,
      noShowFee: r.noShowFee ?? 0,
    });
    setEditRes(r);
  };

  const saveEdit = async () => {
    if (!editRes) return;
    setBusy(true);
    try {
      await apiSend(`/api/reservations/${editRes.id}`, "PUT", {
        occupancyType: editForm.occupancyType === "__none__" ? null : editForm.occupancyType,
        ratePerNight: Number(editForm.ratePerNight) || 0,
        nights: Math.max(0, Math.round(Number(editForm.nights) || 0)),
        noShow: editForm.noShow,
        noShowFee: editForm.noShow ? Number(editForm.noShowFee) || 0 : 0,
      });
      toast({ title: "Rezervasyon güncellendi", description: `${editRes.guestName} · oda tipi/fiyat/gece kaydedildi.` });
      setEditRes(null);
      reloadRes(); bump();
    } catch (e) {
      toast({ title: "Güncellenemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  // ── no-show hızlı aksiyon (sistemden düş)
  const openNoShow = (r: ReservationRow) => {
    setNoShowFee((r.ratePerNight ?? 0) > 0 ? (r.ratePerNight ?? 0) * nightsSaved(r) : 0);
    setNoShowRes(r);
  };

  const markNoShow = async () => {
    if (!noShowRes) return;
    setBusy(true);
    try {
      await apiSend(`/api/reservations/${noShowRes.id}`, "PUT", { noShow: true, noShowFee: Number(noShowFee) || 0 });
      toast({ title: "No-show işaretlendi", description: `${noShowRes.guestName} sistemden düşüldü — ücret faturaya kalem olarak yansır.` });
      setNoShowRes(null);
      reloadRes(); bump();
    } catch (e) {
      toast({ title: "İşaretlenemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  // ── misafir hiyerarşisi: bağımlı kişi + refakatçi + konuk slotu
  const dependentsOf = (personId: string) => (people ?? []).filter((p) => p.parentPersonId === personId);
  const primaryDependents = guestRes?.primaryGuest ? dependentsOf(guestRes.primaryGuest.person.id) : [];

  const openAddGuest = () => {
    setGuestForm({ firstName: "", lastName: "", relationType: "SPOUSE", ageType: "ADULT", makeCompanion: true, addSlot: true });
    setAddGuestOpen(true);
  };

  const addGuestProfile = async () => {
    const r = guestRes;
    if (!r?.primaryGuest || !tenant?.id || !currentEditionId || !guestForm.firstName.trim() || !guestForm.lastName.trim()) return;
    setBusy(true);
    try {
      // 1) Person — self-referencing parentPersonId ile (Parent_ID kuralı)
      const person = await apiSend<{ id: string }>("/api/people", "POST", {
        tenantId: tenant.id,
        firstName: guestForm.firstName.trim(),
        lastName: guestForm.lastName.trim(),
        parentPersonId: r.primaryGuest.person.id,
        relationType: guestForm.relationType,
      });
      // 2) Katılım (bu edisyonda yoksa) — @@unique([editionId, personId]) güvencesi
      const existing = await listEntity<{ id: string }>("participations", { editionId: currentEditionId, personId: person.id });
      let participationId = existing[0]?.id ?? null;
      let participationNote = "mevcut katılım";
      if (!participationId) {
        const created = await apiSend<{ id: string }>("/api/participations", "POST", { editionId: currentEditionId, personId: person.id });
        participationId = created.id;
        participationNote = "yeni katılım";
      }
      // 3) Refakatçi kaydı (ana konuğun katılımına)
      if (guestForm.makeCompanion) {
        await apiSend("/api/companions", "POST", {
          participationId: r.primaryGuest.id,
          name: `${guestForm.firstName.trim()} ${guestForm.lastName.trim()}`,
          type: guestForm.ageType,
        });
      }
      // 4) Rezervasyon konuk slotu
      if (guestForm.addSlot && participationId) {
        await apiSend("/api/occupancy-slots", "POST", {
          reservationId: r.id,
          participationId,
          guestName: `${guestForm.firstName.trim()} ${guestForm.lastName.trim()}`,
        });
      }
      toast({
        title: "Misafir profili eklendi",
        description: `Kişi + ${participationNote}${guestForm.makeCompanion ? " + refakatçi" : ""}${guestForm.addSlot ? " + konuk slotu" : ""} kuruldu.`,
      });
      setAddGuestOpen(false);
      reloadPeople(); reloadCompanions(); reloadRes(); setGuestTick((t) => t + 1); bump();
    } catch (e) {
      toast({ title: "Misafir eklenemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Konaklama & Seyahat" desc="Oda stoğu gün bazlıdır — 1 oda × 3 gece = 3 oda-gece; bir gece eksikse teyit engellenir" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Otel" value={(hotels ?? []).length} icon={<Icons.Building className="size-4" />} />
        <KpiCard label="Rezervasyon" value={(reservations ?? []).length} sub={`${pendingRes.length} teyit bekleyen`} tone="amber" icon={<Icons.BedDouble className="size-4" />} />
        <KpiCard label="Oda-Gece (satış)" value={roomNightsSold} sub="ayrılan toplam" tone="emerald" icon={<Icons.Moon className="size-4" />} />
        <KpiCard label="Bekleme Listesi" value={(reservations ?? []).filter((r) => r.status === "WAITLIST").length} tone="rose" icon={<Icons.Clock className="size-4" />} />
        <KpiCard
          label="No-Show"
          value={noShowList.length}
          sub={noShowList.length ? `${fmtMoney(noShowFeeTotal)} toplam no-show ücreti` : "gerçekleşmeyen konaklama yok"}
          tone={noShowList.length ? "rose" : "neutral"}
          icon={<Icons.UserX className="size-4" />}
        />
      </div>

      {/* doluluk tipi dağılımı */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-2.5 shadow-sm">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icons.BedSingle className="size-3.5" /> Doluluk tipi:</span>
        {occupancyBreakdown.map((o) => (
          <Chip key={o.type} tone={o.count ? "teal" : "neutral"}>{label(OCCUPANCY_TYPE, o.type)}: <b className="tabular-nums">{o.count}</b></Chip>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">no-show ve iptaller dağılıma katılmaz</span>
      </div>

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (hotels ?? []).length === 0 ? (
        <EmptyState title="Henüz oda bloğu tanımlanmadı" desc="Konaklama taleplerini açmadan önce otel ve tarihleri ekleyin." />
      ) : (
        (hotels ?? []).map((h) => (
          <SectionCard key={h.id} title={h.name} desc={`${h.district ?? h.city ?? ""} · iletişim: ${h.contactName ?? "—"}`}>
            <div className="space-y-4">
              {h.blocks.map((b) => {
                const total = b.inventoryNights.reduce((s, n) => s + n.totalRooms, 0);
                const reserved = b.inventoryNights.reduce((s, n) => s + n.reservedRooms, 0);
                return (
                  <div key={b.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{b.name} <span className="font-normal text-muted-foreground">· {b.roomType.name}</span></p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>satılabilir {total} oda-gece · ayrılan {reserved} (%{total ? Math.round((reserved / total) * 100) : 0})</span>
                        {b.releaseDate && <Chip tone={new Date(b.releaseDate) < new Date(Date.now() + 7 * 86400000) ? "rose" : "neutral"}>release {fmtDate(b.releaseDate)}</Chip>}
                      </div>
                    </div>
                    {/* gecelik stok çizelgesi */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {b.inventoryNights.map((n) => {
                        const free = n.totalRooms - n.reservedRooms;
                        const pctFill = n.totalRooms ? (n.reservedRooms / n.totalRooms) * 100 : 0;
                        return (
                          <div key={n.id} className={cn("w-20 rounded-md border p-1.5 text-center text-[10px]", free === 0 ? "border-rose-300 bg-rose-50" : pctFill > 80 ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50/60")}>
                            <p className="font-semibold">{fmtDate(n.date).slice(0, 6)}</p>
                            <p className="tabular-nums font-bold text-xs">{n.reservedRooms}/{n.totalRooms}</p>
                            <p className="text-muted-foreground">{free === 0 ? "dolu" : `${free} boş`}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ))
      )}

      <SectionCard title="Rezervasyonlar" desc="varış/çıkış, doluluk tipi, gecelik fiyat, misafir bağlantıları — rezervasyon ile ödeyen aynı olmak zorunda değil (§35)">
        {(reservations ?? []).length === 0 ? (
          <EmptyState title="Rezervasyon yok" />
        ) : (
          <div className="maven-scroll max-h-96 space-y-2 overflow-y-auto pr-1">
            {(reservations ?? []).map((r) => {
              const total = totalOf(r);
              return (
                <div key={r.id} className={cn("flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30", r.noShow && "border-rose-200 bg-rose-50/40")}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {r.guestName}
                      {r.primaryGuest && <span className="font-normal text-muted-foreground">← {r.primaryGuest.person.firstName} {r.primaryGuest.person.lastName}</span>}
                      {r.noShow && <Chip tone="rose"><Icons.UserX className="mr-0.5 inline size-3" />NO-SHOW</Chip>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.block ? `${r.block.hotel.name} · ${r.block.roomType.name}` : "blok yok"} · {fmtDate(r.checkIn)} → {fmtDate(r.checkOut)} ({nightsOf(r)} gece) · ödeyen: {r.payerType}{r.payerName ? ` — ${r.payerName}` : ""}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                      {r.occupancyType && <Chip tone="teal">{label(OCCUPANCY_TYPE, r.occupancyType)}</Chip>}
                      {(r.ratePerNight ?? 0) > 0 && (
                        <span className="tabular-nums">
                          {fmtMoney(r.ratePerNight)}/gece × {nightsSaved(r)} gece = <b className="text-foreground">{fmtMoney(total)}</b>
                        </span>
                      )}
                      {r.noShow && <span className="font-medium tabular-nums text-rose-600">no-show ücreti: {fmtMoney(r.noShowFee)}</span>}
                    </p>
                  </div>
                  {r.occupancySlots.length > 0 && <Chip tone="teal">{r.occupancySlots.length} konuk slotu</Chip>}
                  <StatusBadge map={ACCOMMODATION_STATUS} value={r.status} />
                  <div className="flex flex-wrap items-center gap-1.5">
                    {r.primaryGuest && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setGuestRes(r); setGuestTick((t) => t + 1); }}>
                        <Icons.Users className="size-3.5" /> Konuklar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => openEdit(r)}>
                      <Icons.Pencil className="size-3.5" /> Düzenle
                    </Button>
                    {!r.noShow && (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => openNoShow(r)} disabled={busyId === r.id}>
                              <Icons.UserX className="size-3.5" /> No-show işaretle
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-56 text-xs">{NO_SHOW_NOTE}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {["REQUESTED", "WAITLIST"].includes(r.status) && r.block && (
                      <Button size="sm" onClick={() => confirm(r)} disabled={busyId === r.id}>
                        {busyId === r.id ? "Kontrol ediliyor…" : "Teyit Et"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Rezervasyon düzenleme diyaloğu */}
      <Dialog open={Boolean(editRes)} onOpenChange={(o) => !o && setEditRes(null)}>
        <DialogContent className="maven-scroll max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rezervasyon Düzenle — {editRes?.guestName}</DialogTitle>
            <DialogDescription>
              {editRes?.block ? `${editRes.block.hotel.name} · ${editRes.block.roomType.name}` : "blok yok"} · {editRes && `${fmtDate(editRes.checkIn)} → ${fmtDate(editRes.checkOut)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Doluluk tipi</Label>
                <Select value={editForm.occupancyType} onValueChange={(v) => setEditForm({ ...editForm, occupancyType: v })}>
                  <SelectTrigger aria-label="Doluluk tipi"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Tanımsız</SelectItem>
                    {Object.entries(OCCUPANCY_TYPE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rate-input">Gecelik fiyat (₺)</Label>
                <Input id="rate-input" type="number" min={0} step={100} value={editForm.ratePerNight} onChange={(e) => setEditForm({ ...editForm, ratePerNight: Number(e.target.value) })} className="tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="nights-input">Gece sayısı</Label>
                  {editRes && (
                    <button type="button" onClick={() => setEditForm({ ...editForm, nights: nightsOf(editRes) })} className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:underline">
                      <Icons.Calculator className="size-3" /> Geceleri hesapla
                    </button>
                  )}
                </div>
                <Input id="nights-input" type="number" min={0} value={editForm.nights} onChange={(e) => setEditForm({ ...editForm, nights: Number(e.target.value) })} className="tabular-nums" />
              </div>
              <div className="flex items-end">
                <div className="w-full rounded-lg bg-teal-500/10 px-3 py-2 text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-teal-700/70">hesaplanan toplam</p>
                  <p className="text-lg font-semibold tabular-nums text-teal-800">{fmtMoney((Number(editForm.ratePerNight) || 0) * (Number(editForm.nights) || 0))}</p>
                </div>
              </div>
            </div>

            <div className={cn("rounded-lg border p-3 transition-colors", editForm.noShow ? "border-rose-200 bg-rose-50/50" : "bg-muted/30")}>
              <div className="flex items-center justify-between gap-2">
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label htmlFor="noshow-switch" className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium">
                        <Icons.UserX className="size-3.5 text-rose-600" /> No-show (sistemden düş)
                        <Icons.Info className="size-3 text-muted-foreground" />
                      </label>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-64 text-xs">{NO_SHOW_NOTE}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Switch id="noshow-switch" checked={editForm.noShow} onCheckedChange={(v) => setEditForm({ ...editForm, noShow: v })} />
              </div>
              {editForm.noShow && (
                <div className="mt-2.5 space-y-1.5">
                  <Label htmlFor="noshow-fee" className="text-xs">No-show ücreti (₺)</Label>
                  <Input id="noshow-fee" type="number" min={0} step={100} value={editForm.noShowFee} onChange={(e) => setEditForm({ ...editForm, noShowFee: Number(e.target.value) })} className="tabular-nums" />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRes(null)}>Vazgeç</Button>
            <Button onClick={saveEdit} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No-show hızlı işaretleme diyaloğu */}
      <Dialog open={Boolean(noShowRes)} onOpenChange={(o) => !o && setNoShowRes(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Icons.UserX className="size-4 text-rose-600" /> No-show İşaretle</DialogTitle>
            <DialogDescription>{noShowRes?.guestName}{noShowRes ? ` · ${fmtDate(noShowRes.checkIn)} → ${fmtDate(noShowRes.checkOut)}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-800">
            {NO_SHOW_NOTE} Konuk gelmediyse rezervasyon <b>CANCELLED</b> durumuna geçmiş olmalı; bu işaret ücret kalemini üretir.
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quick-fee">Faturaya yansıyacak ücret (₺)</Label>
            <Input id="quick-fee" type="number" min={0} step={100} value={noShowFee} onChange={(e) => setNoShowFee(Number(e.target.value))} className="tabular-nums" />
            <p className="text-[11px] text-muted-foreground">Varsayılan: gecelik fiyat × gece sayısı — gerektiği gibi düşürün.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoShowRes(null)}>Vazgeç</Button>
            <Button onClick={markNoShow} disabled={busy} className="bg-rose-600 text-white hover:bg-rose-700">{busy ? "İşaretleniyor…" : "No-show İşaretle"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konuk bağlantıları diyaloğu — bağımlılar + refakatçiler + slotlar */}
      <Dialog open={Boolean(guestRes)} onOpenChange={(o) => { if (!o) { setGuestRes(null); setAddGuestOpen(false); } }}>
        <DialogContent className="maven-scroll max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Icons.Users className="size-4 text-teal-600" /> Konuk Bağlantıları</DialogTitle>
            <DialogDescription>
              {guestRes?.guestName}
              {guestRes?.primaryGuest && <> — ana konuk: <b>{guestRes.primaryGuest.person.firstName} {guestRes.primaryGuest.person.lastName}</b></>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><Icons.UserPlus className="size-3.5 text-muted-foreground" /> Bağımlı kişiler <span className="font-normal text-muted-foreground">(Person.parentPersonId — Parent_ID kuralı)</span></p>
              {primaryDependents.length === 0 ? (
                <p className="rounded-md border border-dashed px-2.5 py-2 text-[11px] text-muted-foreground">Henüz bağımlı kişi yok — eş, çocuk, misafir profili ekleyin.</p>
              ) : (
                <div className="space-y-1">
                  {primaryDependents.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
                      <span className="font-medium">{d.firstName} {d.lastName}</span>
                      <Chip tone="teal">{label(RELATION_TYPE, d.relationType)}</Chip>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><Icons.HeartHandshake className="size-3.5 text-muted-foreground" /> Refakatçiler <span className="font-normal text-muted-foreground">(Companion — §34)</span></p>
              {(companions ?? []).length === 0 ? (
                <p className="rounded-md border border-dashed px-2.5 py-2 text-[11px] text-muted-foreground">Refakatçi kaydı yok.</p>
              ) : (
                <div className="space-y-1">
                  {(companions ?? []).map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
                      <span className="font-medium">{c.name}</span>
                      <Chip tone="amber">{COMPANION_AGE[c.type as keyof typeof COMPANION_AGE] ?? c.type}</Chip>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><Icons.BedDouble className="size-3.5 text-muted-foreground" /> Rezervasyon konuk slotları</p>
              {(guestRes?.occupancySlots ?? []).length === 0 ? (
                <p className="rounded-md border border-dashed px-2.5 py-2 text-[11px] text-muted-foreground">Slot yok — oda paylaşımlıysa konukları ekleyin.</p>
              ) : (
                <div className="space-y-1">
                  {(guestRes?.occupancySlots ?? []).map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
                      <span className="font-medium">{s.guestName ?? "—"}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">#{s.position}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuestRes(null)}>Kapat</Button>
            {guestRes?.primaryGuest && <Button onClick={openAddGuest}><Icons.UserPlus className="size-3.5" /> Misafir profil ekle</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Misafir profil ekleme diyaloğu */}
      <Dialog open={addGuestOpen} onOpenChange={(o) => !o && setAddGuestOpen(false)}>
        <DialogContent className="maven-scroll max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Misafir Profil Ekle</DialogTitle>
            <DialogDescription>
              {guestRes?.primaryGuest && <>Ana konuk <b>{guestRes.primaryGuest.person.firstName} {guestRes.primaryGuest.person.lastName}</b> altına bağlı kişi oluşturulur — kişi + katılım zinciri otomatik kurulur.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="g-first">Ad</Label>
              <Input id="g-first" value={guestForm.firstName} onChange={(e) => setGuestForm({ ...guestForm, firstName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-last">Soyad</Label>
              <Input id="g-last" value={guestForm.lastName} onChange={(e) => setGuestForm({ ...guestForm, lastName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Yakınlık (relationType)</Label>
              <Select value={guestForm.relationType} onValueChange={(v) => setGuestForm({ ...guestForm, relationType: v })}>
                <SelectTrigger aria-label="Yakınlık"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RELATION_TYPE).filter(([k]) => k !== "SELF").map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Refakatçi yaşı</Label>
              <Select value={guestForm.ageType} onValueChange={(v) => setGuestForm({ ...guestForm, ageType: v })}>
                <SelectTrigger aria-label="Refakatçi yaşı"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(COMPANION_AGE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 sm:col-span-2">
              <div>
                <p className="text-xs font-medium">Refakatçi kaydı oluştur</p>
                <p className="text-[11px] text-muted-foreground">Ana konuğun katılımına Companion satırı eklenir (otel/kahvaltı hakları).</p>
              </div>
              <Switch checked={guestForm.makeCompanion} onCheckedChange={(v) => setGuestForm({ ...guestForm, makeCompanion: v })} aria-label="Refakatçi kaydı" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 sm:col-span-2">
              <div>
                <p className="text-xs font-medium">Rezervasyona konuk slotu ekle</p>
                <p className="text-[11px] text-muted-foreground">Odada kalacak kişiler listesine (OccupancySlot) düşer.</p>
              </div>
              <Switch checked={guestForm.addSlot} onCheckedChange={(v) => setGuestForm({ ...guestForm, addSlot: v })} aria-label="Konuk slotu" />
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-dashed p-2.5 text-[11px] text-muted-foreground sm:col-span-2">
              <Icons.CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-teal-600" />
              Kişi kaydı <b>parentPersonId</b> ile ana konuğa bağlanır; bu edisyonda katılımı yoksa otomatik açılır.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddGuestOpen(false)}>Vazgeç</Button>
            <Button onClick={addGuestProfile} disabled={busy || !guestForm.firstName.trim() || !guestForm.lastName.trim()}>{busy ? "Ekleniyor…" : "Ekle"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
