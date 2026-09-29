// PWA Katılımcı Portalı — ETKİNLİĞE ÖZEL MANİFEST
// GET /api/portal/manifest?slug=<edition>
// Kurulan uygulama doğru yüzeyi açar (start_url=/?portal=<slug>), etkinlik adını ve
// tema rengini taşır. PUBLIC: PII yok (yalnız herkese açık edisyon adı + tema).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { buildPortalManifest } from "@/lib/portal-manifest";
import { parsePwaSettings } from "@/lib/pwa-settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "portal-manifest", limit: 120, windowMs: 60_000 });
  if (denied) return denied;

  try {
    const slug = req.nextUrl.searchParams.get("slug")?.trim() ?? "";
    if (!slug) return NextResponse.json({ error: "slug zorunlu" }, { status: 400 });

    const edition = await db.eventEdition.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, isPublished: true },
    });
    if (!edition || !edition.isPublished) {
      return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    }
    const config = await db.eventPortalConfig.findUnique({
      where: { editionId: edition.id },
      select: { themeColor: true, pwaJson: true },
    });

    const manifest = buildPortalManifest({
      editionSlug: edition.slug,
      name: edition.name,
      themeColor: config?.themeColor,
      pwa: parsePwaSettings(config?.pwaJson),
    });
    return new NextResponse(JSON.stringify(manifest), {
      status: 200,
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Manifest üretilemedi" }, { status: 500 });
  }
}
