"use client";
// Konaklama — gecelik stok (§32), rezervasyon teyidi (§09-E), oda-gece metriği
// R9-d genişletmesi: occupancy/rate/gece düzenleme, no-show akışı, misafir hiyerarşisi (bağımlı kişi + refakatçi).
// R10-c genişletmesi: Otel Ekle/Düzenle diyaloğu (tüm HotelProperty alanları) + Medya Arşivi'ne bağlantılı logo/kapak yükleme.
import { useState } from "react";
import { listEntity, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { ACCOMMODATION_STATUS, OCCUPANCY_TYPE, RELATION_TYPE, fmtDate, fmtMoney, fmtMoneyMajor, label } from "@/lib/constants";
import { toMinor, fromMinor } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useLang, t } from "@/lib/i18n";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

interface HotelRow {
  id: string; name: string; city?: string | null; district?: string | null; contactName?: string | null; contactPhone?: string | null;
  address?: string | null; email?: string | null; website?: string | null; starRating?: number | null; checkInNote?: string | null; notes?: string | null;
  // TASK-B 25: kompakt portal alanları — tamamı kullanıcı girişi (SIFIR hardcode)
  mapsUrl?: string | null; transportInfo?: string | null; localPhoneCode?: string | null; powerInfo?: string | null;
  logoUrl?: string | null; imageUrl?: string | null;
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
  useLang(); // dil değişiminde re-render (t() parça sözlükten okur)
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

