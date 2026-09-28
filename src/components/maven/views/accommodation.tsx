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
import { RoomingMatrixConsole } from "@/components/maven/accommodation/rooming-matrix-console";

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
interface ParticipationRow {
  id: string;
  person: { id: string; firstName: string; lastName: string; email?: string | null };
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
  const { data: participations } = useApi<ParticipationRow[]>(() => listEntity<ParticipationRow>("participations", { editionId: currentEditionId ?? undefined, limit: 500 }), [currentEditionId, refreshKey]);

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

  // ── MANUEL REZERVASYON — kullanıcı ilkesi: tek veri girişi kaynağı olmamalı,
  // her zaman manuel giriş de olmalı (Konaklama: telefon/e-postayla gelen talepler)
  const [resOpen, setResOpen] = useState(false);
  // ── DOSYA İÇE AKTARMA — otel rooming listeleri / e-postayla gelen rezervasyon listeleri
  const [fileImportOpen, setFileImportOpen] = useState(false);
  const [resForm, setResForm] = useState({
    guestMode: "participant", participationId: "", filter: "", guestName: "",
    hotelId: "", blockId: "__none__", roomTypeId: "__none__",
    checkIn: "", checkOut: "", occupancyType: "SINGLE",
    payerType: "SELF", payerName: "", rate: "", status: "REQUESTED", notes: "",
  });
  // ── stok yönetimi: oda tipi / blok / gecelik stok (otel kartından açılır)
  const [rtDialog, setRtDialog] = useState<HotelRow | null>(null);
  const [rtForm, setRtForm] = useState({ name: "", capacity: "2", price: "" });
  const [blkDialog, setBlkDialog] = useState<HotelRow | null>(null);
  const [blkForm, setBlkForm] = useState({ name: "", roomTypeId: "__none__", releaseDate: "" });
  const [stockDialog, setStockDialog] = useState<{ hotel: HotelRow; block: HotelRow["blocks"][number] } | null>(null);
  const [stockForm, setStockForm] = useState({ from: "", to: "", rooms: "10", mode: "add" });

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

