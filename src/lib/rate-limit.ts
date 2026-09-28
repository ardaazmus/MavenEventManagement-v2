// ─── S3: Oran sınırlayıcı (brute-force koruması) ──────────────────────────────
// Kayan pencere, süreç-içi bellek.
//
// GÜVEN MODELİ (DÜZELTME — trusted-proxy sınırı):
//  * MAVEN_TRUST_PROXY=off → iletim başlıklarına HİÇ güvenilmez; kimlik "local"
//    sabitine düşer (doğrudan erişimde çağıran kendi XFF'iyle kimlik SEÇEMEZ).
//    Kimlik-dozendlı kovalar (e-posta/belirteç) bu modda da ayrı kalır.
//  * MAVEN_TRUST_PROXY=on (VARSAYILAN — bu kurulum: tek Caddy gateway, aynı host) →
//    X-FORWARDED-FOR'un EN SAĞ değerleri kullanılır. Gateway istemci IP'sini listeye
//    SONA EKLER; istemcinin sahte ilk değeri solda kalır → kimlik seçilemez.
//    (Eski hata: EN SOL değer alınıyordu — sahte XFF ile kova kaçınılmaya açıktı.)
//  * Tek-örnek tavanı: kovalar süreç-içi Map'tedir — çoklu örnek/çoklu makine
//    kurulumunda paylaşılan depoya (Redis vb.) taşınmalıdır; bu dağıtım tek örnek
//    olduğundan yeterlidir. Yeniden başlatmada kovalar SIFIRLANIR (pencere reseti —
//    kabul edilen davranış; kalıcı kova gerekirse dağıtık depo şartı yukarıdadır).
//  * Karar: fail-CLOSED — limit aşımında 429 + Retry-After; kova yokluğu/bozulması
//    erişim vermez, yalnız reset bir pencere boyu gevşeme demektir.
// Kullanım: const denied = enforceRateLimit(req, { key, limit, windowMs });
//           if (denied) return denied;  // 429 + Retry-After
//
// P06.2: pencere kararı saf çekirdeğe (rate-limit-core.ts) taşındı — algoritma,
// mesaj metni ve başlıklar BİREBİR aynı; yalnız bellek tavanı sweep yerine
// maxKeys ile uygulanır (eşdeğer koruma) ve çekirdek birim testlidir.
import { NextRequest, NextResponse } from "next/server";
import { createSlidingWindowLimiter } from "./rate-limit-core";

const sharedLimiter = createSlidingWindowLimiter();

// Güvenilir-proxy anahtarı: edge middleware'den bağımsız, süreç başına sabitlenir.
// Açıkça kapatılmadıkça (MAVEN_TRUST_PROXY=off) bu dağıtımın kendi reverse-proxy'si
// (tek Caddy, aynı host) güvenilir kabul edilir — gerekçe yukarıda, dosya başında.
const TRUST_PROXY = process.env.MAVEN_TRUST_PROXY !== "off";

// İstemci kimliği — SADECE dahili kullanım değil: spam-guard ve public-register
// submitIp de AYNI güven modelinden geçmek zorunda (çift hesap: dışa aktarıldı).
export function clientIp(req: NextRequest): string {
  if (!TRUST_PROXY) return "local"; // güven sınırı kapalı → başlık asla okunmaz
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    // EN SAĞ değer = son GÜVENİLİR proxy'nin eklediği gerçek istemci IP'si.
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return req.headers.get("x-real-ip") ?? "local";
}

export function enforceRateLimit(
  req: NextRequest,
  opts: { key: string; limit: number; windowMs: number },
): NextResponse | null {
  const id = `${opts.key}:${clientIp(req)}`;
  const res = sharedLimiter.check(id, { windowMs: opts.windowMs, max: opts.limit });
  if (!res.allowed) {
    return NextResponse.json(
      { error: `Çok fazla istek — ${res.retryAfterSec} sn sonra yeniden deneyin` },
      { status: 429, headers: { "Retry-After": String(res.retryAfterSec) } },
    );
  }
  return null;
}

// Kimlik-dozendlı anahtar (IP yerine tenant/kullanıcı kapsamı)
export function enforceRateLimitById(
  req: NextRequest,
  opts: { key: string; limit: number; windowMs: number; scopeId?: string },
): NextResponse | null {
  if (opts.scopeId) return enforceRateLimit(req, { ...opts, key: `${opts.key}:id:${opts.scopeId}` });
  return enforceRateLimit(req, opts);
}
