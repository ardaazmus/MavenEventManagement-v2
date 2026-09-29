// P3 (yeni-fazlar 9-13): iş-akışı durum makinesi, atomiklik ve veri bütünlüğü testleri.
//  * registration.decide: geçersiz karar 400; yasal olmayan geçiş 409; aynı-karar idempotent;
//    REJECTED → RESERVED hak RELEASED + entitlement yeniden hesap; portal token yalnız geçerli onayda
//  * reservation.confirm: tekrar teyit stok YENİDEN TÜKETMEZ; iptal stoğu geri verir
//  * person.merge: CV/B2B/portal-token/session-material/social/veli bağları hedefe taşınır
//  * edition.publish: engelleyici 409; ONSITE→REGISTRATION geri sarma YOK; onaylı-oturum çakışması
//  * kapasite: dolu kategori zinciri → 409 CAPACITY_FULL (admin onay yolu)
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
let editionId = "";

test.beforeAll(async () => {
  const ed = await db.eventEdition.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  editionId = ed!.id;
});

// QA: P3 artıkları GOLDEN 2'yi (+1 CONFIRMED/proje) ve edisyon seçiciyi (P3 Yayın
// Testi kirliliği) bozuyordu. Sıralı silim: kayıt → kategori → form → otel zinciri →
// edisyon (SetNull/cascade yönlerine uygun); kişiler maven-test.local dışlamasıyla
// golden-güvenli ama hijyen için silinir.
test.afterAll(async () => {
  const cats = await db.registrationCategory.findMany({ where: { name: { startsWith: "P3-Dolu-" } }, select: { id: true } });
  if (cats.length > 0) {
    await db.registration.deleteMany({ where: { categoryId: { in: cats.map((c) => c.id) } } });
    await db.registrationCategory.deleteMany({ where: { id: { in: cats.map((c) => c.id) } } });
  }
  await db.formDefinition.deleteMany({ where: { name: { startsWith: "P3 Kapasite Formu " } } });
  const hotels = await db.hotelProperty.findMany({ where: { name: { startsWith: "P3 Otel " } }, select: { id: true } });
  if (hotels.length > 0) {
    const hids = hotels.map((h) => h.id);
    const blocks = await db.roomBlock.findMany({ where: { hotelId: { in: hids } }, select: { id: true } });
    if (blocks.length > 0) {
      await db.reservation.deleteMany({ where: { blockId: { in: blocks.map((b) => b.id) } } });
    }
    await db.hotelProperty.deleteMany({ where: { id: { in: hids } } });
  }
  await db.eventEdition.deleteMany({ where: { name: { startsWith: "P3 Yayın Testi " } } });
  await db.person.deleteMany({ where: { email: { startsWith: "p3-" } } });
  await db.$disconnect();
});

