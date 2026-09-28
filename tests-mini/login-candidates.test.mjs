import test from "node:test";
import assert from "node:assert/strict";
import { selectLoginCandidate } from "../src/lib/auth/login-candidates.ts";

// N-03: çok-kiracılı e-posta giriş çözümleme sözleşmesi.

const cand = (over = {}) => ({
  id: "u1",
  tenantId: "t1",
  tenantSlug: "acme",
  passwordHash: "hash-acme",
  status: "ACTIVE",
  lockedUntil: null,
  ...over,
});

const verify = (pw) => async (hash, password) => hash === `hash-${password}` && pw === password;

test("N-03 - tek aday + doğru parola → ok", async () => {
  const res = await selectLoginCandidate([cand()], verify("acme"), "acme");
  assert.strictEqual(res.kind, "ok");
  assert.strictEqual(res.candidate.id, "u1");
});

test("N-03 - yanlış parola → not-found (kilit/durum sızmaz)", async () => {
  const locked = cand({ id: "u2", lockedUntil: new Date(Date.now() + 60000) });
  const res = await selectLoginCandidate([locked], verify("nope"), "acme");
  assert.strictEqual(res.kind, "not-found");
});

test("N-03 - iki kiracıda aynı e-posta: parola doğru kiracıyı seçer", async () => {
  const a = cand({ id: "u-a", tenantId: "t-a", tenantSlug: "a-corp", passwordHash: "hash-pw-a" });
  const b = cand({ id: "u-b", tenantId: "t-b", tenantSlug: "b-ltd", passwordHash: "hash-pw-b" });
  const res = await selectLoginCandidate([a, b], async (h, p) => h === `hash-${p}`, "pw-b");
  assert.strictEqual(res.kind, "ok");
  assert.strictEqual(res.candidate.id, "u-b");
});

test("N-03 - aynı parola iki kiracıda → ambiguous + slug listesi", async () => {
  const a = cand({ id: "u-a", tenantId: "t-a", tenantSlug: "a-corp", passwordHash: "hash-same" });
  const b = cand({ id: "u-b", tenantId: "t-b", tenantSlug: "b-ltd", passwordHash: "hash-same" });
  const res = await selectLoginCandidate([a, b], async (h, p) => h === `hash-${p}`, "same");
  assert.strictEqual(res.kind, "ambiguous");
  assert.deepStrictEqual(res.slugs.sort(), ["a-corp", "b-ltd"]);
});

test("N-03 - tenantSlug belirsizliği çözer; bilinmeyen slug → not-found", async () => {
  const a = cand({ id: "u-a", tenantId: "t-a", tenantSlug: "a-corp", passwordHash: "hash-same" });
  const b = cand({ id: "u-b", tenantId: "t-b", tenantSlug: "b-ltd", passwordHash: "hash-same" });
  const v = async (h, p) => h === `hash-${p}`;
  const ok = await selectLoginCandidate([a, b], v, "same", "b-ltd");
  assert.strictEqual(ok.kind, "ok");
  assert.strictEqual(ok.candidate.id, "u-b");
  const miss = await selectLoginCandidate([a, b], v, "same", "ghost-inc");
  assert.strictEqual(miss.kind, "not-found");
});

test("N-03 - eşleşen hesap kilitli/devre-dışıysa ilgili sonuç döner", async () => {
  const locked = cand({ lockedUntil: new Date(Date.now() + 60000) });
  const l = await selectLoginCandidate([locked], verify("acme"), "acme");
  assert.strictEqual(l.kind, "locked");
  const disabled = cand({ status: "DISABLED" });
  const d = await selectLoginCandidate([disabled], verify("acme"), "acme");
  assert.strictEqual(d.kind, "disabled");
});

test("N-03 - parolasız hesap (davet-yarım) eşleşmez", async () => {
  const noPw = cand({ passwordHash: null });
  const res = await selectLoginCandidate([noPw], async (h) => h !== null, "anything");
  assert.strictEqual(res.kind, "not-found");
});
