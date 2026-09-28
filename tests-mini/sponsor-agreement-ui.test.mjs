import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const kanbanPath = path.resolve("src/components/maven/sponsorship/sponsorship-kanban.tsx");
const viewPath = path.resolve("src/components/maven/views/sponsorship.tsx");

test("P07.2 - yeni anlaşma modalı mevcut kurumu seçer; orgName ile sessiz kayıt yok", async () => {
  const kanban = fs.readFileSync(kanbanPath, "utf8");
  const view = fs.readFileSync(viewPath, "utf8");

  // Kurum seçimi: organizations prop + organizationId durumu
  assert.ok(kanban.includes("organizations"), "kanban organizations listesini prop olarak almalı");
  assert.ok(kanban.includes("organizationId"), "kanban organizationId seçmeli/göndermeli");
  assert.ok(!kanban.includes("orgName:"), "kanban orgName göndermemeli (sessiz kayıt yasak)");

  // handleNewDeal organizationId gönderir
  assert.ok(view.includes("organizationId"), "sponsorship görünümü organizationId göndermeli");

  // Ayrı yeni-kurum eylemi + aynı-isim uyarısı
  assert.ok(
    kanban.includes("Yeni kurum") || kanban.includes("yeni kurum") || kanban.includes("NewOrg") || kanban.includes("newOrgOpen"),
    "ayrı yeni-kurum eylemi olmalı",
  );
  assert.ok(
    /aynı isim|zaten kayıtlı|mevcut/i.test(kanban),
    "aynı isim eşleşmesinde uyarı olmalı",
  );
});

test("P07.3 - tutar akışı: giriş major→toMinor, gösterim fmtMoney (100× hatası kapalı)", async () => {
  const kanban = fs.readFileSync(kanbanPath, "utf8");
  const view = fs.readFileSync(viewPath, "utf8");

  assert.ok(kanban.includes("toMinor"), "kanban girişi toMinor ile kuruşa çevirmeli");
  assert.ok(
    kanban.includes("amountMinor") || view.includes("amountMinor"),
    "istemci amountMinor göndermeli",
  );
  // Ham minor değerin çiğ basımı yasak (yanlış: ₺{x.toLocaleString()})
  assert.ok(!kanban.includes("₺{"), "kanban ham tutar basmamalı; fmtMoney kullanmalı");
  assert.ok(kanban.includes("fmtMoney"), "kanban tutarları fmtMoney ile göstermeli");

  // Toast sunucu kaydından (dönen amount) beslenmeli, girişten değil
  const dealFn = view.slice(view.indexOf("handleNewDeal"));
  assert.ok(dealFn.includes("amountMinor"), "handleNewDeal amountMinor göndermeli");
});

test("P07.4 - yeni anlaşma yalnız PROSPECT/NEGOTIATION ile başlar; LEAD gönderilmez", async () => {
  const kanban = fs.readFileSync(kanbanPath, "utf8");

  // Başlangıç aşaması seçenekleri kanonik alt küme
  assert.ok(kanban.includes("PROSPECT"), "PROSPECT başlangıç seçeneği olmalı");
  assert.ok(!kanban.includes('useState("LEAD")'), "varsayılan aşama LEAD olmamalı");
  assert.ok(
    kanban.includes('INITIAL_DEAL_STAGES') || kanban.includes('"NEGOTIATION"'),
    "NEGOTIATION başlangıç seçeneği olmalı",
  );

  // Sunucuya giden aşama kanonik eşlemeden geçmeli (geçici UI→kanonik harita P08'e kadar)
  assert.ok(
    kanban.includes("CONTRACTED") || kanban.includes("toCanonicalStage") || kanban.includes("CANONICAL"),
    "ilerletme kanonik statü göndermeli (LEAD/PROPOSAL/CONTRACT/PAID yasak)",
  );
});

test("P07 - sahte tier seçimi kaldırıldı (P09 gerçek veriyle gelecek)", async () => {
  const kanban = fs.readFileSync(kanbanPath, "utf8");
  assert.ok(!kanban.includes("PLATINUM"), "sabit PLATINUM/GOLD/SILVER/BRONZE seçimi kaldırılmalı");
  assert.ok(!kanban.includes("tierName"), "sunucunun yoksaydığı tierName gönderilmemeli");
});
