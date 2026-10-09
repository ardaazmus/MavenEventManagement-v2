// GET /api/editions/[id]/setup-checklist — Kademeli Etkinlik Kurulum Rehberi (F-07)
// Edisyonun hazırlık adımlarını, eksiklerini ve sıradaki önerilen aksiyonu döner.
// Yetki: requireStaff() + resolveEditionContext(id).
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/request-context";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { computeEditionSetupChecklist } from "@/lib/events/setup-checklist";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireStaff();
  if (gate) return gate;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Edisyon kimliği zorunludur" }, { status: 400 });

    await resolveEditionContext(id, { required: true });

    const checklist = await computeEditionSetupChecklist(id);
    return NextResponse.json({ checklist });
  } catch (e) {
    if (e instanceof GuardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/editions/[id]/setup-checklist error:", e);
    return NextResponse.json({ error: "Kurulum rehberi hesaplanamadı" }, { status: 500 });
  }
}
