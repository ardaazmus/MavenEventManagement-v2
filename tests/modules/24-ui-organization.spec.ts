// Modül 24 — UI ORGANİZASYONU & HAK YÖNETİMİ (UI-AKIS 2026)
// Kullanıcı ilkesi: özellik kaybı YOK — 26 modülün tamamı yeni 7-sektör-grubu
// düzeninde ulaşılabilir olmalı; rol matrisi (§48) saf mantık olarak doğrulanmalı.
// Bu spec bağımsız doğrular:
//   KAYIPSIZLIK: MODULES ↔ bileşen haritası (module-components.tsx) ↔ i18n (modules.*)
//                üçlü kapsama; her modülün geçerli grubu + rol tanımı.
//   UI:          sidebar'da 7 grup başlığı + 26 modül etiketinin tamamı görünür;
//                grup geçişlerinde modüller gerçekten açılır.
//   HAK:         roleCanSee — OWNER/ADMIN her şey; FINANCE/ONSITE/SCIENTIFIC kendi
//                alanları; rol=null (auth-off) → her şey görünür (geriye-uyum).
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { MODULES, MODULE_GROUPS, roleCanSee } from "../../src/lib/constants";
import { removeDevtoolsOverlay } from "./_helpers";

const tr = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/i18n/tr.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/i18n/en.json"), "utf8"));
// bileşen haritası kaynak metni — yapısal garanti (tüm view grafiğini Node'a yüklemeden)
const moduleComponentsSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/module-components.tsx"), "utf8");

test.describe.serial("M24 — UI organizasyonu & hak yönetimi", () => {
  test("kayıpsızlık — 26 modül: registry ↔ bileşen haritası ↔ i18n üçlü kapsama", () => {
    expect(MODULES).toHaveLength(26);
    expect(MODULE_GROUPS).toHaveLength(7);
    const groupIds = MODULE_GROUPS.map((g) => g.id);
    for (const m of MODULES) {
      // her modülün bileşen girdisi var (yeni modül eklerken unutulmayı engelleyen yapısal garanti)
      expect(new RegExp(`\\b${m.id}\\s*:`).test(moduleComponentsSrc), `bileşen haritasında yok: ${m.id}`).toBe(true);
      // her modülün TR + EN görünen adı var
      expect(tr.modules?.[m.id], `tr modules.${m.id} eksik`).toBeTruthy();
      expect(en.modules?.[m.id], `en modules.${m.id} eksik`).toBeTruthy();
      // grubu geçerli + rol tanımı var
      expect(groupIds).toContain(m.group);
      expect(m.roles === "*" || (Array.isArray(m.roles) && m.roles.length > 0)).toBe(true);
    }
    // grup başlık i18n'leri (tr/en)
    for (const g of MODULE_GROUPS) {
      const key = g.labelKey.split(".")[1];
      expect(tr.shell?.[key], `tr ${g.labelKey} eksik`).toBeTruthy();
      expect(en.shell?.[key], `en ${g.labelKey} eksik`).toBeTruthy();
    }
  });

  test("hak yönetimi — rol × modül matrisi (saf mantık)", () => {
    const mod = (id: string) => {
      const m = MODULES.find((x) => x.id === id);
      expect(m).toBeTruthy();
      return m!;
    };
    // rol=null (auth-off / oturum yok) → her şey görünür (mevcut davranış korunur)
    for (const m of MODULES) expect(roleCanSee(m, null)).toBe(true);
    // OWNER / ADMIN → her şey (üst firma hak sahibi)
    for (const m of MODULES) {
      expect(roleCanSee(m, "ORG_OWNER")).toBe(true);
      expect(roleCanSee(m, "ORG_ADMIN")).toBe(true);
    }
    // FINANCE_MANAGER: finans alanı EVET, bilimsel HAYIR, API geçidi HAYIR
    expect(roleCanSee(mod("finance"), "FINANCE_MANAGER")).toBe(true);
    expect(roleCanSee(mod("accounting"), "FINANCE_MANAGER")).toBe(true);
    expect(roleCanSee(mod("registrations"), "FINANCE_MANAGER")).toBe(true);
    expect(roleCanSee(mod("scientific"), "FINANCE_MANAGER")).toBe(false);
    expect(roleCanSee(mod("integrations"), "FINANCE_MANAGER")).toBe(false);
    // ONSITE_MANAGER: saha üçlüsü + konaklama EVET, kampanya HAYIR
    expect(roleCanSee(mod("onsite"), "ONSITE_MANAGER")).toBe(true);
    expect(roleCanSee(mod("badges"), "ONSITE_MANAGER")).toBe(true);
    expect(roleCanSee(mod("accommodation"), "ONSITE_MANAGER")).toBe(true);
    expect(roleCanSee(mod("communications"), "ONSITE_MANAGER")).toBe(false);
    // SCIENTIFIC_MANAGER: bilimsel + belgeler EVET, muhasebe HAYIR
    expect(roleCanSee(mod("scientific"), "SCIENTIFIC_MANAGER")).toBe(true);
    expect(roleCanSee(mod("certificates"), "SCIENTIFIC_MANAGER")).toBe(true);
    expect(roleCanSee(mod("accounting"), "SCIENTIFIC_MANAGER")).toBe(false);
  });

  test("UI — sidebar'da 7 grup + 26 modül etiketinin tamamı görünür", async ({ page }) => {
    await page.goto("/");
    await removeDevtoolsOverlay(page);
    await page.waitForLoadState("networkidle");
    const aside = page.locator("aside");
    await expect(aside).toBeVisible({ timeout: 20_000 });
    // 7 grup başlığı
    for (const g of MODULE_GROUPS) {
      const label = tr.shell[g.labelKey.split(".")[1]];
      await expect(aside.getByText(label, { exact: true }), `grup başlığı yok: ${g.id}`).toBeVisible({ timeout: 10_000 });
    }
    // 26 modül etiketinin tamamı — kayıpsızlık kanıtı (scroll alanında da olsa görünür sayılır)
    for (const m of MODULES) {
      await expect(aside.getByText(tr.modules[m.id], { exact: true }), `sidebar'da yok: ${m.id}`).toBeVisible({ timeout: 10_000 });
    }
  });

  test("UI — modül değişimi yeni düzende çalışır (üç farklı gruptan)", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await removeDevtoolsOverlay(page);
    await page.waitForLoadState("networkidle");
    const aside = page.locator("aside");
    const click = async (moduleId: string) => {
      await aside.getByText(tr.modules[moduleId], { exact: true }).first().click();
    };
    // Kayıt & Finans grubu → Konaklama & Saha grubu → CRM grubu — içerik açılır
    await click("registrations");
    await expect(page.locator("main").getByText(/Kayıt/i).first()).toBeVisible({ timeout: 30_000 });
    await click("accommodation");
    await expect(page.locator("main").getByText(/Rezervasyonlar|Oda/i).first()).toBeVisible({ timeout: 30_000 });
    await click("communications");
    await expect(page.locator("main").getByText(/İletişim|Kampanya|Müşteri/i).first()).toBeVisible({ timeout: 30_000 });
  });
});
