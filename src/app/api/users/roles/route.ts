// H-05: Rol sözlüğü (admin) — davet ve atama açılır listeleri.
// Kapı: requireAdmin(); kiracı sunucu bağlamından.
import { NextResponse } from "next/server";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireAdmin } from "@/lib/auth/request-context";
import { db } from "@/lib/db";
import { getAssignableRoles, listInvitableRoles, type RolesPrisma } from "@/lib/users/roles";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const tenantId = await resolveContext(null);
    const [assignable, invitable] = await Promise.all([
      getAssignableRoles(db as unknown as RolesPrisma, tenantId),
      Promise.resolve(listInvitableRoles()),
    ]);
    return NextResponse.json({ invitable, assignable });
  } catch (e) {
    if (e instanceof GuardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/users/roles", e);
    return NextResponse.json({ error: "Rol listesi alınamadı" }, { status: 500 });
  }
}
