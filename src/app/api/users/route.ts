// P06.1: Salt-okunur kiracı kullanıcı listesi — GET yalnız.
// Kapı: requireAdmin() (auth-on'da ORG_OWNER/ORG_ADMIN; auth-off demo geçişi).
// Kapsam: kiracı YALNIZ sunucu bağlamından (resolveContext); sorgudan tenant alınmaz.
// Yanıt: PII-minimal admin özeti (durum, MFA, son giriş, rol/kapsam); gizli alan yok.
import { NextRequest, NextResponse } from "next/server";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireAdmin } from "@/lib/auth/request-context";
import { db } from "@/lib/db";
import { listUsers, parseUserListParams, UserListValidationError, type UserListPrisma } from "@/lib/users/user-list";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let params;
  try {
    params = parseUserListParams(req.nextUrl.searchParams);
  } catch (e) {
    if (e instanceof UserListValidationError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  try {
    const tenantId = await resolveContext(null);
    const result = await listUsers(db as unknown as UserListPrisma, { tenantId, ...params });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof GuardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/users", e);
    return NextResponse.json({ error: "Kullanıcı listesi alınamadı" }, { status: 500 });
  }
}
