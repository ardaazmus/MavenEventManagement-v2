// H-11: şirket duyuruları — liste (personel) + oluşturma (admin).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff, requireAdmin } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseAnnouncementInput, isAnnouncementLive, AnnouncementValidationError } from "@/lib/announcements/validate";

export async function GET(req: NextRequest) {
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const tenantId = await resolveContext(null);
    const activeOnly = req.nextUrl.searchParams.get("activeOnly") !== "0";
    const rows = await db.tenantAnnouncement.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
    const now = new Date();
    const items = activeOnly ? rows.filter((r) => isAnnouncementLive(r, now)) : rows;
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof GuardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/announcements", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Duyurular alınamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "announce-write", limit: 30, windowMs: 60_000 });
  if (denied) return denied;
  const adminGate = await requireAdmin();
  if (adminGate) return adminGate;

  try {
    const tenantId = await resolveContext(null);
    const draft = parseAnnouncementInput(await req.json());
    const created = await db.tenantAnnouncement.create({ data: { tenantId, ...draft } });
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (e) {
    if (e instanceof AnnouncementValidationError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof GuardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/announcements", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Duyuru oluşturulamadı" }, { status: 500 });
  }
}
