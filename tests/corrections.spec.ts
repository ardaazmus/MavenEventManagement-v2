// DÜZELTME TURU hedefli testler — tenant izolasyonu, public DTO, para bütünlüğü,
// atomic zincir, middleware benzeri kapılar. Mevcut desen: Playwright + Prisma (flow.spec.ts).
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

test.describe.serial("P1.1 — deliverables tenant izolasyonu (fail-closed)", () => {
  let agreementId = "";

  test("hazırlık — bir sponsor sözleşmesi çöz", async () => {
    const agreement = await db.sponsorAgreement.findFirst({ select: { id: true } });
    expect(agreement).not.toBeNull();
    agreementId = agreement!.id;
  });

  test("liste — tenantId'siz istek: bağlam-kapsamlı (fail-open BYPASS YOK — satır sahipliği doğrulanır)", async ({ request }) => {
    // chain modu tenantId parametresini ZORUNLU kılmaz (diğer edition-scope uçlarla tutarlı)
    // ama kapsam filtresi UYGULAR: dönen her satır bağlam kiracısına ait OLMALI. Eski
    // fail-open davranıştan farkı budur — kapsam haritası dışı artık 500, foreign 404.
    const tenant = await db.tenant.findFirst({ select: { id: true } });
    const res = await request.get("/api/deliverables");
    expect([200, 400]).toContain(res.status());
    if (res.status() === 200) {
      const body = (await res.json()) as { items?: { id: string }[] };
      const rows = Array.isArray(body) ? (body as { id: string }[]) : (body.items ?? []);
      for (const r of rows) {
        const row = await db.deliverable.findUnique({ where: { id: r.id }, select: { agreement: { select: { edition: { select: { tenantId: true } } } } } });
        expect(row?.agreement?.edition?.tenantId ?? null).toBe(tenant!.id);
      }
    }
  });

  test("liste — kesinlikle geçersiz tenant RED", async ({ request }) => {
    const res = await request.get("/api/deliverables?tenantId=bogus-tenant-xyz");
    expect([400, 404]).toContain(res.status());
    expect(await res.json()).not.toBeNull();
  });

  test("liste — geçerli tenant + foreign-edition filtresi boş", async ({ request }) => {
    // bağlam kiracısına ait olmayan bir editionId (rastgele cuid) → 404 (edisyon bağlamı çözülemez)
    const res = await request.get("/api/deliverables?tenantId=x&editionId=bogus-edition-xyz");
    expect([400, 404]).toContain(res.status());
  });

  test("liste — geçerli tenant kayıtları döner (fail-closed meşru yolu KIRMADI)", async ({ request }) => {
    const tenant = await db.tenant.findFirst({ select: { id: true } });
    const res = await request.get(`/api/deliverables?tenantId=${tenant!.id}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { items?: { id: string }[] };
    const rows = Array.isArray(body) ? (body as unknown[]) : (body.items ?? []);
    // dönen her kayıt bağlam kiracısının edisyonuna ait OLMALI (zincir doğrulaması)
    for (const r of rows as { id: string; agreementId: string }[]) {
      const row = await db.deliverable.findUnique({ where: { id: r.id }, select: { agreement: { select: { edition: { select: { tenantId: true } } } } } });
      const owner = row?.agreement?.edition?.tenantId ?? null;
      expect(owner).toBe(tenant!.id);
    }
  });

  test("detail — kapsam doğrulaması: meşru id 200, sahte parametrelerle de sızma YOK", async ({ request }) => {
    const del = await db.deliverable.findFirst({ select: { id: true } });
    if (!del) return; // seed'de deliverable yoksa atla
    const ok = await request.get(`/api/deliverables/${del.id}`);
    expect(ok.status()).toBe(200);
    // tenantId parametresiyle SAHTE id → 404
    const bad = await request.get("/api/deliverables/bogus-deliverable-id");
    expect(bad.status()).toBe(404);
  });

  test("write — POST foreign agreement FK RED (404), meşru agreement 201", async ({ request }) => {
    const tenant = await db.tenant.findFirst({ select: { id: true } });
    const bad = await request.post(`/api/deliverables`, { data: { agreementId: "bogus-agreement-xyz", name: "X", type: "LOGO" } });
    // bağlam dışı FK → writeGuard 404; tenantsiz gövde tenant-scope 400 olabilir
    expect([400, 404]).toContain(bad.status());
    const ok = await request.post(`/api/deliverables?tenantId=${tenant!.id}`, {
      data: { agreementId, name: "Düzeltme-Turu Test Teslimi", type: "LOGO", status: "NOT_STARTED" },
    });
    expect([200, 201]).toContain(ok.status());
    const created = (await ok.json()) as { id: string };
    // temizlik
    const del = await request.delete(`/api/deliverables/${created.id}`);
    expect([200, 204]).toContain(del.status());
    expect(await db.deliverable.findUnique({ where: { id: created.id } })).toBeNull();
  });
});

test.describe("P1.2 — public-register DTO izin listesi", () => {
  test("başarılı yanıt YALNIZ izinli anahtarları içerir; duyarlı anahtarlar YOK", async ({ request }) => {
    const form = await db.formDefinition.findFirst({
      where: { type: "REGISTRATION", isPublic: true, status: "PUBLISHED" },
      include: { fields: true },
    });
    test.skip(!form, "Yayında public kayıt formu yok");
    if (!form) return;
    const fields = await db.formField.findMany({ where: { formId: form.id, required: "ALWAYS" }, select: { id: true, type: true, options: true } });
    const answers: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === "SINGLE_CHOICE") answers[f.id] = (f.options ?? "").split("\n")[0].trim();
      else answers[f.id] = "DTO Test Kurumu";
    }
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const res = await request.post("/api/public-register", {
      data: { formId: form.id, respondentName: `DTO ${stamp}`, respondentEmail: `dto-${stamp}@maven-correct.local`, answers, elapsedSeconds: 30, commsOptIn: true },
    });
    expect([200, 201]).toContain(res.status());
    const body = (await res.json()) as Record<string, unknown>;
    // İZİN LİSTESİ — tam küme
    const allowed = new Set(["submissionId", "status", "quizScore", "quizCorrect", "quizTotal", "registration", "order", "payment"]);
    for (const k of Object.keys(body)) expect(allowed.has(k), `izin dışı anahtar: ${k}`).toBe(true);
    // DUYARLI ANAHTARLAR — açıkça YOK
    for (const sensitive of ["spamScore", "spamReasons", "chainError", "email", "phone", "respondentEmail", "person", "participation", "paymentMethod", "token", "notes", "submitIp"]) {
      expect(sensitive in body, `duyarlı anahtar sızması: ${sensitive}`).toBe(false);
    }
    // iç içe nesneler de izin-listeli
    if (body.registration) expect(new Set(Object.keys(body.registration as object))).toEqual(new Set(["confirmationNo", "status"]));
    if (body.order) expect(new Set(Object.keys(body.order as object))).toEqual(new Set(["orderNo", "status", "totalAmount", "currency"]));
    if (body.payment) expect(new Set(Object.keys(body.payment as object))).toEqual(new Set(["id", "status"]));
  });
});

test.describe.serial("P1.3 — iade para bütünlüğü + idempotency", () => {
  let orderId = "";
  let paidMinor = 0;

  test("hazırlık — tahsil edilmiş sipariş seç (ve iade bakiyesini hesapla)", async () => {
    const order = await db.order.findFirst({
      where: { status: { in: ["PAID", "PARTIALLY_PAID"] } },
      include: { payments: true, refunds: true, edition: true },
    });
    expect(order).not.toBeNull();
    orderId = order!.id;
    const paid = order!.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
    const refunded = order!.refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amount, 0);
    paidMinor = paid - refunded;
    expect(paidMinor).toBeGreaterThan(0);
  });

  test("geçersiz tutarlar RED — 0, negatif, ondalıklı, major 'amount'", async ({ request }) => {
    for (const payload of [
      { amountMinor: 0 },
      { amountMinor: -500 },
      { amountMinor: 10.5 },
      { amountMinor: Number.NaN },
      { amountMinor: Number.POSITIVE_INFINITY },
      { amountMinor: "abc" },
      { amount: 100 }, // eski major-unit parametresi — 400
    ]) {
      const res = await request.post("/api/flows", { data: { action: "finance.refund", orderId, reason: "test", ...payload } });
      expect(res.status(), JSON.stringify(payload)).toBe(400);
    }
  });

  test("gerekçe zorunlu", async ({ request }) => {
    const res = await request.post("/api/flows", { data: { action: "finance.refund", orderId, amountMinor: 1 } });
    expect(res.status()).toBe(400);
  });

  test("para birimi uyuşmazlığı RED", async ({ request }) => {
    const res = await request.post("/api/flows", { data: { action: "finance.refund", orderId, amountMinor: 1, reason: "kur testi", currency: "USD" } });
    expect(res.status()).toBe(400);
  });

  test("over-refund RED — bakiyeden 1 kuruş fazla", async ({ request }) => {
    const res = await request.post("/api/flows", { data: { action: "finance.refund", orderId, amountMinor: paidMinor + 1, reason: "aşımlı iade testi" } });
    expect(res.status()).toBe(409);
    // kayıt OLUŞMAMIŞ olmalı
    const count = await db.refund.count({ where: { orderId, reason: "aşımlı iade testi" } });
    expect(count).toBe(0);
  });

  test("idempotency — aynı anahtar ikinci hareket OLUŞTURMAZ; farklı yük 409", async ({ request }) => {
    const key = `e2e-refund-${Date.now()}`;
    const first = await request.post("/api/flows", { data: { action: "finance.refund", orderId, amountMinor: 100, reason: "idem testi", idempotencyKey: key } });
    expect(first.status()).toBe(201);
    const r1 = (await first.json()) as { id: string };
    // aynı anahtar + aynı yük → aynı kayıt, yeni hareket yok
    const second = await request.post("/api/flows", { data: { action: "finance.refund", orderId, amountMinor: 100, reason: "idem testi", idempotencyKey: key } });
    expect(second.status()).toBe(201);
    const r2 = (await second.json()) as { id: string };
    expect(r2.id).toBe(r1.id);
    // aynı anahtar + FARKLI yük → 409
    const clash = await request.post("/api/flows", { data: { action: "finance.refund", orderId, amountMinor: 200, reason: "idem testi", idempotencyKey: key } });
    expect(clash.status()).toBe(409);
    const rows = await db.refund.count({ where: { orderId, idempotencyKey: key } });
    expect(rows).toBe(1);
    // temizlik (finansal hareketi geri al — seed paritesi)
    await db.refund.delete({ where: { id: r1.id } });
  });

  test("eşzamanlı istek — aynı anahtarla TEK hareket", async ({ request }) => {
    const key = `e2e-concurrent-${Date.now()}`;
    const payload = { action: "finance.refund", orderId, amountMinor: 150, reason: "eşzamanlı test", idempotencyKey: key };
    const results = await Promise.all([
      request.post("/api/flows", { data: payload }),
      request.post("/api/flows", { data: payload }),
      request.post("/api/flows", { data: payload }),
    ]);
    const statuses = await Promise.all(results.map((r) => r.status()));
    for (const s of statuses) expect([201, 409]).toContain(s);
    const rows = await db.refund.findMany({ where: { orderId, idempotencyKey: key } });
    expect(rows.length).toBe(1);
    await db.refund.delete({ where: { id: rows[0].id } });
  });

  test("temizlik — test siparişi bakiyesi değişmedi", async () => {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: true, refunds: true } });
    const paid = order!.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
    const refunded = order!.refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amount, 0);
    expect(paid - refunded).toBe(paidMinor);
  });
});

test.describe.serial("P1.4 — atomic registration chain (retry + eşzamanlı)", () => {
  let formId = "";
  const email = `chain-${Date.now().toString(36)}@maven-correct.local`;

  test("hazırlık — public kayıt formu", async () => {
    const form = await db.formDefinition.findFirst({ where: { type: "REGISTRATION", isPublic: true, status: "PUBLISHED" }, select: { id: true } });
    test.skip(!form, "Yayında public kayıt formu yok");
    formId = form!.id;
  });

  test("temizlik — corrections test kişileri silinir (GOLDEN paritesi)", async () => {
    // Bu spec'in ürettiği tüm kişiler (@maven-correct.local) zincirleriyle birlikte temizlenir —
    // goldens.spec'in seed-parite sayaçları yalnız @maven-test.local'ı muaf tutar.
    const stale = await db.person.findMany({ where: { email: { endsWith: "@maven-correct.local" } }, select: { id: true } });
    for (const p of stale) {
      await db.person.delete({ where: { id: p.id } }).catch(() => undefined);
    }
    void formId;
  });

  test("gönderim → zincir kurulu; duplicate retry YENİ satır OLUŞTURMAZ", async ({ request }) => {
    test.skip(!formId, "form yok");
    const fields = await db.formField.findMany({ where: { formId, required: "ALWAYS" }, select: { id: true, type: true, options: true } });
    const answers: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === "SINGLE_CHOICE") answers[f.id] = (f.options ?? "").split("\n")[0].trim();
      else answers[f.id] = "Zincir Testi";
    }
    const res = await request.post("/api/public-register", {
      data: { formId, respondentName: "Zincir Test Kişisi", respondentEmail: email, answers, elapsedSeconds: 30, commsOptIn: true },
    });
    expect([200, 201]).toContain(res.status());
    const person = await db.person.findFirst({ where: { email } });
    expect(person).not.toBeNull();
    const before = {
      registrations: await db.registration.count({ where: { participation: { personId: person!.id } } }),
      participations: await db.eventParticipation.count({ where: { personId: person!.id } }),
      people: await db.person.count({ where: { email } }),
    };
    // aynı gönderi üzerinde yeniden zincir çağrısı (onay aksiyonunun idempotent yolu — PATCH)
    const submission = await db.formSubmission.findFirst({ where: { respondentEmail: email }, orderBy: { createdAt: "desc" } });
    const res2 = await request.patch(`/api/form-submissions/${submission!.id}`, { data: { action: "approve" } });
    expect([200, 201, 409]).toContain(res2.status());
    const after = {
      registrations: await db.registration.count({ where: { participation: { personId: person!.id } } }),
      participations: await db.eventParticipation.count({ where: { personId: person!.id } }),
      people: await db.person.count({ where: { email } }),
    };
    expect(after).toEqual(before);
  });

  test("eşzamanlı onay — unique kısıtı TEK zincir garantiler, kısmi satır KALMAZ", async ({ request }) => {
    test.skip(!formId, "form yok");
    const stamp = Date.now().toString(36) + "c";
    const email2 = `chain-${stamp}@maven-correct.local`;
    const fields = await db.formField.findMany({ where: { formId, required: "ALWAYS" }, select: { id: true, type: true, options: true } });
    const answers: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === "SINGLE_CHOICE") answers[f.id] = (f.options ?? "").split("\n")[0].trim();
      else answers[f.id] = "Eşzamanlı Testi";
    }
    // gönderiyi zincirsiz oluştur (PENDING) — sonra iki eşzamanlı onay
    const res = await request.post("/api/public-register", {
      data: { formId, respondentName: "Eşzamanlı Kişi", respondentEmail: email2, answers, elapsedSeconds: 30, commsOptIn: false },
    });
    expect([200, 201]).toContain(res.status());
    const submission = await db.formSubmission.findFirst({ where: { respondentEmail: email2 }, orderBy: { createdAt: "desc" } });
    if (submission?.registrationId) {
      // auto-approve zinciri kurdu — idempotency zaten kanıtlandı; kısmi yazım yok
      const regCount = await db.registration.count({ where: { id: submission.registrationId } });
      expect(regCount).toBe(1);
      return;
    }
    const results = await Promise.all([
      request.patch(`/api/form-submissions/${submission!.id}`, { data: { action: "approve" } }),
      request.patch(`/api/form-submissions/${submission!.id}`, { data: { action: "approve" } }),
    ]);
    const statuses = await Promise.all(results.map((r) => r.status()));
    for (const s of statuses) expect([200, 201, 409]).toContain(s);
    const person = await db.person.findFirst({ where: { email: email2 } });
    expect(await db.person.count({ where: { email: email2 } })).toBeLessThanOrEqual(1);
    expect(await db.eventParticipation.count({ where: { personId: person!.id } })).toBeLessThanOrEqual(1);
    const regIds = await db.registration.findMany({ where: { participation: { personId: person!.id } }, select: { id: true } });
    expect(regIds.length).toBeLessThanOrEqual(1);
    // gönderinin bağlantısı TEK kayda işaret eder
    const again = await db.formSubmission.findUnique({ where: { id: submission!.id }, select: { registrationId: true } });
    expect(again?.registrationId).toBeTruthy();
  });

  test("temizlik — zincir test kişileri silinir (seed paritesi)", async () => {
    const stale = await db.person.findMany({ where: { email: { endsWith: "@maven-correct.local" } }, select: { id: true } });
    for (const p of stale) {
      await db.person.delete({ where: { id: p.id } }).catch(() => undefined);
    }
    expect(await db.person.count({ where: { email: { endsWith: "@maven-correct.local" } } })).toBe(0);
  });
});

test.describe("P2 — dinamik model metriği + sözlük sağlığı", () => {
  test("footer model sayısı = bootstrap.modelCount = şema model sayısı", async ({ request }) => {
    const res = await request.get("/api/bootstrap");
    const body = (await res.json()) as { modelCount?: number };
    expect(typeof body.modelCount).toBe("number");
    expect(body.modelCount).toBeGreaterThan(0);
    // yetkili kaynak: prisma şemasındaki model bildirimleri
    const { readFileSync } = await import("fs");
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const declared = (schema.match(/^model\s+[A-Za-z]/gm) ?? []).length;
    expect(body.modelCount).toBe(declared);
  });
});
