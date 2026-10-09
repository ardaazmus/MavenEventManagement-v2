// ─── P07: SaaS Platform Yetki ve Modül Yönetimi (GET/PUT) ───────────────────
// Kapı: x-super-admin-key başlığı (Firma A Platform Yöneticisi); bkz. src/lib/api/super-admin.ts
// CONTEXT.md (§22-24, §47) & F-05: Platform Sahibi (Firma A) → Tenant (Firma B)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/api/super-admin";
import {
  resolveTenantEntitlements,
  setTenantEntitlementOverride,
} from "@/lib/tenant-entitlements";
import { MODULE_IDS, type ModuleId } from "@/lib/api/permissions";

export async function GET(req: NextRequest) {
  const gate = requireSuperAdmin(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");

  if (!tenantId) {
    // Tüm kiracıların plan ve etkin modül özetleri
    const tenants = await db.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const list = await Promise.all(
      tenants.map(async (t) => {
        const ent = await resolveTenantEntitlements(t.id);
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          plan: ent.plan,
          status: t.status,
          effectiveModuleCount: ent.effectiveModules.length,
          overridesCount: Object.keys(ent.overrides).length,
        };
      }),
    );

    return NextResponse.json({
      surface: "PLATFORM_ENTITLEMENTS",
      generatedAt: new Date().toISOString(),
      tenants: list,
    });
  }

  const summary = await resolveTenantEntitlements(tenantId);
  return NextResponse.json({
    surface: "TENANT_ENTITLEMENT_DETAIL",
    generatedAt: new Date().toISOString(),
    ...summary,
  });
}

export async function PUT(req: NextRequest) {
  const gate = requireSuperAdmin(req);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON gövdesi" }, { status: 400 });
  }

  const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";
  const moduleKey = typeof body.module === "string" ? body.module.trim() : "";
  const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined;
  const grantedBy = typeof body.grantedBy === "string" ? body.grantedBy.trim() : "Platform Yöneticisi (Firma A)";

  if (!tenantId) {
    return NextResponse.json({ error: "tenantId zorunludur" }, { status: 400 });
  }

  if (!moduleKey || !MODULE_IDS.includes(moduleKey as ModuleId)) {
    return NextResponse.json(
      { error: `Geçersiz modül. İzin verilen modüller: ${MODULE_IDS.join(", ")}` },
      { status: 400 },
    );
  }

  if (enabled === undefined) {
    return NextResponse.json({ error: "enabled (boolean) zorunludur" }, { status: 400 });
  }

  try {
    const updated = await setTenantEntitlementOverride(
      tenantId,
      moduleKey as ModuleId,
      enabled,
      grantedBy,
    );
    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Entitlement güncellenemedi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
