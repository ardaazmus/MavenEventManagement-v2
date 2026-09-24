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
//  auth/* (kendi akışları), public* (vitrin/kayıt), health (izleme), portal/* (yetenek
//  belirteci), scan (QR-kapılı cihaz), kvkk/erasure (public giriş), seed (prod-dışı),
//  saas/provision (super-admin anahtarı), payments/iyzico/callback (sağlayıcı çağrısı),
//  integrations/hook/* (inbound belirteç).
const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/public",
  "/api/health",
  "/api/portal/",
  "/api/scan",
  "/api/kvkk/erasure",
  "/api/seed",
  "/api/saas/provision",
  "/api/payments/iyzico/callback",
  "/api/integrations/hook/",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  if (!AUTH_ENABLED) return NextResponse.next(); // bayt-özdeş geçiş — E2E değişmez

  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api/") || isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await parseSessionEdge(token);
  if (!session || session.mfaPending) {
    return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  }

  // SLIDING: kalan ömür < TTL/2 → aynı iat ile tazele (ABSOLUTE tavan korunur)
  const now = Math.floor(Date.now() / 1000);
  const remaining = session.exp - now;
  const res = NextResponse.next();
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
