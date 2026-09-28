// API Geçidi — INBOUND webhook alım ucu (düşünce bulutu 4)
// POST /api/integrations/hook/[token] — dış sistemlerin Maven'a veri itmesi.
// P22.3 sertleştirme:
//  - SIGNATURE kimlikli entegrasyonlarda HMAC imzası + 5dk tekrar penceresi
//    ZORUNLU (x-maven-signature / x-maven-timestamp); imzasız çağrı 401.
//  - Teslim tekilleme: Idempotency-Key (yoksa gövde eventId/deliveryId) aynı
//    entegrasyonda bir kez işlenir; tekrarı iş yapmadan {deduped:true} döner.
//  - Kişi eşleşmesi KİRACI KAPSAMLIDIR (çapraz-kiracı kişi katılımı sızıntısı kapalı).
//  - GET yazım yapmaz (durum yoklaması); yazım yalnız POST.
// Her çağrı IntegrationLog'a düşer (yük redakte) + edisyon aktivitesine yansır.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ActivityType } from "@/lib/api/activity";
import { enforceRateLimit } from "@/lib/rate-limit";
import { verifySignature, secretFromAuthConfig, redactPayload } from "@/lib/integrations/webhooks";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const denied = enforceRateLimit(req, { key: "webhook-inbound", limit: 60, windowMs: 60_000 });
  if (denied) return denied;
  const startedAt = Date.now();
  try {
    const { token } = await params;
    const integration = await db.apiIntegration.findUnique({ where: { inboundToken: token } });
    if (!integration) return NextResponse.json({ error: "Geçersiz webhook token" }, { status: 404 });
    if (integration.status !== "ACTIVE") {
      return NextResponse.json({ error: `Entegrasyon ${integration.status} — çağrı reddedildi` }, { status: 409 });
    }

    // imza doğrulaması ham gövde üzerinden (ayrıştırma ÖNCESİ)
    const rawBody = await req.text();
    if (integration.authType === "SIGNATURE") {
      const secret = secretFromAuthConfig(integration.authConfig);
      const check = verifySignature(
        secret ?? "",
        req.headers.get("x-maven-timestamp"),
        rawBody,
        req.headers.get("x-maven-signature"),
      );
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 401 });
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json({ error: "Gövde geçerli JSON olmalı" }, { status: 400 });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "Gövde geçerli JSON olmalı" }, { status: 400 });
    }

    // teslim tekilleme — anahtarsız çağrılar tekillenemez (işlenir, not düşülür)
    const headerKey = req.headers.get("idempotency-key")?.trim();
    const bodyKey = [payload.eventId, payload.deliveryId, payload.id].find((v) => typeof v === "string" && (v as string).trim());
    const deliveryKey = headerKey || (typeof bodyKey === "string" ? bodyKey.trim() : null);
    if (deliveryKey) {
      try {
        await db.webhookDelivery.create({
          data: { integrationId: integration.id, deliveryKey, status: "RECEIVED" },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          return NextResponse.json({ ok: true, deduped: true });
        }
        throw e;
      }
    }

    const summary = Object.keys(payload).length > 0
      ? `Webhook: ${Object.keys(payload).slice(0, 6).join(", ")}${Object.keys(payload).length > 6 ? "…" : ""}`
      : "Webhook: boş gövde";

    let processed = "";
    // derin entegrasyon: type=PARTICIPANT → kişi + katılım upsert (eşleştirme e-postayla)
    if (payload.type === "PARTICIPANT" && integration.editionId) {
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
      const fullName = typeof payload.fullName === "string" ? payload.fullName : null;
      if (email || fullName) {
        const parts = (fullName ?? email ?? "").split(/\s+/).filter(Boolean);
        // DÜZELTME (çapraz-kiracı sızıntısı): eşleşme YALNIZ entegrasyon kiracısında
        let person = email ? await db.person.findFirst({ where: { tenantId: integration.tenantId, email } }) : null;
        if (!person && fullName) {
          const fn = parts[0] ?? fullName; const ln = parts.slice(1).join(" ") || "—";
          person = await db.person.findFirst({
            where: { tenantId: integration.tenantId, firstName: fn, lastName: ln, status: { not: "MERGED" } },
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
        payload: JSON.stringify(redactPayload(payload)).slice(0, 500),
      },
    });
    if (deliveryKey) {
      await db.webhookDelivery.updateMany({
        where: { integrationId: integration.id, deliveryKey },
        data: { status: "PROCESSED", statusCode: 202 },
      });
    }
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

// GET yazım yapmaz — entegrasyon durum yoklaması (önizleme/tarayıcı güvenliği)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const integration = await db.apiIntegration.findUnique({
    where: { inboundToken: token },
    select: { name: true, status: true, direction: true, lastRunAt: true, lastStatus: true },
  });
  if (!integration) return NextResponse.json({ error: "Geçersiz webhook token" }, { status: 404 });
  return NextResponse.json({ ok: true, integration });
}
