#!/usr/bin/env node
// TASK-B 29: i18n bakım kapısı — GÖRÜNÜMLERDE sert-kodlu Türkçe metin TARAMASI (tırmık).
// Kural: yeni metin ÖNCE sözlüğe (tr.json + en.json), sonra görünüme t("ns.key") ile yazılır.
// TIRMIK (ratchet): scripts/i18n-baseline.json'daki sayının ÜZERİNE çıkış CI'ı kırar;
// eski view'ların TASK-A F9 artan dönüşümü tamamlandıkça taban SAYI DÜŞÜRÜLÜR.
// Kapsam: src/components/** + src/app/page.tsx (API route'ları sunucu sözleşmesi — kapsam dışı).
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "fs";
import { join, extname } from "path";

const ROOT = join(process.cwd(), "src");
const BASELINE_FILE = join(process.cwd(), "scripts", "i18n-baseline.json");
const VIOLATIONS = [];
let scanned = 0;

const TR_HINT = /[çğıöşüÇĞİÖŞÜ]/;
const TR_WORDS =
  /\b(Kayıt|Katılımcı|Etkinlik|Oturum|Giriş|Sil|Kaydet|Güncelle|İptal|Onayla|Reddet|Hata|Başarılı|Yükle|Ara|Filtre|Düzenle|Kapat|Aç|Ekle|Toplam|Durum|Tarih|Kurum|Kişi|Sipariş|Ödeme|Rapor|Bildirim|Ayarlar|Uyarı|Bilgi|Lütfen|Zorunlu|Bulunamadı|Daha fazla|Toplu|İşlem|Seç|Başla|Bitir|Oluştur)\b/;

function scanFile(p) {
  const src = readFileSync(p, "utf8");
  src.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    if (/\b(import|require)\b/.test(trimmed) && /["']\./.test(trimmed)) return; // import satırı
    const noTcalls = line
      .replace(/\bt\(\s*["'`][^"'`]*["'`]\s*[^)]*\)/g, "")
      .replace(/\b(tLabel|tStatus|tQuiet)\([^)]*\)/g, "")
      .replace(/\bfmtMoney[A-Za-z]*\([^)]*\)/g, "");
    const literals = noTcalls.match(/["'`]([^"'`]{3,})["'`]/g) ?? [];
    for (const lit of literals) {
      const inner = lit.slice(1, -1);
      if (/^[a-zA-Z0-9_\-.:/?&=,%$#@!()[\]{} +]+$/.test(inner) && !TR_HINT.test(inner)) continue;
      if (/^[a-z]+(\.[a-zA-Z0-9_]+)+$/.test(inner)) continue; // i18n key deseni
      if (/^(data|image|video|audio|application|text)\//.test(inner)) continue; // mime
      if (/^[A-Z0-9_]+$/.test(inner)) continue; // SABIT
      if (/^[a-z][a-zA-Z0-9]*$/.test(inner)) continue; // tanımlayıcı
      if (TR_HINT.test(inner) && TR_WORDS.test(inner)) {
        VIOLATIONS.push({ file: p.replace(process.cwd() + "/", ""), line: i + 1, text: inner.slice(0, 60) });
      }
    }
  });
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if ([".tsx", ".ts"].includes(extname(name))) { scanned++; scanFile(p); }
  }
}

walk(join(ROOT, "components"));
const pagePath = join(ROOT, "app", "page.tsx");
if (existsSync(pagePath)) { scanned++; scanFile(pagePath); }

let baseline = 99999;
if (existsSync(BASELINE_FILE)) {
  try { baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")).maxViolations ?? 99999; } catch { /* ilk koşu */ }
}
if (baseline === 99999) {
  // ilk kurulum: mevcut ihlal sayısı taban olarak YAZILIR (tırmık başlangıcı)
  writeFileSync(BASELINE_FILE, JSON.stringify({ maxViolations: VIOLATIONS.length, note: "TASK-B 29 tırmık tabanı — TASK-A F9 artan view dönüşümüyle DÜŞÜRÜLÜR", generatedAt: new Date().toISOString() }, null, 2) + "\n");
  console.log(`i18n-hardcoded-scan: TIRMIK TABANI oluşturuldu → ${VIOLATIONS.length} ihlal (${scanned} dosya)`);
  for (const v of VIOLATIONS.slice(0, 10)) console.log(`  • ${v.file}:${v.line} → "${v.text}"`);
  process.exit(0);
}
console.log(`i18n-hardcoded-scan: ${scanned} dosya, ${VIOLATIONS.length} ihlal (taban ${baseline})`);
if (VIOLATIONS.length > baseline) {
  console.log("  ✘ TIRMIK AŞILDI — yeni sert-kodlu TR metinler sözlüğe ALINMADAN görünüme yazılamaz:");
  for (const v of VIOLATIONS.slice(0, 20)) console.log(`    ✘ ${v.file}:${v.line} → "${v.text}"`);
  process.exit(1);
}
console.log("  ✓ taban korundu — yeni metinler sözlük-öncelikli yazılıyor");
