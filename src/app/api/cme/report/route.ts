// /api/cme/report — Resmî CME Akreditasyon Raporu (§08 — CME_CREDITS yeteneği)
// GET ?editionId=&format=json|csv
//   json → antet (tenant+edisyon) + özet + kişi defteri (yalnız kredi > 0) + oturum dökümü
//   csv  → kişi defteri CSV (BOM'lu, Excel uyumlu; Content-Disposition ile indirilir)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";

const VALID_RESULTS = ["ALLOWED", "RESCAN_WARNING"];

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const editionId = sp.get("editionId");
    const format = sp.get("format") ?? "json";
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });

    // G0-b: resmî rapor kişi verisi taşır — edisyon bağlamına doğrulanır (yabancı → 404)
    try {
      await resolveEditionContext(editionId, { required: true });
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      select: {
        name: true, slug: true, editionLabel: true, startDate: true, endDate: true,
        venueName: true, city: true, country: true, status: true,
        tenant: { select: { name: true, country: true } },
      },
    });
    if (!edition) return NextResponse.json({ error: "Edisyon bulunamadı" }, { status: 404 });

    const sessions = await db.programSession.findMany({
      where: { editionId },
      orderBy: { startTime: "asc" },
      select: { id: true, title: true, type: true, startTime: true, endTime: true, cmeCredits: true },
    });

    const scans = await db.scanEvent.findMany({
      where: { session: { editionId }, sessionId: { not: null }, personId: { not: null }, action: { in: ["SESSION_ENTRY", "RESCAN"] }, result: { in: VALID_RESULTS } },
      select: { personId: true, sessionId: true, scannedAt: true },
      orderBy: { scannedAt: "asc" },
    });

    // personId → sessionId → ilk tarama ; sessionId → kişi seti
    const attendanceByPerson = new Map<string, Map<string, Date>>();
    const attendanceBySession = new Map<string, Set<string>>();
    for (const s of scans) {
      if (!s.personId || !s.sessionId) continue;
      if (!attendanceByPerson.has(s.personId)) attendanceByPerson.set(s.personId, new Map());
      const m = attendanceByPerson.get(s.personId)!;
      if (!m.has(s.sessionId)) m.set(s.sessionId, s.scannedAt);
      if (!attendanceBySession.has(s.sessionId)) attendanceBySession.set(s.sessionId, new Set());
      attendanceBySession.get(s.sessionId)!.add(s.personId);
    }

    const participations = await db.eventParticipation.findMany({
      where: { editionId },
      include: {
        person: { select: { firstName: true, lastName: true, company: true, title: true } },
        roleAssignments: { select: { role: true } },
        registrations: { select: { confirmationNo: true, status: true } },
      },
    });

    const creditsBySessionId = new Map(sessions.map((s) => [s.id, s.cmeCredits ?? 0]));
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const maxPossible = sessions.reduce((sum, s) => sum + (s.cmeCredits ?? 0), 0);

    // kişi defteri — yalnız kredi kazananlar (resmî rapor esas alır)
    const ledger = participations
      .map((p) => {
        const attended = attendanceByPerson.get(p.personId) ?? new Map<string, Date>();
        const attendedSessions: { title: string; type: string; credits: number }[] = [];
        let credits = 0;
        for (const [sessionId] of attended) {
          const c = creditsBySessionId.get(sessionId) ?? 0;
          credits += c;
          const ses = sessionById.get(sessionId);
          if (ses) attendedSessions.push({ title: ses.title, type: ses.type, credits: c });
        }
        const roles = [...new Set(p.roleAssignments.map((r) => r.role))];
        return {
          fullName: `${p.person.firstName} ${p.person.lastName}`,
          company: p.person.company,
          title: p.person.title,
          confirmationNo: p.registrations[0]?.confirmationNo ?? null,
          roles,
          attendedCount: attended.size,
          attendedSessions,
          credits: Math.round(credits * 100) / 100,
          percent: maxPossible > 0 ? Math.round((credits / maxPossible) * 100) : 0,
        };
      })
      .filter((l) => l.credits > 0)
      .sort((a, b) => b.credits - a.credits || a.fullName.localeCompare(b.fullName, "tr-TR"));

    const creditsIssued = ledger.reduce((s, l) => s + l.credits, 0);
    const withCredits = sessions.filter((s) => s.cmeCredits != null);

    const summary = {
      sessionsTotal: sessions.length,
      sessionsWithCredits: withCredits.length,
      creditsPotential: Math.round(maxPossible * 100) / 100,
      attendees: ledger.length,
      creditsIssued: Math.round(creditsIssued * 100) / 100,
      avgCredits: ledger.length > 0 ? Math.round((creditsIssued / ledger.length) * 100) / 100 : 0,
      maxEarned: ledger.length > 0 ? Math.max(...ledger.map((l) => l.credits)) : 0,
    };

    // ── CSV çıktı ──
    if (format === "csv") {
      const esc = (v: unknown) => {
        const s = String(v ?? "");
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ["Ad Soyad", "Kurum", "Unvan", "Teyit No", "Roller", "Katılınan Oturum", "Kredi", "Yüzde"];
      const rows = ledger.map((l) => [
        l.fullName, l.company ?? "", l.title ?? "", l.confirmationNo ?? "",
        l.roles.join(" + "), l.attendedCount, String(l.credits).replace(".", ","), `%${l.percent}`,
      ]);
      const csv = "\uFEFF" + [header, ...rows, [], ["TOPLAM", "", "", "", "", "", String(summary.creditsIssued).replace(".", ","), ""]]
        .map((r) => r.map(esc).join(";")).join("\r\n");
      const fileName = `cme-rapor-${edition.slug}-${new Date().toISOString().slice(0, 10)}.csv`;
      return new NextResponse(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${fileName}"`,
        },
      });
    }

    return NextResponse.json({
      edition: {
        name: edition.name,
        editionLabel: edition.editionLabel,
        startDate: edition.startDate,
        endDate: edition.endDate,
        venueName: edition.venueName,
        city: edition.city,
        country: edition.country,
        tenantName: edition.tenant.name,
      },
      generatedAt: new Date().toISOString(),
      summary,
      sessions: sessions.map((s) => ({
        title: s.title, type: s.type, startTime: s.startTime, endTime: s.endTime,
        cmeCredits: s.cmeCredits,
        attendanceCount: attendanceBySession.get(s.id)?.size ?? 0,
      })),
      ledger,
    });
  } catch (e) {
    console.error("GET /api/cme/report", e);
    return NextResponse.json({ error: "Rapor oluşturulamadı" }, { status: 500 });
  }
}
