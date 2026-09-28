import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const enforcementLib = path.resolve("src/lib/sponsorship/enforcement.ts");
const capacityLib = path.resolve("src/lib/sponsorship/capacity.ts");

test("P08/P10 - cift-karar gerekce sozlesmesi: kapasite gerekcesiz iptali redder", async () => {
  const { decideSponsorStatusChange } = await import(pathToFileURL(enforcementLib).href);
  const { transitionSponsorAgreement } = await import(pathToFileURL(capacityLib).href);
  const iso = await createIsolatedTestDb("p08-cancel");
  try {
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-cancel-${tag}` } });
    const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-cancel-${tag}` } });
    const org = await iso.prisma.organization.create({ data: { tenantId: tenant.id, name: "Acme" } });
    const agreement = await iso.prisma.sponsorAgreement.create({
      data: { editionId: edition.id, organizationId: org.id, status: "ACTIVE", signedAt: new Date() },
    });

    // birinci karar: gerekceli iptal gecer
    const decided = await decideSponsorStatusChange(iso.prisma, {
      actorMaxRank: 100,
      agreementId: agreement.id,
      data: { status: "CANCELLED", transitionReason: "test" },
    });
    assert.strictEqual(decided.ok, true);
    if (!decided.ok || !decided.audit) throw new Error("birinci karar gecmeli");
    assert.strictEqual(decided.audit.kind, "cancel");
    assert.ok(!("transitionReason" in decided.data), "decide gerekceyi soyar (Prisma'ya sizmaz)");

    // ikinci karar soyulmus veriyle CALISMAZ — rota gerekceyi tasimak zorunda
    const bare = await transitionSponsorAgreement(iso.prisma, {
      actorMaxRank: 100,
      agreementId: agreement.id,
      data: decided.data,
    });
    assert.strictEqual(bare.ok, false);
    if (bare.ok) throw new Error("gerekcesiz kapasite gecisi red edilmeli");

    // gerekce tasinirsa iptal uygulanir + denetim gerekceyi tasir
    const carried = await transitionSponsorAgreement(iso.prisma, {
      actorMaxRank: 100,
      agreementId: agreement.id,
      data: { ...decided.data, transitionReason: "test" },
    });
    assert.strictEqual(carried.ok, true);
    if (!carried.ok || !carried.audit) throw new Error("gerekceli kapasite gecisi gecmeli");
    assert.deepStrictEqual(carried.audit, { from: "ACTIVE", to: "CANCELLED", kind: "cancel", reason: "test" });
    const row = await iso.prisma.sponsorAgreement.findUnique({ where: { id: agreement.id } });
    assert.strictEqual(row.status, "CANCELLED");
  } finally {
    await iso.cleanup();
  }
});
