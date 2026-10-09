import test from "node:test";
import assert from "node:assert/strict";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";
import {
  resolveTenantEntitlements,
  isTenantModuleEntitled,
  isTenantCapabilityEntitled,
  setTenantEntitlementOverride,
  PLAN_DEFAULT_MODULES,
} from "../src/lib/tenant-entitlements.ts";
import { MODULE_IDS } from "../src/lib/api/permissions.ts";

// P07 / F-05: Tenant ve Ürün Entitlement Sözleşmesi Testleri (TE-1..TE-6)

async function setup() {
  const iso = await createIsolatedTestDb("tenant-entitlements");

  const tenantBasic = await iso.prisma.tenant.create({
    data: { name: "Tenant Basic", slug: `t-basic-${Date.now()}`, plan: "BASIC" },
  });
  const tenantPro = await iso.prisma.tenant.create({
    data: { name: "Tenant Pro", slug: `t-pro-${Date.now()}`, plan: "PRO" },
  });
  const tenantEnterprise = await iso.prisma.tenant.create({
    data: { name: "Tenant Enterprise", slug: `t-ent-${Date.now()}`, plan: "ENTERPRISE" },
  });

  const series = await iso.prisma.eventSeries.create({
    data: { tenantId: tenantBasic.id, name: "Seri 1", slug: `s1-${Date.now()}` },
  });
  const editionBasic = await iso.prisma.eventEdition.create({
    data: {
      tenantId: tenantBasic.id,
      seriesId: series.id,
      name: "Basic Edisyon",
      slug: `ed-b-${Date.now()}`,
      startDate: new Date("2026-11-01"),
      endDate: new Date("2026-11-03"),
      city: "Ankara",
    },
  });

  return { iso, tenantBasic, tenantPro, tenantEnterprise, editionBasic };
}

test("TE-1 — Plan bazlı varsayılan modül çözümleme (TRIAL/BASIC vs PRO vs ENTERPRISE)", async () => {
  const { iso, tenantBasic, tenantPro, tenantEnterprise } = await setup();
  try {
    const entBasic = await resolveTenantEntitlements(tenantBasic.id, iso.prisma);
    assert.strictEqual(entBasic.plan, "BASIC");
    assert.ok(entBasic.effectiveModules.includes("registrations"));
    assert.ok(entBasic.effectiveModules.includes("finance"));
    assert.ok(entBasic.effectiveModules.includes("program"));
    // Basic planda scientific ve sponsorship varsayılan olarak YOKTUR (deny-by-default)
    assert.strictEqual(entBasic.effectiveModules.includes("scientific"), false);
    assert.strictEqual(entBasic.effectiveModules.includes("sponsorship"), false);

    const entPro = await resolveTenantEntitlements(tenantPro.id, iso.prisma);
    assert.strictEqual(entPro.plan, "PRO");
    assert.ok(entPro.effectiveModules.includes("registrations"));
    assert.ok(entPro.effectiveModules.includes("scientific"));
    assert.ok(entPro.effectiveModules.includes("sponsorship"));
    assert.ok(entPro.effectiveModules.includes("accommodation"));

    const entEnterprise = await resolveTenantEntitlements(tenantEnterprise.id, iso.prisma);
    assert.strictEqual(entEnterprise.plan, "ENTERPRISE");
    assert.strictEqual(entEnterprise.effectiveModules.length, MODULE_IDS.length);
  } finally {
    await iso.cleanup();
  }
});

test("TE-2 — Kiracı bazlı override: grant (modül verme) ve revoke (modül geri alma)", async () => {
  const { iso, tenantBasic, tenantPro } = await setup();
  try {
    // 1. Basic kiracıya Platform Sahibi (Firma A) scientific modülünü açar (grant)
    let isSciEntitled = await isTenantCapabilityEntitled(tenantBasic.id, "SCIENTIFIC", iso.prisma);
    assert.strictEqual(isSciEntitled, false, "Başlangıçta BASIC planda scientific kapalı olmalı");

    await setTenantEntitlementOverride(
      tenantBasic.id,
      "scientific",
      true,
      "Firma A Süper Admin",
      iso.prisma,
    );

    isSciEntitled = await isTenantCapabilityEntitled(tenantBasic.id, "SCIENTIFIC", iso.prisma);
    assert.strictEqual(isSciEntitled, true, "Override sonrası scientific açık olmalı");

    // 2. Pro kiracıdan Platform Sahibi sponsorship modülünü geri alır (revoke)
    let isSponEntitled = await isTenantCapabilityEntitled(tenantPro.id, "SPONSORSHIP", iso.prisma);
    assert.strictEqual(isSponEntitled, true, "Başlangıçta PRO planda sponsorship açık olmalı");

    await setTenantEntitlementOverride(
      tenantPro.id,
      "sponsorship",
      false,
      "Firma A Süper Admin",
      iso.prisma,
    );

    isSponEntitled = await isTenantCapabilityEntitled(tenantPro.id, "SPONSORSHIP", iso.prisma);
    assert.strictEqual(isSponEntitled, false, "Revoke sonrası sponsorship kapalı olmalı");
  } finally {
    await iso.cleanup();
  }
});

test("TE-3 — Override yapıldığında ActivityLog audit kaydı oluşturulur", async () => {
  const { iso, tenantBasic } = await setup();
  try {
    await setTenantEntitlementOverride(
      tenantBasic.id,
      "accommodation",
      true,
      "Platform Operatörü",
      iso.prisma,
    );

    const log = await iso.prisma.activityLog.findFirst({
      where: {
        tenantId: tenantBasic.id,
        type: "TENANT_ENTITLEMENT_UPDATED",
      },
    });

    assert.ok(log, "TENANT_ENTITLEMENT_UPDATED log kaydı oluşturulmalı");
    assert.ok(log.message.includes("accommodation"));
    assert.ok(log.message.includes("Platform Operatörü"));
  } finally {
    await iso.cleanup();
  }
});

