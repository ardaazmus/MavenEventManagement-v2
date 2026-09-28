// P19.2: GET/POST/DELETE /api/promo/refs — edisyon varlık referansları.
// Kadro kapılı + edisyon kiracı doğrulamalı; kopya yok, referans + override.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext, verifyEditionTenant } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { attachBrandRef, detachBrandRef, listEditionBrandAssets, BrandAssetError } from "@/lib/promo/brand-assets";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "promo-refs", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  const editionId = req.nextUrl.searchParams.get("editionId");
  if (!editionId) return NextResponse.json({ error: "editionId zorunludur" }, { status: 422 });
  try {
    const tenantId = await resolveContext(null);
    await verifyEditionTenant(editionId);
    const items = await listEditionBrandAssets(db as never, { tenantId, editionId });
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof BrandAssetError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/promo/refs", e);
    return NextResponse.json({ error: "Referanslar okunamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "promo-refs", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const editionId = typeof body.editionId === "string" ? body.editionId : "";
  const assetId = typeof body.assetId === "string" ? body.assetId : "";
  if (!editionId || !assetId) {
    return NextResponse.json({ error: "editionId ve assetId zorunludur" }, { status: 422 });
  }
  try {
    const tenantId = await resolveContext(null);
    await verifyEditionTenant(editionId);
    const str = (k: string): string | null => (typeof body[k] === "string" ? (body[k] as string) : null);
    const ref = await attachBrandRef(db as never, {
      tenantId,
      editionId,
      assetId,
      overrideName: str("overrideName"),
      overrideDataUrl: str("overrideDataUrl"),
      overrideExternalUrl: str("overrideExternalUrl"),
    });
    return NextResponse.json(ref, { status: 201 });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof BrandAssetError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/promo/refs", e);
    return NextResponse.json({ error: "Referans kurulamadı" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "promo-refs", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  const editionId = req.nextUrl.searchParams.get("editionId");
  const assetId = req.nextUrl.searchParams.get("assetId");
  if (!editionId || !assetId) {
    return NextResponse.json({ error: "editionId ve assetId zorunludur" }, { status: 422 });
  }
  try {
    const tenantId = await resolveContext(null);
    await verifyEditionTenant(editionId);
    const { detached } = await detachBrandRef(db as never, { tenantId, editionId, assetId });
    return NextResponse.json({ detached });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof BrandAssetError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("DELETE /api/promo/refs", e);
    return NextResponse.json({ error: "Referans kaldırılamadı" }, { status: 500 });
  }
}
