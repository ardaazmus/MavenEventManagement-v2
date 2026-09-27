"use client";
import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { BulkPasteDialog } from "@/components/maven/data-tools/bulk-paste-dialog";
import {
  BedDouble,
  Users,
  Calendar,
  AlertTriangle,
  TrendingDown,
  CheckCircle2,
  ClipboardPaste,
  ShieldAlert,
  UserPlus,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface HotelInventoryNight {
  id: string;
  date: string;
  totalRooms: number;
  reservedRooms: number;
}

export interface HotelBlock {
  id: string;
  name: string;
  releaseDate?: string | null;
  roomType: { name: string; id: string };
  inventoryNights: HotelInventoryNight[];
}

export interface HotelData {
  id: string;
  name: string;
  blocks: HotelBlock[];
}

export interface ReservationData {
  id: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: string;
  occupancyType?: string | null;
  ratePerNight?: number;
  payerType: string;
  payerName?: string | null;
  block?: { name: string; hotel: { name: string }; roomType: { name: string } } | null;
  occupancySlots: { id: string; guestName?: string | null; position: number }[];
}

export interface RoomingMatrixConsoleProps {
  hotels: HotelData[];
  reservations: ReservationData[];
  onImportRoomingList?: (rows: Record<string, string>[]) => Promise<void>;
  onPairRoommates?: (resId: string, roommateName: string) => Promise<void>;
}

export function RoomingMatrixConsole({
  hotels,
  reservations,
  onImportRoomingList,
  onPairRoommates,
}: RoomingMatrixConsoleProps) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pairingRes, setPairingRes] = useState<ReservationData | null>(null);
  const [roommateName, setRoommateName] = useState("");
  const [pairingBusy, setPairingBusy] = useState(false);

  // 1. Sözleşme ve Gerçekleşen Gece İstatistikleri (Attrition %80 Hesabı)
  const stats = useMemo(() => {
    let totalContractNights = 0;
    let totalPickedUpNights = 0;
    const avgNightlyRate = 4500; // Standart ortalama oda fiyatı

    for (const h of hotels) {
      for (const b of h.blocks) {
        for (const n of b.inventoryNights) {
          totalContractNights += n.totalRooms;
          totalPickedUpNights += n.reservedRooms;
        }
      }
    }

    // Yedek: Eğer envanter boşsa rezervasyon gece toplamından al
    if (totalPickedUpNights === 0 && reservations.length > 0) {
      totalPickedUpNights = reservations.reduce((acc, r) => {
        const d1 = new Date(r.checkIn).getTime();
        const d2 = new Date(r.checkOut).getTime();
        const diff = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
        return acc + diff;
      }, 0);
      totalContractNights = Math.round(totalPickedUpNights * 1.25);
    }

    const targetThreshold = Math.round(totalContractNights * 0.8);
    const deficitNights = Math.max(0, targetThreshold - totalPickedUpNights);
    const penaltyEstimate = deficitNights * avgNightlyRate;
    const pickupPercent = totalContractNights > 0 ? Math.round((totalPickedUpNights / totalContractNights) * 100) : 0;

    return {
      totalContractNights,
      totalPickedUpNights,
      targetThreshold,
      deficitNights,
      penaltyEstimate,
      pickupPercent,
    };
  }, [hotels, reservations]);

  // 2. Alt-Blok Dağılımı (VIP / Personel / Stant / Genel Katılımcı)
  const subBlockMetrics = useMemo(() => {
    const counts = { VIP: 0, STAFF: 0, EXHIBITOR: 0, GENERAL: 0 };
    for (const r of reservations) {
      const p = (r.payerType || "").toUpperCase();
      const b = (r.block?.name || "").toUpperCase();
      if (p === "MASTER" || b.includes("VIP") || b.includes("KEYNOTE")) {
        counts.VIP++;
      } else if (b.includes("EKİP") || b.includes("PERSONEL") || b.includes("STAFF")) {
        counts.STAFF++;
      } else if (p === "SPONSOR" || b.includes("STAND") || b.includes("EXHIBITOR")) {
        counts.EXHIBITOR++;
      } else {
        counts.GENERAL++;
      }
    }
    const total = reservations.length || 1;
    return {
      VIP: { count: counts.VIP, percent: Math.round((counts.VIP / total) * 100) },
      STAFF: { count: counts.STAFF, percent: Math.round((counts.STAFF / total) * 100) },
      EXHIBITOR: { count: counts.EXHIBITOR, percent: Math.round((counts.EXHIBITOR / total) * 100) },
      GENERAL: { count: counts.GENERAL, percent: Math.round((counts.GENERAL / total) * 100) },
    };
  }, [reservations]);

  // 3. Eşleştirme Bekleyen Çift Kişilik (DOUBLE) Odalar
  const unassignedDoubleRooms = useMemo(() => {
    return reservations.filter((r) => {
      const isDouble = r.occupancyType === "DOUBLE" || r.occupancyType === "TWIN";
      const hasRoommate = r.occupancySlots && r.occupancySlots.length >= 2;
      return isDouble && !hasRoommate;
    });
  }, [reservations]);

  const handlePairSubmit = async () => {
    if (!pairingRes || !roommateName.trim() || !onPairRoommates) return;
    setPairingBusy(true);
    try {
      await onPairRoommates(pairingRes.id, roommateName.trim());
      setPairingRes(null);
      setRoommateName("");
    } finally {
      setPairingBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Üst Konsol: Attrition & Cutoff Date Takip Panosu */}
      <div className="rounded-xl border bg-card p-4 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <TrendingDown className="size-4 text-primary" />
              Otel Attrition (Kümülatif Azalma) ve Doluluk Eğrisi
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Standart %80 kloz kuralı: Hedef gerçekleşmediğinde açık oda-geceler için no-show cezası tahakkuk eder.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBulkOpen(true)}>
              <ClipboardPaste className="size-3.5 text-primary" /> Excel Rooming Listesi Yapıştır
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <span className="text-[11px] text-muted-foreground">Sözleşmeli Master Blok</span>
            <p className="text-lg font-bold tabular-nums">{stats.totalContractNights} <span className="text-xs font-normal text-muted-foreground">oda-gece</span></p>
            <div className="text-[10px] text-muted-foreground">Hedef (%80): {stats.targetThreshold} oda-gece</div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <span className="text-[11px] text-muted-foreground">Gerçekleşen Doluluk (Pickup)</span>
            <p className="text-lg font-bold tabular-nums text-emerald-600">{stats.totalPickedUpNights} <span className="text-xs font-normal text-muted-foreground">oda-gece</span></p>
            <Progress value={stats.pickupPercent} className="h-1.5 mt-1" />
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <span className="text-[11px] text-muted-foreground">Attrition Durumu</span>
            {stats.deficitNights === 0 ? (
              <p className="text-sm font-semibold text-emerald-600 flex items-center gap-1 mt-1">
                <CheckCircle2 className="size-4" /> %80 Eşiği Güvende
              </p>
            ) : (
              <p className="text-sm font-semibold text-rose-600 flex items-center gap-1 mt-1">
                <AlertTriangle className="size-4" /> {stats.deficitNights} Gece Açık Var
              </p>
            )}
            <div className="text-[10px] text-muted-foreground">Doluluk: %{stats.pickupPercent}</div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <span className="text-[11px] text-muted-foreground">Tahmini Ceza Riski</span>
            <p className={cn("text-lg font-bold tabular-nums", stats.deficitNights > 0 ? "text-rose-600" : "text-emerald-600")}>
              {stats.deficitNights > 0 ? `₺${stats.penaltyEstimate.toLocaleString()}` : "₺0 (Risk Yok)"}
            </p>
            <div className="text-[10px] text-muted-foreground">Cutoff: Açılışa 30 gün kala</div>
          </div>
        </div>
      </div>

      {/* Alt-Blok Segmentasyonu & Oda Arkadaşı Eşleştirme Barı */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alt-Blok Segmentasyon Kartı */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Users className="size-3.5 text-primary" />
              Alt-Blok Segmentasyonu
            </h4>
            <Badge variant="outline" className="text-[10px]">{reservations.length} Rezervasyon</Badge>
          </div>

          <div className="space-y-2 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-medium text-purple-700 dark:text-purple-300">VIP & Konuşmacı Bloğu (Master Folio)</span>
                <span className="tabular-nums font-semibold">{subBlockMetrics.VIP.count} ({subBlockMetrics.VIP.percent}%)</span>
              </div>
              <Progress value={subBlockMetrics.VIP.percent} className="h-1.5" />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-medium text-blue-700 dark:text-blue-300">Personel & Ekip Bloğu (Master Fatura)</span>
                <span className="tabular-nums font-semibold">{subBlockMetrics.STAFF.count} ({subBlockMetrics.STAFF.percent}%)</span>
              </div>
              <Progress value={subBlockMetrics.STAFF.percent} className="h-1.5" />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-medium text-amber-700 dark:text-amber-300">Stant / Sponsor Bloğu</span>
                <span className="tabular-nums font-semibold">{subBlockMetrics.EXHIBITOR.count} ({subBlockMetrics.EXHIBITOR.percent}%)</span>
              </div>
              <Progress value={subBlockMetrics.EXHIBITOR.percent} className="h-1.5" />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-medium text-emerald-700 dark:text-emerald-300">Genel Katılımcı (Bireysel Ödeme)</span>
                <span className="tabular-nums font-semibold">{subBlockMetrics.GENERAL.count} ({subBlockMetrics.GENERAL.percent}%)</span>
              </div>
              <Progress value={subBlockMetrics.GENERAL.percent} className="h-1.5" />
            </div>
          </div>
        </div>

        {/* Oda Arkadaşı Eşleştirme Çekmecesi */}
        <div className="lg:col-span-2 rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <BedDouble className="size-3.5 text-primary" />
                Oda Arkadaşı Eşleştirme Masası (Cvent Standartı)
              </h4>
              <p className="text-[11px] text-muted-foreground">Eşleşme bekleyen çift kişilik / twin odalar ({unassignedDoubleRooms.length})</p>
            </div>
            <Badge variant={unassignedDoubleRooms.length > 0 ? "secondary" : "outline"} className="text-xs">
              {unassignedDoubleRooms.length} Bekleyen
            </Badge>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1 text-xs">
            {unassignedDoubleRooms.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-xs flex flex-col items-center gap-2">
                <CheckCircle2 className="size-6 text-emerald-500" />
                <span>Tüm çift kişilik odaların oda arkadaşları eşleştirildi.</span>
              </div>
            ) : (
              unassignedDoubleRooms.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border p-2.5 transition hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{r.guestName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.block ? `${r.block.hotel.name} · ${r.block.roomType.name}` : "Bloksuz"} · {r.checkIn.split("T")[0]} → {r.checkOut.split("T")[0]}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50">
                      Tek Kişi Kaldı
                    </Badge>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setPairingRes(r)}>
                      <UserPlus className="size-3" /> Eşle
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Oda Arkadaşı Manuel / Token Eşleştirme Modalı */}
      <Dialog open={Boolean(pairingRes)} onOpenChange={(o) => !o && setPairingRes(null)}>
        <DialogContent className="sm:max-w-md text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <UserPlus className="size-4 text-primary" />
              Oda Arkadaşı Ata — {pairingRes?.guestName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="font-medium text-foreground">Birinci Konuk: {pairingRes?.guestName}</p>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                {pairingRes?.block?.hotel.name} · {pairingRes?.block?.roomType.name}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>İkinci Konuk (Oda Arkadaşı Adı & Soyadı)</Label>
              <Input
                value={roommateName}
                onChange={(e) => setRoommateName(e.target.value)}
                placeholder="Örn: Dr. Ahmet Yılmaz"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Oda arkadaşı kaydedildiğinde rezervasyon folyosuna ikinci konuk olarak iliştirilecektir.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPairingRes(null)} disabled={pairingBusy}>
              Vazgeç
            </Button>
            <Button onClick={handlePairSubmit} disabled={pairingBusy || !roommateName.trim()}>
              {pairingBusy ? "Kaydediliyor..." : "Oda Arkadaşını Bağla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toplu Rooming Listesi Yapıştırma Modalı (Levenshtein Destekli) */}
      <BulkPasteDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        targetEntityName="Otel Rooming Listesi"
        availableColumns={[
          { key: "guestName", label: "Misafir Adı", synonyms: ["guest", "ad", "misafir", "isim", "delege", "name", "yolcu"], required: true },
          { key: "hotelName", label: "Otel Adı", synonyms: ["hotel", "otel", "tesis", "konaklama"] },
          { key: "roomType", label: "Oda Tipi", synonyms: ["room", "oda", "oda tipi", "type"] },
          { key: "checkIn", label: "Giriş Tarihi", synonyms: ["checkin", "giriş", "gelis", "varış"], required: true },
          { key: "checkOut", label: "Çıkış Tarihi", synonyms: ["checkout", "çıkış", "ayrılış"], required: true },
          { key: "occupancyType", label: "Doluluk (SGL/DBL)", synonyms: ["occupancy", "doluluk", "tip", "single", "double"] },
          { key: "payerType", label: "Ödeyen (SELF/MASTER)", synonyms: ["payer", "ödeyen", "fatura", "sponsor"] },
        ]}
        onImport={async (parsedRows) => {
          if (onImportRoomingList) {
            await onImportRoomingList(parsedRows);
          }
          return { imported: parsedRows.length };
        }}
      />
    </div>
  );
}
