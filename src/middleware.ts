// ─── TASK-B 13: Auth middleware ───────────────────────────────────────────────
// MAVEN_AUTH=off (VARSAYILAN) → NextResponse.next() ve BİTTİ: yanıt bayt-bayt özdeş
// (ek başlık yok, Set-Cookie yok, gövde müdahalesi yok) — E2E birebir korunur.
//
// MAVEN_AUTH=on → /api/** uçları (aşağıdaki AÇIK yüzeyler dışında) geçerli oturum
// ister; yoksa 401. SLIDING ömür: kalan süre TTL/2 altına indiğinde aynı iat ile
// çerez tazelenir (Set-Cookie) — ABSOLUTE tavan parseSessionEdge'te zorlanır.
//
// ORTAM NOTU: MAVEN_AUTH edge build zamanında in-line edilir (Next.js edge middleware
// env inlining). Flag-ON üretim derlemesi CI kapısıyla (MAVEN_AUTH=on build) doğrulanır.
import { NextRequest, NextResponse } from "next/server";
import { parseSessionEdge } from "@/lib/auth/edge";

const AUTH_ENABLED = process.env.MAVEN_AUTH === "on";
const SESSION_TTL_SECONDS = 12 * 3600;
const IS_PROD = process.env.NODE_ENV === "production";
const SESSION_COOKIE = IS_PROD ? "__Host-maven.session" : "maven.session";

// Kimliksiz BY-DESIGN açık yüzeyler (kendi kapılarıyla korunur):
//  auth/* (kendi akışları), public/* (vitrin), public-register, health (izleme),
//  portal/* (yetenek belirteci), scan (QR-kapılı cihaz), kvkk/erasure (public giriş),
//  seed (prod-dışı), saas/provision (super-admin anahtarı),
//  payments/iyzico/callback (sağlayıcı çağrısı), integrations/hook/* (inbound belirteç).
// DÜZELTME (public-path boundary): geniş startsWith kuralı "/api/healthXYZ" veya
// "/api/scanXYZ" gibi İSTİSMAR yollarını da açık sayıyordu. Kural artık segment-
// sınırlıdır: exact eşleşir VEYA prefix "/" ile biter + sonrası segmentbaşlangıcıdır.
// "/api/public" öneki "/api/publicity"yi, "/api/health" öneki "/api/healthXYZ"yi KAPSAMAZ.
type PublicRule = { exact?: string; prefix?: string };
const PUBLIC_RULES: PublicRule[] = [
  { prefix: "/api/auth/" },
  { exact: "/api/public-register" },
  { prefix: "/api/public/" },
  { exact: "/api/health" },
  { prefix: "/api/portal/" },
  { exact: "/api/scan" },
  { exact: "/api/kvkk/erasure" },
  { exact: "/api/seed" },
  { exact: "/api/saas/provision" },
  { exact: "/api/payments/iyzico/callback" },
  { prefix: "/api/integrations/hook/" },
];

function isPublic(pathname: string): boolean {
  return PUBLIC_RULES.some((r) => {
    if (r.exact !== undefined) return pathname === r.exact;
    if (r.prefix !== undefined) return pathname === r.prefix || pathname.startsWith(r.prefix.endsWith("/") ? r.prefix : `${r.prefix}/`);
    return false;
  });
}

export async function middleware(req: NextRequest) {
  if (!AUTH_ENABLED) return NextResponse.next(); // bayt-özdeş geçiş — E2E değişmez

  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // P1 (yeni-fazlar 3): istemci-supplied oturum başlıkları ASLA güvenilmez — her API
  // yolunda (public dahil) silinir. Böylece x-maven-session-* SADECE middleware'in
  // HMAC doğrulamasından geçen isteklerde var olabilir (downstream güven sınırı).
  const headers = new Headers(req.headers);
  for (const h of [...headers.keys()]) {
    if (h.toLowerCase().startsWith("x-maven-session-")) headers.delete(h);
  }

  if (isPublic(pathname)) {
    // P1 (yeni-fazlar 4): public yol ANONİM kalır — AMA kimlik gerektiren public-listeli
    // yönetim yüzeyleri (KVKK işleme, portal editörü, preview-token) route kapısında
    // aktörü okur. Bu yüzden çerez DOĞRULANIRSA başlıklar yine de enjekte edilir;
    // doğrulanamazsa hiçbir başlık eklenmez (route kapısı 401/403 kararını verir).
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const session = await parseSessionEdge(token);
    if (session && !session.mfaPending) {
      headers.set("x-maven-session-tenant", session.tenantId);
      headers.set("x-maven-session-role", session.role);
      headers.set("x-maven-session-uid", session.uid);
    }
    return NextResponse.next({ request: { headers } });
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await parseSessionEdge(token);
  if (!session || session.mfaPending) {
    return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  }

  // P1: doğrulanmış oturum bağlamı downstream'e başlıkla taşınır (tenant/rol/uid) —
  // resolveContext db.tenant.findFirst() yerine BU değeri kullanır.
  headers.set("x-maven-session-tenant", session.tenantId);
  headers.set("x-maven-session-role", session.role);
  headers.set("x-maven-session-uid", session.uid);
  const res = NextResponse.next({ request: { headers } });

  // SLIDING: kalan ömür < TTL/2 → aynı iat ile tazele (ABSOLUTE tavan korunur)
  const now = Math.floor(Date.now() / 1000);
  const remaining = session.exp - now;
  if (remaining > 0 && remaining < SESSION_TTL_SECONDS / 2 && session.iat) {
    const refreshed = { ...session, exp: now + SESSION_TTL_SECONDS };
    const body = Buffer.from(JSON.stringify(refreshed), "utf8").toString("base64url");
    // imza edge tarafında: parseSessionEdge'in HMAC'ini yeniden kullan
    const { signEdge } = await import("@/lib/auth/edge");
    const sig = await signEdge(body);
    res.cookies.set(SESSION_COOKIE, `${body}.${sig}`, {
      path: "/", httpOnly: true, sameSite: "lax",
      maxAge: SESSION_TTL_SECONDS, secure: IS_PROD,
    });
  }
  return res;
}

export const config = {
  matcher: ["/api/:path*"], // yalnız API yüzeyi — SPA kabuğu serbest (auth UX istemcide)
};
