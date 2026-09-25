// §3.2 Soru-Cevap MODERASYONU (organizatör yüzeyi) — yanıtla / gizle / yeniden yayınla.
// Portal soruları katılımcı yüzeyinde zaten oturum-kapılı okunuyor (portal/content
// myQuestions); bu uç YALNIZ admin: edition bağlamı resolveEditionContext ile çözülür,
// sırrı/PII yankılamaz, ActivityLog blok-akışı ile aynı disiplinde (yalnız durum bilgisi).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth/request-context";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["PENDING", "ANSWERED", "HIDDEN"]);

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

// Moderasyon listesi: tam soru metni organizatör içeriğidir (PII değil);
// displayName katılımcının onaylı görünen adıdır — anonimse zaten null döner.
const SELECT = {
  id: true,
  body: true,
  status: true,
  answerBody: true,
  answeredAt: true,
  displayName: true,
  isAnonymous: true,
  programSessionId: true,
  createdAt: true,
} as const;

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "portal-questions-read", limit: 60, windowMs: 60_000 });
    if (denied) return denied;
    const editionId = req.nextUrl.searchParams.get("editionId");
    const ctx = await resolveEditionContext(editionId, { required: true });
    const editionIdResolved = ctx.editionId as string;
    const items = await db.portalQuestion.findMany({
      where: { editionId: editionIdResolved },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: SELECT,
    });
    return NextResponse.json({ items });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/questions GET:", e);
    return NextResponse.json({ error: "Sorular alınamadı" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "portal-questions-write", limit: 30, windowMs: 60_000 });
    if (denied) return denied;
    const body = (await req.json()) as { id?: string; editionId?: string; status?: string; answerBody?: string | null };
    if (!body.id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });
    const row = await db.portalQuestion.findUnique({ where: { id: body.id }, select: { editionId: true } });
    if (!row) return NextResponse.json({ error: "Soru bulunamadı" }, { status: 404 });
    // IDOR kapısı: kaydın kendi edisyonu bağlamla çözülmeli (body.editionId YOK SAYILIR)
    const ctx = await resolveEditionContext(row.editionId, { required: true });
    const editionIdResolved = ctx.editionId as string;

    const data: Record<string, unknown> = {};
    if (body.status !== undefined) {
      const st = body.status.toUpperCase();
      if (!STATUSES.has(st)) {
        return NextResponse.json({ error: "status PENDING|ANSWERED|HIDDEN olmalı" }, { status: 400 });
      }
      data.status = st;
    }
    if (body.answerBody !== undefined) {
      const answer = (body.answerBody ?? "").trim().slice(0, 1000);
      data.answerBody = answer || null;
      if (answer) {
        // yanıt verildiğinde durum otomatik ANSWERED'e döner (akış: yanıtla → katılımcı görür)
        data.status = "ANSWERED";
        data.answeredAt = new Date();
      } else if (body.status === undefined) {
        // yanıt tamamen temizlenirse soru beklemede olarak işaretlenir
        data.status = "PENDING";
        data.answeredAt = null;
      }
    } else if (body.status !== undefined) {
      if (body.status.toUpperCase() === "PENDING") data.answeredAt = null;
      if (body.status.toUpperCase() === "ANSWERED" && !data.answerBody) data.answeredAt = new Date();
    }

    const updated = await db.portalQuestion.update({ where: { id: body.id }, data, select: SELECT });
    const flag =
      data.answerBody
        ? "yanıtlandı"
        : updated.status === "HIDDEN"
          ? "gizlendi"
          : updated.status === "PENDING"
            ? "beklemeye alındı"
            : "güncellendi";
    await db.activityLog.create({
      data: {
        editionId: editionIdResolved,
        type: "PORTAL_QUESTION_MODERATED",
        message: `Portal sorusu ${flag} — "${updated.body.slice(0, 60)}"`,
        entityType: "portal-question",
        entityId: updated.id,
        actorName: "Yönetici",
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/questions PATCH:", e);
    return NextResponse.json({ error: "Soru güncellenemedi" }, { status: 400 });
  }
}
