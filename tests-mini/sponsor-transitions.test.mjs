import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const libPath = path.resolve("src/lib/sponsorship/transitions.ts");

const ALL = ["PROSPECT", "NEGOTIATION", "CONTRACTED", "ACTIVE", "COMPLETED", "CANCELLED"];

test("P08.1 - canTransition: ileri akış serbest, yan çıkışlar serbest", async () => {
  const { canTransition } = await import(pathToFileURL(libPath).href);
  const ctx = { actorMaxRank: 50, signedAt: "2026-01-01" };

  assert.strictEqual(canTransition("PROSPECT", "NEGOTIATION", ctx).allowed, true);
  assert.strictEqual(canTransition("NEGOTIATION", "CONTRACTED", ctx).allowed, true);
  assert.strictEqual(canTransition("CONTRACTED", "ACTIVE", ctx).allowed, true);
  assert.strictEqual(canTransition("ACTIVE", "COMPLETED", ctx).allowed, true);

  for (const from of ["PROSPECT", "NEGOTIATION", "CONTRACTED", "ACTIVE"]) {
    const r = canTransition(from, "CANCELLED", { actorMaxRank: 50, reason: "vazgeçti" });
    assert.strictEqual(r.allowed, true, `${from}→CANCELLED gerekçeyle serbest olmalı`);
  }
});

test("P08.1 - canTransition: atlamalar yasak, geri dönüşler reopen+rank ister", async () => {
  const { canTransition } = await import(pathToFileURL(libPath).href);

  // Atlayan ileri geçişler yasak
  assert.strictEqual(canTransition("PROSPECT", "CONTRACTED", { actorMaxRank: 100, signedAt: "2026-01-01" }).allowed, false);
  assert.strictEqual(canTransition("PROSPECT", "ACTIVE", { actorMaxRank: 100 }).allowed, false);
  assert.strictEqual(canTransition("NEGOTIATION", "ACTIVE", { actorMaxRank: 100 }).allowed, false);

  // Geri geçişler: gerekçe + rütbe ≥50 (reopen)
  assert.strictEqual(canTransition("NEGOTIATION", "PROSPECT", { actorMaxRank: 50 }).allowed, false, "gerekçesiz geri dönüş yasak");
  assert.strictEqual(canTransition("NEGOTIATION", "PROSPECT", { actorMaxRank: 50, reason: "teklif reddedildi" }).allowed, true);
  assert.strictEqual(canTransition("NEGOTIATION", "PROSPECT", { actorMaxRank: 10, reason: "x" }).allowed, false, "düşük rütbe reopen yapamaz");
  assert.strictEqual(canTransition("ACTIVE", "CONTRACTED", { actorMaxRank: 50, reason: "sözleşme revizyonu" }).allowed, true);
  assert.strictEqual(canTransition("COMPLETED", "ACTIVE", { actorMaxRank: 50, reason: "yanlış kapatma" }).allowed, true);

  // CANCELLED yalnız reopen ile dirilir
  assert.strictEqual(canTransition("CANCELLED", "PROSPECT", { actorMaxRank: 50 }).allowed, false);
  assert.strictEqual(canTransition("CANCELLED", "PROSPECT", { actorMaxRank: 50, reason: "yeniden görüşme" }).allowed, true);
  assert.strictEqual(canTransition("CANCELLED", "NEGOTIATION", { actorMaxRank: 50, reason: "yeniden görüşme" }).allowed, true);
  assert.strictEqual(canTransition("CANCELLED", "ACTIVE", { actorMaxRank: 100, reason: "x" }).allowed, false, "iptalden ileri atlama yasak");

  // COMPLETED terminal değil ama ileri çıkışı yok
  assert.strictEqual(canTransition("COMPLETED", "CANCELLED", { actorMaxRank: 50, reason: "x" }).allowed, false);
});

test("P08.1 - canTransition: CONTRACTED imza kanıtı ister; CANCELLED gerekçe ister", async () => {
  const { canTransition } = await import(pathToFileURL(libPath).href);

  assert.strictEqual(canTransition("NEGOTIATION", "CONTRACTED", { actorMaxRank: 50 }).allowed, false, "signedAt olmadan CONTRACTED yasak");
  const r = canTransition("NEGOTIATION", "CONTRACTED", { actorMaxRank: 50 });
  assert.match(r.error ?? "", /signedAt|imza/i);

  assert.strictEqual(canTransition("PROSPECT", "CANCELLED", { actorMaxRank: 50 }).allowed, false, "gerekçesiz iptal yasak");
  assert.match(canTransition("PROSPECT", "CANCELLED", { actorMaxRank: 50 }).error ?? "", /gerekçe/i);

  // Aynı duruma geçiş no-op kabul
  assert.strictEqual(canTransition("ACTIVE", "ACTIVE", { actorMaxRank: 10 }).allowed, true);
});

test("P08.1 - full matrix: 36 çiftin tamamı tanımlı, tanımsız çift yok", async () => {
  const { canTransition } = await import(pathToFileURL(libPath).href);
  const allowed = [];
  for (const from of ALL) {
    for (const to of ALL) {
      const r = canTransition(from, to, { actorMaxRank: 100, reason: "matrix", signedAt: "2026-01-01" });
      assert.ok(typeof r.allowed === "boolean" && (r.allowed || typeof r.error === "string"), `${from}→${to} tanımlı olmalı`);
      if (r.allowed) allowed.push(`${from}→${to}`);
    }
  }
  // Beklenen izinli küme (no-op 6 + ileri 4 + iptal 4 + reopen geri dönüşler)
  const expected = new Set([
    "PROSPECT→PROSPECT", "NEGOTIATION→NEGOTIATION", "CONTRACTED→CONTRACTED",
    "ACTIVE→ACTIVE", "COMPLETED→COMPLETED", "CANCELLED→CANCELLED",
    "PROSPECT→NEGOTIATION", "NEGOTIATION→CONTRACTED", "CONTRACTED→ACTIVE", "ACTIVE→COMPLETED",
    "PROSPECT→CANCELLED", "NEGOTIATION→CANCELLED", "CONTRACTED→CANCELLED", "ACTIVE→CANCELLED",
    "NEGOTIATION→PROSPECT", "CONTRACTED→NEGOTIATION", "ACTIVE→CONTRACTED", "COMPLETED→ACTIVE",
    "CANCELLED→PROSPECT", "CANCELLED→NEGOTIATION",
  ]);
  assert.deepStrictEqual(new Set(allowed), expected);
});
