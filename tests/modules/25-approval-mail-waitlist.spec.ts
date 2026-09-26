// Modül 25 — KURUM ONAY POSTASI + İÇE AKTARMA BEKLEME LİSTESİ (UI-AKIS 2026 kalan işler)
// Bu spec bağımsız doğrular:
//   API: /api/registrations/approval-mail iki mod — preview yazım-YOK + kurum keşfi
//        (OrganizationContact bağlantısı), send → kurum başına BİR birleştirilmiş
//        mektup ("kayıtlarınız tamamlandı + son resmî onay"), ulaşılabilirlik kuralları
//        (e-postasız kurum başarısız detayı), 400 koruması.
//   API: /api/reservations/import onStockShortage:"WAITLIST" — stok yetersiz Teyit
//        satırı reddedilmez, BEKLEME LİSTESİNE alınır; stok ASLA aşılmaz (invariant).
// Temizlik: afterAll'da test kurumu/kontak/katılım/kayıt/rezervasyon/otel silinir.
import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { removeDevtoolsOverlay } from "./_helpers";

const db = new PrismaClient();
const SUFFIX = Date.now().toString(36).slice(-6);
const ORG_NAME = `Kanıt Kurum ${SUFFIX}`;
const ORG_EMAIL = `m25-org-${SUFFIX}@test.mail`;
const PERSON_FIRST = `Doruk${SUFFIX}`;
const HOTEL_NAME = `E2E Bekleme Otel ${SUFFIX}`;
const BLOCK_NAME = `Bekleme Blok ${SUFFIX}`;

let editionId = "";
let tenantId = "";
let orgId = "";
let personId = "";
let registrationId = "";
let hotelId = "";
let blockId = "";

