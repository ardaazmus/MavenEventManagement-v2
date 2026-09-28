// P16.2: POST/DELETE /api/people/attach — "bu etkinliğe ekle/çıkar".
// Yalnız participation ilişkisi yazılır/silinir; master kişi kaydı ASLA
// kopyalanmaz ya da silinmez.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext, verifyEditionTenant } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { attachToEdition, detachFromEdition, PeopleScopeError } from "@/lib/people/directory";

async function guard(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "people-attach", limit: 60, windowMs: 60_000 });
  if (limited) return { limited } as const;
  const staffGate = await requireStaff();
  if (staffGate) return { limited: staffGate } as const;
  return { limited: null } as const;
}

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if (g.limited) return g.limited;
  let body: { editionId?: unknown; personId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  if (typeof body.editionId !== "string" || !body.editionId || typeof body.personId !== "string" || !body.personId) {
    return NextResponse.json({ error: "editionId ve personId zorunludur" }, { status: 422 });
  }
  try {
    const tenantId = await resolveContext(null);
    await verifyEditionTenant(body.editionId);
    const { participation, created } = await attachToEdition(db as never, { tenantId, editionId: body.editionId, personId: body.personId });
    return NextResponse.json({ participation, created }, { status: created ? 201 : 200 });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof PeopleScopeError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/people/attach", e);
    return NextResponse.json({ error: "Etkinliğe eklenemedi" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req);
  if (g.limited) return g.limited;
  const editionId = req.nextUrl.searchParams.get("editionId");
  const personId = req.nextUrl.searchParams.get("personId");
  if (!editionId || !personId) {
    return NextResponse.json({ error: "editionId ve personId zorunludur" }, { status: 422 });
  }
  try {
    const tenantId = await resolveContext(null);
    await verifyEditionTenant(editionId);
    const { detached } = await detachFromEdition(db as never, { tenantId, editionId, personId });
    return NextResponse.json({ detached });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof PeopleScopeError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("DELETE /api/people/attach", e);
    return NextResponse.json({ error: "Etkinlikten çıkarılamadı" }, { status: 500 });
  }
}
