// Modul 28 — ENTEGRASYON/OUTBOX: islemsel yayin, imzali dagitim, tekrar/
// dead-letter, operasyon iadesi, imzali gelen webhook + teslim tekilleme +
// kiraci kapsamli kisi eslesmesi. Loopback alici sunucuyla gercek HTTP.
import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, createHmac, randomUUID } from "node:crypto";
import http from "node:http";

const db = new PrismaClient();
const SUFFIX = Date.now().toString(36).slice(-6);

let editionId = "";
let tenantId = "";
let agreementId = "";
let sponsorToken = "";
let credentialCode = "";
let outboundId = "";
let inboundId = "";
let inboundToken = "";
const INBOUND_SECRET = "m28-inbound-secret";
const OUTBOUND_SECRET = "m28-outbound-secret";
const createdIds = {
  tokens: [] as string[],
  persons: [] as string[],
  participations: [] as string[],
  credentials: [] as string[],
  leads: [] as string[],
  agreements: [] as string[],
  orgs: [] as string[],
  integrations: [] as string[],
  outbox: [] as string[],
  tenants: [] as string[],
};

const deliveries: Array<{ headers: Record<string, string | string[] | undefined>; raw: string }> = [];
let receiverMode: "ok" | "flaky500" = "ok";
let receiver: http.Server | null = null;
let receiverUrl = "";

function virtualClientHeaders() {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.ceil(Math.random() * 254)}`;
  return { "x-forwarded-for": ip };
}

function sign(secret: string, timestamp: string, raw: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${raw}`, "utf8").digest("hex");
}

