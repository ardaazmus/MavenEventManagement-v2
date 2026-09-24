// Form Merkezi — Spam koruma motoru (kullanıcı isteği: spam maillere karşı koruma)
// Katmanlar: honeypot tuzağı + zaman tuzağı + e-posta/IP hız limiti + engelli domain + mükerrer onaylı gönderi
// Hız sayacı bellek içi (tek instance) — sandbox/yatay ölçek için yeterli; gerçek dağıtımda Redis'e taşınır.

const hits = new Map<string, number[]>();
const DAY_MS = 24 * 60 * 60 * 1000;

function countHits(key: string): number {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < DAY_MS);
  hits.set(key, arr);
  return arr.length;
}

function registerHit(key: string): void {
  const arr = hits.get(key) ?? [];
  arr.push(Date.now());
  hits.set(key, arr);
}

export interface SpamInput {
  honeypotValue?: string | null;
  elapsedSeconds?: number | null;
  email: string;
  ip?: string | null;
  minSubmitSeconds: number;
  maxPerEmailPerDay: number;
  blockedDomains?: string | null;
  existingApprovedCount: number; // aynı form + e-posta için onaylı gönderi sayısı
}

export interface SpamVerdict {
  score: number; // 0-100
  reasons: string[];
  isSpam: boolean; // score >= 50
}

export const SPAM_THRESHOLD = 50;

export function evaluateSpam(input: SpamInput): SpamVerdict {
  const reasons: string[] = [];
  let score = 0;
  const email = (input.email ?? "").trim().toLowerCase();
  const domain = email.split("@")[1] ?? "";

  // 1) Honeypot — gizli alan insanlara görünmez, botlar doldurur
  if (input.honeypotValue && input.honeypotValue.trim() !== "") {
    score += 100;
    reasons.push("Gizli doğrulama alanı dolduruldu (honeypot) — otomatik bot davranışı");
  }

  // 2) Engelli e-posta alan adı
  if (domain && input.blockedDomains) {
    const blocked = input.blockedDomains
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (blocked.includes(domain)) {
      score += 100;
      reasons.push(`E-posta alan adı engelli listede: ${domain}`);
    }
  }

  // 3) Zaman tuzağı — gerçek insan minimum süreden hızlı dolduramaz
  if (input.elapsedSeconds != null && input.elapsedSeconds < input.minSubmitSeconds) {
    score += 60;
    reasons.push(`Form ${input.elapsedSeconds.toFixed(1)} sn'de dolduruldu (insan minimumu ${input.minSubmitSeconds} sn)`);
  }

  // 4) E-posta biçimi
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    score += 50;
    reasons.push("E-posta biçimi geçersiz");
  }

  // 5) IP hız limiti — günlük 10+ gönderim
  if (input.ip) {
    const ipCount = countHits(`ip:${input.ip}`);
    if (ipCount >= 10) {
      score += 40;
      reasons.push(`Aynı IP'den bugün ${ipCount}. gönderim — hız limiti aşıldı`);
    }
  }

  // 6) E-posta hız limiti — form ayarındaki günlük limit
  const emailCount = countHits(`mail:${email}`);
  if (emailCount >= Math.max(1, input.maxPerEmailPerDay)) {
    score += 80;
    reasons.push(`Bu e-postadan bugün ${emailCount} gönderim yapıldı (limit ${input.maxPerEmailPerDay})`);
  }

  // 7) Mükerrer onaylı gönderi
  if (input.existingApprovedCount > 0) {
    score += 30;
    reasons.push("Bu e-posta ile bu formda zaten onaylı bir gönderim var");
  }

  return { score: Math.min(100, score), reasons, isSpam: score >= SPAM_THRESHOLD };
}

// Değerlendirme sonrası hız sayaçlarını işaretle (spam olsa da sayılır)
export function registerSubmissionHits(email: string, ip?: string | null): void {
  const mail = (email ?? "").trim().toLowerCase();
  if (mail) registerHit(`mail:${mail}`);
  if (ip) registerHit(`ip:${ip}`);
}
