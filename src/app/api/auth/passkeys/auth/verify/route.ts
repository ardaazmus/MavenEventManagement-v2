// /api/auth/passkeys/auth/verify — giriş doğrulama; counter kuralı: yeni counter
// saklanandan KÜÇÜK/EŞİT ise klonlanmış authenticator şüphesi → RED; başarılıysa oturum açılır
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { requireAuthEnabled, consumeChallenge } from "@/lib/auth/gate";
import { rpId, origin, sessionCookieHeader, SESSION_TTL_SECONDS } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const gate = requireAuthEnabled();
  if (gate) return gate;
  const denied = enforceRateLimit(req, { key: "passkey-login", limit: 20, windowMs: 60_000 });
  if (denied) return denied;

  try {
    const body = (await req.json()) as { response?: unknown };
    const resp = body.response as { id?: string } | undefined;
    const credentialId = resp?.id;
    if (!credentialId) return NextResponse.json({ error: "response.id gerekli" }, { status: 400 });

    const passkey = await db.passkey.findUnique({ where: { credentialId }, include: { user: true } });
    if (!passkey || passkey.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "Passkey bulunamadı" }, { status: 404 }); // varlık ifşa edilmez
    }
    // challenge anahtarı kayıt sırasındaki kullanıcıya bağlı — anonim akışta da uyumlu
    const expectedChallenge = consumeChallenge(`auth:${passkey.userId}`) ?? consumeChallenge("auth:anon");
    if (!expectedChallenge) return NextResponse.json({ error: "Challenge süresi doldu — yeniden başlatın" }, { status: 400 });

    const verification = await verifyAuthenticationResponse({
      response: body.response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge,
      expectedOrigin: origin(),
      expectedRPID: rpId(),
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64")),
        counter: passkey.counter,
        transports: (passkey.transports ?? "").split(",").filter(Boolean) as ("internal" | "hybrid" | "usb" | "nfc" | "ble")[],
      },
      requireUserVerification: false,
    });
    if (!verification.verified) return NextResponse.json({ error: "Doğrulanamadı" }, { status: 401 });

    // counter kuralı (klon tespiti)
    const newCounter = verification.authenticationInfo.newCounter;
    if (newCounter <= passkey.counter && newCounter > 0) {
      // şüpheli: anahtarı devre dışı bırak (güvenlik fail-closed)
      await db.passkey.delete({ where: { id: passkey.id } });
      return NextResponse.json({ error: "Authenticator klon şüphesi — passkey iptal edildi" }, { status: 401 });
    }
    await db.passkey.update({ where: { id: passkey.id }, data: { counter: newCounter, lastUsedAt: new Date() } });
    await db.user.update({ where: { id: passkey.userId }, data: { lastLoginAt: new Date(), failedLoginCount: 0 } });

    const cookie = sessionCookieHeader({
      uid: passkey.userId, role: passkey.user.role, tenantId: passkey.user.tenantId,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    });
    return new NextResponse(
      JSON.stringify({ ok: true, user: { name: passkey.user.name, role: passkey.user.role } }),
      { status: 200, headers: { "Set-Cookie": cookie, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("POST /api/auth/passkeys/auth/verify", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Passkey girişi başarısız" }, { status: 500 });
  }
}
