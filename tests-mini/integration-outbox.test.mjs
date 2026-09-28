import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const outboxLib = path.resolve("src/lib/integrations/outbox.ts");
const hookLib = path.resolve("src/lib/integrations/webhooks.ts");

const EVT = {
  tenantId: "t1",
  editionId: "e1",
  aggregateType: "LEAD",
  aggregateId: "l1",
  eventType: "lead.captured",
  payload: { leadId: "l1" },
};

test("P22.1 - yayin + idempotency dedupe + rollback dusurur", async () => {
  const { publishOutbox } = await import(pathToFileURL(outboxLib).href);
  const iso = await createIsolatedTestDb("p22-pub");
  try {
    const first = await publishOutbox(iso.prisma, { ...EVT, idempotencyKey: "k1" });
    assert.strictEqual(first.deduped, false);
    const dup = await publishOutbox(iso.prisma, { ...EVT, idempotencyKey: "k1" });
    assert.strictEqual(dup.deduped, true);
    assert.strictEqual(dup.id, first.id);
    assert.strictEqual(await iso.prisma.outboxEvent.count(), 1);

    // ayni transaction rollback'i event'i de dusurur (cift-yazim yok)
    await assert.rejects(() =>
      iso.prisma.$transaction(async (tx) => {
        await publishOutbox(tx, { ...EVT, idempotencyKey: "k-tx" });
        await tx.leadCapture.create({ data: { editionId: "yok", agreementId: "yok", personId: "yok" } });
      }),
    );
    const rolled = await iso.prisma.outboxEvent.findUnique({ where: { idempotencyKey: "k-tx" } });
    assert.strictEqual(rolled, null);
  } finally {
    await iso.cleanup();
  }
});

test("P22.2 - claim/lease/retry/dead-letter + kira calisma", async () => {
  const { publishOutbox, claimOutbox, completeOutbox, failOutbox, requeueOutbox, backoffMs } = await import(
    pathToFileURL(outboxLib).href
  );
  assert.deepStrictEqual([backoffMs(0), backoffMs(1), backoffMs(2), backoffMs(99)], [5000, 10000, 20000, 900000]);

  const iso = await createIsolatedTestDb("p22-claim");
  try {
    const now = Date.now();
    const a = await publishOutbox(iso.prisma, { ...EVT, idempotencyKey: "a", maxAttempts: 2 });
    await publishOutbox(iso.prisma, { ...EVT, idempotencyKey: "b", maxAttempts: 2 });

    // w1 ikisini de alir; w2 bosta bulamaz (lease)
    const t0 = Date.now();
    const c1 = await claimOutbox(iso.prisma, "w1", { nowMs: t0 });
    assert.strictEqual(c1.length, 2);
    const c2 = await claimOutbox(iso.prisma, "w2", { nowMs: t0 });
    assert.strictEqual(c2.length, 0);

    // w1 biri bitirir; yanlis worker bitiremez
    assert.strictEqual(await completeOutbox(iso.prisma, c1[0].id, "w2"), false);
    assert.strictEqual(await completeOutbox(iso.prisma, c1[0].id, "w1"), true);

    // kira suresi dolunca w2 devralir (stale PROCESSING)
    const stolen = await claimOutbox(iso.prisma, "w2", { nowMs: now + 61_000 });
    assert.strictEqual(stolen.length, 1);
    assert.strictEqual(stolen[0].id, c1[1].id);

    // hata: ilk FAILED + backoff, ikinci DEAD (maxAttempts=2)
    const f1 = await failOutbox(iso.prisma, stolen[0].id, "w2", "boom", now + 61_000);
    assert.deepStrictEqual({ applied: f1.applied, dead: f1.dead }, { applied: true, dead: false });
    assert.ok(f1.nextRunAt && f1.nextRunAt.getTime() === now + 61_000 + 5000);
    const waiting = await claimOutbox(iso.prisma, "w2", { nowMs: now + 61_000 });
    assert.strictEqual(waiting.length, 0); // backoff dolmadi
    const due = await claimOutbox(iso.prisma, "w2", { nowMs: now + 61_000 + 5000 });
    assert.strictEqual(due.length, 1);
    const f2 = await failOutbox(iso.prisma, due[0].id, "w2", "boom2", now + 70_000);
    assert.deepStrictEqual({ applied: f2.applied, dead: f2.dead }, { applied: true, dead: true });
    void a;
    const deadRow = await iso.prisma.outboxEvent.findUnique({ where: { id: due[0].id } });
    assert.strictEqual(deadRow.status, "DEAD");
    assert.ok(deadRow.deadAt);
    assert.match(deadRow.deadReason ?? "", /maxAttempts/);
    assert.strictEqual(await iso.prisma.outboxEvent.count({ where: { status: "COMPLETED" } }), 1);
    assert.strictEqual(await iso.prisma.outboxEvent.count({ where: { status: "DEAD" } }), 1);

    // operasyon iadesi kuyruga dondurur
    assert.strictEqual(await requeueOutbox(iso.prisma, due[0].id, now + 80_000), true);
    const back = await iso.prisma.outboxEvent.findUnique({ where: { id: due[0].id } });
    assert.strictEqual(back.status, "PENDING");
    assert.strictEqual(back.retryCount, 0);
    const reclaimed = await claimOutbox(iso.prisma, "w3", { nowMs: now + 80_000 });
    assert.strictEqual(reclaimed.length, 1);

    // fatal hata ilk denemede DEAD (4xx kalici ret)
    const fatal = await failOutbox(iso.prisma, reclaimed[0].id, "w3", "HTTP 400", now + 80_000, { fatal: true });
    assert.deepStrictEqual({ applied: fatal.applied, dead: fatal.dead }, { applied: true, dead: true });
    const fatalRow = await iso.prisma.outboxEvent.findUnique({ where: { id: reclaimed[0].id } });
    assert.strictEqual(fatalRow.status, "DEAD");
    assert.match(fatalRow.deadReason ?? "", /fatal/);
  } finally {
    await iso.cleanup();
  }
});