  // ── manuel rezervasyon: türetilmiş değerler + gönderim ──
  const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parseDayLocal = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : null);
  const sameDayLocal = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const resHotel = (hotels ?? []).find((h) => h.id === resForm.hotelId) ?? null;
  const resBlock = resHotel?.blocks.find((b) => b.id === resForm.blockId) ?? null;
  const resNights = (() => {
    const a = parseDayLocal(resForm.checkIn);
    const b = parseDayLocal(resForm.checkOut);
    if (!a || !b) return null;
    const n = Math.round((b.getTime() - a.getTime()) / 86400000);
    return n >= 1 ? n : null;
  })();
  const resStockPreview = (() => {
    if (!resBlock || !resNights) return null;
    const a = parseDayLocal(resForm.checkIn)!;
    const out: { label: string; free: number | null }[] = [];
    for (let i = 0; i < Math.min(resNights, 30); i++) {
      const d = new Date(a.getTime() + i * 86400000);
      const inv = resBlock.inventoryNights.find((n) => sameDayLocal(new Date(n.date), d));
      out.push({ label: fmtDate(d), free: inv ? inv.totalRooms - inv.reservedRooms : null });
    }
    return out;
  })();
  const resPeople = (participations ?? []).filter((p) => {
    const q = resForm.filter.trim().toLowerCase();
    if (!q) return true;
    return `${p.person.firstName} ${p.person.lastName} ${p.person.email ?? ""}`.toLowerCase().includes(q);
  }).slice(0, 300);
  const resSubmitReady = Boolean(currentEditionId) && resNights !== null
    && (resForm.guestMode === "participant" ? Boolean(resForm.participationId) : resForm.guestName.trim().length >= 2);
  // bloksuz + oda tipi seçiliyse kontrat fiyatı ipucu (kuruş → ₺)
  const resRoomTypePrice = resHotel && !resBlock && resForm.roomTypeId !== "__none__"
    ? resHotel.roomTypes.find((rt) => rt.id === resForm.roomTypeId)?.pricePerNight ?? null
    : null;

  const openManualRes = () => {
    setResForm({
      guestMode: "participant", participationId: "", filter: "", guestName: "",
      hotelId: "", blockId: "__none__", roomTypeId: "__none__",
      checkIn: "", checkOut: "", occupancyType: "SINGLE",
      payerType: "SELF", payerName: "", rate: "", status: "REQUESTED", notes: "",
    });
    setResOpen(true);
  };

  const submitManualRes = async () => {
    if (!currentEditionId || !resNights) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        editionId: currentEditionId,
        checkIn: resForm.checkIn,
        checkOut: resForm.checkOut,
        occupancyType: resForm.occupancyType,
        payerType: resForm.payerType,
        payerName: resForm.payerName.trim() || null,
        status: resForm.status,
        notes: resForm.notes.trim() || null,
        ratePerNight: resForm.rate.trim() ? toMinor(Number(resForm.rate) || 0) : null,
      };
      if (resForm.guestMode === "participant") payload.participationId = resForm.participationId;
      else payload.guestName = resForm.guestName.trim();
      if (resForm.blockId !== "__none__") {
        payload.blockId = resForm.blockId;
        payload.hotelId = resForm.hotelId;
      } else if (resForm.hotelId) {
        payload.hotelId = resForm.hotelId;
        if (resForm.roomTypeId !== "__none__") payload.roomTypeId = resForm.roomTypeId;
      }
      const r = await apiSend<{ nights: number; stockConsumed: boolean }>("/api/reservations/manual", "POST", payload);
      toast({ title: t("accIo.createdTitle"), description: t(r.stockConsumed ? "accIo.createdStock" : "accIo.createdNoStock", { nights: r.nights }) });
      setResOpen(false);
      reloadRes(); reload(); bump();
    } catch (e) {
      toast({ title: t("accIo.failTitle"), description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  // ── stok yönetimi: oda tipi / blok / gecelik stok aralığı ──
  const openRoomType = (h: HotelRow) => {
    setRtForm({ name: "", capacity: "2", price: "" });
    setRtDialog(h);
  };

  const saveRoomType = async () => {
    if (!rtDialog || !rtForm.name.trim()) return;
    setBusy(true);
    try {
      await apiSend("/api/room-types", "POST", {
        hotelId: rtDialog.id,
        name: rtForm.name.trim(),
        capacity: Math.max(1, Math.round(Number(rtForm.capacity) || 2)),
        pricePerNight: toMinor(Number(rtForm.price) || 0),
        currency: "TRY",
      });
      toast({ title: t("accIo.rtSaved"), description: `${rtForm.name.trim()} · ${rtDialog.name}` });
      setRtDialog(null);
      reload(); bump();
    } catch (e) {
      toast({ title: t("accIo.failTitle"), description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const openBlock = (h: HotelRow) => {
    setBlkForm({ name: "", roomTypeId: h.roomTypes[0]?.id ?? "__none__", releaseDate: "" });
    setBlkDialog(h);
  };

  const saveBlock = async () => {
    if (!blkDialog || !blkForm.name.trim() || blkForm.roomTypeId === "__none__") return;
    setBusy(true);
    try {
      await apiSend("/api/room-blocks", "POST", {
        hotelId: blkDialog.id,
        roomTypeId: blkForm.roomTypeId,
        name: blkForm.name.trim(),
        releaseDate: blkForm.releaseDate || null,
      });
      toast({ title: t("accIo.blockSaved"), description: `${blkForm.name.trim()} · ${blkDialog.name}` });
      setBlkDialog(null);
      reload(); bump();
    } catch (e) {
      toast({ title: t("accIo.failTitle"), description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const openStock = (h: HotelRow, b: HotelRow["blocks"][number]) => {
    const today = new Date();
    setStockForm({ from: isoDay(today), to: isoDay(new Date(today.getTime() + 6 * 86400000)), rooms: "10", mode: "add" });
    setStockDialog({ hotel: h, block: b });
  };

  const saveStock = async () => {
    if (!stockDialog || !stockForm.from || !stockForm.to) return;
    setBusy(true);
    try {
      const r = await apiSend<{ upserted: number }>("/api/room-stock", "POST", {
        blockId: stockDialog.block.id,
        from: stockForm.from,
        to: stockForm.to,
        totalRooms: Math.max(0, Math.round(Number(stockForm.rooms) || 0)),
        mode: stockForm.mode,
      });
      toast({ title: t("accIo.stockSaved"), description: t("accIo.stockSavedDesc", { n: r.upserted, rooms: Math.max(0, Math.round(Number(stockForm.rooms) || 0)) }) });
      setStockDialog(null);
      reload(); bump();
    } catch (e) {
      toast({ title: t("accIo.failTitle"), description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const exportRoomingList = () => {
    if (!currentEditionId) {
      toast({ title: t("accIo.needEdition"), variant: "destructive" });
      return;
    }
    toast({ title: t("accIo.exportTitle") });
    window.open(`/api/reservations/export?editionId=${currentEditionId}`, "_blank");
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

  const handleBulkImportRooming = async (parsedRows: Record<string, string>[]) => {
    if (!currentEditionId) return;
    let saved = 0;
    for (const row of parsedRows) {
      if (!row.guestName) continue;
      try {
        await apiSend("/api/reservations", "POST", {
          editionId: currentEditionId,
          guestName: row.guestName.trim(),
          checkIn: row.checkIn ? new Date(row.checkIn).toISOString() : new Date().toISOString(),
          checkOut: row.checkOut ? new Date(row.checkOut).toISOString() : new Date(Date.now() + 86400000 * 3).toISOString(),
          occupancyType: row.occupancyType ? (row.occupancyType.toUpperCase().includes("DBL") ? "DOUBLE" : "SINGLE") : "SINGLE",
          payerType: row.payerType ? (row.payerType.toUpperCase().includes("MASTER") ? "MASTER" : "SELF") : "SELF",
          status: "REQUESTED",
        });
        saved++;
      } catch (e) {
        console.error("Rooming aktarım hatası:", e);
      }
    }
    toast({ title: "Rooming Listesi Aktarıldı", description: `${saved} adet rezervasyon kaydedildi.` });
    reloadRes();
  };

  const handlePairRoommates = async (resId: string, roommate: string) => {
    try {
      await apiSend(`/api/reservations/${resId}`, "PUT", {
        notes: `Oda Arkadaşı: ${roommate}`,
      });
      toast({ title: "Oda Arkadaşı Eşleştirildi", description: `${roommate} odaya atandı.` });
      reloadRes();
    } catch (e) {
      toast({ title: "Eşleştirme Başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    }
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

      {/* Cvent Standartı: Rooming Listesi, Attrition & Eşleştirme Konsolu */}
      <RoomingMatrixConsole
        hotels={(hotels ?? []) as any}
        reservations={(reservations ?? []) as any}
        onImportRoomingList={handleBulkImportRooming}
        onPairRoommates={handlePairRoommates}
      />

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
                    {/* SOL — tüm bilgiler burada kalır, resmin altına taşmaz */}
                    <div className="flex min-w-0 flex-col gap-2.5">
                      <div className="flex items-start gap-3">
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
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={`${h.name} — oda tipi ekle`}
                            title={t("accIo.rtBtn")}
                            onClick={() => openRoomType(h)}
                            className="grid size-7 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Icons.BedSingle className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`${h.name} — oda bloğu ekle`}
                            title={t("accIo.blockBtn")}
                            onClick={() => openBlock(h)}
                            className="grid size-7 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Icons.Layers className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`${h.name} otelini düzenle`}
                            onClick={() => openEditHotel(h)}
                            className="grid size-7 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Icons.Pencil className="size-3.5" />
                          </button>
                        </div>
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
                    </div>
                    {/* SAĞ — kapak görseli; sol sütunun tam yüksekliğine oturur, %50-%50 ayrım */}
                    {h.imageUrl && (
                      <div className="relative h-28 overflow-hidden rounded-lg border bg-muted sm:h-auto">
                        <img
                          src={h.imageUrl}
                          alt={`${h.name} kapak görseli`}
                          loading="lazy"
                          className="absolute inset-0 size-full object-cover"
                        />
                      </div>
                    )}
                  </div>

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
                            <button
                              type="button"
                              aria-label={`${b.name} gecelik stoğunu ekle veya uzat`}
                              onClick={() => openStock(h, b)}
                              className="inline-flex h-6 items-center gap-1 rounded-md border bg-card px-1.5 text-[10px] font-medium text-foreground transition-colors hover:bg-muted"
                            >
                              <Icons.PackagePlus className="size-3" /> {t("accIo.stockBtn")}
                            </button>
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

      <SectionCard
        title="Rezervasyonlar"
        desc="varış/çıkış, doluluk tipi, gecelik fiyat, misafir bağlantıları — rezervasyon ile ödeyen aynı olmak zorunda değil (§35)"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setFileImportOpen(true)} disabled={!currentEditionId}>
              <Icons.FileUp className="size-4" /> {t("accImp.btn")}
            </Button>
            <Button size="sm" variant="outline" onClick={exportRoomingList} disabled={!currentEditionId}>
              <Icons.FileDown className="size-4" /> {t("accIo.exportBtn")}
            </Button>
            <Button size="sm" onClick={openManualRes} disabled={!currentEditionId}>
              <Icons.BedDouble className="size-4" /> {t("accIo.manualBtn")}
            </Button>
          </div>
        }
      >
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

      {/* MANUEL REZERVASYON — detaylı tekil giriş (kullanıcı ilkesi: her veri türünde manuel giriş) */}
      <Dialog open={resOpen} onOpenChange={(o) => !o && setResOpen(false)}>
        <DialogContent className="maven-scroll max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Icons.BedDouble className="size-4 text-teal-600" /> {t("accIo.manualTitle")}</DialogTitle>
            <DialogDescription>{t("accIo.manualDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <fieldset className="space-y-2.5 rounded-lg border p-3">
              <legend className="px-1 text-xs font-semibold">{t("accIo.sectionGuest")}</legend>
              <div className="space-y-1.5">
                <Label htmlFor="mr-guestmode">{t("accIo.guestMode")}</Label>
                <Select value={resForm.guestMode} onValueChange={(v) => setResForm({ ...resForm, guestMode: v, participationId: "", guestName: "" })}>
                  <SelectTrigger id="mr-guestmode" aria-label={t("accIo.guestMode")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="participant">{t("accIo.guestModeParticipant")}</SelectItem>
                    <SelectItem value="free">{t("accIo.guestModeFree")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {resForm.guestMode === "participant" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="mr-pfilter">{t("accIo.participantSearch")}</Label>
                    <Input id="mr-pfilter" value={resForm.filter} onChange={(e) => setResForm({ ...resForm, filter: e.target.value })} placeholder={t("accIo.participantSearchPh")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mr-participant">{t("accIo.participantLabel")}</Label>
                    <Select value={resForm.participationId || "__none__"} onValueChange={(v) => setResForm({ ...resForm, participationId: v === "__none__" ? "" : v })}>
                      <SelectTrigger id="mr-participant" aria-label={t("accIo.participantLabel")}><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value="__none__">{t("accIo.participantChoose")}</SelectItem>
                        {resPeople.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.person.firstName} {p.person.lastName}{p.person.email ? ` · ${p.person.email}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="mr-gname">{t("accIo.freeGuestName")}</Label>
                  <Input id="mr-gname" value={resForm.guestName} onChange={(e) => setResForm({ ...resForm, guestName: e.target.value })} placeholder={t("accIo.freeGuestNamePh")} />
                </div>
              )}
            </fieldset>

            <fieldset className="space-y-2.5 rounded-lg border p-3">
              <legend className="px-1 text-xs font-semibold">{t("accIo.sectionStay")}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mr-hotel">{t("accIo.hotel")}</Label>
                  <Select value={resForm.hotelId || "__none__"} onValueChange={(v) => setResForm({ ...resForm, hotelId: v === "__none__" ? "" : v, blockId: "__none__", roomTypeId: "__none__" })}>
                    <SelectTrigger id="mr-hotel" aria-label={t("accIo.hotel")}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("accIo.blockNone")}</SelectItem>
                      {(hotels ?? []).map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mr-block">{t("accIo.block")}</Label>
                  <Select value={resForm.blockId} onValueChange={(v) => setResForm({ ...resForm, blockId: v, roomTypeId: "__none__" })} disabled={!resHotel}>
                    <SelectTrigger id="mr-block" aria-label={t("accIo.block")}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("accIo.blockNone")}</SelectItem>
                      {(resHotel?.blocks ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name} · {b.roomType.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {resHotel && !resBlock && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="mr-rt">{t("accIo.roomType")}</Label>
                    <Select value={resForm.roomTypeId} onValueChange={(v) => setResForm({ ...resForm, roomTypeId: v })}>
                      <SelectTrigger id="mr-rt" aria-label={t("accIo.roomType")}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t("accIo.roomTypeNone")}</SelectItem>
                        {resHotel.roomTypes.map((rt) => <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {resBlock && (
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground sm:col-span-2">
                    <Icons.Info className="size-3" aria-hidden /> {t("accIo.roomType")}: <b className="font-medium">{resBlock.roomType.name}</b> ({t("accIo.roomTypeFromBlock")})
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="mr-in">{t("accIo.checkIn")}</Label>
                  <Input id="mr-in" type="date" value={resForm.checkIn} onChange={(e) => setResForm({ ...resForm, checkIn: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mr-out">{t("accIo.checkOut")}</Label>
                  <Input id="mr-out" type="date" value={resForm.checkOut} onChange={(e) => setResForm({ ...resForm, checkOut: e.target.value })} />
                </div>
              </div>
              {resForm.checkIn && resForm.checkOut && (
                resNights === null ? (
                  <p className="text-xs font-medium text-rose-600" role="alert">{t("accIo.nightsInvalid")}</p>
                ) : (
                  <p className="text-xs text-muted-foreground"><b className="text-foreground tabular-nums">{resNights}</b> {t("accIo.nights")}</p>
                )
              )}
              {resStockPreview && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground">{t("accIo.stockPreview")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {resStockPreview.map((s) => (
                      <span key={s.label} className={cn("rounded-md border px-1.5 py-1 text-[10px] tabular-nums", s.free === null ? "border-amber-300 bg-amber-50 text-amber-800" : s.free === 0 ? "border-rose-300 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
                        {s.label}: {s.free === null ? t("accIo.stockMissing") : s.free === 0 ? t("accIo.stockFull") : s.free}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </fieldset>

            <fieldset className="space-y-2.5 rounded-lg border p-3">
              <legend className="px-1 text-xs font-semibold">{t("accIo.sectionFinance")}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mr-occ">{t("accIo.occupancyType")}</Label>
                  <Select value={resForm.occupancyType} onValueChange={(v) => setResForm({ ...resForm, occupancyType: v })}>
                    <SelectTrigger id="mr-occ" aria-label={t("accIo.occupancyType")}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(OCCUPANCY_TYPE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mr-payer">{t("accIo.payerType")}</Label>
                  <Select value={resForm.payerType} onValueChange={(v) => setResForm({ ...resForm, payerType: v })}>
                    <SelectTrigger id="mr-payer" aria-label={t("accIo.payerType")}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SELF">{t("accIo.payerSelf")}</SelectItem>
                      <SelectItem value="ORGANIZATION">{t("accIo.payerOrganization")}</SelectItem>
                      <SelectItem value="SPONSOR">{t("accIo.payerSponsor")}</SelectItem>
                      <SelectItem value="ORGANIZER">{t("accIo.payerOrganizer")}</SelectItem>
                      <SelectItem value="SPEAKER_HOSPITALITY">{t("accIo.payerSpeaker")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {["ORGANIZATION", "SPONSOR"].includes(resForm.payerType) && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="mr-payername">{t("accIo.payerName")} *</Label>
                    <Input id="mr-payername" value={resForm.payerName} onChange={(e) => setResForm({ ...resForm, payerName: e.target.value })} placeholder="Delta Üniversitesi…" aria-required="true" />
                    <p className="text-[11px] text-muted-foreground">{t("accIo.payerNameReq")}</p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="mr-rate">{t("accIo.ratePerNight")}</Label>
                  <Input id="mr-rate" type="number" min={0} step={100} value={resForm.rate} onChange={(e) => setResForm({ ...resForm, rate: e.target.value })} className="tabular-nums" placeholder={resRoomTypePrice != null ? String(fromMinor(resRoomTypePrice)) : undefined} />
                  <p className="text-[11px] text-muted-foreground">{t("accIo.rateFromRoomType")}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mr-status">{t("accIo.status")}</Label>
                  <Select value={resForm.status} onValueChange={(v) => setResForm({ ...resForm, status: v })}>
                    <SelectTrigger id="mr-status" aria-label={t("accIo.status")}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["REQUESTED", "RESERVED", "CONFIRMED", "WAITLIST"].map((s) => (
                        <SelectItem key={s} value={s}>{label(ACCOMMODATION_STATUS, s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {resForm.status === "CONFIRMED" && (
                    <p className="flex items-start gap-1 text-[11px] text-amber-700">
                      <Icons.Info className="mt-0.5 size-3 shrink-0" aria-hidden /> {t("accIo.statusHintConfirm")}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="mr-notes">{t("accIo.notes")}</Label>
                  <Textarea id="mr-notes" rows={2} value={resForm.notes} onChange={(e) => setResForm({ ...resForm, notes: e.target.value })} placeholder={t("accIo.notesPh")} />
                </div>
              </div>
            </fieldset>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResOpen(false)}>Vazgeç</Button>
            <Button onClick={submitManualRes} disabled={busy || !resSubmitReady}>
              {busy ? t("accIo.submitting") : t("accIo.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Oda tipi ekle — otel kartı üzerinden */}
      <Dialog open={Boolean(rtDialog)} onOpenChange={(o) => !o && setRtDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Icons.BedSingle className="size-4 text-teal-600" /> {rtDialog ? t("accIo.rtTitle", { hotel: rtDialog.name }) : ""}</DialogTitle>
            <DialogDescription>{t("accIo.rtDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rt-name">{t("accIo.rtName")} *</Label>
              <Input id="rt-name" value={rtForm.name} onChange={(e) => setRtForm({ ...rtForm, name: e.target.value })} placeholder={t("accIo.rtNamePh")} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rt-cap">{t("accIo.rtCapacity")}</Label>
                <Input id="rt-cap" type="number" min={1} max={10} value={rtForm.capacity} onChange={(e) => setRtForm({ ...rtForm, capacity: e.target.value })} className="tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rt-price">{t("accIo.rtPrice")}</Label>
                <Input id="rt-price" type="number" min={0} step={100} value={rtForm.price} onChange={(e) => setRtForm({ ...rtForm, price: e.target.value })} className="tabular-nums" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRtDialog(null)}>Vazgeç</Button>
            <Button onClick={saveRoomType} disabled={busy || !rtForm.name.trim()}>{busy ? "…" : t("accIo.rtBtn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Oda bloğu ekle — otel kartı üzerinden */}
      <Dialog open={Boolean(blkDialog)} onOpenChange={(o) => !o && setBlkDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Icons.Layers className="size-4 text-teal-600" /> {blkDialog ? t("accIo.blockTitle", { hotel: blkDialog.name }) : ""}</DialogTitle>
            <DialogDescription>{t("accIo.blockDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="blk-name">{t("accIo.blockName")} *</Label>
              <Input id="blk-name" value={blkForm.name} onChange={(e) => setBlkForm({ ...blkForm, name: e.target.value })} placeholder={t("accIo.blockNamePh")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="blk-rt">{t("accIo.blockRoomType")} *</Label>
              {blkDialog && blkDialog.roomTypes.length === 0 ? (
                <p className="rounded-md border border-dashed px-2.5 py-2 text-[11px] text-muted-foreground">{t("accIo.blockNeedRoomType")}</p>
              ) : (
                <Select value={blkForm.roomTypeId} onValueChange={(v) => setBlkForm({ ...blkForm, roomTypeId: v })}>
                  <SelectTrigger id="blk-rt" aria-label={t("accIo.blockRoomType")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(blkDialog?.roomTypes ?? []).map((rt) => <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="blk-release">{t("accIo.blockRelease")}</Label>
              <Input id="blk-release" type="date" value={blkForm.releaseDate} onChange={(e) => setBlkForm({ ...blkForm, releaseDate: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlkDialog(null)}>Vazgeç</Button>
            <Button onClick={saveBlock} disabled={busy || !blkForm.name.trim() || blkForm.roomTypeId === "__none__" || !blkDialog || blkDialog.roomTypes.length === 0}>{busy ? "…" : t("accIo.blockBtn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gecelik stok ekle / uzat — blok kartı üzerinden */}
      <Dialog open={Boolean(stockDialog)} onOpenChange={(o) => !o && setStockDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Icons.PackagePlus className="size-4 text-teal-600" /> {stockDialog ? t("accIo.stockTitle", { block: stockDialog.block.name }) : ""}</DialogTitle>
            <DialogDescription>{t("accIo.stockDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stk-from">{t("accIo.stockFrom")} *</Label>
                <Input id="stk-from" type="date" value={stockForm.from} onChange={(e) => setStockForm({ ...stockForm, from: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stk-to">{t("accIo.stockTo")} *</Label>
                <Input id="stk-to" type="date" value={stockForm.to} onChange={(e) => setStockForm({ ...stockForm, to: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stk-rooms">{t("accIo.stockRooms")} *</Label>
                <Input id="stk-rooms" type="number" min={0} max={5000} value={stockForm.rooms} onChange={(e) => setStockForm({ ...stockForm, rooms: e.target.value })} className="tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stk-mode">{t("accIo.stockMode")}</Label>
                <Select value={stockForm.mode} onValueChange={(v) => setStockForm({ ...stockForm, mode: v })}>
                  <SelectTrigger id="stk-mode" aria-label={t("accIo.stockMode")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">{t("accIo.stockModeAdd")}</SelectItem>
                    <SelectItem value="set">{t("accIo.stockModeSet")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="flex items-start gap-1.5 rounded-lg bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
              <Icons.Info className="mt-0.5 size-3 shrink-0" aria-hidden /> {t("accIo.stockHint")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialog(null)}>Vazgeç</Button>
            <Button onClick={saveStock} disabled={busy || !stockForm.from || !stockForm.to}>{busy ? "…" : t("accIo.stockBtn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dosyadan içe aktarma — otel rooming listeleri / e-postayla gelen rezervasyon listeleri */}
      <ImportReservationsDialog
        open={fileImportOpen}
        onOpenChange={setFileImportOpen}
        editionId={currentEditionId}
        onImported={() => { reloadRes(); reload(); bump(); }}
      />
    </div>
  );
}

// ─── DOSYADAN REZERVASYON İÇE AKTARMA (xlsx/csv) ───────────────────────────
// REG-IO / CC-IMPORT iki-fazlı diyaloğu: dosya seç → sunucuda önizleme (yazım yok)
// → İçe Al → sonuç kartları. Blok eşleşen Teyit satırları gecelik stok tüketir;
// otel/blok adları sunucuda çözülür, bilinmeyen ad sorulardır (satır atlanır).

interface ResImportPreview {
  mode: "preview";
  total: number;
  valid: number;
  toCreate: number;
  offInventory: number;
  stockNights: number;
  issues: { row: number; guest: string; kind: string; reason: string }[];
  mapping: Record<string, string>;
  sample: { row: number; guest: string; hotel: string; dates: string; status: string; action: "stock" | "noStock" | "free" }[];
}
interface ResImportResult {
  mode: "commit";
  created: number;
  waitlisted: number;
  skipped: number;
  stockNights: number;
  total: number;
  failures: { row: number; guest: string; reason: string }[];
}

const RES_ISSUE_KIND_KEYS: Record<string, string> = { VALIDATION: "issueValidation", DUPLICATE_FILE: "issueDupFile", DUPLICATE_DB: "issueDupDb" };

function ImportReservationsDialog({ open, onOpenChange, editionId, onImported }: {
  open: boolean; onOpenChange: (o: boolean) => void; editionId: string | null; onImported: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [phase, setPhase] = useState<"idle" | "parsing" | "previewing" | "preview" | "committing" | "done">("idle");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [defaultStatus, setDefaultStatus] = useState("REQUESTED");
  const [onStockShortage, setOnStockShortage] = useState("reject");
  const [preview, setPreview] = useState<ResImportPreview | null>(null);
  const [result, setResult] = useState<ResImportResult | null>(null);

  const reset = () => { setPhase("idle"); setRows([]); setPreview(null); setResult(null); setFileName(""); setDefaultStatus("REQUESTED"); setOnStockShortage("reject"); };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const headers = [t("accImp.tplGuest"), t("accImp.tplEmail"), t("accImp.tplHotel"), t("accImp.tplBlock"), t("accImp.tplCheckIn"), t("accImp.tplCheckOut"), t("accImp.tplOccupancy"), t("accImp.tplPayerType"), t("accImp.tplPayerName"), t("accImp.tplRate"), t("accImp.tplStatus"), t("accImp.tplNotes")];
    const sample = [
      ["Ayşe Yılmaz", "", t("accImp.tplHotelSample"), t("accImp.tplBlockSample"), "12.05.2026", "15.05.2026", t("accImp.occDouble"), t("accImp.payerSelf"), "", "3500", t("accImp.stConfirm"), ""],
      ["Demo Misafir", "", "", "", "13.05.2026", "14.05.2026", t("accImp.occSingle"), t("accImp.payerOrg"), "Örnek A.Ş.", "", t("accImp.stRequest"), "telefonla geldi"],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...sample]), "Sablon");
    XLSX.writeFile(wb, "rezervasyon-import-sablonu.xlsx");
  };

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t("accImp.failTitle"), description: t("accImp.fileTooBig"), variant: "destructive" });
      return;
    }
    setFileName(file.name); setPhase("parsing");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      // N-05: sheetRows tavanı — bozuk/devasa dosyanın parse maliyetini sınırlar
      // (CVE-2024-22363 ReDoS yüzeyini küçültür; tam çözüm exceljs göçüdür).
      const wb = XLSX.read(buf, { type: "array", sheetRows: 1005 });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error(t("accImp.fileEmpty"));
      const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
      if (parsed.length === 0) throw new Error(t("accImp.fileNoRows"));
      setRows(parsed);
      setPhase("previewing");
      const pv = await apiSend<ResImportPreview>("/api/reservations/import", "POST", {
        editionId, rows: parsed, defaultStatus: defaultStatus || undefined,
      });
      setPreview(pv); setPhase("preview");
    } catch (e) {
      toast({ title: t("accImp.failTitle"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      setPhase("idle");
    }
  };

  const commit = async () => {
    if (rows.length === 0 || !editionId) return;
    setPhase("committing");
    try {
      const res = await apiSend<ResImportResult>("/api/reservations/import", "POST", {
        editionId, rows, commit: true, defaultStatus: defaultStatus || undefined,
        onStockShortage: onStockShortage === "WAITLIST" ? "WAITLIST" : undefined,
      });
      setResult(res); setPhase("done");
      toast({ title: t("accImp.doneTitle"), description: t("accImp.doneDesc", { created: res.created, skipped: res.skipped }) + (res.waitlisted > 0 ? " " + t("accImp.doneWaitlisted", { n: res.waitlisted }) : "") });
      onImported();
    } catch (e) {
      toast({ title: t("accImp.failTitle"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      setPhase("preview");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && phase !== "committing") { onOpenChange(false); reset(); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("accImp.title")}</DialogTitle>
          <DialogDescription>{t("accImp.desc")}</DialogDescription>
        </DialogHeader>

        {/* 1) varsayılan durum + dosya seçimi + şablon */}
        {phase === "idle" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="res-imp-status">{t("accImp.defaultStatus")}</Label>
              <Select value={defaultStatus} onValueChange={setDefaultStatus}>
                <SelectTrigger id="res-imp-status" aria-label={t("accImp.defaultStatus")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="REQUESTED">{t("accImp.stRequest")}</SelectItem>
                  <SelectItem value="WAITLIST">{t("accImp.stWait")}</SelectItem>
                  <SelectItem value="RESERVED">{t("accImp.stReserve")}</SelectItem>
                  <SelectItem value="CONFIRMED">{t("accImp.stConfirm")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">{t("accImp.defaultStatusHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="res-imp-shortage">{t("accImp.shortageLabel")}</Label>
              <Select value={onStockShortage} onValueChange={setOnStockShortage}>
                <SelectTrigger id="res-imp-shortage" aria-label={t("accImp.shortageLabel")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reject">{t("accImp.shortageReject")}</SelectItem>
                  <SelectItem value="WAITLIST">{t("accImp.shortageWaitlist")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">{t("accImp.shortageHint")}</p>
            </div>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:bg-muted/40">
              <Icons.FileSpreadsheet className="size-8 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">{t("accImp.pickFile")}</span>
              {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
              <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
            </label>
            <div className="flex justify-center">
              <Button variant="link" size="sm" className="gap-1.5 text-xs" onClick={() => void downloadTemplate()}>
                <Icons.Download className="size-3.5" aria-hidden />{t("accImp.template")}
              </Button>
            </div>
          </div>
        )}

        {(phase === "parsing" || phase === "previewing") && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground" role="status">
            <Icons.Loader2 className="size-4 animate-spin" aria-hidden />
            {phase === "parsing" ? t("accImp.parsing") : t("accImp.previewing")}
          </div>
        )}

        {/* 2) önizleme — sayım çipleri + sorunlar + tablo */}
        {phase === "preview" && preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Chip tone="neutral">{t("accImp.rowsTotal", { n: preview.total })}</Chip>
              <Chip tone="emerald">{t("accImp.rowsValid", { n: preview.valid })}</Chip>
              <Chip tone="teal">{t("accImp.toCreate", { n: preview.toCreate })}</Chip>
              {preview.offInventory > 0 && <Chip tone="amber">{t("accImp.offInventory", { n: preview.offInventory })}</Chip>}
              {preview.stockNights > 0 && <Chip tone="sky">{t("accImp.stockNights", { n: preview.stockNights })}</Chip>}
              {preview.issues.length > 0 && <Chip tone="rose">{t("accImp.rowsIssues", { n: preview.issues.length })}</Chip>}
            </div>
            <p className="text-xs text-muted-foreground">
              {Object.keys(preview.mapping).length > 0
                ? t("accImp.mappedCols", { cols: Object.values(preview.mapping).join(", ") })
                : t("accImp.colNotMapped")}
            </p>

            {preview.issues.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">{t("accImp.issuesTitle")}</p>
                <ul className="maven-scroll max-h-40 space-y-1.5 overflow-y-auto rounded-lg border p-2.5">
                  {preview.issues.slice(0, 100).map((x) => (
                    <li key={`${x.row}-${x.kind}-${x.reason}`} className="flex items-start gap-2 text-xs">
                      <Chip tone={x.kind === "DUPLICATE_FILE" ? "amber" : "rose"}>{t(`accImp.${RES_ISSUE_KIND_KEYS[x.kind] ?? "issueValidation"}`)}</Chip>
                      <span className="min-w-0 flex-1"><b>{x.guest}</b> · {x.reason}</span>
                      <span className="shrink-0 text-muted-foreground">#{x.row}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("accImp.previewTitle", { n: Math.min(8, preview.total) })}</p>
              <div className="maven-scroll max-h-52 overflow-y-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2.5 py-2 font-medium">#</th>
                      <th className="px-2.5 py-2 font-medium">{t("accImp.headerGuest")}</th>
                      <th className="px-2.5 py-2 font-medium">{t("accImp.headerHotel")}</th>
                      <th className="px-2.5 py-2 font-medium">{t("accImp.headerDates")}</th>
                      <th className="px-2.5 py-2 font-medium">{t("accImp.headerAction")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((s) => (
                      <tr key={s.row} className="border-t">
                        <td className="px-2.5 py-1.5 text-muted-foreground">{s.row}</td>
                        <td className="max-w-32 truncate px-2.5 py-1.5 font-medium">{s.guest}</td>
                        <td className="max-w-36 truncate px-2.5 py-1.5">{s.hotel}</td>
                        <td className="px-2.5 py-1.5 tabular-nums" dir="ltr">{s.dates}</td>
                        <td className="px-2.5 py-1.5">
                          <Chip tone={s.action === "stock" ? "sky" : s.action === "free" ? "amber" : "teal"}>
                            {s.action === "stock" ? t("accImp.actionStock") : s.action === "free" ? t("accImp.actionFree") : t("accImp.actionNoStock")}
                          </Chip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3) sonuç */}
        {phase === "done" && result && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-900/20"><p className="text-lg font-semibold tabular-nums">{result.created}</p><p className="text-muted-foreground">{t("accImp.resCreated")}</p></div>
              <div className="rounded-lg bg-sky-50 p-3 dark:bg-sky-900/20"><p className="text-lg font-semibold tabular-nums">{result.stockNights}</p><p className="text-muted-foreground">{t("accImp.resStock")}</p></div>
              <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20"><p className="text-lg font-semibold tabular-nums">{result.skipped}</p><p className="text-muted-foreground">{t("accImp.resSkipped")}</p></div>
            </div>
            {result.failures.length > 0 && (
              <ul className="maven-scroll max-h-32 space-y-1.5 overflow-y-auto rounded-lg border p-2.5">
                {result.failures.slice(0, 50).map((f) => (
                  <li key={`f-${f.row}`} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 text-muted-foreground">#{f.row}</span>
                    <span className="min-w-0 flex-1"><b>{f.guest}</b> · {f.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === "preview" && (
            <Button variant="outline" onClick={reset}>{t("common.cancel")}</Button>
          )}
          {phase !== "preview" && phase !== "done" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
          )}
          {phase === "preview" && (
            <Button onClick={() => void commit()} disabled={preview?.valid === 0}>
              <Icons.FileUp className="size-3.5" /> {t("accImp.commitBtn", { n: preview?.valid ?? 0 })}
            </Button>
          )}
          {phase === "done" && (
            <Button onClick={() => { onOpenChange(false); reset(); }}>{t("common.close")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
