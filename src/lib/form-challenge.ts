// F-EXP — Form doğrulama challenge'ı (gerçek bot kapısı).
// Sunucu tarafında üretilen HMAC imzalı matematik sorusu: istemci cevabını
// gönderir, sunucu imza + süre + tek-kullanım kontrolü yapar. Dış servis yok,
// script yükleme yok (KVKK/çerez temiz), basit botlar ve scriptli yığımlar elenir.
//
// Sözleşme:
//  issueChallenge() → { question: "7 + 5", token: "<payload>.<hmac>" }
//  verifyChallenge(token, answer) → true yalnız: imza geçerli + süresi içinde +
//  cevap doğru + token daha önce kullanılmamış.
import { createHmac, timingSafeEqual, randomInt } from "crypto";

const TTL_MS = 10 * 60 * 1000; // 10 dk geçerlilik
// Sunucu-içi sır: env varsa onu kullan (MAVEN_CHALLENGE_SECRET), yoksa türetilmiş sabit.
// Kod depoda görünse de token yalnız sunucuda doğrulanır ve tek-kullanım sayacı
// bellek içindedir — istemci imza üretemez (secret asla istemciye gitmez).
const SECRET =
  process.env.MAVEN_CHALLENGE_SECRET ?? "maven-form-challenge::v1::static-derivation";

// tek-kullanım nonce defteri (bellek içi; dağıtımda Redis'e taşınır)
const used = new Map<string, number>(); // token → usedAt
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of used) if (now - t > 24 * 3600_000) used.delete(k);
}, 3600_000).unref?.();

function hmac(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export interface ChallengeIssue {
  question: string;
  token: string;
}

/** Yeni doğrulama sorusu üret — soru metni istemciye gider, cevap asla gitmez. */
export function issueChallenge(): ChallengeIssue {
  const a = randomInt(2, 12);
  const b = randomInt(2, 12);
  const add = randomInt(0, 2) === 1;
  const question = add ? `${a} + ${b}` : `${a + b} − ${a < b ? a : b}`; // görsel eksi
  const answer = add ? a + b : Math.abs(a - b);
  const payload = Buffer.from(
    JSON.stringify({ h: hmac(String(answer)), exp: Date.now() + TTL_MS }),
  ).toString("base64url");
  return { question, token: `${payload}.${hmac(payload)}` };
}

/** Doğrula: imza + süre + tek-kullanım + cevap. Hata nedeni sızdırılmaz. */
export function verifyChallenge(token: string | undefined | null, answer: string | undefined | null): boolean {
  if (!token || !answer) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(payload);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return false;
  if (used.has(token)) return false; // tek-kullanım
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      h: string;
      exp: number;
    };
    if (typeof data.exp !== "number" || Date.now() > data.exp) return false;
    const normalized = answer.trim().replace("−", "-");
    const ok =
      hmac(String(Number(normalized))) === data.h ||
      hmac(normalized) === data.h;
    if (!ok) return false;
    used.set(token, Date.now());
    return true;
  } catch {
    return false;
  }
}
