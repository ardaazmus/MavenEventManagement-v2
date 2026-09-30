// F1-b: /api/users/me/permissions — yetki izi ("hangi katmandan yetkilendirildim?").
// Kapı: requireStaff(); salt-okunur. demo_bypass yalnız MAVEN_AUTH=off'ta döner —
// oturumlu aktörde kaynak db_rbac (kalıcı atama) ya da legacy_fallback (taban rol).
import { NextResponse } from "next/server";
import { AUTH_ENABLED } from "@/lib/auth-flag";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { db } from "@/lib/db";
import { buildPermissionTrace, type TracePrisma } from "@/lib/users/permission-trace";

export async function GET() {
  const denied = await requireStaff();
  if (denied) return denied;

  try {
    const actor = await requestActor();
    if (!actor && AUTH_ENABLED) {
      // Kapı-geçti/okuma-düştü yarışı: demo_bypass sözleşmesi YALNIZ auth-off içindir.
      return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
    }
    const trace = await buildPermissionTrace(db as unknown as TracePrisma, actor);
    return NextResponse.json(trace);
  } catch (e) {
    console.error("GET /api/users/me/permissions", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Yetki izi alınamadı" }, { status: 500 });
  }
}
