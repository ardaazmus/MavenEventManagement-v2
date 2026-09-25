// Admin — §5.1 Giriş Kodu Yönetimi: toplu Magic Link / Özel Kod (Access Token) üretimi.
// Seçilen kişilere PortalToken (PARTICIPANT) çıkarılır; ham belirteç YALNIZ bu yanitta
// bir kez döner (single-display — DB'de yalnız sha256). İstenirse mevcut mail modülü
// (dispatchMail — kota/bastırma denetimli) üzerinden e-posta tetiklenir.
// Yetki: requireAdmin + resolveEditionContext; kişi-edisyon bağı doğrulanır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth/request-context";
import { issuePortalToken } from "@/lib/api/portal-tokens";
import { dispatchMail } from "@/lib/mail-dispatch";

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "portal-magic-links", limit: 10, windowMs: 60_000 });
    if (denied) return denied;
    const body = (await req.json()) as {
      editionId?: string;
      personIds?: string[];
      ttlDays?: number;
      sendMail?: boolean;
      subject?: string;
      message?: string;
    };
    if (!body.editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
    const ctx = await resolveEditionContext(body.editionId, { required: true });
    const eid = ctx.editionId as string;

    const personIds = [...new Set((body.personIds ?? []).filter((x) => typeof x === "string" && x.trim()))].slice(0, 200);
    if (personIds.length === 0) return NextResponse.json({ error: "En az bir kişi seçin" }, { status: 400 });

    // kişi-edisyon bağı doğrulaması — yabancı kişiye belirteç çıkarılmaz
    const participations = await db.eventParticipation.findMany({
      where: { editionId: eid, personId: { in: personIds } },
      select: { personId: true },
    });
    const validIds = new Set(participations.map((p) => p.personId));
    const edition = await db.eventEdition.findUnique({ where: { id: eid }, select: { name: true, tenantId: true } });

    const ttlMs = Math.max(1, Math.min(365, body.ttlDays ?? 90)) * 24 * 3_600_000;
    const items: { personId: string; name: string; email: string | null; token: string; expiresAt: Date; mailed: boolean }[] = [];
    const skipped: { personId: string; reason: string }[] = [];

    for (const pid of personIds) {
      if (!validIds.has(pid)) {
        skipped.push({ personId: pid, reason: "Bu etkinliğin katılımcısı değil" });
        continue;
      }
      const person = await db.person.findUnique({
        where: { id: pid },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      if (!person) {
        skipped.push({ personId: pid, reason: "Kişi bulunamadı" });
        continue;
      }
      const { token, expiresAt } = await issuePortalToken({
        scope: "PARTICIPANT",
        editionId: eid,
        personId: pid,
        ttlMs,
        issuedBy: "ADMIN",
      });
      let mailed = false;
      if (body.sendMail && person.email) {
        // mail modülü üzerinden tetikleme (§5.1) — kota/bastırma denetimli motor
        const result = await dispatchMail({
          recipients: [person.email.toLowerCase()],
          subject: body.subject?.trim() || `${edition?.name ?? "Etkinlik"} — Katılımcı Portalı Erişim Anahtarınız`,
          text:
            (body.message?.trim() ||
              `Merhaba ${person.firstName},\n\nKatılımcı Portalı'na kişisel erişim anahtarınız aşağıdadır. Bu anahtar yalnız size aittir.\n\nErişim anahtarı: ${token}\n\nPortala girişte "Erişim anahtarım var" seçeneğiyle kullanabilirsiniz.`) +
            `\n\nErişim anahtarı: ${token}`,
        });
        mailed = result.ok;
      }
      items.push({
        personId: person.id,
        name: `${person.firstName} ${person.lastName}`,
        email: person.email,
        token,
        expiresAt,
        mailed,
      });
    }

    return NextResponse.json({ items, skipped }, { status: 201 });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/magic-links POST:", e);
    return NextResponse.json({ error: "Erişim anahtarları üretilemedi" }, { status: 400 });
  }
}
