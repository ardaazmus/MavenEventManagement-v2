// /api/auth/recovery/use — kurtarma kodu tek kullanımlık tüketim denetimi (A4)
// { email, code } → kod hash'i eşleşen ve usedAt boş olan kayıt tüketilir;
// yanıt: kurtarma kabul + TOTP yeniden kurulum istemi (kurtarma faktörü tek başına oturum AÇMAZ —
// ikinci faktör yeniden kurulana kadar yalnız sınırlı erişim; bu uç yalnız doğrulama döner).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthEnabled } from "@/lib/auth/gate";
import { hashRecoveryCode } from "@/lib/auth/totp";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const gate = requireAuthEnabled();
  if (gate) return gate;
  const denied = enforceRateLimit(req, { key: "recovery-use", limit: 5, windowMs: 900_000 });
  if (denied) return denied;

  try {
    const body = (await req.json()) as { email?: string; code?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !body.code) return NextResponse.json({ error: "email ve code zorunlu" }, { status: 400 });

    const user = await db.user.findFirst({ where: { email } });
    if (!user?.recoveryCodes) return NextResponse.json({ error: "Kod geçersiz" }, { status: 401 });
    const codes = JSON.parse(user.recoveryCodes) as { hash: string; usedAt: string | null }[];
    const target = codes.find((c) => !c.usedAt && c.hash === hashRecoveryCode(body.code!));
    if (!target) return NextResponse.json({ error: "Kod geçersiz veya kullanılmış" }, { status: 401 });
    target.usedAt = new Date().toISOString();
    await db.user.update({ where: { id: user.id }, data: { recoveryCodes: JSON.stringify(codes) } });
    return NextResponse.json({ ok: true, remaining: codes.filter((c) => !c.usedAt).length, mustSetupMfa: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Kurtarma başarısız" }, { status: 500 });
  }
}
