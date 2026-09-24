// ============================================================================
// POST /api/media/upload-linked — Medya klasörüne benzersiz adla bağlantılı yükleme
// Kullanıcı kuralı: kişi fotoğrafı, kurum logosu, otel görseli, portal arka
// planı, materyal… yüklenirken sistem klasörüne BENZERSİZ adla kaydedilir ve
// kaynağına (linkedType/linkedId) bağlanır.
// Body: { editionId, systemFolder, name, dataUrl?, externalUrl?, linkedType?, linkedId?, tags? }
// Dönen: { asset, folder } — asset.dataUrl/externalUrl + folder.systemKey
//
// M5 — MEDYA SERTLEŞTİRME (bu rotada zorunlu):
//  • magic-bytes: içerik imzası iddia edilen mime ile eşleşmezse RED (polyglot savunması)
//  • SVG RED: image/svg+xml XSS vektörüdür — kabul edilmez
//  • AVIF RED: decoder saldırı yüzeyi — çıkış biçimi ASLA avif değil
//  • 25MP iki-kapı: (1) metadata w×h ≤ 25.000.000; (2) dönüşüm sonrası boyut yeniden doğrulanır
//  • WebP q80: raster görseller meta veriler temizlenerek WebP kalite 80'e dönüştürülür
//  • DOCUMENT muafiyet: görsel olmayanlar (PDF vb.) piksel/WebP kapılarından geçmez (magic-bytes yine zorunlu)
//  • thumb 320: raster görseller için 320px WebP önizleme üretilir (thumbDataUrl)
//  • concurrency(1) + cache 64MB: sharp küresel yapılandırma (CPU/bellek istismarı sınırı)
//  • kota: edisyon başına toplam medya 512 MB — aşım RED
//  • göreli yol ilkesi: kalıcı kayıtlarda mutlak sunucu yolu/bağlantı üretilmez (dataURL veya kullanıcı linki)
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { ensureSystemFolders, resolveSystemFolderKey, uniqueAssetName, parseDataUrl } from "@/lib/media-system";

export const runtime = "nodejs";

// M5: sharp küresel sınırlar — tek iş parçacığı, 64MB önbellek, devre dışı meta çıktı
sharp.concurrency(1);
sharp.cache({ memory: 64, files: 20, items: 100 });

const MAX_DATAURL_KB = 600;         // SQLite satırı için güvenli tavan (≤ 600KB)
const MAX_PIXELS = 25_000_000;      // 25MP iki-kapı (unlimited ASLA — limitInputPixels her kapıda)
const MAX_EDGE = 1920;              // TASK-B 16: uzun kenar tavanı (çıkış — kaynak muaf)
const THUMB_SIZE = 320;             // thumb 320
const EDITION_QUOTA_KB = 512 * 1024; // 512 MB edisyon kotası (aşım 413 PAYLOAD_TOO_LARGE)

