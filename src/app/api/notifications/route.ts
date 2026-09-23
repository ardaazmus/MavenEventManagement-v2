// /api/notifications — Aktivite günlüğünden türetilen bildirim merkezi (§47 domain event → UI bildirim)
// GET ?editionId=&limit= → son olaylar + önem seviyesi + hedef modül (zil menüsü tıklanınca ilgili ekrana gider)
// Canlı akış live-bus (socket.io) üzerinden gelir; bu uç ilk yükleme + yoklama yedeğidir.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { moduleFor, severityFor } from "@/lib/api/notification-meta";

export async function GET(req: NextRequest) {
  try {
    const editionId = req.nextUrl.searchParams.get("editionId");
    const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 25);
    const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 100 ? limitParam : 25;

    const items = await db.activityLog.findMany({
      where: editionId ? { editionId } : {},
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      items: items.map((a) => ({
        id: a.id,
        type: a.type,
        message: a.message,
        actorName: a.actorName,
        entityType: a.entityType,
        createdAt: a.createdAt.toISOString(),
        severity: severityFor(a.type),
        module: moduleFor(a.entityType, a.type),
      })),
    });
  } catch (e) {
    console.error("GET /api/notifications", e);
    return NextResponse.json({ error: "Bildirimler okunamadı" }, { status: 500 });
  }
}
