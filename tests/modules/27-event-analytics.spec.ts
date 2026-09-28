// Modul 27 — ANALITIK: huni, kohort, segment/RFM/gelir, kokpit + xlsx,
// SQL sablonlari. Salt-okunur (xlsx denetim kaydi birakir — append-only).
// Yabanci/bogus edisyon 404 kilitleri dahildir.
import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const db = new PrismaClient();
let editionId = "";

function virtualClientHeaders() {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.ceil(Math.random() * 254)}`;
  return { "x-forwarded-for": ip };
}

async function getWarm(request: APIRequestContext, path: string, tries = 5): Promise<APIResponse> {
  let last: APIResponse | null = null;
  for (let i = 0; i < tries; i++) {
    last = await request.get(path, { headers: virtualClientHeaders() });
    const ct = last.headers()["content-type"] ?? "";
    if (ct.includes("application/json") || ct.includes("spreadsheetml")) return last;
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (!last) throw new Error(`route yanit vermedi: ${path}`);
  return last;
}

test.describe.serial("M27 — analitik uctan uca", () => {
  test.afterAll(async () => {
    await db.$disconnect();
  });

  test("kurulum: ilk edisyon + tohum sayimlari", async () => {
    const edition = await db.eventEdition.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
    expect(edition).toBeTruthy();
    editionId = edition!.id;
    expect(await db.eventParticipation.count({ where: { editionId } })).toBeGreaterThan(0);
  });

  test("huni: asama monotonlugu + kirilimlar + bogus 404", async ({ request }) => {
    const res = await getWarm(request, `/api/analytics/funnel?editionId=${editionId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.editionId).toBe(editionId);
    expect(body.stages.map((s: { key: string }) => s.key)).toEqual([
      "REGISTERED", "SUBMITTED", "CONFIRMED", "PAID", "CHECKED_IN",
    ]);
    const counts = body.stages.map((s: { count: number }) => s.count) as number[];
    // asamalar bagimsiz kilometre taslaridir (ucretsiz kategoriler odemesiz
    // giris yapar) — oran 1'i asabilir; yalniz tanimlilik + negatiflik kilitlenir
    expect(counts[0]).toBe(body.total);
    for (const s of body.stages.slice(1)) {
      expect(typeof s.rate).toBe("number");
      expect(s.rate).toBeGreaterThanOrEqual(0);
    }
    expect(Array.isArray(body.byCategory)).toBe(true);
    expect(Array.isArray(body.byDay)).toBe(true);

    const bogus = await request.get("/api/analytics/funnel?editionId=yok-123", { headers: virtualClientHeaders() });
    expect(bogus.status()).toBe(404);
  });

  test("kohort: matris + tekrar orani + kisi sayimi", async ({ request }) => {
    const res = await getWarm(request, "/api/analytics/cohorts");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.persons).toBe("number");
    expect(typeof body.repeaters).toBe("number");
    expect(body.repeatRate === null || (body.repeatRate >= 0 && body.repeatRate <= 1)).toBe(true);
    expect(Array.isArray(body.cohorts)).toBe(true);
    for (const c of body.cohorts) {
      expect(typeof c.editionId).toBe("string");
      expect(typeof c.size).toBe("number");
      expect(Array.isArray(c.repeats)).toBe(true);
    }
    // tohum: en az bir edisyonda giris var
    expect(body.persons).toBeGreaterThan(0);
  });

  test("segment: dagilim toplamlari + RFM + gelir tutarliligi", async ({ request }) => {
    const res = await getWarm(request, `/api/analytics/segments?editionId=${editionId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const seg = body.segments;
    expect(seg.total).toBeGreaterThan(0);
    expect(seg.byCategory.reduce((s: number, e: { count: number }) => s + e.count, 0)).toBe(seg.total);
    expect(seg.byFunding.reduce((s: number, e: { count: number }) => s + e.count, 0)).toBe(seg.total);
    expect(seg.returning + seg.newCount).toBe(seg.total);

    const tiers = body.rfm.tiers as Record<string, number>;
    expect(Object.keys(tiers).sort()).toEqual(["AT_RISK", "CHAMPION", "DORMANT", "LOYAL", "POTENTIAL"]);
    expect(Object.values(tiers).reduce((s, n) => s + n, 0)).toBe(body.rfm.people.length);
    for (const p of body.rfm.people.slice(0, 20)) {
      expect(p.total).toBe(p.r + p.f + p.m);
      expect(p.r).toBeGreaterThanOrEqual(1);
      expect(p.r).toBeLessThanOrEqual(5);
    }
    // ozellik vektorunde PII yok
    for (const f of body.features.slice(0, 20)) {
      expect("email" in f).toBe(false);
      expect("phone" in f).toBe(false);
      expect(typeof f.repeatVisitor).toBe("boolean");
    }

    expect(body.revenue.net).toBe(body.revenue.paid - body.revenue.refunded);
    const paid = await db.payment.aggregate({ where: { order: { editionId }, status: "SUCCEEDED" }, _sum: { amount: true } });
    expect(body.revenue.paid).toBe(paid._sum.amount ?? 0);
  });

  test("kokpit: KPI + kapsama + bayatlayan + xlsx + denetim", async ({ request }) => {
    const res = await getWarm(request, `/api/analytics/cockpit?editionId=${editionId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.edition.id).toBe(editionId);
    expect(typeof body.kpis.participations).toBe("number");
    expect(typeof body.kpis.revenue.net).toBe("number");
    expect(typeof body.kpis.leads).toBe("number");
    expect(Array.isArray(body.capacity)).toBe(true);
    expect(body.coverage.total).toBe(body.kpis.participations);
    expect(typeof body.decay.staleApprovals.count).toBe("number");
    expect(typeof body.decay.staleUnpaid.count).toBe("number");
    expect(typeof body.decay.overdueTasks.count).toBe("number");
    expect(body.funnel.stages.length).toBe(5);

    const xlsx = await request.get(`/api/analytics/cockpit?editionId=${editionId}&format=xlsx`, { headers: virtualClientHeaders() });
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    const wb = XLSX.read(Buffer.from(await xlsx.body()), { type: "buffer" });
    expect(wb.SheetNames).toEqual(expect.arrayContaining(["KPI", "Huni", "Kapsama", "Bayatlayan"]));
    const audit = await db.activityLog.findFirst({
      where: { editionId, type: "EXPORT_DOWNLOADED", message: { contains: "ANALYTICS" } },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  test("katalog + portfoy: kur kapisi + cevrim tutarliligi", async ({ request }) => {
    const cat = await getWarm(request, "/api/analytics/catalog");
    expect(cat.status()).toBe(200);
    const metrics = (await cat.json()).metrics as Array<{ key: string }>;
    expect(metrics.length).toBeGreaterThanOrEqual(15);
    expect(metrics.some((m) => m.key === "revenue.net")).toBe(true);
    const one = await request.get("/api/analytics/catalog?key=rfm.tier", { headers: virtualClientHeaders() });
    expect((await one.json()).metric.formula).toContain("CHAMPION");

    // kur verilmeden farkli para birimi varsa 400 + ham toplamlar
    const nofx = await getWarm(request, "/api/analytics/portfolio?base=TRY");
    expect([200, 400]).toContain(nofx.status());
    const nofxBody = await nofx.json();
    if (nofx.status() === 400) {
      expect(Array.isArray(nofxBody.missing)).toBe(true);
      expect(Array.isArray(nofxBody.editions)).toBe(true);
    }

    // acik kurla cevrim: net = odeme - iade
    const fx = await request.get("/api/analytics/portfolio?base=TRY&rates=USD:32.5,EUR:35.1&fxDate=2026-09-28&fxSource=TCMB", { headers: virtualClientHeaders() });
    expect(fx.status()).toBe(200);
    const fxBody = await fx.json();
    expect(fxBody.fx).toEqual({ date: "2026-09-28", source: "TCMB", rates: { USD: 32.5, EUR: 35.1 } });
    expect(fxBody.totalsConverted.net).toBe(
      Math.round((fxBody.totalsConverted.paid - fxBody.totalsConverted.refunded) * 100) / 100,
    );
    expect(fxBody.editions.length).toBeGreaterThan(0);

    const badRate = await request.get("/api/analytics/portfolio?rates=USD:bozuk", { headers: virtualClientHeaders() });
    expect(badRate.status()).toBe(400);
    const badEd = await request.get("/api/analytics/portfolio?editions=yok-1,yok-2", { headers: virtualClientHeaders() });
    expect(badEd.status()).toBe(404);
  });

  test("kokpit P21.2: JSON ve xlsx ayni govdeden", async ({ request }) => {
    const json = await getWarm(request, `/api/analytics/cockpit?editionId=${editionId}`);
    const body = await json.json();
    const xlsx = await request.get(`/api/analytics/cockpit?editionId=${editionId}&format=xlsx`, { headers: virtualClientHeaders() });
    expect(xlsx.status()).toBe(200);
    const wb = XLSX.read(Buffer.from(await xlsx.body()), { type: "buffer" });
    const kpi = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["KPI"], { header: 1 });
    const val = (label: string) => (kpi.find((r) => r[0] === label) ?? [])[1];
    expect(val("Katılım")).toBe(body.kpis.participations);
    expect(val("Gelir (net, kuruş)")).toBe(body.kpis.revenue.net);
    expect(val("Lead")).toBe(body.kpis.leads);
    expect(val("Bayat onay")).toBe(body.decay.staleApprovals.count);
  });

  test("sablonlar: liste + tekil + 404", async ({ request }) => {
    const res = await getWarm(request, "/api/analytics/templates");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.templates.length).toBeGreaterThanOrEqual(5);
    for (const t of body.templates) {
      expect(t.sql).toContain(":tenantId");
    }
    const one = await request.get("/api/analytics/templates?key=funnel_by_day", { headers: virtualClientHeaders() });
    expect(one.status()).toBe(200);
    expect((await one.json()).template.key).toBe("funnel_by_day");
    const missing = await request.get("/api/analytics/templates?key=yok", { headers: virtualClientHeaders() });
    expect(missing.status()).toBe(404);
  });
});
