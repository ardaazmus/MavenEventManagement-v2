// /api/compliance/report — Uyumluluk Raporu (TASK-B 20)
// KİŞİSEL VERİ İÇERMEZ: yalnız AGREGAT sayımlar (Prisma count/groupBy — fetch-all döngüsü YOK).
// { erasure: {total,pending,overdue,completed}, consent: {personsWithConsent,commsOptInCount},
//   documents: {total,active,byKind}, jurisdiction: profil özeti, generatedAt }
// E-posta/ad/telefon gibi hiçbir kimlik alanı bu yanıtta BULUNMAZ (KVKK veri minimizasyonu).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";
import { requireAdmin } from "@/lib/auth/request-context";

export async function GET() {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const adminGate = await requireAdmin();
  if (adminGate) return adminGate;
  try {
    const tenantId = await resolveContext(null);
    const now = new Date();

    // tek tur paralel agregasyon — tümü sayım/groupBy; hiçbir yerde findMany-all yok
    const [total, pending, overdue, completed, personsWithConsent, commsOptInCount, docTotal, docActive, byKindRows, profile] =
      await Promise.all([
        // silme talepleri — yalnız sayaç
        db.kvkkErasureRequest.count({ where: { tenantId } }),
        // açık iş yükü: PENDING + VERIFIED (henüz tamamlanmamış)
        db.kvkkErasureRequest.count({ where: { tenantId, status: { in: ["PENDING", "VERIFIED"] } } }),
        // SLA aşımı: süresi geçmiş VE hâlâ açık (COMPLETED/REJECTED hariç)
        db.kvkkErasureRequest.count({
          where: { tenantId, dueAt: { lt: now }, status: { notIn: ["COMPLETED", "REJECTED"] } },
        }),
        db.kvkkErasureRequest.count({ where: { tenantId, status: "COMPLETED" } }),
        // rıza sayaçları — kimlik alanı okunmadan count
        db.person.count({ where: { tenantId, consentAcceptedAt: { not: null } } }),
        db.person.count({ where: { tenantId, commsOptIn: true } }),
        // belge sicili — toplam + aktif + tür kırılımı (groupBy)
        db.documentRecord.count({ where: { tenantId } }),
        db.documentRecord.count({ where: { tenantId, active: true } }),
        db.documentRecord.groupBy({ by: ["kind"], where: { tenantId }, _count: { _all: true } }),
        // yargı profili — read-or-create (özette PII yok)
        db.jurisdictionProfile.upsert({ where: { tenantId }, update: {}, create: { tenantId } }),
      ]);

    const byKind = byKindRows
      .map((r) => ({ kind: r.kind, count: r._count._all }))
      .sort((a, b) => a.kind.localeCompare(b.kind));

    return NextResponse.json({
      erasure: { total, pending, overdue, completed },
      consent: { personsWithConsent, commsOptInCount },
      documents: { total: docTotal, active: docActive, byKind },
      jurisdiction: {
        jurisdiction: profile.jurisdiction,
        dsrSlaDays: profile.dsrSlaDays,
        breachWindowHours: profile.breachWindowHours,
        opLogYears: profile.opLogYears,
        cookieStrictness: profile.cookieStrictness,
        dpoMode: profile.dpoMode,
        transferMechanism: profile.transferMechanism,
        consentVersion: profile.consentVersion,
        retentionNotesSet: profile.retentionNotes != null && profile.retentionNotes.trim() !== "",
      },
      generatedAt: now.toISOString(),
    });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/compliance/report", e);
    return NextResponse.json({ error: "Uyumluluk raporu üretilemedi" }, { status: 500 });
  }
}
