// ============================================================================
// GET /api/media/system-folders?editionId=… — Sistem medya klasörlerini garanti eder
// Medya kökü ("Medya") + kategori klasörleri: Yaka Kartı, Sertifika, Kişi
// Fotoğrafları, Kurum/Kuruluş Logoları, Otel, Materyaller, Portal…
// Kullanıcı kuralı: hepsi medya klasöründe KENDİ klasöründe toplanır.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSystemFolders, SYSTEM_MEDIA_FOLDERS } from "@/lib/media-system";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const editionId = req.nextUrl.searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 422 });

    const count = await db.mediaAsset.count({ where: { editionId } });
    const { root, folders } = await ensureSystemFolders(editionId);
    return NextResponse.json({ root, folders, specs: SYSTEM_MEDIA_FOLDERS, assetCount: count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sistem klasörleri hazırlanamadı" }, { status: 500 });
  }
}
