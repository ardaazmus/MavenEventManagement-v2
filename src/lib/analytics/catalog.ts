// ─── P21.1: Metrik kataloğu ─────────────────────────────────────────────────
// HER KPI tek kaynaktan belgelenir: isim, formül, grain (tane), veri kaynağı,
// zaman dilimi, tazelik ve sahip. Dashboard ve export AYNI hesap fonksiyonunu
// kullanır (P21.2) — formül burada, hesap aggregations.ts'te.
export interface MetricDef {
  key: string;
  name: string;
  formula: string;
  grain: string;
  source: string;
  timezone: string;
  freshness: string;
  owner: string;
}

export const METRIC_CATALOG: MetricDef[] = [
  { key: "funnel.registered", name: "Kayıtlı katılım", formula: "COUNT(DISTINCT participation)", grain: "edisyon", source: "EventParticipation", timezone: "—", freshness: "canlı", owner: "REGISTRATION_MANAGER" },
  { key: "funnel.submitted", name: "Gönderilen kayıt", formula: "COUNT(participation WHERE ANY registration.status <> DRAFT)", grain: "edisyon", source: "Registration", timezone: "—", freshness: "canlı", owner: "REGISTRATION_MANAGER" },
  { key: "funnel.confirmed", name: "Onaylanan kayıt", formula: "COUNT(participation WHERE ANY registration.status = CONFIRMED)", grain: "edisyon", source: "Registration", timezone: "—", freshness: "canlı", owner: "REGISTRATION_MANAGER" },
  { key: "funnel.paid", name: "Ödemesi tamamlanan", formula: "COUNT(participation WHERE EXISTS OrderLine + Order.status = PAID)", grain: "edisyon", source: "Order + OrderLine", timezone: "—", freshness: "canlı", owner: "FINANCE_MANAGER" },
  { key: "funnel.checked_in", name: "Giriş yapan", formula: "COUNT(participation WHERE attendance = CHECKED_IN OR EXISTS ALLOWED ENTRY scan)", grain: "edisyon", source: "EventParticipation + ScanEvent", timezone: "—", freshness: "canlı", owner: "ONSITE_MANAGER" },
  { key: "funnel.by_day", name: "Günlük huni", formula: "submitted günü = submittedAt UTC gün dilimi (YYYY-MM-DD)", grain: "edisyon × gün", source: "Registration.submittedAt", timezone: "UTC", freshness: "canlı", owner: "REGISTRATION_MANAGER" },
  { key: "cohort.repeat_rate", name: "Tekrar katılım oranı", formula: "repeaters / persons; kohort = ilk giriş edisyonu (startDate sırası)", grain: "kiracı", source: "ScanEvent + EventParticipation", timezone: "—", freshness: "canlı", owner: "EVENT_MANAGER" },
  { key: "rfm.tier", name: "RFM katmanı", formula: "R(≤7/30/90/180 gün) + F(≥5/3/2/1 ödeme) + M(≥500k/200k/50k/0 kuruş); toplam ≥13 CHAMPION, ≥10 LOYAL, ≥7 POTENTIAL, ≥4 AT_RISK, altı DORMANT", grain: "edisyon × kişi", source: "Payment (SUCCEEDED)", timezone: "Europe/Istanbul (gün hesabı)", freshness: "canlı", owner: "FINANCE_MANAGER" },
  { key: "revenue.net", name: "Net gelir", formula: "SUM(Payment SUCCEEDED) − SUM(Refund PROCESSED) (kuruş, çevrimsiz)", grain: "edisyon", source: "Payment + Refund", timezone: "—", freshness: "canlı", owner: "FINANCE_MANAGER" },
  { key: "portfolio.converted", name: "Portföy çevrilmiş gelir", formula: "Σ tutar × açık kur (çağrı girdisi; eksik kurda 400)", grain: "kiracı × edisyon", source: "Payment + Refund + çağrı kurları", timezone: "—", freshness: "canlı", owner: "FINANCE_MANAGER" },
  { key: "leads.total", name: "Lead sayısı", formula: "COUNT(LeadCapture WHERE canlı: expiresAt NULL ya da gelecekte)", grain: "edisyon × anlaşma", source: "LeadCapture", timezone: "—", freshness: "canlı", owner: "SPONSORSHIP_MANAGER" },
  { key: "leads.qualified", name: "Nitelikli lead", formula: "COUNT(lead WHERE rating IN (HOT, WARM))", grain: "edisyon × anlaşma", source: "LeadCapture", timezone: "—", freshness: "canlı", owner: "SPONSORSHIP_MANAGER" },
  { key: "leads.scans", name: "Rozet taraması", formula: "COUNT(lead WHERE channel = BADGE_SCAN)", grain: "edisyon × anlaşma", source: "LeadCapture", timezone: "—", freshness: "canlı", owner: "SPONSORSHIP_MANAGER" },
  { key: "meetings.confirmed", name: "Onaylı görüşme", formula: "COUNT(MeetingRequest WHERE status IN (CONFIRMED, COMPLETED))", grain: "edisyon × anlaşma", source: "MeetingRequest", timezone: "görüntü dilimi kayıtta; çakışma gerçek an üzerinden", freshness: "canlı", owner: "SPONSORSHIP_MANAGER" },
  { key: "sponsor.profile_views", name: "Sponsor profil görüntüleme", formula: "COUNT(PortalAnalyticsLog WHERE kind = SPONSOR_VIEW); oturum+kurum+gün tekili", grain: "edisyon × kurum", source: "PortalAnalyticsLog", timezone: "Europe/Istanbul (gün tekilleme)", freshness: "canlı", owner: "SPONSORSHIP_MANAGER" },
  { key: "sponsor.favorites", name: "Sponsor favorisi", formula: "COUNT(SponsorFavorite) — AUTH kişi başına kurumda tek", grain: "edisyon × kurum", source: "SponsorFavorite", timezone: "—", freshness: "canlı", owner: "SPONSORSHIP_MANAGER" },
  { key: "deliverables.overdue", name: "Gecikmiş teslim", formula: "COUNT(deliverable WHERE dueDate < şimdi AND status NOT IN (APPROVED, COMPLETED, REJECTED))", grain: "edisyon × anlaşma", source: "Deliverable", timezone: "sunucu saati", freshness: "canlı", owner: "SPONSORSHIP_MANAGER" },
  { key: "coverage.email_rate", name: "E-posta doluluk", formula: "katılımcıların person.email dolu oranı", grain: "edisyon", source: "Person", timezone: "—", freshness: "canlı", owner: "REGISTRATION_MANAGER" },
  { key: "benchmark.tier", name: "Seviye kıyası", formula: "grup = anlaşma seviyesi; K eşiği altı suppressed (değerler null)", grain: "edisyon × seviye", source: "LeadCapture/MeetingRequest/PortalAnalyticsLog", timezone: "—", freshness: "canlı", owner: "SPONSORSHIP_MANAGER" },
];
