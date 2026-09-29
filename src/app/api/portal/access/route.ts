// PWA Katılımcı Dış Portalı — GİRİŞ UCI (§2 Erişim Yöntemleri)
// Üç giriş yolu:
//   1. CODE  : { editionSlug, code }                     → GUEST (anonim katılımcı)
//   2. TOKEN : { editionSlug, token }                    → AUTH  (magic link / PortalToken)
//   3. EMAIL : { editionSlug, email, code }              → AUTH  (davet e-postasındaki bilgiler)
// Güvenlik: /api/portal/* middleware PUBLIC_PREFIXES içindedir; bu uç KENDİ kapısıyla
// korunur — enforceRateLimit (S3) + isPublished olmayan edisyona 404 (varlık ifşa edilmez)
// + portal pasifse 403 { reason: PORTAL_DISABLED, countdown/maintenance }.
// Ham oturum anahtarı ve PortalToken yanıt gövdelerinde yalnız ÇIKARIM anında döner.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { issuePortalSession, normalizeEventCode, validatePortalSession } from "@/lib/api/portal-access";
import { validatePortalToken, touchToken } from "@/lib/api/portal-tokens";

export async function POST(req: NextRequest) {
  // S3: giriş denemeleri istismar edilemez — 20/dk/IP (brute-force kapısı)
  const denied = enforceRateLimit(req, { key: "portal-access", limit: 20, windowMs: 60_000 });
  if (denied) return denied;

  try {
    const body = (await req.json()) as {
      editionSlug?: string;
      mode?: string; // CODE | TOKEN | EMAIL
      code?: string;
      token?: string;
      email?: string;
    };
    const slug = (body.editionSlug ?? "").trim();
    if (!slug) return NextResponse.json({ error: "editionSlug zorunlu" }, { status: 400 });

    const edition = await db.eventEdition.findUnique({
      where: { slug },
      include: { tenant: { select: { id: true, name: true, logoUrl: true } } },
    });
    // yayınlanmamış/yabancı edisyon → varlık ifşa edilmez
    if (!edition || !edition.isPublished) {
      return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    }

    const config = await db.eventPortalConfig.findUnique({ where: { editionId: edition.id } });
    if (!config?.portalEnabled) {
      // §5.1: pasifken bakım veya başlama geri sayımı gösterilir
      return NextResponse.json(
        {
          reason: "PORTAL_DISABLED",
          maintenanceMessage: config?.maintenanceMessage ?? null,
          countdownTo: config?.countdownTo ?? null,
        },
        { status: 403 },
      );
    }

    const mode = (body.mode ?? "CODE").toUpperCase();
    if (mode === "TOKEN") {
      // magic link — PortalToken (PARTICIPANT kapsamı, bu edisyona bağlı)
      const raw = (body.token ?? "").trim();
      if (!raw) return NextResponse.json({ error: "Erişim anahtarı gerekli" }, { status: 400 });
      const check = await validatePortalToken(raw);
      if (!check.ok) {
        return NextResponse.json(
          { error: check.reason === "UNKNOWN" ? "Erişim anahtarı geçersiz" : "Erişim anahtarınız geçersiz veya süresi dolmuş" },
          { status: check.reason === "UNKNOWN" ? 404 : 410 },
        );
      }
      const token = check.token;
      if (token.scope !== "PARTICIPANT" || token.editionId !== edition.id || !token.personId) {
        return NextResponse.json({ error: "Erişim anahtarı geçersiz" }, { status: 404 });
      }
      touchToken(token.id);
      const person = await db.person.findUnique({
        where: { id: token.personId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!person) return NextResponse.json({ error: "Katılımcı bulunamadı" }, { status: 404 });
      const session = await issuePortalSession({ editionId: edition.id, kind: "AUTH", personId: person.id });
      return NextResponse.json({
        sessionKey: session.key,
        kind: "AUTH",
        expiresAt: session.expiresAt,
        edition: { id: edition.id, slug: edition.slug, name: edition.name },
        person: { id: person.id, name: `${person.firstName} ${person.lastName}` },
      });
    }

    // CODE ve EMAIL yolları genel etkinlik kodunu paylaşır (admin tek kod yönetir)
    const expected = normalizeEventCode(config.eventCode);
    if (!expected) {
      return NextResponse.json({ error: "Bu etkinlik için kod girişi tanımlı değil — lütfen organizatöre başvurun" }, { status: 409 });
    }
    const given = normalizeEventCode(body.code);
    if (!given || given !== expected) {
      return NextResponse.json({ error: "Etkinlik kodu hatalı" }, { status: 401 });
    }

    if (mode === "EMAIL") {
      // doğrulanmış katılımcı: e-posta bu edisyonda kayıtlı bir kişiye eşleşmeli
      const email = (body.email ?? "").trim().toLowerCase();
      if (!email || !email.includes("@")) {
        return NextResponse.json({ error: "Geçerli bir e-posta girin" }, { status: 400 });
      }
      const participations = await db.eventParticipation.findMany({
        where: { editionId: edition.id },
        select: { personId: true },
      });
      const personIds = participations.map((p) => p.personId);
      const candidates = await db.person.findMany({
        where: { id: { in: personIds }, email: { not: null } },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      const person = candidates.find((c) => (c.email ?? "").toLowerCase() === email) ?? null;
      if (!person) {
        return NextResponse.json(
          { error: "Bu e-posta ile kayıtlı katılımcı bulunamadı — kod ile devam edebilirsiniz" },
          { status: 404 },
        );
      }
      const session = await issuePortalSession({ editionId: edition.id, kind: "AUTH", personId: person.id });
      return NextResponse.json({
        sessionKey: session.key,
        kind: "AUTH",
        expiresAt: session.expiresAt,
        edition: { id: edition.id, slug: edition.slug, name: edition.name },
        person: { id: person.id, name: `${person.firstName} ${person.lastName}` },
      });
    }

    // GUEST — kod ile doğrudan giriş, kişisel doğrulama yok
    const session = await issuePortalSession({ editionId: edition.id, kind: "GUEST" });
    return NextResponse.json({
      sessionKey: session.key,
      kind: "GUEST",
      expiresAt: session.expiresAt,
      edition: { id: edition.id, slug: edition.slug, name: edition.name },
    });
  } catch (err) {
    console.error("portal/access error:", err);
    return NextResponse.json({ error: "Giriş gerçekleştirilemedi" }, { status: 500 });
  }
}

// oturum durumunu sorgulama (sayfa yenilendiğinde anahtar hâlâ geçerli mi)
// QA: salt-okuma doğrulama, GİRİŞ brute-force kotasını (20/dk) YİYORDU — her sayfa
// açılışı + yoklama kotadan düşüyor, etkinlik-NAT arkası meşru kullanıcılar (ve
// testler) sahte 429 alıyordu. Doğrulama ayrı/cömert kovada; giriş 20/dk korunur.
export async function GET(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "portal-access-validate", limit: 180, windowMs: 60_000 });
  if (denied) return denied;
  const raw = req.headers.get("x-portal-session") ?? req.nextUrl.searchParams.get("session");
  if (!raw) return NextResponse.json({ valid: false }, { status: 200 });
  const check = await validatePortalSession(raw);
  if (!check.ok) return NextResponse.json({ valid: false, reason: check.reason });
  return NextResponse.json({
    valid: true,
    kind: check.session.kind,
    editionId: check.session.editionId,
    personId: check.session.personId,
  });
}