  // ── otel ekle/düzenle: tüm HotelProperty alanları + Medya Arşivi'ne bağlantılı logo/kapak (R10-c)
  const [hotelDialog, setHotelDialog] = useState<{ target: HotelRow | null } | null>(null);
  const [hotelForm, setHotelForm] = useState({
    name: "", city: "", district: "", address: "", starRating: "__none__", checkInNote: "",
    contactName: "", contactPhone: "", email: "", website: "", notes: "", logoUrl: "", imageUrl: "",
    mapsUrl: "", transportInfo: "", localPhoneCode: "", powerInfo: "",
  });
  const [hotelPending, setHotelPending] = useState<{ logo?: { dataUrl: string }; cover?: { dataUrl: string } }>({});
  const [hotelMediaBusy, setHotelMediaBusy] = useState<"logo" | "cover" | null>(null);

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
      ratePerNight: fromMinor(r.ratePerNight ?? 0), // F6: kuruş→₺ girdi
      nights: nightsSaved(r),
      noShow: r.noShow ?? false,
      noShowFee: fromMinor(r.noShowFee ?? 0), // F6: kuruş→₺ girdi
    });
    setEditRes(r);
  };

  const saveEdit = async () => {
    if (!editRes) return;
    setBusy(true);
    try {
      await apiSend(`/api/reservations/${editRes.id}`, "PUT", {
        occupancyType: editForm.occupancyType === "__none__" ? null : editForm.occupancyType,
        ratePerNight: toMinor(Number(editForm.ratePerNight) || 0), // F6: ₺ girdi→kuruş
        nights: Math.max(0, Math.round(Number(editForm.nights) || 0)),
        noShow: editForm.noShow,
        noShowFee: editForm.noShow ? toMinor(Number(editForm.noShowFee) || 0) : 0, // F6: ₺→kuruş
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
      await apiSend(`/api/reservations/${noShowRes.id}`, "PUT", { noShow: true, noShowFee: toMinor(Number(noShowFee) || 0) }); // F6
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
        description: t("accommodation.guestProfileCreated", {
          note: participationNote === "yeni katılım" ? t("accommodation.guestNewParticipation") : t("accommodation.guestExistingParticipation"),
          companion: guestForm.makeCompanion ? t("accommodation.guestPlusCompanion") : "",
          slot: guestForm.addSlot ? t("accommodation.guestPlusSlot") : "",
        }),
      });
      setAddGuestOpen(false);
      reloadPeople(); reloadCompanions(); reloadRes(); setGuestTick((t) => t + 1); bump();
    } catch (e) {
      toast({ title: "Misafir eklenemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const openCreateHotel = () => {
    setHotelForm({ name: "", city: "", district: "", address: "", starRating: "__none__", checkInNote: "", contactName: "", contactPhone: "", email: "", website: "", notes: "", logoUrl: "", imageUrl: "", mapsUrl: "", transportInfo: "", localPhoneCode: "", powerInfo: "" });
    setHotelPending({});
    setHotelDialog({ target: null });
  };

  const openEditHotel = (h: HotelRow) => {
    setHotelForm({
      name: h.name, city: h.city ?? "", district: h.district ?? "", address: h.address ?? "",
      starRating: h.starRating ? String(h.starRating) : "__none__", checkInNote: h.checkInNote ?? "",
      contactName: h.contactName ?? "", contactPhone: h.contactPhone ?? "", email: h.email ?? "",
      website: h.website ?? "", notes: h.notes ?? "", logoUrl: h.logoUrl ?? "", imageUrl: h.imageUrl ?? "",
      mapsUrl: h.mapsUrl ?? "", transportInfo: h.transportInfo ?? "", localPhoneCode: h.localPhoneCode ?? "", powerInfo: h.powerInfo ?? "",
    });
    setHotelPending({});
    setHotelDialog({ target: h });
  };

  // Medya Arşivi → Otel Görselleri klasörüne benzersiz adla yükle + otel kaydına yaz
  const uploadHotelMedia = async (hotelId: string, kind: "logo" | "cover", dataUrl: string) => {
    const hotelName = hotelForm.name.trim() || "otel";
    const r = await apiSend<{ asset: { id: string; dataUrl: string | null } }>("/api/media/upload-linked", "POST", {
      editionId: currentEditionId,
      systemFolder: "OTEL",
      linkedType: "HOTEL",
      linkedId: hotelId,
      name: `${hotelName}-${kind === "logo" ? "logosu" : "kapak"}`,
      dataUrl,
    });
    const url = r.asset.dataUrl ?? dataUrl;
    await apiSend(`/api/hotels/${hotelId}`, "PUT", kind === "logo" ? { logoUrl: url } : { imageUrl: url });
  };

  const onHotelMediaPick = (kind: "logo" | "cover", file: File) => {
    if (file.size > 600 * 1024) {
      toast({ title: "Dosya 600KB sınırı aşılıyor", description: "Daha küçük bir görsel seçin — arşive gömme tavanı 600KB'dir.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) return;
      setHotelForm((prev) => ({ ...prev, [kind === "logo" ? "logoUrl" : "imageUrl"]: dataUrl })); // anında önizleme
      if (hotelDialog?.target) {
        // düzenleme modu: hemen yükle ve kayda yaz
        setHotelMediaBusy(kind);
        uploadHotelMedia(hotelDialog.target.id, kind, dataUrl)
          .then(() => {
            toast({ title: kind === "logo" ? "Logo yüklendi" : "Kapak görseli yüklendi", description: "Medya Arşivi → Otel Görselleri klasörüne benzersiz adla kaydedildi." });
            reload(); bump();
          })
          .catch((e) => toast({ title: "Görsel yüklenemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" }))
          .finally(() => setHotelMediaBusy(null));
      } else {
        // yeni otel: POST id döndükten sonra yüklenecek (saveHotel içinde)
        setHotelPending((prev) => ({ ...prev, [kind]: { dataUrl } }));
      }
    };
    reader.readAsDataURL(file);
  };

  const saveHotel = async () => {
    if (!currentEditionId || !hotelForm.name.trim()) return;
    setBusy(true);
    try {
      // yalnızca skaler alanlar — registry include'u roomTypes/blocks döndürür, asla gönderilmez
      const scalars = {
        name: hotelForm.name.trim(),
        city: hotelForm.city.trim(),
        district: hotelForm.district.trim(),
        address: hotelForm.address.trim(),
        starRating: hotelForm.starRating === "__none__" ? null : Number(hotelForm.starRating),
        checkInNote: hotelForm.checkInNote.trim(),
        contactName: hotelForm.contactName.trim(),
        contactPhone: hotelForm.contactPhone.trim(),
        email: hotelForm.email.trim(),
        website: hotelForm.website.trim(),
        notes: hotelForm.notes.trim(),
        // TASK-B 25: kompakt portal alanları — değerler yalnız kullanıcı girişinden gelir
        mapsUrl: hotelForm.mapsUrl.trim(),
        transportInfo: hotelForm.transportInfo.trim(),
        localPhoneCode: hotelForm.localPhoneCode.trim(),
        powerInfo: hotelForm.powerInfo.trim(),
      };
      let hotelId = hotelDialog?.target?.id ?? null;
      if (hotelId) {
        // düzenleme: görsel alanlarını da taşı ("" → null ile kaldırma desteklenir)
        await apiSend(`/api/hotels/${hotelId}`, "PUT", { ...scalars, logoUrl: hotelForm.logoUrl || null, imageUrl: hotelForm.imageUrl || null });
      } else {
        const created = await apiSend<{ id: string }>("/api/hotels", "POST", { editionId: currentEditionId, ...scalars });
        hotelId = created.id;
      }
      // bekleyen logo/kapak — yeni otelde id döndükten sonra yüklenir
      for (const kind of ["logo", "cover"] as const) {
        const pm = hotelPending[kind];
        if (pm?.dataUrl) await uploadHotelMedia(hotelId, kind, pm.dataUrl);
      }
      toast({
        title: hotelDialog?.target ? "Otel güncellendi" : "Otel eklendi",
        description: hotelDialog?.target
          ? `${scalars.name} — iletişim ve kontrat ayrıntıları kaydedildi.`
          : `${scalars.name} · logo/kapak görselleri Medya Arşivi → Otel Görselleri klasörüne bağlandı.`,
      });
      setHotelDialog(null);
      reload(); bump();
    } catch (e) {
      toast({ title: "Otel kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  // diyaloğa gömülü medya seçici (logo / kapak)
  const renderHotelMediaPicker = (kind: "logo" | "cover") => {
    const isLogo = kind === "logo";
    const preview = isLogo ? hotelForm.logoUrl : hotelForm.imageUrl;
    const inputId = isLogo ? "hotel-logo-input" : "hotel-cover-input";
    return (
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold"><Icons.Image className="size-3.5 text-muted-foreground" /> {isLogo ? "Otel logosu" : "Kapak görseli"}</p>
        <div className="flex items-center gap-2">
          <span className={cn("grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border", preview ? "bg-white" : "bg-muted")}>
            {preview ? <img src={preview} alt={isLogo ? "Logo önizleme" : "Kapak önizleme"} className={cn("size-full", isLogo ? "object-contain p-0.5" : "object-cover")} /> : <Icons.Building2 className="size-4 text-muted-foreground/50" />}
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <label htmlFor={inputId} className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border bg-card px-1.5 text-[11px] font-medium transition-colors hover:bg-muted">
              {hotelMediaBusy === kind ? <Icons.Loader2 className="size-3 animate-spin" /> : <Icons.Upload className="size-3" />}
              {preview ? "Değiştir" : "Görsel seç"}
            </label>
            {preview && (
              <button type="button" className="text-[10px] text-rose-600 hover:underline" onClick={() => { setHotelForm((p) => ({ ...p, [isLogo ? "logoUrl" : "imageUrl"]: "" })); setHotelPending((p) => ({ ...p, [kind]: undefined })); }}>
                Kaldır
              </button>
            )}
          </div>
        </div>
        <Input
          id={inputId}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label={isLogo ? "Otel logosu yükle" : "Kapak görseli yükle"}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onHotelMediaPick(kind, f); e.target.value = ""; }}
        />
      </div>
    );
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

      <SectionCard
        title="Oteller"
        desc="kontratlı oteller, iletişim ayrıntıları ve oda stoğu — çift tıkla düzenle"
        action={
          <Button size="sm" onClick={openCreateHotel}>
            <Icons.Hotel className="size-4" /> Otel Ekle
          </Button>
        }
      >
        {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (hotels ?? []).length === 0 ? (
          <EmptyState title="Henüz oda bloğu tanımlanmadı" desc="'Otel Ekle' ile ilk oteli ekleyin — logo, adres, ilgili kişi ve e-posta ayrıntılarıyla." />
        ) : (
          <div className="space-y-3">
            {(hotels ?? []).map((h) => (
              <div
                key={h.id}
                onDoubleClick={() => openEditHotel(h)}
                title="Çift tık: oteli düzenle"
                className="cursor-pointer overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="space-y-2.5 p-3">
                  <div className={cn("grid gap-3", h.imageUrl && "sm:grid-cols-2")}>
                    <div className="flex min-w-0 items-start gap-3">
                      {h.logoUrl ? (
                        <img src={h.logoUrl} alt={`${h.name} logosu`} className="size-11 shrink-0 rounded-lg border bg-white object-contain p-0.5" />
                      ) : (
                        <span className="grid size-11 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground"><Icons.Building className="size-5" /></span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{h.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{[h.district, h.city].filter(Boolean).join(" · ") || "konum belirtilmedi"}</p>
                        {h.starRating ? (
                          <p className="mt-0.5 text-xs text-amber-500" aria-label={`${h.starRating} yıldız`}>
                            {"★".repeat(h.starRating)}
                            <span className="text-muted-foreground/30">{"★".repeat(5 - h.starRating)}</span>
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-label={`${h.name} otelini düzenle`}
                        onClick={() => openEditHotel(h)}
                        className="grid size-7 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Icons.Pencil className="size-3.5" />
                      </button>
                    </div>
                    {h.imageUrl && (
                      <div className="relative h-28 overflow-hidden rounded-lg border bg-muted sm:h-auto sm:min-h-24">
                        <img
                          src={h.imageUrl}
                          alt={`${h.name} kapak görseli`}
                          loading="lazy"
                          className="absolute inset-0 size-full object-cover"
                        />
                      </div>
                    )}
                  </div>

                  {(h.address || h.checkInNote || h.contactName || h.contactPhone) && (
                    <div className="space-y-1.5">
                      {h.address && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Icons.MapPin className="size-3 shrink-0" aria-hidden />
                          <span className="min-w-0 truncate" title={h.address}>{h.address}</span>
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {h.contactName && <Chip tone="teal"><Icons.UserRound className="mr-1 inline size-3" />{h.contactName}</Chip>}
                        {h.contactPhone && <Chip tone="teal"><Icons.Phone className="mr-1 inline size-3" />{h.contactPhone}</Chip>}
                        {h.checkInNote && <Chip tone="amber"><Icons.KeyRound className="mr-1 inline size-3" />{h.checkInNote}</Chip>}
                      </div>
                    </div>
                  )}

                  {(h.email || h.website) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      {h.email && (
                        <a href={`mailto:${h.email}`} className="inline-flex min-w-0 items-center gap-1 text-teal-700 hover:underline">
                          <Icons.Mail className="size-3 shrink-0" aria-hidden /><span className="truncate">{h.email}</span>
                        </a>
                      )}
                      {h.website && (
                        <a href={h.website.startsWith("http") ? h.website : `https://${h.website}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-teal-700 hover:underline">
                          <Icons.ExternalLink className="size-3 shrink-0" aria-hidden /> web sitesi
                        </a>
                      )}
                    </div>
                  )}

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
              </div>
            ))}
          </div>
        )}
      </SectionCard>

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
                  <p className="text-lg font-semibold tabular-nums text-teal-800">{fmtMoney(toMinor((Number(editForm.ratePerNight) || 0) * (Number(editForm.nights) || 0)))}</p>
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

      {/* Otel ekle/düzenle diyaloğu — tüm HotelProperty alanları + bağlantılı medya (R10-c) */}
      <Dialog open={Boolean(hotelDialog)} onOpenChange={(o) => !o && setHotelDialog(null)}>
        <DialogContent className="maven-scroll max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Icons.Hotel className="size-4 text-teal-600" /> {hotelDialog?.target ? t("accommodation.editHotel") : "Otel Ekle"}</DialogTitle>
            <DialogDescription>
              {hotelDialog?.target
                ? `${hotelDialog.target.name} — iletişim, adres ve kontrat ayrıntılarını güncelleyin.`
                : "Kontratlı oteli tüm ayrıntılarıyla tanımlayın; logo ve kapak görseli Medya Arşivi'ne bağlanır."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
              {renderHotelMediaPicker("logo")}
              {renderHotelMediaPicker("cover")}
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground sm:col-span-2">
                <Icons.Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                Medya Arşivi → Otel Görselleri klasörüne benzersiz adla kaydedilir (≤600KB).
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="h-name">Otel adı *</Label>
                <Input id="h-name" value={hotelForm.name} onChange={(e) => setHotelForm({ ...hotelForm, name: e.target.value })} placeholder="örn. Hilton İstanbul Bomonti" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h-city">Şehir</Label>
                <Input id="h-city" value={hotelForm.city} onChange={(e) => setHotelForm({ ...hotelForm, city: e.target.value })} placeholder="İstanbul" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h-district">Semt / İlçe</Label>
                <Input id="h-district" value={hotelForm.district} onChange={(e) => setHotelForm({ ...hotelForm, district: e.target.value })} placeholder="Bomonti" />
              </div>
              <div className="space-y-1.5">
                <Label>Yıldız derecesi</Label>
                <Select value={hotelForm.starRating} onValueChange={(v) => setHotelForm({ ...hotelForm, starRating: v })}>
                  <SelectTrigger aria-label="Yıldız derecesi"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Belirtilmedi</SelectItem>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        <span className="text-amber-500">{"★".repeat(n)}</span> ({n} yıldız)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="h-address">Adres</Label>
                <Textarea id="h-address" rows={2} value={hotelForm.address} onChange={(e) => setHotelForm({ ...hotelForm, address: e.target.value })} placeholder="Mahalle, sokak, numara…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h-contact">İlgili kişi</Label>
                <Input id="h-contact" value={hotelForm.contactName} onChange={(e) => setHotelForm({ ...hotelForm, contactName: e.target.value })} placeholder="Rezervasyon müdürü" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h-phone">Telefon</Label>
                <Input id="h-phone" type="tel" value={hotelForm.contactPhone} onChange={(e) => setHotelForm({ ...hotelForm, contactPhone: e.target.value })} placeholder="+90 212 000 00 00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h-email">E-posta</Label>
                <Input id="h-email" type="email" value={hotelForm.email} onChange={(e) => setHotelForm({ ...hotelForm, email: e.target.value })} placeholder="rezervasyon@otel.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h-web">Web sitesi</Label>
                <Input id="h-web" value={hotelForm.website} onChange={(e) => setHotelForm({ ...hotelForm, website: e.target.value })} placeholder="https://otel.com" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="h-checkin">Giriş / çıkış notu</Label>
                <Input id="h-checkin" value={hotelForm.checkInNote} onChange={(e) => setHotelForm({ ...hotelForm, checkInNote: e.target.value })} placeholder="Giriş 14:00 / Çıkış 12:00" />
              </div>
              {/* TASK-B 25: kompakt portal alanları — tamamı kullanıcı girişi, sıfır hazır değer */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="h-maps">{t("accommodation.hMapsUrl")}</Label>
                <Input id="h-maps" type="url" inputMode="url" value={hotelForm.mapsUrl} onChange={(e) => setHotelForm({ ...hotelForm, mapsUrl: e.target.value })} placeholder={t("accommodation.hMapsUrlPh")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="h-transport">{t("accommodation.hTransport")}</Label>
                <Textarea id="h-transport" rows={2} value={hotelForm.transportInfo} onChange={(e) => setHotelForm({ ...hotelForm, transportInfo: e.target.value })} placeholder={t("accommodation.hTransportPh")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2 sm:flex sm:items-start sm:gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="h-localphone">{t("accommodation.hLocalPhone")}</Label>
                  <Input id="h-localphone" value={hotelForm.localPhoneCode} onChange={(e) => setHotelForm({ ...hotelForm, localPhoneCode: e.target.value })} placeholder={t("accommodation.hLocalPhonePh")} />
                </div>
                <div className="mt-3 flex-1 space-y-1.5 sm:mt-0">
                  <Label htmlFor="h-power">{t("accommodation.hPower")}</Label>
                  <Input id="h-power" value={hotelForm.powerInfo} onChange={(e) => setHotelForm({ ...hotelForm, powerInfo: e.target.value })} placeholder={t("accommodation.hPowerPh")} />
                </div>
              </div>
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground sm:col-span-2">
                <Icons.Compass className="mt-0.5 size-3 shrink-0" aria-hidden />
                {t("accommodation.hPortalFieldsHint")}
              </p>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="h-notes">Notlar</Label>
                <Textarea id="h-notes" rows={2} value={hotelForm.notes} onChange={(e) => setHotelForm({ ...hotelForm, notes: e.target.value })} placeholder="kontrat şartları, iptal politikası, servet…" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHotelDialog(null)}>Vazgeç</Button>
            <Button onClick={saveHotel} disabled={busy || !hotelForm.name.trim()}>
              {busy ? "Kaydediliyor…" : hotelDialog?.target ? "Kaydet" : "Otel Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
