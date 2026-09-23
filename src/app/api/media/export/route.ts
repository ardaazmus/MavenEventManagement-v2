// ============================================================================
// GET /api/media/export?editionId=… — Medya klasörünü ZIP olarak indirir
// Kullanıcı kuralı: "Medya klasörünü proje sonunda export edebilmeliyim zip olarak."
// Yapı:  Medya/  → kategori klasörleri → varlıklar (dataUrl'ler binary olarak,
//        dış bağlantılar en iyi çaba ile çekilir) + manifest.json
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { db } from "@/lib/db";
import { ensureSystemFolders, slugifyName } from "@/lib/media-system";

export const runtime = "nodejs";

interface AssetRow {
  id: string; name: string; kind: string; mimeType: string | null; sizeKb: number | null;
  dataUrl: string | null; externalUrl: string | null; tags: string | null; linkedType: string | null;
  linkedId: string | null; folderId: string | null; createdAt: Date;
}

function safeDir(name: string): string {
  return slugifyName(name).replace(/[^a-z0-9-]/g, "");
}

export async function GET(req: NextRequest) {
  try {
    const editionId = req.nextUrl.searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 422 });

    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      select: { name: true, slug: true, series: { select: { name: true } } },
    });
    if (!edition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    const { root, folders } = await ensureSystemFolders(editionId);

    const allFolders = await db.mediaFolder.findMany({ where: { editionId } });
    const assets = (await db.mediaAsset.findMany({
      where: { editionId },
      orderBy: [{ folderId: "asc" }, { name: "asc" }],
    })) as unknown as AssetRow[];

    const zip = new JSZip();
    const rootDir: JSZip = zip.folder("Medya")!;

    // klasör id → zip yolu (kök + kategori klasörleri garantili)
    const dirOf = new Map<string, JSZip>();
    dirOf.set(root.id, rootDir);
    for (const f of allFolders) {
      if (f.id === root.id) continue;
      const parentDir = f.parentId ? (dirOf.get(f.parentId) ?? rootDir) : rootDir;
      dirOf.set(f.id, parentDir.folder(safeDir(f.name) || "klasor")!);
    }

    const manifest: Array<Record<string, unknown>> = [];
    let embedded = 0, linked = 0, failed = 0;

    for (const a of assets) {
      const dir = (a.folderId ? dirOf.get(a.folderId) : rootDir) ?? rootDir;
      const entry = {
        name: a.name, kind: a.kind, mimeType: a.mimeType, sizeKb: a.sizeKb,
        tags: a.tags, linkedType: a.linkedType, linkedId: a.linkedId,
        createdAt: a.createdAt.toISOString(), source: a.dataUrl ? "embedded" : a.externalUrl ? "external" : "none",
      };
      manifest.push({ ...entry, folder: allFolders.find((f) => f.id === a.folderId)?.name ?? "Medya" });

      if (a.dataUrl && a.dataUrl.startsWith("data:")) {
        const base64 = a.dataUrl.slice(a.dataUrl.indexOf(",") + 1);
        dir.file(a.name, base64, { base64: true });
        embedded++;
      } else if (a.externalUrl) {
        // en iyi çaba: dış bağlantıyı indir; olmazsa .url dosyası bırak
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(a.externalUrl, { signal: ctrl.signal });
          clearTimeout(t);
          if (res.ok) {
            const buf = await res.arrayBuffer();
            dir.file(a.name, Buffer.from(buf));
            linked++;
          } else throw new Error(String(res.status));
        } catch {
          dir.file(`${a.name}.url`, `[InternetShortcut]\nURL=${a.externalUrl}\n`);
          failed++;
        }
      }
    }

    rootDir.file("manifest.json", JSON.stringify({
      exportedAt: new Date().toISOString(),
      edition: { id: editionId, name: edition.name, slug: edition.slug, series: edition.series?.name ?? null },
      rootFolder: root.name,
      systemFolders: Object.fromEntries(Object.entries(folders).map(([k, v]) => [k, v.name])),
      summary: { totalAssets: assets.length, embedded, externalDownloaded: linked, externalFallbackUrl: failed },
      assets: manifest,
    }, null, 2));

    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `medya-arsivi-${slugifyName(edition.slug)}-${stamp}.zip`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ZIP üretilemedi" }, { status: 500 });
  }
}
