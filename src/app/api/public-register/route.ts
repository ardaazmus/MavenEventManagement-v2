// Herkese açık kayıt endpoint'i — Form Merkezi'nde tasarlanan kayıt formu buradan akar.
// Spam koruması: honeypot + zaman tuzağı + hız limiti + engelli domain (bkz. src/lib/spam-guard.ts)
// Başarılı gönderim → FormSubmission + (REGISTRATION ise) kayıt zinciri: Person → Participation → Registration → Order/Payment
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { evaluateSpam, registerSubmissionHits } from "@/lib/spam-guard";
import { createRegistrationFromSubmission } from "@/lib/api/registration-chain";
import { ActivityType } from "@/lib/api/activity";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
  // S3: herkese açık kayıt brute-force kapısı — 10 gönderim/10 dk/IP (spam-guard ek katman)
  const denied = enforceRateLimit(req, { key: "public-register", limit: 10, windowMs: 600_000 });
  if (denied) return denied;

    const body = (await req.json()) as {
      formId?: string;
      respondentName?: string;
      respondentEmail?: string;
      phone?: string;
      organization?: string;
      answers?: Record<string, string>;
      honeypotValue?: string;
      elapsedSeconds?: number;
      paymentMethod?: string;
      source?: string;
    };

    const { formId, respondentName, respondentEmail } = body;
    if (!formId || !respondentEmail) {
      return NextResponse.json({ error: "formId ve respondentEmail zorunludur" }, { status: 400 });
    }

    const form = await db.formDefinition.findUnique({
      where: { id: formId },
      include: { fields: { orderBy: { order: "asc" } } },
    });
    if (!form) return NextResponse.json({ error: "Form bulunamadı" }, { status: 404 });
    if (form.status !== "PUBLISHED" || !form.isPublic) {
      return NextResponse.json({ error: "Bu form şu anda yayında değil" }, { status: 409 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
    const email = respondentEmail.trim().toLowerCase();
    const answers = body.answers ?? {};

    // Zorunlu alan kontrolü (ALWAYS required)
    const missing = form.fields.filter(
      (f) => f.required === "ALWAYS" && f.type !== "SECTION" && !String(answers[f.id] ?? "").trim()
    );
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Zorunlu alanlar eksik: ${missing.map((f) => f.label).join(", ")}` },
        { status: 422 }
      );
    }

    // Spam değerlendirmesi
    const existingApproved = await db.formSubmission.count({
      where: { formId: form.id, respondentEmail: email, status: "APPROVED" },
    });
    const verdict = evaluateSpam({
      honeypotValue: body.honeypotValue,
      elapsedSeconds: body.elapsedSeconds,
      email,
      ip,
      minSubmitSeconds: form.minSubmitSeconds,
      maxPerEmailPerDay: form.maxPerEmailPerDay,
      blockedDomains: form.blockedDomains,
      existingApprovedCount: existingApproved,
    });
    registerSubmissionHits(email, ip);

    const status = verdict.isSpam ? "SPAM" : form.autoApprove ? "APPROVED" : "PENDING";

    // QA_QUIZ scoring — mobil QA motoru: doğru cevabı işaretlenmiş quiz alanları puanlanır
    const quizFields = form.fields.filter((f) => f.type === "QA_QUIZ" && f.correctAnswer);
    let quizScore: number | null = null;
    let quizCorrect: number | null = null;
    let quizTotal: number | null = null;
    if (quizFields.length > 0) {
      quizTotal = quizFields.length;
      quizCorrect = quizFields.filter((f) => String(answers[f.id] ?? "").trim() === f.correctAnswer).length;
      quizScore = Math.round((quizCorrect / quizTotal) * 100);
    }

    const submission = await db.formSubmission.create({
      data: {
        formId: form.id,
        editionId: form.editionId,
        respondentName: respondentName?.trim() || email,
        respondentEmail: email,
        phone: body.phone ?? null,
        organization: body.organization ?? null,
        status,
        spamScore: verdict.score,
        spamReasons: verdict.reasons.length ? JSON.stringify(verdict.reasons) : null,
        honeypotValue: body.honeypotValue || null,
        elapsedSeconds: body.elapsedSeconds ?? null,
        submitIp: ip,
        source: body.source ?? "WEB_PUBLIC",
        quizScore,
        quizCorrect,
        quizTotal,
      },
    });

    // Yanıtları sakla
    const answerRows = Object.entries(answers)
      .filter(([fieldId]) => form.fields.some((f) => f.id === fieldId))
      .map(([fieldId, value]) => ({
        formId: form.id,
        fieldId,
        submissionId: submission.id,
        answer: typeof value === "string" ? value : JSON.stringify(value),
      }));
    if (answerRows.length > 0) {
      await db.formAnswer.createMany({ data: answerRows });
    }

    // SPAM değilse ve kayıt formuysa → kayıt zinciri (Kişi≠Katılım≠Kayıt≠Sipariş≠Ödeme)
    let chain: Awaited<ReturnType<typeof createRegistrationFromSubmission>> | null = null;
    let chainError: string | null = null;
    if (!verdict.isSpam && form.type === "REGISTRATION") {
      try {
        chain = await createRegistrationFromSubmission(submission.id, {
          paymentSource: body.paymentMethod ?? "PAYMENT_LINK",
        });
      } catch (e) {
        chainError = e instanceof Error ? e.message : "Kayıt zinciri kurulamadı";
      }
    }

    if (!verdict.isSpam) {
      await db.activityLog.create({
        data: {
          tenantId: (await db.eventEdition.findUnique({ where: { id: form.editionId } }))?.tenantId ?? "",
          editionId: form.editionId,
          type: ActivityType.SUBMISSION_SAVED,
          message: `Yeni form gönderisi: ${submission.respondentName} → ${form.name}${form.type === "REGISTRATION" ? " (kayıt zinciri kuruldu)" : ""}`,
          entityType: "FormSubmission",
          entityId: submission.id,
          actorName: "Form Merkezi",
        },
      });
    }

    return NextResponse.json({
      submissionId: submission.id,
      status: submission.status,
      spamScore: submission.spamScore,
      spamReasons: verdict.reasons,
      quizScore: submission.quizScore,
      quizCorrect: submission.quizCorrect,
      quizTotal: submission.quizTotal,
      chainError,
      registration: chain?.registration ?? null,
      order: chain?.order ?? null,
      payment: chain?.payment ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gönderim başarısız" },
      { status: 500 }
    );
  }
}
