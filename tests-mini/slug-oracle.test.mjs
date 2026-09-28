import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// N-04 kilitleri: global slug @unique BY-DESIGN'dır (public çözümleme tenant-bağımsız
// slug ister); kapalılık VARLIK-ORACLE'ının kapalı olmasına dayanır:
//  - yazım çakışması alan/değer sızdırmaz (jenerik mesaj)
//  - kapsam-dışı okuma "yok" ile AYNI 404'ü döner (403/401 ayrımı yok)

const read = (p) => fs.readFileSync(path.resolve(p), "utf8");

test("N04-1 - slug unique'ler BY-DESIGN notludur (Tenant/Series/Edition/Form)", () => {
  const schema = read("prisma/schema.prisma");
  for (const model of ["model Tenant", "model EventSeries", "model EventEdition", "model FormDefinition"]) {
    const start = schema.indexOf(model);
    assert.ok(start >= 0, `${model} şemada olmalı`);
    const block = schema.slice(start, schema.indexOf("\n}", start));
    const slugLine = block.split("\n").find((l) => l.includes("slug") && l.includes("@unique"));
    assert.ok(slugLine, `${model} slug @unique olmalı`);
    assert.match(slugLine, /N-04: BY-DESIGN/, `${model} slug BY-DESIGN notu taşımalı`);
  }
});

test("N04-2 - kapsam-dışı okuma yok ile aynı 404'tür (tenant-guard)", () => {
  const guard = read("src/lib/api/tenant-guard.ts");
  // kiracı-eşleşmezliği dallarının TÜMÜ 404 + aynı mesaj olmalı (403/401 oracle açar)
  const mismatches = [
    ...guard.matchAll(/owner !== ctx\) return \{[^}]*\}/g),
    ...guard.matchAll(/tenantId !== ctx\) return \{[^}]*\}/g),
    ...guard.matchAll(/id !== ctx\) return \{[^}]*\}/g),
  ];
  assert.ok(mismatches.length >= 3, `en az 3 kapsam-dalı beklenir, görülen: ${mismatches.length}`);
  for (const m of mismatches) {
    assert.match(m[0], /status: 404/, `kapsam-dışı dal 404 dönmeli: ${m[0]}`);
    assert.match(m[0], /Kayıt bulunamadı/, `kapsam-dışı mesaj tek-tip olmalı: ${m[0]}`);
  }
});

test("N04-3 - generic yazım çakışması alan/değer sızdırmaz", () => {
  const post = read("src/app/api/[entity]/route.ts");
  assert.match(post, /Bu kayıt zaten mevcut \(benzersiz alan çakışması\)/, "jenerik çakışma mesajı korunmalı");
  // jenerik mesaj satırında interpolasyon (alan adı/değer) olmamalı
  const line = post.split("\n").find((l) => l.includes("benzersiz alan çakışması"));
  assert.ok(line && !line.includes("${"), "çakışma mesajı değer enterpole etmemeli");
});

test("N04-4 - portal slug çözümleme yok/yayın-dışı ayrımı yapmaz", () => {
  for (const f of ["src/app/api/portal/access/route.ts", "src/app/api/portal/content/route.ts"]) {
    const src = read(f);
    assert.match(src, /!edition \|\| !edition\.isPublished/, `${f}: yok+yayın-dışı tek dal olmalı`);
    const idx = src.indexOf("!edition || !edition.isPublished");
    const window = src.slice(idx, idx + 300);
    assert.match(window, /status: 404/, `${f}: tek-tip 404 dönmeli`);
  }
});
