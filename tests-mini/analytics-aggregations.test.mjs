import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const aggLib = path.resolve("src/lib/analytics/aggregations.ts");
const featLib = path.resolve("src/lib/analytics/features.ts");

test("P21.1 - huni: asama sayim + oran + kategori/gun kirilimi", async () => {
  const { buildFunnel } = await import(pathToFileURL(aggLib).href);
  const rows = [
    { participationId: "a", categoryCode: "REG", submittedDay: "2026-09-01", submitted: true, confirmed: true, paid: true, checkedIn: true },
    { participationId: "b", categoryCode: "REG", submittedDay: "2026-09-01", submitted: true, confirmed: true, paid: false, checkedIn: false },
    { participationId: "c", categoryCode: "STU", submittedDay: "2026-09-02", submitted: true, confirmed: false, paid: false, checkedIn: false },
    { participationId: "d", categoryCode: null, submittedDay: null, submitted: false, confirmed: false, paid: false, checkedIn: false },
    // cift satir tekillenir
    { participationId: "a", categoryCode: "REG", submittedDay: "2026-09-01", submitted: true, confirmed: true, paid: true, checkedIn: true },
  ];
  const f = buildFunnel(rows);
  assert.strictEqual(f.total, 4);
  assert.deepStrictEqual(f.stages.map((s) => s.count), [4, 3, 2, 1, 1]);
  assert.deepStrictEqual(f.stages.map((s) => s.rate), [null, 0.75, 0.6667, 0.5, 1]);
  assert.deepStrictEqual(f.byCategory, [
    { code: "REG", total: 2, confirmed: 2, paid: 1, checkedIn: 1 },
    { code: "STU", total: 1, confirmed: 0, paid: 0, checkedIn: 0 },
    { code: "UNCATEGORIZED", total: 1, confirmed: 0, paid: 0, checkedIn: 0 },
  ]);
  assert.deepStrictEqual(f.byDay, [
    { day: "2026-09-01", submitted: 2, confirmed: 2, paid: 1, checkedIn: 1 },
    { day: "2026-09-02", submitted: 1, confirmed: 0, paid: 0, checkedIn: 0 },
  ]);
  const empty = buildFunnel([]);
  assert.deepStrictEqual(empty.stages.map((s) => s.rate), [null, null, null, null, null]);
});

test("P21.2 - kohort: ilk edisyon + tekrar matrisi + oran", async () => {
  const { buildCohorts } = await import(pathToFileURL(aggLib).href);
  const editions = [
    { id: "e1", name: "Fuar 24", startMs: 1000 },
    { id: "e2", name: "Fuar 25", startMs: 2000 },
    { id: "e3", name: "Fuar 26", startMs: 3000 },
  ];
  const pairs = [
    { personId: "p1", editionId: "e1" }, { personId: "p1", editionId: "e2" }, { personId: "p1", editionId: "e3" },
    { personId: "p2", editionId: "e1" },
    { personId: "p3", editionId: "e2" }, { personId: "p3", editionId: "e3" },
    { personId: "p4", editionId: "e3" },
    { personId: "p1", editionId: "e1" }, // cift tarama tekillenir
    { personId: "px", editionId: "yabanci" }, // bilinmeyen edisyon duser
  ];
  const c = buildCohorts(pairs, editions);
  assert.strictEqual(c.persons, 4);
  assert.strictEqual(c.repeaters, 2);
  assert.strictEqual(c.repeatRate, 0.5);
  assert.strictEqual(c.cohorts.length, 3);
  assert.deepStrictEqual(c.cohorts[0], {
    editionId: "e1", editionName: "Fuar 24", size: 2,
    repeats: [
      { editionId: "e2", editionName: "Fuar 25", count: 1 },
      { editionId: "e3", editionName: "Fuar 26", count: 1 },
    ],
  });
  assert.deepStrictEqual(c.cohorts[1].repeats, [{ editionId: "e3", editionName: "Fuar 26", count: 1 }]);
  assert.deepStrictEqual(c.cohorts[2].repeats, []);
});

