// /api/customer-contacts/import-participants — Katılımcılardan müşteri datası üretimi
// Kullanıcı talebi: üst firma, kendi organizasyonlarındaki kişi/kurum katılımcılardan
// müşteri datası oluşturabilmeli. E-posta/telefon eşleşen satırlar YENİDEN yaratılmaz —
// mevcut kontak zenginleştirilir (birleştirme). Kiracı bağlamı sunucudan çözülür.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { importParticipantsToCustomers, BroadcastError } from "@/lib/api/comms-broadcast";
import { verifyEditionTenant, GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "crm-import", limit: 20, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const editionId = typeof body.editionId === "string" ? body.editionId : "";
    if (!editionId) return NextResponse.json({ error: "editionId zorunludur" }, { status: 400 });
    try {
      await verifyEditionTenant(editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
    const tenantId = await resolveContext(null);

    const categoryIds = Array.isArray(body.categoryIds)
      ? (body.categoryIds as unknown[]).filter((v): v is string => typeof v === "string")
      : undefined;
    const tag = typeof body.tag === "string" && body.tag.trim() ? body.tag.trim().slice(0, 60) : null;

    const actor = await requestActor();
    let actorName = "Yönetici";
    if (actor) {
      const u = await db.user.findUnique({ where: { id: actor.uid }, select: { name: true } });
      actorName = u?.name ?? actor.role;
    }

    const result = await importParticipantsToCustomers({ editionId, tenantId, categoryIds, tag, actorName });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof BroadcastError) {
      const status = e.code === "EDITION_NOT_FOUND" ? 404 : e.code === "VALIDATION" ? 400 : 409;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error("POST /api/customer-contacts/import-participants", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Aktarım tamamlanamadı" }, { status: 500 });
  }
}
