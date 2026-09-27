// /api/auth/register — A4 (flag-off → 404). İlk kullanıcı ORG_OWNER; rıza zorunlu;
// argon2id (m=19456,t=2,p=1); parola politikası; oran sınırı 5/10dk/IP.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthEnabled } from "@/lib/auth/gate";
import { hashPassword, passwordPolicyError } from "@/lib/auth/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveContext } from "@/lib/api/tenant-guard";

const CONSENT_VERSION = "2026-01-KVKK";

export async function POST(req: NextRequest) {
  const gate = requireAuthEnabled();
  if (gate) return gate;
  const denied = enforceRateLimit(req, { key: "auth-register", limit: 5, windowMs: 600_000 });
  if (denied) return denied;

  try {
    const body = (await req.json()) as { email?: string; name?: string; password?: string; consent?: boolean };
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Geçerli e-posta zorunlu" }, { status: 422 });
    if (!body.name?.trim()) return NextResponse.json({ error: "Ad zorunlu" }, { status: 422 });
    // A4 asgari rıza: onaysız kayıt yok
    if (!body.consent) return NextResponse.json({ error: "KVKK aydınlatma metni onayı zorunlu" }, { status: 422 });
    const pwError = passwordPolicyError(body.password ?? "");
    if (pwError) return NextResponse.json({ error: pwError }, { status: 422 });

    const existing = await db.user.findFirst({ where: { email } });
    if (existing) return NextResponse.json({ error: "Bu e-posta ile kayıt mevcut" }, { status: 409 });

    const tenantId = await resolveContext(null);
    const isFirstUser = (await db.user.count({ where: { tenantId } })) === 0;
    const passwordHash = await hashPassword(body.password!);

    const user = await db.user.create({
      data: {
        tenantId,
        email,
        name: body.name.trim(),
        role: isFirstUser ? "ORG_OWNER" : "ORG_ADMIN",
        passwordHash,
        consentVersion: CONSENT_VERSION,
        consentAcceptedAt: new Date(),
      },
      select: { id: true, email: true, name: true, role: true, consentAcceptedAt: true },
    });
    return NextResponse.json({ ok: true, user, role: user.role }, { status: 201 });
  } catch (e) {
    console.error("POST /api/auth/register", e);
    return NextResponse.json({ error: "Kayıt başarısız" }, { status: 500 });
  }
}
