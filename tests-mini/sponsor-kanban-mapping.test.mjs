import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const kanbanPath = path.resolve("src/components/maven/sponsorship/sponsorship-kanban.tsx");
const viewPath = path.resolve("src/components/maven/views/sponsorship.tsx");

test("P08.3 - kolonlar kanonik: 5 durum kolonu, UI anahtarı yok", async () => {
  const src = fs.readFileSync(kanbanPath, "utf8");
  for (const s of ["PROSPECT", "NEGOTIATION", "CONTRACTED", "ACTIVE", "COMPLETED"]) {
    assert.ok(src.includes(`"${s}"`) || src.includes(`'${s}'`), `kolon ${s} olmalı`);
  }
  assert.ok(!src.includes("UI_TO_CANONICAL"), "geçici UI haritası kalkmalı");
  assert.ok(!src.includes("toCanonicalStage"), "kanonik dönüşüm fonksiyonu kalkmalı");
  assert.ok(!src.includes('"PAID"'), "sahte PAID kolonu kalkmalı (ödeme verisi yok)");
});

test("P08.3 - bilinmeyen statü sessizce PROSPECT'e düşmez", async () => {
  const src = fs.readFileSync(kanbanPath, "utf8");
  assert.ok(/unknown|Bilinmeyen/i.test(src), "bilinmeyen durumlar ayrı sayılmalı/gösterilmeli");
});

test("P08.3 - iptal gerekçeli + imza tarihli ilerleme + yeniden açma", async () => {
  const src = fs.readFileSync(kanbanPath, "utf8");
  const view = fs.readFileSync(viewPath, "utf8");

  assert.ok(src.includes("transitionReason"), "iptal/reopen gerekçe göndermeli");
  assert.ok(src.includes("signedAt"), "CONTRACTED ilerlemesi imza tarihi istemeli");
  assert.ok(/Yeniden aç|Reopen|reopen/i.test(src), "iptaller için yeniden açma olmalı");

  assert.ok(view.includes("transitionReason"), "görünüm gerekçeyi PUT ile iletmeli");
  assert.ok(view.includes("signedAt"), "görünüm imza tarihini PUT ile iletmeli");
});

test("P08.3 - ilerletme doğrudan sonraki kanonik durumu gönderir", async () => {
  const src = fs.readFileSync(kanbanPath, "utf8");
  assert.ok(
    src.includes("STAGES[idx + 1].key"),
    "ilerletme bir sonraki kolon anahtarını göndermeli",
  );
});
