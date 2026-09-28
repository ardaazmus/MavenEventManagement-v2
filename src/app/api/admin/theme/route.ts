// P15.2/P15.3: GET/PATCH /api/admin/theme — kiracı varsayılan teması + marka rengi.
// Yönetici kapılı; marka rengi kontrast eşiğinden geçmeden kaydedilemez.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireAdmin } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  sanitizeThemeChoice,
  validateTenantThemePatch,
  ThemeValidationError,
} from "@/lib/theme/preferences";

export async function GET() {
  const adminGate = await requireAdmin();
  if (adminGate) return adminGate;
  try {
    const tenantId = await resolveContext(null);
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { themeDefault: true, brandPrimary: true } });
    return NextResponse.json({
      themeDefault: sanitizeThemeChoice(tenant?.themeDefault) ?? "system",
      brandPrimary: tenant?.brandPrimary ?? null,
    });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/admin/theme", e);
    return NextResponse.json({ error: "Tema okunamadı" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "admin-theme", limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const adminGate = await requireAdmin();
  if (adminGate) return adminGate;
  let body: { themeDefault?: unknown; brandPrimary?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  try {
    const valid = validateTenantThemePatch(body);
    const tenantId = await resolveContext(null);
    const updated = await db.tenant.update({
      where: { id: tenantId },
      data: { themeDefault: valid.themeDefault, brandPrimary: valid.brandPrimary },
      select: { themeDefault: true, brandPrimary: true },
    });
    return NextResponse.json({ ...updated, brandForeground: valid.brandForeground });
  } catch (e) {
    if (e instanceof ThemeValidationError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/admin/theme", e);
    return NextResponse.json({ error: "Tema kaydedilemedi" }, { status: 500 });
  }
}
