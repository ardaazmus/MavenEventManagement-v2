// Modül 18 — Kayıt & Katılımcılar: MANUEL KAYIT + TOPLU İÇE AKTARMA + DIŞA AKTARMA
// Tam akış, bağımsız modül testi:
//   API: manuel zincir (Kişi→Katılım→Kayıt), 409 mükerrer, 400 doğrulama,
//        import önizleme (yazım YOK) → commit (kısmi başarı raporu), kapasite taşması,
//        export xlsx (normal + resmi onay belgesi modu — SheetJS ile parse kanıtı)
//   UI : Kayıt & Katılımcılar → Manuel Kayıt diyaloğu → kayıt → listede görünür
// Temizlik: created kişiler silinir (Cascade: Participation → Registration).
import { test, expect, type APIRequestContext } from "@playwright/test";
import { isolateClientIp } from './_helpers';
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const db = new PrismaClient();
const SUFFIX = Date.now().toString(36).slice(-6);

let editionId = "";
let editionTenantId = "";
const createdEmails: string[] = [];

function virtualClientHeaders() {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.ceil(Math.random() * 254)}`;
  return { "x-forwarded-for": ip };
}

async function postJSON(request: APIRequestContext, path: string, body: unknown) {
  return request.post(path, { data: body, headers: virtualClientHeaders() });
}

test.describe.serial("M18 — manuel kayıt + içe/dışa aktarma", () => {
  test.afterAll(async () => {
    // Cascade: Person → Participation → Registration (+ Sipariş/Ödeme participation'a bağlı)
    if (createdEmails.length > 0) {
      await db.person.deleteMany({ where: { email: { in: createdEmails } } });
    }
    await db.$disconnect();
  });

  test("hazırlık — edisyon çöz", async () => {
    const edition = await db.eventEdition.findFirst({ select: { id: true, tenantId: true }, orderBy: { createdAt: "asc" } });
    expect(edition).not.toBeNull();
    editionId = edition!.id;
    editionTenantId = edition!.tenantId;
  });

  test("manuel kayıt — detaylı tekil giriş (yeni kişi)", async ({ request }) => {
    const email = `m18-manuel-${SUFFIX}@test.import`;
    createdEmails.push(email);
    const res = await postJSON(request, "/api/registrations/manual", {
      editionId,
      firstName: "Selin",
      lastName: "Akarca",
      email,
      phone: "+905551110018",
      title: "Satış Direktörü",
      company: "Akarca Makine A.Ş.",
      city: "Bursa",
      country: "Türkiye",
      status: "CONFIRMED",
      fundingSource: "SELF_PAID",
      notes: `M18 manuel zincir testi ${SUFFIX}`,
    });
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { confirmationNo: string; status: string; personCreated: boolean; personId: string };
    expect(body.confirmationNo).toMatch(/^NF-/);
    expect(body.status).toBe("CONFIRMED");
    expect(body.personCreated).toBe(true);

    // DB kanıtı — zincirin üç halkası da doğru
    const reg = await db.registration.findFirst({
      where: { confirmationNo: body.confirmationNo },
      include: { participation: { include: { person: true } } },
    });
    expect(reg?.source).toBe("ADMIN_ENTRY");
    expect(reg?.status).toBe("CONFIRMED");
    expect(reg?.decidedAt).not.toBeNull();
    expect(reg?.participation.person.email).toBe(email);
    expect(reg?.participation.person.company).toBe("Akarca Makine A.Ş.");
    expect(reg?.participation.source).toBe("ADMIN_ENTRY");
  });

  test("manuel kayıt — mükerrer aktif kayıt 409", async ({ request }) => {
    const res = await postJSON(request, "/api/registrations/manual", {
      editionId,
      firstName: "Selin",
      lastName: "Akarca",
      email: `m18-manuel-${SUFFIX}@test.import`,
    });
    expect(res.status()).toBe(409);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("DUPLICATE");
    expect(body.error).toContain("zaten kayıtlı");
  });

  test("manuel kayıt — doğrulama 400 (soyad yok) + 404 (edisyon yok)", async ({ request }) => {
    const noName = await postJSON(request, "/api/registrations/manual", { editionId, firstName: "SadeceAd" });
    expect(noName.status()).toBe(400);
    expect(((await noName.json()) as { code: string }).code).toBe("VALIDATION");

    const noEdition = await postJSON(request, "/api/registrations/manual", {
      editionId: "cocuklandirilmis-olmayan-edisyon",
      firstName: "X",
      lastName: "Y",
    });
    expect([403, 404]).toContain(noEdition.status());
  });

  test("import önizleme — sorunlu satırlar işaretlenir, YAZIM YOK", async ({ request }) => {
    const before = await db.registration.count({ where: { editionId } });
    const rows = [
      { "Ad": "Defne", "Soyad": "Kaya", "E-posta": `m18-defne-${SUFFIX}@test.import`, "Kurum": "Kaya Lojistik", "Şehir": "İzmir" },
      { "Ad": "Burak", "Soyad": "Öztürk", "E-posta": `m18-burak-${SUFFIX}@test.import`, "Kurum": "Kaya Lojistik" },
      { "Ad": "Eksik", "Soyad": "", "E-posta": `m18-eksik-${SUFFIX}@test.import` }, // VALIDATION
      { "Ad": "Defne", "Soyad": "Kaya İkinci", "E-posta": `m18-defne-${SUFFIX}@test.import` }, // DUPLICATE_FILE
      { "Ad": "Selin", "Soyad": "Akarca", "E-posta": `m18-manuel-${SUFFIX}@test.import` }, // DUPLICATE_DB
      { "Ad": "Kategori", "Soyad": "Yok", "Kategori": "Böyle Bir Kategori Yok 404" }, // CATEGORY
    ];
    const res = await postJSON(request, "/api/registrations/import", { editionId, rows, defaultStatus: "CONFIRMED" });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { mode: string; total: number; valid: number; issues: { kind: string; row: number }[] };
    expect(body.mode).toBe("preview");
    expect(body.total).toBe(6);
    expect(body.valid).toBe(2); // Defne + Burak
    const kinds = body.issues.map((i) => i.kind);
    expect(kinds).toContain("VALIDATION");
    expect(kinds).toContain("DUPLICATE_FILE");
    expect(kinds).toContain("DUPLICATE_DB");
    expect(kinds).toContain("CATEGORY");
    // yazım YOK kanıtı
    const after = await db.registration.count({ where: { editionId } });
    expect(after).toBe(before);
  });

  test("import commit — geçerli satırlar IMPORT kaynağıyla açılır", async ({ request }) => {
    const rows = [
      { "Ad": "Defne", "Soyad": "Kaya", "E-posta": `m18-defne-${SUFFIX}@test.import`, "Kurum": "Kaya Lojistik", "Şehir": "İzmir" },
      { "Ad": "Burak", "Soyad": "Öztürk", "E-posta": `m18-burak-${SUFFIX}@test.import`, "Kurum": "Kaya Lojistik" },
      { "Ad": "Selin", "Soyad": "Akarca", "E-posta": `m18-manuel-${SUFFIX}@test.import` }, // yine atlanır
    ];
    createdEmails.push(`m18-defne-${SUFFIX}@test.import`, `m18-burak-${SUFFIX}@test.import`);
    const res = await postJSON(request, "/api/registrations/import", { editionId, rows, commit: true, defaultStatus: "CONFIRMED" });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { mode: string; imported: number; skipped: { kind: string }[]; confirmationNos: string[] };
    expect(body.mode).toBe("commit");
    expect(body.imported).toBe(2);
    expect(body.confirmationNos).toHaveLength(2);

    const regs = await db.registration.findMany({
      where: { confirmationNo: { in: body.confirmationNos } },
      include: { participation: { include: { person: true } } },
    });
    expect(regs).toHaveLength(2);
    for (const r of regs) {
      expect(r.source).toBe("IMPORT");
      expect(r.status).toBe("CONFIRMED");
      expect(r.participation.source).toBe("IMPORT");
      expect(r.participation.person.company).toBe("Kaya Lojistik");
    }
  });

  test("import kapasite — dolu kategori ikinci satırı CAPACITY ile atlar", async ({ request }) => {
    const cat = await db.registrationCategory.create({
      data: { editionId, name: `M18 Kapasite ${SUFFIX}`, code: `m18k${SUFFIX}`, capacity: 1, isActive: true, order: 99 },
      select: { id: true },
    });
    try {
      const rows = [
        { "Ad": "Kapasite", "Soyad": "Birinci", "E-posta": `m18-kap1-${SUFFIX}@test.import`, "Kategori": `m18k${SUFFIX}` },
        { "Ad": "Kapasite", "Soyad": "İkinci", "E-posta": `m18-kap2-${SUFFIX}@test.import`, "Kategori": `m18k${SUFFIX}` },
      ];
      createdEmails.push(`m18-kap1-${SUFFIX}@test.import`); // ikinci satır içe alınmaz (CAPACITY)
      const res = await postJSON(request, "/api/registrations/import", { editionId, rows, commit: true, defaultStatus: "CONFIRMED" });
      expect(res.status()).toBe(200);
      const body = (await res.json()) as { imported: number; skipped: { kind: string; reason: string }[] };
      expect(body.imported).toBe(1);
      expect(body.skipped).toHaveLength(1);
      expect(body.skipped[0].kind).toBe("CAPACITY");
      expect(body.skipped[0].reason).toContain("kapasitesi dolu");
    } finally {
      await db.registrationCategory.delete({ where: { id: cat.id } }); // FK SetNull — güvenli
    }
  });

  test("export normal — xlsx üretir ve içe aktarılan kişiyi taşır", async ({ request }) => {
    // P14.2: export YALNIZ rızalı kişileri taşır. Personel, çevrimdışı alınan rızayı
    // kişi kartından işler (generic people PUT — gerçek ürün yolu); rızasız kap1
    // kontrol grubu olarak DIŞARIDA kalır (davranışsal P14.2 kanıtı).
    const consentEmails = [`m18-manuel-${SUFFIX}@test.import`, `m18-defne-${SUFFIX}@test.import`, `m18-burak-${SUFFIX}@test.import`];
    const consentPersons = await db.person.findMany({ where: { email: { in: consentEmails } }, select: { id: true } });
    expect(consentPersons).toHaveLength(3);
    for (const p of consentPersons) {
      const put = await request.put(`/api/people/${p.id}`, {
        data: { consentVersion: "2026-01-KVKK-TEST", consentAcceptedAt: new Date().toISOString() },
        headers: virtualClientHeaders(),
      });
      expect(put.status()).toBe(200);
    }
    const res = await request.get(`/api/registrations/export?editionId=${editionId}`, { headers: virtualClientHeaders() });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("spreadsheetml");
    const count = Number(res.headers()["x-export-count"] ?? "0");
    expect(count).toBeGreaterThanOrEqual(3); // 1 manuel + 2 import (başlangıç seed'i de eklenebilir)
    const buf = Buffer.from(await res.body());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
    expect(aoa[0][0]).toContain("Maven Event Management");
    const flat = aoa.map((r) => r.join("|")).join("\n");
    expect(flat).toContain("Teyit No");
    expect(flat).toContain(`m18-defne-${SUFFIX}@test.import`);
    expect(flat).toContain("Akarca Makine A.Ş.");
    expect(flat).not.toContain(`m18-kap1-${SUFFIX}@test.import`); // rızasız — P14.2 dışlama
  });

  test("export resmi onay — kurum filtresi + belge formatı + imza bloğu", async ({ request }) => {
    const res = await request.get(
      `/api/registrations/export?editionId=${editionId}&company=${encodeURIComponent("Kaya Lojistik")}&official=1`,
      { headers: virtualClientHeaders() }
    );
    expect(res.status()).toBe(200);
    const buf = Buffer.from(await res.body());
    const wb = XLSX.read(buf, { type: "buffer" });
    const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    expect(aoa[0][0]).toBe("RESMİ KAYIT ONAY BELGESİ");
    const flat = aoa.map((r) => r.join("|")).join("\n");
    expect(flat).toContain("Kurum / Kuruluş: Kaya Lojistik");
    expect(flat).toContain("kayıtları tamamlanmıştır");
    expect(flat).toContain("Yetkili İmza");
    // yalnız Kaya Lojistik satırları — Akarca listelenmez
    expect(flat).not.toContain("Akarca Makine");
    expect(flat).toContain("Defne");
    expect(flat).toContain("Burak");
  });

  test("UI — Kayıt & Katılımcılar → Manuel Kayıt diyaloğu → listede görünür", async ({ page }) => {
    test.setTimeout(90_000);
    const lastName = `Uimanuel${SUFFIX}`;
    const email = `m18-ui-${SUFFIX}@test.import`;
    createdEmails.push(email);

    await isolateClientIp(page);
    await page.goto("/");
    await page.getByRole("navigation", { name: /Ana menü|Main menu/i }).getByRole("button", { name: /Kayıt & Katılımcılar|Registrations/i }).click();
    const toolbar = page.getByRole("button", { name: new RegExp(`^${"Manuel Kayıt"}$`) });
    await expect(toolbar).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /İçe Aktar|Import/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Dışa Aktar|Export/i })).toBeVisible();

    await toolbar.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Detaylı Tekil Giriş|Detailed Single Entry/i)).toBeVisible();
    await dialog.getByLabel("Ad", { exact: true }).fill("Umut");
    await dialog.getByLabel("Soyad", { exact: true }).fill(lastName);
    await dialog.getByLabel("E-posta", { exact: true }).fill(email);
    await dialog.getByRole("button", { name: /Kaydı Oluştur|Create registration/i }).click();
    await expect(page.getByText(/Manuel kayıt oluşturuldu|Manual registration created/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Teyit No: NF-/).first()).toBeVisible();

    // arama ile listede görünür
    const search = page.getByPlaceholder(/Ad \/ e-posta \/ kayıt no/);
    await search.fill(lastName);
    await expect(page.getByText(`Umut ${lastName}`).first()).toBeVisible({ timeout: 15_000 });
  });
});