test("P21.3 - RFM: esik skorlari + katman dagilimi", async () => {
  const { scoreRfm } = await import(pathToFileURL(aggLib).href);
  const now = Date.UTC(2026, 8, 28);
  const day = 86_400_000;
  const rows = [
    { personId: "champ", lastPaidAtMs: now - 2 * day, paidCount: 6, paidTotal: 600000 }, // 5+5+5=15
    { personId: "loyal", lastPaidAtMs: now - 20 * day, paidCount: 3, paidTotal: 200000 }, // 4+4+4=12
    { personId: "pot", lastPaidAtMs: now - 60 * day, paidCount: 2, paidTotal: 50000 }, // 3+3+3=9
    { personId: "risk", lastPaidAtMs: now - 200 * day, paidCount: 1, paidTotal: 1000 }, // 1+2+2=5
    { personId: "dorm", lastPaidAtMs: null, paidCount: 0, paidTotal: 0 }, // 1+1+1=3
  ];
  const r = scoreRfm(rows, now);
  assert.deepStrictEqual(r.tiers, { CHAMPION: 1, LOYAL: 1, POTENTIAL: 1, AT_RISK: 1, DORMANT: 1 });
  assert.deepStrictEqual(r.people.map((p) => [p.personId, p.total, p.tier]), [
    ["champ", 15, "CHAMPION"],
    ["loyal", 12, "LOYAL"],
    ["pot", 9, "POTENTIAL"],
    ["risk", 5, "AT_RISK"],
    ["dorm", 3, "DORMANT"],
  ]);
});

test("P21.3 - segmentler: kategori/fon/rol + yeni/geri donen", async () => {
  const { buildSegments } = await import(pathToFileURL(aggLib).href);
  const s = buildSegments([
    { categoryCode: "REG", fundingSource: "SELF_PAID", roles: ["ATTENDEE"], returning: false },
    { categoryCode: "REG", fundingSource: "SPONSOR_ENTITLEMENT", roles: ["ATTENDEE", "VIP"], returning: true },
    { categoryCode: null, fundingSource: null, roles: [], returning: false },
  ]);
  assert.strictEqual(s.total, 3);
  assert.deepStrictEqual(s.byCategory, [
    { code: "REG", count: 2 },
    { code: "UNCATEGORIZED", count: 1 },
  ]);
  assert.deepStrictEqual(s.byFunding, [
    { source: "SELF_PAID", count: 1 },
    { source: "SPONSOR_ENTITLEMENT", count: 1 },
    { source: "UNKNOWN", count: 1 },
  ]);
  assert.deepStrictEqual(s.byRole, [
    { role: "ATTENDEE", count: 2 },
    { role: "VIP", count: 1 },
  ]);
  assert.strictEqual(s.returning, 1);
  assert.strictEqual(s.newCount, 2);
});

test("P21.4 - benchmark K-anonimlik + portfoy cevrim kurallari", async () => {
  const { buildBenchmark, convertRevenue } = await import(pathToFileURL(aggLib).href);

  const groups = buildBenchmark([
    { orgId: "o1", group: "Gold", value: 10 },
    { orgId: "o2", group: "Gold", value: 20 },
    { orgId: "o3", group: "Gold", value: 30 },
    { orgId: "o4", group: "Gold", value: 40 },
    { orgId: "o5", group: "Gold", value: 50 },
    { orgId: "o6", group: "Silver", value: 100 },
    { orgId: "o7", group: "Silver", value: 200 },
  ]);
  const gold = groups.find((g) => g.group === "Gold");
  assert.strictEqual(gold.suppressed, false);
  assert.strictEqual(gold.avg, 30);
  assert.strictEqual(gold.median, 30);
  assert.strictEqual(gold.p90, 50);
  assert.strictEqual(gold.max, 50);
  const silver = groups.find((g) => g.group === "Silver");
  assert.strictEqual(silver.suppressed, true);
  assert.strictEqual(silver.orgCount, 2);
  assert.strictEqual(silver.avg, null);
  assert.strictEqual(silver.max, null);

  // K tabani 3'un altina inmez
  const low = buildBenchmark([{ orgId: "o1", group: "G", value: 5 }], 1);
  assert.strictEqual(low[0].suppressed, true);

  const fx = convertRevenue(
    [{ currency: "TRY", amount: 100 }, { currency: "USD", amount: 10 }, { currency: "usd", amount: 5 }],
    { USD: 32.5 },
    "TRY",
  );
  assert.deepStrictEqual(fx, { converted: 100 + 15 * 32.5, missing: [] });
  const miss = convertRevenue([{ currency: "EUR", amount: 7 }], { USD: 32.5 }, "TRY");
  assert.deepStrictEqual(miss.missing, ["EUR"]);
  const bad = convertRevenue([{ currency: "USD", amount: 7 }], { USD: 0 }, "TRY");
  assert.deepStrictEqual(bad.missing, ["USD"]);
});