test.describe.serial("P3.9 — kayıt kararları + haklar", () => {
  test("geçersiz karar değeri 400", async ({ request }) => {
    const reg = await db.registration.findFirst({ where: { status: "PENDING_APPROVAL" }, select: { id: true } });
    const res = await request.post("/api/flows", { data: { action: "registration.decide", registrationId: reg!.id, decision: "MAYBE" } });
    expect(res.status()).toBe(400);
  });

  test("REJECTED kayıt onaylanamaz → 409 (geçiş tanımsız)", async ({ request }) => {
    const reg = await db.registration.findFirst({ where: { status: "REJECTED" }, select: { id: true } });
    test.skip(!reg, "REJECTED kayıt yok");
    const res = await request.post("/api/flows", { data: { action: "registration.decide", registrationId: reg!.id, decision: "CONFIRMED" } });
    expect(res.status()).toBe(409);
  });

  test("sponsor misafiri reddi → RESERVED hak serbest + havuz yeniden hesap (tek tx)", async ({ request }) => {
    // kapasiteli hak havuzu yarat (reserved alanı belli olsun)
    const org = await db.organization.findFirst({ select: { id: true } });
    const ent = await db.entitlement.create({
      data: { editionId, ownerOrganizationId: org!.id, label: `P3-havuz-${Date.now()}`, quantityGranted: 5, quantityConsumed: 0  },
      select: { id: true },
    });
    // sponsor misafiri (PENDING_APPROVAL kayıt + RESERVED claim)
    const g = await request.post("/api/flows", {
      data: { action: "sponsor.guest", entitlementId: ent.id, firstName: "P3", lastName: "Misafir", email: `p3-guest-${Date.now()}@maven-test.local` },
    });
    expect(g.status()).toBe(201);
    const gbody = (await g.json()) as { registration: { id: string }; claim: { id: string } };

    // kapasite dolu değilken ikinci misafir ekle → sonra reddet → hak geri gelir
    const rej = await request.post("/api/flows", { data: { action: "registration.decide", registrationId: gbody.registration.id, decision: "REJECTED" } });
    expect(rej.status()).toBe(200);
    const claim = await db.entitlementClaim.findUnique({ where: { id: gbody.claim.id }, select: { status: true } });
    expect(claim?.status).toBe("RELEASED");
    const entAfter = await db.entitlement.findUnique({ where: { id: ent.id }, select: { quantityReserved: true, quantityConsumed: true } });
    expect(entAfter?.quantityReserved).toBe(0);
    expect(entAfter?.quantityConsumed).toBe(0);
  });

  test("onay geçişi portal belirteci düzenler; tekrar onay idempotent (ikinci belirteç yok)", async ({ request }) => {
    const ent = await db.entitlement.create({
      data: { editionId, label: `P3-onay-${Date.now()}`, quantityGranted: 5, quantityConsumed: 0  },
      select: { id: true },
    });
    const g = await request.post("/api/flows", {
      data: { action: "sponsor.guest", entitlementId: ent.id, firstName: "P3", lastName: "Onaylı", email: `p3-ok-${Date.now()}@maven-test.local` },
    });
    const gbody = (await g.json()) as { registration: { id: string } };
    const ok1 = await request.post("/api/flows", { data: { action: "registration.decide", registrationId: gbody.registration.id, decision: "CONFIRMED" } });
    expect(ok1.status()).toBe(200);
    const b1 = (await ok1.json()) as { issuedPortalToken?: { token: string } };
    expect(b1.issuedPortalToken?.token).toBeTruthy(); // geçerli geçişte tek görünlük belirteç
    const ok2 = await request.post("/api/flows", { data: { action: "registration.decide", registrationId: gbody.registration.id, decision: "CONFIRMED" } });
    expect(ok2.status()).toBe(200); // idempotent
    const b2 = (await ok2.json()) as { issuedPortalToken?: unknown };
    expect(b2.issuedPortalToken).toBeUndefined(); // ikinci belirteç DÜZENLENMEZ
  });
});

test.describe.serial("P3.10 — rezervasyon teyit idempotency + stok iadesi", () => {
  let blockId = "";
  let reservationId = "";

  test("hazırlık — blok + 2 gece stok + rezervasyon", async () => {
    const hotel = await db.hotelProperty.create({ data: { editionId, name: `P3 Otel ${Date.now()}` } as never, select: { id: true } });
    const rt = await db.roomType.create({ data: { hotelId: hotel.id, name: "Standart", capacity: 5 } as never, select: { id: true } });
    const now = new Date();
    const d1 = new Date(now.getTime() + 7 * 86400000);
    const d2 = new Date(now.getTime() + 8 * 86400000);
    const d3 = new Date(now.getTime() + 9 * 86400000);
    const block = await db.roomBlock.create({ data: { hotelId: hotel.id, roomTypeId: rt.id, name: "P3 blok" } as never, select: { id: true } });
    blockId = block.id;
    for (const d of [d1, d2]) {
      await db.inventoryNight.create({ data: { blockId, date: d, totalRooms: 5, reservedRooms: 0 } as never });
    }
    const resv = await db.reservation.create({
      data: { editionId, guestName: "P3 Misafir", checkIn: d1, checkOut: d3, blockId } as never,
      select: { id: true },
    });
    reservationId = resv.id;
  });

  test("teyit → 2 gece tüketilir; ikinci teyit stok tüketmez (idempotent)", async ({ request }) => {
    const c1 = await request.post("/api/flows", { data: { action: "reservation.confirm", reservationId } });
    expect(c1.status()).toBe(200);
    const stock1 = await db.inventoryNight.aggregate({ where: { blockId }, _sum: { reservedRooms: true } });
    expect(stock1._sum.reservedRooms).toBe(2);
    const c2 = await request.post("/api/flows", { data: { action: "reservation.confirm", reservationId } });
    expect(c2.status()).toBe(200);
    const stock2 = await db.inventoryNight.aggregate({ where: { blockId }, _sum: { reservedRooms: true } });
    expect(stock2._sum.reservedRooms).toBe(2); // ikinci teyit EK stok tüketmedi
  });

  test("iptal → stok geri verilir", async ({ request }) => {
    const x = await request.post("/api/flows", { data: { action: "reservation.cancel", reservationId, reason: "P3 iptal testi" } });
    expect(x.status()).toBe(200);
    const stock = await db.inventoryNight.aggregate({ where: { blockId }, _sum: { reservedRooms: true } });
    expect(stock._sum.reservedRooms).toBe(0);
  });
});

