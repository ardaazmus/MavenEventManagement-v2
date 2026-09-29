import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { slugifyTenant, validateTenantName } from "../src/lib/tenant-slug.ts";

// ONBOARD regresyon kilitleri: sıfır-veri onboarding'i + seed atomikliği.
// Davranış testleri gerçek modülü import eder (kopya mantık YOK); rota/tx
// sözleşmeleri kaynak-taramasıyla kilitlenir (tsx/route node'a import edilemez).

const read = (p) => fs.readFileSync(path.resolve(p), "utf8");

test("ONB-1 - slugifyTenant TR harfleri çevirir, boşta varsayılan verir", () => {
  assert.equal(slugifyTenant("Sıfır Kanıt A.Ş."), "sifir-kanit-a-s");
  assert.equal(slugifyTenant("No-Dig Türkiye Derneği"), "no-dig-turkiye-dernegi");
  assert.equal(slugifyTenant(""), "kurulus");
  assert.equal(slugifyTenant("!!!"), "kurulus");
  assert.equal(slugifyTenant("  Çok   Boşluklu  Ad "), "cok-bosluklu-ad");
});

test("ONB-2 - slugifyTenant en fazla 60 karakter, küçük harf, uç çizgisiz", () => {
  const slug = slugifyTenant("A".repeat(100));
  assert.equal(slug.length, 60);
  assert.match(slug, /^[a-z0-9-]+$/);
  assert.ok(!slug.startsWith("-") && !slug.endsWith("-"));
});

test("ONB-3 - validateTenantName sözleşmesi (tip/uzunluk/normalizasyon)", () => {
  assert.deepEqual(validateTenantName(undefined), { ok: false, error: "Kuruluş adı zorunludur" });
  assert.deepEqual(validateTenantName(42), { ok: false, error: "Kuruluş adı zorunludur" });
  assert.equal(validateTenantName("x").ok, false);
  assert.equal(validateTenantName("y".repeat(81)).ok, false);
  assert.deepEqual(validateTenantName("  A   B  "), { ok: true, value: "A B" });
  assert.deepEqual(validateTenantName("AB"), { ok: true, value: "AB" });
});

test("ONB-4 - ensure rotası: idempotent + korumalı + guard'sız (kök kayıt)", () => {
  const src = read("src/app/api/tenant/ensure/route.ts");
  assert.match(src, /findFirst/, "önce mevcut kuruluş aranmalı");
  assert.match(src, /created: false/, "mevcutsa created:false dönmeli");
  assert.match(src, /status: 201/, "yeni kayıtta 201 dönmeli");
  assert.match(src, /enforceRateLimit/, "hız sınırı olmalı");
  assert.match(src, /requireAdmin\(\)/, "admin kapısı olmalı");
  assert.ok(!/from\s+["'][^"']*tenant-guard["']/.test(src), "kök kayıt guard MODÜLÜNÜ import ETMEZ (guard tenant ister)");
  assert.ok(!src.includes("applyWriteGuard") && !src.includes("resolveContext"), "kök kayıt guard çağrısı YAPMAZ");
  assert.ok(!src.includes("Math.random().toString(36)") || src.includes("raced"),
    "eşzamanlı çift-gönderim yeniden-okumayla idempotent kalmalı");
});

test("ONB-5 - seed atomik: tek tx, tx-dışı model erişimi yok", () => {
  const src = read("src/app/api/seed/route.ts");
  const txOpens = [...src.matchAll(/db\.\$transaction\(async \(tx\)/g)];
  assert.equal(txOpens.length, 1, "tek $transaction sarmalı olmalı");
  assert.match(src, /\}, \{ timeout: 300_000, maxWait: 60_000 \}\)/, "tx bütçesi kilitli olmalı");
  // tx-dışı TÜM db erişimleri yasak — istisna: tx'i açan çağrı + import satırı
  const bare = [...src.matchAll(/\bdb\./g)].filter((m) => {
    const line = src.slice(Math.max(0, m.index - 80), m.index + 30);
    return !line.includes("db.$transaction") && !line.includes('from "@/lib/db"');
  });
  assert.equal(bare.length, 0, `tx-dışı db erişimi: ${bare.map((m) => src.slice(m.index, m.index + 24)).join(" | ")}`);
  assert.match(src, /async function wipe\(tx: DbTx\)/, "wipe tx almalı");
  assert.match(src, /seedSystemRoles\(tx\)/, "roller tx'e katılmalı");
  assert.match(src, /client: tx as unknown as DbTx/, "zincir/klasör helper'ları tx'e katılmalı");
});

test("ONB-6 - withTenant GuardError fırlatır, [entity] dış catch'i taşır", () => {
  const reg = read("src/lib/api/registry.ts");
  assert.match(reg, /throw new GuardError\("Kiracı \(tenant\) bulunamadı/, "withTenant GuardError(400) fırlatmalı");
  const post = read("src/app/api/[entity]/route.ts");
  assert.match(post, /const ge = guardError\(e\);\s*if \(ge\) return ge;/, "dış catch GuardError iletisini korumalı");
});

test("ONB-7 - boş-ekran çift CTA + sihirbaz org paneli mevcut", () => {
  const shell = read("src/components/maven/shell.tsx");
  assert.match(shell, /shell\.onboardStart/, "birincil CTA (kuruluş) olmalı");
  assert.match(shell, /\/api\/tenant\/ensure/, "kabuk ensure çağırmalı");
  const ed = read("src/components/maven/views/editions.tsx");
  assert.match(ed, /needOrg === true/, "sihirbaz org paneli koşulu olmalı");
  assert.match(ed, /editionWizardNonce/, "kabuk→sihirbaz köprüsü olmalı");
  for (const f of ["src/i18n/tr.json", "src/i18n/en.json"]) {
    const j = JSON.parse(read(f));
    for (const k of ["orgTitle", "orgDesc", "orgNameLabel", "orgContinue", "orgNeeded"]) {
      assert.ok(j.editions?.[k], `${f} editions.${k} eksik`);
    }
    assert.ok(j.shell?.onboardStart, `${f} shell.onboardStart eksik`);
  }
});
