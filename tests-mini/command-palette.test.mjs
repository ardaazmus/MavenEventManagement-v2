import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MODULES, MODULE_GROUPS, roleCanSee, buildModuleCommands } from "../src/lib/constants.ts";

// F3-a — ⌘K komut paleti sözleşmesi: girdiler menüyle AYNI iki kapıdan süzülür
// (yetenek + rol); kilitli modüller görünmez; etiket anahtarları iki sözlükte de var.

const allCaps = () => true;
const noCaps = () => false;

function expectedIds(role, capFn) {
  const out = [];
  for (const g of MODULE_GROUPS) {
    for (const m of MODULES) {
      if (m.group !== g.id) continue;
      if (!capFn(m.capability)) continue;
      if (!roleCanSee(m, role ?? null)) continue;
      out.push(m.id);
    }
  }
  return out;
}

test("CP-1 — EVENT_MANAGER paleti, menü süzgeciyle birebir (yetenekler açık)", () => {
  const got = buildModuleCommands({ role: "EVENT_MANAGER", capabilityEnabled: allCaps }).map((e) => e.id);
  assert.deepStrictEqual(got, expectedIds("EVENT_MANAGER", allCaps));
});

test("CP-2 — rol yok (auth-off) → tüm modüller", () => {
  const got = buildModuleCommands({ role: null, capabilityEnabled: allCaps }).map((e) => e.id);
  assert.strictEqual(got.length, MODULES.length);
  assert.deepStrictEqual(got, expectedIds(null, allCaps));
});

test("CP-3 — VIEWER → yalnız roles:'*' modülleri", () => {
  const got = buildModuleCommands({ role: "VIEWER", capabilityEnabled: allCaps }).map((e) => e.id);
  const star = MODULES.filter((m) => m.roles === "*").map((m) => m.id);
  assert.deepStrictEqual(got, star);
  assert.ok(!got.includes("finance"), "finans görünmez");
});

test("CP-4 — yetenek kapalı → capability'li modüller listelenmez", () => {
  const got = buildModuleCommands({ role: null, capabilityEnabled: noCaps }).map((e) => e.id);
  assert.ok(got.includes("dashboard"), "yetenek-siz modül kalır");
  assert.ok(!got.includes("registrations"), "REGISTRATION yeteneği kapalıyken kayıt görünmez");
  assert.deepStrictEqual(got, MODULES.filter((m) => !m.capability).map((m) => m.id));
});

test("CP-5 — her palet girdisinin etiket anahtarı tr+en sözlükte var", () => {
  const tr = JSON.parse(fs.readFileSync(path.resolve("src/i18n/tr.json"), "utf8"));
  const en = JSON.parse(fs.readFileSync(path.resolve("src/i18n/en.json"), "utf8"));
  const entries = buildModuleCommands({ role: null, capabilityEnabled: allCaps });
  for (const e of entries) {
    assert.ok(tr.modules?.[e.id], `tr.modules.${e.id} eksik`);
    assert.ok(en.modules?.[e.id], `en.modules.${e.id} eksik`);
  }
});

test("CP-6 — kaynak sözleşmesi: shell ⌘K dinler + palet cmdk kullanır", () => {
  const shell = fs.readFileSync(path.resolve("src/components/maven/shell.tsx"), "utf8");
  assert.ok(shell.includes("CommandPalette"), "shell paleti render etmeli");
  assert.ok(shell.includes("buildModuleCommands"), "shell saf süzgeci kullanmalı");
  assert.ok(shell.includes('addEventListener("keydown"'), "⌘K kısayolu dinlenmeli");
  const comp = fs.readFileSync(path.resolve("src/components/maven/command-palette.tsx"), "utf8");
  assert.ok(comp.includes('from "cmdk"'), "bileşen cmdk tabanlı");
  assert.ok(comp.includes("Command.Input"), "arama girdisi mevcut");
  const lib = fs.readFileSync(path.resolve("src/lib/constants.ts"), "utf8");
  assert.ok(lib.includes("export function buildModuleCommands"), "saf süzgeç constants.ts'te kanonik");
  assert.ok(lib.includes("roleCanSee(m"), "saf süzgeç rol matrisini kullanır");
});
