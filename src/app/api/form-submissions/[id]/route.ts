// Form gönderisi detay + inceleme aksiyonları (onay / ret / spam / geri al)
// Onay: REGISTRATION türünde kayıt zinciri kurulur (Person→Participation→Registration→Order/Payment)
// Spam/Ret: bağlı kayıt iptal edilir (veri tutarlılığı)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createRegistrationFromSubmission, cancelRegistrationOfSubmission, ChainCapacityError, type ChainResult } from "@/lib/api/registration-chain";
import { ensureInScope } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { ActivityType } from "@/lib/api/activity";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  const { id } = await params;
  // G0-a: gönderi yanıtları kişisel veri taşır — kapsam dışı 404
  const scoped = await ensureInScope("form-submissions", id);
  if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
  const submission = await db.formSubmission.findUnique({
    where: { id },
    include: {
      form: { include: { fields: { orderBy: { order: "asc" } } } },
      answers: { include: { field: true } },
      registration: { include: { category: true, participation: { include: { person: true } } } },
    },
  });
  if (!submission) return NextResponse.json({ error: "Gönderi bulunamadı" }, { status: 404 });
  return NextResponse.json(submission);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const { id } = await params;
    const { action, notes } = (await req.json()) as { action?: string; notes?: string };
    // G0-a: aksiyon zinciri (onay → kayıt zinciri) kiracı kapsamı dışına taşamaz
    const scoped = await ensureInScope("form-submissions", id);
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    const submission = await db.formSubmission.findUnique({
      where: { id },
      include: { form: true },
    });
    if (!submission) return NextResponse.json({ error: "Gönderi bulunamadı" }, { status: 404 });

    switch (action) {
      case "approve": {
        // 1) Gönderiyi onayla
        const updated = await db.formSubmission.update({
          where: { id },
          data: { status: "APPROVED", notes: notes ?? submission.notes },
        });
        // 2) Kayıt formuysa zinciri kur / iptal edilen kaydı geri aç
        let chain: ChainResult | null = null;
        if (submission.form.type === "REGISTRATION") {
          chain = await createRegistrationFromSubmission(id);
          if (chain.existing && submission.registrationId) {
            const reg = await db.registration.findUnique({ where: { id: submission.registrationId } });
            if (reg?.status === "CANCELLED") {
              await db.registration.update({
                where: { id: reg.id },
                data: { status: "SUBMITTED", cancelReason: null },
              });
            }
          }
        }
        await db.activityLog.create({
          data: {
            editionId: submission.editionId,
            type: ActivityType.SUBMISSION_SAVED,
            message: `Form gönderisi onaylandı: ${submission.respondentName} → ${submission.form.name}`,
            entityType: "FormSubmission",
            entityId: id,
            actorName: "Form Merkezi",
          },
        });
        return NextResponse.json({ ...updated, chain });
      }
      case "reject": {
        const updated = await db.formSubmission.update({
          where: { id },
          data: { status: "REJECTED", notes: notes ?? submission.notes },
        });
        await cancelRegistrationOfSubmission(id, "Form gönderisi reddedildi");
        return NextResponse.json(updated);
      }
      case "spam": {
        const updated = await db.formSubmission.update({
          where: { id },
          data: {
            status: "SPAM",
            spamScore: Math.max(submission.spamScore, 100),
            spamReasons: JSON.stringify(
              JSON.parse(submission.spamReasons ?? "[]").concat(["Manuel spam işaretlemesi"])
            ),
          },
        });
        await cancelRegistrationOfSubmission(id, "Form gönderisi spam olarak işaretlendi");
        return NextResponse.json(updated);
      }
      case "pending": {
        const updated = await db.formSubmission.update({
          where: { id },
          data: { status: "PENDING" },
        });
        return NextResponse.json(updated);
      }
      default:
        return NextResponse.json({ error: "Geçersiz aksiyon (approve|reject|spam|pending)" }, { status: 400 });
    }
  } catch (e) {
    // P3: kategori kapasitesi dolu → beklenen iş durumu 409 (gönderi admin incelemesinde kalır;
    // bekleme listesi teklifi iptal/geri-bırakma yolunda otomatiktir)
    if (e instanceof ChainCapacityError) {
      return NextResponse.json({ error: e.message, code: "CAPACITY_FULL", categoryId: e.categoryId }, { status: 409 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "İşlem başarısız" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  const { id } = await params;
  const scoped = await ensureInScope("form-submissions", id);
  if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
  await db.formSubmission.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
