// /api/people/[id] — Person 360 (§54): tüm modüllerin gerçeklerini birleştiren GET
// + PUT kişi güncellemesi (R10-a): dedicated route generic /api/[entity]/[id]
// yolunu gölgeler; PUT eksik olduğundan kişi düzenleme 405'e düşüyordu.
// G0-a: özel rota da generic desenle AYNI kapsam kontrolünden geçer — başka kiracının
// kişisine id ile erişim/güncelleme 404 (IDOR kapanır; kanıt: tam 360 + vcard sızdırıyordu).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sanitize } from "@/lib/api/registry";
import { ensureInScope } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { ActivityType } from "@/lib/api/activity";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const { id } = await ctx.params;
    const scoped = await ensureInScope("people", id);
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    const person = await db.person.findUnique({
      where: { id },
      include: {
        participations: {
          include: {
            edition: { select: { name: true, startDate: true } },
            registrations: { include: { category: true } },
            roleAssignments: true,
            programAssignments: { include: { session: { select: { title: true, startTime: true, status: true } } } },
            scanEvents: { orderBy: { scannedAt: "desc" }, take: 6 },
            certIssues: { include: { definition: { select: { name: true } } } },
            badgeInstances: { include: { profile: { select: { name: true } } } },
          },
        },
        submissions: { select: { id: true, code: true, title: true, status: true } },
        reviewAssignments: { include: { submission: { select: { code: true, title: true } } } },
      },
    });
    if (!person) return NextResponse.json({ error: "Kişi bulunamadı" }, { status: 404 });
    const { participations, submissions, reviewAssignments, ...personCore } = person;
    return NextResponse.json({ person: personCore, participations, submissions, reviewAssignments });
  } catch (e) {
    console.error("GET /api/people/[id]", e);
    return NextResponse.json({ error: "360 verisi alınamadı" }, { status: 500 });
  }
}

// R10-a: kişi güncelleme — generic registry PUT ile birebir aynı sözleşme
// (yalnız skaler alanlar; sanitize "" → null; MERGED koruması liste where'indedir).
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  const { id } = await ctx.params;
  try {
    const scoped = await ensureInScope("people", id);
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    const body = await req.json();
    const data = sanitize(body);
    const updated = await db.person.update({ where: { id }, data });
    await db.activityLog.create({
      data: {
        type: ActivityType.PERSON_SAVED,
        message: `Kişi güncellendi: ${updated.firstName} ${updated.lastName}`,
        entityType: "people",
        entityId: id,
        actorName: "Yönetici",
      },
    }).catch(() => undefined);
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PUT /api/people/[id]", e);
    return NextResponse.json({ error: "Güncelleme başarısız" }, { status: 400 });
  }
}
