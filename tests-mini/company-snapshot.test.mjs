import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompanySnapshot,
  snapshotFilename,
  SNAPSHOT_FORMAT_VERSION,
  SNAPSHOT_MAX_EDITIONS,
} from "../src/lib/exports/company-snapshot.ts";

// H-10: şirket snapshot sözleşmesi — güvenli alanlar + tavanlar + sırsızlık.

function mockPrisma(over = {}) {
  const tenant = {
    id: "t1",
    slug: "Acme-2026",
    name: "Acme",
    plan: "PRO",
    status: "ACTIVE",
    country: "TR",
    timezone: "Europe/Istanbul",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const editions = [
    { id: "ed1", slug: "fuar-26", name: "Fuar 26", startsAt: new Date("2026-05-01T00:00:00Z"), endsAt: null, status: "ACTIVE", isPublished: true, seriesId: null },
  ];
  return {
    tenant: { findUnique: async () => tenant },
    eventSeries: {
      findMany: async () => [{ id: "s1", slug: "fuar", name: "Fuar Serisi" }],
      count: async () => 1,
    },
    eventEdition: {
      findMany: async () => editions,
      count: async () => 1,
    },
    roleDefinition: {
      findMany: async () => [{ key: "ORG_ADMIN", name: "Admin", isSystem: true }],
    },
    user: { count: async () => 6 },
    person: { count: async () => 10 },
    organization: { count: async () => 3 },
    customerContact: { count: async () => 4 },
    registration: { count: async () => 100 },
    order: { count: async () => 50 },
    sponsorAgreement: { count: async () => 7 },
    campaign: { count: async () => 2 },
    mediaAsset: { count: async () => 9 },
    task: { count: async () => 5 },
    ...over,
  };
}

test("H-10 - snapshot şekli + sürüm + ISO tarihler", async () => {
  const snap = await buildCompanySnapshot(mockPrisma(), "t1");
  assert.strictEqual(snap.meta.formatVersion, SNAPSHOT_FORMAT_VERSION);
  assert.strictEqual(snap.meta.tenantSlug, "Acme-2026");
  assert.ok(!Number.isNaN(Date.parse(snap.meta.generatedAt)), "generatedAt ISO olmalı");
  assert.strictEqual(snap.editions[0].startsAt, "2026-05-01T00:00:00.000Z");
  assert.strictEqual(snap.editions[0].endsAt, null);
  assert.deepStrictEqual(snap.counts.users, 6);
  assert.deepStrictEqual(snap.counts.registrations, 100);
  assert.strictEqual(snap.seriesTotal, 1);
  assert.strictEqual(snap.editionsTotal, 1);
});

test("H-10 - sır içermez (parola/MFA/token/anahtar yok)", async () => {
  const snap = await buildCompanySnapshot(mockPrisma(), "t1");
  const blob = JSON.stringify(snap).toLowerCase();
  for (const secret of ["passwordhash", "mfasecret", "recoverycodes", "token", "secret", "apikey", "private"]) {
    assert.ok(!blob.includes(secret), `snapshot '${secret}' içermemeli`);
  }
});

test("H-10 - kiracı yoksa TENANT_NOT_FOUND", async () => {
  const prisma = mockPrisma({ tenant: { findUnique: async () => null } });
  await assert.rejects(() => buildCompanySnapshot(prisma, "ghost"), /TENANT_NOT_FOUND/);
});

test("H-10 - dosya adı güvenli + tarihli", () => {
  assert.strictEqual(snapshotFilename("Acme-2026", new Date("2026-09-28T12:00:00Z")), "company-snapshot-acme-2026-2026-09-28.json");
  assert.strictEqual(snapshotFilename("../../etc", new Date("2026-01-02T00:00:00Z")), "company-snapshot-etc-2026-01-02.json");
  assert.ok(SNAPSHOT_MAX_EDITIONS > 0, "tavan tanımlı olmalı");
});
