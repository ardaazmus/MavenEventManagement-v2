import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const consentPath = path.resolve("src/lib/comms/consent.ts");
const iysPath = path.resolve("src/lib/comms/iys.ts");

async function setup(tag) {
  const iso = await createIsolatedTestDb(`p17-${tag}`);
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p17-${tag}-${uniq}` } });
  return { iso, tenant };
}

test("P17.2 - rıza kaydı: upsert + geri çekme + İYS kuyruk ayrımı", async () => {
  const { recordConsent, getConsent, ConsentError } = await import(pathToFileURL(consentPath).href);
  const ctx = await setup("consent");
  try {
    const g = await recordConsent(ctx.iso.prisma, {
      tenantId: ctx.tenant.id, channel: "EMAIL", address: "VelI@Ornek.net",
      purpose: "COMMERCIAL", status: "GRANTED", source: "FORM", proof: "form-yanit-1",
    });
    assert.strictEqual(g.iysQueued, true, "ticari e-posta İYS'ye düşer");
    assert.strictEqual(g.consent.address, "veli@ornek.net", "adres normalize saklanır");
    assert.ok(g.consent.grantedAt);

    // Aynı anahtar tekrarı tek satırda birleşir.
    await recordConsent(ctx.iso.prisma, {
      tenantId: ctx.tenant.id, channel: "email", address: "veli@ornek.NET",
      purpose: "commercial", status: "GRANTED", source: "API",
    });
    assert.strictEqual(await ctx.iso.prisma.contactConsent.count({ where: { tenantId: ctx.tenant.id } }), 1);

    // Geri çekme kazanır + kuyruğa WITHDRAW düşer.
    const w = await recordConsent(ctx.iso.prisma, {
      tenantId: ctx.tenant.id, channel: "EMAIL", address: "veli@ornek.net",
      purpose: "COMMERCIAL", status: "WITHDRAWN", source: "MANUAL",
    });
    assert.strictEqual(w.iysQueued, true);
    const row = await getConsent(ctx.iso.prisma, { tenantId: ctx.tenant.id, channel: "EMAIL", address: "veli@ornek.net", purpose: "COMMERCIAL" });
    assert.strictEqual(row.status, "WITHDRAWN");
    assert.ok(row.withdrawnAt);

    // İşlemsel rıza İYS'ye düşmez; WhatsApp ticari de düşmez (İYS: EMAIL/SMS).
    const t = await recordConsent(ctx.iso.prisma, {
      tenantId: ctx.tenant.id, channel: "EMAIL", address: "fatura@ornek.net",
      purpose: "TRANSACTIONAL", status: "GRANTED",
    });
    assert.strictEqual(t.iysQueued, false);
    const wa = await recordConsent(ctx.iso.prisma, {
      tenantId: ctx.tenant.id, channel: "WHATSAPP", address: "+90 532 111 22 33",
      purpose: "COMMERCIAL", status: "GRANTED",
    });
    assert.strictEqual(wa.iysQueued, false);
    assert.strictEqual(wa.consent.address, "905321112233", "telefon haneye indirgenir");

    const outbox = await ctx.iso.prisma.iysOutbox.count({ where: { tenantId: ctx.tenant.id } });
    assert.strictEqual(outbox, 3, "grant+withdraw ticari e-posta + ikinci grant");

    for (const bad of [
      { channel: "PUSH", address: "x", purpose: "COMMERCIAL", status: "GRANTED" },
      { channel: "EMAIL", address: "biçimsiz", purpose: "COMMERCIAL", status: "GRANTED" },
      { channel: "SMS", address: "123", purpose: "COMMERCIAL", status: "GRANTED" },
      { channel: "EMAIL", address: "a@b.co", purpose: "SPAM", status: "GRANTED" },
      { channel: "EMAIL", address: "a@b.co", purpose: "COMMERCIAL", status: "MAYBE" },
    ]) {
      await assert.rejects(() => recordConsent(ctx.iso.prisma, { tenantId: ctx.tenant.id, ...bad }), (e) => e instanceof ConsentError && e.status === 422, JSON.stringify(bad));
    }
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P17.2 - gönderim kararı matrisi + değişmez denetim", async () => {
  const { recordConsent, decideSend } = await import(pathToFileURL(consentPath).href);
  const ctx = await setup("decide");
  try {
    // Rızasız ticari → BLOCK/NO_CONSENT.
    const b1 = await decideSend(ctx.iso.prisma, { tenantId: ctx.tenant.id, channel: "EMAIL", recipient: "yeni@ornek.net", purpose: "COMMERCIAL", campaignId: "c1" });
    assert.deepStrictEqual({ decision: b1.decision, reasons: b1.reasons }, { decision: "BLOCK", reasons: ["NO_CONSENT"] });

    // Rızalı ticari → ALLOW.
    await recordConsent(ctx.iso.prisma, { tenantId: ctx.tenant.id, channel: "EMAIL", address: "izinli@ornek.net", purpose: "COMMERCIAL", status: "GRANTED" });
    const a1 = await decideSend(ctx.iso.prisma, { tenantId: ctx.tenant.id, channel: "EMAIL", recipient: " IZINLI@ornek.net ", purpose: "COMMERCIAL", campaignId: "c1" });
    assert.strictEqual(a1.decision, "ALLOW");
    assert.deepStrictEqual(a1.reasons, []);

    // Bastırma rızayı ezer (her amaç).
    await ctx.iso.prisma.mailSuppression.create({ data: { tenantId: ctx.tenant.id, email: "izinli@ornek.net", reason: "UNSUBSCRIBE" } });
    const b2 = await decideSend(ctx.iso.prisma, { tenantId: ctx.tenant.id, channel: "EMAIL", recipient: "izinli@ornek.net", purpose: "COMMERCIAL", campaignId: "c1" });
    assert.deepStrictEqual(b2.reasons, ["SUPPRESSED"]);
    const b3 = await decideSend(ctx.iso.prisma, { tenantId: ctx.tenant.id, channel: "EMAIL", recipient: "izinli@ornek.net", purpose: "TRANSACTIONAL" });
    assert.strictEqual(b3.decision, "BLOCK", "bastırma işlemseli de engeller (S3)");

    // İşlemsel rızasız geçer.
    const a2 = await decideSend(ctx.iso.prisma, { tenantId: ctx.tenant.id, channel: "SMS", recipient: "05321112233", purpose: "TRANSACTIONAL" });
    assert.strictEqual(a2.decision, "ALLOW");

    // Denetim satırları kalıcı + nedenli.
    const rows = await ctx.iso.prisma.sendDecision.findMany({ where: { tenantId: ctx.tenant.id }, orderBy: { createdAt: "asc" } });
    assert.strictEqual(rows.length, 5);
    assert.ok(rows.every((r) => r.campaignId === "c1" || r.campaignId === null));
    assert.deepStrictEqual(JSON.parse(rows[0].reasons), ["NO_CONSENT"]);

    // Değişmezlik: lib ve rota güncelleme/silme sunmaz.
    const consentSrc = fs.readFileSync(consentPath, "utf8");
    assert.ok(!consentSrc.includes("sendDecision:") || !consentSrc.match(/sendDecision:\s*\{[^}]*update/m), "karar güncelleme lib'de yok");
    assert.ok(!/export (async )?function (update|delete|remove)SendDecision/.test(consentSrc));
    const auditRoute = fs.readFileSync(path.resolve("src/app/api/comms/send-decisions/route.ts"), "utf8");
    assert.ok(!/export async function (POST|PUT|PATCH|DELETE)/.test(auditRoute), "denetim salt-okunur");
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P17.3 - sözleşme: sandbox sağlayıcı turu + kayıt", async () => {
  const { SandboxIysProvider } = await import(pathToFileURL(iysPath).href);
  const p = new SandboxIysProvider();
  assert.strictEqual(p.name, "sandbox");
  assert.strictEqual(await p.queryStatus("EMAIL", "kimse@ornek.net"), "UNKNOWN");
  const r1 = await p.submitConsent({ channel: "EMAIL", address: "a@ornek.net", action: "GRANT", source: "FORM", proof: null, at: new Date().toISOString() });
  assert.ok(r1.externalId.startsWith("sandbox-"));
  assert.strictEqual(await p.queryStatus("EMAIL", "a@ornek.net"), "GRANTED");
  await p.submitConsent({ channel: "EMAIL", address: "a@ornek.net", action: "WITHDRAW", source: "MANUAL", proof: null, at: new Date().toISOString() });
  assert.strictEqual(await p.queryStatus("EMAIL", "a@ornek.net"), "WITHDRAWN");
  assert.strictEqual(p.submitted.length, 2);
});

test("P17.3 - outbox tarama: başarı + retry/backoff + dead", async () => {
  const { SandboxIysProvider, drainIysOutbox, backoffDelayMs } = await import(pathToFileURL(iysPath).href);
  const { recordConsent } = await import(pathToFileURL(consentPath).href);
  assert.strictEqual(backoffDelayMs(1, 60_000), 60_000);
  assert.strictEqual(backoffDelayMs(2, 60_000), 120_000);
  assert.strictEqual(backoffDelayMs(3, 60_000), 240_000);

  const ctx = await setup("outbox");
  try {
    const p = new SandboxIysProvider();
    p.script("EMAIL", "kirilgan@ornek.net", { failTimes: 2, failWith: "502" });
    p.script("SMS", "905321112233", { failTimes: 99, failWith: "kota" });
    await recordConsent(ctx.iso.prisma, { tenantId: ctx.tenant.id, channel: "EMAIL", address: "saglam@ornek.net", purpose: "COMMERCIAL", status: "GRANTED" });
    await recordConsent(ctx.iso.prisma, { tenantId: ctx.tenant.id, channel: "EMAIL", address: "kirilgan@ornek.net", purpose: "COMMERCIAL", status: "GRANTED" });
    await recordConsent(ctx.iso.prisma, { tenantId: ctx.tenant.id, channel: "SMS", address: "05321112233", purpose: "COMMERCIAL", status: "GRANTED" });

    const t0 = new Date();
    const d1 = await drainIysOutbox(ctx.iso.prisma, p, { now: t0, baseDelayMs: 60_000 });
    assert.deepStrictEqual(d1, { processed: 3, sent: 1, retried: 2, dead: 0 });
    const fragile = await ctx.iso.prisma.iysOutbox.findFirst({ where: { tenantId: ctx.tenant.id, address: "kirilgan@ornek.net" } });
    assert.strictEqual(fragile.status, "PENDING");
    assert.strictEqual(fragile.attempts, 1);
    assert.ok(fragile.nextRetryAt.getTime() === t0.getTime() + 60_000, "backoff 1× Baz");

    // Vade dolmadan tarama bekleyenleri atlar.
    const d2 = await drainIysOutbox(ctx.iso.prisma, p, { now: new Date(t0.getTime() + 1000), baseDelayMs: 60_000 });
    assert.strictEqual(d2.processed, 0);

    // Vade sonrası kırılgan ikinci kez düşer (2× gecikme), sonra iletilir.
    const d3 = await drainIysOutbox(ctx.iso.prisma, p, { now: new Date(t0.getTime() + 61_000), baseDelayMs: 60_000 });
    assert.deepStrictEqual({ sent: d3.sent, retried: d3.retried }, { sent: 0, retried: 2 });
    const d4 = await drainIysOutbox(ctx.iso.prisma, p, { now: new Date(t0.getTime() + 61_000 + 121_000), baseDelayMs: 60_000 });
    assert.strictEqual(d4.sent, 1, "kırılgan üçüncü denemede iletilir");
    const sentRow = await ctx.iso.prisma.iysOutbox.findFirst({ where: { tenantId: ctx.tenant.id, address: "kirilgan@ornek.net" } });
    assert.strictEqual(sentRow.status, "SENT");
    assert.ok(sentRow.externalId);

    // Kronik arızalı hak bitiminde ölür.
    let now = t0.getTime() + 10_000_000;
    for (let i = 0; i < 4; i++) {
      now += 10_000_000;
      await drainIysOutbox(ctx.iso.prisma, p, { now: new Date(now), baseDelayMs: 1000 });
    }
    const dead = await ctx.iso.prisma.iysOutbox.findFirst({ where: { tenantId: ctx.tenant.id, address: "905321112233" } });
    assert.strictEqual(dead.status, "FAILED");
    assert.strictEqual(dead.attempts, 5);
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P17.3 - mutabakat tek-yönlüdür: sağlayıcı yalnız geri çeker", async () => {
  const { SandboxIysProvider, reconcileIys } = await import(pathToFileURL(iysPath).href);
  const { recordConsent } = await import(pathToFileURL(consentPath).href);
  const ctx = await setup("recon");
  try {
    const p = new SandboxIysProvider();
    await recordConsent(ctx.iso.prisma, { tenantId: ctx.tenant.id, channel: "EMAIL", address: "yerel@ornek.net", purpose: "COMMERCIAL", status: "GRANTED" });
    await recordConsent(ctx.iso.prisma, { tenantId: ctx.tenant.id, channel: "EMAIL", address: "bilinmeyen@ornek.net", purpose: "COMMERCIAL", status: "GRANTED" });
    await recordConsent(ctx.iso.prisma, { tenantId: ctx.tenant.id, channel: "EMAIL", address: "cekilmis@ornek.net", purpose: "COMMERCIAL", status: "WITHDRAWN" });
    p.seed("EMAIL", "yerel@ornek.net", "WITHDRAWN");
    p.seed("EMAIL", "cekilmis@ornek.net", "GRANTED");

    const out = await reconcileIys(ctx.iso.prisma, p, { tenantId: ctx.tenant.id });
    assert.deepStrictEqual(out, { checked: 2, withdrawn: 1 });

    const rows = await ctx.iso.prisma.contactConsent.findMany({ where: { tenantId: ctx.tenant.id }, orderBy: { address: "asc" } });
    const byAddr = Object.fromEntries(rows.map((r) => [r.address, r]));
    assert.strictEqual(byAddr["yerel@ornek.net"].status, "WITHDRAWN");
    assert.strictEqual(byAddr["yerel@ornek.net"].source, "IYS_RECONCILE");
    assert.strictEqual(byAddr["bilinmeyen@ornek.net"].status, "GRANTED", "UNKNOWN yereli değiştirmez");
    assert.strictEqual(byAddr["cekilmis@ornek.net"].status, "WITHDRAWN", "yerel geri çekme daima kazanır");
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P17 - kablo: yayın kancası + kütüphane + posta onarımları + uçlar", async () => {
  const bc = fs.readFileSync(path.resolve("src/lib/api/comms-broadcast.ts"), "utf8");
  assert.ok(bc.includes("decideSend"), "yayın rıza kapısını çağırmalı");
  assert.ok(bc.includes("consentBlocked"), "rıza engeli rapora yansımalı");
  assert.ok(bc.includes("libraryTemplate"), "kütüphane şablonu çözülmeli");
  assert.ok(bc.includes("Kütüphane şablonu bu kiracıya ait değil"), "kütüphane kiracı-eşleşmeli");

  const mail = fs.readFileSync(path.resolve("src/app/api/mail/send/route.ts"), "utf8");
  assert.strictEqual((mail.match(/requireStaff\(\)/g) || []).length >= 3, true, "posta uçları kadro kapılı olmalı");
  assert.ok(mail.includes("where: q ? { tenantId, email: { contains: q } } : { tenantId }"), "bastırma listesi kiracı-kapsamlı");
  assert.ok(mail.includes("TRANSACTIONAL"), "işlemsel karar denetimi yazılmalı");

  const send = fs.readFileSync(path.resolve("src/app/api/campaigns/send/route.ts"), "utf8");
  assert.ok(send.includes("requireStaff"), "kampanya gönderimi kadro kapılı");

  for (const f of ["src/app/api/comms/templates/route.ts", "src/app/api/comms/consents/route.ts", "src/app/api/comms/send-decisions/route.ts"]) {
    const src = fs.readFileSync(path.resolve(f), "utf8");
    assert.ok(src.includes("requireStaff") && src.includes("resolveContext"), `${f} kapılı + kapsamlı olmalı`);
  }
  for (const f of ["src/app/api/admin/iys/drain/route.ts", "src/app/api/admin/iys/reconcile/route.ts"]) {
    const src = fs.readFileSync(path.resolve(f), "utf8");
    assert.ok(src.includes("requireAdmin") && src.includes("SandboxIysProvider"), `${f} yönetici kapılı + sağlayıcılı olmalı`);
  }
});
