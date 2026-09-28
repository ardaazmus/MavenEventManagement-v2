import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const libPath = path.resolve("src/lib/privacy/export-guard.ts");

const EXPORT_ROUTES = [
  "src/app/api/registrations/export/route.ts",
  "src/app/api/reservations/export/route.ts",
  "src/app/api/customer-contacts/export/route.ts",
  "src/app/api/form-submissions/export/route.ts",
  "src/app/api/accounting/export/route.ts",
  "src/app/api/media/export/route.ts",
];

test("P14.2 - rıza filtresi: consentVersion yoksa kişi export dışında (DB)", async () => {
  const { personConsentWhere } = await import(pathToFileURL(libPath).href);
  const clause = personConsentWhere();
  assert.deepStrictEqual(clause, { consentVersion: { not: null } });

  const iso = await createIsolatedTestDb("p14-2");
  try {
    const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p142-${Date.now()}` } });
    const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-p142-${Date.now()}` } });
    const mkPerson = (consent) =>
      iso.prisma.person.create({
        data: {
          tenantId: tenant.id,
          firstName: "P",
          lastName: "X",
          ...(consent ? { consentVersion: "v3", consentAcceptedAt: new Date() } : {}),
        },
      });
    const consented = await mkPerson(true);
    const silent = await mkPerson(false);
    for (const person of [consented, silent]) {
      const part = await iso.prisma.eventParticipation.create({ data: { editionId: edition.id, personId: person.id } });
      await iso.prisma.registration.create({ data: { editionId: edition.id, participationId: part.id, status: "CONFIRMED" } });
    }

    // Export sorgu şekli: kişi rıza filtresiyle birleşir
    const regs = await iso.prisma.registration.findMany({
      where: { editionId: edition.id, participation: { is: { person: { is: personConsentWhere() } } } },
      include: { participation: { include: { person: true } } },
    });
    assert.strictEqual(regs.length, 1, "rızasız kişi export dışında kalmalı");
    assert.strictEqual(regs[0].participation.person.id, consented.id);
  } finally {
    await iso.cleanup();
  }
});

test("P14.2 - her export KVKK denetim kaydı yazar (DB + kablo)", async () => {
  const { logExport } = await import(pathToFileURL(libPath).href);
  const iso = await createIsolatedTestDb("p14-2-audit");
  try {
    const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `ta-p142-${Date.now()}` } });
    await logExport(iso.prisma, {
      tenantId: tenant.id,
      editionId: null,
      type: "REGISTRATIONS",
      count: 42,
      actorName: "Test Staff",
    });
    const logs = await iso.prisma.activityLog.findMany({ where: { tenantId: tenant.id } });
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].type, "EXPORT_DOWNLOADED");
    assert.match(logs[0].message, /REGISTRATIONS/);
    assert.match(logs[0].message, /42/);
  } finally {
    await iso.cleanup();
  }

  for (const route of EXPORT_ROUTES) {
    const src = fs.readFileSync(path.resolve(route), "utf8");
    assert.ok(src.includes("logExport"), `${route} logExport kullanmalı`);
  }
});

test("P14.2 - kişi bağlantılı exportlar rıza filtresi uygular; form-export kadro kapılı", async () => {
  const regSrc = fs.readFileSync(path.resolve("src/app/api/registrations/export/route.ts"), "utf8");
  assert.ok(
    regSrc.includes("personConsentWhere") || regSrc.includes("buildRegistrationsXlsx"),
    "src/app/api/registrations/export/route.ts rıza filtresi uygulamalı (doğrudan ya da paylaşılan üreticiyle — P14.3b kilitler)",
  );
  const resSrc = fs.readFileSync(path.resolve("src/app/api/reservations/export/route.ts"), "utf8");
  assert.ok(resSrc.includes("personConsentWhere"), "src/app/api/reservations/export/route.ts rıza filtresi uygulamalı");
  const formSrc = fs.readFileSync(path.resolve("src/app/api/form-submissions/export/route.ts"), "utf8");
  assert.ok(formSrc.includes("requireStaff"), "form-submissions/export kadro kapısı olmalı (PII)");
});

test("P14.2 - ActivityType ihracat anahtarları tanımlı", async () => {
  const src = fs.readFileSync(path.resolve("src/lib/api/activity.ts"), "utf8");
  for (const key of ["EXPORT_REQUESTED", "EXPORT_READY", "EXPORT_APPROVED", "EXPORT_REJECTED", "EXPORT_DOWNLOADED"]) {
    assert.ok(src.includes(key), `ActivityType.${key} tanımlı olmalı`);
  }
});
