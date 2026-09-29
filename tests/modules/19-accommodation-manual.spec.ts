// Modül 19 — Konaklama: MANUEL REZERVASYON + STOK YÖNETİMİ + ODA LİSTESİ EXPORT
// Kullanıcı ilkesi: "Tek bir veri girişi kaynağı olmamalı — her zaman manuel veri
// girişi de olmalı." Konaklamada rezervasyonun YÖNETİM yüzeyi yoktu (yalnız seed/
// portal); bu spec yeni yönetim zincirini bağımsız doğrular:
//   API: manuel rezervasyon (katılımlı CONFIRMED → stok tüketimi + slot), 409
//        mükerrer (tarih çakışması), 409 stok yok, 400 doğrulama, envanter dışı
//        serbest misafir, oda tipi→blok→gecelik stok zinciri (add/set/clamp),
//        oda listesi xlsx export (SheetJS parse kanıtı)
//   UI : Konaklama → Manuel Rezervasyon diyaloğu → serbest misafir girişi → listede görünür
// Temizlik: oluşturulan kişi + otel (cascade) + rezervasyonlar silinir.
import { test, expect, type APIRequestContext } from "@playwright/test";
import { isolateClientIp } from './_helpers';
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const db = new PrismaClient();
const SUFFIX = Date.now().toString(36).slice(-6);

let editionId = "";
let editionTenantId = "";
let hotelId = "";       // seed oteli (blok + envanterli)
let blockId = "";       // seed blok
let invDateIso = "";    // envanterin tanımlı olduğu gece (YYYY-MM-DD)
let participationId = "";
let ratePerNight = 0;
const createdEmails: string[] = [];
const createdResIds: string[] = [];
const createdHotelIds: string[] = [];

