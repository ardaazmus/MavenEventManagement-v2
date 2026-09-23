// API Geçidi — çift yönlü veri akışı merkezi (düşünce bulutu 4)
// POST /api/integrations/run { id, payload?, dryRun? }
//   OUTBOUND: baseUrl'e gerçek fetch (8 sn timeout) → IntegrationLog
//   INBOUND: hook simülasyonu (payload kaydı)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ActivityType } from "@/lib/api/activity";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { id?: string; payload?: Record<string, unknown>; dryRun?: boolean };
    if (!body.id) return NextResponse.json({ error: "Entegrasyon id zorunlu" }, { status: 400 });

    const integration = await db.apiIntegration.findUnique({ where: { id: body.id } });
    if (!integration) return NextResponse.json({ error: "Entegrasyon bulunamadı" }, { status: 404 });
    if (integration.status === "PAUSED") return NextResponse.json({ error: "Entegrasyon duraklatılmış" }, { status: 409 });

    const startedAt = Date.now();
    let ok = false, statusCode: number | null = null, summary = "", errorText: string | null = null;
    const payloadStr = body.payload ? JSON.stringify(body.payload).slice(0, 500) : null;

    if (integration.direction === "OUTBOUND") {
      if (!integration.baseUrl) {
        return NextResponse.json({ error: "OUTBOUND entegrasyon için baseUrl tanımlı değil" }, { status: 422 });
      }
      const url = integration.baseUrl.replace(/\{editionId\}/g, integration.editionId ?? "");
      if (body.dryRun) {
        summary = `DRY-RUN → ${integration.method ?? "GET"} ${url}`;
        ok = true; statusCode = null;
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const headers: Record<string, string> = { "Content-Type": "application/json", "X-Maven-Integration": integration.name };
          const auth = integration.authConfig ? JSON.parse(integration.authConfig) as Record<string, string> : {};
          if (integration.authType === "API_KEY" && auth.key) headers["X-API-Key"] = auth.key;
          if (integration.authType === "BEARER" && auth.token) headers["Authorization"] = `Bearer ${auth.token}`;
          const res = await fetch(url, {
            method: integration.kind === "REST" ? "POST" : "GET",
            headers,
            body: integration.kind === "REST" && body.payload ? JSON.stringify(body.payload) : undefined,
            signal: controller.signal,
          });
          statusCode = res.status; ok = res.ok;
          summary = `${res.status} ${res.statusText || (res.ok ? "OK" : "")} — ${url.slice(0, 120)}`;
          if (!res.ok) errorText = `HTTP ${res.status}`;
        } catch (e) {
          ok = false;
          errorText = e instanceof Error ? e.message : "ağ hatası";
          summary = `HATA: ${errorText} — ${url.slice(0, 100)}`;
        } finally { clearTimeout(timer); }
      }
    } else {
      // INBOUND simülasyon — hook ucuyla aynı log dili
      ok = true; statusCode = 202;
      summary = `INBOUND simülasyon: /api/integrations/hook/${integration.inboundToken ?? "—"}${payloadStr ? ` · payload ${body.payload ? Object.keys(body.payload).length : 0} alan` : ""}`;
    }

    const durationMs = Date.now() - startedAt;
    const log = await db.integrationLog.create({
      data: {
        integrationId: integration.id, editionId: integration.editionId,
        direction: integration.direction, method: integration.kind === "REST" ? "POST" : "GET",
        endpoint: integration.baseUrl, statusCode, ok, durationMs, summary,
        payload: payloadStr,
      },
    });
    await db.apiIntegration.update({
      where: { id: integration.id },
      data: {
        lastRunAt: new Date(), lastStatus: ok ? "OK" : "FAILED",
        successCount: ok ? { increment: 1 } : undefined,
        failCount: ok ? undefined : { increment: 1 },
        status: ok ? (integration.status === "ERROR" ? "ACTIVE" : integration.status) : "ERROR",
      },
    });
    if (!body.dryRun && integration.editionId) {
      const edition = await db.eventEdition.findUnique({ where: { id: integration.editionId }, select: { tenantId: true } });
      await db.activityLog.create({
        data: {
          tenantId: edition?.tenantId ?? null, editionId: integration.editionId,
          type: ok ? ActivityType.CAMPAIGN_SAVED : ActivityType.CAMPAIGN_SAVED,
          message: `API Geçidi: ${integration.name} ${ok ? "başarılı" : "başarısız"} (${statusCode ?? "—"}, ${durationMs}ms)`,
          entityType: "ApiIntegration", entityId: integration.id, actorName: "API Geçidi",
        },
      });
    }

    return NextResponse.json({ ok, statusCode, durationMs, summary, errorText, logId: log.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Çalıştırma başarısız" }, { status: 500 });
  }
}
