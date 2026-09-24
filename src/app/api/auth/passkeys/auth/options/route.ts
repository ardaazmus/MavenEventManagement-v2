// /api/auth/passkeys/auth/options — giriş için kimlik doğrulama seçenekleri
// { email? } verilirse o kullanıcının passkey'leri allowCredentials olarak bağlanır;
// verilmezse discoverable credential (resident key) akışı
import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { requireAuthEnabled, storeChallenge } from "@/lib/auth/gate";
import { rpId } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const gate = requireAuthEnabled();
  if (gate) return gate;
  const denied = enforceRateLimit(req, { key: "passkey-login", limit: 20, windowMs: 60_000 });
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    let allowCredentials: { id: string }[] = [];
    let challengeKey = "auth:anon";
    if (body.email) {
      const user = await db.user.findFirst({ where: { email: body.email.trim().toLowerCase() } });
      if (user) {
        const passkeys = await db.passkey.findMany({ where: { userId: user.id }, select: { credentialId: true } });
        allowCredentials = passkeys.map((p) => ({ id: p.credentialId }));
        challengeKey = `auth:${user.id}`;
      }
    }
    const options = await generateAuthenticationOptions({
      rpID: rpId(),
      userVerification: "preferred",
      allowCredentials,
    });
    storeChallenge(challengeKey, options.challenge);
    return NextResponse.json(options);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Seçenekler üretilemedi" }, { status: 500 });
  }
}
