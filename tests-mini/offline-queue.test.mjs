import test from "node:test";
import assert from "node:assert/strict";
import {
  decideReplay,
  replayDelayMs,
  MAX_REPLAY_ATTEMPTS,
} from "../src/lib/offline-queue.ts";

// N-07: sonsuz replay kapalı — sınırlı deneme + ölü-mektup + 4xx/5xx ayrımı.

test("N-07 - 2xx SUCCESS, kalıcı 4xx ilk denemede DEAD", () => {
  assert.deepStrictEqual(decideReplay(200, 0), { kind: "SUCCESS" });
  assert.deepStrictEqual(decideReplay(201, 3), { kind: "SUCCESS" });
  assert.deepStrictEqual(decideReplay(400, 0), { kind: "DEAD", reason: "PERMANENT" });
  assert.deepStrictEqual(decideReplay(404, 0), { kind: "DEAD", reason: "PERMANENT" });
  assert.deepStrictEqual(decideReplay(403, 2), { kind: "DEAD", reason: "PERMANENT" });
});

test("N-07 - 5xx/ağ/408/429 geçici: sınır altında RETRY, sınırda DEAD", () => {
  assert.deepStrictEqual(decideReplay(500, 0), { kind: "RETRY" });
  assert.deepStrictEqual(decideReplay(503, 1), { kind: "RETRY" });
  assert.deepStrictEqual(decideReplay(null, 0), { kind: "RETRY" });
  assert.deepStrictEqual(decideReplay(408, 0), { kind: "RETRY" });
  assert.deepStrictEqual(decideReplay(429, 0), { kind: "RETRY" });
  assert.deepStrictEqual(decideReplay(500, MAX_REPLAY_ATTEMPTS - 1), {
    kind: "DEAD",
    reason: "RETRIES_EXHAUSTED",
  });
  assert.deepStrictEqual(decideReplay(null, MAX_REPLAY_ATTEMPTS - 1), {
    kind: "DEAD",
    reason: "RETRIES_EXHAUSTED",
  });
});

test("N-07 - geri-çekilme üstel ve tavanlı", () => {
  assert.strictEqual(MAX_REPLAY_ATTEMPTS, 5);
  const d0 = replayDelayMs(0);
  const d1 = replayDelayMs(1);
  const d2 = replayDelayMs(2);
  assert.ok(d1 === d0 * 2 && d2 === d0 * 4, "üstel artmalı");
  assert.ok(replayDelayMs(99) <= 8000, "tavan 8sn");
});
