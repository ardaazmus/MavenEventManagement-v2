// ─── P14.2: Medya ingestion doğrulayıcısı (SSRF kalkanı) ───────────────────────
// Yol haritası: URL allowlist, DNS-sonrası IP denetimi, redirect başına tekrar
// doğrulama, max redirect, timeout, bayt/MIME sınırları. DNS ve fetch enjekte
// edilir (üretimde node:dns + global fetch; testte double) — bu modül asla
// doğrudan ağa çıkmaz, kararı kendisi verir.
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için göreli/bağımsız.
import net from "node:net";
import dns from "node:dns/promises";

export const INGEST_DEFAULT_TIMEOUT_MS = 8000;
export const INGEST_DEFAULT_MAX_REDIRECTS = 3;
export const INGEST_DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const BLOCKED_MIME_PREFIXES = ["text/html", "application/xhtml"];

export class IngestionError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "IngestionError";
    this.code = code;
  }
}

export type DnsLookup = (host: string) => Promise<string[]>;

export async function defaultDnsLookup(host: string): Promise<string[]> {
  const records = await dns.lookup(host, { all: true });
  return records.map((r) => r.address);
}

const BLOCKED_SUFFIXES = [".localhost", ".internal", ".local", ".invalid", ".example", ".test"];
const BLOCKED_EXACT = new Set(["localhost", "metadata.google.internal"]);

function inCidr(octets: number[], base: number[], bits: number): boolean {
  const full = Math.floor(bits / 8);
  for (let i = 0; i < full; i++) if (octets[i] !== base[i]) return false;
  const rest = bits % 8;
  if (rest === 0) return true;
  const mask = 0xff & (0xff << (8 - rest));
  return (octets[full] & mask) === (base[full] & mask);
}

// IPv6 `::` sıkıştırmasını 8 hextet'e genişletir (bölge kimliği atılır).
export function expandIpv6(raw: string): number[] | null {
  const addr = raw.split("%")[0].toLowerCase();
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : [];
  // Gövdede IPv4 kuyruğu (`::ffff:1.2.3.4`) — v4 kısmı iki hextet'e çevrilir.
  const convert = (parts: string[]): number[] | null => {
    const out: number[] = [];
    for (const p of parts) {
      if (p.includes(".")) {
        if (!net.isIPv4(p)) return null;
        const o = p.split(".").map(Number);
        out.push((o[0] << 8) | o[1], (o[2] << 8) | o[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(p)) return null;
        out.push(parseInt(p, 16));
      }
    }
    return out;
  };
  const h = convert(head);
  const t = convert(tail);
  if (!h || !t) return null;
  if (halves.length === 1) return h.length === 8 ? h : null;
  const zeros = 8 - h.length - t.length;
  if (zeros < 0) return null;
  return [...h, ...new Array(zeros).fill(0), ...t];
}

export function isBlockedIp(rawIp: string): boolean {
  const ip = rawIp.replace(/[\[\]]/g, "");
  if (net.isIPv4(ip)) {
    const o = ip.split(".").map(Number);
    if (inCidr(o, [0, 0, 0, 0], 8)) return true; // "bu ağ"
    if (inCidr(o, [10, 0, 0, 0], 8)) return true; // RFC1918
    if (inCidr(o, [100, 64, 0, 0], 10)) return true; // CGNAT
    if (inCidr(o, [127, 0, 0, 0], 8)) return true; // loopback
    if (inCidr(o, [169, 254, 0, 0], 16)) return true; // link-local
    if (inCidr(o, [172, 16, 0, 0], 12)) return true; // RFC1918
    if (inCidr(o, [192, 0, 0, 0], 24)) return true; // IETF ayrılmış
    if (inCidr(o, [192, 0, 2, 0], 24)) return true; // TEST-NET-1
    if (inCidr(o, [192, 168, 0, 0], 16)) return true; // RFC1918
    if (inCidr(o, [198, 18, 0, 0], 15)) return true; // benchmark
    if (inCidr(o, [198, 51, 100, 0], 24)) return true; // TEST-NET-2
    if (inCidr(o, [203, 0, 113, 0], 24)) return true; // TEST-NET-3
    if (o[0] >= 224) return true; // multicast + rezerve + broadcast
    return false;
  }
  const h = expandIpv6(ip);
  if (!h) return true; // çözümlenemeyen sözde-IP'yi güvenli tarafta bırak
  const isZero = h.every((x) => x === 0);
  if (isZero) return true; // tanımsız
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true; // ::1
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((h[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // dokümantasyon
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    // ::ffff:a.b.c.d — içteki IPv4'e göre karar ver
    const a = (h[6] >> 8) & 0xff;
    const b = h[6] & 0xff;
    const c = (h[7] >> 8) & 0xff;
    const d = h[7] & 0xff;
    return isBlockedIp(`${a}.${b}.${c}.${d}`);
  }
  return false;
}

export function hostAllowedByAllowlist(host: string, allowlist: string[]): boolean {
  const h = host.toLowerCase();
  return allowlist.some((entry) => {
    const e = entry.toLowerCase().replace(/[\[\]]/g, "");
    if (e.startsWith(".")) return h === e.slice(1) || h.endsWith(e);
    return h === e;
  });
}

export interface ValidateOptions {
  dnsLookup?: DnsLookup;
  allowlist?: string[];
}

export interface ValidatedUrl {
  url: URL;
  ip: string;
}

export async function validateExternalUrl(raw: string, opts: ValidateOptions = {}): Promise<ValidatedUrl> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new IngestionError("BAD_URL", "Geçersiz URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new IngestionError("BLOCKED_SCHEME", `Yasak şema: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new IngestionError("BLOCKED_USERINFO", "Kullanıcı bilgili URL yasak");
  }
  const host = url.hostname.replace(/[\[\]]/g, "").toLowerCase();
  if (!host) throw new IngestionError("BAD_URL", "Boş ana makine");
  if (BLOCKED_EXACT.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new IngestionError("BLOCKED_HOST", `Yasak ana makine: ${host}`);
  }
  if (opts.allowlist && !hostAllowedByAllowlist(host, opts.allowlist)) {
    throw new IngestionError("NOT_ALLOWLISTED", `Allowlist dışı: ${host}`);
  }
  let ips: string[];
  if (net.isIP(host)) {
    ips = [host];
  } else {
    const lookup = opts.dnsLookup ?? defaultDnsLookup;
    try {
      ips = await lookup(host);
    } catch {
      throw new IngestionError("DNS_FAIL", `DNS çözülemedi: ${host}`);
    }
    if (!ips.length) throw new IngestionError("DNS_FAIL", `DNS kaydı yok: ${host}`);
  }
  // DNS-sonrası denetim: dönen TÜM adresler temiz olmalı (rebind kalkanı).
  for (const ip of ips) {
    if (isBlockedIp(ip)) {
      throw new IngestionError("BLOCKED_IP", `Yasak hedef adres: ${ip}`);
    }
  }
  return { url, ip: ips[0] };
}

export interface FetchLikeInit {
  signal?: AbortSignal;
  redirect?: "manual";
  headers?: Record<string, string>;
}

export interface FetchLikeResponse {
  status: number;
  headers: { get(name: string): string | null };
  body?: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; releaseLock(): void } } | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FetchImpl = (url: URL, init: FetchLikeInit) => Promise<FetchLikeResponse>;

export interface FetchValidatedOptions extends ValidateOptions {
  fetchImpl?: FetchImpl;
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  allowedMime?: string[];
}

export interface FetchedObject {
  bytes: Buffer;
  contentType: string;
  finalUrl: string;
  bytesRead: number;
  redirects: number;
}

function defaultFetchImpl(url: URL, init: FetchLikeInit): Promise<FetchLikeResponse> {
  return fetch(url, { signal: init.signal, redirect: "manual" }) as unknown as Promise<FetchLikeResponse>;
}

async function readCappedBody(res: FetchLikeResponse, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for (;;) {
        if (signal.aborted) throw new IngestionError("TIMEOUT", "İndirme zaman aşımı");
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > maxBytes) throw new IngestionError("TOO_LARGE", `Bayt sınırı aşıldı (>${maxBytes})`);
          chunks.push(Buffer.from(value));
        }
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, total);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new IngestionError("TOO_LARGE", `Bayt sınırı aşıldı (>${maxBytes})`);
  return buf;
}

