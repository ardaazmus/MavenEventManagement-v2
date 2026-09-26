// /api/room-stock — Blok gecelik stoğunu TOPLU tanımla / uzat / büyüt (Konaklama)
// Tekil InventoryNight POST'u tarih bazlıydı; otel kontratları tarih ARALIĞI ile
// konuşur: "1 Eylül–7 Eylül, 12 oda". Bu uç aralığı gece gece upsert eder:
//   mode "add" → mevcut gece stoğuna EKLER (kontrat büyütme)
//   mode "set" → toplam stoğu AYARLAR (düzeltme; ayrılmış oda sayısının altına inmez)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDay } from "@/lib/api/manual-reservation";
import { verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ActivityType } from "@/lib/api/activity";

const MAX_SPAN = 120;

export async function POST(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "room-stock", limit: 60, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const blockId = typeof body.blockId === "string" ? body.blockId : "";
    if (!blockId) return NextResponse.json({ error: "blockId zorunludur" }, { status: 400 });

    const block = await db.roomBlock.findUnique({
      where: { id: blockId },
      include: { hotel: { select: { editionId: true, name: true } } },
    });
    if (!block) return NextResponse.json({ error: "Oda bloğu bulunamadı" }, { status: 404 });
    try {
      await verifyEditionTenant(block.hotel.editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const from = parseDay(body.from);
    const to = parseDay(body.to);
    if (!from || !to) return NextResponse.json({ error: "Tarih biçimi geçersiz (YYYY-AA-GG)" }, { status: 400 });
    const span = Math.round((to.getTime() - from.getTime()) / 86400000) + 1; // dahil
    if (span < 1) return NextResponse.json({ error: "Bitiş tarihi başlangıçtan önce olamaz" }, { status: 400 });
    if (span > MAX_SPAN) return NextResponse.json({ error: `Aralık en fazla ${MAX_SPAN} gece olabilir` }, { status: 400 });

    const totalRooms = Number(body.totalRooms);
    if (!Number.isInteger(totalRooms) || totalRooms < 0 || totalRooms > 5000) {
      return NextResponse.json({ error: "Oda sayısı 0-5000 arası tam sayı olmalı" }, { status: 400 });
    }
    const mode = body.mode === "set" ? "set" : "add";

    const upserted = await db.$transaction(async (tx) => {
      let count = 0;
      for (let i = 0; i < span; i++) {
        const day = new Date(from.getTime() + i * 86400000);
        const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
        const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, 0);
        const inv = await tx.inventoryNight.findFirst({ where: { blockId, date: { gte: dayStart, lt: dayEnd } } });
        if (inv) {
          const next = mode === "add" ? inv.totalRooms + totalRooms : totalRooms;
          // ayrılmış odaların altına inilemez — stok düşürme clamp'i
          await tx.inventoryNight.update({ where: { id: inv.id }, data: { totalRooms: Math.max(next, inv.reservedRooms) } });
        } else {
          await tx.inventoryNight.create({
            data: { blockId, date: day, totalRooms, reservedRooms: 0 },
          });
        }
        count++;
      }
      return count;
    });

    await db.activityLog.create({
      data: {
        editionId: block.hotel.editionId,
        type: ActivityType.RESERVATION_SAVED,
        message: `Gecelik stok ${mode === "add" ? "artırıldı" : "ayrlandı"}: ${block.name} — ${span} gece × ${totalRooms} oda (${mode})`,
        entityType: "RoomBlock",
        entityId: block.id,
        actorName: "Otel Sorumlusu",
      },
    });

    return NextResponse.json({ upserted, mode, blockId, from: from.toISOString(), to: to.toISOString() }, { status: 201 });
  } catch (e) {
    console.error("POST /api/room-stock", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Stok güncellenemedi" }, { status: 500 });
  }
}
