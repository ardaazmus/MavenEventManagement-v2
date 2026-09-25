# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: goldens.spec.ts >> GOLDEN 1 — ledger math 25100000 kuruş (RECEIVED + SUCCEEDED payments)
- Location: tests/goldens.spec.ts:15:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 25100000
Received: 49100000
```

# Test source

```ts
  1  | // TASK-B 24: ALTIN ANLIK GÖRÜNTÜLER (golden snapshots)
  2  | // 1) Muhasebe matematiği: No-Dig Turkey 2026 ledger = RECEIVED gelir + SUCCEEDED ödeme
  3  | //    = 21.300.000 + 3.800.000 = 25.100.000 kuruş (F6 kuruş bütünlüğü kanıtının devamı)
  4  | // 2) Kayıt durum toplamları: CONFIRMED 20 + SUBMITTED 3 + PENDING_APPROVAL 3 + REJECTED 1 + DRAFT 1
  5  | // 3) Vitrin agregatları: archiveCount 1, mediaCount 51, participantCount 3 — ve SIFIR kişisel veri
  6  | import { test, expect } from "@playwright/test";
  7  | import { PrismaClient } from "@prisma/client";
  8  | 
  9  | const db = new PrismaClient();
  10 | 
  11 | test.afterAll(async () => {
  12 |   await db.$disconnect();
  13 | });
  14 | 
  15 | test("GOLDEN 1 — ledger math 25100000 kuruş (RECEIVED + SUCCEEDED payments)", async () => {
  16 |   const edition = await db.eventEdition.findFirst({ where: { name: "No-Dig Turkey 2026" }, select: { id: true, name: true } });
  17 |   expect(edition).not.toBeNull();
  18 |   const received = await db.income.aggregate({ where: { editionId: edition!.id, status: "RECEIVED" }, _sum: { amount: true } });
  19 |   // E2E akışı tarafından eklenen tahsilatlar (reason öneki "E2E golden flow") altın sayımın
  20 |   // dışında — SQL NOT-LIKE NULL tuzakları yerine JS tarafında süzülür (9 satır, ucuz)
  21 |   const pays = await db.payment.findMany({ where: { status: "SUCCEEDED", order: { editionId: edition!.id } }, select: { amount: true, reason: true } });
  22 |   const paySum = pays.filter((p) => !(p.reason ?? "").startsWith("E2E golden flow")).reduce((s, p) => s + p.amount, 0);
  23 |   const ledger = (received._sum.amount ?? 0) + paySum;
> 24 |   expect(ledger).toBe(25_100_000);
     |                  ^ Error: expect(received).toBe(expected) // Object.is equality
  25 |   expect(paySum).toBe(3_800_000);
  26 |   expect(received._sum.amount ?? 0).toBe(21_300_000);
  27 | });
  28 | 
  29 | test("GOLDEN 2 — kayıt durum toplamları 20+3+3+1+1", async () => {
  30 |   // E2E akışının yarattığı test kayıtları (maven-test.local) haricen sayılır:
  31 |   // tüm kayıt grubu + test-email kayıtları ayrı sayılır, fark alınır (groupBy where-relation uyumu yerine)
  32 |   const [groups, testRows] = await Promise.all([
  33 |     db.registration.groupBy({ by: ["status"], _count: { _all: true } }),
  34 |     db.registration.findMany({ where: { participation: { person: { email: { endsWith: "@maven-test.local" } } } }, select: { status: true } }),
  35 |   ]);
  36 |   const testCounts = testRows.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
  37 |   const byStatus = Object.fromEntries(groups.map((g) => [g.status, g._count._all - (testCounts[g.status] ?? 0)]));
  38 |   expect(byStatus["CONFIRMED"]).toBe(20);
  39 |   expect(byStatus["SUBMITTED"]).toBe(3);
  40 |   expect(byStatus["PENDING_APPROVAL"]).toBe(3);
  41 |   expect(byStatus["REJECTED"]).toBe(1);
  42 |   expect(byStatus["DRAFT"]).toBe(1);
  43 | });
  44 | 
  45 | test("GOLDEN 3 — vitrin agregatları + SIFIR kişisel veri", async ({ request }) => {
  46 |   const tenant = await db.tenant.findFirst({ select: { slug: true, contactEmail: true, contactPhone: true } });
  47 |   const res = await request.get(`/api/public/tenant?slug=${tenant!.slug}`);
  48 |   expect(res.status()).toBe(200);
  49 |   const j = await res.json();
  50 |   const s = JSON.stringify(j);
  51 |   // kişisel veri taraması: YALNIZ tenant'ın KENDİ ticari iletişim verisi serbest
  52 |   // (TASK-A F2 by-design: contactEmail + contactPhone — firma kimliği, doğal kişi verisi değil)
  53 |   const ownContact = new Set([tenant!.contactEmail, tenant!.contactPhone].filter(Boolean) as string[]);
  54 |   const phones = s.match(/\+\d{2}[\d ]{6,}/g) ?? [];
  55 |   for (const p of phones) if (!ownContact.has(p)) throw new Error(`Yabancı telefon sızdı: ${p}`);
  56 |   const emails = s.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
  57 |   for (const e of emails) if (!ownContact.has(e)) throw new Error(`Yabancı e-posta sızdı: ${e}`);
  58 |   expect(emails.length).toBeLessThanOrEqual(1);
  59 |   expect(j.stats?.archiveCount ?? j.archiveCount).toBe(1);
  60 |   // toplam sayılar tam sayı ve beklenen tavan içinde (vitrin agregatı)
  61 |   expect(j.stats?.mediaCount ?? j.mediaCount).toBe(51);
  62 | });
  63 | 
  64 | test("GUARD MATRİSİ — bayrak kapalıyken portal/saas kapıları", async ({ request }) => {
  65 |   // portal: belirteç yok → 410 (TASK-A F1 davranışı değişmez)
  66 |   const noToken = await request.get("/api/portal/participant?editionId=x&personId=y");
  67 |   expect(noToken.status()).toBe(410);
  68 |   const bogus = await request.get("/api/portal/participant?editionId=x&personId=y", { headers: { "x-portal-token": "pt_bogus000000000000000000" } });
  69 |   expect(bogus.status()).toBe(404);
  70 |   // provisioning: anahtar yok → 503 (env), yanlış anahtar davranışı gate içinde
  71 |   const prov = await request.post("/api/saas/provision", { data: {} });
  72 |   expect([503, 404]).toContain(prov.status());
  73 |   // health public
  74 |   const health = await request.get("/api/health");
  75 |   expect(health.status()).toBe(200);
  76 |   const h = await health.json();
  77 |   expect(h.ok).toBe(true);
  78 |   expect(h.db.ok).toBe(true);
  79 | });
  80 | 
```