export async function fetchValidated(rawUrl: string, opts: FetchValidatedOptions = {}): Promise<FetchedObject> {
  const maxRedirects = opts.maxRedirects ?? INGEST_DEFAULT_MAX_REDIRECTS;
  const timeoutMs = opts.timeoutMs ?? INGEST_DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? INGEST_DEFAULT_MAX_BYTES;
  const fetchImpl = opts.fetchImpl ?? defaultFetchImpl;

  let current = rawUrl;
  let redirects = 0;
  for (;;) {
    const { url } = await validateExternalUrl(current, opts);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: FetchLikeResponse;
    try {
      res = await fetchImpl(url, { signal: ctrl.signal, redirect: "manual" });
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof IngestionError) throw e;
      if (ctrl.signal.aborted) throw new IngestionError("TIMEOUT", `İstek zaman aşımı (${timeoutMs}ms)`);
      throw new IngestionError("FETCH_FAIL", e instanceof Error ? e.message : "İndirme başarısız");
    }
    clearTimeout(timer);
    if (ctrl.signal.aborted) throw new IngestionError("TIMEOUT", `İstek zaman aşımı (${timeoutMs}ms)`);

    if (res.status >= 300 && res.status < 400) {
      if (redirects >= maxRedirects) throw new IngestionError("REDIRECT_LIMIT", `Yönlendirme sınırı aşıldı (>${maxRedirects})`);
      const loc = res.headers.get("location");
      if (!loc) throw new IngestionError("REDIRECT_NO_LOCATION", "Yönlendirme konumsuz");
      redirects++;
      // Göreli konumu mevcut URL'ye göre çöz; HER adımda tam doğrulama yapılır.
      current = new URL(loc, url).toString();
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      throw new IngestionError("BAD_STATUS", `HTTP ${res.status}`);
    }
    const rawType = (res.headers.get("content-type") ?? "").toLowerCase();
    const contentType = rawType.split(";")[0].trim() || "application/octet-stream";
    if (opts.allowedMime) {
      const ok = opts.allowedMime.some((m) => contentType === m.toLowerCase() || contentType.startsWith(`${m.toLowerCase()}/`) || (m.endsWith("/*") && contentType.startsWith(m.slice(0, -1).toLowerCase())));
      if (!ok) throw new IngestionError("MIME_REJECTED", `MIME reddedildi: ${contentType}`);
    } else if (BLOCKED_MIME_PREFIXES.some((p) => contentType.startsWith(p))) {
      throw new IngestionError("MIME_REJECTED", `HTML gövde reddedildi: ${contentType}`);
    }
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new IngestionError("TOO_LARGE", `Bildirimli boyut sınırı aşıyor (${declared})`);
    }
    const bytes = await readCappedBody(res, maxBytes, ctrl.signal);
    return { bytes, contentType, finalUrl: url.toString(), bytesRead: bytes.byteLength, redirects };
  }
}
