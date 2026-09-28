// ============================================================================
// GET /api/media/export?editionId=… — Medya klasörünü ZIP olarak indirir
// Kullanıcı kuralı: "Medya klasörünü proje sonunda export edebilmeliyim zip olarak."
// P14.1: dış bağlantılar varsayılan olarak indirilmez — `.url` bırakılır;
// indirme yalnız MEDIA_EXPORT_FETCH_EXTERNAL=on ile açılır ve P14.2
// doğrulayıcısından geçer. ZIP üretimi paylaşılan üreticidedir.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { AUTH_ENABLED, hasSession } from "@/lib/auth-flag";
import { requireStaff, requestActor } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logExport } from "@/lib/privacy/export-guard";
import { ensureSystemFolders, slugifyName } from "@/lib/media-system";
import {
  buildMediaArchive,
  mediaExportDeadlineMs,
  mediaExportFetchExternal,
  ArchiveDeadlineError,
} from "@/lib/media/archive";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // S3: toplu indirme istismarı kapısı — 10 indirme/dk/IP
    const dlDenied = enforceRateLimit(req, { key: "media-export", limit: 10, windowMs: 60_000 });
    if (dlDenied) return dlDenied;

    // G0-f: auth bayrağı açıkken oturum zorunlu — katılımcı fotoğrafları KVKK kapsamında PII'dir
    if (AUTH_ENABLED && !(await hasSession(req))) {
      return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
    }
    // P14.2: medya arşivi PII taşır (katılımcı fotoğrafları) — kadro kapısı zorunlu.
    const staffGate = await requireStaff();
    if (staffGate) return staffGate;

    const editionId = req.nextUrl.searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 422 });

    // G0-b: medya arşivi PII taşır — edisyon bağlamına doğrulanır (bogus/yabancı → 404)
    try {
      await resolveEditionContext(editionId, { required: true });
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      select: { name: true, slug: true, tenantId: true, series: { select: { name: true } } },
    });
    if (!edition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    const { root, folders } = await ensureSystemFolders(editionId);

    const allFolders = await db.mediaFolder.findMany({ where: { editionId } });
    const assets = await db.mediaAsset.findMany({
      where: { editionId },
      orderBy: [{ folderId: "asc" }, { name: "asc" }],
    });

    let built;
    try {
      built = await buildMediaArchive({
        edition: { id: editionId, name: edition.name, slug: edition.slug, seriesName: edition.series?.name ?? null },
        rootFolder: { id: root.id, name: root.name, parentId: null },
        folders: allFolders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId })),
        systemFolders: Object.fromEntries(Object.entries(folders).map(([k, v]) => [k, v.name])),
        assets: assets.map((a) => ({
          id: a.id,
          name: a.name,
          kind: a.kind,
          mimeType: a.mimeType,
          sizeKb: a.sizeKb,
          dataUrl: a.dataUrl,
          externalUrl: a.externalUrl,
          tags: a.tags,
          linkedType: a.linkedType,
          linkedId: a.linkedId,
          folderId: a.folderId,
          createdAt: a.createdAt,
        })),
        fetchExternal: mediaExportFetchExternal(),
        deadlineMs: mediaExportDeadlineMs(),
      });
    } catch (e) {
      if (e instanceof ArchiveDeadlineError) {
        return NextResponse.json({ error: "Arşiv üretim bütçesi aşıldı — daha küçük kapsam deneyin" }, { status: 503 });
      }
      throw e;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `medya-arsivi-${slugifyName(edition.slug)}-${stamp}.zip`;

    const actor = await requestActor();
    await logExport(db, { tenantId: edition.tenantId ?? null, editionId, type: "MEDIA", count: assets.length, actorName: actor?.uid ?? null });

    return new NextResponse(new Uint8Array(built.buffer), {
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
