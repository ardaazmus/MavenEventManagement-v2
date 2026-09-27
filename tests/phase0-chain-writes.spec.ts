// P0 (yeni-fazlar) — chain-yazım kapısı: İLK ÇOCUK yaratımı + cross-tenant red.
// Eski kusurlar (canlı kanıtlı): (1) write-guard çocuk tablosunda kardeş arıyordu →
// parent çocuksuzken ilk çocuk 404'le reddediliyordu; (2) chainTenant (OrganizationContact/
// IntegrationLog — tenantId kolonsuz) çocuk delegate'ini tenantId'li sanıyordu → POST hep 400.
// Düzeltme: parent VARLIK tablosu kendi ilişki zinciriyle doğrulanır (CHAIN_PARENT haritası).
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

let editionId = "";
let personId = "";
let tenantId = "";

test.beforeAll(async () => {
  const tenant = await db.tenant.findFirst({ select: { id: true } });
  tenantId = tenant!.id;
  const ed = await db.eventEdition.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  editionId = ed!.id;
  const person = await db.person.findFirst({ select: { id: true } });
  personId = person!.id;
});

// childless parent bul; yoksa minimal alanlarla YARAT (test determinizmi için).
// Parent yaratımı Prisma üzerinden — API yaratım sözleşmeleri bu turun konusu değil.
async function childlessParent(
  delegate: keyof typeof db & string,
  relation: string,
  create: () => Promise<{ id: string }>,
): Promise<{ id: string }> {
  const d = db[delegate] as unknown as {
    findFirst: (a: Record<string, unknown>) => Promise<{ id: string } | null>;
  };
  const found = await d.findFirst({ where: { [relation]: { none: {} } }, select: { id: true } });
  if (found) return found;
  // create() geri çağrısı kendi Prisma create'ini çalıştırıp satırı döndürür
  return create();
}

test.describe.serial("P0.1 — chain-yazım: İLK ÇOCUK yaratımı (parent çocuksuzken)", () => {
  test("form-fields — boş formda ilk alan 201 (eski: 404)", async ({ request }) => {
    const form = await request.post("/api/forms", {
      data: { editionId, name: "P0-İlk-Çocuk-Form", status: "DRAFT" },
    });
    expect(form.status()).toBe(201);
    const fid = ((await form.json()) as { id: string }).id;
    const res = await request.post("/api/form-fields", {
      data: { formId: fid, label: "İlk alan", type: "TEXT", order: 0 },
    });
    expect(res.status()).toBe(201);
    expect(((await res.json()) as { formId: string }).formId).toBe(fid);
  });

  test("form-fields — sahte formId 404 (cross-tenant sızma YOK)", async ({ request }) => {
    const res = await request.post("/api/form-fields", {
      data: { formId: "bogus-form-xyz", label: "X", type: "TEXT", order: 0 },
    });
    expect(res.status()).toBe(404);
  });

  test("decisions — çocuksuz submission'da ilk karar 201", async ({ request }) => {
    const sub = await childlessParent("submission", "decisions", () =>
      db.submission.create({ data: { editionId, title: "P0 sunum" }, select: { id: true } }),
    );
    const res = await request.post("/api/decisions", {
      data: { submissionId: sub.id, decision: "ACCEPT" },
    });
    expect(res.status()).toBe(201);
  });

  test("decisions — sahte submissionId 404", async ({ request }) => {
    const res = await request.post("/api/decisions", {
      data: { submissionId: "bogus-sub-xyz", decision: "ACCEPT" },
    });
    expect(res.status()).toBe(404);
  });

  test("role-assignments — çocuksuz katılımda ilk rol 201", async ({ request }) => {
    const part = await childlessParent("eventParticipation", "roleAssignments", () =>
      db.eventParticipation.create({ data: { editionId, personId }, select: { id: true } }),
    );
    const res = await request.post("/api/role-assignments", {
      data: { participationId: part.id, role: "SPEAKER" },
    });
    expect(res.status()).toBe(201);
  });

  test("role-assignments — sahte participationId 404", async ({ request }) => {
    const res = await request.post("/api/role-assignments", {
      data: { participationId: "bogus-part-xyz", role: "SPEAKER" },
    });
    expect(res.status()).toBe(404);
  });

  test("companions — çocuksuz katılımda ilk refakatçi 201", async ({ request }) => {
    const part = await childlessParent("eventParticipation", "companions", () =>
      db.eventParticipation.create({ data: { editionId, personId }, select: { id: true } }),
    );
    const res = await request.post("/api/companions", {
      data: { participationId: part.id, name: "P0 Refakatçi" },
    });
    expect(res.status()).toBe(201);
  });

  test("occupancy-slots — çocuksuz rezervasyonda ilk slot 201", async ({ request }) => {
    const now = Date.now();
    const resv = await childlessParent("reservation", "occupancySlots", () =>
      db.reservation.create({
        data: {
          editionId,
          guestName: "P0 misafir",
          checkIn: new Date(now + 86400000),
          checkOut: new Date(now + 2 * 86400000),
        },
        select: { id: true },
      }),
    );
    const res = await request.post("/api/occupancy-slots", {
      data: { reservationId: resv.id, guestName: "P0 slot" },
    });
    expect(res.status()).toBe(201);
  });

  test("program-assignments — çocuksuz oturumda ilk atama 201", async ({ request }) => {
    const now = Date.now();
    const sess = await childlessParent("programSession", "assignments", () =>
      db.programSession.create({
        data: {
          editionId,
          title: "P0 oturum",
          startTime: new Date(now + 3600000),
          endTime: new Date(now + 7200000),
        },
        select: { id: true },
      }),
    );
    const res = await request.post("/api/program-assignments", {
      data: { sessionId: sess.id, role: "SPEAKER" },
    });
    expect(res.status()).toBe(201);
  });

  test("social-announcements — çocuksuz planda ilk duyuru 201", async ({ request }) => {
    const plan = await childlessParent("socialPlan", "announcements", () =>
      db.socialPlan.create({ data: { editionId, title: "P0 sosyal plan" }, select: { id: true } }),
    );
    const res = await request.post("/api/social-announcements", {
      data: { planId: plan.id, fullName: "P0 duyuru sahibi", channel: "IN_APP", message: "merhaba" },
    });
    expect(res.status()).toBe(201);
  });

  test("b2b-assignments — çocuksuz planda ilk atama 201", async ({ request }) => {
    const plan = await childlessParent("b2bPlan", "assignments", () =>
      db.b2bPlan.create({ data: { editionId, subject: "P0 b2b" }, select: { id: true } }),
    );
    const res = await request.post("/api/b2b-assignments", {
      data: { planId: plan.id, personId },
    });
    expect(res.status()).toBe(201);
  });
});

