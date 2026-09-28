import test from "node:test";
import assert from "node:assert/strict";
import { pushNav, popNav, resetNav, syncNav, navHash, parseNavHash, isPortalScreen } from "../src/lib/portal-nav.ts";

// Portal geri-navigasyon kilitleri: her ekranın "önceki sayfa"sı yığından çözülür.

test("NAV-1 - push ileri gider, aynı ekran üst üste binmez", () => {
  assert.deepStrictEqual(pushNav(["home"], "program"), ["home", "program"]);
  assert.deepStrictEqual(pushNav(["home", "program"], "program"), ["home", "program"]);
});

test("NAV-2 - pop bir önceki sayfaya döner, kökün altına inmez", () => {
  assert.deepStrictEqual(popNav(["home", "program", "speakers"]), ["home", "program"]);
  assert.deepStrictEqual(popNav(["home"]), ["home"]);
  assert.deepStrictEqual(popNav([]), ["home"]);
});

test("NAV-3 - sekme değişimi yığını sıfırlar", () => {
  assert.deepStrictEqual(resetNav("map"), ["map"]);
});

test("NAV-4 - form ekranı hash/deep-link'e kapalıdır (formRef'siz açılamaz)", () => {
  assert.strictEqual(isPortalScreen("form"), false);
  assert.strictEqual(parseNavHash("#p=form"), null);
});

test("NAV-5 - sistem geri (popstate) yığında varsa kırpar, yoksa push'lar", () => {
  assert.deepStrictEqual(syncNav(["home", "program", "speakers"], "home"), ["home"]);
  assert.deepStrictEqual(syncNav(["home"], "qa"), ["home", "qa"]);
});

test("NAV-6 - hash aynası çift-yönlüdür, bozuk hash yoksayılır", () => {
  assert.strictEqual(navHash("program"), "#p=program");
  assert.strictEqual(parseNavHash("#p=program"), "program");
  assert.strictEqual(parseNavHash("#p=<script>"), null);
  assert.strictEqual(parseNavHash(""), null);
  assert.strictEqual(parseNavHash("#p=olmayan"), null);
});

test("NAV-7 - yığın tavanı aşılmaz (30)", () => {
  let s = ["home"];
  for (let i = 0; i < 100; i++) s = pushNav(s, i % 2 === 0 ? "program" : "qa");
  assert.strictEqual(s.length, 30);
  assert.strictEqual(s[s.length - 1], "qa");
});
