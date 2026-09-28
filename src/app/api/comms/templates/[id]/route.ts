// P17.1: PATCH /api/comms/templates/[id] — kütüphane bakımı (sürüm artar).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(req, { key: "comms-templates", limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  try {
    const tenantId = await resolveContext(null);
    const { id } = await ctx.params;
    const existing = await db.tenantMailTemplate.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== tenantId) {
      return NextResponse.json({ error: "Şablon bulunamadı" }, { status: 404 });
    }
    const data: Record<string, unknown> = { version: existing.version + 1 };
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.subject === "string") data.subject = body.subject;
    if (typeof body.htmlBody === "string") {
      if (!body.htmlBody.trim() || body.htmlBody.length > 500_000) {
        return NextResponse.json({ error: "htmlBody boş ya da 500KB üstü olamaz" }, { status: 422 });
      }
      data.htmlBody = body.htmlBody;
    }
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    const updated = await db.tenantMailTemplate.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/comms/templates/[id]", e);
    return NextResponse.json({ error: "Şablon güncellenemedi" }, { status: 500 });
  }
}
