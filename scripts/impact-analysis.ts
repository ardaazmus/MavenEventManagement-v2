// ============================================================================
// MAVEN EVENT MANAGEMENT — BLAST RADIUS & IMPACT ANALYSIS CLI (§4.3)
// Usage: bun run scripts/impact-analysis.ts --entity=registrations
// ============================================================================

import { getAllManifests, getManifest } from "../src/lib/manifest";

function computeBlastRadius(targetId: string): string[] {
  const all = getAllManifests();
  const impactMap = new Map<string, string[]>();
  for (const m of all) {
    impactMap.set(m.id, m.impacts);
  }

  const visited = new Set<string>();
  const queue = [targetId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const directImpacts = impactMap.get(current) || [];
    for (const impact of directImpacts) {
      if (!visited.has(impact)) {
        queue.push(impact);
      }
    }
  }

  visited.delete(targetId); // exclude self
  return Array.from(visited);
}

const entityArg = process.argv.find((a) => a.startsWith("--entity="))?.split("=")[1] || "registrations";
const manifest = getManifest(entityArg);

if (!manifest) {
  console.error(`\x1b[31mVarlık bulunamadı: "${entityArg}"\x1b[0m`);
  console.log("Mevcut Varlıklar:", getAllManifests().map((m) => m.id).join(", "));
  process.exit(1);
}

const blastRadius = computeBlastRadius(manifest.id);

console.log("┌────────────────────────────────────────────────────────────────────────┐");
console.log(`│ \x1b[36mMAVEN ETKİ ANALİZİ RAPORU: ${manifest.name.toUpperCase()} (${manifest.id})\x1b[0m`);
console.log("├────────────────────────────────────────────────────────────────────────┤");
console.log(`│ Veritabanı Tablosu        : ${manifest.tableName}`);
console.log(`│ Girdi Bağımlılıkları (In) : ${manifest.dependsOn.join(", ") || "Yok"}`);
console.log(`│ Doğrudan Etki (Out)       : ${manifest.impacts.join(", ") || "Yok"}`);
console.log(`│ \x1b[33mGeçişli Patlama Yarıçapı  : ${blastRadius.join(", ") || "İzole Modül"}\x1b[0m`);
console.log(`│ Tetiklediği Olaylar       : ${manifest.eventsEmitted.join(", ") || "Yok"}`);
console.log(`│ Dinlediği Olaylar         : ${manifest.eventsSubscribed.join(", ") || "Yok"}`);
console.log(`│ İlgili UI Görünümü        : ${manifest.ui.primaryView}`);
console.log(`│ Inline Grid Desteği       : ${manifest.ui.supportsInlineGrid ? "EVET" : "HAYIR"}`);
console.log(`│ Excel Toplu Yapıştırma    : ${manifest.ui.supportsBulkPaste ? "EVET" : "HAYIR"}`);
console.log(`│ Hızlı Satır Ekleme        : ${manifest.ui.supportsQuickAdd ? "EVET" : "HAYIR"}`);
console.log("└────────────────────────────────────────────────────────────────────────┘");