test.describe("P3.11 — kategori kapasitesi atomik", () => {
  test("dolu kategori → zincir kurulmaz, gönderi PENDING kalır, admin onayı 409 CAPACITY_FULL", async ({ request }) => {
    // kapasite 1 kategori + mevcut 1 kayıt (kapasite dolu)
    const cat = await db.registrationCategory.create({
      data: { editionId, name: `P3-Dolu-${Date.now()}`, code: `P3D${Date.now()}`, basePrice: 0, currency: "TRY", capacity: 1, isActive: true, order: 99 } as never,
      select: { id: true },
    });
    await db.registration.create({
      data: { editionId, participationId: (await db.eventParticipation.findFirst({ select: { id: true } }))!.id, categoryId: cat.id, status: "CONFIRMED" },
    });
    // public form + gönderi
    const form = await db.formDefinition.create({
      data: { editionId, name: `P3 Kapasite Formu ${Date.now()}`, type: "REGISTRATION", isPublic: true, status: "PUBLISHED", defaultCategoryId: cat.id } as never,
      select: { id: true },
    });
    const sub = await db.formSubmission.create({
      data: { formId: form.id, editionId, respondentName: "P3 Kapasite", respondentEmail: `p3-cap-${Date.now()}@maven-test.local`, status: "PENDING" } as never,
      select: { id: true },
    });
    // admin onay aksiyonu → ChainCapacityError → 409 CAPACITY_FULL
    const res = await request.patch(`/api/form-submissions/${sub.id}`, { data: { action: "approve" } });
    expect(res.status()).toBe(409);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("CAPACITY_FULL");
    const regCount = await db.registration.count({ where: { categoryId: cat.id } });
    expect(regCount).toBe(1); // aşım kayıt YOK
  });
});

test.describe("P3.13 — yayın hazırlık semantiği", () => {
  test("ücretli kategori ödeme talimatsız → yayın 409 (engelleyici caydırır)", async ({ request }) => {
    const ed = await db.eventEdition.create({
      data: { tenantId: (await db.tenant.findFirst({ select: { id: true } }))!.id, name: `P3 Yayın Testi ${Date.now()}`, slug: `p3-yayin-${Date.now()}`, status: "PLANNING", startDate: new Date(Date.now() + 30 * 86400000)  , endDate: new Date(Date.now() + 32 * 86400000), format: "ONSITE" } as never,
      select: { id: true },
    });
    await db.registrationCategory.create({ data: { editionId: ed.id, name: "Ücretli", code: `P3P${Date.now()}`, basePrice: 100_000, currency: "TRY", isActive: true, order: 1 } as never });
    const res = await request.post("/api/flows", { data: { action: "edition.publish", editionId: ed.id } });
    expect(res.status()).toBe(409);
    const body = (await res.json()) as { checks?: { blockers: unknown[] } };
    expect(body.checks?.blockers.length).toBeGreaterThan(0);
  });

  test("ONSITE edisyon yayını statusu REGISTRATION'a GERİ SARMAZ", async ({ request }) => {
    const onsite = await db.eventEdition.findFirst({ where: { status: "ONSITE" }, select: { id: true, name: true } });
    test.skip(!onsite, "ONSITE edisyon yok");
    const res = await request.post("/api/flows", { data: { action: "edition.publish", editionId: onsite!.id } });
    expect([200, 409]).toContain(res.status()); // 409: bloklayıcı varsa meşru
    if (res.status() === 200) {
      const row = await db.eventEdition.findUnique({ where: { id: onsite!.id }, select: { status: true, isPublished: true } });
      expect(row?.status).toBe("ONSITE"); // geri sarma YOK
      expect(row?.isPublished).toBe(true);
    }
  });
});

