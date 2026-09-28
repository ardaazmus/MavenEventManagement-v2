// /api/reservations/export — Konaklama ODA LİSTESİ dışa aktarma (Excel/xlsx)
// Otel Rezervasyon Müdürlüğü'ne verilen "rooming list": otel/blok/oda tipi, misafir,
// tarih aralığı, doluluk, ödeyen, gecelik fiyat ve durum kolonları. Filtreler:
//   hotelId  → tek otel listesi
//   status   → ALL | ACCOMMODATION_STATUS anahtarları (varsayılan ALL)
//   from/to  → YYYY-AA-GG aralık (giriş tarihi üzerine kesişim)
// Sunucu tarafı SheetJS üretimi; kiracı kapsamı verifyEditionTenant ile zorlanır.
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff, requestActor } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logExport, personConsentWhere } from "@/lib/privacy/export-guard";

// SUNUCU-GÜVENLİ etiket haritaları — @/lib/constants İSTEMCİ modülüdür (i18n
// useSyncExternalStore bağı var; route'a giremez). Değerler constants.ts ile
// senkron tutulur (§10 Konaklama envanteri); yalnız xlsx metni için kullanılır.
const ACCOMMODATION_STATUS_TR: Record<string, string> = {
  NOT_REQUESTED: "Talep yok", REQUESTED: "Talep", WAITLIST: "Bekleme",
  RESERVED: "Ayrıldı", CONFIRMED: "Teyit", CHECKED_IN: "Giriş",
  CHECKED_OUT: "Çıkış", CANCELLED: "İptal",
};
const PAYER_TYPE_TR: Record<string, string> = {
  SELF: "Kendi Ödemesi", ORGANIZATION: "Kurum", SPONSOR: "Sponsor",
  ORGANIZER: "Organizatör", SPEAKER_HOSPITALITY: "Konuşmacı Ağırlama",
};
const OCCUPANCY_TR: Record<string, string> = {
  SINGLE: "Tek Kişi", DOUBLE: "Çift Kişi", FAMILY_SHARED: "Aile (Ortak)",
};

const MAX_EXPORT = 5000;
const MAJOR = (minor: number) => Math.round(minor) / 100;

const dayFmt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" });
const dayTR = (d: Date | null) => (d ? dayFmt.format(d) : "—");

export async function GET(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "res-export", limit: 12, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const sp = req.nextUrl.searchParams;
    const editionId = sp.get("editionId") ?? "";
    if (!editionId) return NextResponse.json({ error: "editionId zorunludur" }, { status: 400 });
    try {
      await verifyEditionTenant(editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const hotelId = sp.get("hotelId") ?? "";
    const status = sp.get("status") ?? "ALL";
    const fromRaw = sp.get("from") ?? "";
    const toRaw = sp.get("to") ?? "";

    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      select: { name: true, editionLabel: true, startDate: true, endDate: true, venueName: true, city: true, tenantId: true },
    });
    if (!edition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    const where: Record<string, unknown> = { editionId };
    if (hotelId) {
      where.block = { hotelId };
    }
    if (status && status !== "ALL") where.status = status;
    // P14.2: kişi bağlantılı satırlarda rızasız misafir dışta (isimsiz operasyonel
    // satırlar — bağlantısız guestName — sözleşme gereği kalır, denetimde izlenir).
    where.AND = [
      { OR: [{ primaryGuest: { is: null } }, { primaryGuest: { is: { person: { is: personConsentWhere() } } } }] },
    ];

    const reservations = await db.reservation.findMany({
      where,
      include: {
        block: { include: { hotel: true, roomType: true } },
        roomType: true,
        primaryGuest: { include: { person: true } },
        occupancySlots: { orderBy: { position: "asc" } },
      },
      orderBy: [{ checkIn: "asc" }, { guestName: "asc" }],
      take: MAX_EXPORT,
    });

    // tarih aralığı filtresi — rezervasyon aralığı [from,to) penceresiyle KESİŞİYOR mu
    let from: Date | null = null;
    let to: Date | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromRaw)) from = new Date(`${fromRaw}T00:00:00`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) to = new Date(`${toRaw}T23:59:59.999`);
    const rows = reservations.filter((r) => {
      if (from && r.checkOut <= from) return false;
      if (to && r.checkIn > to) return false;
      return true;
    });

    const generatedAt = new Date();
    const headers = [
      "Otel", "Blok", "Oda Tipi", "Misafir", "Ana Konuk (Kayıt)", "Konuk Slotları",
      "Giriş", "Çıkış", "Gece", "Doluluk", "Ödeyen Tip", "Ödeyen",
      "Gecelik Fiyat (₺)", "Toplam (₺)", "Durum", "No-Show", "Notlar",
    ];

    const aoa: (string | number)[][] = [
      ["ODA LİSTESİ (ROOMING LIST)"],
      [`${edition.name}${edition.editionLabel ? ` — ${edition.editionLabel}` : ""}`],
      [
        `Etkinlik tarihleri: ${dayTR(edition.startDate)} – ${dayTR(edition.endDate)}`,
        edition.venueName ?? "",
        edition.city ?? "",
      ].filter(Boolean),
      [`Oluşturulma: ${dayFmt.format(generatedAt)} · Toplam rezervasyon: ${rows.length}`],
      [],
      headers,
    ];

    for (const r of rows) {
      const nights = r.nights && r.nights > 0
        ? r.nights
        : Math.max(1, Math.round((r.checkOut.getTime() - r.checkIn.getTime()) / 86400000));
      const guestSlots = r.occupancySlots.map((s) => s.guestName || "—").join(", ");
      aoa.push([
        r.block?.hotel.name ?? "Envanter dışı",
        r.block?.name ?? "—",
        r.block?.roomType.name ?? r.roomType?.name ?? "—",
        r.guestName,
        r.primaryGuest ? `${r.primaryGuest.person.firstName} ${r.primaryGuest.person.lastName}` : "—",
        guestSlots || "—",
        dayTR(r.checkIn),
        dayTR(r.checkOut),
        nights,
        OCCUPANCY_TR[r.occupancyType ?? ""] ?? "—",
        PAYER_TYPE_TR[r.payerType] ?? r.payerType,
        r.payerName ?? "—",
        MAJOR(r.ratePerNight),
        MAJOR(r.ratePerNight * nights),
        ACCOMMODATION_STATUS_TR[r.status] ?? r.status,
        r.noShow ? `EVET (${MAJOR(r.noShowFee)} ₺)` : "—",
        r.notes ?? "—",
      ]);
    }

    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet["!cols"] = headers.map((h, i) => ({
      wch: Math.min(38, Math.max(h.length + 2, ...aoa.slice(6, 56).map((r) => String(r[i] ?? "").length + 2))),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Oda Listesi");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const stamp = generatedAt.toISOString().slice(0, 10);
    const filename = `oda-listesi-${stamp}.xlsx`;

    const actor = await requestActor();
    await logExport(db, { tenantId: edition.tenantId ?? null, editionId, type: "RESERVATIONS", count: rows.length, actorName: actor?.uid ?? null });

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Export-Count": String(rows.length),
      },
    });
  } catch (e) {
    console.error("GET /api/reservations/export", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Oda listesi oluşturulamadı" }, { status: 500 });
  }
}