function virtualClientHeaders() {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.ceil(Math.random() * 254)}`;
  return { "x-forwarded-for": ip };
}
async function postJSON(request: APIRequestContext, path: string, body: unknown) {
  return request.post(path, { data: body, headers: virtualClientHeaders() });
}
// Turbopack dev derleme-yarışı koruması — route'un İLK vuruşunda JSON gelene dek yeniden dener
async function postJSONWarm(request: APIRequestContext, path: string, body: unknown) {
  let last = await postJSON(request, path, body);
  for (let i = 0; i < 5; i++) {
    if ((last.headers()["content-type"] ?? "").includes("application/json")) return last;
    await new Promise((r) => setTimeout(r, 2_500));
    last = await postJSON(request, path, body);
  }
  return last;
}

test.describe.serial("M25 — kurum onay postası + bekleme listesi", () => {
  test.afterAll(async () => {
    // sıra: kayıtlar → rezervasyonlar → otel (cascade) → kontak → katılım → kişi → kurum
    if (registrationId) await db.registration.deleteMany({ where: { editionId, id: registrationId } });
    await db.reservation.deleteMany({ where: { editionId, OR: [{ guestName: { contains: SUFFIX } }] } });
    if (hotelId) await db.hotelProperty.delete({ where: { id: hotelId } }).catch(() => undefined);
    await db.organizationContact.deleteMany({ where: { organizationId: orgId } });
    await db.eventParticipation.deleteMany({ where: { editionId, personId } });
    await db.person.deleteMany({ where: { id: personId } });
    await db.organization.deleteMany({ where: { id: orgId } });
    await db.$disconnect();
  });

  test("hazırlık — kurum + genel e-posta + kişi kontak bağı + CONFIRMED kayıt + envanter dışı otel", async () => {
    const edition = await db.eventEdition.findFirst({ select: { id: true, tenantId: true }, orderBy: { createdAt: "asc" } });
    expect(edition).not.toBeNull();
    editionId = edition!.id;
    tenantId = edition!.tenantId;

    const org = await db.organization.create({ data: { tenantId, name: ORG_NAME, generalEmail: ORG_EMAIL } });
    orgId = org.id;
    const person = await db.person.create({ data: { tenantId, firstName: PERSON_FIRST, lastName: `Testci ${SUFFIX}`, email: `m25-${SUFFIX}@test.mail` } });
    personId = person.id;
    await db.organizationContact.create({ data: { organizationId: orgId, personId, name: `${PERSON_FIRST} Testci`, email: ORG_EMAIL, isPrimary: true } });
    const part = await db.eventParticipation.create({ data: { editionId, personId } });
    const reg = await db.registration.create({ data: { editionId, participationId: part.id, status: "CONFIRMED", decidedAt: new Date() } });
    registrationId = reg.id;

    // envanter-dışı test oteli: blok VAR ama gecelik stok YOK → CONFIRMED stok hatası verir
    const hotel = await db.hotelProperty.create({ data: { editionId, name: HOTEL_NAME } });
    hotelId = hotel.id;
    const rt = await db.roomType.create({ data: { hotelId, name: "Standart", capacity: 2, pricePerNight: 30000 } });
    const block = await db.roomBlock.create({ data: { hotelId, roomTypeId: rt.id, name: BLOCK_NAME } });
    blockId = block.id;
  });

  test("onay postası önizleme — yazım YOK + kurum keşfi + sayaç", async ({ request }) => {
    const res = await postJSONWarm(request, "/api/registrations/approval-mail", { editionId });
    expect(res.status()).toBe(200);
    const pv = (await res.json()) as { mode: string; organizations: { organizationId: string; name: string; email: string | null; approvedCount: number }[] };
    expect(pv.mode).toBe("preview");
    const mine = pv.organizations.find((o) => o.organizationId === orgId);
    expect(mine).toBeTruthy();
    expect(mine!.name).toBe(ORG_NAME);
    expect(mine!.email).toBe(ORG_EMAIL);
    expect(mine!.approvedCount).toBeGreaterThanOrEqual(1); // en az kendi test kaydımız
  });

  test("onay postası gönderim — kurum başına BİR mektup + entegrasyon logu + activity", async ({ request }) => {
    // aktif sağlayıcı garanti altına alınır (sandbox'ta simülasyon motoru çalışır)
    const provider = await db.mailProviderConfig.findFirst({ where: { tenantId, status: "ACTIVE" } });
    if (!provider) {
      await db.mailProviderConfig.create({
        data: { tenantId, name: `test-smtp-${SUFFIX}`, kind: "SMTP", host: "localhost", port: 25, fromEmail: `no-reply@test.mail`, status: "ACTIVE", isDefault: true },
      });
    }
    const res = await postJSON(request, "/api/registrations/approval-mail", { editionId, mode: "send", organizationIds: [orgId] });
    expect(res.status()).toBe(200);
    const r = (await res.json()) as { mode: string; sent: number; failed: number; totalApproved: number; details: { organizationId: string; ok: boolean; approvedCount: number }[] };
    expect(r.mode).toBe("send");
    const mine = r.details.find((d) => d.organizationId === orgId);
    expect(mine?.ok).toBe(true);
    expect(mine!.approvedCount).toBeGreaterThanOrEqual(1);
    expect(r.sent).toBeGreaterThanOrEqual(1);
    expect(r.totalApproved).toBeGreaterThanOrEqual(1);
    // gönderim kaydı — entegrasyon günlüğünde konu satırı
    const log = await db.integrationLog.findFirst({
      where: { direction: "OUTBOUND", method: "MAIL", summary: { contains: "son resmî onay" } },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    // denetim — activity log
    const act = await db.activityLog.findFirst({
      where: { editionId, message: { contains: `Kurum onay postası gönderildi: ${ORG_NAME}` } },
      orderBy: { createdAt: "desc" },
    });
    expect(act).not.toBeNull();
  });

  test("onay postası koruması — kurumsuz seçim 400 + e-postasız kurum başarısız detayı", async ({ request }) => {
    const empty = await postJSON(request, "/api/registrations/approval-mail", { editionId, mode: "send", organizationIds: [] });
    expect(empty.status()).toBe(400);

    // genel e-postası olan kurumun mail adresini geçici boz: ulaşılabilirlik kuralı
    await db.organization.update({ where: { id: orgId }, data: { generalEmail: null } });
    const res = await postJSON(request, "/api/registrations/approval-mail", { editionId, mode: "send", organizationIds: [orgId] });
    expect(res.status()).toBe(200);
    const r = (await res.json()) as { sent: number; failed: number; details: { organizationId: string; ok: boolean; error?: string }[] };
    const mine = r.details.find((d) => d.organizationId === orgId);
    expect(mine?.ok).toBe(false);
    expect(mine?.error).toContain("e-postası");
    await db.organization.update({ where: { id: orgId }, data: { generalEmail: ORG_EMAIL } }); // geri al
  });

  test("içe aktarma bekleme listesi — stok yetersiz Teyit satırı WAITLIST'e düşer, stok değişmez", async ({ request }) => {
    const rows = [
      { "Misafir Adı": `Bekleme Misafir ${SUFFIX}`, "Otel": HOTEL_NAME, "Blok": BLOCK_NAME, "Giriş Tarihi": "10.05.2026", "Çıkış Tarihi": "13.05.2026", "Durum": "Teyit" },
    ];
    // önce STOKSIZ bekleme: onStockShortage:"WAITLIST" → kayıt WAITLIST olarak yaratılır
    const res = await postJSON(request, "/api/reservations/import", {
      editionId, rows, commit: true, onStockShortage: "WAITLIST",
    });
    expect(res.status()).toBe(201);
    const r = (await res.json()) as { mode: string; created: number; waitlisted: number; skipped: number; stockNights: number };
    expect(r.created).toBe(1);
    expect(r.waitlisted).toBe(1);
    expect(r.skipped).toBe(0);
    expect(r.stockNights).toBe(0); // WAITLIST stok tüketmez

    const made = await db.reservation.findFirst({ where: { editionId, guestName: `Bekleme Misafir ${SUFFIX}` } });
    expect(made).not.toBeNull();
    expect(made!.status).toBe("WAITLIST");
    expect(made!.blockId).toBe(blockId);
    expect(made!.notes).toContain("bekleme listesine alındı");
    // envanter yok — stok satırı hiç doğmadı
    const invCount = await db.inventoryNight.count({ where: { blockId } });
    expect(invCount).toBe(0);

    // varsayılan politika: reject → aynı satır DB-dup sorunuyla atlanır (çakışan tarih)
    const res2 = await postJSON(request, "/api/reservations/import", { editionId, rows, commit: true });
    expect(res2.status()).toBe(201);
    const r2 = (await res2.json()) as { created: number; skipped: number; failures: { reason: string }[] };
    expect(r2.created).toBe(0);
    expect(r2.skipped).toBe(1);
  });
});
