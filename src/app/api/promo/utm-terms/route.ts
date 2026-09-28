// P19.4: GET/POST /api/promo/utm-terms — UTM sözlüğü.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { upsertUtmTerm, sanitizeUtmKind, UtmError } from "@/lib/promo/utm";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "promo-utm", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const tenantId = await resolveContext(null);
    const kind = sanitizeUtmKind(req.nextUrl.searchParams.get("kind"));
    const items = await db.utmTerm.findMany({
      where: { tenantId, ...(kind ? { kind } : {}) },
      orderBy: [{ kind: "asc" }, { value: "asc" }],
      take: 500,
    });
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/promo/utm-terms", e);
    return NextResponse.json({ error: "Sözlük okunamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "promo-utm", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  try {
    const tenantId = await resolveContext(null);
    const term = await upsertUtmTerm(db as never, {
      tenantId,
      kind: typeof body.kind === "string" ? body.kind : "",
      value: typeof body.value === "string" ? body.value : "",
      label: typeof body.label === "string" ? body.label : null,
    });
    return NextResponse.json(term, { status: 201 });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof UtmError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/promo/utm-terms", e);
    return NextResponse.json({ error: "Terim kaydedilemedi" }, { status: 500 });
  }
}
