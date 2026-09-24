// Form istatistikleri — anket/QA soruları için otomatik dağılım analizi
// GET /api/form-stats?formId=... → gönderi özeti + alan bazlı dağılım + NPS skoru + günlük akış
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";

type Params = Promise<{ formId?: string }>;

function parseMulti(answer: string | null | undefined): string[] {
  if (!answer) return [];
  try {
    const parsed = JSON.parse(answer);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* JSON değilse virgülle ayrılmış */
  }
  return answer.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  try {
    const { formId } = (await ParamsGrab(req)) as { formId?: string };
    if (!formId) return NextResponse.json({ error: "formId zorunlu" }, { status: 400 });

    // G0-b: form istatistikleri gönderi verisi taşır — formun edisyonu bağlama doğrulanır
    const ctx = await resolveContext(null);
    const formCtx = await db.formDefinition.findUnique({
      where: { id: formId },
      select: { editionId: true, edition: { select: { tenantId: true } } },
    });
    if (!formCtx) return NextResponse.json({ error: "Form bulunamadı" }, { status: 404 });
    if (formCtx.edition && formCtx.edition.tenantId !== ctx) {
      return NextResponse.json({ error: "Form bulunamadı" }, { status: 404 });
    }

    const form = await db.formDefinition.findUnique({
      where: { id: formId },
      include: {
        fields: { orderBy: { order: "asc" } },
        submissions: { include: { answers: true } },
      },
    });
    if (!form) return NextResponse.json({ error: "Form bulunamadı" }, { status: 404 });

  const submissions = form.submissions;
  const valid = submissions.filter((s) => s.status !== "SPAM");
  const byStatus = submissions.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
    return acc;
  }, {});

  // günlük akış — son 14 gün
  const days: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    days.push({
      date: d.toISOString().slice(0, 10),
      count: submissions.filter((s) => {
        const c = new Date(s.createdAt);
        return c >= d && c < next;
      }).length,
    });
  }

  // alan bazlı istatistik
  const fieldStats = form.fields
    .filter((f) => f.type !== "SECTION")
    .map((field) => {
      const answers = valid
        .map((s) => s.answers.find((a) => a.fieldId === field.id)?.answer ?? null)
        .filter((a): a is string => a != null && a !== "");

      const base = {
        fieldId: field.id,
        label: field.label,
        type: field.type,
        mobileInteractive: field.mobileInteractive,
        responseCount: answers.length,
        responseRate: valid.length > 0 ? Math.round((answers.length / valid.length) * 100) : 0,
      };

      if (["SINGLE_CHOICE", "MULTI_CHOICE", "CHECKBOX", "QA_QUIZ"].includes(field.type)) {
        const dist: Record<string, number> = {};
        for (const a of answers) {
          for (const v of field.type === "SINGLE_CHOICE" ? [a] : parseMulti(a)) {
            dist[v] = (dist[v] ?? 0) + 1;
          }
        }
        const options = (field.options ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
        const distribution = Object.entries(dist)
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count);
        return { ...base, distribution, optionCoverage: options.length };
      }

      if (["NUMBER", "RATING", "NPS"].includes(field.type)) {
        const nums = answers.map(Number).filter((n) => !Number.isNaN(n));
        if (nums.length === 0) return { ...base, distribution: [], numeric: null, nps: null };
        const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
        const numeric = {
          avg: Math.round(avg * 10) / 10,
          min: Math.min(...nums),
          max: Math.max(...nums),
        };
        let distribution: { value: string; count: number }[] = [];
        let nps: { score: number; promoters: number; passives: number; detractors: number } | null = null;
        if (field.type === "NPS") {
          const promoters = nums.filter((n) => n >= 9).length;
          const passives = nums.filter((n) => n >= 7 && n <= 8).length;
          const detractors = nums.filter((n) => n <= 6).length;
          nps = {
            score: Math.round(((promoters - detractors) / nums.length) * 100),
            promoters,
            passives,
            detractors,
          };
          distribution = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({
            value: String(v),
            count: nums.filter((n) => n === v).length,
          }));
        } else {
          const buckets = field.type === "RATING" ? [1, 2, 3, 4, 5] : [];
          distribution = buckets.map((v) => ({
            value: String(v),
            count: nums.filter((n) => n === v).length,
          }));
        }
        return { ...base, numeric, nps, distribution };
      }

      // metin alanları — en güncel 5 yanıt
      return { ...base, samples: answers.slice(-5).reverse() };
    });

  const elapsed = valid.map((s) => s.elapsedSeconds).filter((v): v is number => v != null);
  const spamCount = byStatus["SPAM"] ?? 0;

  // QA_QUIZ scoring özeti — mobil QA motoru sonuçları
  const quizFields = form.fields.filter((f) => f.type === "QA_QUIZ");
  const scored = valid.filter((s) => s.quizTotal != null && s.quizTotal > 0 && s.quizScore != null);
  const bucketsDef = [
    { label: "0-24", min: 0, max: 24 },
    { label: "25-49", min: 25, max: 49 },
    { label: "50-74", min: 50, max: 74 },
    { label: "75-100", min: 75, max: 100 },
  ];
  const quiz = quizFields.length === 0 ? null : {
    questionCount: quizFields.length,
    scoredCount: scored.length,
    avgScore: scored.length ? Math.round((scored.reduce((a, s) => a + (s.quizScore ?? 0), 0) / scored.length) * 10) / 10 : null,
    passRate: scored.length ? Math.round((scored.filter((s) => (s.quizScore ?? 0) >= 50).length / scored.length) * 100) : 0,
    buckets: bucketsDef.map((b) => ({
      label: b.label,
      count: scored.filter((s) => (s.quizScore ?? 0) >= b.min && (s.quizScore ?? 0) <= b.max).length,
    })),
    fields: quizFields.map((f) => {
      const answers = valid.map((s) => s.answers.find((a) => a.fieldId === f.id)?.answer ?? null).filter((a): a is string => a != null && a !== "");
      const correctCount = answers.filter((a) => f.correctAnswer && a.trim() === f.correctAnswer).length;
      return {
        fieldId: f.id,
        label: f.label,
        correctAnswer: f.correctAnswer,
        answered: answers.length,
        correctCount,
        wrongCount: answers.length - correctCount,
        correctRate: answers.length ? Math.round((correctCount / answers.length) * 100) : 0,
      };
    }),
  };

  return NextResponse.json({
    form: { id: form.id, name: form.name, type: form.type, status: form.status },
    totals: {
      submissions: submissions.length,
      valid: valid.length,
      spam: spamCount,
      spamRate: submissions.length ? Math.round((spamCount / submissions.length) * 100) : 0,
      approved: byStatus["APPROVED"] ?? 0,
      pending: byStatus["PENDING"] ?? 0,
      rejected: byStatus["REJECTED"] ?? 0,
      avgElapsedSeconds: elapsed.length ? Math.round((elapsed.reduce((a, b) => a + b, 0) / elapsed.length) * 10) / 10 : null,
    },
    daily: days,
    fields: fieldStats,
    quiz,
  });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/form-stats", e);
    return NextResponse.json({ error: "Form istatistikleri alınamadı" }, { status: 500 });
  }
}

async function ParamsGrab(req: NextRequest): Promise<Params> {
  const url = new URL(req.url);
  return Promise.resolve({ formId: url.searchParams.get("formId") ?? undefined });
}
