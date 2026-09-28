// P14.4: GET /api/media/export-jobs/[id]/file?token=… — imzalı medya arşivi.
// Kimlik jetonun kendisidir (oturum gerekmez); paket YALNIZ manifest-dogrulanmış
// güvenilir nesnelerden kurulur — indirme anında ağa çıkılmaz, DB okunmaz.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  buildTrustedZip,
  recordMediaDownload,
  verifyMediaDownloadToken,
} from "@/lib/media/downloads";
import { MediaJobError } from "@/lib/media/job-queue";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(req, { key: "media-export-file", limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token zorunludur" }, { status: 401 });
  try {
    const { id } = await ctx.params;
    const verdict = await verifyMediaDownloadToken(db as never, id, token);
    if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: verdict.status });

    const pack = await buildTrustedZip(verdict.artifactDir);
    await recordMediaDownload(db as never, { jobId: verdict.jobId, actorName: "token" });
    await db.activityLog.create({
      data: {
        type: "EXPORT_DOWNLOADED",
        message: `Medya arşivi indirildi: ${verdict.jobId} (${pack.included} dosya, ${pack.excluded.length} elenen)`,
        tenantId: verdict.tenantId,
        editionId: verdict.editionId,
        entityType: "MediaExportJob",
        entityId: verdict.jobId,
        actorName: "token",
      },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(pack.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="medya-isi-${verdict.jobId.slice(0, 8)}-${stamp}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof MediaJobError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/media/export-jobs/[id]/file", e);
    return NextResponse.json({ error: "Arşiv kurulamadı" }, { status: 500 });
  }
}
