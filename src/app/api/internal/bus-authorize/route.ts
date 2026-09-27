// P1 (yeni-fazlar 6): live-bus abonelik yetkilendirme ucu — DAHİLİ yol.
// live-bus, tarayıcı handshake çerezini buraya iletir; bu uç oturum kiracısı ile
// edisyon sahipliğini doğrular (auth-on: middleware oturumu doğrulamıştır; auth-off:
// demo bağlamı). Yanıt asla kişisel veri taşımaz — yalnız { ok, editionId }.
// Koruma: middleware /api/internal/* yolunu public listesine ALMADIĞI için auth-on'da
// oturumsuz doğrudan çağrı 401 alır; auth-off demo davranışı korunur.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext } from "@/lib/api/tenant-guard";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { editionId?: string | null };
    const editionId = typeof body.editionId === "string" && body.editionId.trim() !== "" ? body.editionId : null;
    const ctx = await resolveContext(null);

    if (editionId) {
      const ed = await db.eventEdition.findUnique({ where: { id: editionId }, select: { tenantId: true } });
      if (!ed || ed.tenantId !== ctx) {
        return NextResponse.json({ ok: false, reason: "edisyon bulunamadı" }, { status: 404 });
      }
    }
    return NextResponse.json({ ok: true, editionId });
  } catch (e) {
    // resolveContext bağlam çözemezse (boş DB) fail-closed
    return NextResponse.json({ ok: false, reason: e instanceof Error ? "bağlam çözülemedi" : "reddedildi" }, { status: 400 });
  }
}
