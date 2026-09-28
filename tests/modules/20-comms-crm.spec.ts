// Modül 20 — İLETİŞİM: MÜŞTERİ DATASI + ÇOK KANALLI KAMPANYA + ANLIK YAYIN
// Kullanıcı talebi: üst firma katılımcılardan müşteri datası üretmeli; bu havuza
// mail/SMS/WhatsApp'tan TEKİL ve TOPLU bildirim gidebilmeli; anlık program
// değişiklikleri aşama hiyerarşisinde (Öncesi/Sırası/Sonrası) arşivlenmeli.
// Bu spec bağımsız doğrular:
//   API: müşteri kontağı CRUD + mükerrer 409 + doğrulama 400 + kiracı kapsamı,
//        katılımcılardan aktarım (yarat/birleştir/atasız-skip + idempotent),
//        kampanya çok-kanallı TEST/LIVE gönderim (DEMO sağlayıcı simülasyonu),
//        anlık yayın toplu (SMS+WA) ve tekil (SINGLE), portal duyurusu,
//        xlsx export parse kanıtı, yabancı-edition 404.
// Temizlik: oluşturulan kişi/kontak/kampanya/duyuru/sağlayıcı/kanal kayıtları silinir.
import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const db = new PrismaClient();
const SUFFIX = Date.now().toString(36).slice(-6);

let editionId = "";
let editionTenantId = "";
let categoryId = "";
let createdProviderId = "";
let channelCfgCreated = false;
let channelCfgOriginal: { channelsEnabled: boolean; waEnabled: boolean; waProvider: string | null; smsEnabled: boolean; smsProvider: string | null } | null = null;
const createdPersonIds: string[] = [];
const createdContactIds: string[] = [];
const createdCampaignIds: string[] = [];
const createdAnnouncementIds: string[] = [];

const PARTICIPANTS = [
  { first: "Elif", last: "Data1", email: `m20-elif-${SUFFIX}@test.crm`, phone: "+905321110001" },
  { first: "Barış", last: "Data2", email: `m20-baris-${SUFFIX}@test.crm`, phone: null },
  { first: "Ceyda", last: "Data3", email: null, phone: "+905321110003" },
  { first: "Deniz", last: "Data4", email: null, phone: null }, // iletişimsiz → skip
];

