// /api/scan — Onsite tarama motoru (§42, §07 Onsite kontrol)
// Kapsam kararı (G0-b): scan bilinçli olarak edition-bağlam denetiminin DIŞINDA tutulur —
// kapı/işlem taraması QR'la kapılanır (kapı görevlisi fiziksel yaka kartı kanıtını taşır);
// bağlam yerine credential→participation→edition zinciri zaten taramanın konusudur.
// TODO-auth (A4): cihaz oturumu geldiğinde operatör bağlamı burada eklenir.
// Kurallar:
// - İlk geçerli ENTRY → katılım CHECKED_IN; tekrar tarama RESCAN_WARNING, geçmiş silinmez
// - Geçersiz yaka kartı/iptal → DENIED + manuel istisna gerekçesi
// - Oturum girişi etkinlik girişinden ayrı sayılır
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ActivityType } from "@/lib/api/activity";
import { requireStaff, requestActor, STAFF_ROLES } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { maskScanPerson } from "@/lib/privacy/masking";

export async function POST(req: NextRequest) {
  try {
  // S3: kapı/cihaz taraması brute-force kapısı — 120 tarama/dk/IP (QR denemesi istismarı)
  const denied = enforceRateLimit(req, { key: "scan", limit: 120, windowMs: 60_000 });
  if (denied) return denied;

    const body = await req.json();
    const { code, door = "MAIN_DOOR", sessionId, action = "ENTRY", forceReason } = body as {
      code: string; door?: string; sessionId?: string; action?: string; forceReason?: string;
    };
    // P4 (yeni-fazlar 17): forceReason OPERATÖR yeteneğidir — engelleyiciyi aşan istisna
    // (check-in/CME/sertifika kanıtı üretir) kimliksiz çağırana verilmez. Cihaz sınırı:
    // MAVEN_AUTH=on → oturum + staff rolü ZORUNLU; off (demo) → admin UI güvenilir kabul edilir
    // (tek-kiracı demo tavanı belgeli). Kimliksiz cihaz yalnız normal okuma yapabilir.
    if (forceReason) {
      const gate = await requireStaff();
      if (gate) return gate;
    }

    if (!code) return NextResponse.json({ error: "Tarama kodu gerekli" }, { status: 400 });

    // P14.1: tam kimlik yalnız doğrulanmış kadroya; cihaz/anonim bağlam maskeli alır.
    const actor = await requestActor();
    const staffVerified = !!actor && STAFF_ROLES.has(actor.role);

    // credential code veya participation id ile çözümle
    const credential = await db.credential.findUnique({
      where: { code },
      include: {
        participation: { include: { person: true, registrations: { include: { category: true } }, badgeInstances: { include: { profile: true } } } },
      },
    });

    const participation =
      credential?.participation ??
      (code.startsWith("part_") ? await db.eventParticipation.findUnique({ where: { id: code.slice(5) }, include: { person: true, registrations: { include: { category: true } }, badgeInstances: { include: { profile: true } } } }) : null);

    if (!participation) {
      return NextResponse.json({ result: "DENIED", reason: "Böyle bir yaka kartı/kod bulunamadı. Sahada yeni kayıt yönlendirmesi yapın.", tone: "red" }, { status: 404 });
    }

    const person = participation.person;
    const maskedPerson = maskScanPerson(
      { id: person.id, firstName: person.firstName, lastName: person.lastName, company: person.company, title: person.title },
      { staffVerified },
    );
    // P4: geçerli kayıt deterministik — CONFIRMED öncelikli, yoksa en-yeni submittedAt
    const regs = [...(participation.registrations ?? [])].sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0));
    const reg = regs.find((r) => r.status === "CONFIRMED") ?? regs[0];
    const badge = participation.badgeInstances?.[0];

    // engel kontrolleri
    const blockers: string[] = [];
    if (credential && credential.status !== "ACTIVE") blockers.push(`Yaka Kartı Credential durumu: ${credential.status}`);
    if (badge?.status === "VOID") blockers.push("Yaka Kartı geçersiz kılınmış (VOID)");
    if (reg && ["CANCELLED", "REJECTED"].includes(reg.status)) blockers.push(`Kayıt durumu: ${reg.status}`);

    if (blockers.length > 0 && !forceReason) {
      const scan = await db.scanEvent.create({
        data: {
          editionId: participation.editionId, // TASK-A F6: denormalize — edisyon sayımları index ile
          participationId: participation.id,
          credentialId: credential?.id,
          personId: person.id,
          sessionId: sessionId ?? null,
          location: sessionId ? "SESSION" : "MAIN_DOOR",
          doorName: door,
          action,
          result: "DENIED",
          reason: blockers.join(" · "),
          operator: "Kapı Görevlisi",
          device: "web-desk",
        },
      });
      await db.activityLog.create({ data: { type: ActivityType.SCAN_DENIED, message: `Tarama reddedildi: ${person.firstName} ${person.lastName} (${blockers[0]})`, editionId: participation.editionId } });
      return NextResponse.json({
        result: "DENIED", scanId: scan.id, tone: "red",
        reason: blockers.join(" · "),
        person: maskedPerson,
        masked: !staffVerified,
        hint: "Manuel istisna için gerekçe girin.",
      });
    }

    // tekrar tarama kontrolü (aynı gün, aynı konumda önceki geçerli ENTRY)
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const isSessionScan = Boolean(sessionId);
    const previousValid = await db.scanEvent.findFirst({
      where: {
        participationId: participation.id,
        action,
        result: "ALLOWED",
        sessionId: sessionId ?? null,
        location: isSessionScan ? "SESSION" : door,
        scannedAt: { gte: dayStart },
      },
      orderBy: { scannedAt: "desc" },
    });

    const isRescan = Boolean(previousValid);
    const now = new Date();

    const scan = await db.scanEvent.create({
      data: {
        editionId: participation.editionId, // TASK-A F6: denormalize — edisyon sayımları index ile
        participationId: participation.id,
        credentialId: credential?.id,
        personId: person.id,
        sessionId: sessionId ?? null,
        location: isSessionScan ? "SESSION" : "MAIN_DOOR",
        doorName: door,
        action: isRescan ? "RESCAN" : action,
        result: isRescan ? "RESCAN_WARNING" : "ALLOWED",
        reason: forceReason ?? (isRescan ? "Bu rozet bugün daha önce okutuldu" : null),
        operator: "Kapı Görevlisi",
        device: "web-desk",
      },
    });

    // P2 hız-yolu: create + TEK update — attendance zaten bellekte; sadece değişim varsa yazılır
    // (eski akış her girişte koşulsuz update atıyordu). EXIT/ENTRY birbirini dışlar, tek ifade hesaplanır.
    let nextAttendance: string | null = null;
    if (!isSessionScan && !isRescan && action === "ENTRY") nextAttendance = "CHECKED_IN";
    else if (action === "EXIT" && !isSessionScan) nextAttendance = "CHECKED_OUT";
    const attendanceChanged = nextAttendance !== null && nextAttendance !== participation.attendance;
    if (nextAttendance !== null && attendanceChanged) {
      await db.eventParticipation.update({ where: { id: participation.id }, data: { attendance: nextAttendance } });
    }

    // P2: tarama-başına aktivite günlüğü → periyodik toplulaştırma — her tarama günlüğe düşmez;
    // durum değişimi (ilk giriş/çıkış) ve tekrar tarama anında yazılır, normal akışta 25'te bir özet yazılır.
    const editionScanCount = await db.scanEvent.count({ where: { participation: { editionId: participation.editionId } } });
    if (attendanceChanged || isRescan || editionScanCount % 25 === 0) {
      await db.activityLog.create({
        data: {
          type: isRescan ? ActivityType.SCAN_ALLOWED : attendanceChanged ? ActivityType.SCAN_ALLOWED : ActivityType.SCAN_SAVED,
          editionId: participation.editionId,
          message: isRescan
            ? `Tekrar tarama: ${person.firstName} ${person.lastName} (${isSessionScan ? "Oturum" : door})`
            : attendanceChanged
              ? `Giriş kaydedildi: ${person.firstName} ${person.lastName} (${isSessionScan ? "Oturum" : door})`
              : `Saha özeti: ${editionScanCount}. tarama — ${person.firstName} ${person.lastName} (${isSessionScan ? "Oturum" : door})`,
          entityType: "ScanEvent",
          entityId: scan.id,
          actorName: "Kapı Görevlisi",
        },
      });
    }

    return NextResponse.json({
      result: isRescan ? "RESCAN_WARNING" : "ALLOWED",
      scanId: scan.id,
      tone: isRescan ? "yellow" : "green",
      reason: isRescan ? `İlk geçerli giriş: ${previousValid?.scannedAt.toLocaleTimeString?.("tr-TR") ?? "—"} — tekrar tarama geçmişe eklenir` : null,
      person: maskedPerson,
      masked: !staffVerified,
      registration: reg ? { status: reg.status, category: reg.category?.name, funding: reg.fundingSource } : null,
      badge: badge ? { id: badge.id, badgeNo: badge.badgeNo, status: badge.status, profile: badge.profile?.name, reprintCount: badge.reprintCount ?? 0 } : null,
      attendance: !isSessionScan && !isRescan && action === "ENTRY" ? "CHECKED_IN" : undefined,
    });
  } catch (e) {
    console.error("POST /api/scan", e);
    return NextResponse.json({ error: "Tarama işlenemedi" }, { status: 500 });
  }
}
