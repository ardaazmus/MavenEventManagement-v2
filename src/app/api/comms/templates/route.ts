// P17.1: GET/POST /api/comms/templates — şirket şablon kütüphanesi.
// Kadro kapılı + kiracı kapsamlı; edisyon şablonu yoksa kampanya buraya düşer.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sanitizeChannel } from "@/lib/comms/consent";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "comms-templates", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const tenantId = await resolveContext(null);
    const channel = sanitizeChannel(req.nextUrl.searchParams.get("channel"));
    const items = await db.tenantMailTemplate.findMany({
      where: { tenantId, ...(channel ? { channel } : {}) },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      take: 200,
    });
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/comms/templates", e);
    return NextResponse.json({ error: "Kütüphane okunamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const htmlBody = typeof body.htmlBody === "string" ? body.htmlBody : "";
  const channel = sanitizeChannel(body.channel) ?? "EMAIL";
  if (!name || !htmlBody.trim()) {
    return NextResponse.json({ error: "name ve htmlBody zorunludur" }, { status: 422 });
  }
  if (htmlBody.length > 500_000) {
    return NextResponse.json({ error: "Şablon 500KB sınırını aşıyor" }, { status: 422 });
  }
  try {
    const tenantId = await resolveContext(null);
    const created = await db.tenantMailTemplate.create({
      data: {
        tenantId,
        name,
        channel,
        subject: typeof body.subject === "string" ? body.subject : null,
        htmlBody,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/comms/templates", e);
    return NextResponse.json({ error: "Şablon oluşturulamadı" }, { status: 500 });
  }
}