test.describe.serial("P0.2 — chainTenant: tenantId-kolonsuz çocuklar", () => {
  test("organization-contacts — meşru organizasyonda ilk kişi 201 (eski: 400)", async ({ request }) => {
    const org = await request.post("/api/organizations", {
      data: { name: "P0-Organizasyon", tenantId },
    });
    expect(org.status()).toBe(201);
    const oid = ((await org.json()) as { id: string }).id;
    const res = await request.post("/api/organization-contacts", {
      data: { organizationId: oid, name: "P0 ilgili kişi", email: "p0@org.test" },
    });
    expect(res.status()).toBe(201);
  });

  test("organization-contacts — sahte organizationId 404", async ({ request }) => {
    const res = await request.post("/api/organization-contacts", {
      data: { organizationId: "bogus-org-xyz", name: "X", email: "x@x.test" },
    });
    expect(res.status()).toBe(404);
  });

  test("integration-logs — meşru entegrasyonda ilk log 201", async ({ request }) => {
    const integ = await childlessParent("apiIntegration", "logs", () =>
      db.apiIntegration.create({ data: { tenantId, name: "P0 entegrasyon" }, select: { id: true } }),
    );
    const res = await request.post("/api/integration-logs", {
      data: { integrationId: integ.id, direction: "OUTBOUND", ok: true },
    });
    expect(res.status()).toBe(201);
  });

  test("integration-logs — sahte integrationId 404", async ({ request }) => {
    const res = await request.post("/api/integration-logs", {
      data: { integrationId: "bogus-integ-xyz", direction: "OUTBOUND" },
    });
    expect(res.status()).toBe(404);
  });

  test("liste — organization-contacts yalnız bağlam kiracısının organizasyonlarını döner", async ({ request }) => {
    const res = await request.get("/api/organization-contacts");
    expect(res.status()).toBe(200);
    const rows = (await res.json()) as { organizationId?: string }[];
    const list = Array.isArray(rows) ? rows : ((rows as unknown as { items: { organizationId?: string }[] }).items ?? []);
    for (const r of list) {
      if (!r.organizationId) continue;
      const org = await db.organization.findUnique({ where: { id: r.organizationId }, select: { tenantId: true } });
      expect(org?.tenantId ?? null).toBe(tenantId);
    }
  });
});
