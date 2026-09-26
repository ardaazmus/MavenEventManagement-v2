// Modül 22 — MÜŞTERİ DATASI DOSYA İÇE AKTARMA (xlsx/csv → CustomerContact)
// Kullanıcı ilkesi: "tek bir veri girişi kaynağı olmamalı" — kontak havuzuna dosya
// yükleme (firma listeleri / e-postayla gelen listeler) yüzeyinin tam-akış testi.
// Bu spec bağımsız doğrular:
//   API: iki-fazlı sözleşme (preview yazım-YOK kanıtı + commit), doğrulama matrisi
//        (400/413), dosya-içi mükerrer, DB birleştirme + zenginleştirme (idempotent),
//        kaynak/etiket/tür kanıtları.
//   UI:  İletişim → Müşteri Datası → "Dosyadan İçe Aktar" diyaloğu — gerçek xlsx
//        upload → önizleme çipleri → İçe Al → toast + listede satır + DB kalıcılık.
// Temizlik: oluşturulan kontaklar afterAll'da silinir.
import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { removeDevtoolsOverlay } from "./_helpers";

const db = new PrismaClient();
const SUFFIX = Date.now().toString(36).slice(-6);
const BULK_TAG = `m22-${SUFFIX}`;

let editionId = "";
let tenantId = "";
const createdContactIds: string[] = [];

