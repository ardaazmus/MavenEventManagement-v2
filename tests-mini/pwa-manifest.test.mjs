import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildPortalManifest,
  PORTAL_MANIFEST_DEFAULTS,
} from "../src/lib/portal-manifest.ts";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pub = (p) => path.join(ROOT, "public", p);

// PWA denetimi: kurulum + çevrimdışı regresyon kilitleri.

// ── manifest üretici (saf birim) ──

test("PWA-1 - start_url/id gerçek portal yüzeyidir (/?portal=<slug>)", () => {
  const m = buildPortalManifest({ editionSlug: "no-dig-2026", name: "No-Dig 2026" });
  assert.strictEqual(m.start_url, "/?portal=no-dig-2026");
  assert.strictEqual(m.id, "/?portal=no-dig-2026");
  assert.strictEqual(m.scope, "/");
  assert.strictEqual(m.display, "standalone");
});

test("PWA-1 - slug URL-kodlanır", () => {
  const m = buildPortalManifest({ editionSlug: "a b/c", name: "X" });
  assert.strictEqual(m.start_url, "/?portal=" + encodeURIComponent("a b/c"));
});

test("PWA-1 - ad + kısa ad", () => {
  const m = buildPortalManifest({ editionSlug: "s", name: "No-Dig Turkey 2026" });
  assert.ok(m.name.includes("No-Dig Turkey 2026"));
  assert.ok(!/\d{4}/.test(m.short_name));
  assert.ok(m.short_name.length <= 24);
  const explicit = buildPortalManifest({ editionSlug: "s", name: "N", shortName: "Özel" });
  assert.strictEqual(explicit.short_name, "Özel");
});

test("PWA-1 - theme_color doğrulanır, geçersizse varsayılan", () => {
  const ok = buildPortalManifest({ editionSlug: "s", name: "N", themeColor: "#123abc" });
  assert.strictEqual(ok.theme_color, "#123abc");
  const bad = buildPortalManifest({ editionSlug: "s", name: "N", themeColor: "javascript:alert(1)" });
  assert.strictEqual(bad.theme_color, PORTAL_MANIFEST_DEFAULTS.themeColor);
  const empty = buildPortalManifest({ editionSlug: "s", name: "N" });
  assert.strictEqual(empty.theme_color, PORTAL_MANIFEST_DEFAULTS.themeColor);
});

test("PWA-2 - ikonlar GERÇEK dosyalardır (192 + 512 + maskable)", () => {
  const m = buildPortalManifest({ editionSlug: "s", name: "N" });
  const sizes = m.icons.map((i) => `${i.sizes}:${i.purpose}`);
  assert.ok(sizes.includes("192x192:any"));
  assert.ok(sizes.includes("512x512:any"));
  assert.ok(sizes.includes("512x512:maskable"));
  for (const icon of m.icons) {
    assert.ok(fs.existsSync(pub(icon.src.slice(1))), `kayıp ikon: ${icon.src}`);
  }
});

// ── statik dosya sözleşmesi ──

test("PWA-2 - statik manifest geçerli + ikonları diskte", () => {
  const raw = fs.readFileSync(pub("manifest.webmanifest"), "utf8");
  const m = JSON.parse(raw);
  assert.strictEqual(m.start_url, "/");
  assert.ok(Array.isArray(m.icons) && m.icons.length >= 2);
  for (const icon of m.icons) {
    assert.ok(fs.existsSync(pub(String(icon.src).replace(/^\//, ""))), `kayıp ikon: ${icon.src}`);
  }
});

test("PWA-2 - ölü manifest.json KILITLIDIR (404 start_url + kayıp ikonlar)", () => {
  assert.ok(!fs.existsSync(pub("manifest.json")), "public/manifest.json geri gelmiş");
});

test("PWA-3 - SW sözdizimi geçerli (kayıt anında parse hatası yok)", () => {
  execFileSync(process.execPath, ["--check", pub("sw.js")], { stdio: "pipe" });
});

test("PWA-3 - SW tolerant precache: listedeki HER URL diskte var", () => {
  const sw = fs.readFileSync(pub("sw.js"), "utf8");
  assert.ok(!sw.includes("cache.addAll"), "atomik addAll geri gelmiş");
  const m = sw.match(/PRECACHE_URLS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(m, "PRECACHE_URLS bulunamadı");
  const urls = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.ok(urls.length > 0, "precache listesi boş");
  for (const u of urls) {
    assert.ok(u.startsWith("/"), `kök-dışı precache: ${u}`);
    assert.ok(!u.includes("?"), `sorgulu precache: ${u}`);
    assert.ok(fs.existsSync(pub(u.slice(1))), `precache 404 verir: ${u}`);
  }
});

test("PWA-4 - SW SKIP_WAITING dinler (güncelleme toast butonu çalışır)", () => {
  const sw = fs.readFileSync(pub("sw.js"), "utf8");
  assert.ok(sw.includes('addEventListener("message"'), "message dinleyici yok");
  assert.ok(sw.includes("SKIP_WAITING"), "SKIP_WAITING işlenmiyor");
});

test("PWA-5 - /api yanıtları önbelleğe YAZILMAZ (PII güvenliği)", () => {
  const sw = fs.readFileSync(pub("sw.js"), "utf8");
  assert.ok(sw.includes('startsWith("/api/")'), "/api istisnası yok");
});

test("PWA-6 - offline kabuğu diskte + SW fallback verir", () => {
  assert.ok(fs.existsSync(pub("offline.html")), "public/offline.html kayıp");
  const sw = fs.readFileSync(pub("sw.js"), "utf8");
  assert.ok(sw.includes("/offline.html"), "SW offline fallback vermiyor");
});
