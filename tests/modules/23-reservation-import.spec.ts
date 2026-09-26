// Modül 23 — KONAKLAMA REZERVASYON DOSYA İÇE AKTARMA (xlsx/csv → Reservation)
// Kullanıcı ilkesi: "tek bir veri girişi kaynağı olmamalı" — Konaklama'ya dosya
// yükleme (otel rooming listeleri / e-postayla gelen rezervasyon listeleri) yüzeyi.
// Bu spec bağımsız doğrular:
//   API: iki-fazlı sözleşme (preview yazım-YOK kanıtı + commit), esnek tarih/otel/blok
//        çözümlemesi, e-posta→katılım bağlama, stok tüketimi (CONFIRMED+blok),
//        mükerrer çakışma (409 mantığı commit içinde satır-başarısızlığına dönüşür),
//        doğrulama matrisi (400/413), guard yolu (geçersiz edisyon).
//   UI:  Konaklama → "Dosyadan İçe Aktar" diyaloğu — gerçek xlsx upload → önizleme
//        çipleri → İçe Al → toast + listede satır + DB kalıcılık + stok kanıtı.
// Temizlik: afterAll'da test rezervasyonları + test oteli (cascade) + kişi/katılım silinir.
import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { removeDevtoolsOverlay } from "./_helpers";

const db = new PrismaClient();
const SUFFIX = Date.now().toString(36).slice(-6);
const GUEST_A = `Serbest Misafir ${SUFFIX}`;
const HOTEL_NAME = `E2E Import Hotel ${SUFFIX}`;
const BLOCK_NAME = `Import Blok ${SUFFIX}`;
const PART_EMAIL = `m23-part-${SUFFIX}@test.acc`;
const PART_FIRST = `Mira${SUFFIX}`;

let editionId = "";
let tenantId = "";
let hotelId = "";
let blockId = "";
let participationId = "";

// envanter geceleri: 10-14 Mayıs 2026 (öğle yereli — çekirdek sameDay kuralıyla uyumlu)
const NIGHTS = Array.from({ length: 5 }, (_, i) => new Date(2026, 4, 10 + i, 12, 0, 0));
const dayStr = (d: Date) => `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}`;

const ROWS: Record<string, string>[] = [
  // 1) geçerli — blok + Teyit → stok tüketir (3 gece)
  { "Misafir Adı": GUEST_A, "Otel": HOTEL_NAME, "Blok": BLOCK_NAME, "Giriş Tarihi": "10.05.2026", "Çıkış Tarihi": "13.05.2026", "Doluluk": "Çift Kişi", "Ödeyen Tipi": "Kendi", "Gecelik Fiyat (₺)": "3500", "Durum": "Teyit" },
  // 2) geçerli — e-posta katılımla eşleşir, otel yok → envanter dışı + varsayılan durum
  { "E-posta": PART_EMAIL, "Giriş Tarihi": "11.05.2026", "Çıkış Tarihi": "12.05.2026" },
  // 3) dosya-içi mükerrer — aynı misafir + çakışan tarihler
  { "Misafir Adı": GUEST_A, "Otel": HOTEL_NAME, "Blok": BLOCK_NAME, "Giriş Tarihi": "11.05.2026", "Çıkış Tarihi": "14.05.2026" },
  // 4) doğrulama — misafir adı yok + e-posta eşleşmiyor
  { "E-posta": "hic-kimse-yok@test.acc", "Giriş Tarihi": "10.05.2026", "Çıkış Tarihi": "11.05.2026" },
  // 5) doğrulama — otel adı çözülemedi
  { "Misafir Adı": `Olmayan Otelci ${SUFFIX}`, "Otel": "Böyle Bir Otel Yok XZ", "Giriş Tarihi": "10.05.2026", "Çıkış Tarihi": "11.05.2026" },
  // 6) doğrulama — geçersiz tarih (31 Şubat)
  { "Misafir Adı": `Bozuk Tarihli ${SUFFIX}`, "Giriş Tarihi": "31.02.2026", "Çıkış Tarihi": "11.05.2026" },
  // 7) doğrulama — Sponsor ödemesinde ödeyen adı zorunlu
  { "Misafir Adı": `Sponsorsuz ${SUFFIX}`, "Ödeyen Tipi": "Sponsor", "Giriş Tarihi": "10.05.2026", "Çıkış Tarihi": "11.05.2026" },
];

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

