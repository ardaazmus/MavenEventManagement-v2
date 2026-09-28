// P14.3b: Jetonlu dosya indirimi — GET /api/exports/[id]/file?token=...
// Oturumsuz jeton kapısı (HMAC + süre + hash eşleşmesi). Başarılı indirme
// kayda geçer (indirme defteri + KVKK denetimi); her çağrıda süresi dolan
// işler temizlenir (lazy retention). Yanıt no-store.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { purgeExpiredJobs, recordDownload, verifyDownloadToken } from "@/lib/exports/jobs";
import { buildRegistrationsXlsx } from "@/lib/exports/registrations-xlsx";
import { logExport } from "@/lib/privacy/export-guard";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const limited = enforceRateLimit(req, { key: "exports-file", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ error: "token zorunludur" }, { status: 400 });

  await purgeExpiredJobs(db as never).catch(() => null);
  const verified = await verifyDownloadToken(db as never, id, token);
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: 403 });

  try {
    const params = JSON.parse(verified.job.paramsJson) as { status?: string; q?: string; company?: string; official?: boolean };
    const out = await buildRegistrationsXlsx(db as never, {
      editionId: verified.job.editionId ?? "",
      status: params.status ?? "ALL",
      q: params.q ?? "",
      company: params.company ?? "",
      official: params.official === true,
      maxRows: 5000,
    });
    await recordDownload(db as never, { jobId: id, actorName: "token" });
    await logExport(db, {
      tenantId: verified.job.tenantId,
      editionId: verified.job.editionId,
      type: "REGISTRATIONS",
      count: out.count,
      actorName: "export-job",
    });
    return new NextResponse(new Uint8Array(out.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${out.filename}"`,
        "Cache-Control": "no-store",
        "X-Export-Count": String(out.count),
      },
    });
  } catch (e) {
    console.error("GET /api/exports/[id]/file", e);
    return NextResponse.json({ error: "Dosya üretilemedi" }, { status: 500 });
  }
}