// magic-bytes tablosu — iddia ≠ gerçek (ilk baytlar konuşur)
function detectMagic(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  const head = buf.subarray(0, 12);
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return { mime: "image/gif", ext: "gif" };
  if (head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (head.subarray(0, 4).toString("ascii") === "%PDF") return { mime: "application/pdf", ext: "pdf" };
  if (head[0] === 0x1f && head[1] === 0x8b) return { mime: "application/gzip", ext: "gz" };
  if (head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07)) return { mime: "application/zip", ext: "zip" }; // docx/xlsx/pptx
  if (head[0] === 0x00 && head[1] === 0x00 && (head[2] === 0x01 || head[2] === 0x02)) return { mime: "video/mp4", ext: "mp4" }; // ftyp kutulu mp4/mov başlangıcı
  if (head.subarray(4, 8).toString("ascii") === "ftyp") return { mime: "video/mp4", ext: "mp4" };
  return null;
}

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

    // ── M5: kota — edisyon toplam medya tüketimi ──
    const quotaAgg = await db.mediaAsset.aggregate({ where: { editionId }, _sum: { sizeKb: true } });
    const usedKb = quotaAgg._sum.sizeKb ?? 0;
    if (parsed && usedKb + parsed.sizeKb > EDITION_QUOTA_KB) {
      return NextResponse.json({ error: `Medya kotası doldu (${Math.round(usedKb / 1024)} MB / ${EDITION_QUOTA_KB / 1024} MB) — eski varlıkları arşivleyip silin` }, { status: 413 }); // TASK-B 16: kota 413
    }

    // ── M5: magic-bytes + biçim savunmaları ──
    let buf: Buffer | null = null;
    let detected: { mime: string; ext: string } | null = null;
    if (parsed) {
      buf = Buffer.from(dataUrl!.slice(dataUrl!.indexOf(",") + 1), "base64");
      detected = detectMagic(buf);
      if (!detected) return NextResponse.json({ error: "Bilinmeyen dosya imzası — içerik reddedildi" }, { status: 415 });
      const claimed = parsed.mimeType.toLowerCase();
      const isDocumentFamily = claimed.startsWith("application/") || claimed.startsWith("text/");
      const imageLike = detected.mime.startsWith("image/") || detected.mime.startsWith("video/");
      if (!isDocumentFamily && imageLike && claimed !== detected.mime && !(claimed === "image/jpg" && detected.mime === "image/jpeg")) {
        return NextResponse.json({ error: `İçerik imzası (${detected.mime}) bildirilen türle (${claimed}) uyuşmuyor` }, { status: 415 });
      }
      // SVG reddi — hem bildirim hem imza düzeyinde (SVG imzası metin olduğundan detectMagic'e düşmez)
      if (claimed === "image/svg+xml" || (buf.subarray(0, 200).toString("utf8").includes("<svg"))) {
        return NextResponse.json({ error: "SVG kabul edilmez (XSS vektörü) — PNG/JPG/WebP kullanın" }, { status: 415 });
      }
      // AVIF reddi — decoder saldırı yüzeyi + "no AVIF" politikası
      if (claimed === "image/avif" || (buf.subarray(4, 12).toString("ascii").startsWith("ftypavif"))) {
        return NextResponse.json({ error: "AVIF kabul edilmez — WebP/JPG/PNG kullanın" }, { status: 415 });
      }
    }

    // ── M5: görsel işleme — WebP q80 + iki-kapı 25MP + thumb 320; DOCUMENT muaf ──
    let storedDataUrl = dataUrl;
    let storedMime = parsed?.mimeType ?? (body.mimeType as string | undefined) ?? null;
    let storedExt = parsed?.ext ?? null;
    let storedSizeKb = parsed?.sizeKb ?? (body.sizeKb as number | undefined) ?? null;
    let widthPx: number | null = null;
    let heightPx: number | null = null;
    let thumbDataUrl: string | null = null;

    if (buf && detected?.mime.startsWith("image/")) {
      // KAPI 1: metadata piksel sınırı + failOn error (kesik/bozuk girdi RED — sharp docs)
      const meta = await sharp(buf, { limitInputPixels: MAX_PIXELS, failOn: "error" })
        .metadata().catch(() => null);
      if (!meta) return NextResponse.json({ error: "Görsel çözümlenemedi" }, { status: 415 });
      const pixels = (meta.width ?? 0) * (meta.height ?? 0);
      if (pixels > MAX_PIXELS) {
        return NextResponse.json({ error: `Görsel ${meta.width}×${meta.height} px — 25 MP tavanı aşıldı` }, { status: 413 });
      }
      // TASK-B 16: animasyonlu girdi (GIF/WebP) → İLK KARE (pages:1) — statik WebP çıkışı
      const frameCount = meta.pages ?? 1;
      // Fotoğraf: WebP q80 — şeffaflık YOKSA kayıplı; ALFA VARSA KAYIPSIZ (alpha lossless —
      // kenar/kademeli saydamlık bozulması önlenir). EXIF/GPS/meta zaten şerilmez.
      const hasAlpha = meta.hasAlpha === true;
      let pipeline = sharp(buf, { limitInputPixels: MAX_PIXELS, pages: 1, failOn: "error" })
        .rotate(); // EXIF yönüne göre döndür (meta şerildikten sonra görüntü doğru dursun)
      // TASK-B 16: uzun kenar > 1920 → içe sığdır (up-scale ASLA)
      if ((meta.width ?? 0) > MAX_EDGE || (meta.height ?? 0) > MAX_EDGE) {
        pipeline = pipeline.resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true });
      }
      const webp = await (hasAlpha ? pipeline.webp({ lossless: true }) : pipeline.webp({ quality: 80 }))
        .toBuffer({ resolveWithObject: true });
      // KAPI 2: dönüşüm sonrası boyut yeniden doğrulanır
      const outPixels = webp.info.width * webp.info.height;
      if (outPixels > MAX_PIXELS) {
        return NextResponse.json({ error: "İşlenmiş çıktı piksel tavanını aşıyor — reddedildi" }, { status: 413 });
      }
      widthPx = webp.info.width;
      heightPx = webp.info.height;
      storedMime = "image/webp";
      storedExt = "webp";
      storedSizeKb = Math.round(webp.data.length / 1024);
      storedDataUrl = `data:image/webp;base64,${webp.data.toString("base64")}`;
      if (storedSizeKb > MAX_DATAURL_KB) {
        return NextResponse.json({ error: `İşlenmiş görsel ${storedSizeKb} KB — gömme tavanı ${MAX_DATAURL_KB} KB` }, { status: 413 });
      }
      // thumb 320 — önizleme WebP (ilk kare; alpha → lossless)
      const thumb = await sharp(buf, { limitInputPixels: MAX_PIXELS, pages: 1, failOn: "error" })
        .rotate()
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
        .webp(hasAlpha ? { lossless: true } : { quality: 80 })
        .toBuffer();
      thumbDataUrl = `data:image/webp;base64,${thumb.toString("base64")}`;
      // animasyonlu girdi kanıtı: kare sayısı > 1 ise kayıt notu (çıkış statik — ilk kare)
      if (frameCount > 1) {
        await db.activityLog.create({
          data: { editionId, type: "OTHER", message: `Animasyonlu görsel ilk kareye indirildi (${frameCount} kare → statik WebP): ${rawName}`, entityType: "MediaAsset", actorName: "Sistem" },
        }).catch(() => undefined);
      }
    }

    // BENZERSİZ ad — her yüklemede çakışmasız
    const finalName = body.keepExactName === true ? rawName : uniqueAssetName(rawName, storedExt);

    const asset = await db.mediaAsset.create({
      data: {
        editionId,
        folderId: folder.id,
        name: finalName,
        kind: body.kind ?? (storedMime?.startsWith("image/") ? "IMAGE" : storedMime?.startsWith("video/") ? "VIDEO" : storedMime?.startsWith("audio/") ? "AUDIO" : "DOCUMENT"),
        mimeType: storedMime,
        sizeKb: storedSizeKb,
        dataUrl: storedDataUrl,
        externalUrl,
        thumbDataUrl,
        widthPx,
        heightPx,
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
    console.error("POST /api/media/upload-linked", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Yükleme başarısız" }, { status: 500 });
  }
}
