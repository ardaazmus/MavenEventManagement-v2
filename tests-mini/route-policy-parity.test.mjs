import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const scriptPath = path.resolve("scripts/route-policy.mjs");

// N-08: ENVANTER–KOD EŞİTLİĞİ — enforcement iddiası kaynakta karşılık bulmalı.
// policy:check yalnız sözlüğü doğrular; bu test her "requireStaff()/requireAdmin()/
// authorize*" iddiasının rota dosyasında GERÇEK bir kapı çağrısı olduğunu kilitler.
// Kapısız kalan authRequired rota → test düşer (envanter asla yalan söyleyemez).

// rol/oturum/belirteç kapısı sayılan kaynak belirteçleri
const GUARD_TOKENS = [
  "requireStaff",
  "requireAdmin",
  "requireSuperAdmin",
  "requireAuthEnabled",
  "authorizeEntity",
  "authorizeDualRead",
  "authorizeFlowAction",
  "requestActor",
  "STAFF_ROLES",
  "ADMIN_ROLES",
  "verifyDownloadToken",
  "verifyMediaDownloadToken",
  "verifySignature",
  "verifyChallenge",
  "checkSponsorScope",
];

// bilinçli kapısız rotalar (oturum-özel tasarım + metin iddiasız) — gerekçeli izinli liste.
// Bu listedeki bir rota "require*/authorize*" İDDİA EDERSE test düşer (metin de yalan söyleyemez).
const SESSION_ONLY_ALLOWLIST = new Map([
  ["src/app/api/bootstrap/route.ts", "SPA kabuğu ilk yükü — tüm oturum rolleri (VIEWER dahil)"],
  ["src/app/api/account/theme/route.ts", "oturum sahibinin çerez tercihi — rol ayrımı yok"],
  ["src/app/api/internal/bus-authorize/route.ts", "session + tenant/edisyon sahipliği, PII yanıtsız"],
]);

const CLAIM_PATTERN = /requireStaff|requireAdmin|requireSuperAdmin|authorize|four-eyes|signed dispatch/i;

async function loadDefinitions() {
  const mod = await import(pathToFileURL(scriptPath).href);
  return mod.ROUTE_POLICY_DEFINITIONS;
}

test("N-08 - require*/authorize* iddiası olan HER rota dosyasında kapı çağrısı var", async () => {
  const defs = await loadDefinitions();
  const violations = [];
  let checked = 0;
  for (const [file, def] of Object.entries(defs)) {
    if (!def.authRequired) continue;
    if (!CLAIM_PATTERN.test(def.enforcement ?? "")) continue;
    checked++;
    const src = fs.readFileSync(path.resolve(file), "utf8");
    if (!GUARD_TOKENS.some((t) => src.includes(t))) {
      violations.push(`${file} :: iddia "${def.enforcement}" ama kodda kapı yok`);
    }
  }
  assert.ok(checked > 100, `beklenen iddia sayısı çok düşük: ${checked}`);
  assert.deepStrictEqual(violations, [], `envanter–kod uyumsuzluğu:\n${violations.join("\n")}`);
});

test("N-08 - izinli listedekiler require*/authorize* İDDİA EDEMEZ", async () => {
  const defs = await loadDefinitions();
  for (const [file, reason] of SESSION_ONLY_ALLOWLIST) {
    const def = defs[file];
    assert.ok(def, `envanterde yok: ${file}`);
    assert.ok(
      !CLAIM_PATTERN.test(def.enforcement ?? ""),
      `${file} izinli listede ama metin kapı iddia ediyor: "${def.enforcement}" (${reason})`,
    );
  }
});

test("N-08 - izinli liste dışı TÜM authRequired rotalarda kapı belirteci var", async () => {
  const defs = await loadDefinitions();
  const violations = [];
  for (const [file, def] of Object.entries(defs)) {
    if (!def.authRequired) continue;
    if (SESSION_ONLY_ALLOWLIST.has(file)) continue;
    const src = fs.readFileSync(path.resolve(file), "utf8");
    if (!GUARD_TOKENS.some((t) => src.includes(t))) violations.push(file);
  }
  assert.deepStrictEqual(violations, [], `kapısız authRequired rota:\n${violations.join("\n")}`);
});
