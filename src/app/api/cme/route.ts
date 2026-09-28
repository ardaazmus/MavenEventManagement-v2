// CME Kredi Defteri (§08 — CME_CREDITS yeteneği) — sürecek eğitim kredi muhasebesi
// GET  /api/cme?editionId= → oturum kredi tablosu + kişi bazlı defter + özet + tür kırılımı
// POST /api/cme { action: "set-credits", sessionId, credits }  → tek oturuma kredi ata
//              { action: "bulk-apply", defaults: Record<sessionType, number> } → tür bazlı toplu ata
// Kredi kazanma kuralı: SESSION_ENTRY taraması geçerli (ALLOWED / RESCAN_WARNING) → oturumun cmeCredits'i kişiye yazılır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { ActivityType } from "@/lib/api/activity";

const VALID_RESULTS = ["ALLOWED", "RESCAN_WARNING"];

export async function GET(req: NextRequest) {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const editionId = new URL(req.url).searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });

    // G0-b: CME defteri kişi bazlı gerçek taşır — edisyon bağlamına doğrulanır
    try {
      await resolveEditionContext(editionId, { required: true });
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    // 1) Oturumlar — kredi editörü tablosu + katılım sayısı
    const sessions = await db.programSession.findMany({
      where: { editionId },
      orderBy: { startTime: "asc" },
      select: { id: true, title: true, type: true, startTime: true, cmeCredits: true, status: true },
    });

    // 2) Geçerli oturum taramaları (kişi × oturum tekil) — ScanEvent'te editionId yok, oturum üzerinden süzülür
    const scans = await db.scanEvent.findMany({
      where: { session: { editionId }, sessionId: { not: null }, personId: { not: null }, action: { in: ["SESSION_ENTRY", "RESCAN"] }, result: { in: VALID_RESULTS } },
      select: { personId: true, sessionId: true, scannedAt: true },
      orderBy: { scannedAt: "asc" },
    });
    const attendanceByPerson = new Map<string, Map<string, Date>>(); // personId (Person) → sessionId → ilk tarama
    const attendanceBySession = new Map<string, Set<string>>(); // sessionId → kişi seti
    const lastActivity = new Map<string, Date>(); // personId (Person) → son tarama
    for (const s of scans) {
      if (!s.personId || !s.sessionId) continue;
      if (!attendanceByPerson.has(s.personId)) attendanceByPerson.set(s.personId, new Map());
      const m = attendanceByPerson.get(s.personId)!;
      if (!m.has(s.sessionId)) m.set(s.sessionId, s.scannedAt);
      if (!attendanceBySession.has(s.sessionId)) attendanceBySession.set(s.sessionId, new Set());
      attendanceBySession.get(s.sessionId)!.add(s.personId);
      const prev = lastActivity.get(s.personId);
      if (!prev || s.scannedAt > prev) lastActivity.set(s.personId, s.scannedAt);
    }

    // 3) Kişi bazlı defter — katılımlar + roller
    const participations = await db.eventParticipation.findMany({
      where: { editionId },
      include: {
        person: { select: { id: true, firstName: true, lastName: true, company: true, title: true } },
        roleAssignments: { select: { role: true } },
        registrations: { select: { status: true } },
      },
    });

    const creditsBySessionId = new Map(sessions.map((s) => [s.id, s.cmeCredits ?? 0]));
    const maxPossible = sessions.reduce((sum, s) => sum + (s.cmeCredits ?? 0), 0);

    const ledger = participations.map((p) => {
      const attended = attendanceByPerson.get(p.personId) ?? new Map<string, Date>();
      let credits = 0;
      for (const [sessionId] of attended) credits += creditsBySessionId.get(sessionId) ?? 0;
      const eligibleCount = sessions.filter((s) => s.cmeCredits != null).length;
      const roles = [...new Set(p.roleAssignments.map((r) => r.role))];
      return {
        participationId: p.id,
        person: {
          fullName: `${p.person.firstName} ${p.person.lastName}`,
          company: p.person.company,
          title: p.person.title,
        },
        roles,
        registrationStatus: p.registrations[0]?.status ?? null,
        attendedCount: attended.size,
        eligibleCount,
        credits: Math.round(credits * 100) / 100,
        maxPossible: Math.round(maxPossible * 100) / 100,
        percent: maxPossible > 0 ? Math.round((credits / maxPossible) * 100) : 0,
        lastActivity: attended.size > 0 ? (lastActivity.get(p.personId) ?? null) : null,
      };
    });
    ledger.sort((a, b) => b.credits - a.credits || b.attendedCount - a.attendedCount || a.person.fullName.localeCompare(b.person.fullName, "tr-TR"));

    // 4) Özet + tür kırılımı
    const earners = ledger.filter((l) => l.attendedCount > 0);
    const creditsIssued = earners.reduce((s, l) => s + l.credits, 0);
    const byTypeMap = new Map<string, { type: string; sessions: number; withCredits: number; creditsSum: number; attendance: number }>();
    for (const s of sessions) {
      if (!byTypeMap.has(s.type)) byTypeMap.set(s.type, { type: s.type, sessions: 0, withCredits: 0, creditsSum: 0, attendance: 0 });
      const row = byTypeMap.get(s.type)!;
      row.sessions++;
      if (s.cmeCredits != null) { row.withCredits++; row.creditsSum += s.cmeCredits; }
      row.attendance += attendanceBySession.get(s.id)?.size ?? 0;
    }

    return NextResponse.json({
      editionId,
      sessions: sessions.map((s) => ({ ...s, attendanceCount: attendanceBySession.get(s.id)?.size ?? 0 })),
      ledger,
      summary: {
        sessionsTotal: sessions.length,
        sessionsWithCredits: sessions.filter((s) => s.cmeCredits != null).length,
        creditsPotential: Math.round(maxPossible * 100) / 100,
        attendees: earners.length,
        creditsIssued: Math.round(creditsIssued * 100) / 100,
        avgCredits: earners.length > 0 ? Math.round((creditsIssued / earners.length) * 100) / 100 : 0,
        maxEarned: earners.length > 0 ? Math.max(...earners.map((l) => l.credits)) : 0,
        coveragePercent: sessions.length > 0 ? Math.round((sessions.filter((s) => s.cmeCredits != null).length / sessions.length) * 100) : 0,
      },
      byType: [...byTypeMap.values()].sort((a, b) => b.sessions - a.sessions),
    });
  } catch (e) {
    console.error("GET /api/cme", e);
    return NextResponse.json({ error: "CME defteri okunamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const body = (await req.json()) as { action?: string; sessionId?: string; credits?: number | null; editionId?: string; defaults?: Record<string, number> };

    // ── Tek oturuma kredi ata ──
    if (body.action === "set-credits") {
      const { sessionId, credits } = body;
      if (!sessionId) return NextResponse.json({ error: "sessionId zorunlu" }, { status: 400 });
      if (credits == null || Number.isNaN(credits) || credits < 0 || credits > 99) {
        return NextResponse.json({ error: "Kredi 0–99 arasında olmalı" }, { status: 400 });
      }
      // G0-b: oturumun ebeveyn edisyonu bağlama doğrulanır (yabancı oturum 404)
      const target = await db.programSession.findUnique({ where: { id: sessionId }, select: { editionId: true } });
      if (!target) return NextResponse.json({ error: "Oturum bulunamadı" }, { status: 404 });
      try {
        await verifyEditionTenant(target.editionId);
      } catch (e) {
        if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
        throw e;
      }
      const session = await db.programSession.update({
        where: { id: sessionId },
        data: { cmeCredits: Math.round(credits * 100) / 100 },
      });
      await db.activityLog.create({
        data: {
          type: ActivityType.CME_SAVED,
          editionId: session.editionId,
          message: `CME kredi atandı: ${session.title} → ${session.cmeCredits} kredi`,
          entityType: "ProgramSession",
          entityId: session.id,
          actorName: "Akreditasyon Sorumlusu",
        },
      });
      return NextResponse.json(session);
    }

    // ── Tür bazlı toplu uygulama (yalnız kredisi olmayanlara) ──
    if (body.action === "bulk-apply") {
      const { defaults, editionId } = body;
      if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
      if (!defaults || typeof defaults !== "object") return NextResponse.json({ error: "defaults gerekli" }, { status: 400 });
      // G0-b: toplu güncelleme hedef edisyonu bağlama doğrulanır
      try {
        await verifyEditionTenant(editionId);
      } catch (e) {
        if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
        throw e;
      }
      let updated = 0;
      const applied: string[] = [];
      for (const [type, credits] of Object.entries(defaults)) {
        if (typeof credits !== "number" || credits < 0 || credits > 99) continue;
        const res = await db.programSession.updateMany({
          where: { editionId, type, cmeCredits: null },
          data: { cmeCredits: credits },
        });
        updated += res.count;
        if (res.count > 0) applied.push(`${type}: ${res.count} oturum × ${credits} kredi`);
      }
      if (updated > 0) {
        await db.activityLog.create({
          data: {
            type: ActivityType.CME_SAVED,
            editionId,
            message: `CME kredi şablonu uygulandı — ${updated} oturum: ${applied.join(" · ")}`,
            actorName: "Akreditasyon Sorumlusu",
          },
        });
      }
      return NextResponse.json({ ok: true, updated, applied });
    }

    return NextResponse.json({ error: `Bilinmeyen aksiyon: ${body.action}` }, { status: 400 });
  } catch (e) {
    console.error("POST /api/cme", e);
    const msg = e instanceof Error ? e.message : "CME işlemi başarısız";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
