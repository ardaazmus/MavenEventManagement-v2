// ─── P21.4: Kişi özellik vektörü (feature engineering) ────────────────────────
// Segment/RFM ötesi model girdisi: kişi başına deterministik sayısal özellikler.
// Kaynaklar: katılım, ödeme, lead, görüşme, rol. PII YOK (yalnız sayım/gün).
export interface FeatureInput {
  personId: string;
  editionCount: number; // kiracıda katıldığı edisyon sayısı
  daysSinceFirstSeen: number | null; // ilk katılım kaydından bugüne
  paidTotal: number; // kuruş
  paidCount: number;
  daysSinceLastPaid: number | null;
  leadCount: number; // bu edisyonda taranma sayısı (0/1)
  meetingCount: number; // bu edisyonda talebi sayısı
  isStaff: boolean;
  isSpeaker: boolean;
  isVip: boolean;
  daysToEventAtSubmit: number | null; // kayıt→etkinlik başlangıcı (negatif=gecikmiş)
}

export interface PersonFeatures extends FeatureInput {
  repeatVisitor: boolean;
  payer: boolean;
}

export function buildPersonFeatures(input: FeatureInput): PersonFeatures {
  return {
    ...input,
    paidTotal: Math.max(0, Math.trunc(input.paidTotal)),
    paidCount: Math.max(0, Math.trunc(input.paidCount)),
    editionCount: Math.max(0, Math.trunc(input.editionCount)),
    repeatVisitor: input.editionCount > 1,
    payer: input.paidTotal > 0,
  };
}

// ─── P21.4: SQL şablonları (BI dışa aktarımı için) ───────────────────────────
// :tenantId / :editionId yer tutucuları ZORUNLU — şablon kiracı filtresiz
// çalıştırılamaz (test kilidi). SQLite + Postgres uyumlu sade SQL.
export interface SqlTemplate {
  key: string;
  title: string;
  description: string;
  sql: string;
}

export const SQL_TEMPLATES: SqlTemplate[] = [
  {
    key: "funnel_by_day",
    title: "Günlük huni",
    description: "Gönderim gününe göre kayıt→onay→ödeme→giriş sayımları.",
    sql: `SELECT date(r."submittedAt") AS day,
  COUNT(*) AS submitted,
  SUM(CASE WHEN r.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed
FROM "Registration" r
JOIN "EventEdition" e ON e.id = r."editionId"
WHERE e."tenantId" = :tenantId AND r."editionId" = :editionId
  AND r.status <> 'DRAFT'
GROUP BY 1 ORDER BY 1;`,
  },
  {
    key: "revenue_by_category",
    title: "Kategori bazında gelir",
    description: "Başarılı ödemelerin kayıt kategorisine göre dağılımı (kuruş).",
    sql: `SELECT c.code AS category, SUM(p.amount) AS paid_minor
FROM "Payment" p
JOIN "Order" o ON o.id = p."orderId"
JOIN "OrderLine" l ON l."orderId" = o.id
LEFT JOIN "Registration" r ON r.id = l."registrationId"
LEFT JOIN "RegistrationCategory" c ON c.id = r."categoryId"
JOIN "EventEdition" e ON e.id = o."editionId"
WHERE e."tenantId" = :tenantId AND o."editionId" = :editionId
  AND p.status = 'SUCCEEDED'
GROUP BY 1 ORDER BY 2 DESC;`,
  },
  {
    key: "cohort_first_edition",
    title: "Kohort (ilk katılım)",
    description: "Kişi başına ilk giriş yapılan edisyon — tekrar analizi tabanı.",
    sql: `SELECT s."personId", MIN(e."startDate") AS first_start
FROM "ScanEvent" s
JOIN "EventEdition" e ON e.id = s."editionId"
WHERE e."tenantId" = :tenantId
  AND s.action = 'ENTRY' AND s.result = 'ALLOWED'
  AND s."personId" IS NOT NULL
GROUP BY 1;`,
  },
  {
    key: "lead_by_sponsor",
    title: "Sponsor lead sayımı",
    description: "Anlaşma başına lead + rızalı lead sayıları.",
    sql: `SELECT g.name AS organization, COUNT(l.id) AS leads,
  SUM(CASE WHEN p."consentVersion" IS NOT NULL THEN 1 ELSE 0 END) AS consented
FROM "LeadCapture" l
JOIN "SponsorAgreement" a ON a.id = l."agreementId"
JOIN "Organization" g ON g.id = a."organizationId"
JOIN "Person" p ON p.id = l.personId
JOIN "EventEdition" e ON e.id = l."editionId"
WHERE e."tenantId" = :tenantId AND l."editionId" = :editionId
GROUP BY 1 ORDER BY 2 DESC;`,
  },
  {
    key: "unpaid_aging",
    title: "Vadesi geçmiş açık bakiye",
    description: "14 günden eski ödenmemiş siparişler (bayatlayan tahsilat).",
    sql: `SELECT o."orderNo", o."totalAmount", o."createdAt", o."payerName"
FROM "Order" o
JOIN "EventEdition" e ON e.id = o."editionId"
WHERE e."tenantId" = :tenantId AND o."editionId" = :editionId
  AND o.status IN ('OPEN', 'PARTIALLY_PAID')
  AND o."createdAt" < datetime('now', '-14 days')
ORDER BY o."createdAt";`,
  },
  {
    key: "checkin_by_hour",
    title: "Saatlik giriş yoğunluğu",
    description: "Etkinlik günü saat başına giriş sayımı (kapı planlaması).",
    sql: `SELECT strftime('%Y-%m-%d %H:00', s."scannedAt") AS hour,
  COUNT(*) AS entries
FROM "ScanEvent" s
JOIN "EventEdition" e ON e.id = s."editionId"
WHERE e."tenantId" = :tenantId AND s."editionId" = :editionId
  AND s.action = 'ENTRY' AND s.result = 'ALLOWED'
GROUP BY 1 ORDER BY 1;`,
  },
];
