// P14.4: POST /api/media/export-jobs/[id]/token — imzalı indirme jetonu verir.
// Kadro kapılı + kiracı kapsamlı; ham jeton yalnız bu yanıtta bir kez döner.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { issueMediaDownloadToken } from "@/lib/media/downloads";
import { MediaJobError } from "@/lib/media/job-queue";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(req, { key: "media-export-token", limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const tenantId = await resolveContext(null);
    const { id } = await ctx.params;
    const { token, expiresAt } = await issueMediaDownloadToken(db as never, { jobId: id, tenantId });
    return NextResponse.json({ token, expiresAt: expiresAt.toISOString() });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof MediaJobError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/media/export-jobs/[id]/token", e);
    return NextResponse.json({ error: "Jeton verilemedi" }, { status: 500 });
  }
}
