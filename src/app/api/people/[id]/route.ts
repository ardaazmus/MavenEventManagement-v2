// /api/people/[id] — Person 360 (§54): tüm modüllerin gerçeklerini birleştirir
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
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
