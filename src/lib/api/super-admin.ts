// ─── TASK-B 21/23: Süper-yönetici kapısı (provision + uptime-report) ────────────
// Sözleşme (spec):
//   - MAVEN_SUPERADMIN_KEY ortam değişkeni YOKSA → 503 {error:"Provisioning yapılandırılmadı"}
//     (varsayılan anahtar YOK — absent key = 503; secrets.ts DEV_FALLBACK ilkesi burada UYGULANMAZ)
//   - Anahtar yanlış/eksik → 404 — ucun varlığı İFŞA EDİLMEZ (kör keşif sinyali verilmez)
//   - Karşılaştırma crypto.timingSafeEqual; uzunluk sızıntısını da kapatmak için iki taraf
//     sha256 özetine indirgenir (giriş uzunluğu ne olursa olsun karşılaştırma 32 byte)
// OWASP notu: sabit-zamanlı karşılaştırma + 404 maskesi + 503 konfigürasyon sinyali
// üç ayrı saldırı yüzeyini kapatır (timing keşfi, endpoint enumeration, config leak).
import { NextResponse } from "next/server";
import crypto from "crypto";

export type SuperAdminGate = { ok: true } | { ok: false; response: NextResponse };

function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

export function requireSuperAdmin(req: Request): SuperAdminGate {
  const expected = process.env.MAVEN_SUPERADMIN_KEY;
  if (!expected || expected.trim() === "") {
    // Kapı yapılandırılmamış — kilitli kapı sinyali (fail-closed)
    return { ok: false, response: NextResponse.json({ error: "Provisioning yapılandırılmadı" }, { status: 503 }) };
  }
  const provided = req.headers.get("x-super-admin-key") ?? "";
  let match = false;
  try {
    match = crypto.timingSafeEqual(digest(provided), digest(expected));
  } catch {
    match = false; // asla patlama — eşleşmeme = 404
  }
  if (!match) {
    return { ok: false, response: NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 }) };
  }
  return { ok: true };
}
