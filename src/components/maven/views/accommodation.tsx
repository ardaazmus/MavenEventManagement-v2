"use client";
// Konaklama — gecelik stok (§32), rezervasyon teyidi (§09-E), oda-gece metriği
import { useState } from "react";
import { listEntity, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { ACCOMMODATION_STATUS, fmtDate } from "@/lib/constants";
import { Button } from "@/components/ui/button";
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
  block?: { name: string; hotel: { name: string }; roomType: { name: string } } | null;
  primaryGuest?: { person: { firstName: string; lastName: string } } | null;
  occupancySlots: { id: string; guestName?: string | null; position: number }[];
}

export function AccommodationView() {
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: hotels, error, reload, loading } = useApi<HotelRow[]>(() => listEntity<HotelRow>("hotels", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);
  const { data: reservations } = useApi<ReservationRow[]>(() => listEntity<ReservationRow>("reservations", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);

  const nightsOf = (r: ReservationRow) => Math.max(1, Math.round((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 86400000));
  const roomNightsSold = (reservations ?? []).filter((r) => ["RESERVED", "CONFIRMED", "CHECKED_IN"].includes(r.status)).reduce((s, r) => s + nightsOf(r), 0);
  const pendingRes = (reservations ?? []).filter((r) => ["REQUESTED", "WAITLIST"].includes(r.status));

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

  return (
    <div className="space-y-5">
      <PageHeader title="Konaklama & Seyahat" desc="Oda stoğu gün bazlıdır — 1 oda × 3 gece = 3 oda-gece; bir gece eksikse teyit engellenir" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Otel" value={(hotels ?? []).length} icon={<Icons.Building className="size-4" />} />
        <KpiCard label="Rezervasyon" value={(reservations ?? []).length} sub={`${pendingRes.length} teyit bekleyen`} tone="amber" icon={<Icons.BedDouble className="size-4" />} />
        <KpiCard label="Oda-Gece (satış)" value={roomNightsSold} sub="ayrılan toplam" tone="emerald" icon={<Icons.Moon className="size-4" />} />
        <KpiCard label="Bekleme Listesi" value={(reservations ?? []).filter((r) => r.status === "WAITLIST").length} tone="rose" icon={<Icons.Clock className="size-4" />} />
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

      <SectionCard title="Rezervasyonlar" desc="varış/çıkış, konuk, ödeyen — rezervasyon ile ödeyen aynı olmak zorunda değil (§35)">
        {(reservations ?? []).length === 0 ? (
          <EmptyState title="Rezervasyon yok" />
        ) : (
          <div className="space-y-2">
            {(reservations ?? []).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {r.guestName}
                    {r.primaryGuest && <span className="text-muted-foreground"> ← {r.primaryGuest.person.firstName} {r.primaryGuest.person.lastName}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.block ? `${r.block.hotel.name} · ${r.block.roomType.name}` : "blok yok"} · {fmtDate(r.checkIn)} → {fmtDate(r.checkOut)} ({nightsOf(r)} gece) · ödeyen: {r.payerType}{r.payerName ? ` — ${r.payerName}` : ""}
                  </p>
                </div>
                {r.occupancySlots.length > 0 && <Chip tone="teal">{r.occupancySlots.length} konuk slotu</Chip>}
                <StatusBadge map={ACCOMMODATION_STATUS} value={r.status} />
                {["REQUESTED", "WAITLIST"].includes(r.status) && r.block && (
                  <Button size="sm" onClick={() => confirm(r)} disabled={busyId === r.id}>
                    {busyId === r.id ? "Kontrol ediliyor…" : "Teyit Et"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
