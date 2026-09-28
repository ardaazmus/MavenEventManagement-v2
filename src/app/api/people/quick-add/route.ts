// P16.3: POST /api/people/quick-add — normalize/dedupe'li hızlı ekleme.
// Yanıt: created (yeni master [+ilişki]) | attached (mevcut master'a ilişki) |
// duplicate (adaylar — birleştirme kararı kullanıcıda, otomatik yazma YOK).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext, verifyEditionTenant } from "@/lib/api/tenant-guard";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { quickAddPerson, PeopleScopeError } from "@/lib/people/directory";

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "people-quick-add", limit: 60, windowMs: 60_000 });
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
    const editionId = typeof body.editionId === "string" && body.editionId ? body.editionId : null;
    if (editionId) await verifyEditionTenant(editionId);
    const actor = await requestActor();
    const result = await quickAddPerson(db as never, {
      tenantId,
      firstName: typeof body.firstName === "string" ? body.firstName : "",
      lastName: typeof body.lastName === "string" ? body.lastName : "",
      email: typeof body.email === "string" ? body.email : null,
      phone: typeof body.phone === "string" ? body.phone : null,
      company: typeof body.company === "string" ? body.company : null,
      title: typeof body.title === "string" ? body.title : null,
      editionId,
    });
    if (result.outcome === "duplicate") {
      return NextResponse.json({ outcome: "duplicate", candidates: result.candidates }, { status: 200 });
    }
    await db.activityLog.create({
      data: {
        type: result.outcome === "created" ? "PERSON_SAVED" : "PARTICIPATION_SAVED",
        message:
          result.outcome === "created"
            ? `Hızlı kişi: ${body.firstName} ${body.lastName}${editionId ? " + etkinliğe eklendi" : ""}`
            : `Mevcut kişi etkinliğe eklendi: ${body.firstName} ${body.lastName} (kopya yok)`,
        tenantId,
        editionId,
        entityType: "Person",
        entityId: String((result.person as { id: string }).id),
        actorName: actor?.uid ?? "Bilinmeyen",
      },
    });
    return NextResponse.json(result, { status: result.outcome === "created" ? 201 : 200 });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof PeopleScopeError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/people/quick-add", e);
    return NextResponse.json({ error: "Hızlı ekleme başarısız" }, { status: 500 });
  }
}
