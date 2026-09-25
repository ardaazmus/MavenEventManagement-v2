// Bildirim kanalları (WhatsApp/SMS) GÖNDERİM RAPORU — organizatör yüzeyi.
// notify.ts logChannelBatch kayıtlarını (IntegrationLog: endpoint="channel:whatsapp|sms")
// okur; tekil gönderim kanıtı + hata ayıklama için. Yalnız admin, edisyon bağlam kapılı;
// payload/özet alanları kanal-sonuç özetidir (telefon numarası PII'si bunlara yazılmaz).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth/request-context";

export const dynamic = "force-dynamic";

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "channel-reports-read", limit: 60, windowMs: 60_000 });
    if (denied) return denied;
    const editionId = req.nextUrl.searchParams.get("editionId");
    const ctx = await resolveEditionContext(editionId, { required: true });
    const editionIdResolved = ctx.editionId as string;

    const items = await db.integrationLog.findMany({
      where: { editionId: editionIdResolved, endpoint: { startsWith: "channel:" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, method: true, endpoint: true, ok: true, statusCode: true, summary: true, createdAt: true },
    });
    const counts = {
      total: items.length,
      ok: items.filter((i) => i.ok).length,
      fail: items.filter((i) => !i.ok).length,
      whatsapp: items.filter((i) => i.method === "WHATSAPP").length,
      sms: items.filter((i) => i.method === "SMS").length,
    };
    return NextResponse.json({ items, counts });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("notifications/channels/reports GET:", e);
    return NextResponse.json({ error: "Gönderim raporu alınamadı" }, { status: 500 });
  }
}
