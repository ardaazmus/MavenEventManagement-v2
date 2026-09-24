// /api/auth/login — A4 (flag-off → 404). Brute-force: 10/15dk/IP + hesap kilidi
// (5 başarısız → 15 dk). MFA: etkinse TOTP veya kurtarma kodu zorunlu;
// ORG_OWNER/FINANCE_MANAGER için MFA zorunluluğu ipucu döner (zorlama politikası).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthEnabled } from "@/lib/auth/gate";
import { verifyPassword } from "@/lib/auth/password";
import { verifyTotp, hashRecoveryCode } from "@/lib/auth/totp";
import { decryptSecret } from "@/lib/secrets";
import { sessionCookieHeader, SESSION_TTL_SECONDS } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const MFA_ENFORCED_ROLES = ["ORG_OWNER", "FINANCE_MANAGER"];

export async function POST(req: NextRequest) {
  const gate = requireAuthEnabled();
  if (gate) return gate;
  const denied = enforceRateLimit(req, { key: "auth-login", limit: 10, windowMs: 900_000 });
  if (denied) return denied;

  try {
    const body = (await req.json()) as { email?: string; password?: string; totp?: string; recoveryCode?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !body.password) return NextResponse.json({ error: "E-posta ve parola zorunlu" }, { status: 400 });

    const user = await db.user.findFirst({ where: { email } });
    if (!user) return NextResponse.json({ error: "E-posta veya parola hatalı" }, { status: 401 }); // varlık ifşa edilmez
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return NextResponse.json({ error: `Hesap kilitli — ${user.lockedUntil.toLocaleTimeString("tr-TR")} kadar` }, { status: 423 });
    }

    const ok = user.passwordHash ? await verifyPassword(user.passwordHash, body.password) : false;
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      return NextResponse.json({ error: "E-posta veya parola hatalı" }, { status: 401 });
    }

    // MFA aşaması
    if (user.mfaEnabled) {
      const secret = decryptSecret(user.mfaSecretCipher);
      const codeOk = secret ? verifyTotp(secret, body.totp ?? "") : false;
      if (!codeOk && body.recoveryCode && user.recoveryCodes) {
        // kurtarma faktörü — tek kullanımlık hash tüketimi
        const codes = JSON.parse(user.recoveryCodes) as { hash: string; usedAt: string | null }[];
        const target = codes.find((c) => !c.usedAt && c.hash === hashRecoveryCode(body.recoveryCode!));
        if (target) {
          target.usedAt = new Date().toISOString();
          await db.user.update({ where: { id: user.id }, data: { recoveryCodes: JSON.stringify(codes) } });
        } else {
          return NextResponse.json({ error: "Kurtarma kodu geçersiz veya kullanılmış" }, { status: 401 });
        }
      } else if (!codeOk) {
        return NextResponse.json({ error: "Doğrulama kodu gerekli (TOTP) veya kurtarma kodu kullanın", needMfa: true }, { status: 401 });
      }
    }

    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const cookie = sessionCookieHeader({ uid: user.id, role: user.role, tenantId: user.tenantId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
    const mfaEnforcedForRole = MFA_ENFORCED_ROLES.includes(user.role) && !user.mfaEnabled;
    return new NextResponse(
      JSON.stringify({
        ok: true,
        user: { id: user.id, name: user.name, role: user.role },
        mfaEnforcedForRole, // ORG_OWNER/FINANCE_MANAGER zorunlu MFA — kurulum istemi göster
      }),
      { status: 200, headers: { "Set-Cookie": cookie, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("POST /api/auth/login", e);
    return NextResponse.json({ error: "Giriş başarısız" }, { status: 500 });
  }
}
