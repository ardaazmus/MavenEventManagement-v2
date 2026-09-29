// Herkese açık kayıt endpoint'i — Form Merkezi'nde tasarlanan kayıt formu buradan akar.
// Spam koruması: honeypot + zaman tuzağı + hız limiti + engelli/ıskarta domain + URL doldurma +
// mükerrer içerik + HMAC doğrulama challenge'ı (bkz. src/lib/spam-guard.ts, form-challenge.ts)
// Başarılı gönderim → FormSubmission + (REGISTRATION ise) kayıt zinciri: Person → Participation → Registration → Order/Payment
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { evaluateSpam, registerSubmissionHits } from "@/lib/spam-guard";
import { verifyChallenge } from "@/lib/form-challenge";
import { filterVisibleAnswers, isFieldVisible, computeVisitedSteps } from "@/lib/form-logic";
import { createRegistrationFromSubmission, ChainCapacityError } from "@/lib/api/registration-chain";
import { ActivityType } from "@/lib/api/activity";
import { enforceRateLimit, enforceRateLimitById, clientIp } from "@/lib/rate-limit";
import { dispatchMail, EMAIL_RE } from "@/lib/mail-dispatch";

export async function POST(req: NextRequest) {
  try {
  // S3: herkese açık kayıt brute-force kapısı — 10 gönderim/10 dk/IP (spam-guard ek katman)
  const denied = enforceRateLimit(req, { key: "public-register", limit: 10, windowMs: 600_000 });
  if (denied) return denied;
  // TASK-A F10: ÇİFT KOVA — e-posta başına AYRI kova (aynı kutudan IP değiştirerek yığılmayı engeller)
  // (gövde okunduktan sonra — aşağıda email trim/lowercase ile deny edilir)

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
      // F-EXP: HMAC doğrulama challenge'ı (captchaEnabled formlar için zorunlu)
      challengeToken?: string;
      challengeAnswer?: string;
      // TASK-B 14: ASGARİ RIZA — gerekli-bilgilendirme onayı (gönderim = onay kaydı) +
      // fonksiyonel seçimli iletişim onayı (zorunlu DEĞİL). Üçüncü taraf script yoktur.
      commsOptIn?: boolean;
    };

    const { formId, respondentName, respondentEmail } = body;
    if (!formId || !respondentEmail) {
      return NextResponse.json({ error: "formId ve respondentEmail zorunludur" }, { status: 400 });
    }

    // F-EXP: id VEYA slug ile çöz — paylaşım bağlantıları kısa slug taşır (?form=kayit-2026)
    const form = await db.formDefinition.findFirst({
      where: { OR: [{ id: formId }, { slug: formId }] },
      include: { fields: { orderBy: { order: "asc" } } },
    });
    if (!form) return NextResponse.json({ error: "Form bulunamadı" }, { status: 404 });
    if (form.status !== "PUBLISHED" || !form.isPublic) {
      return NextResponse.json({ error: "Bu form şu anda yayında değil" }, { status: 409 });
    }

    // DÜZELTME (trusted-proxy): submitIp/spam-guard kimliği AYNI güven modelinden geçer —
    // en-sağ XFF değeri (rate-limit ile birebir aynı kural); sahte ilk değer kimlik olamaz
    const ip = clientIp(req);
    const email = respondentEmail.trim().toLowerCase();
    // TASK-A F10: kimlik kova — 6 gönderim/10 dk/e-posta (IP kovasından BAĞIMSIZ)
    const deniedEmail = enforceRateLimitById(req, { key: "public-register", limit: 6, windowMs: 600_000, scopeId: email });
    if (deniedEmail) return deniedEmail;
    const answers = body.answers ?? {};

    // F-EXP: GERÇEK CAPTCHA — captchaEnabled formda HMAC challenge zorunlu.
    // Başarısızlık 400 (gönderi OLUŞTURULMAZ) — bot trafiği veritabanına hiç ulaşmaz.
    if (form.captchaEnabled && !verifyChallenge(body.challengeToken, body.challengeAnswer)) {
      return NextResponse.json({ error: "İnsan doğrulaması başarısız — lütfen soruyu tekrar yanıtlayın" }, { status: 400 });
    }

    // F-EXP: MANTIK KAPILARI (sunucu tarafı) — gizlenen alanların cevapları TEMİZLENİR;
    // botların gizli alana değer enjekte etmesi anlamsızlaşır.
    const visibleAnswers = filterVisibleAnswers(form.fields, answers);

    // Zorunlu alan kontrolü (ALWAYS required, yalnız MANTIK KAPISINDAN GÖRÜNÜR alanlar —
    // koşulla gizlenen zorunlu alan hata üretmez; görünür koşullu zorunlu alan üretilir)
    // FORM-EXP3: adım dallanması — ziyaret-edilecek adımlar CEVAPLARDAN türetilir
    // (computeVisitedSteps; istemciden gelen yol verisi yok). Dallanıp atlanan adımın
    // zorunlu alanları istenmez; dallanma yoksa yol [1..maxStep] — davranış korunur.
    const labelIndex = new Map(form.fields.map((f) => [f.label, f.id]));
    const maxStepF = Math.max(1, ...form.fields.map((f) => (form.enableSteps ? f.step ?? 1 : 1)));
    const visitedSteps = new Set(form.enableSteps ? computeVisitedSteps(form.fields, answers, maxStepF) : [1]);
    const missing = form.fields.filter(
      (f) =>
        f.required === "ALWAYS" && f.type !== "SECTION" &&
        visitedSteps.has(form.enableSteps ? f.step ?? 1 : 1) &&
        isFieldVisible(f, answers, labelIndex) &&
        !String(answers[f.id] ?? "").trim()
    );
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Zorunlu alanlar eksik: ${missing.map((f) => f.label).join(", ")}` },
        { status: 422 }
      );
    }

    // Spam değerlendirmesi (F-EXP: form-kapsamlı IP sayacı + URL doldurma + içerik karması)
    const existingApproved = await db.formSubmission.count({
      where: { formId: form.id, respondentEmail: email, status: "APPROVED" },
    });
    const answerText = Object.entries(visibleAnswers)
      .filter(([fid]) => fid !== "")
      .map(([, v]) => String(v))
      .join("\n");
    const verdict = evaluateSpam({
      honeypotValue: body.honeypotValue,
      elapsedSeconds: body.elapsedSeconds,
      email,
      ip,
      minSubmitSeconds: form.minSubmitSeconds,
      maxPerEmailPerDay: form.maxPerEmailPerDay,
      blockedDomains: form.blockedDomains,
      existingApprovedCount: existingApproved,
      formId: form.id,
      answerText,
    });
    registerSubmissionHits(email, ip, form.id, answerText);

    const status = verdict.isSpam ? "SPAM" : form.autoApprove ? "APPROVED" : "PENDING";

    // QA_QUIZ scoring — mobil QA motoru: doğru cevabı işaretlenmiş quiz alanları puanlanır.
    // F-EXP: points alanı ile AĞIRLIKLI puanlama (points yoksa 1) — kolay soru 1, zor soru 5.
    const quizFields = form.fields.filter((f) => f.type === "QA_QUIZ" && f.correctAnswer);
    let quizScore: number | null = null;
    let quizCorrect: number | null = null;
    let quizTotal: number | null = null;
    if (quizFields.length > 0) {
      quizTotal = quizFields.length;
      const totalWeight = quizFields.reduce((s, f) => s + Math.max(1, f.points ?? 1), 0);
      const earnedWeight = quizFields
        .filter((f) => String(visibleAnswers[f.id] ?? "").trim() === f.correctAnswer)
        .reduce((s, f) => s + Math.max(1, f.points ?? 1), 0);
      quizCorrect = quizFields.filter((f) => String(visibleAnswers[f.id] ?? "").trim() === f.correctAnswer).length;
      quizScore = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
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

    // Yanıtları sakla — F-EXP: yalnız MANTIK KAPILARINDAN GEÇEN cevaplar yazılır
    const answerRows = Object.entries(visibleAnswers)
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
    // DÜZELTME (atomicity): zincir kendi transaction'ında kurulur; başarısızlık buraya
    // chainError alanıyla 2xx olarak TAŞINMAZ — çağırana açık başarısızlık döner.
    let chain: Awaited<ReturnType<typeof createRegistrationFromSubmission>> | null = null;
    let chainFailed = false;
    let capacityFull = false;
    if (!verdict.isSpam && form.type === "REGISTRATION") {
      try {
        chain = await createRegistrationFromSubmission(submission.id, {
          paymentSource: body.paymentMethod ?? "PAYMENT_LINK",
        });
        // TASK-B 14: kişi düzeyinde asgari rıza kaydı — sürüm + zaman + fonksiyonel opt-in
        const personId = (chain?.person as { id?: string } | null)?.id;
        if (personId) {
          await db.person.update({
            where: { id: personId },
            data: {
              consentVersion: "2026-01-KVKK-PUBLIC",
              consentAcceptedAt: new Date(),
              commsOptIn: body.commsOptIn === true ? true : null, // seçimli — varsayılan yok
            },
          });
        }
      } catch (e) {
        chainFailed = true;
        // QA: kapasite doluluğu beklenen iş durumudur — 500 değil 409 (gönderi kayda
        // geçti; ekip bekleme listesine alabilir). Diğer zincir hataları 500'de kalır.
        if (e instanceof ChainCapacityError) capacityFull = true;
        console.error("POST /api/public-register [chain]", submission.id, e instanceof Error ? e.message : e); // PII yok
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

      // FORM-EXP2: gönderim bildirimi — form ayarlarında notifyEmail varsa paylaşımlı
      // mail motoruyla ATEŞLE-UNUT bildirim (kota/bastırma/soğuma denetimli). Bildirim
      // hatası gönderi akışını ASLA etkilemez — yalnız sunucu günlüğüne düşer (PII yok).
      const notifyTo = form.notifyEmail?.trim().toLowerCase() ?? "";
      if (notifyTo && EMAIL_RE.test(notifyTo)) {
        void dispatchMail({
          recipients: [notifyTo],
          subject: `Yeni form gönderisi: ${form.name}`,
          text: [
            `Form: ${form.name}`,
            `Gönderen: ${submission.respondentName} <${submission.respondentEmail}>`,
            `Durum: ${status}`,
            `Gönderi no: ${submission.id}`,
            ...(quizScore != null ? [`Quiz puanı: ${quizScore} (${quizCorrect}/${quizTotal})`] : []),
            ...(chain?.registration as { confirmationNo?: string } | undefined)?.confirmationNo
              ? [`Teyit no: ${(chain!.registration as { confirmationNo?: string }).confirmationNo}`] : [],
          ].join("\n"),
        }).then((r) => {
          if (!r.ok) console.warn("POST /api/public-register [notify]", r.error ?? "bilinmiyor"); // PII yok
        }).catch(() => undefined);
      }

      // FORM-EXP3: yanıtlayana onay e-postası — form ayarında confirmEmail açıksa
      // gönderenin KENDİ adresine paylaşımlı motorla ateşle-unut onay (aynı kota/
      // bastırma/soğuma denetimleri; hata gönderi akışını asla etkilemez, PII'siz log).
      if (form.confirmEmail && EMAIL_RE.test(email)) {
        const confNo = (chain?.registration as { confirmationNo?: string } | undefined)?.confirmationNo;
        void dispatchMail({
          recipients: [email],
          subject: `Gönderiminiz alındı: ${form.name}`,
          text: [
            `Merhaba ${submission.respondentName},`,
            `"${form.name}" formundaki gönderiminiz başarıyla alındı.`,
            `Gönderi no: ${submission.id}`,
            `Durum: ${status === "APPROVED" ? "Onaylandı" : "İncelemede"}`,
            ...(confNo ? [`Teyit no: ${confNo}`] : []),
            ...(quizScore != null ? [`Quiz puanınız: ${quizScore} (${quizCorrect}/${quizTotal})`] : []),
            "",
            "Teşekkür ederiz.",
          ].join("\n"),
        }).then((r) => {
          if (!r.ok) console.warn("POST /api/public-register [confirm]", r.error ?? "bilinmiyor"); // PII yok
        }).catch(() => undefined);
      }
    }

    // DÜZELTME (public DTO): izin-listeli sabit yanıt sözleşmesi — ham Person/Participation/
    // Registration/Order/Payment nesneleri, ödeme yöntemi/belirteci, iç denetim verisi,
    // özel notlar, adres/telefon/e-posta ASLA dönülmez. Zincir hatası 2xx+chainError
    // olarak MASKEDENMEZ — açık başarısızlık (500) döner.
    if (chainFailed) {
      // QA: kapasite 409 — başvuru kayıtta, kontenjan açılırsa ekip tamamlar.
      if (capacityFull) {
        return NextResponse.json(
          { error: "Başvurunuz alındı ancak kontenjan dolu — ekibimiz bekleme listesi için sizinle iletişime geçecektir", code: "CAPACITY_FULL", submissionId: submission.id },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Başvurunuz alındı ancak kayıt işlemi tamamlanamadı — ekibimiz başvurunuzu inceleyip tamamlayacaktır" },
        { status: 500 }
      );
    }

    const reg = chain?.registration as { confirmationNo?: string; status?: string } | null | undefined;
    const ord = chain?.order as { orderNo?: string; status?: string; totalAmount?: number; currency?: string } | null | undefined;
    const pay = chain?.payment as { id?: string; status?: string } | null | undefined;
    return NextResponse.json({
      submissionId: submission.id,
      status: submission.status, // PENDING | APPROVED | SPAM
      quizScore: submission.quizScore,
      quizCorrect: submission.quizCorrect,
      quizTotal: submission.quizTotal,
      registration: reg ? { confirmationNo: reg.confirmationNo ?? null, status: reg.status ?? null } : null,
      order: ord ? { orderNo: ord.orderNo ?? null, status: ord.status ?? null, totalAmount: ord.totalAmount ?? null, currency: ord.currency ?? null } : null,
      payment: pay ? { id: pay.id, status: pay.status } : null,
    });
  } catch (e) {
    // DÜZELTME: iç hata mesajı çağırana sızmaz (sunucu logu yeterli; PII/sır yok)
    console.error("POST /api/public-register", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Gönderim işlenemedi — lütfen daha sonra tekrar deneyin" },
      { status: 500 }
    );
  }
}
