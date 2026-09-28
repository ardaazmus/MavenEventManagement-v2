// Admin — P22.2 outbox tarama (worker): vadesi gelen event'leri lease ile alır,
// hedef OUTBOUND entegrasyonlara imzalı gönderir, sonucu işler (tamam/hata/
// ölümcül). Tekrar çağrılabilir (idempotent claim); eşzamanlı worker'lar
// lease ile ayrışır. Yetki: requireAdmin + rate-limit.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { claimOutbox, completeOutbox, failOutbox, type OutboxClient } from "@/lib/integrations/outbox";
import { dispatchWebhook } from "@/lib/integrations/providers";
import { secretFromAuthConfig, redactPayload } from "@/lib/integrations/webhooks";

const client = () => db as unknown as OutboxClient;

function authHeaders(integration: { authType: string; authConfig: string | null }): Record<string, string> {
  let cfg: Record<string, string> = {};
  try {
    cfg = integration.authConfig ? (JSON.parse(integration.authConfig) as Record<string, string>) : {};
  } catch {
    cfg = {};
  }
  if (integration.authType === "API_KEY" && cfg.key) return { "X-API-Key": cfg.key };
  if (integration.authType === "BEARER" && cfg.token) return { Authorization: `Bearer ${cfg.token}` };
  if (integration.authType === "BASIC" && cfg.username && cfg.password) {
    return { Authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64")}` };
  }
  return {};
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "admin-outbox-drain", limit: 20, windowMs: 60_000 });
    if (denied) return denied;
    const body = (await req.json().catch(() => ({}))) as { batch?: number };
    const batch = Math.max(1, Math.min(100, body.batch ?? 25));
    const workerId = `drain-${randomUUID().slice(0, 8)}`;

    const claimed = await claimOutbox(client(), workerId, { batch });
    let completed = 0;
    let failed = 0;
    let dead = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const event of claimed) {
      const full = await db.outboxEvent.findUnique({ where: { id: event.id } });
      if (!full) continue;
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(full.payload) as Record<string, unknown>;
      } catch {
        payload = {};
      }
      // hedefler: edisyon eşleşen ya da kiracı-düzeyi ACTIVE OUTBOUND WEBHOOK/REST
      const targets = await db.apiIntegration.findMany({
        where: {
          status: "ACTIVE",
          direction: "OUTBOUND",
          kind: { in: ["WEBHOOK", "REST"] },
          baseUrl: { not: null },
          ...(full.tenantId ? { tenantId: full.tenantId } : {}),
          OR: [{ editionId: full.editionId }, { editionId: null }],
        },
        take: 20,
      });
      if (targets.length === 0) {
        // hedef yok = iş bitti (ölü kuyruk şişmez; log açıklayıcı)
        await completeOutbox(client(), full.id, workerId);
        completed += 1;
        continue;
      }
      let eventOk = true;
      let fatal = false;
      let lastError = "";
      for (const target of targets) {
        const startedAt = Date.now();
        const url = (target.baseUrl as string).replace(/\{editionId\}/g, full.editionId ?? "");
        const secret = target.authType === "SIGNATURE" ? secretFromAuthConfig(target.authConfig) : null;
        const res = await dispatchWebhook({
          url,
          eventType: full.eventType,
          deliveryId: full.id,
          payload,
          secret,
          extraHeaders: { "X-Maven-Integration": target.name, ...authHeaders(target) },
        });
        await db.integrationLog.create({
          data: {
            integrationId: target.id,
            editionId: full.editionId,
            direction: "OUTBOUND",
            method: "POST",
            endpoint: url.slice(0, 300),
            statusCode: res.status,
            ok: res.ok,
            durationMs: Date.now() - startedAt,
            summary: `outbox:${full.eventType} → ${res.ok ? "OK" : res.error}`,
            payload: JSON.stringify(redactPayload(payload)).slice(0, 500),
          },
        });
        await db.apiIntegration.update({
          where: { id: target.id },
          data: {
            lastRunAt: new Date(),
            lastStatus: res.ok ? "OK" : "FAILED",
            ...(res.ok ? { successCount: { increment: 1 } } : { failCount: { increment: 1 } }),
          },
        });
        if (!res.ok) {
          eventOk = false;
          lastError = `${target.name}: ${res.error ?? "hata"}`;
          if (!res.retryable) fatal = true;
        }
      }
      if (eventOk) {
        await completeOutbox(client(), full.id, workerId);
        completed += 1;
      } else {
        const outcome = await failOutbox(client(), full.id, workerId, lastError || "Teslim başarısız", Date.now(), { fatal });
        if (outcome.dead) dead += 1;
        else failed += 1;
        errors.push({ id: full.id, error: lastError });
      }
    }

    return NextResponse.json({ ok: true, workerId, claimed: claimed.length, completed, failed, dead, errors });
  } catch (e) {
    console.error("admin/outbox/drain error:", e);
    return NextResponse.json({ error: "Tarama başarısız" }, { status: 500 });
  }
}