test("P21.1 - metrik katalogu: tekil anahtar + zorunlu alanlar", async () => {
  const catalogLib = path.resolve("src/lib/analytics/catalog.ts");
  const { METRIC_CATALOG } = await import(pathToFileURL(catalogLib).href);
  assert.ok(METRIC_CATALOG.length >= 15);
  const keys = METRIC_CATALOG.map((m) => m.key);
  assert.deepStrictEqual([...new Set(keys)], keys);
  for (const m of METRIC_CATALOG) {
    for (const f of ["key", "name", "formula", "grain", "source", "timezone", "freshness", "owner"]) {
      assert.ok(typeof m[f] === "string" && m[f].length > 0, `${m.key}.${f} dolu olmali`);
    }
  }
  const byKey = Object.fromEntries(METRIC_CATALOG.map((m) => [m.key, m]));
  assert.ok(byKey["revenue.net"]);
  assert.ok(byKey["benchmark.tier"]);
  assert.ok(byKey["funnel.by_day"].timezone.length > 0);
});

test("P21.4 - kapsama + ozellik vektoru + SQL kilitleri", async () => {
  const { buildCoverage } = await import(pathToFileURL(aggLib).href);
  const { buildPersonFeatures, SQL_TEMPLATES } = await import(pathToFileURL(featLib).href);

  const c = buildCoverage([
    { hasEmail: true, hasPhone: false, hasCompany: true, hasCategory: true, hasBadge: true },
    { hasEmail: false, hasPhone: false, hasCompany: false, hasCategory: false, hasBadge: false },
  ]);
  assert.strictEqual(c.total, 2);
  assert.strictEqual(c.email, 1);
  assert.strictEqual(c.emailRate, 0.5);
  assert.strictEqual(c.badgedRate, 0.5);

  const f = buildPersonFeatures({
    personId: "p1", editionCount: 2, daysSinceFirstSeen: 400, paidTotal: 1500.9, paidCount: 1,
    daysSinceLastPaid: 3, leadCount: 1, meetingCount: 0, isStaff: false, isSpeaker: true,
    isVip: false, daysToEventAtSubmit: 12,
  });
  assert.strictEqual(f.paidTotal, 1500);
  assert.strictEqual(f.repeatVisitor, true);
  assert.strictEqual(f.payer, true);
  assert.ok(!("email" in f) && !("phone" in f), "ozellik vektorunde PII yok");

  assert.ok(SQL_TEMPLATES.length >= 5);
  for (const t of SQL_TEMPLATES) {
    assert.ok(t.sql.includes(":tenantId"), `${t.key} kiracı filtresi taşımalı`);
    assert.ok(!/select\s+\*/i.test(t.sql), `${t.key} SELECT * yasak`);
  }
  const keys = SQL_TEMPLATES.map((t) => t.key);
  assert.deepStrictEqual([...new Set(keys)], keys, "şablon anahtarları tekil");
});
