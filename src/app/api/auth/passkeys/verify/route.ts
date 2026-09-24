// /api/auth/passkeys/verify — WebAuthn kayıt doğrulama; credential saklanır
// counter (attestation 0), publicKey base64; challenge tek kullanımlık
import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { requireAuthEnabled, consumeChallenge } from "@/lib/auth/gate";
import { sessionFromRequest, rpId, origin } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const gate = requireAuthEnabled();
  if (gate) return gate;
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  try {
    const body = (await req.json()) as { name?: string; response?: unknown };
    const expectedChallenge = consumeChallenge(`reg:${session.uid}`);
    if (!expectedChallenge) return NextResponse.json({ error: "Challenge süresi doldu — yeniden başlatın" }, { status: 400 });

    const verification = await verifyRegistrationResponse({
      response: body.response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
      expectedChallenge,
      expectedOrigin: origin(),
      expectedRPID: rpId(),
      requireUserVerification: false, // platform authenticator çeşitliliği için preferred
    });
    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Passkey doğrulanamadı" }, { status: 401 });
    }
    const { credential, credentialDeviceType, credentialBackedUp, aaguid } = verification.registrationInfo;
    const passkey = await db.passkey.upsert({
      where: { credentialId: credential.id },
      create: {
        userId: session.uid,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64"),
        counter: credential.counter,
        transports: credential.transports?.join(",") ?? null,
        name: body.name?.trim() || (credentialDeviceType === "singleDevice" ? "Tek cihaz anahtarı" : "Çoklu cihaz anahtarı"),
        aaguid: aaguid ?? null,
      },
      update: { counter: credential.counter, lastUsedAt: new Date() },
    });
    return NextResponse.json({ ok: true, passkey: { id: passkey.id, name: passkey.name, backedUp: credentialBackedUp } });
  } catch (e) {
    console.error("POST /api/auth/passkeys/verify", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Passkey kaydı başarısız" }, { status: 500 });
  }
}
