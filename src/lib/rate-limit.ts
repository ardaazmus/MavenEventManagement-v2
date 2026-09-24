// ─── S3: Oran sınırlayıcı (brute-force koruması) ──────────────────────────────
// Kayan pencere, süreç-içi bellek (tek-örnek kurulum için yeterli; çoklu örnek
// gerektiğinde Redis'e taşınır — uygulama-düzeyi okuma önbelleği değildir).
// Kullanım: const denied = enforceRateLimit(req, { key, limit, windowMs });
//           if (denied) return denied;  // 429 + Retry-After
import { NextRequest, NextResponse } from "next/server";

type Bucket = { hits: number[]; };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

// 5 dakikada bir boş kovalar süpürülür (bellek sızıntısı önleme)
function sweep() {
  const now = Date.now();
  if (now - lastSweep < 300_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.hits.length === 0 || now - b.hits[b.hits.length - 1] > 3_600_000) buckets.delete(k);
  }
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

export function enforceRateLimit(
  req: NextRequest,
  opts: { key: string; limit: number; windowMs: number },
): NextResponse | null {
  sweep();
  const now = Date.now();
  const id = `${opts.key}:${clientIp(req)}`;
  const bucket = buckets.get(id) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < opts.windowMs);
  if (bucket.hits.length >= opts.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((opts.windowMs - (now - bucket.hits[0])) / 1000));
    buckets.set(id, bucket);
    return NextResponse.json(
      { error: `Çok fazla istek — ${retryAfterSec} sn sonra yeniden deneyin` },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }
  bucket.hits.push(now);
  buckets.set(id, bucket);
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
