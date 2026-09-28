// H-11: duyuru güncelleme/silme (admin).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";
import { requireAdmin } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseAnnouncementInput, AnnouncementValidationError } from "@/lib/announcements/validate";

type Ctx = { params: Promise<{ id: string }> };

async function owned(tenantId: string, id: string) {
  return db.tenantAnnouncement.findFirst({ where: { id, tenantId }, select: { id: true } });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const denied = enforceRateLimit(req, { key: "announce-write", limit: 30, windowMs: 60_000 });
  if (denied) return denied;
  const adminGate = await requireAdmin();
  if (adminGate) return adminGate;

  try {
    const { id } = await ctx.params;
    const tenantId = await resolveContext(null);
    if (!(await owned(tenantId, id))) {
      return NextResponse.json({ error: "Duyuru bulunamadı" }, { status: 404 });
    }
    const draft = parseAnnouncementInput(await req.json());
    const item = await db.tenantAnnouncement.update({ where: { id }, data: draft });
    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof AnnouncementValidationError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof GuardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("PUT /api/announcements/[id]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Duyuru güncellenemedi" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const denied = enforceRateLimit(req, { key: "announce-write", limit: 30, windowMs: 60_000 });
  if (denied) return denied;
  const adminGate = await requireAdmin();
  if (adminGate) return adminGate;

  try {
    const { id } = await ctx.params;
    const tenantId = await resolveContext(null);
    if (!(await owned(tenantId, id))) {
      return NextResponse.json({ error: "Duyuru bulunamadı" }, { status: 404 });
    }
    await db.tenantAnnouncement.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof GuardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("DELETE /api/announcements/[id]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Duyuru silinemedi" }, { status: 500 });
  }
}