function virtualClientHeaders() {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.ceil(Math.random() * 254)}`;
  return { "x-forwarded-for": ip };
}

async function postJSON(request: APIRequestContext, path: string, body: unknown) {
  return request.post(path, { data: body, headers: virtualClientHeaders() });
}

// Turbopack dev derleme-yarışı koruması: taze restart sonrası bir route'un İLK isteği
// nadiren HTML 404 dönebilir ("compile: 15s" → manifest hazır değil). JSON gelene kadar
// kısa aralıklarla yeniden dener — yalnız her route'un İLK vuruşunda kullanılır.
async function postJSONWarm(request: APIRequestContext, path: string, body: unknown, tries = 5): Promise<APIResponse> {
  let last: APIResponse | null = null;
  for (let i = 0; i < tries; i++) {
    last = await postJSON(request, path, body);
    if ((last.headers()["content-type"] ?? "").includes("application/json")) return last;
    await new Promise((r) => setTimeout(r, 2_500));
  }
  if (!last) throw new Error(`route hiç yanıt vermedi: ${path}`);
  return last;
}

test.describe.serial("M20 — müşteri datası + çok kanallı yayın", () => {
  test.afterAll(async () => {
    await db.portalAnnouncement.deleteMany({ where: { id: { in: createdAnnouncementIds } } });
    // P17.2/P19: karar denetimi + kullanım izleri kampanyaya bağlı temizlenir
    await db.sendDecision.deleteMany({ where: { campaignId: { in: createdCampaignIds } } });
    await db.promoUsage.deleteMany({ where: { campaignId: { in: createdCampaignIds } } });
    await db.campaign.deleteMany({ where: { id: { in: createdCampaignIds } } });
    await db.contactConsent.deleteMany({
      where: { tenantId: editionTenantId, OR: [{ address: { contains: SUFFIX } }, { address: { in: ["905321110001", "905321110003", "905321110009"] } }] },
    });
    await db.customerContact.deleteMany({ where: { id: { in: createdContactIds } } });
    await db.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    if (createdProviderId) await db.mailProviderConfig.deleteMany({ where: { id: createdProviderId } });
    // kanal yapılandırmasını hazırlık-öncesi haline geri çevir
    if (channelCfgCreated) {
      await db.notificationChannelConfig.deleteMany({ where: { editionId } });
    } else if (channelCfgOriginal) {
      await db.notificationChannelConfig.updateMany({ where: { editionId }, data: channelCfgOriginal });
    }
    await db.$disconnect();
  });

  test("hazırlık — edisyon + kategori + katılımcılar + DEMO kanal/sağlayıcı", async () => {
    const edition = await db.eventEdition.findFirst({ select: { id: true, tenantId: true }, orderBy: { createdAt: "asc" } });
    expect(edition).not.toBeNull();
    editionId = edition!.id;
    editionTenantId = edition!.tenantId;

    const cat = await db.registrationCategory.create({
      data: { editionId, name: `CRM Kategori ${SUFFIX}`, code: `CRM${SUFFIX}`, capacity: 100 },
      select: { id: true },
    });
    categoryId = cat.id;

    for (const p of PARTICIPANTS) {
      const person = await db.person.create({
        data: {
          tenantId: editionTenantId, firstName: p.first, lastName: `${p.last}${SUFFIX}`,
          email: p.email, phone: p.phone, status: "ACTIVE",
        },
        select: { id: true },
      });
      createdPersonIds.push(person.id);
      await db.eventParticipation.create({ data: { editionId, personId: person.id, source: "ADMIN_ENTRY" }, select: { id: true } });
      if (p.email) {
        const participation = await db.eventParticipation.findFirst({ where: { editionId, personId: person.id } });
        await db.registration.create({
          data: { editionId, participationId: participation!.id, categoryId, status: "CONFIRMED" },
          select: { id: true },
        });
      }
    }

    // DEMO mail sağlayıcısı (yoksa) — dispatchMail ACTIVE provider arar
    const provider = await db.mailProviderConfig.findFirst({ where: { tenantId: editionTenantId, status: "ACTIVE" } });
    if (!provider) {
      const made = await db.mailProviderConfig.create({
        data: { tenantId: editionTenantId, name: `CRM Test SMTP ${SUFFIX}`, kind: "OTHER", fromEmail: "crm@test.local", status: "ACTIVE", isDefault: true, dailyLimit: 5000 },
        select: { id: true },
      });
      createdProviderId = made.id;
    }

    // DEMO WhatsApp/SMS kanal yapılandırması (gönderim simülasyonu) —
    // mevcut yapılandırma VARSA geçici olarak etkinleştirilir, afterAll'da geri alınır
    const cfg = await db.notificationChannelConfig.findUnique({ where: { editionId } });
    if (!cfg) {
      await db.notificationChannelConfig.create({
        data: {
          editionId, channelsEnabled: true,
          waEnabled: true, waProvider: "DEMO",
          smsEnabled: true, smsProvider: "DEMO",
        },
      });
      channelCfgCreated = true;
    } else {
      channelCfgOriginal = {
        channelsEnabled: cfg.channelsEnabled, waEnabled: cfg.waEnabled, waProvider: cfg.waProvider,
        smsEnabled: cfg.smsEnabled, smsProvider: cfg.smsProvider,
      };
      await db.notificationChannelConfig.update({
        where: { editionId },
        data: { channelsEnabled: true, waEnabled: true, waProvider: "DEMO", smsEnabled: true, smsProvider: "DEMO" },
      });
    }
  });

  test("müşteri datası — tekil ekle 201 + mükerrer 409 + doğrulama 400", async ({ request }) => {
    const res = await postJSON(request, "/api/customer-contacts", {
      displayName: "Ali Manuell", email: `m20-ali-${SUFFIX}@test.crm`, phone: "+905321110009",
      company: "Manuel A.Ş.", tags: `test${SUFFIX},vip`, kind: "PERSON",
    });
    expect(res.status()).toBe(201);
    const created = (await res.json()) as { id: string; email: string };
    expect(created.id).toBeTruthy();
    expect(created.email).toBe(`m20-ali-${suf()}@test.crm`); // lowercase normalizasyon
    createdContactIds.push(created.id);

    // mükerrer (aynı e-posta) → 409
    const dup = await postJSON(request, "/api/customer-contacts", {
      displayName: "Ali Kopya", email: `M20-ALI-${SUFFIX}@TEST.CRM`, phone: "+905321110010",
    });
    expect(dup.status()).toBe(409);

    // e-postasız + telefonsuz → 400
    const bad = await postJSON(request, "/api/customer-contacts", { displayName: "İletişimsiz" });
    expect(bad.status()).toBe(400);

    // bozuk e-posta → 400
    const badEmail = await postJSON(request, "/api/customer-contacts", { displayName: "Bozuk", email: "not-an-email" });
    expect(badEmail.status()).toBe(400);
  });

  test("kiracı kapsamı — tenantId'siz liste 400 (strict tenant)", async ({ request }) => {
    const res = await request.get("/api/customer-contacts");
    expect(res.status()).toBe(400);
  });

  test("katılımcılardan aktarım — yarat/birleştir/skip + idempotent", async ({ request }) => {
    const res = await postJSONWarm(request, "/api/customer-contacts/import-participants", {
      editionId, tag: `m20-${SUFFIX}`,
    });
    expect(res.status()).toBe(201);
    const r1 = (await res.json()) as { created: number; merged: number; skipped: number; total: number };
    expect(r1.created).toBeGreaterThanOrEqual(3); // Elif, Barış, Ceyda (+ Ali manuel değil — onun katılımı yok)
    expect(r1.skipped).toBeGreaterThanOrEqual(1); // Deniz — iletişimsiz

    // ikinci koşum: yeniden yaratma YOK — birleştirme
    const res2 = await postJSON(request, "/api/customer-contacts/import-participants", { editionId, tag: `m20-${SUFFIX}` });
    expect(res2.status()).toBe(201);
    const r2 = (await res2.json()) as { created: number; merged: number };
    expect(r2.created).toBe(0);
    expect(r2.merged).toBeGreaterThanOrEqual(3);

    // havuz satırları izlensin (temizlik için)
    const pool = await db.customerContact.findMany({ where: { tenantId: editionTenantId, tags: { contains: `m20-${SUFFIX}` } }, select: { id: true } });
    for (const row of pool) createdContactIds.push(row.id);

    // yabancı edisyon → 404
    const res3 = await postJSON(request, "/api/customer-contacts/import-participants", { editionId: "no-such-edition" });
    expect(res3.status()).toBe(404);
  });

  test("kampanya — çok kanallı + filtreli hedef oluştur", async ({ request }) => {
    const res = await postJSON(request, "/api/campaigns", {
      editionId,
      name: `CRM Kampanya ${SUFFIX}`,
      segmentRule: "müşteri havuzu",
      phase: "PRE_EVENT",
      audienceMode: "SEGMENT",
      channels: "EMAIL,SMS,WHATSAPP",
      audienceJson: JSON.stringify({ customerOnly: true, categories: [], requireEmail: true, requirePhone: false }),
      subject: "M20 test kampanyası",
      isSegmentFixed: true,
    });
    expect(res.status()).toBe(201);
    const c = (await res.json()) as { id: string; channels: string };
    expect(c.channels).toBe("EMAIL,SMS,WHATSAPP");
    createdCampaignIds.push(c.id);
  });

  test("kampanya TEST gönderim — yalnız test alıcısı", async ({ request }) => {
    const id = createdCampaignIds[0];
    const res = await postJSONWarm(request, "/api/campaigns/send", {
      campaignId: id, mode: "TEST", testEmail: `m20-test-${SUFFIX}@test.crm`,
    });
    expect(res.status()).toBe(200);
    const rep = (await res.json()) as { mode: string; totalSent: number; channels: Record<string, { attempted: number; sent: number }> };
    expect(rep.mode).toBe("TEST");
    expect(rep.totalSent).toBeGreaterThanOrEqual(1);
    expect(rep.channels.EMAIL?.sent).toBe(1);

    const c = await db.campaign.findUnique({ where: { id }, select: { status: true, lastSendReport: true } });
    expect(c?.status).toBe("TESTED");
    expect(c?.lastSendReport).toContain("TEST");
  });

  test("kampanya LIVE gönderim — müşteri havuzuna çok kanallı", async ({ request }) => {
    const id = createdCampaignIds[0];
    // P17.2/P19.3 sözleşmesi: ticari LIVE — onay + kanal rızaları gerekir.
    await db.campaign.update({ where: { id }, data: { approvalStatus: "APPROVED", approvedBy: "m20-spec", approvedAt: new Date() } });
    const seedEmails = [`m20-elif-${SUFFIX}@test.crm`, `m20-baris-${SUFFIX}@test.crm`, `m20-ali-${SUFFIX}@test.crm`];
    const seedPhones = ["905321110001", "905321110003", "905321110009"];
    const wanted = [
      ...seedEmails.map((address) => ({ channel: "EMAIL", address })),
      ...seedPhones.flatMap((address) => (["SMS", "WHATSAPP"] as const).map((channel) => ({ channel, address }))),
    ];
    const have = await db.contactConsent.findMany({
      where: { tenantId: editionTenantId, purpose: "COMMERCIAL", OR: wanted },
      select: { channel: true, address: true },
    });
    const haveKeys = new Set(have.map((h) => `${h.channel}:${h.address}`));
    const missing = wanted.filter((w) => !haveKeys.has(`${w.channel}:${w.address}`));
    if (missing.length > 0) {
      await db.contactConsent.createMany({
        data: missing.map((w) => ({ tenantId: editionTenantId, channel: w.channel, address: w.address, purpose: "COMMERCIAL", status: "GRANTED", source: "MANUAL" })),
      });
    }
    const res = await postJSON(request, "/api/campaigns/send", { campaignId: id, mode: "LIVE" });
    expect(res.status()).toBe(200);
    const rep = (await res.json()) as { mode: string; totalSent: number; audienceSize: number; channels: Record<string, { attempted: number; sent: number; skipped: number }> };
    expect(rep.mode).toBe("LIVE");
    // havuzda e-postalı en az 3 kontak (Elif, Barış, Ali) — customerOnly + requireEmail
    expect(rep.channels.EMAIL?.attempted).toBeGreaterThanOrEqual(3);
    expect(rep.channels.EMAIL?.sent).toBe(rep.channels.EMAIL?.attempted); // DEMO — hepsi kabul
    // havuzda telefonlu kontaklar: Ceyda (telefonlu, e-postasız → requireEmail'e takılır)
    // VE Ali (e-posta+telefon) → SMS/WhatsApp denenen alıcı sayısı ≥ 1
    expect(rep.channels.SMS?.attempted).toBeGreaterThanOrEqual(1);
    expect(rep.channels.WHATSAPP?.attempted).toBe(rep.channels.SMS?.attempted);

    const c = await db.campaign.findUnique({ where: { id }, select: { status: true, sentCount: true, lastSendReport: true } });
    expect(c?.status).toBe("SENT");
    expect(c!.sentCount).toBe(rep.totalSent);
    expect(c?.lastSendReport).toBeTruthy();
  });

  test("anlık yayın — toplu SMS+WhatsApp (katılımcılar) + portal duyurusu", async ({ request }) => {
    const res = await postJSONWarm(request, "/api/notifications/instant", {
      editionId,
      phase: "DURING_EVENT",
      title: `Program değişikliği ${SUFFIX}`,
      body: "Açılış oturumu 14:00'a alınmıştır.",
      channels: ["SMS", "WHATSAPP"],
      audienceMode: "ALL_PARTICIPANTS",
      createPortalAnnouncement: true,
    });
    expect(res.status()).toBe(200);
    const r = (await res.json()) as { campaignId: string; report: { totalSent: number; channels: Record<string, { attempted: number; sent: number }> } };
    createdCampaignIds.push(r.campaignId);
    // telefonlu katılımcılar: Elif + Ceyda
    expect(r.report.channels.SMS?.attempted).toBeGreaterThanOrEqual(2);
    expect(r.report.totalSent).toBeGreaterThanOrEqual(2);

    // arşiv: aşama hiyerarşisinde kampanya + portal duyurusu
    const camp = await db.campaign.findUnique({ where: { id: r.campaignId } });
    expect(camp).not.toBeNull();
    expect(camp!.phase).toBe("DURING_EVENT");
    expect(camp!.status).toBe("SENT");
    expect(camp!.name).toContain("Program değişikliği");
    const ann = await db.portalAnnouncement.findFirst({ where: { editionId, title: { contains: SUFFIX } } });
    expect(ann).not.toBeNull();
    if (ann) createdAnnouncementIds.push(ann.id);
  });

  test("anlık yayın — tekil (SINGLE) + doğrulama matrisi", async ({ request }) => {
    const res = await postJSON(request, "/api/notifications/instant", {
      editionId,
      phase: "POST_EVENT",
      title: `Tekil teşekkür ${SUFFIX}`,
      body: "Katılımınız için teşekkürler.",
      channels: ["EMAIL"],
      audienceMode: "SINGLE",
      single: { name: "Test Alıcı", email: `m20-single-${SUFFIX}@test.crm` },
    });
    expect(res.status()).toBe(200);
    const r = (await res.json()) as { report: { totalSent: number } };
    expect(r.report.totalSent).toBe(1);
    const arch = await db.campaign.findFirst({ where: { editionId, name: { contains: "Tekil teşekkür" } }, select: { id: true } });
    expect(arch).not.toBeNull();
    if (arch) createdCampaignIds.push(arch.id);

    // doğrulama: başlık yok → 400
    const noTitle = await postJSON(request, "/api/notifications/instant", { editionId, title: "", body: "x", channels: ["EMAIL"], audienceMode: "SINGLE", single: { email: "a@b.co" } });
    expect(noTitle.status()).toBe(400);
    // kanal yok → 400
    const noCh = await postJSON(request, "/api/notifications/instant", { editionId, title: "x", body: "x", channels: [], audienceMode: "SINGLE", single: { email: "a@b.co" } });
    expect(noCh.status()).toBe(400);
    // CUSTOM boş liste → 400
    const noCustom = await postJSON(request, "/api/notifications/instant", { editionId, title: "x", body: "x", channels: ["EMAIL"], audienceMode: "CUSTOM", customRecipients: "  " });
    expect(noCustom.status()).toBe(400);
    // yabancı edisyon → 404
    const foreign = await postJSON(request, "/api/notifications/instant", { editionId: "no-such-edition", title: "x", body: "x", channels: ["EMAIL"], audienceMode: "SINGLE", single: { email: "a@b.co" } });
    expect(foreign.status()).toBe(404);
    // sahte kampanya → 404
    const fake = await postJSON(request, "/api/campaigns/send", { campaignId: "no-such-campaign", mode: "LIVE" });
    expect(fake.status()).toBe(404);
  });

  test("müşteri datası export — xlsx parse kanıtı", async ({ request }) => {
    const res = await request.get(`/api/customer-contacts/export?tenantId=${editionTenantId}&tag=m20-${SUFFIX}`, { headers: virtualClientHeaders() });
    expect(res.status()).toBe(200);
    const buf = Buffer.from(await res.body());
    expect(buf.length).toBeGreaterThan(1000);
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    expect(String(aoa[0][0])).toContain("MÜŞTERİ İLETİŞİM DATASI");
    const headerIdx = aoa.findIndex((row) => row[0] === "Ad / Kurum");
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    const rows = aoa.slice(headerIdx + 1).filter((r) => r[0]);
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  function suf() { return SUFFIX; }
});
