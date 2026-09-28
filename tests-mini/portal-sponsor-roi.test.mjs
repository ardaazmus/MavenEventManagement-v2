import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const roiLib = path.resolve("src/lib/portal/sponsor-roi.ts");

test("P20.4 - ROI ozeti: harcama + huni + teslim + hak + personel", async () => {
  const { getSponsorRoi } = await import(pathToFileURL(roiLib).href);
  const iso = await createIsolatedTestDb("p20-roi");
  try {
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-roi-${tag}` } });
    const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-roi-${tag}` } });
    const org = await iso.prisma.organization.create({ data: { tenantId: tenant.id, name: "Acme" } });
    const other = await iso.prisma.organization.create({ data: { tenantId: tenant.id, name: "Rakip" } });
    const agreement = await iso.prisma.sponsorAgreement.create({
      data: { editionId: edition.id, organizationId: org.id, status: "ACTIVE", amount: 500000 },
    });
    const now = Date.now();

    await iso.prisma.deliverable.createMany({
      data: [
        { agreementId: agreement.id, name: "Logo", type: "LOGO", status: "APPROVED" },
        { agreementId: agreement.id, name: "Banner", type: "BANNER", status: "WAITING_SPONSOR", dueDate: new Date(now - 86_400_000) },
        { agreementId: agreement.id, name: "Video", type: "VIDEO", status: "SUBMITTED", dueDate: new Date(now + 86_400_000) },
      ],
    });

    const p1 = await iso.prisma.person.create({ data: { tenantId: tenant.id, firstName: "A", lastName: "B", consentVersion: "v3" } });
    const p2 = await iso.prisma.person.create({ data: { tenantId: tenant.id, firstName: "C", lastName: "D" } });
    await iso.prisma.leadCapture.createMany({
      data: [
        { editionId: edition.id, agreementId: agreement.id, personId: p1.id, channel: "BADGE_SCAN", rating: "HOT" },
        { editionId: edition.id, agreementId: agreement.id, personId: p2.id, channel: "MANUAL", rating: "COLD" },
      ],
    });

    await iso.prisma.meetingRequest.createMany({
      data: [
        { editionId: edition.id, agreementId: agreement.id, requesterPersonId: p1.id, slotStart: new Date(now + 3_600_000), slotEnd: new Date(now + 5_400_000), status: "CONFIRMED" },
        { editionId: edition.id, agreementId: agreement.id, requesterPersonId: p2.id, slotStart: new Date(now + 7_200_000), slotEnd: new Date(now + 9_000_000), status: "REQUESTED" },
      ],
    });

    const order = await iso.prisma.order.create({
      data: { editionId: edition.id, buyerOrganizationId: org.id, totalAmount: 100000, status: "PARTIALLY_PAID" },
    });
    await iso.prisma.payment.createMany({
      data: [
        { orderId: order.id, amount: 60000, status: "SUCCEEDED" },
        { orderId: order.id, amount: 40000, status: "PENDING" },
      ],
    });

    await iso.prisma.entitlement.create({
      data: { editionId: edition.id, ownerOrganizationId: org.id, label: "Bilet", quantityGranted: 10, quantityConsumed: 4, quantityReserved: 1 },
    });

    const staff = await iso.prisma.person.create({ data: { tenantId: tenant.id, firstName: "S", lastName: "T", company: "Acme" } });
    const par = await iso.prisma.eventParticipation.create({ data: { editionId: edition.id, personId: staff.id, source: "SPONSOR_PORTAL" } });
    await iso.prisma.eventRoleAssignment.create({ data: { participationId: par.id, role: "EXHIBITOR_STAFF", status: "INVITED" } });

    // yabanci kurum verisi karismamali
    const otherAgreement = await iso.prisma.sponsorAgreement.create({
      data: { editionId: edition.id, organizationId: other.id, status: "ACTIVE", amount: 999 },
    });
    await iso.prisma.leadCapture.create({
      data: { editionId: edition.id, agreementId: otherAgreement.id, personId: p1.id, channel: "MANUAL" },
    });

    const roi = await getSponsorRoi(iso.prisma, { editionId: edition.id, organizationId: org.id, orgName: org.name }, now);

    assert.strictEqual(roi.agreements.length, 1);
    const a = roi.agreements[0];
    assert.strictEqual(a.agreementId, agreement.id);
    assert.deepStrictEqual(a.leads, { total: 2, consented: 1, qualified: 1, scans: 1, byChannel: { BADGE_SCAN: 1, MANUAL: 1 }, byRating: { HOT: 1, COLD: 1 } });
    assert.deepStrictEqual(a.engagement, { profileViews: 0, favorites: 0 });
    assert.strictEqual(a.meetings.total, 2);
    assert.strictEqual(a.meetings.confirmed, 1);
    assert.strictEqual(a.meetings.confirmedHours, 0.5);
    assert.deepStrictEqual(a.deliverables, {
      total: 3, approved: 1, overdue: 1,
      byStatus: { APPROVED: 1, WAITING_SPONSOR: 1, SUBMITTED: 1 },
    });
    assert.deepStrictEqual(a.booths, { count: 0, totalSqm: 0 });

    assert.deepStrictEqual(roi.totals, {
      agreementAmount: 500000,
      orderTotal: 100000,
      paidTotal: 60000,
      leads: 2,
      qualifiedLeads: 1,
      meetingsConfirmed: 1,
      profileViews: 0,
      favorites: 0,
      entitlements: { granted: 10, consumed: 4, reserved: 1 },
      staff: { total: 1, active: 0, invited: 1 },
    });
    assert.ok(typeof roi.computedAt === "string" && roi.computedAt.length > 0);

    // anlasma daraltma: baska anlasma bos doner
    const scoped = await getSponsorRoi(iso.prisma, { editionId: edition.id, organizationId: org.id, orgName: org.name, agreementId: "yok" }, now);
    assert.strictEqual(scoped.agreements.length, 0);
    assert.strictEqual(scoped.totals.leads, 0);
  } finally {
    await iso.cleanup();
  }
});
