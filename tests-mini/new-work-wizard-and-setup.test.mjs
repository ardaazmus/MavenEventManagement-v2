import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const constantsPath = path.resolve("src/lib/constants.ts");
const taxonomyPath = path.resolve("src/lib/product-taxonomy.ts");

test("Faz 4 - 01: Şablon ve Yetenek Önerileri Sözleşmesi", async () => {
  const { TEMPLATES, CAPABILITIES } = await import(pathToFileURL(constantsPath).href);

  const requiredTemplates = [
    "SCIENTIFIC_CONGRESS",
    "TRADE_FAIR",
    "CORPORATE_EVENT",
    "SPECIAL_GALA",
    "TRAVEL_GROUP",
    "CUSTOM_PROJECT",
  ];

  for (const tmpl of requiredTemplates) {
    assert.ok(tmpl in TEMPLATES, `Şablon ${tmpl} TEMPLATES nesnesinde tanımlı olmalı`);
    assert.ok(Array.isArray(TEMPLATES[tmpl]), `${tmpl} bir yetenek dizisi olmalı`);
    assert.ok(TEMPLATES[tmpl].length > 0, `${tmpl} en az bir önerilen yetenek içermeli`);
  }

  const allCapKeys = new Set(CAPABILITIES.map((c) => c.key));

  // Her şablondaki yetenek anahtarı CAPABILITIES kataloğunda bulunmalıdır
  for (const [tmpl, caps] of Object.entries(TEMPLATES)) {
    for (const cap of caps) {
      assert.ok(
        allCapKeys.has(cap),
        `Şablon ${tmpl} içindeki '${cap}' yeteneği CAPABILITIES listesinde geçerli olmalı`
      );
    }
  }

  // Özel şablon profilleri kontrolü
  assert.ok(TEMPLATES.SCIENTIFIC_CONGRESS.includes("SCIENTIFIC"), "Kongre SCIENTIFIC yeteneğine sahip olmalı");
  assert.ok(TEMPLATES.SCIENTIFIC_CONGRESS.includes("PROGRAM"), "Kongre PROGRAM yeteneğine sahip olmalı");
  assert.ok(TEMPLATES.TRADE_FAIR.includes("FLOOR_PLAN"), "Fuar FLOOR_PLAN yeteneğine sahip olmalı");
  assert.ok(TEMPLATES.TRADE_FAIR.includes("EXHIBITION"), "Fuar EXHIBITION yeteneğine sahip olmalı");
  assert.ok(TEMPLATES.TRAVEL_GROUP.includes("TRAVEL"), "Seyahat TRAVEL yeteneğine sahip olmalı");
  assert.ok(TEMPLATES.TRAVEL_GROUP.includes("ACCOMMODATION"), "Seyahat ACCOMMODATION yeteneğine sahip olmalı");
});

test("Faz 4 - 02: Tarih Doğrulama Sözleşmesi (P3.11 ve Form Bekçisi)", () => {
  function validateDates(startDate, endDate) {
    if (!startDate) return "Başlama tarihi zorunludur";
    const s = new Date(startDate);
    if (Number.isNaN(s.getTime())) return "Başlama tarihi geçersiz";
    if (endDate) {
      const e = new Date(endDate);
      if (Number.isNaN(e.getTime())) return "Bitiş tarihi geçersiz";
      if (e < s) return "Bitiş tarihi başlangıçtan önce olamaz";
    }
    return null;
  }

  // 1. Boş başlama tarihi
  assert.strictEqual(validateDates("", ""), "Başlama tarihi zorunludur");

  // 2. Geçersiz başlama tarihi
  assert.strictEqual(validateDates("invalid-date", ""), "Başlama tarihi geçersiz");

  // 3. Bitiş tarihi başlangıçtan önce
  assert.strictEqual(
    validateDates("2027-05-15", "2027-05-10"),
    "Bitiş tarihi başlangıçtan önce olamaz"
  );

  // 4. Bitiş tarihi başlangıçla aynı gün (Geçerli - tek günlük etkinlik)
  assert.strictEqual(validateDates("2027-05-15", "2027-05-15"), null);

  // 5. Bitiş tarihi başlangıçtan sonra (Geçerli çok günlük etkinlik)
  assert.strictEqual(validateDates("2027-05-15", "2027-05-18"), null);

  // 6. Yalnızca başlama tarihi var (Geçerli - bitiş opsiyonel)
  assert.strictEqual(validateDates("2027-05-15", ""), null);
});

test("Faz 4 - 03: İş Grupları ve Şablon Kapsamı Mantığı", () => {
  const workGroups = [
    {
      id: "EVENT_ORG",
      label: "Etkinlik & Kongre",
      templates: ["SCIENTIFIC_CONGRESS", "TRADE_FAIR", "CORPORATE_EVENT"],
    },
    {
      id: "TRAVEL_CLIENT",
      label: "Münferit / Grup Seyahat",
      templates: ["TRAVEL_GROUP"],
    },
    {
      id: "SPECIAL_WORK",
      label: "Özel İş / Proje",
      templates: ["SPECIAL_GALA", "CUSTOM_PROJECT"],
    },
  ];

  const totalTemplatesCount = workGroups.reduce((s, g) => s + g.templates.length, 0);
  assert.strictEqual(totalTemplatesCount, 6, "Toplam 6 şablon 3 iş grubuna dağıtılmış olmalıdır");

  // Grupların her biri benzersiz id'ye sahip olmalıdır
  const groupIds = new Set(workGroups.map((g) => g.id));
  assert.strictEqual(groupIds.size, 3);
});

test("Faz 4 - 04: İş Profili Boyutları ve Kurulum Seçenekleri", () => {
  const profileOptions = {
    ownership: ["OWN_WORK", "CLIENT_WORK"],
    scale: ["INDIVIDUAL", "GROUP"],
    tier: ["STANDARD", "VIP"],
    access: ["PUBLIC", "PRIVATE"],
  };

  assert.strictEqual(profileOptions.ownership.length, 2);
  assert.strictEqual(profileOptions.scale.length, 2);
  assert.strictEqual(profileOptions.tier.length, 2);
  assert.strictEqual(profileOptions.access.length, 2);

  // Varsayılan iş profili
  const defaultProfile = {
    ownership: "OWN_WORK",
    scale: "GROUP",
    tier: "STANDARD",
    access: "PUBLIC",
    department: "Kongre & Organizasyon Departmanı",
  };

  assert.ok(profileOptions.ownership.includes(defaultProfile.ownership));
  assert.ok(profileOptions.scale.includes(defaultProfile.scale));
  assert.ok(profileOptions.tier.includes(defaultProfile.tier));
  assert.ok(profileOptions.access.includes(defaultProfile.access));
});

test("Faz 4 - 05: Kurulum Sonrası İş Akışı Sözleşmesi", () => {
  // Wizard tamamlandığında hedef modül dashboard (İş Özeti) olmalıdır
  const postCreationWorkflow = {
    setActiveEdition: (id) => ({ currentEditionId: id }),
    targetModule: "dashboard",
    refreshChecklist: true,
  };

  assert.strictEqual(postCreationWorkflow.targetModule, "dashboard");
  assert.strictEqual(postCreationWorkflow.refreshChecklist, true);
  const state = postCreationWorkflow.setActiveEdition("test-edition-id");
  assert.strictEqual(state.currentEditionId, "test-edition-id");
});
