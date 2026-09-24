// /api/auth/mfa/setup — TOTP kurulumu: secret üretilir, cipher saklanır (henüz etkin değil);
// otpauth URI yalnız bu yanıtta bir kez döner (QR authenticator'a okutulur).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthEnabled } from "@/lib/auth/gate";
import { generateTotpSecret, otpauthUri } from "@/lib/auth/totp";
import { encryptSecret } from "@/lib/secrets";
import { authPendingFromRequest } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const gate = requireAuthEnabled();
  if (gate) return gate;
  const denied = enforceRateLimit(req, { key: "mfa-setup", limit: 10, windowMs: 60_000 });
  if (denied) return denied;

  // TASK-B 12: tam oturum VEYA mfa-pending onboarding belirteci kabul edilir
  const session = authPendingFromRequest(req);
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: session.uid },
    data: { mfaSecretCipher: encryptSecret(secret), mfaEnabled: false },
  });
  return NextResponse.json({ otpauthUri: otpauthUri(secret, `uid:${session.uid.slice(-8)}`), period: 30, digits: 6 });
}
