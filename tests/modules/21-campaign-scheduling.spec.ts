// Modül 21 — ZAMANLANMIŞ KAMPANYA GÖNDERİMİ (scheduledAt tetikleyicisi)
// Kullanıcı hikâyesi: "Etkinlik Öncesi/Sırası/Sonrası için Mailing ve Bildirimleri
// organize edebilmeli" — kampanya ileri bir tarihe planlanabilmeli; zamani gelen
// gönderim kontrol döngüsüyle otomatik dağıtılmalı; iptal edilebilmeli.
// Bu spec bağımsız doğrular:
//   API: schedule (SCHEDULED + activityLog) + gelecek-zaman zorunluluğu 400,
//        tick "henüz zamanı gelmedi" → dokunulmaz, tick "zamani geldi" →
//        LIVE gönderim (SENT + sentAt + scheduledAt temizliği + rapor),
//        iptal (DELETE → DRAFT), durum/validasyon matrisi (404/409/400),
//        UI: Zamanla diyaloğu (datetime-local native-setter) + çip + İptal Et.
// Not: kontrol döngüsü (instrumentation) 60 sn'de bir sunucu içinde de çalışır —
//      "SENT" doğrulaması DB son-durumuna yapılır (kim işlediyse); tick rapor sayıları
//      yarış-toleranslı doğrulanır.
import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const SUFFIX = Date.now().toString(36).slice(-6);

let editionId = "";
let editionTenantId = "";
let createdProviderId = "";
const createdCampaignIds: string[] = [];

