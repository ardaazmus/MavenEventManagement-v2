// Manuel konaklama rezervasyonu — Admin tekil giriş (Konaklama & Seyahat modülü)
//
// Kullanıcı ilkesi: "Tek bir veri girişi kaynağı olmamalı — her zaman manuel veri
// girişi de olmalı." Portal/seed dışında rezervasyonun YÖNETİM yüzeyi yoktu; telefon/
// e-postayla gelen rezervasyon talepleri sisteme girilemiyordu. Bu çekirdek, admin'in
// detaylı tekil rezervasyon girişini TEK transaction'da kurar.
//
// Sözleşmeler:
//  - Misafir: mevcut Katılıma bağlanabilir (participationId — Ana Konuk + slot açılır)
//    YA DA serbest isim (guestName — envanter dışı / dış misafir).
//  - Mükerrer koruması: AYNI katılım + tarih aralığı çakışması + aktif durum
//    (CANCELLED hariç) → DUPLICATE (409); serbest misafirde güvenilir denetim yok.
//  - Stok (§32, reservation.confirm ile AYNI invariant): blok + CONFIRMED → her gece
//    için InventoryNight TAZE okunur; eksik gece / aşım → STOCK (409). Tüketim +
//    kayıt TEK transaction'da — başarısız yazım stok KALICI tüketmez.
//    REQUESTED/RESERVED/WAITLIST stok tüketmez (mevcut model: teyit tüketir).
//  - Envanter dışı: blockId yok → kayıt tutulur, stok dokunulmaz (off-inventory).
//  - Fiyat: girilmezse oda tipinin kontrat fiyatı (pricePerNight) devralınır.
//  - Durum beyaz listesi (ilk-yazım): REQUESTED|WAITLIST|RESERVED|CONFIRMED —
//    CHECKED_IN/CHECKED_OUT/CANCELLED operasyon geçişleridir (flows/edit).

import { db } from "@/lib/db";
import { ActivityType } from "./activity";

export const MANUAL_RES_STATUSES = ["REQUESTED", "WAITLIST", "RESERVED", "CONFIRMED"] as const;
export const MANUAL_RES_PAYER = ["SELF", "ORGANIZATION", "SPONSOR", "ORGANIZER", "SPEAKER_HOSPITALITY"] as const;
export const MANUAL_RES_OCCUPANCY = ["SINGLE", "DOUBLE", "FAMILY_SHARED"] as const;
// ödeyen bu iki kurumsal tipte ad zorunlu (faturaya yansır)
const PAYER_NAME_REQUIRED: readonly string[] = ["ORGANIZATION", "SPONSOR"];

export type ManualReservationErrorCode =
  | "EDITION_NOT_FOUND"
  | "VALIDATION"
  | "GUEST"
  | "BLOCK"
  | "STOCK"
  | "DUPLICATE";

