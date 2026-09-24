// P1 (yeni-fazlar 6) — live-bus abonelik kimlik doğrulaması.
// Kimlik kararı live-bus'ta DEĞİL, Next.js güvenli yolunda verilir (bağımlılık sınırı
// korunur: live-bus DB/oturum kütüphanesi bilmez). Tarayıcının handshake çerezi
// aynen Next'e iletilir; /api/internal/bus-authorize oturum kiracısı + edisyon
// sahipliğini doğrular. Next'e ulaşılamazsa FAIL-CLOSED (hiçbir oda açılmaz).
const AUTHORIZE_URL = process.env.LIVE_BUS_AUTHORIZE_URL ?? "http://127.0.0.1:3000/api/internal/bus-authorize";

export type SubscribeVerdict =
  | { ok: true; editionId: string | null }
  | { ok: false; reason: string };

export async function authorizeSubscribe(input: { cookieHeader: string; editionId: string | null }): Promise<SubscribeVerdict> {
  try {
    const res = await fetch(AUTHORIZE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...(input.cookieHeader ? { cookie: input.cookieHeader } : {}) },
      body: JSON.stringify({ editionId: input.editionId }),
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) return { ok: false, reason: `authorize ${res.status}` };
    const body = (await res.json()) as { ok?: boolean; editionId?: string | null };
    if (!body?.ok) return { ok: false, reason: "reddedildi" };
    // yetki yalnız istenen edisyon için verilir — istemci-başka-edisyon karışamaz
    return { ok: true, editionId: input.editionId ?? null };
  } catch {
    return { ok: false, reason: "authorize erişilemez" };
  }
}
