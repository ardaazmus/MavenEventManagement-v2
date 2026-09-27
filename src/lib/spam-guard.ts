// Form Merkezi — Spam koruma motoru (kullanıcı isteği: spam maillere karşı koruma)
// Katmanlar: honeypot tuzağı + zaman tuzağı + e-posta/IP hız limiti + engelli domain +
// mükerrer onaylı gönderi + F-EXP genişletmesi: ıskarta (disposable) e-posta alanları +
// URL doldurma sinyali + mükerrer içerik karması (form-kapsamlı IP sayacı).
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

// Mükerrer içerik karması defteri: formId+hash → { email, at }
const contentSeen = new Map<string, { email: string; at: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of contentSeen) if (now - v.at > DAY_MS) contentSeen.delete(k);
}, 3600_000).unref?.();

// Bilinen ıskarta/geçici e-posta sağlayıcıları — kayıt/anket formlarında sahte kimlik sinyali
export const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "tempmail.com", "temp-mail.org", "guerrillamail.com", "guerrillamail.net",
  "yopmail.com", "yopmail.net", "10minutemail.com", "10minutemail.net", "throwawaymail.com",
  "sharklasers.com", "getnada.com", "dispostable.com", "trashmail.com", "trashmail.de",
  "fakeinbox.com", "maildrop.cc", "mailnesia.com", "mytemp.email", "spam4.me",
  "grr.la", "tempmailaddress.net", "tempinbox.com", "emailondeck.com", "mailcatch.com",
  "mohmal.com", "moakt.com", "tempmailo.com", "internxt.com", "linshiyouxiang.net",
]);

// cevap/alan metninde tespit edilen URL sayısı (bağlantı doldurma sinyali)
export function countUrls(text: string): number {
  const matches = text.match(/https?:\/\/\S+/gi);
  return matches ? matches.length : 0;
}

// basit deterministik içerik karması (mükerrer doldurma sinyali) — FNV-1a
export function contentHash(parts: string[]): string {
  const s = parts.join("\u0000").trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
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
  formId?: string; // F-EXP: form-kapsamlı IP sayacı + içerik karması anahtarı
  answerText?: string; // F-EXP: URL doldurma + içerik karması için tüm cevapların birleşimi
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

  // 2b) F-EXP: ıskarta (disposable) e-posta sağlayıcısı — kalıcı olmayan sahte kutu
  if (domain && DISPOSABLE_DOMAINS.has(domain)) {
    score += 100;
    reasons.push("Geçici/ıskarta e-posta sağlayıcısı kullanıldı");
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

  // 5) IP hız limiti — günlük 10+ gönderim (F-EXP: form-kapsamlı sayaç; formId yoksa global)
  if (input.ip) {
    const ipKey = input.formId ? `ipf:${input.formId}:${input.ip}` : `ip:${input.ip}`;
    const ipCount = countHits(ipKey);
    if (ipCount >= 10) {
      score += 40;
      reasons.push(`Aynı IP'den bu formda bugün ${ipCount}. gönderim — hız limiti aşıldı`);
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

  // 8) F-EXP: URL doldurma — cevap metinlerinde 3+ bağlantı (reklam/seo spam'i)
  const urlCount = countUrls(input.answerText ?? "");
  if (urlCount >= 3) {
    score += 40;
    reasons.push(`Cevaplarda ${urlCount} bağlantı tespit edildi — bağlantı doldurma şüphesi`);
  }

  // 9) F-EXP: mükerrer içerik — aynı formda aynı cevap öbeği 24 saat içinde farklı e-postadan
  if (input.formId && input.answerText && email) {
    const hash = contentHash([input.formId, input.answerText]);
    const seen = contentSeen.get(hash);
    if (seen && seen.email !== email && Date.now() - seen.at < DAY_MS) {
      score += 35;
      reasons.push("Aynı içerik kısa süre önce farklı bir e-postadan gönderildi — kopyalama şüphesi");
    }
  }

  return { score: Math.min(100, score), reasons, isSpam: score >= SPAM_THRESHOLD };
}

// Değerlendirme sonrası hız sayaçlarını işaretle (spam olsa da sayılır)
export function registerSubmissionHits(email: string, ip?: string | null, formId?: string, answerText?: string): void {
  const mail = (email ?? "").trim().toLowerCase();
  if (mail) registerHit(`mail:${mail}`);
  if (ip) registerHit(formId ? `ipf:${formId}:${ip}` : `ip:${ip}`);
  if (formId && answerText && mail) {
    contentSeen.set(contentHash([formId, answerText]), { email: mail, at: Date.now() });
  }
}
