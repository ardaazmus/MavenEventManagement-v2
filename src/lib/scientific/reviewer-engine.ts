/**
 * ICCA / IAPCO Double-Blind Peer Review & Rubric Scoring Engine
 * 
 * Features:
 * 1. COI (Conflict of Interest) Algorithmic Detection
 * 2. Multi-Criteria Rubric Scoring (Weighted Likert 1-10)
 * 3. Reviewer Z-Score Normalization (Hawk vs Dove calibration)
 * 4. Inter-Rater Discrepancy & Tie-Breaker Alert
 * 5. Decision State Machine
 */

export interface AuthorInfo {
  name: string;
  organizationName?: string | null;
  email?: string | null;
}

export interface ReviewerInfo {
  id: string;
  name: string;
  organizationName?: string | null;
  email?: string | null;
  knownCoAuthors?: string[];
}

export interface RubricCriteria {
  originality: number;   // Weight: 0.25 (1-10)
  methodology: number;   // Weight: 0.35 (1-10)
  relevance: number;     // Weight: 0.25 (1-10)
  clarity: number;       // Weight: 0.15 (1-10)
}

export interface ReviewScore {
  reviewerId: string;
  rawOverall: number;
  rubric: RubricCriteria;
  normalizedZScore?: number;
}

export interface CoiResult {
  hasCoi: boolean;
  reason?: string;
}

/**
 * Checks for algorithmic Conflict of Interest (COI)
 */
export function checkCoi(reviewer: ReviewerInfo, authors: AuthorInfo[]): CoiResult {
  const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

  const reviewerOrg = norm(reviewer.organizationName);
  const reviewerDomain = reviewer.email?.split("@")[1]?.toLowerCase();

  for (const author of authors) {
    const authorOrg = norm(author.organizationName);
    const authorDomain = author.email?.split("@")[1]?.toLowerCase();

    // 1. Kurum / Hastane Eşleşmesi
    if (reviewerOrg && authorOrg && (reviewerOrg === authorOrg || reviewerOrg.includes(authorOrg) || authorOrg.includes(reviewerOrg))) {
      return {
        hasCoi: true,
        reason: `Kurum Çakışması: Hakem ve yazar (${author.name}) aynı kuruma bağlı (${author.organizationName}).`,
      };
    }

    // 2. E-posta Alan Adı Eşleşmesi (genel sağlayıcılar hariç: gmail, yahoo, hotmail, outlook)
    const publicDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"];
    if (
      reviewerDomain &&
      authorDomain &&
      reviewerDomain === authorDomain &&
      !publicDomains.includes(reviewerDomain)
    ) {
      return {
        hasCoi: true,
        reason: `Alan Adı Çakışması: Hakem ve yazar (@${reviewerDomain}) ortak kurumsal e-posta alanını paylaşıyor.`,
      };
    }

    // 3. Ortak Yazarlık Geçmişi
    if (reviewer.knownCoAuthors && reviewer.knownCoAuthors.some((ca) => norm(ca) === norm(author.name))) {
      return {
        hasCoi: true,
        reason: `Ortak Yazarlık: Hakem ile ${author.name} geçmişte ortak yayın yapmıştır.`,
      };
    }
  }

  return { hasCoi: false };
}

/**
 * Calculates weighted score from the 4-part multi-criteria rubric
 */
export function calculateWeightedScore(rubric: RubricCriteria): number {
  const score =
    rubric.originality * 0.25 +
    rubric.methodology * 0.35 +
    rubric.relevance * 0.25 +
    rubric.clarity * 0.15;
  return Math.round(score * 100) / 100;
}

/**
 * Normalizes scores across all reviewers using Z-score (Z = (x - mean) / stdDev)
 * Compares against peer reviewer population to remove hawk/dove bias
 */
export function normalizeReviewScores(
  reviews: { reviewerId: string; rawScore: number }[],
  reviewerHistoricalStats: Record<string, { mean: number; stdDev: number }>
): { reviewerId: string; rawScore: number; zScore: number }[] {
  return reviews.map((r) => {
    const stats = reviewerHistoricalStats[r.reviewerId] ?? { mean: 6.5, stdDev: 1.5 };
    const stdDev = stats.stdDev > 0 ? stats.stdDev : 1.0;
    const zScore = (r.rawScore - stats.mean) / stdDev;
    return {
      reviewerId: r.reviewerId,
      rawScore: r.rawScore,
      zScore: Math.round(zScore * 100) / 100,
    };
  });
}

/**
 * Detects inter-rater discrepancy (e.g. Reviewer A = 9.0, Reviewer B = 3.0 -> delta > 3.0)
 */
export function detectScoringDiscrepancy(scores: number[], threshold = 3.0): {
  hasDiscrepancy: boolean;
  delta: number;
  alert?: string;
} {
  if (scores.length < 2) {
    return { hasDiscrepancy: false, delta: 0 };
  }

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const delta = Math.round((max - min) * 10) / 10;

  if (delta >= threshold) {
    return {
      hasDiscrepancy: true,
      delta,
      alert: `Hakemler arası yüksek puan tutarsızlığı (Fark: ${delta} puan ≥ ${threshold}). 3. Hakem (Tie-breaker) ataması önerilir.`,
    };
  }

  return { hasDiscrepancy: false, delta };
}

/**
 * Canonical decision recommendation based on normalized composite score
 */
export function recommendDecision(score: number): {
  decision: "ACCEPT_ORAL" | "ACCEPT_POSTER" | "ACCEPT_E_POSTER" | "REVISION_REQUIRED" | "REJECT";
  label: string;
} {
  if (score >= 8.5) return { decision: "ACCEPT_ORAL", label: "Kabul — Sözlü Sunum" };
  if (score >= 7.0) return { decision: "ACCEPT_POSTER", label: "Kabul — Moderasyonlu Poster" };
  if (score >= 5.5) return { decision: "ACCEPT_E_POSTER", label: "Kabul — Dijital E-Poster" };
  if (score >= 4.0) return { decision: "REVISION_REQUIRED", label: "Revize Et & Yeniden Gönder" };
  return { decision: "REJECT", label: "Reddedildi" };
}
