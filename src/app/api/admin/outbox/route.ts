// Admin — P22.5 outbox operasyon ekranı API'si: kuyruk listesi (redakte yük
// önizlemeli) + FAILED/DEAD kaydını kuyruğa iade. Yetki: requireAdmin +
// sunucu kiracı kapsamı + rate-limit.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/request-context";
import { resolveContext } from "@/lib/api/tenant-guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requeueOutbox, type OutboxClient } from "@/lib/integrations/outbox";
import { redactPayload } from "@/lib/integrations/webhooks";
import { ActivityType } from "@/lib/api/activity";

const STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "DEAD"] as const;

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "admin-outbox", limit: 60, windowMs: 60_000 });
    if (denied) return denied;
    const sp = req.nextUrl.searchParams;
    const tenantId = await resolveContext(null);
    const status = sp.get("status");
    const eventType = sp.get("eventType");
    const take = Math.max(1, Math.min(200, Number(sp.get("take") ?? 50) || 50));

    const rows = await db.outboxEvent.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
        ...(status && (STATUSES as readonly string[]).includes(status) ? { status } : {}),
        ...(eventType ? { eventType } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    const counts = await db.outboxEvent.groupBy({
      by: ["status"],
      where: { OR: [{ tenantId }, { tenantId: null }] },
      _count: { _all: true },
    });
    return NextResponse.json({
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      items: rows.map((r) => {
        let payload: unknown = null;
        try {
          payload = redactPayload(JSON.parse(r.payload) as unknown);
        } catch {
          payload = null;
        }
        return {
          id: r.id,
          tenantId: r.tenantId,
          editionId: r.editionId,
          aggregateType: r.aggregateType,
          aggregateId: r.aggregateId,
          eventType: r.eventType,
          payload, // redakte önizleme (P22.5)
          status: r.status,
          error: r.error,
          retryCount: r.retryCount,
          maxAttempts: r.maxAttempts,
          nextRunAt: r.nextRunAt,
          lockedBy: r.lockedBy,
          deadAt: r.deadAt,
          deadReason: r.deadReason,
          createdAt: r.createdAt,
          processedAt: r.processedAt,
        };
      }),
    });
  } catch (e) {
    console.error("admin/outbox GET error:", e);
    return NextResponse.json({ error: "Kuyruk alınamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "admin-outbox", limit: 30, windowMs: 60_000 });
    if (denied) return denied;
    const tenantId = await resolveContext(null);
    const body = (await req.json()) as { action?: string; id?: string };
    if (body.action !== "retry" || !body.id) {
      return NextResponse.json({ error: "action=retry + id zorunlu" }, { status: 400 });
    }
    const row = await db.outboxEvent.findFirst({
      where: { id: body.id, OR: [{ tenantId }, { tenantId: null }] },
      select: { id: true, status: true, editionId: true, eventType: true },
    });
    if (!row) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    const ok = await requeueOutbox(db as unknown as OutboxClient, row.id);
    if (!ok) return NextResponse.json({ error: "Yalnız FAILED/DEAD kayıt iade edilir" }, { status: 409 });
    await db.activityLog.create({
      data: {
        type: ActivityType.TASK_SAVED,
        tenantId,
        editionId: row.editionId,
        message: `Outbox iade: ${row.eventType} (${row.id.slice(-6)})`,
        entityType: "OutboxEvent",
        entityId: row.id,
        actorName: "Yönetici",
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("admin/outbox POST error:", e);
    return NextResponse.json({ error: "İade başarısız" }, { status: 500 });
  }
}
