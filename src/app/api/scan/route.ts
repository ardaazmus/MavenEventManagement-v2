// /api/scan — Onsite tarama motoru (§42, §07 Onsite kontrol)
// Kurallar:
// - İlk geçerli ENTRY → katılım CHECKED_IN; tekrar tarama RESCAN_WARNING, geçmiş silinmez
// - Geçersiz yaka kartı/iptal → DENIED + manuel istisna gerekçesi
// - Oturum girişi etkinlik girişinden ayrı sayılır
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ActivityType } from "@/lib/api/activity";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, door = "MAIN_DOOR", sessionId, action = "ENTRY", forceReason } = body as {
      code: string; door?: string; sessionId?: string; action?: string; forceReason?: string;
    };

    if (!code) return NextResponse.json({ error: "Tarama kodu gerekli" }, { status: 400 });

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
    const reg = participation.registrations?.[0];
    const badge = participation.badgeInstances?.[0];

    // engel kontrolleri
    const blockers: string[] = [];
    if (credential && credential.status !== "ACTIVE") blockers.push(`Yaka Kartı Credential durumu: ${credential.status}`);
    if (badge?.status === "VOID") blockers.push("Yaka Kartı geçersiz kılınmış (VOID)");
    if (reg && ["CANCELLED", "REJECTED"].includes(reg.status)) blockers.push(`Kayıt durumu: ${reg.status}`);

    if (blockers.length > 0 && !forceReason) {
      const scan = await db.scanEvent.create({
        data: {
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
        person: { id: person.id, name: `${person.firstName} ${person.lastName}`, company: person.company },
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

    // ilk geçerli etkinlik girişi → attendance CHECKED_IN
    if (!isSessionScan && !isRescan && action === "ENTRY") {
      await db.eventParticipation.update({ where: { id: participation.id }, data: { attendance: "CHECKED_IN" } });
    }
    if (action === "EXIT" && !isSessionScan) {
      await db.eventParticipation.update({ where: { id: participation.id }, data: { attendance: "CHECKED_OUT" } });
    }

    await db.activityLog.create({
      data: {
        type: ActivityType.SCAN_ALLOWED,
        editionId: participation.editionId,
        message: isRescan
          ? `Tekrar tarama: ${person.firstName} ${person.lastName} (${isSessionScan ? "Oturum" : door})`
          : `Giriş kaydedildi: ${person.firstName} ${person.lastName} (${isSessionScan ? "Oturum" : door})`,
        entityType: "ScanEvent",
        entityId: scan.id,
        actorName: "Kapı Görevlisi",
      },
    });

    return NextResponse.json({
      result: isRescan ? "RESCAN_WARNING" : "ALLOWED",
      scanId: scan.id,
      tone: isRescan ? "yellow" : "green",
      reason: isRescan ? `İlk geçerli giriş: ${previousValid?.scannedAt.toLocaleTimeString?.("tr-TR") ?? "—"} — tekrar tarama geçmişe eklenir` : null,
      person: {
        id: person.id,
        name: `${person.firstName} ${person.lastName}`,
        company: person.company,
        title: person.title,
      },
      registration: reg ? { status: reg.status, category: reg.category?.name, funding: reg.fundingSource } : null,
      badge: badge ? { status: badge.status, profile: badge.profile?.name } : null,
      attendance: !isSessionScan && !isRescan && action === "ENTRY" ? "CHECKED_IN" : undefined,
    });
  } catch (e) {
    console.error("POST /api/scan", e);
    return NextResponse.json({ error: "Tarama işlenemedi" }, { status: 500 });
  }
}