const ROWS = [
  { "Ad Soyad": `Zeynep Import ${SUFFIX}`, "E-posta": `m22-zeynep-${SUFFIX}@test.crm`, "Telefon": "+905331110001", "Kurum": "Import A.Ş." },
  { "Ad Soyad": `Kurumsal Import ${SUFFIX}`, "E-posta": `m22-kurumsal-${SUFFIX}@test.crm`, "Telefon": "+902161110002", "Tür": "Kurum" },
  { "Ad Soyad": `Zeynep Kopya ${SUFFIX}`, "E-posta": `m22-zeynep-${SUFFIX}@test.crm` }, // dosya-içi mükerrer
  { "Ad Soyad": `İletişimsiz ${SUFFIX}` }, // e-postasız + telefonsuz
  { "Ad Soyad": `Bozuk Mail ${SUFFIX}`, "E-posta": "not-an-email" }, // biçim
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

test.describe.serial("M22 — müşteri datası dosya içe aktarma", () => {
  test.afterAll(async () => {
    await db.customerContact.deleteMany({
      where: { tenantId, OR: [{ tags: { contains: BULK_TAG } }, { email: { contains: `m22-${SUFFIX}` } }] },
    });
    await db.$disconnect();
  });

  test("hazırlık — edisyon + kiracı + temel sayım", async () => {
    const edition = await db.eventEdition.findFirst({ select: { id: true, tenantId: true }, orderBy: { createdAt: "asc" } });
    expect(edition).not.toBeNull();
    editionId = edition!.id;
    tenantId = edition!.tenantId;
    // etiketli çakışma yok — temiz başlangıç
    await db.customerContact.deleteMany({ where: { tenantId, tags: { contains: BULK_TAG } } });
  });

  test("önizleme — yazım YOK kanıtı + sorun sınıflandırması", async ({ request }) => {
    const before = await db.customerContact.count({ where: { tenantId } });
    const res = await postJSONWarm(request, "/api/customer-contacts/import", { rows: ROWS, tag: BULK_TAG });
    expect(res.status()).toBe(200);
    const pv = (await res.json()) as {
      mode: string; total: number; valid: number; toCreate: number; toMerge: number;
      issues: { row: number; kind: string; reason: string }[];
      mapping: Record<string, string>;
    };
    expect(pv.mode).toBe("preview");
    expect(pv.total).toBe(5);
    expect(pv.valid).toBe(2); // Zeynep + Kurumsal
    expect(pv.toCreate).toBe(2);
    expect(pv.toMerge).toBe(0);
    // sorun sınıfları: 1 dosya-içi mükerrer + 2 doğrulama (iletişimsiz + bozuk e-posta)
    expect(pv.issues.filter((x) => x.kind === "DUPLICATE_FILE")).toHaveLength(1);
    expect(pv.issues.filter((x) => x.kind === "VALIDATION")).toHaveLength(2);
    // başlık eşlemesi: TR kolon adları tanındı
    expect(pv.mapping["displayName"]).toBe("Ad Soyad");
    expect(pv.mapping["email"]).toBe("E-posta");
    // YAZIM YOK kanıtı — önizleme havuz boyutunu değiştirmez
    const after = await db.customerContact.count({ where: { tenantId } });
    expect(after).toBe(before);
  });

  test("commit — yaratma + kaynak/tür/e-posta kanıtları", async ({ request }) => {
    const res = await postJSON(request, "/api/customer-contacts/import", { rows: ROWS, commit: true, tag: BULK_TAG });
    expect(res.status()).toBe(201);
    const r = (await res.json()) as { mode: string; created: number; merged: number; skippedFileDup: number; failed: number; total: number };
    expect(r.mode).toBe("commit");
    expect(r.created).toBe(2);
    expect(r.merged).toBe(0);
    expect(r.skippedFileDup).toBe(1); // Zeynep Kopya
    expect(r.failed).toBe(0);

    const zeynep = await db.customerContact.findFirst({ where: { tenantId, email: `m22-zeynep-${SUFFIX}@test.crm` } });
    expect(zeynep).not.toBeNull();
    createdContactIds.push(zeynep!.id);
    expect(zeynep!.source).toBe("IMPORT");
    expect(zeynep!.kind).toBe("PERSON");
    expect(zeynep!.displayName).toBe(`Zeynep Import ${SUFFIX}`);
    expect(zeynep!.company).toBe("Import A.Ş.");
    expect(zeynep!.commsOptIn).toBe(true);
    expect(zeynep!.tags).toContain(BULK_TAG);

    const kurumsal = await db.customerContact.findFirst({ where: { tenantId, email: `m22-kurumsal-${SUFFIX}@test.crm` } });
    expect(kurumsal).not.toBeNull();
    createdContactIds.push(kurumsal!.id);
    expect(kurumsal!.kind).toBe("ORGANIZATION"); // "Kurum" tür metni çözüldü
  });

  test("tekrar commit — birleştirme + zenginleştirme (idempotent)", async ({ request }) => {
    // aynı satırlar + yeni alan: Kurumsal'a şehir ekle — mevcut kontak ZENGİNLEŞMELİ
    const rows2 = ROWS.map((r) => (r["Ad Soyad"] === `Kurumsal Import ${SUFFIX}` ? { ...r, "Şehir": "Ankara" } : r));
    const res = await postJSON(request, "/api/customer-contacts/import", { rows: rows2, commit: true, tag: BULK_TAG });
    expect(res.status()).toBe(201);
    const r = (await res.json()) as { created: number; merged: number };
    expect(r.created).toBe(0); // yeniden yaratma YOK
    expect(r.merged).toBe(2);

    const kurumsal = await db.customerContact.findFirst({ where: { tenantId, email: `m22-kurumsal-${SUFFIX}@test.crm` } });
    expect(kurumsal!.city).toBe("Ankara"); // boş alan dolduruldu
    expect(kurumsal!.tags).toContain(BULK_TAG); // etiket korundu
    // havuzda tek kurumsal kontak var (çift kayıt oluşmadı)
    const count = await db.customerContact.count({ where: { tenantId, email: `m22-kurumsal-${SUFFIX}@test.crm` } });
    expect(count).toBe(1);
  });

  test("doğrulama matrisi — boş satır 400 + tavan 413", async ({ request }) => {
    const empty = await postJSON(request, "/api/customer-contacts/import", { rows: [] });
    expect(empty.status()).toBe(400);

    const tooMany = Array.from({ length: 1001 }, (_, i) => ({
      "Ad Soyad": `Satır ${i}`,
      "E-posta": `m22-row-${SUFFIX}-${i}@test.crm`,
    }));
    const res413 = await postJSON(request, "/api/customer-contacts/import", { rows: tooMany });
    expect(res413.status()).toBe(413);
  });

  test("UI — İletişim → Dosyadan İçe Aktar → gerçek xlsx upload → listede görünür", async ({ page }) => {
    test.setTimeout(150_000);
    const name1 = `Mira Import ${SUFFIX}`;
    const name2 = `Delta Kurum ${SUFFIX}`;

    // gerçek xlsx dosyası üret (Node buffer → setInputFiles)
    const aoa = [
      ["Ad Soyad", "E-posta", "Telefon", "Kurum", "Tür"],
      [name1, `m22-mira-${SUFFIX}@test.crm`, "+905331110009", "", "Kişi"],
      [name2, `m22-delta-${SUFFIX}@test.crm`, "+902161110008", "", "Kurum"],
      [`Kopya ${SUFFIX}`, `m22-mira-${SUFFIX}@test.crm`, "", "", ""], // dosya-içi mükerrer
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Veri");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    await page.goto("/");
    await removeDevtoolsOverlay(page);
    await page.getByRole("navigation", { name: /Ana menü|Main menu/i }).getByRole("button", { name: /İletişim|Communication/i }).click();

    const fileBtn = page.getByRole("button", { name: /Dosyadan İçe Aktar|Import from File/i });
    await expect(fileBtn).toBeVisible({ timeout: 20_000 });
    await fileBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Dosyadan İçe Aktarma|Import from File/i).first()).toBeVisible();

    await dialog.locator('input[type="file"]').setInputFiles({
      name: "firma-listesi.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: buf,
    });

    // önizleme — sayım çipleri (3 satır: 2 yeni + 1 dosya-içi mükerrer)
    await expect(dialog.getByText(/3 satır okundu|3 rows read/)).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/2 yeni kontak|2 new contacts/)).toBeVisible();
    await expect(dialog.getByText(/1 sorun|1 issue/)).toBeVisible();

    await dialog.getByRole("button", { name: /İçe Al \(2\)|Import \(2\)/i }).click();
    await expect(page.getByText(/^İçe aktarma tamamlandı$|^Import completed$/).first()).toBeVisible({ timeout: 20_000 });

    // listede görünür (havuz yeniden yüklendi)
    await expect(page.getByText(name1).first()).toBeVisible({ timeout: 15_000 });

    // DB kalıcılık — UI yolu gerçek kontak üretti
    const mira = await db.customerContact.findFirst({ where: { tenantId, email: `m22-mira-${SUFFIX}@test.crm` } });
    expect(mira).not.toBeNull();
    createdContactIds.push(mira!.id);
    expect(mira!.source).toBe("IMPORT");
    const delta = await db.customerContact.findFirst({ where: { tenantId, email: `m22-delta-${SUFFIX}@test.crm` } });
    expect(delta).not.toBeNull();
    createdContactIds.push(delta!.id);
    expect(delta!.kind).toBe("ORGANIZATION");
  });
});
