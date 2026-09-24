// ─── TASK-B 28: iyzico sandbox adaptörü (ödeme takibi 1. AŞAMA — sıra KİLİTLİ) ──
// Takip sırası (spec): iyzico sandbox (bu dosya) → manuel fatura takibi (MEVCUT: payments
// manuel teyit akışı) → canlı merchant (harici) → PayTR → İş Bankası → Paraşüt/GİB.
// Bu aşama YALNIZ sandbox: hosted checkout (Checkout Form) başlatma + auth/detail ile
// sonuç doğrulama. CANLI anahtar ASLA bu aşamada alınmaz/donanımlanmaz.
//
// Kaynak: iyzico resmi REST v2 (https://docs.iyzipay.com/) — SDK yerine doğrudan HTTP
// (bağımlılık beyaz liste dışı); kimlik doğrulama iyzico v2 HMAC-SHA256 imzası:
//   authorization = "IYZWSv2 " + base64( HMAC-SHA256( secret, random + apiKey + uriPath + body ) )
//   header: Authorization, x-iyzi-rnd (random), x-iyzi-client-version, Content-Type.
// Sandbox kimlik bilgileri ENV: IYZICO_API_KEY / IYZICO_SECRET / IYZICO_BASE(sandbox varsayılan).
// Üçüncü taraf çağrı YALNIZ bu adaptörde; loglarda sır/PII YOK (maskeli).
import crypto from "crypto";

export const IYZICO_BASE = process.env.IYZICO_BASE ?? "https://sandbox-api.iyzipay.com";

export function iyzicoConfigured(): boolean {
  return Boolean(process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET);
}

function authHeaders(uriPath: string, body: string): Record<string, string> {
  const apiKey = process.env.IYZICO_API_KEY ?? "";
  const secret = process.env.IYZICO_SECRET ?? "";
  const random = `${Date.now()}`;
  const payload = `${random}${apiKey}${uriPath}${body}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64");
  return {
    "Content-Type": "application/json",
    "x-iyzi-rnd": random,
    "x-iyzi-client-version": "maven-task-b-1.0",
    Authorization: `IYZWSv2 ${apiKey}:${signature}`,
  };
}

async function iyzicoPost<T>(uriPath: string, payload: unknown): Promise<T> {
  const body = JSON.stringify(payload);
  const res = await fetch(`${IYZICO_BASE}${uriPath}`, {
    method: "POST",
    headers: authHeaders(uriPath, body),
    body,
  });
  const json = (await res.json()) as T & { status?: string; errorMessage?: string };
  return json;
}

export interface CheckoutInitInput {
  conversationId: string; // Maven Payment id (izlenebilirlik)
  priceMinor: number; // kuruş → iyzico TRY ondalıklı (kuruş/100)
  paidPriceMinor: number;
  buyerName: string;
  buyerSurname: string;
  buyerEmail: string;
  buyerIp: string;
  callbackUrl: string; // MUTLAK adres — sağlayıcı gereği (iyzico → /api/payments/iyzico/callback)
  description: string;
}

/** Hosted checkout (Checkout Form) başlatır — token + içerik döner (iyzico sandbox). */
export async function initCheckoutForm(input: CheckoutInitInput): Promise<{
  ok: boolean; token?: string; checkoutFormContent?: string; paymentPageUrl?: string; error?: string;
}> {
  const uri = "/payment/iyzico/layout/checkoutform/initialize";
  const price = (input.priceMinor / 100).toFixed(2);
  const paid = (input.paidPriceMinor / 100).toFixed(2);
  const payload = {
    locale: "tr",
    conversationId: input.conversationId,
    price,
    paidPrice: paid,
    currency: "TRY",
    basketId: input.conversationId,
    paymentGroup: "PRODUCT",
    forceThreeDS: 0,
    enabledInstallments: [],
    callbackUrl: input.callbackUrl,
    buyer: {
      id: input.conversationId,
      name: input.buyerName,
      surname: input.buyerSurname,
      email: input.buyerEmail,
      ip: input.buyerIp,
      gsmNumber: "+900000000000", // asgari şablon — gerçek PII toplamıyoruz (KVKK asgari veri)
      city: "Istanbul", country: "Turkey", address: "N/A", zipCode: "00000",
      registrationAddress: "N/A",
    },
    basketItems: [
      {
        id: input.conversationId,
        name: input.description.slice(0, 60),
        category1: "Event",
        itemType: "VIRTUAL",
        price,
      },
    ],
  };
  const res = await iyzicoPost<{
    status?: string; token?: string; checkoutFormContent?: string;
    paymentPageUrl?: string; errorMessage?: string;
  }>(uri, payload);
  if (res.status !== "success" || !res.token) {
    return { ok: false, error: res.errorMessage ?? "iyzico checkout başlatılamadı" };
  }
  return {
    ok: true,
    token: res.token,
    checkoutFormContent: res.checkoutFormContent,
    paymentPageUrl: `${IYZICO_BASE}/payment/iyzico/layout/checkoutform/${res.token}`,
  };
}

/** Checkout sonucu — token ile auth/detail (sağlayıcıdan doğrulanmış durum). */
export async function retrieveCheckoutResult(token: string, conversationId: string): Promise<{
  ok: boolean; status?: string; paymentStatus?: string; error?: string;
}> {
  const uri = "/payment/iyzico/layout/checkoutform/auth/detail";
  const res = await iyzicoPost<{ status?: string; paymentStatus?: string; errorMessage?: string }>(uri, {
    locale: "tr",
    conversationId,
    token,
  });
  if (res.status !== "success") return { ok: false, error: res.errorMessage ?? "iyzico doğrulama başarısız" };
  return { ok: true, status: res.status, paymentStatus: res.paymentStatus };
}