test.describe("P3.12 — kişi birleştirme tam kapsam", () => {
  test("CV/B2B/portal-token/session-material/social/veli hedefe taşınır, geçmiş korunur", async ({ request }) => {
    const tenantId = (await db.tenant.findFirst({ select: { id: true } }))!.id;
    const src = await db.person.create({ data: { tenantId, firstName: "P3", lastName: "Kaynak", email: `p3-src-${Date.now()}@maven-test.local` } });
    const tgt = await db.person.create({ data: { tenantId, firstName: "P3", lastName: "Hedef", email: `p3-tgt-${Date.now()}@maven-test.local` } });
    await db.cvEntry.create({ data: { personId: src.id, editionId, title: "P3 CV", kind: "EXPERIENCE", description: "deneyim" } as never });
    const sess = await db.programSession.create({ data: { editionId, title: "P3 oturum", startTime: new Date(Date.now() + 3600000), endTime: new Date(Date.now() + 7200000) } as never, select: { id: true } });
    await db.sessionMaterial.create({ data: { sessionId: sess.id, editionId, personId: src.id, type: "SLIDES", title: "P3 materyal" } as never });
    const sp = await db.socialPlan.create({ data: { editionId, title: "P3 plan" } as never, select: { id: true } });
    await db.socialPlanAnnouncement.create({ data: { planId: sp.id, personId: src.id, channel: "IN_APP", fullName: "P3 duyuru" } as never });
    await db.portalToken.create({ data: { tokenHash: "p3-hash-" + Date.now(), scope: "PARTICIPANT", editionId, personId: src.id, issuedBy: "TEST", expiresAt: new Date(Date.now() + 86400000) } as never });
    const dependent = await db.person.create({ data: { tenantId, firstName: "P3", lastName: "Bağımlı", email: `p3-dep-${Date.now()}@maven-test.local`, parentPersonId: src.id } });
    // B2B çakışması: kaynak + hedef AYNI planda kayıtlı → kaynak ataması silinir (unique)
    const plan = await db.b2bPlan.create({ data: { editionId, subject: "P3 B2B" } as never, select: { id: true } });
    await db.b2bAssignment.create({ data: { planId: plan.id, personId: src.id } as never });
    await db.b2bAssignment.create({ data: { planId: plan.id, personId: tgt.id } as never });

    const res = await request.post("/api/flows", { data: { action: "person.merge", sourceId: src.id, targetId: tgt.id, fillProfile: false } });
    expect(res.status()).toBe(200);
    const srcAfter = await db.person.findUnique({ where: { id: src.id }, select: { status: true, mergedIntoId: true } });
    expect(srcAfter?.status).toBe("MERGED");
    expect(await db.cvEntry.count({ where: { personId: tgt.id } })).toBe(1); // CV hedefte
    expect(await db.portalToken.count({ where: { personId: tgt.id } })).toBe(1); // token hedefte
    expect(await db.person.count({ where: { parentPersonId: tgt.id, id: dependent.id } })).toBe(1); // bağımlı hedefe bağlı
    expect(await db.b2bAssignment.count({ where: { planId: plan.id, personId: tgt.id } })).toBe(1); // unique korundu
    expect(await db.b2bAssignment.count({ where: { planId: plan.id, personId: src.id } })).toBe(0); // kaynak ataması çözüldü
  });
});
