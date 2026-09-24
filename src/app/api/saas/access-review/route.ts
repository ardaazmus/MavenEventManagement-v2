// ─── TASK-B 23: Kiracı erişim denetimi (access review — admin audit yüzeyi) ─────
// MAVEN_AUTH=on iken oturum ZORUNLU (hasSession; bayrak kapalı demo modunda true döner).
// Kullanıcı listesi e-posta İLE döner (yönetici denetim yüzeyi — bilinçli istisna) ancak
// GİZLİ ALANLAR ASLA: passwordHash ve mfaSecretCipher seçilse bile yanıtına MAPLENMEZ —
// yalnız türev boolean'lar (hasPasskey/hasMfaSecret) çıkar. Yanıt {surface, generatedAt} ile
// işaretlenir (denetim kaydı ayrıştırması).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";

const STALE_DAYS = 90;

export async function GET(req: NextRequest) {
  const { hasSession } = await import("@/lib/auth-flag");
  if (!(await hasSession(req))) {
    return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  }
  try {
    const tenantId = await resolveContext(null);
    const staleBefore = new Date(Date.now() - STALE_DAYS * 86_400_000);

    const users = await db.user.findMany({
      where: { tenantId },
      // BİLİNÇLİ SEÇİM: passwordHash ASLA seçilmez; mfaSecretCipher yalnız boolean türetmek
      // için seçilir ve aşağıda MAPLENİR — ham şifreli sır yanıtta YOK.
      select: {
        id: true, email: true, role: true, status: true, lastLoginAt: true, mfaEnabled: true,
        mfaSecretCipher: true,
        _count: { select: { passkeys: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const rows = users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      status: u.status,
      lastLoginAt: u.lastLoginAt,
      mfaEnabled: u.mfaEnabled,
      hasPasskey: u._count.passkeys > 0,
      hasMfaSecret: u.mfaSecretCipher !== null,
    }));

    const aggregate = {
      total: rows.length,
      active: rows.filter((r) => r.status === "ACTIVE").length,
      withMfa: rows.filter((r) => r.mfaEnabled).length,
      withPasskey: rows.filter((r) => r.hasPasskey).length,
      // stale90d: son giriş 90 günden eski YA DA hiç giriş yok
      stale90d: rows.filter((r) => !r.lastLoginAt || r.lastLoginAt < staleBefore).length,
    };

    return NextResponse.json({
      surface: "ACCESS_REVIEW",
      generatedAt: new Date().toISOString(),
      users: rows,
      aggregate,
    });
  } catch (err) {
    if (err instanceof GuardError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erişim denetimi alınamadı" }, { status: 500 });
  }
}