export class ManualReservationError extends Error {
  code: ManualReservationErrorCode;
  detail?: Record<string, unknown>;
  constructor(code: ManualReservationErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export interface ManualReservationInput {
  editionId: string;
  participationId?: string | null; // mevcut katılıma bağla (Ana Konuk)
  guestName?: string | null; // serbest misafir (participation yoksa zorunlu)
  hotelId?: string | null; // bilgilendirme amaçlı — blok zincirinden doğrulanır
  blockId?: string | null; // yoksa envanter dışı kayıt
  roomTypeId?: string | null; // blok varsa bloğun tipi zorunlu olarak kullanılır
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  occupancyType?: string | null;
  payerType?: string | null; // default SELF
  payerName?: string | null;
  ratePerNight?: number | null; // kuruş (minor) — boşsa oda tipi fiyatı
  status?: string | null; // default REQUESTED
  notes?: string | null;
  actorName?: string | null;
}

export interface ManualReservationResult {
  reservationId: string;
  guestName: string;
  status: string;
  blockId: string | null;
  roomTypeId: string | null;
  nights: number;
  ratePerNight: number;
  stockConsumed: boolean;
  occupancySlotCreated: boolean;
  duplicatedOf: string | null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NIGHTS = 60;

// "YYYY-MM-DD" → yerel öğle (DST-güvenli; sameDay karşılaştırmaları yerel bileşenle)
export function parseDay(v: unknown): Date | null {
  if (typeof v !== "string" || !DAY_RE.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export async function createManualReservation(input: ManualReservationInput): Promise<ManualReservationResult> {
  // ── 0) hızlı doğrulama (tx dışı — ucuz ret) ──
  const edition = await db.eventEdition.findUnique({
    where: { id: input.editionId },
    select: { id: true, tenantId: true, name: true },
  });
  if (!edition) throw new ManualReservationError("EDITION_NOT_FOUND", "Etkinlik (edisyon) bulunamadı");

  const checkIn = parseDay(input.checkIn);
  const checkOut = parseDay(input.checkOut);
  if (!checkIn || !checkOut) {
    throw new ManualReservationError("VALIDATION", "Giriş/çıkış tarihi biçimi geçersiz (YYYY-AA-GG)");
  }
  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000);
  if (nights < 1) throw new ManualReservationError("VALIDATION", "Çıkış tarihi girişten sonra olmalı");
  if (nights > MAX_NIGHTS) throw new ManualReservationError("VALIDATION", `Konaklama en fazla ${MAX_NIGHTS} gece olabilir`);

  const status = input.status ? String(input.status) : "REQUESTED";
  if (!(MANUAL_RES_STATUSES as readonly string[]).includes(status)) {
    throw new ManualReservationError("VALIDATION", `Geçersiz rezervasyon durumu: ${status}`);
  }
  const payerType = input.payerType ? String(input.payerType) : "SELF";
  if (!(MANUAL_RES_PAYER as readonly string[]).includes(payerType)) {
    throw new ManualReservationError("VALIDATION", `Geçersiz ödeyen tipi: ${payerType}`);
  }
  const payerName = input.payerName?.trim() || null;
  if (PAYER_NAME_REQUIRED.includes(payerType) && !payerName) {
    throw new ManualReservationError("VALIDATION", "Kurum/sponsor ödemesinde ödeyen adı zorunludur");
  }
  const occupancyType = input.occupancyType ? String(input.occupancyType) : null;
  if (occupancyType && !(MANUAL_RES_OCCUPANCY as readonly string[]).includes(occupancyType)) {
    throw new ManualReservationError("VALIDATION", `Geçersiz doluluk tipi: ${occupancyType}`);
  }
  const ratePerNight = Number.isFinite(input.ratePerNight) && (input.ratePerNight as number) > 0
    ? Math.round(input.ratePerNight as number)
    : null;

  // ── 1) blok / oda tipi doğrulama (salt-okunur) ──
  const block = input.blockId
    ? await db.roomBlock.findUnique({
        where: { id: input.blockId },
        include: { hotel: { select: { id: true, editionId: true, name: true } }, roomType: { select: { id: true, name: true, pricePerNight: true } } },
      })
    : null;
  if (input.blockId && !block) throw new ManualReservationError("BLOCK", "Oda bloğu bulunamadı");
  if (block && block.hotel.editionId !== edition.id) {
    throw new ManualReservationError("BLOCK", "Oda bloğu bu etkinliğe ait değil");
  }
  let roomType: { id: string; name: string; pricePerNight: number } | null = block?.roomType ?? null;
  if (!block && input.roomTypeId) {
    const rt = await db.roomType.findUnique({
      where: { id: input.roomTypeId },
      include: { hotel: { select: { editionId: true, name: true } } },
    });
    if (!rt || rt.hotel.editionId !== edition.id) {
      throw new ManualReservationError("BLOCK", "Oda tipi bu etkinliğe ait bir otele ait değil");
    }
    roomType = { id: rt.id, name: rt.name, pricePerNight: rt.pricePerNight };
  }

  // ── 2) misafir doğrulama (tx dışı) ──
  let participation: { id: string; personId: string; person: { firstName: string; lastName: string } } | null = null;
  if (input.participationId) {
    participation = await db.eventParticipation.findFirst({
      where: { id: input.participationId, editionId: edition.id },
      select: { id: true, personId: true, person: { select: { firstName: true, lastName: true } } },
    });
    if (!participation) throw new ManualReservationError("GUEST", "Katılım bu etkinlikte bulunamadı");
  }
  const freeName = input.guestName?.trim() ?? "";
  const guestName = participation ? `${participation.person.firstName} ${participation.person.lastName}`.trim() : freeName;
  if (!guestName || guestName.length < 2) {
    throw new ManualReservationError("GUEST", "Misafir adı zorunludur — katılım seçin ya da serbest isim girin");
  }

  const finalRate = ratePerNight ?? roomType?.pricePerNight ?? 0;
  const actorName = input.actorName?.trim() || "Yönetici";

  // ── 3) kayıt + stok — TEK transaction ──
  return db.$transaction(async (tx) => {
    // MÜKERRER — aynı katılım + çakışan tarih + aktif durum
    if (participation) {
      const clash = await tx.reservation.findFirst({
        where: {
          primaryGuestParticipationId: participation.id,
          status: { not: "CANCELLED" },
          checkIn: { lt: checkOut },
          checkOut: { gt: checkIn },
        },
        select: { id: true, guestName: true, checkIn: true, checkOut: true, status: true },
      });
      if (clash) {
        throw new ManualReservationError(
          "DUPLICATE",
          `Bu misafirin çakışan aktif rezervasyonu var: ${clash.guestName} · ${clash.checkIn.toLocaleDateString("tr-TR")} → ${clash.checkOut.toLocaleDateString("tr-TR")} (${clash.status})`,
          { reservationId: clash.id }
        );
      }
    }

    // STOK — CONFIRMED + blok: her gece taze doğrulama ve tüketim (P3 deseni)
    let stockConsumed = false;
    if (block && status === "CONFIRMED") {
      const invNights = await tx.inventoryNight.findMany({ where: { blockId: block.id } });
      const missing: string[] = [];
      for (let i = 0; i < nights; i++) {
        const day = new Date(checkIn.getTime() + i * 86400000);
        const inv = invNights.find((n) => sameDay(n.date, day));
        if (!inv) { missing.push(`${day.toLocaleDateString("tr-TR")} (stok tanımsız)`); continue; }
        if (inv.reservedRooms + 1 > inv.totalRooms) { missing.push(`${day.toLocaleDateString("tr-TR")} (stok yok)`); }
      }
      if (missing.length > 0) {
        throw new ManualReservationError("STOCK", `Stok yetersiz — şu gecelerde ayrılabilecek oda yok: ${missing.join(", ")}`, { missing });
      }
      for (let i = 0; i < nights; i++) {
        const day = new Date(checkIn.getTime() + i * 86400000);
        const inv = invNights.find((n) => sameDay(n.date, day))!;
        await tx.inventoryNight.update({ where: { id: inv.id }, data: { reservedRooms: inv.reservedRooms + 1 } });
      }
      stockConsumed = true;
    }

    const reservation = await tx.reservation.create({
      data: {
        editionId: edition.id,
        blockId: block?.id ?? null,
        roomTypeId: roomType?.id ?? null,
        primaryGuestParticipationId: participation?.id ?? null,
        guestName,
        checkIn,
        checkOut,
        payerType,
        payerName,
        status,
        occupancyType,
        ratePerNight: finalRate,
        nights,
        notes: input.notes?.trim() || null,
      },
      select: { id: true },
    });

    // Ana konuk slotu — katılıma bağlı girişte açılır
    let occupancySlotCreated = false;
    if (participation) {
      await tx.occupancySlot.create({
        data: { reservationId: reservation.id, participationId: participation.id, guestName, position: 1 },
      });
      occupancySlotCreated = true;
    }

    await tx.activityLog.create({
      data: {
        tenantId: edition.tenantId,
        editionId: edition.id,
        type: ActivityType.RESERVATION_SAVED,
        message: `Manuel rezervasyon: ${guestName} — ${nights} gece${block ? ` · ${block.hotel.name}/${roomType?.name ?? ""}` : " (envanter dışı)"}${stockConsumed ? ` · ${nights} oda-gece tüketildi` : ""}`,
        entityType: "Reservation",
        entityId: reservation.id,
        actorName,
      },
    });

    return {
      reservationId: reservation.id,
      guestName,
      status,
      blockId: block?.id ?? null,
      roomTypeId: roomType?.id ?? null,
      nights,
      ratePerNight: finalRate,
      stockConsumed,
      occupancySlotCreated,
      duplicatedOf: null,
    };
  }, { timeout: 20_000, maxWait: 10_000 });
}
