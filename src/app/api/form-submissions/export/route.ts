// FORM-EXP3 — Form gönderileri CSV dışa aktarımı (Form Merkezi → Yanıtlar).
// GET /api/form-submissions/export?formId=... → text/csv (BOM + ; ayraç, Excel TR dostu)
// • Yetki/girişim: form-stats ile AYNI G0-b deseni (resolveContext + edisyon-kiracı doğrulama)
// • Sütunlar: sabit özet sütunları + tasarımcı sırasıyla alan başına bir sütun
// • Çok-seçimli cevaplar JSON diziyse " | " ile birleştirilir; CSV hücreleri kaçışlı tırnaklanır
// • Tavan: 5000 satır (OOM koruması)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";

const MAX_ROWS = 5000;

function parseMulti(answer: string | null | undefined): string[] {
  if (!answer) return [];
  try {
    const parsed: unknown = JSON.parse(answer);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* JSON değilse virgülle ayrılmış */
  }
  return answer.split(",").map((s) => s.trim()).filter(Boolean);
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

const STATUS_TR: Record<string, string> = {
  PENDING: "İncelemede",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  SPAM: "İstenmeyen",
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const formId = url.searchParams.get("formId") ?? "";
    if (!formId) return NextResponse.json({ error: "formId zorunlu" }, { status: 400 });

    // G0-b: gönderi verisi taşır — formun edisyonu bağlam kiracısıyla doğrulanır
    const ctx = await resolveContext(null);
    const formCtx = await db.formDefinition.findUnique({
      where: { id: formId },
      select: { edition: { select: { tenantId: true } } },
    });
    if (!formCtx) return NextResponse.json({ error: "Form bulunamadı" }, { status: 404 });
    if (formCtx.edition && formCtx.edition.tenantId !== ctx) {
      return NextResponse.json({ error: "Form bulunamadı" }, { status: 404 });
    }

    const form = await db.formDefinition.findUnique({
      where: { id: formId },
      include: {
        fields: { orderBy: { order: "asc" } },
        submissions: {
          orderBy: { createdAt: "desc" as const },
          take: MAX_ROWS,
          include: {
            answers: true,
            registration: { select: { confirmationNo: true } },
          },
        },
      },
    });
    if (!form) return NextResponse.json({ error: "Form bulunamadı" }, { status: 404 });

    const answerFields = form.fields.filter((f) => f.type !== "SECTION");
    const header = [
      "Gönderi No", "Tarih", "Durum", "Ad Soyad", "E-posta", "Kuruluş", "Telefon", "Kaynak",
      "Spam Puanı", "Quiz Puanı (%)", "Quiz Doğru", "Quiz Toplam", "Süre (sn)", "Teyit No",
      ...answerFields.map((f) => f.label),
    ];
    const lines: string[] = [header.map(csvCell).join(";")];

    for (const s of form.submissions) {
      const row: unknown[] = [
        s.id,
        new Date(s.createdAt).toISOString(),
        STATUS_TR[s.status] ?? s.status,
        s.respondentName,
        s.respondentEmail,
        s.organization ?? "",
        s.phone ?? "",
        s.source,
        s.spamScore ?? 0,
        s.quizScore ?? "",
        s.quizCorrect ?? "",
        s.quizTotal ?? "",
        s.elapsedSeconds != null ? Math.round(s.elapsedSeconds) : "",
        s.registration?.confirmationNo ?? "",
      ];
      for (const f of answerFields) {
        const a = s.answers.find((x) => x.fieldId === f.id)?.answer ?? "";
        const vals = f.type === "MULTI_CHOICE" || f.type === "CHECKBOX" || f.type === "RANKING" || f.type === "MATRIX"
          ? parseMulti(a)
          : [a];
        row.push(vals.join(" | "));
      }
      lines.push(row.map(csvCell).join(";"));
    }
    if (form.submissions.length >= MAX_ROWS) {
      lines.push(csvCell(`NOT: ${MAX_ROWS} satır sınırına ulaşıldı — daha eski gönderiler bu dosyada YOK`));
    }

    // BOM: Excel UTF-8 karakterleri (ş/ğ/İ) bozuk görmez; CRLF: satır sonu standardı
    const body = "\uFEFF" + lines.join("\r\n") + "\r\n";
    const name = form.slug || form.id;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="form-${name}-responses.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof GuardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/form-submissions/export", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Dışa aktarım başarısız" }, { status: 500 });
  }
}
