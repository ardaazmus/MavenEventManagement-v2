// P19.1: PATCH /api/promo/assets/[id] — varlık bakımı (sürüm artar).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { updateBrandAsset, BrandAssetError } from "@/lib/promo/brand-assets";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
    const { id } = await ctx.params;
    const str = (k: string): string | undefined => (typeof body[k] === "string" ? (body[k] as string) : undefined);
    // Kısmi güncelleme: verilmeyen alanlar tanımsız geçilir (null yazılmaz).
    const updated = await updateBrandAsset(db as never, {
      tenantId,
      assetId: id,
      ...(str("name") !== undefined ? { name: str("name") as string } : {}),
      ...(str("kind") !== undefined ? { kind: str("kind") as string } : {}),
      ...(body.mimeType !== undefined ? { mimeType: str("mimeType") ?? null } : {}),
      ...(body.dataUrl !== undefined ? { dataUrl: str("dataUrl") ?? null } : {}),
      ...(body.externalUrl !== undefined ? { externalUrl: str("externalUrl") ?? null } : {}),
      ...(body.clearFile === true ? { clearFile: true } : {}),
      ...(body.license !== undefined ? { license: str("license") ?? null } : {}),
      ...(body.usageNotes !== undefined ? { usageNotes: str("usageNotes") ?? null } : {}),
      ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof BrandAssetError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/promo/assets/[id]", e);
    return NextResponse.json({ error: "Varlık güncellenemedi" }, { status: 500 });
  }
}
