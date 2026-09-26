// /api/reservations/manual — Admin MANUEL TEKİL rezervasyon (Konaklama & Seyahat)
// Telefon/e-posta ile gelen rezervasyon taleplerinin yönetim yüzeyi:
// misafir (katılıma bağlı veya serbest) + blok/oda tipi + tarih + ödeyen + durum.
// CONFIRMED girişte stok tüketir (reservation.confirm ile aynı invariant, TEK tx).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createManualReservation, ManualReservationError } from "@/lib/api/manual-reservation";
import { verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { withLock } from "@/lib/tx-lock";

export async function POST(req: NextRequest) {
  // yönetim yazım kapısı — 30 istek/dk/IP
  const denied = enforceRateLimit(req, { key: "res-manual", limit: 30, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const editionId = typeof body.editionId === "string" ? body.editionId : "";
    if (!editionId) return NextResponse.json({ error: "editionId zorunludur" }, { status: 400 });

    // bağlam kiracısı ≠ edisyon kiracısı / edisyon yok → GuardError (400/403/404)
    try {
      await verifyEditionTenant(editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const actor = await requestActor();
    let actorName = "Yönetici";
    if (actor) {
      const u = await db.user.findUnique({ where: { id: actor.uid }, select: { name: true, role: true } });
      actorName = u?.name ?? actor.role;
    }

    // eşzamanlı manuel rezervasyon yazımlarını edisyon başına serileştir (stok yarışı)
    const result = await withLock(`resman:${editionId}`, () =>
      createManualReservation({
        editionId,
        participationId: (body.participationId as string) || null,
        guestName: (body.guestName as string) || null,
        hotelId: (body.hotelId as string) || null,
        blockId: (body.blockId as string) || null,
        roomTypeId: (body.roomTypeId as string) || null,
        checkIn: String(body.checkIn ?? ""),
        checkOut: String(body.checkOut ?? ""),
        // beyaz liste denetimi ÇEKİRDEKTE yapılır (ham değer geçirilir) — sessiz
        // dönüşüm YOK: admin CHECKED_IN girdiyse 400 almalı, REQUESTED'a çevrilmemeli
        occupancyType: (body.occupancyType as string) || null,
        payerType: (body.payerType as string) || null,
        payerName: (body.payerName as string) || null,
        ratePerNight: typeof body.ratePerNight === "number" && Number.isFinite(body.ratePerNight) ? body.ratePerNight : null,
        status: (body.status as string) || null,
        notes: (body.notes as string) || null,
        actorName,
      })
    );

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof ManualReservationError) {
      const status = e.code === "EDITION_NOT_FOUND" ? 404 : e.code === "STOCK" || e.code === "DUPLICATE" ? 409 : 400;
      return NextResponse.json({ error: e.message, code: e.code, detail: e.detail ?? null }, { status });
    }
    console.error("POST /api/reservations/manual", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Rezervasyon oluşturulamadı" }, { status: 500 });
  }
}
