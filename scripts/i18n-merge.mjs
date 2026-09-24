#!/usr/bin/env node
// TASK-A F9: parça sözlükleri (src/i18n/_new/<ns>.{tr,en}.json) → src/i18n/tr.json + en.json
// BAKE (pişir). KURALLAR:
//  - TABAN KAZANIR: tr.json/en.json'da zaten var olan yaprağa parça ASLA dokunmaz (donukluk).
//  - Yalnız EKLEME: yeni yapraklar base'e eklenir; silme/taşıma yok.
//  - Çıktı: 2-space JSON + sondaki yeni satır (mevcut dosya stili korunur).
//  - Çakışma RAPORU: parçadaki bir yol tabanda farklı bir değerle varsa "conflict" sayılır
//    (taban korunduğu için davranış değişmez — yalnız bilgi).
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const DIR = join(process.cwd(), "src", "i18n", "_new");
const OUT = { tr: join(process.cwd(), "src", "i18n", "tr.json"), en: join(process.cwd(), "src", "i18n", "en.json") };

function deepMerge(base, frag, path = "", acc) {
  for (const [k, v] of Object.entries(frag)) {
    const p = path ? `${path}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (!base[k] || typeof base[k] !== "object" || Array.isArray(base[k])) {
        if (base[k] !== undefined) acc.conflicts.push({ path: p, reason: "type-shape" });
        base[k] = {};
      }
      deepMerge(base[k], v, p, acc);
    } else if (base[k] === undefined) {
      base[k] = v;
      acc.added.push(p);
    } else if (base[k] !== v) {
      acc.conflicts.push({ path: p, reason: "base-wins" });
    }
  }
}

const addedCount = { tr: 0, en: 0 };
const report = { tr: { added: [], conflicts: [] }, en: { added: [], conflicts: [] } };

for (const lang of ["tr", "en"]) {
  const base = JSON.parse(readFileSync(OUT[lang], "utf8"));
  const files = readdirSync(DIR).filter((f) => f.endsWith(`.${lang}.json`)).sort();
  for (const f of files) {
    const frag = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    const acc = report[lang];
    deepMerge(base, frag, "", acc);
  }
  addedCount[lang] = report[lang].added.length;
  writeFileSync(OUT[lang], JSON.stringify(base, null, 2) + "\n", "utf8");
  console.log(`[merge:${lang}] ${files.length} parça işlendi → +${addedCount[lang]} yaprak, ${report[lang].conflicts.length} çakışma (taban kazandı)`);
  if (report[lang].conflicts.length) {
    for (const c of report[lang].conflicts.slice(0, 20)) console.log(`  • ${c.path} (${c.reason})`);
  }
}

// TR/EN simetri denetimi: aynı yaprak setleri (yerel karşılaştırma)
function leafPaths(obj, prefix = "", acc = []) {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) leafPaths(v, p, acc);
    else acc.push(p);
  }
  return acc;
}
const trBase = JSON.parse(readFileSync(OUT.tr, "utf8"));
const enBase = JSON.parse(readFileSync(OUT.en, "utf8"));
const trLeaves = new Set(leafPaths(trBase));
const enLeaves = new Set(leafPaths(enBase));
const onlyTr = [...trLeaves].filter((k) => !enLeaves.has(k));
const onlyEn = [...enLeaves].filter((k) => !trLeaves.has(k));
console.log(`[symmetry] tr=${trLeaves.size} yaprak, en=${enLeaves.size} yaprak, yalnız-TR=${onlyTr.length}, yalnız-EN=${onlyEn.length}`);
if (onlyTr.length || onlyEn.length) {
  for (const k of onlyTr.slice(0, 10)) console.log(`  • TR-only: ${k}`);
  for (const k of onlyEn.slice(0, 10)) console.log(`  • EN-only: ${k}`);
  process.exitCode = 1;
}