function virtualClientHeaders() {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.ceil(Math.random() * 254)}`;
  return { "x-forwarded-for": ip };
}

async function postJSON(request: APIRequestContext, path: string, body: unknown) {
  return request.post(path, { data: body, headers: virtualClientHeaders() });
}

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shiftIso = (iso: string, days: number) => {
  const [y, m, dd] = iso.split("-").map(Number);
  return isoOf(new Date(y, m - 1, dd + days, 12));
};

test.describe.serial("M19 — manuel rezervasyon + stok + export", () => {
  test.afterAll(async () => {
    // Rezervasyonlar + kişi (cascade Participation) + test oteli (cascade RoomType/Block/Inventory)
    if (createdResIds.length > 0) {
      await db.reservation.deleteMany({ where: { id: { in: createdResIds } } });
    }
    if (createdEmails.length > 0) {
      await db.person.deleteMany({ where: { email: { in: createdEmails } } });
    }
    if (createdHotelIds.length > 0) {
      await db.hotelProperty.deleteMany({ where: { id: { in: createdHotelIds } } });
    }
    await db.$disconnect();
  });

  test("hazırlık — edisyon + seed otel/blok/envanter çöz", async () => {
    const edition = await db.eventEdition.findFirst({ select: { id: true, tenantId: true }, orderBy: { createdAt: "asc" } });
    expect(edition).not.toBeNull();
    editionId = edition!.id;
    editionTenantId = edition!.tenantId;

    const hotel = await db.hotelProperty.findFirst({
      where: { editionId },
      include: { blocks: { include: { roomType: true, inventoryNights: { orderBy: { date: "asc" } } } } },
    });
    expect(hotel).not.toBeNull();
    hotelId = hotel!.id;
    const block = hotel!.blocks.find((b) => b.inventoryNights.length > 0);
    expect(block).toBeDefined();
    blockId = block!.id;
    ratePerNight = block!.roomType.pricePerNight;
    const inv = block!.inventoryNights[0];
    const d = new Date(inv.date);
    invDateIso = isoOf(d); // yerel bileşenler — seed de yerel saatli yazar
  });

  test("manuel rezervasyon — katılımlı CONFIRMED stok tüketir + slot açar", async ({ request }) => {
    // test kişisi + katılımı (db doğrudan — admin zinciri spec 18'de kapsandı)
    const email = `m19-hakan-${SUFFIX}@test.reserv`;
    createdEmails.push(email);
    const person = await db.person.create({
      data: { tenantId: editionTenantId, firstName: "Hakan", lastName: `Reserv${SUFFIX}`, email, status: "ACTIVE" },
      select: { id: true },
    });
    const participation = await db.eventParticipation.create({
      data: { editionId, personId: person.id, source: "ADMIN_ENTRY" },
      select: { id: true },
    });
    participationId = participation.id;

    const invBefore = await db.inventoryNight.findFirst({
      where: { blockId, date: { gte: new Date(`${invDateIso}T00:00:00`), lt: new Date(`${shiftIso(invDateIso, 1)}T00:00:00`) } },
      select: { id: true, reservedRooms: true, totalRooms: true },
    });
    expect(invBefore).not.toBeNull();

    const res = await postJSON(request, "/api/reservations/manual", {
      editionId,
      participationId,
      blockId,
      hotelId,
      checkIn: invDateIso,
      checkOut: shiftIso(invDateIso, 1),
      occupancyType: "SINGLE",
      payerType: "ORGANIZATION",
      payerName: "Delta Üniversitesi",
      status: "CONFIRMED",
      notes: `M19 manuel rezervasyon ${SUFFIX}`,
    });
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { reservationId: string; guestName: string; nights: number; stockConsumed: boolean; occupancySlotCreated: boolean; ratePerNight: number };
    createdResIds.push(body.reservationId);
    expect(body.stockConsumed).toBe(true);
    expect(body.occupancySlotCreated).toBe(true);
    expect(body.nights).toBe(1);
    expect(body.guestName).toContain("Hakan");
    // fiyat devralma: girilmezse oda tipinin kontrat fiyatı
    expect(body.ratePerNight).toBe(ratePerNight);

    // DB kanıtı — stok +1, slot pozisyon 1, durum CONFIRMED
    const invAfter = await db.inventoryNight.findUnique({ where: { id: invBefore!.id } });
    expect(invAfter!.reservedRooms).toBe(invBefore!.reservedRooms + 1);
    const row = await db.reservation.findUnique({
      where: { id: body.reservationId },
      include: { occupancySlots: true, primaryGuest: { include: { person: true } } },
    });
    expect(row!.status).toBe("CONFIRMED");
    expect(row!.payerName).toBe("Delta Üniversitesi");
    expect(row!.primaryGuest?.person.email).toBe(email);
    expect(row!.occupancySlots).toHaveLength(1);
    expect(row!.occupancySlots[0].position).toBe(1);
  });

  test("manuel rezervasyon — çakışan tarih 409 DUPLICATE", async ({ request }) => {
    const res = await postJSON(request, "/api/reservations/manual", {
      editionId,
      participationId,
      blockId,
      checkIn: invDateIso, // aynı gece — aktif rezervasyonla çakışır
      checkOut: shiftIso(invDateIso, 2),
      status: "REQUESTED",
    });
    expect(res.status()).toBe(409);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("DUPLICATE");
    expect(body.error).toContain("çakışan");
  });

  test("manuel rezervasyon — stoksuz gece 409 STOCK", async ({ request }) => {
    const far = isoOf(new Date(Date.now() + 30 * 86400000)); // envanter aralığı dışı
    const res = await postJSON(request, "/api/reservations/manual", {
      editionId,
      participationId,
      blockId,
      checkIn: far,
      checkOut: shiftIso(far, 1),
      status: "CONFIRMED",
    });
    expect(res.status()).toBe(409);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("STOCK");
    expect(body.error).toContain("Stok yetersiz");
  });

  test("manuel rezervasyon — doğrulama 400 matrisi", async ({ request }) => {
    const back = await postJSON(request, "/api/reservations/manual", {
      editionId, participationId, checkIn: shiftIso(invDateIso, 2), checkOut: invDateIso, status: "REQUESTED",
    });
    expect(back.status()).toBe(400);
    expect(((await back.json()) as { code: string }).code).toBe("VALIDATION");

    const noPayer = await postJSON(request, "/api/reservations/manual", {
      editionId, guestName: "Kurumsal Misafir", payerType: "ORGANIZATION", payerName: "",
      checkIn: invDateIso, checkOut: shiftIso(invDateIso, 1), status: "REQUESTED",
    });
    expect(noPayer.status()).toBe(400);
    expect(((await noPayer.json()) as { code: string }).code).toBe("VALIDATION");

    const badStatus = await postJSON(request, "/api/reservations/manual", {
      editionId, guestName: "Yanlış Durum", status: "CHECKED_IN", checkIn: invDateIso, checkOut: shiftIso(invDateIso, 1),
    });
    expect(badStatus.status()).toBe(400);
  });

  test("manuel rezervasyon — envanter dışı serbest misafir (stok dokunulmaz)", async ({ request }) => {
    const guestName = `Serbest Konuk ${SUFFIX}`;
    const res = await postJSON(request, "/api/reservations/manual", {
      editionId,
      guestName,
      checkIn: invDateIso,
      checkOut: shiftIso(invDateIso, 3),
      occupancyType: "DOUBLE",
      status: "REQUESTED",
      notes: "e-posta ile gelen talep",
    });
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { reservationId: string; stockConsumed: boolean; guestName: string };
    createdResIds.push(body.reservationId);
    expect(body.stockConsumed).toBe(false);
    expect(body.guestName).toBe(guestName);

    const row = await db.reservation.findUnique({ where: { id: body.reservationId } });
    expect(row!.blockId).toBeNull();
    expect(row!.roomTypeId).toBeNull();
    expect(row!.primaryGuestParticipationId).toBeNull();
  });

  test("oda tipi → blok → gecelik stok zinciri (add / set / clamp)", async ({ request }) => {
    const hotel = await db.hotelProperty.create({
      data: { editionId, name: `M19 Test Oteli ${SUFFIX}` },
      select: { id: true },
    });
    createdHotelIds.push(hotel.id);

    const rt = await postJSON(request, "/api/room-types", { hotelId: hotel.id, name: "Suite", capacity: 3, pricePerNight: 450000, currency: "TRY" });
    expect(rt.status()).toBe(201);
    const rtBody = (await rt.json()) as { id: string };

    const blk = await postJSON(request, "/api/room-blocks", { hotelId: hotel.id, roomTypeId: rtBody.id, name: "M19 Blok" });
    expect(blk.status()).toBe(201);
    const blkBody = (await blk.json()) as { id: string };

    const from = isoOf(new Date(Date.now() + 40 * 86400000));
    const to = shiftIso(from, 2); // 3 gece (dahil)
    const add = await postJSON(request, "/api/room-stock", { blockId: blkBody.id, from, to, totalRooms: 4, mode: "add" });
    expect(add.status()).toBe(201);
    expect(((await add.json()) as { upserted: number }).upserted).toBe(3);

    // add semantiği: mevcut stoğa EKLER
    const add2 = await postJSON(request, "/api/room-stock", { blockId: blkBody.id, from, to, totalRooms: 1, mode: "add" });
    expect(add2.status()).toBe(201);
    let nights = await db.inventoryNight.findMany({ where: { blockId: blkBody.id } });
    expect(nights).toHaveLength(3);
    for (const n of nights) expect(n.totalRooms).toBe(5);

    // set semantiği + clamp: ayrılmış odanın altına inilemez
    const day0 = nights[0];
    await db.inventoryNight.update({ where: { id: day0.id }, data: { reservedRooms: 2 } });
    const setLow = await postJSON(request, "/api/room-stock", { blockId: blkBody.id, from, to, totalRooms: 1, mode: "set" });
    expect(setLow.status()).toBe(201);
    nights = await db.inventoryNight.findMany({ where: { blockId: blkBody.id }, orderBy: { date: "asc" } });
    expect(nights[0].totalRooms).toBe(2); // clamp: max(1, reserved=2)
    expect(nights[1].totalRooms).toBe(1);
    expect(nights[2].totalRooms).toBe(1);
  });

  test("export oda listesi — xlsx üretir, filtre çalışır", async ({ request }) => {
    // P14.2: kişiye bağlı satırlar YALNIZ rızalıysa exporta düşer (serbest-ad
    // satırlar rıza kapsamı dışındadır). Personel çevrimdışı rızayı işler.
    const hakan = await db.person.findFirst({ where: { email: `m19-hakan-${SUFFIX}@test.reserv` }, select: { id: true } });
    expect(hakan).not.toBeNull();
    const put = await request.put(`/api/people/${hakan!.id}`, {
      data: { consentVersion: "2026-01-KVKK-TEST", consentAcceptedAt: new Date().toISOString() },
      headers: virtualClientHeaders(),
    });
    expect(put.status()).toBe(200);
    const res = await request.get(`/api/reservations/export?editionId=${editionId}`, { headers: virtualClientHeaders() });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("spreadsheetml");
    expect(Number(res.headers()["x-export-count"] ?? "0")).toBeGreaterThanOrEqual(2); // seed + M19 kayıtları
    const buf = Buffer.from(await res.body());
    const wb = XLSX.read(buf, { type: "buffer" });
    const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    expect(aoa[0][0]).toBe("ODA LİSTESİ (ROOMING LIST)");
    const flat = aoa.map((r) => r.join("|")).join("\n");
    expect(flat).toContain("Otel");
    expect(flat).toContain(`Hakan Reserv${SUFFIX}`);
    expect(flat).toContain(`Serbest Konuk ${SUFFIX}`);
    expect(flat).toContain("Envanter dışı");
    expect(flat).toContain("Delta Üniversitesi");

    // otel filtresi — yalnız seed oteli satırları
    const res2 = await request.get(`/api/reservations/export?editionId=${editionId}&hotelId=${hotelId}`, { headers: virtualClientHeaders() });
    expect(res2.status()).toBe(200);
    const buf2 = Buffer.from(await res2.body());
    const wb2 = XLSX.read(buf2, { type: "buffer" });
    const flat2 = XLSX.utils.sheet_to_json<string[]>(wb2.Sheets[wb2.SheetNames[0]], { header: 1, defval: "" }).map((r) => r.join("|")).join("\n");
    expect(flat2).not.toContain("Serbest Konuk"); // envanter dışı satır düşmez
  });

  test("UI — Konaklama → Manuel Rezervasyon diyaloğu → listede görünür", async ({ page }) => {
    test.setTimeout(120_000);
    const guestName = `UI Konuk ${SUFFIX}`;
    const inIso = isoOf(new Date(Date.now() + 86400000));
    const outIso = isoOf(new Date(Date.now() + 3 * 86400000));

    await isolateClientIp(page);
    await page.goto("/");
    await page.getByRole("navigation", { name: /Ana menü|Main menu/i }).getByRole("button", { name: /Konaklama|Accommodation/i }).click();

    // araç çubuğu — üç yüzey de görünür
    const manualBtn = page.getByRole("button", { name: /Manuel Rezervasyon|Manual Reservation/i });
    await expect(manualBtn).toBeVisible({ timeout: 15_000 });
    // "Excel Rooming Listesi Yapıştır" butonu da /Rooming List/ ile eşleşir — araç çubuğu tam adı.
    await expect(page.getByRole("button", { name: /^(Oda Listesi|Rooming List) \(xlsx\)$/i })).toBeVisible();
    // otel kartı aksiyonları — stok yönetimi yüzeyleri
    await expect(page.getByRole("button", { name: /oda tipi ekle$/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /gecelik stoğunu ekle veya uzat$/ }).first()).toBeVisible();

    await manualBtn.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Detaylı Tekil Giriş|Detailed Single Entry/i)).toBeVisible();

    // serbest misafir moduna geç
    await dialog.getByRole("combobox", { name: /Misafir kaynağı|Guest source/i }).click();
    await page.getByRole("option", { name: /Serbest misafir|Free-form guest/i }).click();
    await dialog.getByLabel(/Misafir adı soyadı|Guest full name/i).fill(guestName);

    // otel + blok (Radix Select)
    await dialog.getByRole("combobox", { name: /^Otel$|^Hotel$/ }).click();
    const hotelName = await db.hotelProperty.findUnique({ where: { id: hotelId }, select: { name: true } });
    await page.getByRole("option", { name: new RegExp(hotelName!.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    await dialog.getByRole("combobox", { name: /Oda bloğu|Room block/i }).click();
    await page.getByRole("option", { name: /Maven Ana Blok|Maven/ }).first().click();

    // tarihler → gece sayısı canlı hesap
    await dialog.getByLabel(/Giriş tarihi|Check-in date/i).fill(inIso);
    await dialog.getByLabel(/Çıkış tarihi|Check-out date/i).fill(outIso);
    await expect(dialog.getByText(/2 gece/).first()).toBeVisible();

    await dialog.getByRole("button", { name: /Rezervasyonu Oluştur|Create Reservation/i }).click();
    await expect(page.getByText(/Manuel rezervasyon oluşturuldu|Manual reservation created/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/gece kaydedildi/).first()).toBeVisible();

    // listede görünür
    await expect(page.getByText(guestName).first()).toBeVisible({ timeout: 15_000 });

    // DB kanıtı — UI girişi kalıcı
    const row = await db.reservation.findFirst({ where: { editionId, guestName } });
    expect(row).not.toBeNull();
    createdResIds.push(row!.id);
    expect(row!.status).toBe("REQUESTED");
    expect(row!.nights).toBe(2);
  });
});