test.describe.serial("M23 — konaklama rezervasyon dosya içe aktarma", () => {
  test.afterAll(async () => {
    // sıra: rezervasyonlar (block SetNull) → slotlar cascade → otel cascade → kişi cascade
    await db.reservation.deleteMany({ where: { editionId, OR: [{ guestName: { contains: SUFFIX } }, { payerName: { contains: SUFFIX } }] } });
    if (hotelId) await db.hotelProperty.delete({ where: { id: hotelId } }).catch(() => undefined);
    await db.person.deleteMany({ where: { tenantId, email: PART_EMAIL } });
    await db.$disconnect();
  });

  test("hazırlık — edisyon + test oteli/blok/envanter + e-postalı katılım", async () => {
    const edition = await db.eventEdition.findFirst({ select: { id: true, tenantId: true }, orderBy: { createdAt: "asc" } });
    expect(edition).not.toBeNull();
    editionId = edition!.id;
    tenantId = edition!.tenantId;

    const hotel = await db.hotelProperty.create({ data: { editionId, name: HOTEL_NAME, city: "İstanbul" } });
    hotelId = hotel.id;
    const rt = await db.roomType.create({ data: { hotelId, name: "Standart", capacity: 2, pricePerNight: 35000 } });
    const block = await db.roomBlock.create({ data: { hotelId, roomTypeId: rt.id, name: BLOCK_NAME } });
    blockId = block.id;
    await db.inventoryNight.createMany({ data: NIGHTS.map((date) => ({ blockId, date, totalRooms: 3, reservedRooms: 0 })) });

    const person = await db.person.create({ data: { tenantId, firstName: PART_FIRST, lastName: `Testci ${SUFFIX}`, email: PART_EMAIL } });
    const part = await db.eventParticipation.create({ data: { editionId, personId: person.id } });
    participationId = part.id;
  });

  test("önizleme — yazım YOK kanıtı + sorun sınıflandırması", async ({ request }) => {
    const before = await db.reservation.count({ where: { editionId } });
    const res = await postJSONWarm(request, "/api/reservations/import", { editionId, rows: ROWS, defaultStatus: "REQUESTED" });
    expect(res.status()).toBe(200);
    const pv = (await res.json()) as {
      mode: string; total: number; valid: number; toCreate: number; offInventory: number; stockNights: number;
      issues: { row: number; kind: string; reason: string }[];
      mapping: Record<string, string>;
    };
    expect(pv.mode).toBe("preview");
    expect(pv.total).toBe(7);
    expect(pv.valid).toBe(2); // 1) blok+Teyit + 2) e-posta eşleşmesi
    expect(pv.toCreate).toBe(2);
    expect(pv.offInventory).toBe(1); // yalnız satır 2 (otel kolonu boş)
    expect(pv.stockNights).toBe(3); // 10,11,12 Mayıs
    expect(pv.issues.filter((x) => x.kind === "VALIDATION")).toHaveLength(4); // satır 4,5,6,7
    expect(pv.issues.filter((x) => x.kind === "DUPLICATE_FILE")).toHaveLength(1); // satır 3
    // başlık eşlemesi: TR kolon adları tanındı
    expect(pv.mapping["guestName"]).toBe("Misafir Adı");
    expect(pv.mapping["checkIn"]).toBe("Giriş Tarihi");
    expect(pv.mapping["hotel"]).toBe("Otel");
    // YAZIM YOK kanıtı — önizleme rezervasyon sayısını ve stok tüketimini değiştirmez
    const after = await db.reservation.count({ where: { editionId } });
    expect(after).toBe(before);
    const inv = await db.inventoryNight.findFirst({ where: { blockId } });
    expect(inv!.reservedRooms).toBe(0);
  });

  test("commit — yaratma + stok tüketimi + e-posta bağlama kanıtları", async ({ request }) => {
    const res = await postJSON(request, "/api/reservations/import", { editionId, rows: ROWS, commit: true, defaultStatus: "REQUESTED" });
    expect(res.status()).toBe(201);
    const r = (await res.json()) as { mode: string; created: number; skipped: number; stockNights: number; total: number; failures: unknown[] };
    expect(r.mode).toBe("commit");
    expect(r.created).toBe(2);
    expect(r.skipped).toBe(5); // 4 doğrulama (satır 4,5,6,7) + 1 dosya-içi mükerrer (satır 3)
    expect(r.stockNights).toBe(3);

    // satır 1 — blok + Teyit: stok tüketildi, fiyat ₺3500 → 350000 kuruş, doluluk DOUBLE
    const r1 = await db.reservation.findFirst({ where: { editionId, guestName: GUEST_A } });
    expect(r1).not.toBeNull();
    expect(r1!.status).toBe("CONFIRMED");
    expect(r1!.blockId).toBe(blockId);
    expect(r1!.nights).toBe(3);
    expect(r1!.ratePerNight).toBe(350000);
    expect(r1!.occupancyType).toBe("DOUBLE");
    const invs = await db.inventoryNight.findMany({ where: { blockId }, orderBy: { date: "asc" } });
    expect(invs).toHaveLength(5);
    expect(invs[0].reservedRooms).toBe(1); // 10 Mayıs
    expect(invs[1].reservedRooms).toBe(1); // 11 Mayıs
    expect(invs[2].reservedRooms).toBe(1); // 12 Mayıs
    expect(invs[3].reservedRooms).toBe(0); // 13 Mayıs — 10→13 aralığı dışı

    // satır 2 — e-posta→katılım bağlama: Ana Konuk + slot + varsayılan durum
    const r2 = await db.reservation.findFirst({
      where: { editionId, primaryGuestParticipationId: participationId },
      include: { occupancySlots: true },
    });
    expect(r2).not.toBeNull();
    expect(r2!.status).toBe("REQUESTED"); // defaultStatus uygulandı (Durum kolonu yok)
    expect(r2!.blockId).toBeNull(); // envanter dışı — stok dokunulmadı
    expect(r2!.guestName).toContain(PART_FIRST); // ad katılımdan türetildi
    expect(r2!.occupancySlots).toHaveLength(1); // Ana Konuk slotu açıldı
  });

  test("tekrar commit — DB mükerrer çakışması satır-başarısızlığına dönüşür", async ({ request }) => {
    // aynı misafir + çakışan tarihler — createManualReservation DUPLICATE (409 mantığı)
    // import sözleşmesinde satırı atar, koşumu durdurmaz (kısmi başarı meşru)
    const res = await postJSON(request, "/api/reservations/import", {
      editionId, commit: true, defaultStatus: "REQUESTED",
      rows: [ROWS[0]],
    });
    expect(res.status()).toBe(201);
    const r = (await res.json()) as { created: number; skipped: number; failures: { reason: string }[] };
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(1); // DB mükerrer — serbest misafir çakışması import düzeyinde yakalandı
    expect(r.failures[0].reason).toContain("çakışan");
    // havuzda hâlâ tek kayıt
    const count = await db.reservation.count({ where: { editionId, guestName: GUEST_A } });
    expect(count).toBe(1);
  });

  test("doğrulama matrisi — boş satır 400 + tavan 413 + guard yolu", async ({ request }) => {
    const empty = await postJSON(request, "/api/reservations/import", { editionId, rows: [] });
    expect(empty.status()).toBe(400);

    const tooMany = Array.from({ length: 1001 }, (_, i) => ({
      "Misafir Adı": `Satır ${i} ${SUFFIX}`,
      "Giriş Tarihi": "10.05.2026",
      "Çıkış Tarihi": "11.05.2026",
    }));
    const res413 = await postJSON(request, "/api/reservations/import", { editionId, rows: tooMany });
    expect(res413.status()).toBe(413);

    // edisyon guard'ı — başka/olmayan edisyon 500 DEĞİL, 4xx döner
    const guarded = await postJSON(request, "/api/reservations/import", { editionId: "olmayan-edisyon", rows: ROWS });
    expect([400, 403, 404]).toContain(guarded.status());
  });

  test("UI — Konaklama → Dosyadan İçe Aktar → gerçek xlsx upload → listede görünür", async ({ page }) => {
    test.setTimeout(150_000);
    const uiA = `UI Misafir A ${SUFFIX}`;
    const uiB = `UI Misafir B ${SUFFIX}`;

    // gerçek xlsx dosyası üret (Node buffer → setInputFiles)
    const aoa = [
      ["Misafir Adı", "Otel", "Blok", "Giriş Tarihi", "Çıkış Tarihi", "Doluluk", "Ödeyen Tipi", "Durum"],
      [uiA, HOTEL_NAME, BLOCK_NAME, "12.05.2026", "14.05.2026", "Tek Kişi", "Kendi", "Teyit"], // 2 gece stok
      [uiB, "", "", "12.05.2026", "13.05.2026", "Tek Kişi", "Kendi", "Talep"], // envanter dışı
      [uiA, HOTEL_NAME, BLOCK_NAME, "12.05.2026", "15.05.2026", "Tek Kişi", "Kendi", "Teyit"], // dosya-içi mükerrer
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Veri");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    await page.goto("/");
    await removeDevtoolsOverlay(page);
    await page.getByRole("navigation", { name: /Ana menü|Main menu/i }).getByRole("button", { name: /Konaklama|Accommodation/i }).click();

    const fileBtn = page.getByRole("button", { name: /Dosyadan İçe Aktar|Import from File/i });
    await expect(fileBtn).toBeVisible({ timeout: 20_000 });
    await fileBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Rezervasyon Dosyası İçe Aktarma|Reservation File Import/i).first()).toBeVisible();

    await dialog.locator('input[type="file"]').setInputFiles({
      name: "rooming-listesi.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: buf,
    });

    // önizleme — sayım çipleri (3 satır: 2 hazır + 1 dosya-içi mükerrer; 2 oda-gece stok)
    await expect(dialog.getByText(/3 satır okundu|3 rows read/)).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/2 satır hazır|2 rows ready/)).toBeVisible();
    await expect(dialog.getByText(/2 oda-gece stok tüketimi|2 room-nights of stock/)).toBeVisible();
    await expect(dialog.getByText(/1 sorun|1 issue/)).toBeVisible();

    await dialog.getByRole("button", { name: /İçe Al \(2\)|Import \(2\)/i }).click();
    await expect(page.getByText(/^İçe aktarma tamamlandı$|^Import completed$/).first()).toBeVisible({ timeout: 20_000 });

    // listede görünür (havuz yeniden yüklendi)
    await expect(page.getByText(uiA).first()).toBeVisible({ timeout: 15_000 });

    // DB kalıcılık — UI yolu gerçek rezervasyon üretti + stok tüketimi
    const dbA = await db.reservation.findFirst({ where: { editionId, guestName: uiA } });
    expect(dbA).not.toBeNull();
    expect(dbA!.status).toBe("CONFIRMED");
    expect(dbA!.blockId).toBe(blockId);
    expect(dbA!.nights).toBe(2);
    const dbB = await db.reservation.findFirst({ where: { editionId, guestName: uiB } });
    expect(dbB).not.toBeNull();
    expect(dbB!.status).toBe("REQUESTED");
    expect(dbB!.blockId).toBeNull();
    // 12-13 Mayıs stok: API satırı (1) + UI satırı (1) = 2 oda
    const inv12 = await db.inventoryNight.findFirst({
      where: { blockId, date: { gte: new Date(2026, 4, 12, 0, 0, 0), lt: new Date(2026, 4, 13, 0, 0, 0) } },
    });
    expect(inv12!.reservedRooms).toBe(2);
    const inv13 = await db.inventoryNight.findFirst({
      where: { blockId, date: { gte: new Date(2026, 4, 13, 0, 0, 0), lt: new Date(2026, 4, 14, 0, 0, 0) } },
    });
    expect(inv13!.reservedRooms).toBe(1); // yalnız UI A — API satırı 10→13'tü (çıkış hariç)
    const inv14 = await db.inventoryNight.findFirst({
      where: { blockId, date: { gte: new Date(2026, 4, 14, 0, 0, 0), lt: new Date(2026, 4, 15, 0, 0, 0) } },
    });
    expect(inv14!.reservedRooms).toBe(0); // checkOut hariçtir — 12→14 = 12 ve 13 geceleri
  });
});
