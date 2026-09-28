// P16.2: GET /api/people/event?editionId=… — etkinlik kişileri (ilişkiyle bağlı).
// Kadro kapılı + edisyon kiracı doğrulamalı; yanıt kişi + katılım çiftleridir.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext, verifyEditionTenant } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { listEventPeople, PeopleScopeError } from "@/lib/people/directory";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "people-event", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  const editionId = req.nextUrl.searchParams.get("editionId");
  if (!editionId) return NextResponse.json({ error: "editionId zorunludur" }, { status: 422 });
  try {
    const tenantId = await resolveContext(null);
    await verifyEditionTenant(editionId);
    const sp = req.nextUrl.searchParams;
    const page = await listEventPeople(db as never, {
      tenantId,
      editionId,
      q: sp.get("q") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      cursor: sp.get("cursor"),
    });
    return NextResponse.json({ items: page.items, nextCursor: page.nextCursor });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof PeopleScopeError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/people/event", e);
    return NextResponse.json({ error: "Etkinlik kişileri okunamadı" }, { status: 500 });
  }
}
