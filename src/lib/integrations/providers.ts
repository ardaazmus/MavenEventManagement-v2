// ─── P22.4: Sağlayıcı gönderim sözleşmesi ───────────────────────────────────
// Tek gönderim noktası: zaman aşımı + imza başlıkları + tekrar sınıflandırması.
// Tekrarlanabilir: ağ hatası/zaman aşımı + 429 + 5xx. 4xx (429 hariç) kalıcı
// hata — tekrar YOK (doğrudan dead-letter adayı). fetch enjekte edilir
// (sözleşme testleri loopback sunucuyla, gerçek kimlik bilgisiz çalışır).
import { signPayload } from "./webhooks.ts";

export const DISPATCH_TIMEOUT_MS = 8000;

export interface DispatchInput {
  url: string;
  eventType: string;
  deliveryId: string;
  payload: Record<string, unknown>;
  secret?: string | null;
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
}

export interface DispatchResult {
  ok: boolean;
  status: number | null;
  retryable: boolean;
  durationMs: number;
  error: string | null;
}

type FetchFn = (url: string, init: Record<string, unknown>) => Promise<{
  status: number;
  ok: boolean;
}>;

export async function dispatchWebhook(input: DispatchInput, fetchImpl?: FetchFn): Promise<DispatchResult> {
  const startedAt = Date.now();
  const fetchFn = (fetchImpl ?? fetch) as FetchFn;
  const body = JSON.stringify({ event: input.eventType, deliveryId: input.deliveryId, data: input.payload });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Maven-Event": input.eventType,
    "X-Maven-Delivery": input.deliveryId,
    "X-Maven-Timestamp": timestamp,
    ...input.extraHeaders,
  };
  if (input.secret) {
    headers["X-Maven-Signature"] = signPayload(input.secret, timestamp, body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DISPATCH_TIMEOUT_MS);
  try {
    const res = await fetchFn(input.url, { method: "POST", headers, body, signal: controller.signal });
    const durationMs = Date.now() - startedAt;
    if (res.ok) return { ok: true, status: res.status, retryable: false, durationMs, error: null };
    const retryable = res.status === 429 || res.status >= 500;
    return {
      ok: false, status: res.status, retryable, durationMs,
      error: `HTTP ${res.status}`,
    };
  } catch (e) {
    const durationMs = Date.now() - startedAt;
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false, status: null, retryable: true, durationMs,
      error: aborted ? "Zaman aşımı" : e instanceof Error ? e.message : "Ağ hatası",
    };
  } finally {
    clearTimeout(timer);
  }
}