test("P22.3 - imza dogrulama + tekrar penceresi + redaksiyon", async () => {
  const { signPayload, verifySignature, secretFromAuthConfig, redactPayload } = await import(pathToFileURL(hookLib).href);

  const secret = "s3cr3t";
  const ts = "1727400000";
  const body = JSON.stringify({ type: "PING", n: 1 });
  const sig = signPayload(secret, ts, body);
  assert.match(sig, /^[0-9a-f]{64}$/);
  assert.deepStrictEqual(verifySignature(secret, ts, body, sig, { nowSec: 1727400000 }), { ok: true });
  // deterministik: ayni girdi ayni imza
  assert.strictEqual(signPayload(secret, ts, body), sig);

  assert.strictEqual(verifySignature(secret, ts, body, sig, { nowSec: 1727400000 + 301 }).ok, false); // pencere disi
  assert.strictEqual(verifySignature(secret, ts, body, sig, { nowSec: 1727400000 + 300 }).ok, true); // sinir dahil
  assert.strictEqual(verifySignature(secret, ts, body + "x", sig, { nowSec: 1727400000 }).ok, false); // kurcalanmis govde
  assert.strictEqual(verifySignature("baska", ts, body, sig, { nowSec: 1727400000 }).ok, false);
  assert.strictEqual(verifySignature(secret, ts, body, "zz", { nowSec: 1727400000 }).ok, false);
  assert.strictEqual(verifySignature(secret, null, body, sig).ok, false);
  assert.strictEqual(verifySignature("", ts, body, sig).ok, false);

  assert.strictEqual(secretFromAuthConfig(JSON.stringify({ secret: "x" })), "x");
  assert.strictEqual(secretFromAuthConfig(JSON.stringify({ signingSecret: "y" })), "y");
  assert.strictEqual(secretFromAuthConfig(JSON.stringify({ key: "z" })), null);
  assert.strictEqual(secretFromAuthConfig("bozuk{"), null);
  assert.strictEqual(secretFromAuthConfig(null), null);

  const red = redactPayload({
    name: "Acme",
    apiKey: "abc",
    nested: { password: "pw", amount: 5, list: [{ token: "t", ok: 1 }] },
    "X-Auth-Token": "h",
  });
  assert.deepStrictEqual(red, {
    name: "Acme",
    apiKey: "•••",
    nested: { password: "•••", amount: 5, list: [{ token: "•••", ok: 1 }] },
    "X-Auth-Token": "•••",
  });
  // giris degismez (klon)
  const src = { secret: "s" };
  redactPayload(src);
  assert.strictEqual(src.secret, "s");
});
