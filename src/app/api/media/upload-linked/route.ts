// ============================================================================
// POST /api/media/upload-linked — Medya klasörüne benzersiz adla bağlantılı yükleme
// Kullanıcı kuralı: kişi fotoğrafı, kurum logosu, otel görseli, portal arka
// planı, materyal… yüklenirken sistem klasörüne BENZERSİZ adla kaydedilir ve
// kaynağına (linkedType/linkedId) bağlanır.
// Body: { editionId, systemFolder, name, dataUrl?, externalUrl?, linkedType?, linkedId?, tags? }
// Dönen: { asset, folder } — asset.dataUrl/externalUrl + folder.systemKey
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSystemFolders, resolveSystemFolderKey, uniqueAssetName, parseDataUrl } from "@/lib/media-system";

export const runtime = "nodejs";

const MAX_DATAURL_KB = 600; // SQLite satırı için güvenli tavan (≤ 600KB)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const editionId = String(body.editionId ?? "");
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 422 });

    const edition = await db.eventEdition.findUnique({ where: { id: editionId }, select: { id: true } });
    if (!edition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    const folderKey = resolveSystemFolderKey(body.systemFolder);
    const { folders } = await ensureSystemFolders(editionId);
    const folder = folders[folderKey];

    const rawName = String(body.name ?? "").trim();
    if (!rawName) return NextResponse.json({ error: "Dosya adı zorunlu" }, { status: 422 });

    const dataUrl = typeof body.dataUrl === "string" && body.dataUrl.startsWith("data:") ? body.dataUrl : null;
    const externalUrl = typeof body.externalUrl === "string" && body.externalUrl.startsWith("http") ? body.externalUrl : null;
    if (!dataUrl && !externalUrl) {
      return NextResponse.json({ error: "dataUrl (data:) veya externalUrl (http) gereklidir" }, { status: 422 });
    }

    const parsed = dataUrl ? parseDataUrl(dataUrl) : null;
    if (dataUrl && !parsed) return NextResponse.json({ error: "dataUrl biçimi geçersiz" }, { status: 422 });
    if (parsed && parsed.sizeKb > MAX_DATAURL_KB) {
      return NextResponse.json({ error: `Dosya ${parsed.sizeKb} KB — gömme tavanı ${MAX_DATAURL_KB} KB. Bağlantı modunu kullanın.` }, { status: 413 });
    }

    // BENZERSİZ ad — her yüklemede çakışmasız
    const finalName = body.keepExactName === true ? rawName : uniqueAssetName(rawName, parsed?.ext);

    const asset = await db.mediaAsset.create({
      data: {
        editionId,
        folderId: folder.id,
        name: finalName,
        kind: body.kind ?? (parsed?.mimeType.startsWith("image/") ? "IMAGE" : parsed?.mimeType.startsWith("video/") ? "VIDEO" : "DOCUMENT"),
        mimeType: parsed?.mimeType ?? body.mimeType ?? null,
        sizeKb: parsed?.sizeKb ?? body.sizeKb ?? null,
        dataUrl,
        externalUrl,
        tags: typeof body.tags === "string" ? body.tags : null,
        linkedType: body.linkedType ?? null, // PERSON|ORGANIZATION|HOTEL|SUBMISSION|SESSION|PORTAL|CERTIFICATE|BADGE_DESIGN
        linkedId: body.linkedId ?? null,
      },
    });

    await db.activityLog.create({
      data: {
        editionId,
        type: "OTHER",
        message: `Medya klasörüne eklendi: ${finalName} → ${folder.name}`,
        entityType: "MediaAsset",
        entityId: asset.id,
        actorName: "Sistem",
      },
    }).catch(() => undefined);

    return NextResponse.json({ asset, folder: { id: folder.id, name: folder.name, systemKey: folderKey } }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Yükleme başarısız" }, { status: 500 });
  }
}
