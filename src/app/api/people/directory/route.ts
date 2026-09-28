// P16.1: GET /api/people/directory — şirket rehberi (kiracı master kayıtları).
// Kadro kapılı + kiracı kapsamlı + oran sınırlı; MERGED kayıtlar varsayılan gizli.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { listDirectory, PeopleScopeError } from "@/lib/people/directory";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "people-directory", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const tenantId = await resolveContext(null);
    const sp = req.nextUrl.searchParams;
    const page = await listDirectory(db as never, {
      tenantId,
      q: sp.get("q") ?? undefined,
      includeMerged: sp.get("includeMerged") === "1",
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      cursor: sp.get("cursor"),
    });
    return NextResponse.json({ items: page.items, nextCursor: page.nextCursor });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof PeopleScopeError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/people/directory", e);
    return NextResponse.json({ error: "Rehber okunamadı" }, { status: 500 });
  }
}
