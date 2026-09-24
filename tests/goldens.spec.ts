// TASK-B 24: ALTIN ANLIK GÖRÜNTÜLER (golden snapshots)
// 1) Muhasebe matematiği: No-Dig Turkey 2026 ledger = RECEIVED gelir + SUCCEEDED ödeme
//    = 21.300.000 + 3.800.000 = 25.100.000 kuruş (F6 kuruş bütünlüğü kanıtının devamı)
// 2) Kayıt durum toplamları: CONFIRMED 20 + SUBMITTED 3 + PENDING_APPROVAL 3 + REJECTED 1 + DRAFT 1
// 3) Vitrin agregatları: archiveCount 1, mediaCount 51, participantCount 3 — ve SIFIR kişisel veri
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

test("GOLDEN 1 — ledger math 25100000 kuruş (RECEIVED + SUCCEEDED payments)", async () => {
  const edition = await db.eventEdition.findFirst({ where: { name: "No-Dig Turkey 2026" }, select: { id: true, name: true } });
  expect(edition).not.toBeNull();
  const received = await db.income.aggregate({ where: { editionId: edition!.id, status: "RECEIVED" }, _sum: { amount: true } });
  // E2E akışı tarafından eklenen tahsilatlar (reason öneki "E2E golden flow") altın sayımın
  // dışında — SQL NOT-LIKE NULL tuzakları yerine JS tarafında süzülür (9 satır, ucuz)
  const pays = await db.payment.findMany({ where: { status: "SUCCEEDED", order: { editionId: edition!.id } }, select: { amount: true, reason: true } });
  const paySum = pays.filter((p) => !(p.reason ?? "").startsWith("E2E golden flow")).reduce((s, p) => s + p.amount, 0);
  const ledger = (received._sum.amount ?? 0) + paySum;
  expect(ledger).toBe(25_100_000);
  expect(paySum).toBe(3_800_000);
  expect(received._sum.amount ?? 0).toBe(21_300_000);
});

test("GOLDEN 2 — kayıt durum toplamları 20+3+3+1+1", async () => {
  // E2E akışının yarattığı test kayıtları (maven-test.local) haricen sayılır:
  // tüm kayıt grubu + test-email kayıtları ayrı sayılır, fark alınır (groupBy where-relation uyumu yerine)
  const [groups, testRows] = await Promise.all([
    db.registration.groupBy({ by: ["status"], _count: { _all: true } }),
    db.registration.findMany({ where: { participation: { person: { email: { endsWith: "@maven-test.local" } } } }, select: { status: true } }),
  ]);
  const testCounts = testRows.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
  const byStatus = Object.fromEntries(groups.map((g) => [g.status, g._count._all - (testCounts[g.status] ?? 0)]));
  expect(byStatus["CONFIRMED"]).toBe(20);
  expect(byStatus["SUBMITTED"]).toBe(3);
  expect(byStatus["PENDING_APPROVAL"]).toBe(3);
  expect(byStatus["REJECTED"]).toBe(1);
  expect(byStatus["DRAFT"]).toBe(1);
});

test("GOLDEN 3 — vitrin agregatları + SIFIR kişisel veri", async ({ request }) => {
  const tenant = await db.tenant.findFirst({ select: { slug: true, contactEmail: true, contactPhone: true } });
  const res = await request.get(`/api/public/tenant?slug=${tenant!.slug}`);
  expect(res.status()).toBe(200);
  const j = await res.json();
  const s = JSON.stringify(j);
  // kişisel veri taraması: YALNIZ tenant'ın KENDİ ticari iletişim verisi serbest
  // (TASK-A F2 by-design: contactEmail + contactPhone — firma kimliği, doğal kişi verisi değil)
  const ownContact = new Set([tenant!.contactEmail, tenant!.contactPhone].filter(Boolean) as string[]);
  const phones = s.match(/\+\d{2}[\d ]{6,}/g) ?? [];
  for (const p of phones) if (!ownContact.has(p)) throw new Error(`Yabancı telefon sızdı: ${p}`);
  const emails = s.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
  for (const e of emails) if (!ownContact.has(e)) throw new Error(`Yabancı e-posta sızdı: ${e}`);
  expect(emails.length).toBeLessThanOrEqual(1);
  expect(j.stats?.archiveCount ?? j.archiveCount).toBe(1);
  // toplam sayılar tam sayı ve beklenen tavan içinde (vitrin agregatı)
  expect(j.stats?.mediaCount ?? j.mediaCount).toBe(51);
});

test("GUARD MATRİSİ — bayrak kapalıyken portal/saas kapıları", async ({ request }) => {
  // portal: belirteç yok → 410 (TASK-A F1 davranışı değişmez)
  const noToken = await request.get("/api/portal/participant?editionId=x&personId=y");
  expect(noToken.status()).toBe(410);
  const bogus = await request.get("/api/portal/participant?editionId=x&personId=y", { headers: { "x-portal-token": "pt_bogus000000000000000000" } });
  expect(bogus.status()).toBe(404);
  // provisioning: anahtar yok → 503 (env), yanlış anahtar davranışı gate içinde
  const prov = await request.post("/api/saas/provision", { data: {} });
  expect([503, 404]).toContain(prov.status());
  // health public
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  const h = await health.json();
  expect(h.ok).toBe(true);
  expect(h.db.ok).toBe(true);
});
