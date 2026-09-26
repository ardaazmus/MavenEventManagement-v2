// /api/auth/me — oturum sahibinin hafif kimliği (UI-AKIS 2026 rol filtresi için)
// DÖNÜŞ: MAVEN_AUTH kapalı veya oturum yok → { authenticated:false } — istemci
// rol=null kabul eder ve TÜM modülleri gösterir (mevcut davranış korunur).
// Auth-on + personel oturumu → { authenticated:true, role, name, email } — istemci
// MODULES.roles matrisiyle menüyü ve modül kilitlerini süzer.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestActor, STAFF_ROLES } from "@/lib/auth/request-context";

export async function GET() {
  try {
    const actor = await requestActor();
    if (!actor) return NextResponse.json({ authenticated: false, role: null, name: null });
    const u = await db.user.findUnique({
      where: { id: actor.uid },
      select: { name: true, email: true, role: true },
    });
    if (!u) return NextResponse.json({ authenticated: false, role: null, name: null });
    const role = STAFF_ROLES.has(u.role) ? u.role : null;
    return NextResponse.json({
      authenticated: Boolean(role),
      role,
      name: u.name,
      email: u.email,
    });
  } catch (e) {
    console.error("GET /api/auth/me", e instanceof Error ? e.message : e);
    return NextResponse.json({ authenticated: false, role: null, name: null });
  }
}
