// /api/auth/mfa/verify — TOTP doğrulama → mfaEnabled; kurtarma kodları YALNIZ bu yanıtta düz döner
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthEnabled } from "@/lib/auth/gate";
import { verifyTotp, generateRecoveryCodes } from "@/lib/auth/totp";
import { decryptSecret } from "@/lib/secrets";
import { sessionFromRequest } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const gate = requireAuthEnabled();
  if (gate) return gate;
  const denied = enforceRateLimit(req, { key: "mfa-verify", limit: 10, windowMs: 60_000 });
  if (denied) return denied;

  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  try {
    const { code } = (await req.json()) as { code?: string };
    const user = await db.user.findUnique({ where: { id: session.uid } });
    if (!user?.mfaSecretCipher) return NextResponse.json({ error: "Kurulum bulunamadı — önce setup çağırın" }, { status: 404 });
    const secret = decryptSecret(user.mfaSecretCipher);
    if (!secret || !verifyTotp(secret, code ?? "")) {
      return NextResponse.json({ error: "Kod doğrulanamadı" }, { status: 401 });
    }
    const { plain, hashed } = generateRecoveryCodes();
    await db.user.update({
      where: { id: session.uid },
      data: { mfaEnabled: true, recoveryCodes: JSON.stringify(hashed) },
    });
    return NextResponse.json({ ok: true, mfaEnabled: true, recoveryCodes: plain }); // tek seferlik gösterim
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "MFA doğrulama başarısız" }, { status: 500 });
  }
}
