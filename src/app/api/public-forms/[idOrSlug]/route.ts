// F-EXP — Herkese açık form verisi (dış sayfa / platform paylaşımı veri kaynağı).
// GET /api/public-forms/<id-VEYA-slug>
// Yalnız PUBLISHED + isPublic formlar 200. İzin-listeli DTO:
//  - correctAnswer / sensitivity detayları / spam iç ölçümleri ASLA dönülmez
//  - TEAM_ONLY alanlar hariç (sadece ekip)
//  - captchaEnabled ise yanıtla birlikte tek-seferlik HMAC challenge verilir
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { issueChallenge } from "@/lib/form-challenge";

type Params = { params: Promise<{ idOrSlug: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { idOrSlug } = await params;
  if (!idOrSlug || idOrSlug.length > 200) {
    return NextResponse.json({ error: "Geçersiz form referansı" }, { status: 400 });
  }
  const form = await db.formDefinition.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  if (!form || form.status !== "PUBLISHED" || !form.isPublic) {
    // varlık keşfi sızmasın: yokluk ve kapalılık aynı yanıt
    return NextResponse.json({ error: "Form bulunamadı veya yayında değil" }, { status: 404 });
  }

  const fields = form.fields
    .filter((f) => f.sensitivity !== "TEAM_ONLY")
    .map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options,
      columns: f.columns,
      placeholder: f.placeholder,
      helpText: f.helpText,
      // mantık kapıları istemcide çalışır — kurallar (cevap anahtarı DEĞİL) açıktır
      logicRules: f.logicRules,
      logicMode: f.logicMode,
      logicAction: f.logicAction,
      gotoStep: f.gotoStep, // FORM-EXP3: adım dallanma hedefi (yalnız sunum verisi)
      conditionField: f.conditionField,
      conditionValue: f.conditionValue,
      points: f.points,
      mobileInteractive: f.mobileInteractive,
      width: f.width, // STUDIO-DND: dış sayfada birebir yerleşim (yalnız sunum verisi)
      step: f.step, // FORM-EXP2: çok-adımlı form — alanın adımı (yalnız sunum verisi)
    }));

  const challenge = form.captchaEnabled ? issueChallenge() : null;

  return NextResponse.json({
    id: form.id,
    slug: form.slug,
    name: form.name,
    type: form.type,
    description: form.description,
    successMessage: form.successMessage,
    captchaEnabled: form.captchaEnabled,
    honeypotEnabled: form.honeypotEnabled,
    hasPublicResults: form.hasPublicResults,
    enableOnlinePayment: form.enableOnlinePayment,
    enableSteps: form.enableSteps, // FORM-EXP2: adım-adım doldurma modu
    // minSubmitSeconds BİLİNÇLİ YOK — zaman tuzağı eşiği keşif sinyali değildir
    fields,
    challenge: challenge ? { question: challenge.question, token: challenge.token } : null,
  });
}
