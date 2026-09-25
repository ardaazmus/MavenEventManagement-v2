// F-EXP — Herkese açık oylama/anket sonuçları.
// GET /api/public-forms/<id-VEYA-slug>/results
// Yalnız hasPublicResults=true formlar için dağılım döner (oylama şeffaflığı).
// Spam gönderiler ve TEAM_ONLY alanlar sonuçlara KATILMAZ.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = { params: Promise<{ idOrSlug: string }> };

// dağılımı hesaplanan alan türleri (oylama/anket görselleştirmesi)
const CHOICE_LIKE = ["VOTE", "SINGLE_CHOICE", "MULTI_CHOICE", "CHECKBOX", "YESNO", "QA_QUIZ", "RATING", "NPS"];

function barLabel(fieldType: string, value: string): string {
  if (fieldType === "CHECKBOX" || fieldType === "YESNO") {
    return value === "true" ? "Evet" : value === "false" ? "Hayır" : value;
  }
  if (fieldType === "MULTI_CHOICE" || fieldType === "QA_QUIZ") {
    try {
      const arr: unknown = JSON.parse(value);
      if (Array.isArray(arr)) return arr.map(String).join(" | ");
    } catch {
      /* düz metin */
    }
  }
  return value;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { idOrSlug } = await params;
  const form = await db.formDefinition.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  if (!form || form.status !== "PUBLISHED" || !form.isPublic) {
    return NextResponse.json({ error: "Form bulunamadı veya yayında değil" }, { status: 404 });
  }
  if (!form.hasPublicResults) {
    return NextResponse.json({ error: "Bu formun sonuçları herkese açık değil" }, { status: 403 });
  }

  // spam gönderiler hariç tüm yanıtlar
  const submissions = await db.formSubmission.findMany({
    where: { formId: form.id, status: { not: "SPAM" } },
    select: { id: true },
  });
  const subIds = submissions.map((s) => s.id);
  const answers = subIds.length
    ? await db.formAnswer.findMany({
        where: { formId: form.id, submissionId: { in: subIds } },
        select: { fieldId: true, answer: true },
      })
    : [];

  const fields = form.fields
    .filter((f) => f.sensitivity !== "TEAM_ONLY" && f.type !== "SECTION")
    .map((f) => {
      const rows = answers.filter((a) => a.fieldId === f.id && (a.answer ?? "").trim() !== "");
      const result: {
        fieldId: string; label: string; type: string; responseCount: number;
        distribution?: { value: string; count: number }[];
        average?: number | null;
      } = {
        fieldId: f.id,
        label: f.label,
        type: f.type,
        responseCount: rows.length,
      };
      if (CHOICE_LIKE.includes(f.type)) {
        const tally = new Map<string, number>();
        for (const r of rows) {
          const raw = barLabel(f.type, (r.answer ?? "").trim());
          for (const part of raw.split("|").map((s) => s.trim()).filter(Boolean)) {
            tally.set(part, (tally.get(part) ?? 0) + 1);
          }
        }
        result.distribution = [...tally.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count);
      } else if (f.type === "NUMBER" || f.type === "RATING" || f.type === "NPS") {
        const nums = rows.map((r) => Number(r.answer)).filter((n) => Number.isFinite(n));
        result.average = nums.length ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100 : null;
      }
      return result;
    });

  return NextResponse.json({
    form: { id: form.id, name: form.name, type: form.type },
    totalVotes: subIds.length,
    updatedAt: new Date().toISOString(),
    fields,
  });
}
