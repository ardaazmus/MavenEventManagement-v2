// P18.5: Geri-yükleme tatbikatı çalıştırıcısı.
// Kullanım: bun scripts/restore-drill.mjs [db-yolu]
// Çıkış: JSON rapor (stdout) + rapor dosyası artifacts/evidence/restore-drill/.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const target = process.argv[2] ?? process.env.DATABASE_URL?.replace(/^file:/, "") ?? "db/custom.db";
const resolved = path.resolve(target.replace(/^"\.\.\//, ""));
const { runRestoreDrill } = await import(pathToFileURL(path.resolve("src/lib/compliance/restore-drill.ts")).href);
const report = await runRestoreDrill(resolved);
const dir = path.resolve("artifacts/evidence/restore-drill");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `drill-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok && report.withinBudget ? 0 : 1);
