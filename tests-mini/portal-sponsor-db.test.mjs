import test from "node:test";
import assert from "node:assert/strict";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

async function setup() {
  const iso = await createIsolatedTestDb("p20");
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p20-${tag}` } });
  const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-p20-${tag}` } });
  const org = await iso.prisma.organization.create({ data: { tenantId: tenant.id, name: "Acme" } });
  const agreement = await iso.prisma.sponsorAgreement.create({
    data: { editionId: edition.id, organizationId: org.id, status: "ACTIVE" },
  });
  const agreement2 = await iso.prisma.sponsorAgreement.create({
    data: { editionId: edition.id, organizationId: org.id, status: "ACTIVE" },
  });
  return { iso, tenant, edition, org, agreement, agreement2 };
}

test("P20.1 - PortalToken anlasma kapsami DB'de yasar + iptalde SetNull", async () => {
  const { iso, edition, org, agreement } = await setup();
  try {
    const scoped = await iso.prisma.portalToken.create({
      data: {
        tokenHash: `h-scoped-${Date.now()}`,
        scope: "SPONSOR",
        editionId: edition.id,
        organizationId: org.id,
        agreementId: agreement.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    assert.strictEqual(scoped.agreementId, agreement.id);

    // ayni kurumun kapsamli/kapsamsiz jetonlari birlikte yasar
    const wide = await iso.prisma.portalToken.create({
      data: {
        tokenHash: `h-wide-${Date.now()}`,
        scope: "SPONSOR",
        editionId: edition.id,
        organizationId: org.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    assert.strictEqual(wide.agreementId, null);

    // anlasma silinince jeton kurum-geneline duser (SetNull), kaybolmaz
    await iso.prisma.sponsorAgreement.delete({ where: { id: agreement.id } });
    const after = await iso.prisma.portalToken.findUnique({ where: { id: scoped.id } });
    assert.ok(after);
    assert.strictEqual(after.agreementId, null);
  } finally {
    await iso.cleanup();
  }
});

test("P20.2 - lead tekliligi: anlasma+kiSi tektir, farkli anlasma serbest", async () => {
  const { iso, edition, agreement, agreement2, tenant } = await setup();
  try {
    const person = await iso.prisma.person.create({
      data: { tenantId: tenant.id, firstName: "Lead", lastName: "Kisi", consentVersion: "v3" },
    });
    const lead = await iso.prisma.leadCapture.create({
      data: { editionId: edition.id, agreementId: agreement.id, personId: person.id, channel: "BADGE_SCAN", rating: "WARM" },
    });
    assert.strictEqual(lead.channel, "BADGE_SCAN");

    // ayni anlasma+kiSi ikinci kez yasak (upsert disi yazim 409'a duser)
    await assert.rejects(() =>
      iso.prisma.leadCapture.create({
        data: { editionId: edition.id, agreementId: agreement.id, personId: person.id, channel: "MANUAL" },
      }),
    );

    // farkli anlasma ayni kisi serbest
    const other = await iso.prisma.leadCapture.create({
      data: { editionId: edition.id, agreementId: agreement2.id, personId: person.id, channel: "MANUAL" },
    });
    assert.ok(other.id);

    // upsert anlami: tekrar tarama gunceller, cogaltmaz
    const touched = await iso.prisma.leadCapture.upsert({
      where: { agreementId_personId: { agreementId: agreement.id, personId: person.id } },
      update: { rating: "HOT", note: "tekrar ugradi" },
      create: { editionId: edition.id, agreementId: agreement.id, personId: person.id, channel: "BADGE_SCAN" },
    });
    assert.strictEqual(touched.id, lead.id);
    assert.strictEqual(touched.rating, "HOT");
    const count = await iso.prisma.leadCapture.count({ where: { agreementId: agreement.id } });
    assert.strictEqual(count, 1);
  } finally {
    await iso.cleanup();
  }
});

test("P20.3 - gorusme talebi yasar + anlasma silinince kaskad", async () => {
  const { iso, edition, agreement, tenant } = await setup();
  try {
    const person = await iso.prisma.person.create({
      data: { tenantId: tenant.id, firstName: "Gorusen", lastName: "Kisi" },
    });
    const now = Date.now();
    const m = await iso.prisma.meetingRequest.create({
      data: {
        editionId: edition.id,
        agreementId: agreement.id,
        requesterPersonId: person.id,
        title: "Demo",
        slotStart: new Date(now + 3_600_000),
        slotEnd: new Date(now + 5_400_000),
        location: "Stand A-12",
      },
    });
    assert.strictEqual(m.status, "REQUESTED");
    await iso.prisma.meetingRequest.update({ where: { id: m.id }, data: { status: "CONFIRMED", decidedAt: new Date(), decidedBy: "Sponsor Portali" } });

    await iso.prisma.sponsorAgreement.delete({ where: { id: agreement.id } });
    const gone = await iso.prisma.meetingRequest.findUnique({ where: { id: m.id } });
    assert.strictEqual(gone, null);
  } finally {
    await iso.cleanup();
  }
});
