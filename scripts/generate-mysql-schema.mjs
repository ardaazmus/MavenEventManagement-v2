// ─── MySQL/MariaDB MIGRATION ŞEMA ÜRETİCİ (geçici araç — Hostinger taşınma hazırlığı) ──
// prisma/schema.prisma (SQLite) okur; üretim hedefi (MySQL/MariaDB) için hazır bir
// şema artefaktı üretir: docs/schema.mysql.prisma
//
// Dönüşüm kuralları (MySQL VARCHAR(191) varsayılanı ve TEXT indekslenemez kuralı nedeniyle):
//  1) datasource provider = "mysql" (url aynen env DATABASE_URL)
//  2) DB düzeyinde indeksli alanlar (@@index / @@unique / @unique / @id) VE tüm *Id
//     (FK skalerleri) → String kalır (VARCHAR(191) — MySQL indeks anahtar uzunluğu güvenli)
//  3) Büyük-içerik alanları (*Url, *Image, *Svg, *Json, *Payload, *Html, bio, description,
//     body, cipher, notes, message, feedback…) → @db.LongText (4GB — dataURL görselleri için)
//  4) Diğer tüm String alanlar → @db.Text (64KB)
//  5) Enum'lar MySQL native ENUM'e map edilir (Prisma otomatik) — dokunulmaz
//  6) Boolean → TINYINT(1), DateTime → DATETIME(3) — Prisma otomatik; dokunulmaz
//
// Kullanım: bun scripts/generate-mysql-schema.mjs
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "prisma", "schema.prisma");
const OUT = path.join(ROOT, "docs", "schema.mysql.prisma");

const LONGTEXT_RE =
  /(Url|Image|ImageLarge|Svg|Json|Payload|PayloadJson|Html|htmlBody|Logo|Banner|Map|Bio|bio|Description|description|Body|body|Cipher|Notes|notes|Message|message|Feedback|feedback|Content|content|Summary|summary|Schema|Question|question|svg|dataUrl|Cover|cover|Design|design)$/;

const src = fs.readFileSync(SRC, "utf8");
const lines = src.split("\n");

// İKİ GEÇİŞ: önce model bloklarındaki tüm @@index/@@unique alanları topla (alan
// satırları koleksiyon-deklarasyonlarından ÖNCE geldiği için tek geçiş yeterli değil),
// sonra alan satırlarını dönüştür.
const out = [];
let currentModel = null;
let indexedFields = new Set();
let stats = { longText: 0, text: 0, keptIndexed: 0, keptFk: 0, models: 0, enums: 0 };

// geçiş 1: model → indeksli alanlar haritası
const modelIndexed = new Map();
let scanModel = null;
for (const line of lines) {
  const m = line.match(/^model\s+(\w+)\s*\{/);
  if (m) { scanModel = m[1]; continue; }
  if (scanModel && /^\}/.test(line)) { scanModel = null; continue; }
  if (scanModel) {
    const idx = line.match(/^\s*@@(?:index|unique)\s*\(\s*\[([^\]]+)\]/);
    if (idx) {
      const set = modelIndexed.get(scanModel) ?? new Set();
      for (const raw of idx[1].split(",")) {
        const f = raw.trim().split(/\s+/)[0];
        if (f && !f.startsWith("//")) set.add(f);
      }
      modelIndexed.set(scanModel, set);
    }
  }
}

// geçiş 2: dönüşüm
for (const line of lines) {
  const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
  if (modelMatch) {
    currentModel = modelMatch[1];
    indexedFields = modelIndexed.get(currentModel) ?? new Set();
    stats.models += 1;
    out.push(line);
    continue;
  }
  const enumMatch = line.match(/^enum\s+(\w+)/);
  if (enumMatch) { stats.enums += 1; currentModel = null; out.push(line); continue; }
  if (/^\}/.test(line)) { currentModel = null; out.push(line); continue; }

  if (currentModel) {
    // koleksiyon indeksleri
    const idx = line.match(/^@@(?:index|unique)\s*\(\s*\[([^\]]+)\]/);
    if (idx) {
      for (const raw of idx[1].split(",")) {
        const f = raw.trim().split(/\s+/)[0];
        if (f && !f.startsWith("//")) indexedFields.add(f);
      }
      out.push(line);
      continue;
    }
    // alan satırı
    const field = line.match(/^(\s+)(\w+)(\s+)(String)(\??)(\s*)(.*)$/);
    if (field) {
      const [, indent, name, , type, opt, , rest] = field;
      const attrsRest = rest ?? "";
      if (/@db\./.test(attrsRest)) { out.push(line); continue; }          // zaten belirtilmiş
      if (attrsRest.includes("@id") || attrsRest.includes("@unique")) {   // satır-içi indeks
        stats.keptIndexed += 1;
        out.push(line);
        continue;
      }
      if (indexedFields.has(name)) { stats.keptIndexed += 1; out.push(line); continue; }
      if (/Id$/.test(name)) { stats.keptFk += 1; out.push(line); continue; } // FK skalerleri
      if (/@default\(/.test(attrsRest) && !LONGTEXT_RE.test(name)) { out.push(line); continue; }
      // MySQL/MariaDB kuralı: TEXT kolonlara literal DEFAULT verilemez —
      // varsayılanlı alanlar VARCHAR(191) kalır (status/plan/kind gibi kısa değerler).
      if (/@default\(/.test(attrsRest) && LONGTEXT_RE.test(name)) { out.push(line); continue; }
      if (LONGTEXT_RE.test(name)) {
        stats.longText += 1;
        out.push(`${indent}${name}${" "}${type}${opt} @db.LongText${attrsRest ? ` ${attrsRest}` : ""}`);
        continue;
      }
      stats.text += 1;
      out.push(`${indent}${name}${" "}${type}${opt} @db.Text${attrsRest ? ` ${attrsRest}` : ""}`);
      continue;
    }
  }
  out.push(line);
}

// datasource + generator bloğu: provider mysql
let final = out.join("\n");
final = final.replace(/provider\s*=\s*"sqlite"/, 'provider = "mysql"');
// SQLite özel pragma'lar yok; url aynen kalır (env DATABASE_URL — Hostinger'da mysql:// DSN)

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `// ═══ MySQL/MariaDB MIGRATION ARTEFAKTI — otomatik üretilmiş (scripts/generate-mysql-schema.mjs) ═══\n// Kaynak: prisma/schema.prisma · Üretim: ${new Date().toISOString()}\n// Amaç: Hostinger MySQL/MariaDB taşınması için hazır şema — prisma schema.mysql.prisma olarak\n// ayrı klasörde durur (prisma/ klasörüne KOYULMAZ — çoklu-şema birleşmesi çakışması önlenir).\n// Doğrulama akışı: bkz. Admin → Ayarlar → Veritabanı & Migration (geçici sekme).\n\n${final}\n`);

console.log("docs/schema.mysql.prisma yazıldı");
console.log(`modeller: ${stats.models} · enumlar: ${stats.enums}`);
console.log(`@db.LongText: ${stats.longText} · @db.Text: ${stats.text} · indeksli(dokunulmadı): ${stats.keptIndexed} · FK skaler: ${stats.keptFk}`);
