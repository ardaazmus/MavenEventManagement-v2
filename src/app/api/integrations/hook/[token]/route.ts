// API Geçidi — INBOUND webhook alım ucu (düşünce bulutu 4)
// POST/GET /api/integrations/hook/[token] — dış sistemlerin Maven'a veri itebilmesi
// Her çağrı IntegrationLog'a düşer + edisyon aktivitesine yansır; opsiyonel: type=PARTICIPANT ile kişi/katılım upsert
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ActivityType } from "@/lib/api/activity";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const startedAt = Date.now();
  try {
    const { token } = await params;
    const integration = await db.apiIntegration.findUnique({ where: { inboundToken: token } });
    if (!integration) return NextResponse.json({ error: "Geçersiz webhook token" }, { status: 404 });
    if (integration.status !== "ACTIVE") {
      return NextResponse.json({ error: `Entegrasyon ${integration.status} — çağrı reddedildi` }, { status: 409 });
    }

    let payload: Record<string, unknown> = {};
    try { payload = (await req.json()) as Record<string, unknown>; } catch { /* boş gövde kabul */ }

    const summary = Object.keys(payload).length > 0
      ? `Webhook: ${Object.keys(payload).slice(0, 6).join(", ")}${Object.keys(payload).length > 6 ? "…" : ""}`
      : "Webhook: boş gövde";

    let processed = "";
    // derin entegrasyon: type=PARTICIPANT → kişi + katılım upsert (eşleştirme e-postayla)
    if (payload.type === "PARTICIPANT" && integration.editionId) {
      const email = typeof payload.email === "string" ? payload.email : null;
      const fullName = typeof payload.fullName === "string" ? payload.fullName : null;
      if (email || fullName) {
        const parts = (fullName ?? email ?? "").split(/\s+/).filter(Boolean);
        let person = email ? await db.person.findFirst({ where: { email } }) : null;
        if (!person && fullName) {
          const fn = parts[0] ?? fullName; const ln = parts.slice(1).join(" ") || "—";
          person = await db.person.findFirst({
            where: { firstName: fn, lastName: ln, status: { not: "MERGED" } },
          });
        }
        if (!person && email && fullName) {
          person = await db.person.create({
            data: {
              tenantId: integration.tenantId, firstName: parts[0] ?? fullName, lastName: parts.slice(1).join(" ") || "—",
              email, company: typeof payload.company === "string" ? payload.company : null,
            },
          });
          processed = "yeni kişi";
        } else processed = person ? "mevcut kişi" : "";
        if (person) {
          const existing = await db.eventParticipation.findUnique({
            where: { editionId_personId: { editionId: integration.editionId, personId: person.id } },
          });
          if (!existing) {
            await db.eventParticipation.create({ data: { editionId: integration.editionId, personId: person.id, source: "API" } });
            processed += " + katılım";
          }
        }
      }
    }

    const log = await db.integrationLog.create({
      data: {
        integrationId: integration.id, editionId: integration.editionId, direction: "INBOUND",
        method: "POST", endpoint: `/api/integrations/hook/${token}`, statusCode: 202, ok: true,
        durationMs: Date.now() - startedAt, summary: processed ? `${summary} → ${processed}` : summary,
        payload: JSON.stringify(payload).slice(0, 500),
      },
    });
    await db.apiIntegration.update({
      where: { id: integration.id },
      data: { lastRunAt: new Date(), lastStatus: "OK", successCount: { increment: 1 } },
    });
    if (integration.editionId) {
      const edition = await db.eventEdition.findUnique({ where: { id: integration.editionId }, select: { tenantId: true } });
      await db.activityLog.create({
        data: {
          tenantId: edition?.tenantId ?? null, editionId: integration.editionId,
          type: ActivityType.PARTICIPATION_SAVED,
          message: `API Geçidi webhook: ${integration.name} — ${processed || summary}`,
          entityType: "ApiIntegration", entityId: integration.id, actorName: "Webhook",
        },
      });
    }
    return NextResponse.json({ ok: true, logId: log.id, processed: processed || null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Webhook işlenemedi" }, { status: 500 });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  return POST(req, ctx);
}