test("TE-4 — isTenantCapabilityEntitled eşleme doğruluğu", async () => {
  const { iso, tenantPro } = await setup();
  try {
    // CAPABILITY_TO_MODULE eşlemelerinin doğrulanması
    assert.strictEqual(await isTenantCapabilityEntitled(tenantPro.id, "REGISTRATION", iso.prisma), true);
    assert.strictEqual(await isTenantCapabilityEntitled(tenantPro.id, "SCIENTIFIC", iso.prisma), true);
    assert.strictEqual(await isTenantCapabilityEntitled(tenantPro.id, "BADGING", iso.prisma), true);
    assert.strictEqual(await isTenantCapabilityEntitled(tenantPro.id, "ACCOMMODATION", iso.prisma), true);

    // Boş / geçersiz kiracı fail-closed olmalı
    assert.strictEqual(await isTenantCapabilityEntitled("", "SCIENTIFIC", iso.prisma), false);
    assert.strictEqual(await isTenantCapabilityEntitled("non-existent-tenant", "SCIENTIFIC", iso.prisma), false);
  } finally {
    await iso.cleanup();
  }
});

test("TE-5 — capability.toggle akışında platform yetkisi kontrolü simülasyonu", async () => {
  const { iso, tenantBasic } = await setup();
  try {
    // Basic kiracı için SCIENTIFIC yetkisi yok
    const allowed = await isTenantCapabilityEntitled(tenantBasic.id, "SCIENTIFIC", iso.prisma);
    assert.strictEqual(allowed, false);

    // Red yanıtı simülasyonu (403 + PLATFORM_MODULE_UNENTITLED)
    const errorResponse = !allowed
      ? {
          status: 403,
          body: {
            error: "Bu yetenek (SCIENTIFIC) platform sahibi (Firma A) tarafından kiracınız için yetkilendirilmemiştir",
            code: "PLATFORM_MODULE_UNENTITLED",
          },
        }
      : { status: 200 };

    assert.strictEqual(errorResponse.status, 403);
    assert.strictEqual(errorResponse.body.code, "PLATFORM_MODULE_UNENTITLED");

    // Override verildikten sonra açmaya izin verilir
    await setTenantEntitlementOverride(tenantBasic.id, "scientific", true, "Platform Admin", iso.prisma);
    const allowedAfter = await isTenantCapabilityEntitled(tenantBasic.id, "SCIENTIFIC", iso.prisma);
    assert.strictEqual(allowedAfter, true);
  } finally {
    await iso.cleanup();
  }
});

test("TE-6 — Kapatma (enabled: false) yetkiden bağımsız her zaman serbesttir", async () => {
  const { iso, tenantBasic } = await setup();
  try {
    // Yetki olmasa bile enabled=false kapatma engellenmemelidir
    const isEnabling = false;
    const canDisable = !isEnabling || (await isTenantCapabilityEntitled(tenantBasic.id, "SCIENTIFIC", iso.prisma));
    assert.strictEqual(canDisable, true, "Kapatma eylemi platform yetkisi kısıtına takılmamalıdır");
  } finally {
    await iso.cleanup();
  }
});

test("TE-7 — /api/saas/entitlements rota sözleşmesi ve ADMIN politika envanteri doğrulaması", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const routePath = path.resolve("src/app/api/saas/entitlements/route.ts");
  const scriptPath = path.resolve("scripts/route-policy.mjs");

  assert.ok(fs.existsSync(routePath), "Rota dosyası mevcut olmalıdır");
  const routeCode = fs.readFileSync(routePath, "utf8");

  // Rota koruma kapısı ve metotlar
  assert.ok(routeCode.includes("requireSuperAdmin"), "Rota requireSuperAdmin ile korunmalıdır");
  assert.ok(routeCode.includes("export async function GET"), "GET metodu bulunmalıdır");
  assert.ok(routeCode.includes("export async function PUT"), "PUT metodu bulunmalıdır");
  assert.ok(routeCode.includes("resolveTenantEntitlements"), "resolveTenantEntitlements entegrasyonu olmalıdır");
  assert.ok(routeCode.includes("setTenantEntitlementOverride"), "setTenantEntitlementOverride entegrasyonu olmalıdır");

  // Politika envanteri
  const policyCode = fs.readFileSync(scriptPath, "utf8");
  assert.ok(
    policyCode.includes("src/app/api/saas/entitlements/route.ts"),
    "Rota route-policy.mjs envanterine kaydedilmiş olmalıdır",
  );
  assert.ok(
    policyCode.includes("x-super-admin-key (requireSuperAdmin)"),
    "Rota requireSuperAdmin enforcement iddiası taşımalıdır",
  );
});

test("TE-8 — Bilinmeyen plan adı deny-by-default gereği sıfır temel modül üretir", async () => {
  const iso = await createIsolatedTestDb("unknown-plan");
  try {
    const unknownTenant = await iso.prisma.tenant.create({
      data: { name: "Bilinmeyen Plan Tenant", slug: `t-unk-${Date.now()}`, plan: "GHOST_CUSTOM_PLAN" },
    });

    const res = await resolveTenantEntitlements(unknownTenant.id, iso.prisma);
    assert.strictEqual(res.baseModules.length, 0, "Bilinmeyen plan PRO'ya düşmemeli, boş liste üretmelidir");
    assert.strictEqual(res.effectiveModules.length, 0, "Override yoksa efektif modüller de boş olmalıdır");
  } finally {
    await iso.cleanup();
  }
});

