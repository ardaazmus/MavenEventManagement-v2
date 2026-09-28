import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MODULES, MODULE_GROUPS } from "../src/lib/constants.ts";
import { MODULE_IDS, ENTITY_POLICY_MAP } from "../src/lib/api/permissions.ts";
import { SYSTEM_ROLE_DEFINITIONS } from "../scripts/seed-roles.mjs";
import { PORTAL_NAV_SCREENS } from "../src/lib/portal-nav.ts";

// MODÜL TUTARLILIK KAPISI (fitness function): yeni modül/özellik eklemek
// kayıtları bozmasın diye kayıtlar-arası sözleşmeler burada kilitlenir.
// Kural SAYIYA değil ŞEKLE bakar — yeni modül sayıyı büyütür, testi KIRMAMALI
// (sayı kilitleri bilinçli olarak >= ile büyüme-toleranslıdır).

const read = (p) => fs.readFileSync(path.resolve(p), "utf8");
// .tsx istemci dosyası node'a import edilemez — anahtarlar kaynak-taramasıyla okunur
const scanKeys = (src, re) => [...src.matchAll(re)].map((m) => m[1].replace(/["']/g, ""));
const tr = JSON.parse(read("src/i18n/tr.json"));
const en = JSON.parse(read("src/i18n/en.json"));

test("MC-1 - her UI modülünün bileşeni kayıtlıdır (kayıpsız render)", () => {
  const keys = scanKeys(read("src/lib/module-components.tsx"), /^  ("?[a-z0-9-]+"?): /gm);
  const missing = MODULES.map((m) => m.id).filter((id) => !keys.includes(id));
  assert.deepStrictEqual(missing, [], `bileşensiz modül: ${missing}`);
});

test("MC-2 - bileşen haritasında hayalet kayıt yoktur", () => {
  const keys = scanKeys(read("src/lib/module-components.tsx"), /^  ("?[a-z0-9-]+"?): /gm);
  const ids = new Set(MODULES.map((m) => m.id));
  assert.deepStrictEqual(keys.filter((k) => !ids.has(k)), [], "MODULES'ta olmayan bileşen kaydı");
});

test("MC-3 - modül adları iki dilde tamdır (modules.<id>)", () => {
  for (const m of MODULES) {
    assert.ok(tr.modules?.[m.id] !== undefined, `tr modules.${m.id} eksik`);
    assert.ok(en.modules?.[m.id] !== undefined, `en modules.${m.id} eksik`);
  }
});

test("MC-4 - yetki politikasındaki her modül kayıtlıdır", () => {
  const ids = new Set(MODULE_IDS);
  const bad = [...new Set(Object.values(ENTITY_POLICY_MAP).map((v) => v.module))].filter((m) => !ids.has(m));
  assert.deepStrictEqual(bad, [], `MODULE_IDS dışı modül: ${bad}`);
});

// Salt-UI/toplayıcı modüller (doğrudan entity'si yok) — BELGELENMİŞ izin listesi:
// dashboard (toplayıcı), archive (salt-okunur kasa), portals (yapılandırma UI),
// compliance (kasa+denetim), accounting (muhasebe dışa-aktarım UI).
const UI_ONLY_MODULES = new Set(["dashboard", "archive", "portals", "compliance", "accounting"]);

test("MC-5 - entity'siz modül yalnız belgelenmiş UI-only listesinden olabilir", () => {
  const used = new Set(Object.values(ENTITY_POLICY_MAP).map((v) => v.module));
  const orphans = MODULE_IDS.filter((id) => !used.has(id));
  assert.deepStrictEqual(orphans.filter((o) => !UI_ONLY_MODULES.has(o)), [], "listesiz entity'siz modül");
  assert.deepStrictEqual([...UI_ONLY_MODULES].filter((o) => used.has(o)).map(String), [], "UI-only listesi entity kazanmış — listeyi güncelle");
});

test("MC-6 - modül grup referansları + grup etiketleri geçerlidir", () => {
  const gids = new Set(MODULE_GROUPS.map((g) => g.id));
  assert.deepStrictEqual(MODULES.filter((m) => !gids.has(m.group)).map((m) => m.id), [], "geçersiz grup");
  for (const g of MODULE_GROUPS) {
    const key = g.labelKey.split(".")[1];
    assert.ok(tr.shell?.[key] !== undefined, `tr shell.${key} eksik`);
    assert.ok(en.shell?.[key] !== undefined, `en shell.${key} eksik`);
  }
});

test("MC-7 - rol tohumları yalnız kayıtlı modüllere yetki verir (kayıpsız)", () => {
  const ids = new Set(MODULE_IDS);
  const refs = new Set();
  for (const d of SYSTEM_ROLE_DEFINITIONS) for (const p of d.permissions ?? []) refs.add(p.module ?? p);
  assert.deepStrictEqual([...refs].filter((m) => !ids.has(m)), [], "kayıtsız modüle yetki");
  assert.deepStrictEqual(MODULE_IDS.filter((id) => !refs.has(id)), [], "hiçbir role verilmemiş modül");
});

test("MC-8 - portal widget anahtarları sunucu↔istemci eşleşir (sessiz-düşme yok)", () => {
  const content = read("src/app/api/portal/content/route.ts");
  const widgetBlock = content.slice(content.indexOf("const DEFAULT_WIDGETS"), content.indexOf("];", content.indexOf("const DEFAULT_WIDGETS")));
  const serverKeys = [...widgetBlock.matchAll(/\{ key: "([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.ok(serverKeys.length > 0, "sunucu widget anahtarı bulunamadı");
  const meta = read("src/components/maven/portal-app.tsx");
  const metaBlock = meta.slice(meta.indexOf("const WIDGET_META"), meta.indexOf("};", meta.indexOf("const WIDGET_META")));
  const clientKeys = [...metaBlock.matchAll(/^\s{4}([a-z0-9-]+): \{ label/gm)].map((m) => m[1]);
  assert.deepStrictEqual(serverKeys.filter((k) => !clientKeys.includes(k)), [], "istemcide metasız widget (sessiz düşer)");
  const interact = read("src/app/api/portal/interact/route.ts");
  const allow = interact.match(/const WIDGET_KEYS = new Set\(\[([^\]]*)\]\)/)[1];
  assert.deepStrictEqual(serverKeys.filter((k) => !allow.includes(`"${k}"`)), [], "tıklama-izinlistesinde yok");
});

test("MC-9 - portal chrome beyaz-listesi ekran kümesiyle birebirdir", () => {
  const cfg = read("src/app/api/portal/config/route.ts");
  const chrome = new Set(cfg.match(/const CHROME_SCREENS = new Set\(\[([^\]]*)\]\)/)[1].match(/"([a-z0-9-]+)"/g).map((s) => s.replace(/"/g, "")));
  const nav = new Set(PORTAL_NAV_SCREENS);
  // "form" bilinçli DIŞARIDA: form ekranında üst-bant gizlenemez (başlık/kayıp-koruması).
  assert.deepStrictEqual([...chrome].sort(), [...nav].sort(), "chrome beyaz-listesi nav kümesinden sapmış");
});