test.describe.serial("M28 — entegrasyon/outbox uctan uca", () => {
  test.afterAll(async () => {
    receiver?.close();
    await db.webhookDelivery.deleteMany({ where: { integrationId: { in: createdIds.integrations } } });
    await db.integrationLog.deleteMany({ where: { integrationId: { in: createdIds.integrations } } });
    await db.outboxEvent.deleteMany({ where: { id: { in: createdIds.outbox } } });
    await db.apiIntegration.deleteMany({ where: { id: { in: createdIds.integrations } } });
    await db.leadCapture.deleteMany({ where: { id: { in: createdIds.leads } } });
    await db.credential.deleteMany({ where: { id: { in: createdIds.credentials } } });
    await db.eventParticipation.deleteMany({ where: { id: { in: createdIds.participations } } });
    await db.portalToken.deleteMany({ where: { id: { in: createdIds.tokens } } });
    await db.sponsorAgreement.deleteMany({ where: { id: { in: createdIds.agreements } } });
    await db.person.deleteMany({ where: { id: { in: createdIds.persons } } });
    await db.organization.deleteMany({ where: { id: { in: createdIds.orgs } } });
    await db.tenant.deleteMany({ where: { id: { in: createdIds.tenants } } });
    await db.$disconnect();
  });

  test("kurulum: alici sunucu + entegrasyonlar + sponsor duzenegi", async () => {
    const edition = await db.eventEdition.findFirst({ select: { id: true, tenantId: true }, orderBy: { createdAt: "asc" } });
    expect(edition).toBeTruthy();
    editionId = edition!.id;
    tenantId = edition!.tenantId;

    receiver = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        deliveries.push({ headers: req.headers as Record<string, string>, raw });
        if (receiverMode === "flaky500") {
          res.writeHead(500, { "content-type": "text/plain" });
          res.end("boom");
        } else {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        }
      });
    });
    await new Promise<void>((resolve) => receiver!.listen(0, "127.0.0.1", () => resolve()));
    const port = (receiver!.address() as { port: number }).port;
    receiverUrl = `http://127.0.0.1:${port}/hook`;

    const out = await db.apiIntegration.create({
      data: {
        tenantId, editionId, name: `M28 Out ${SUFFIX}`, direction: "OUTBOUND", kind: "WEBHOOK",
        baseUrl: receiverUrl, authType: "SIGNATURE", authConfig: JSON.stringify({ secret: OUTBOUND_SECRET }),
        status: "ACTIVE",
      },
    });
    outboundId = out.id;
    createdIds.integrations.push(out.id);

    inboundToken = `whk_${randomUUID().replace(/-/g, "")}`;
    const inbound = await db.apiIntegration.create({
      data: {
        tenantId, editionId, name: `M28 In ${SUFFIX}`, direction: "INBOUND", kind: "WEBHOOK",
        authType: "SIGNATURE", authConfig: JSON.stringify({ secret: INBOUND_SECRET }),
        inboundToken, status: "ACTIVE",
      },
    });
    inboundId = inbound.id;
    createdIds.integrations.push(inbound.id);

    const org = await db.organization.create({ data: { tenantId, name: `M28 Org ${SUFFIX}` } });
    createdIds.orgs.push(org.id);
    const ag = await db.sponsorAgreement.create({ data: { editionId, organizationId: org.id, status: "ACTIVE", signedAt: new Date() } });
    agreementId = ag.id;
    createdIds.agreements.push(ag.id);

    const raw = `pt_${randomUUID().replace(/-/g, "")}`;
    sponsorToken = raw;
    const tok = await db.portalToken.create({
      data: {
        tokenHash: createHash("sha256").update(raw, "utf8").digest("hex"),
        scope: "SPONSOR", editionId, organizationId: org.id, agreementId: ag.id,
        expiresAt: new Date(Date.now() + 86_400_000), issuedBy: "ADMIN",
      },
    });
    createdIds.tokens.push(tok.id);

    const person = await db.person.create({ data: { tenantId, firstName: "M28", lastName: `Lead${SUFFIX}`, consentVersion: "v3" } });
    createdIds.persons.push(person.id);
    const par = await db.eventParticipation.create({ data: { editionId, personId: person.id, source: "PUBLIC_FORM" } });
    createdIds.participations.push(par.id);
    credentialCode = `M28-${SUFFIX.toUpperCase()}-001`;
    const cred = await db.credential.create({ data: { participationId: par.id, code: credentialCode, type: "QR", status: "ACTIVE" } });
    createdIds.credentials.push(cred.id);
  });

  test("giden: lead yakalama outbox'a duser + tarama imzali dagitir", async ({ request }) => {
    const cap = await request.post("/api/portal/action", {
      data: { action: "lead-capture", token: sponsorToken, credentialCode, rating: "HOT" },
      headers: virtualClientHeaders(),
    });
    expect(cap.status()).toBe(200);
    const leadId = (await cap.json()).leadId as string;
    createdIds.leads.push(leadId);

    const evt = await db.outboxEvent.findFirst({ where: { aggregateId: leadId, eventType: "lead.captured" } });
    expect(evt).toBeTruthy();
    expect(evt!.status).toBe("PENDING");
    createdIds.outbox.push(evt!.id);

    const drain = await request.post("/api/admin/outbox/drain", { data: {}, headers: virtualClientHeaders() });
    expect(drain.status()).toBe(200);
    const drainBody = await drain.json();
    expect(drainBody.completed).toBeGreaterThanOrEqual(1);

    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    const got = deliveries[deliveries.length - 1];
    expect(got.headers["x-maven-event"]).toBe("lead.captured");
    const ts = got.headers["x-maven-timestamp"] as string;
    const sig = got.headers["x-maven-signature"] as string;
    expect(sign(OUTBOUND_SECRET, ts, got.raw)).toBe(sig);
    expect(JSON.parse(got.raw).data.leadId).toBe(leadId);

    const done = await db.outboxEvent.findUnique({ where: { id: evt!.id } });
    expect(done!.status).toBe("COMPLETED");
    const log = await db.integrationLog.findFirst({ where: { integrationId: outboundId }, orderBy: { createdAt: "desc" } });
    expect(log).toBeTruthy();
    expect(log!.ok).toBe(true);
  });

  test("hata: 500 tekrarlar, tavan OLUM'e duser, iade + tarama kurtarir", async ({ request }) => {
    receiverMode = "flaky500";
    const cap = await request.post("/api/portal/action", {
      data: { action: "lead-capture", token: sponsorToken, credentialCode, note: "ikinci tarama" },
      headers: virtualClientHeaders(),
    });
    expect(cap.status()).toBe(200);
    const evt = await db.outboxEvent.findFirst({
      where: { eventType: "lead.captured", status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    expect(evt).toBeTruthy();
    createdIds.outbox.push(evt!.id);
    await db.outboxEvent.update({ where: { id: evt!.id }, data: { maxAttempts: 1 } });

    const drain = await request.post("/api/admin/outbox/drain", { data: {}, headers: virtualClientHeaders() });
    expect(drain.status()).toBe(200);
    expect((await drain.json()).dead).toBeGreaterThanOrEqual(1);
    const dead = await db.outboxEvent.findUnique({ where: { id: evt!.id } });
    expect(dead!.status).toBe("DEAD");
    expect(dead!.deadReason).toContain("maxAttempts");

    // operasyon listesi oluyu redakte yukle gosterir
    const ops = await request.get("/api/admin/outbox?status=DEAD", { headers: virtualClientHeaders() });
    expect(ops.status()).toBe(200);
    const opsBody = await ops.json();
    expect(opsBody.items.some((i: { id: string }) => i.id === evt!.id)).toBe(true);

    // iade + saglikli tarama tamamlar
    receiverMode = "ok";
    const retry = await request.post("/api/admin/outbox", { data: { action: "retry", id: evt!.id }, headers: virtualClientHeaders() });
    expect(retry.status()).toBe(200);
    const drain2 = await request.post("/api/admin/outbox/drain", { data: {}, headers: virtualClientHeaders() });
    expect((await drain2.json()).completed).toBeGreaterThanOrEqual(1);
    expect((await db.outboxEvent.findUnique({ where: { id: evt!.id } }))!.status).toBe("COMPLETED");

    const badRetry = await request.post("/api/admin/outbox", { data: { action: "retry", id: evt!.id }, headers: virtualClientHeaders() });
    expect(badRetry.status()).toBe(409); // COMPLETED iade edilmez
  });

  test("gelen: imzasiz 401 + imzali isler + tekrar tekillenir", async ({ request }) => {
    const payload = { type: "PING", eventId: `m28-${SUFFIX}-1`, note: "merhaba" };
    const raw = JSON.stringify(payload);
    const unsigned = await request.post(`/api/integrations/hook/${inboundToken}`, {
      data: payload, headers: virtualClientHeaders(),
    });
    expect(unsigned.status()).toBe(401);

    const ts = Math.floor(Date.now() / 1000).toString();
    const post = (extra: Record<string, string> = {}) =>
      request.post(`/api/integrations/hook/${inboundToken}`, {
        data: raw,
        headers: {
          ...virtualClientHeaders(),
          "Content-Type": "application/json",
          "x-maven-timestamp": ts,
          "x-maven-signature": sign(INBOUND_SECRET, ts, raw),
          ...extra,
        },
      });
    const first = await post();
    expect(first.status()).toBe(200);
    expect((await first.json()).deduped).toBeFalsy();
    const replay = await post();
    expect(replay.status()).toBe(200);
    expect((await replay.json()).deduped).toBe(true);

    // bayat imza reddedilir
    const oldTs = (Math.floor(Date.now() / 1000) - 600).toString();
    const stale = await request.post(`/api/integrations/hook/${inboundToken}`, {
      data: raw,
      headers: {
        ...virtualClientHeaders(),
        "Content-Type": "application/json",
        "x-maven-timestamp": oldTs,
        "x-maven-signature": sign(INBOUND_SECRET, oldTs, raw),
      },
    });
    expect(stale.status()).toBe(401);

    // GET yazim yapmaz
    const logsBefore = await db.integrationLog.count({ where: { integrationId: inboundId } });
    const probe = await request.get(`/api/integrations/hook/${inboundToken}`, { headers: virtualClientHeaders() });
    expect(probe.status()).toBe(200);
    expect((await probe.json()).integration.status).toBe("ACTIVE");
    expect(await db.integrationLog.count({ where: { integrationId: inboundId } })).toBe(logsBefore);

    // bozuk token 404
    const bad = await post();
    void bad;
    const badToken = await request.post("/api/integrations/hook/whk_yok", { data: payload, headers: virtualClientHeaders() });
    expect(badToken.status()).toBe(404);
  });

  test("gelen katilimci: kiraci kapsamli eslesme (capraz sizinti yok)", async ({ request }) => {
    const email = `m28-same-${SUFFIX}@test.dev`;
    const otherTenant = await db.tenant.create({ data: { name: `M28T${SUFFIX}`, slug: `m28t-${SUFFIX}` } });
    createdIds.tenants.push(otherTenant.id);
    const foreign = await db.person.create({ data: { tenantId: otherTenant.id, firstName: "Yabanci", lastName: "Kisi", email } });
    createdIds.persons.push(foreign.id);

    const payload = { type: "PARTICIPANT", eventId: `m28-${SUFFIX}-2`, email, fullName: "Yerel Kisi", company: "M28" };
    const raw = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000).toString();
    const res = await request.post(`/api/integrations/hook/${inboundToken}`, {
      data: raw,
      headers: {
        ...virtualClientHeaders(),
        "Content-Type": "application/json",
        "x-maven-timestamp": ts,
        "x-maven-signature": sign(INBOUND_SECRET, ts, raw),
      },
    });
    expect(res.status()).toBe(200);

    // yabanci kisi bu edisyona BAGLANMADI; kiraci-ici kisi olusturuldu/baglanti
    const foreignLink = await db.eventParticipation.findUnique({
      where: { editionId_personId: { editionId, personId: foreign.id } },
    });
    expect(foreignLink).toBeNull();
    const local = await db.person.findFirst({ where: { tenantId, email } });
    expect(local).toBeTruthy();
    createdIds.persons.push(local!.id);
    const localLink = await db.eventParticipation.findUnique({
      where: { editionId_personId: { editionId, personId: local!.id } },
    });
    expect(localLink).toBeTruthy();
    createdIds.participations.push(localLink!.id);
  });
});
