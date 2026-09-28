// P19.1: GET/POST /api/promo/assets — kurumsal varlık kütüphanesi.
// Kadro kapılı + kiracı kapsamlı; dosya hash'li + sürümlü + lisanslı.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createBrandAsset, BrandAssetError, sanitizeAssetKind } from "@/lib/promo/brand-assets";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "promo-assets", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const tenantId = await resolveContext(null);
    const kind = req.nextUrl.searchParams.get("kind");
    const items = await db.brandAsset.findMany({
      where: { tenantId, ...(kind ? { kind: sanitizeAssetKind(kind) } : {}) },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      take: 200,
    });
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/promo/assets", e);
    return NextResponse.json({ error: "Kütüphane okunamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "promo-assets", limit: 30, windowMs: 60_000 });
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
    const created = await createBrandAsset(db as never, {
      tenantId,
      name: typeof body.name === "string" ? body.name : "",
      kind: typeof body.kind === "string" ? body.kind : undefined,
      mimeType: typeof body.mimeType === "string" ? body.mimeType : null,
      dataUrl: typeof body.dataUrl === "string" ? body.dataUrl : null,
      externalUrl: typeof body.externalUrl === "string" ? body.externalUrl : null,
      license: typeof body.license === "string" ? body.license : null,
      usageNotes: typeof body.usageNotes === "string" ? body.usageNotes : null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof BrandAssetError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/promo/assets", e);
    return NextResponse.json({ error: "Varlık oluşturulamadı" }, { status: 500 });
  }
}
