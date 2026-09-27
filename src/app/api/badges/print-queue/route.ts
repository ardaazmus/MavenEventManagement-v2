// Yaka kartı baskı kuyruğu (§40-42) — baskıya hazır rozetler + toplu baskı/teslim aksiyonları
// GET  /api/badges/print-queue?editionId=  → kuyruk + profil kırılımı + durum sayaçları
// POST /api/badges/print-queue { ids: string[], action: "PRINT"|"ISSUE"|"REPRINT" }
//   PRINT: READY → PRINTED (printedAt) · ISSUE: PRINTED → ISSUED (issuedAt) · REPRINT: basılı → REPRINTED
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { ActivityType } from "@/lib/api/activity";

const INCLUDE = {
  profile: true,
  participation: {
    include: {
      person: true,
      registrations: { include: { category: true } },
      roleAssignments: true,
    },
  },
};

export async function GET(req: NextRequest) {
  try {
    const editionId = new URL(req.url).searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });

    // G0-b: baskı kuyruğu kişisel veri taşır — edisyon bağlamına doğrulanır
    try {
      await verifyEditionTenant(editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const participations = await db.eventParticipation.findMany({
      where: { editionId },
      select: { id: true },
    });
    const pIds = participations.map((p) => p.id);

    const badges = await db.badgeInstance.findMany({
      where: { participationId: { in: pIds } },
      include: INCLUDE,
      orderBy: { badgeNo: "asc" },
    });

    const queue = badges.map((b) => {
      const person = b.participation.person;
      const reg = b.participation.registrations[0];
      return {
        id: b.id,
        badgeNo: b.badgeNo,
        status: b.status,
        issuedAt: b.issuedAt,
        printedAt: b.printedAt,
        profile: b.profile ? { name: b.profile.name, color: b.profile.color, accessAreas: b.profile.accessAreas } : null,
        person: {
          fullName: `${person.firstName} ${person.lastName}`,
          company: person.company,
          title: person.title,
        },
        category: reg?.category?.name ?? null,
        roles: b.participation.roleAssignments.map((r) => r.role).filter(Boolean),
        registrationStatus: reg?.status ?? null,
        reprintCount: b.reprintCount ?? 0,
        lastReprintReason: b.lastReprintReason ?? null,
      };
    });

    const byStatus = queue.reduce<Record<string, number>>((acc, b) => {
      acc[b.status] = (acc[b.status] ?? 0) + 1;
      return acc;
    }, {});
    const byProfile = Object.entries(
      queue.reduce<Record<string, number>>((acc, b) => {
        const key = b.profile?.name ?? "Profilsiz";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {})
    ).map(([name, count]) => ({ name, count }));

    return NextResponse.json({
      queue,
      stats: {
        ready: byStatus["READY"] ?? 0,
        printed: byStatus["PRINTED"] ?? 0,
        issued: byStatus["ISSUED"] ?? 0,
        reprinted: byStatus["REPRINTED"] ?? 0,
        notEligible: byStatus["NOT_ELIGIBLE"] ?? 0,
        void: byStatus["VOID"] ?? 0,
        total: queue.length,
      },
      byProfile,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Baskı kuyruğu alınamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { ids?: string[]; action?: string; reason?: string };
    const ids = (body.ids ?? []).filter(Boolean);
    const action = body.action ?? "PRINT";
    const reason = body.reason || null;
    if (ids.length === 0) return NextResponse.json({ error: "Yaka kartı seçilmedi" }, { status: 422 });
    if (!["PRINT", "ISSUE", "REPRINT"].includes(action)) {
      return NextResponse.json({ error: "Geçersiz aksiyon (PRINT|ISSUE|REPRINT)" }, { status: 400 });
    }

    const badges = await db.badgeInstance.findMany({
      where: { id: { in: ids } },
      include: { profile: true, participation: { include: { person: true, edition: true } } },
    });
    if (badges.length === 0) return NextResponse.json({ error: "Yaka kartı bulunamadı" }, { status: 404 });

    // G0-b: seçili kartların ebeveyn edisyonu bağlama doğrulanır — yabancı kiracının
    // kartına toplu baskı/teslim aksiyonu 404 (IDOR)
    const ctx = await resolveContext(null);
    if (badges.some((b) => b.participation?.edition?.tenantId !== ctx)) {
      return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    }

    const results: { id: string; ok: boolean; message?: string }[] = [];
    const now = new Date();

    for (const b of badges) {
      const allowed =
        (action === "PRINT" && b.status === "READY") ||
        (action === "ISSUE" && ["PRINTED", "REPRINTED"].includes(b.status)) ||
        (action === "REPRINT" && ["PRINTED", "ISSUED", "REPRINTED"].includes(b.status));
      if (!allowed) {
        results.push({ id: b.id, ok: false, message: `${b.status} durumundaki yaka kartı ${action} alamaz` });
        continue;
      }
      const data =
        action === "PRINT"
          ? { status: "PRINTED", printedAt: now }
          : action === "ISSUE"
            ? { status: "ISSUED", issuedAt: now }
            : { status: "REPRINTED", printedAt: now, reprintCount: { increment: 1 }, lastReprintReason: reason };
      await db.badgeInstance.update({ where: { id: b.id }, data });
      results.push({ id: b.id, ok: true });
    }

    const succeeded = results.filter((r) => r.ok).length;
    if (succeeded > 0) {
      const first = badges[0];
      await db.activityLog.create({
        data: {
          tenantId: first?.participation?.edition?.tenantId ?? "",
          editionId: first?.participation?.edition?.id ?? null,
          type: ActivityType.BADGE_SAVED,
          message: `Yaka kartı ${action.toLowerCase()} tamamlandı: ${succeeded} adet${action === "PRINT" ? " (baskı kuyruğundan)" : ""}`,
          entityType: "BadgeInstance",
          entityId: ids[0],
          actorName: "Baskı Merkezi",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      succeeded,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Baskı aksiyonu başarısız" }, { status: 500 });
  }
}
