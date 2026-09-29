import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const providersLib = path.resolve("src/lib/integrations/providers.ts");
const hookLib = path.resolve("src/lib/integrations/webhooks.ts");

// P22.4: saglayici sozlesmesi — gercek kimlik bilgisiz, loopback sunucuyla.
// Dogrular: imza basliklari + govde semasi, 5xx/429/ag-hatasi tekrarlanabilir,
// 4xx kalici hata, zaman asimi siniri.

function startServer(handler) {
  return new Promise((resolve) => {
    const seen = [];
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        seen.push({ headers: req.headers, raw });
        handler(req, raw, res);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}/hook` }));
  });
}

test("P22.4 - basarili teslim: sema + imza basliklari", async () => {
  const { dispatchWebhook } = await import(pathToFileURL(providersLib).href);
  const { verifySignature } = await import(pathToFileURL(hookLib).href);
  const { server, seen, url } = await startServer((req, raw, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  try {
    const out = await dispatchWebhook({
      url, eventType: "lead.captured", deliveryId: "d1",
      payload: { leadId: "l1" }, secret: "s3cr3t",
    });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.retryable, false);
    assert.strictEqual(seen.length, 1);
    const got = seen[0];
    assert.strictEqual(got.headers["x-maven-event"], "lead.captured");
    assert.strictEqual(got.headers["x-maven-delivery"], "d1");
    assert.ok(got.headers["x-maven-timestamp"]);
    assert.ok(got.headers["x-maven-signature"]);
    const body = JSON.parse(got.raw);
    assert.deepStrictEqual(Object.keys(body).sort(), ["data", "deliveryId", "event"]);
    // alici gozuyle imza gecerli
    const v = verifySignature("s3cr3t", got.headers["x-maven-timestamp"], got.raw, got.headers["x-maven-signature"]);
    assert.deepStrictEqual(v, { ok: true });
  } finally {
    server.close();
  }
});

test("P22.4 - tekrar siniflandirma: 500/429/ag-hatasi evet, 400 hayir", async () => {
  const { dispatchWebhook } = await import(pathToFileURL(providersLib).href);
  const boom = await startServer((req, raw, res) => { res.writeHead(500); res.end("err"); });
  try {
    const r500 = await dispatchWebhook({ url: boom.url, eventType: "e", deliveryId: "d", payload: {} });
    assert.strictEqual(r500.ok, false);
    assert.strictEqual(r500.retryable, true);
  } finally {
    boom.server.close();
  }
  const limited = await startServer((req, raw, res) => { res.writeHead(429); res.end("slow"); });
  try {
    const r429 = await dispatchWebhook({ url: limited.url, eventType: "e", deliveryId: "d", payload: {} });
    assert.strictEqual(r429.retryable, true);
  } finally {
    limited.server.close();
  }
  const bad = await startServer((req, raw, res) => { res.writeHead(400); res.end("bad"); });
  try {
    const r400 = await dispatchWebhook({ url: bad.url, eventType: "e", deliveryId: "d", payload: {} });
    assert.strictEqual(r400.ok, false);
    assert.strictEqual(r400.retryable, false); // kalici — tekrar yok
  } finally {
    bad.server.close();
  }
  const gone = await dispatchWebhook({
    url: "http://127.0.0.1:1/kapali", eventType: "e", deliveryId: "d", payload: {}, timeoutMs: 2000,
  });
  assert.strictEqual(gone.ok, false);
  assert.strictEqual(gone.retryable, true);
  assert.strictEqual(gone.status, null);
});

test("P22.4 - zaman asimi: yavas saglayici kesilir + tekrarlanabilir", async () => {
  const { dispatchWebhook } = await import(pathToFileURL(providersLib).href);
  const slow = await startServer((req, raw, res) => {
    setTimeout(() => { res.writeHead(200); res.end("gec"); }, 1500);
  });
  try {
    const started = Date.now();
    const out = await dispatchWebhook({ url: slow.url, eventType: "e", deliveryId: "d", payload: {}, timeoutMs: 300 });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.retryable, true);
    assert.strictEqual(out.error, "Zaman aşımı");
    assert.ok(Date.now() - started < 1200, "300ms tavani asmamali");
  } finally {
    slow.server.close();
  }
});

test("QA - unicode baslik degeri: Turkce entegrasyon adi fetch'i patlatmaz", async () => {
  const { dispatchWebhook, sanitizeHeaderValue } = await import(pathToFileURL(providersLib).href);
  assert.strictEqual(sanitizeHeaderValue("CRM Kişi Eşitleme"), "CRM Ki?i E?itleme");
  assert.strictEqual(sanitizeHeaderValue("plain-ascii_123"), "plain-ascii_123");
  const srv = await startServer((req, raw, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  try {
    const out = await dispatchWebhook({
      url: srv.url, eventType: "lead.captured", deliveryId: "d-tr",
      payload: {}, extraHeaders: { "X-Maven-Integration": "CRM Kişi Eşitleme" },
    });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.status, 200);
    assert.strictEqual(srv.seen[0].headers["x-maven-integration"], "CRM Ki?i E?itleme");
  } finally {
    srv.server.close();
  }
});