function virtualClientHeaders() {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.ceil(Math.random() * 254)}`;
  return { "x-forwarded-for": ip };
}

async function postJSON(request: APIRequestContext, path: string, body: unknown) {
  return request.post(path, { data: body, headers: virtualClientHeaders() });
}

// Turbopack dev derleme-yarışı koruması — yalnız her route'un İLK vuruşunda kullanılır
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

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function createCampaign(name: string, customRecipients: string) {
  const c = await db.campaign.create({
    data: {
      editionId,
      name,
      segmentRule: "zamanlama testi",
      phase: "PRE_EVENT",
      audienceMode: "CUSTOM",
      customRecipients,
      channels: "EMAIL",
      subject: name,
      body: "Zamanlanmış gönderim test mesajıdır.",
      status: "DRAFT",
      // P17.2/P19.3 sözleşmesi: ticari zamanlama/gönderim onay + rıza ister.
      approvalStatus: "APPROVED",
      approvedBy: "m21-spec",
      approvedAt: new Date(),
    },
    select: { id: true },
  });
  createdCampaignIds.push(c.id);
  const emails = customRecipients.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.includes("@"));
  if (emails.length > 0) {
    const have = await db.contactConsent.findMany({
      where: { tenantId: editionTenantId, channel: "EMAIL", purpose: "COMMERCIAL", address: { in: emails } },
      select: { address: true },
    });
    const haveSet = new Set(have.map((h) => h.address));
    const missing = emails.filter((e) => !haveSet.has(e));
    if (missing.length > 0) {
      await db.contactConsent.createMany({
        data: missing.map((address) => ({ tenantId: editionTenantId, channel: "EMAIL", address, purpose: "COMMERCIAL", status: "GRANTED", source: "MANUAL" })),
      });
    }
  }
  return c.id;
}

test.describe.serial("M21 — zamanlanmış kampanya gönderimi", () => {
  test.afterAll(async () => {
    await db.sendDecision.deleteMany({ where: { campaignId: { in: createdCampaignIds } } });
    await db.promoUsage.deleteMany({ where: { campaignId: { in: createdCampaignIds } } });
    await db.campaign.deleteMany({ where: { id: { in: createdCampaignIds } } });
    await db.contactConsent.deleteMany({ where: { tenantId: editionTenantId, address: { contains: SUFFIX } } });
    if (createdProviderId) await db.mailProviderConfig.deleteMany({ where: { id: createdProviderId } });
    await db.$disconnect();
  });

  test("hazırlık — edisyon + DEMO mail sağlayıcısı", async () => {
    const edition = await db.eventEdition.findFirst({ select: { id: true, tenantId: true }, orderBy: { createdAt: "asc" } });
    expect(edition).not.toBeNull();
    editionId = edition!.id;
    editionTenantId = edition!.tenantId;

    const provider = await db.mailProviderConfig.findFirst({ where: { tenantId: editionTenantId, status: "ACTIVE" } });
    if (!provider) {
      const made = await db.mailProviderConfig.create({
        data: { tenantId: editionTenantId, name: `Sched Test SMTP ${SUFFIX}`, kind: "OTHER", fromEmail: "sched@test.local", status: "ACTIVE", isDefault: true, dailyLimit: 5000 },
        select: { id: true },
      });
      createdProviderId = made.id;
    }
  });

  test("zamanla — ileri tarih → SCHEDULED + activityLog izi", async ({ request }) => {
    const id = await createCampaign(`Sched A ${SUFFIX}`, `sched-a-${SUFFIX}@test.crm`);
    const when = new Date(Date.now() + 120_000);
    const res = await postJSONWarm(request, "/api/campaigns/schedule", { campaignId: id, scheduledAt: when.toISOString() });
    expect(res.status()).toBe(200);
    const r = (await res.json()) as { ok: boolean; campaign: { status: string; scheduledAt: string } };
    expect(r.ok).toBe(true);
    expect(r.campaign.status).toBe("SCHEDULED");
    expect(new Date(r.campaign.scheduledAt).getTime()).toBeGreaterThanOrEqual(Date.now() + 60_000);

    const c = await db.campaign.findUnique({ where: { id }, select: { status: true, scheduledAt: true } });
    expect(c?.status).toBe("SCHEDULED");
    expect(c?.scheduledAt).not.toBeNull();

    const log = await db.activityLog.findFirst({ where: { entityType: "campaign", entityId: id, message: { contains: "Zamanlama" } } });
    expect(log).not.toBeNull();
  });

  test("tick — zamanı gelmedi → dokunulmaz (SCHEDULED kalır)", async ({ request }) => {
    const id = createdCampaignIds[0];
    const res = await postJSON(request, "/api/campaigns/tick", { campaignId: id });
    expect(res.status()).toBe(200);
    const r = (await res.json()) as { processed: number };
    expect(r.processed).toBe(0);
    const c = await db.campaign.findUnique({ where: { id }, select: { status: true } });
    expect(c?.status).toBe("SCHEDULED");
  });

  test("tick — zamani geldi → LIVE gönderim + scheduledAt temizliği + rapor", async ({ request }) => {
    const id = await createCampaign(`Sched B ${SUFFIX}`, `sched-b-${SUFFIX}@test.crm`);
    const when = new Date(Date.now() + 2_000); // 2 sn sonra — gelecekte ama hemen due olur
    const res1 = await postJSON(request, "/api/campaigns/schedule", { campaignId: id, scheduledAt: when.toISOString() });
    expect(res1.status()).toBe(200);

    await new Promise((r) => setTimeout(r, 3_000)); // zamani geçir
    const res2 = await postJSON(request, "/api/campaigns/tick", { campaignId: id });
    expect(res2.status()).toBe(200);
    const tick = (await res2.json()) as { processed: number; sent: number; results: { campaignId: string; ok: boolean; totalSent?: number }[] };
    // yarış-tolerans: tick KENDİSİ işlemedeyse processed 1; background döngü çoktan işlediyse 0
    expect([0, 1]).toContain(tick.processed);

    // DB son-durumu kesin: SENT + scheduledAt temiz + sentCount ≥ 1
    const c = await db.campaign.findUnique({ where: { id }, select: { status: true, scheduledAt: true, sentCount: true, sentAt: true, lastSendReport: true } });
    expect(c?.status).toBe("SENT");
    expect(c?.scheduledAt).toBeNull();
    expect(c!.sentCount).toBeGreaterThanOrEqual(1);
    expect(c?.sentAt).not.toBeNull();
    expect(c?.lastSendReport).toContain("LIVE");
  });

  test("iptal — DELETE → taslağa döner, tick göndermez", async ({ request }) => {
    const id = await createCampaign(`Sched C ${SUFFIX}`, `sched-c-${SUFFIX}@test.crm`);
    const res1 = await postJSON(request, "/api/campaigns/schedule", { campaignId: id, scheduledAt: new Date(Date.now() + 300_000).toISOString() });
    expect(res1.status()).toBe(200);

    const res2 = await request.delete(`/api/campaigns/schedule?campaignId=${id}`, { headers: virtualClientHeaders() });
    expect(res2.status()).toBe(200);
    const r2 = (await res2.json()) as { campaign: { status: string } };
    expect(r2.campaign.status).toBe("DRAFT");

    const c = await db.campaign.findUnique({ where: { id }, select: { status: true, scheduledAt: true } });
    expect(c?.status).toBe("DRAFT");
    expect(c?.scheduledAt).toBeNull();

    const res3 = await postJSON(request, "/api/campaigns/tick", { campaignId: id });
    expect(res3.status()).toBe(200);
    expect(((await res3.json()) as { processed: number }).processed).toBe(0);
  });

  test("doğrulama matrisi — 400/404/409", async ({ request }) => {
    // campaignId yok → 400
    expect((await postJSON(request, "/api/campaigns/schedule", { scheduledAt: new Date(Date.now() + 60_000).toISOString() })).status()).toBe(400);
    // geçmiş zaman → 400 PAST_TIME
    const past = await postJSON(request, "/api/campaigns/schedule", { campaignId: createdCampaignIds[0], scheduledAt: new Date(Date.now() - 60_000).toISOString() });
    expect(past.status()).toBe(400);
    expect(((await past.json()) as { code: string }).code).toBe("PAST_TIME");
    // bozuk tarih → 400
    expect((await postJSON(request, "/api/campaigns/schedule", { campaignId: createdCampaignIds[0], scheduledAt: "not-a-date" })).status()).toBe(400);
    // olmayan kampanya → 404
    expect((await postJSON(request, "/api/campaigns/schedule", { campaignId: "no-such-campaign", scheduledAt: new Date(Date.now() + 60_000).toISOString() })).status()).toBe(404);
    // olmayan kampanyaya tick → 404
    expect((await postJSON(request, "/api/campaigns/tick", { campaignId: "no-such-campaign" })).status()).toBe(404);
    // tick campaignId'siz → 400
    expect((await postJSON(request, "/api/campaigns/tick", {})).status()).toBe(400);
    // GÖNDERİLMİŞ kampanya (Sched B — createdCampaignIds[1]) yeniden zamanlanamaz → 409
    const sentCampaign = createdCampaignIds[1];
    expect(sentCampaign).toBeTruthy();
    const reSched = await postJSON(request, "/api/campaigns/schedule", { campaignId: sentCampaign, scheduledAt: new Date(Date.now() + 60_000).toISOString() });
    expect(reSched.status()).toBe(409);
    expect(((await reSched.json()) as { code: string }).code).toBe("INVALID_STATUS");
    // zamanlanmamış kampanyanın (Sched C — createdCampaignIds[2], DRAFT) zamanlaması iptal edilemez → 409
    const notSched = await request.delete(`/api/campaigns/schedule?campaignId=${createdCampaignIds[2]}`, { headers: virtualClientHeaders() });
    expect(notSched.status()).toBe(409);
    expect(((await notSched.json()) as { code: string }).code).toBe("NOT_SCHEDULED");
  });

  test("UI — Zamanla diyaloğu + SCHEDULED çipi + İptal Et", async ({ page }) => {
    test.setTimeout(90_000);
    const id = await createCampaign(`Sched UI ${SUFFIX}`, `sched-ui-${SUFFIX}@test.crm`);

    await page.goto("/");
    const menu = page.getByRole("navigation", { name: /Ana menü|Main menu/i });
    await expect(menu).toBeVisible({ timeout: 15_000 });
    const edSelect = page.getByRole("combobox", { name: /Edisyon seçici|Edition picker/i });
    if (await edSelect.count()) {
      await edSelect.click();
      await page.getByRole("option", { name: /No-Dig Turkey 2026/i }).click();
    }
    await menu.getByRole("button", { name: /İletişim|Communications/i }).click();

    // kampanya kartı + Zamanla butonu (rounded-xl = kampanya kartı; div genel filtre DİŞ wrapper'ı da yakalar — E2E dersi)
    const card = page.locator("div.rounded-xl").filter({ has: page.getByText(`Sched UI ${SUFFIX}`) }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole("button", { name: /Zamanla|Schedule/i }).first().click();

    // datetime-local: React kontrollü input — native-setter hilesi (bilinen tuzak)
    const whenLocal = toLocalInputValue(new Date(Date.now() + 5 * 60_000));
    await page.$eval("#sched-when", (el, v) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, v);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, whenLocal);

    // plan-öngizleme çipi görünür + kaydet
    await expect(page.getByText(/Planlandı:/i)).toBeVisible();
    await page.getByRole("button", { name: /^Zamanla$|^Schedule$/i }).last().click();

    // toast + aynı kartta SCHEDULED durum çipi
    await expect(page.getByText(/^Gönderim zamanlandı$|^Delivery scheduled$/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText(/Zamanlandı · |Scheduled · /i)).toBeVisible({ timeout: 10_000 });

    const c1 = await db.campaign.findUnique({ where: { id }, select: { status: true, scheduledAt: true } });
    expect(c1?.status).toBe("SCHEDULED");
    expect(c1?.scheduledAt).not.toBeNull();

    // İptal Et → taslağa döner
    await expect(card.getByRole("button", { name: /İptal Et|Cancel/i })).toBeVisible({ timeout: 10_000 });
    await card.getByRole("button", { name: /İptal Et|Cancel/i }).first().click();
    await expect(page.getByText(/^Zamanlama iptal edildi$|^Schedule cancelled$/i).first()).toBeVisible({ timeout: 10_000 });

    const c2 = await db.campaign.findUnique({ where: { id }, select: { status: true, scheduledAt: true } });
    expect(c2?.status).toBe("DRAFT");
    expect(c2?.scheduledAt).toBeNull();
  });
});
