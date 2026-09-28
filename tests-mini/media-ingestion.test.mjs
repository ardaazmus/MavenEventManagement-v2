import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const libPath = path.resolve("src/lib/media/ingestion.ts");

function headersOf(map) {
  const lower = {};
  for (const [k, v] of Object.entries(map)) lower[k.toLowerCase()] = v;
  return { get: (name) => lower[name.toLowerCase()] ?? null };
}

// Sahte DNS: ana makine → IP listesi (gerçek ağa ÇIKILMAZ).
function fakeDns(table) {
  return async (host) => {
    if (!(host in table)) throw new Error(`DNS_NXDOMAIN:${host}`);
    return table[host];
  };
}

// Sahte fetch: URL → kurgulanmış yanıt. Okuyucu-tabanlı gövde de desteklenir.
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push(url.toString());
    const route = routes[url.toString()] ?? routes[url.hostname] ?? routes["*"];
    if (!route) return { status: 404, headers: headersOf({}), arrayBuffer: async () => new ArrayBuffer(0) };
    if (route.hang) {
      await new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }
    if (route.chunks) {
      const queue = route.chunks.map((c) => new TextEncoder().encode(c));
      return {
        status: route.status ?? 200,
        headers: headersOf(route.headers ?? {}),
        body: {
          getReader: () => ({
            read: async () => (queue.length ? { done: false, value: queue.shift() } : { done: true, value: undefined }),
            releaseLock: () => {},
          }),
        },
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    const bytes = new TextEncoder().encode(route.body ?? "");
    return {
      status: route.status ?? 200,
      headers: headersOf(route.headers ?? {}),
      arrayBuffer: async () => bytes.buffer,
    };
  };
  return { impl, calls };
}

test("P14.2 - IP blok listesi: loopback/RFC1918/link-local/multicast v4+v6", async () => {
  const { isBlockedIp } = await import(pathToFileURL(libPath).href);
  const blocked = [
    "127.0.0.1", "127.5.6.7", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "0.0.0.0", "100.64.0.1", "100.127.255.254", "224.0.0.1", "255.255.255.255",
    "192.0.2.1", "198.51.100.7", "203.0.113.9",
    "::1", "::", "fe80::1", "FE80::abcd", "fc00::1", "fd12::1", "ff02::1",
    "0:0:0:0:0:0:0:1", "0:0:0:0:0:ffff:127.0.0.1", "::ffff:10.1.2.3", "2001:db8::1",
  ];
  for (const ip of blocked) assert.strictEqual(isBlockedIp(ip), true, `${ip} engellenmeli`);
  const open = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.9.9", "172.32.0.1", "192.167.9.9", "100.128.0.1", "2001:4860:4860::8888", "2606:4700:4700::1111", "::ffff:8.8.8.8"];
  for (const ip of open) assert.strictEqual(isBlockedIp(ip), false, `${ip} açık olmalı`);
});

test("P14.2 - şema/ana-makine/DNS-sonrası IP denetimi + allowlist", async () => {
  const { validateExternalUrl, IngestionError } = await import(pathToFileURL(libPath).href);
  const dns = fakeDns({
    "cdn.ornek.net": ["93.184.216.34"],
    "rebind.evil.net": ["93.184.216.34", "127.0.0.1"],
    "gizli.evil.net": ["10.9.9.9"],
    "v6rebind.evil.net": ["::ffff:192.168.0.5"],
  });
  const ok = await validateExternalUrl("https://cdn.ornek.net/a.png", { dnsLookup: dns });
  assert.strictEqual(ok.ip, "93.184.216.34");

  for (const [raw, code] of [
    ["ftp://cdn.ornek.net/a", "BLOCKED_SCHEME"],
    ["file:///etc/passwd", "BLOCKED_SCHEME"],
    ["https://user:pass@cdn.ornek.net/a", "BLOCKED_USERINFO"],
    ["http://localhost:9/a", "BLOCKED_HOST"],
    ["http://api.internal/x", "BLOCKED_HOST"],
    ["http://169.254.169.254/meta", "BLOCKED_IP"],
    ["http://[::1]/x", "BLOCKED_IP"],
    ["https://gizli.evil.net/x", "BLOCKED_IP"],
    ["https://rebind.evil.net/x", "BLOCKED_IP"],
    ["https://v6rebind.evil.net/x", "BLOCKED_IP"],
    ["https://yok.ornek.net/x", "DNS_FAIL"],
    ["::::bozuk", "BAD_URL"],
  ]) {
    await assert.rejects(() => validateExternalUrl(raw, { dnsLookup: dns }), (e) => e instanceof IngestionError && e.code === code, `${raw} → ${code}`);
  }
  // Allowlist: listedeki dışındakiler (açık IP bile olsa) reddedilir.
  await assert.rejects(
    () => validateExternalUrl("https://cdn.ornek.net/a.png", { dnsLookup: dns, allowlist: ["baska.net"] }),
    (e) => e instanceof IngestionError && e.code === "NOT_ALLOWLISTED",
  );
  const listed = await validateExternalUrl("https://cdn.ornek.net/a.png", { dnsLookup: dns, allowlist: [".ornek.net"] });
  assert.strictEqual(listed.ip, "93.184.216.34");
});

test("P14.2 - yönlendirme: adım başı tekrar doğrulama + sınır", async () => {
  const { fetchValidated, IngestionError } = await import(pathToFileURL(libPath).href);
  const dns = fakeDns({ "a.net": ["93.184.216.34"], "b.net": ["93.184.216.35"], "ozel.net": ["192.168.7.7"] });
  // Mutlu yol: 1 göreli yönlendirme + bayt gövde
  {
    const { impl, calls } = fakeFetch({
      "https://a.net/eski": { status: 302, headers: { location: "/yeni" } },
      "https://a.net/yeni": { status: 200, headers: { "content-type": "image/png", "content-length": "4" }, body: "PNG!" },
    });
    const got = await fetchValidated("https://a.net/eski", { dnsLookup: dns, fetchImpl: impl });
    assert.strictEqual(got.bytes.toString(), "PNG!");
    assert.strictEqual(got.finalUrl, "https://a.net/yeni");
    assert.strictEqual(got.redirects, 1);
    assert.deepStrictEqual(calls, ["https://a.net/eski", "https://a.net/yeni"]);
  }
  // Özel-ağa yönlendirme engellenir — ikinci istek hiç atılmaz.
  {
    const { impl, calls } = fakeFetch({
      "https://a.net/tuzak": { status: 302, headers: { location: "http://ozel.net/x" } },
      "*": { status: 200, headers: { "content-type": "image/png" }, body: "ASLA" },
    });
    await assert.rejects(() => fetchValidated("https://a.net/tuzak", { dnsLookup: dns, fetchImpl: impl }), (e) => e instanceof IngestionError && e.code === "BLOCKED_IP");
    assert.deepStrictEqual(calls, ["https://a.net/tuzak"]);
  }
  // Yönlendirme döngüsü sınırda kesilir.
  {
    const { impl } = fakeFetch({ "*": { status: 301, headers: { location: "https://b.net/dongu" } } });
    await assert.rejects(
      () => fetchValidated("https://a.net/x", { dnsLookup: dns, fetchImpl: impl, maxRedirects: 2 }),
      (e) => e instanceof IngestionError && e.code === "REDIRECT_LIMIT",
    );
  }
});

test("P14.2 - bayt/MIME/zaman sınırları", async () => {
  const { fetchValidated, IngestionError } = await import(pathToFileURL(libPath).href);
  const dns = fakeDns({ "cdn.net": ["93.184.216.34"] });
  const base = { dnsLookup: dns };
  // Bildirimli boyutu aşan reddedilir (gövde okunmaz).
  {
    let read = false;
    const { impl } = fakeFetch({ "*": { status: 200, headers: { "content-type": "image/png", "content-length": "999999999" }, body: "x" } });
    const counting = async (u, i) => { const r = await impl(u, i); return { ...r, arrayBuffer: async () => { read = true; return r.arrayBuffer(); } }; };
    await assert.rejects(() => fetchValidated("https://cdn.net/a", { ...base, fetchImpl: counting }), (e) => e instanceof IngestionError && e.code === "TOO_LARGE");
    assert.strictEqual(read, false);
  }
  // Akış (chunked) ortasında sınır aşımı kesilir.
  {
    const { impl } = fakeFetch({ "*": { status: 200, headers: { "content-type": "image/png" }, chunks: ["abc", "defgh"] } });
    await assert.rejects(() => fetchValidated("https://cdn.net/a", { ...base, fetchImpl: impl, maxBytes: 5 }), (e) => e instanceof IngestionError && e.code === "TOO_LARGE");
  }
  // HTML gövde varsayılan-red.
  {
    const { impl } = fakeFetch({ "*": { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: "<html>" } });
    await assert.rejects(() => fetchValidated("https://cdn.net/a", { ...base, fetchImpl: impl }), (e) => e instanceof IngestionError && e.code === "MIME_REJECTED");
  }
  // Açık allow-mime listesi.
  {
    const { impl } = fakeFetch({ "*": { status: 200, headers: { "content-type": "image/jpeg" }, body: "FF" } });
    const got = await fetchValidated("https://cdn.net/a", { ...base, fetchImpl: impl, allowedMime: ["image/*"] });
    assert.strictEqual(got.contentType, "image/jpeg");
    await assert.rejects(() => fetchValidated("https://cdn.net/a", { ...base, fetchImpl: impl, allowedMime: ["video/*"] }), (e) => e instanceof IngestionError && e.code === "MIME_REJECTED");
  }
  // Zaman aşımı.
  {
    const { impl } = fakeFetch({ "*": { hang: true } });
    await assert.rejects(() => fetchValidated("https://cdn.net/a", { ...base, fetchImpl: impl, timeoutMs: 30 }), (e) => e instanceof IngestionError && e.code === "TIMEOUT");
  }
  // HTTP hata kodu taşınır.
  {
    const { impl } = fakeFetch({ "*": { status: 500, body: "boom" } });
    await assert.rejects(() => fetchValidated("https://cdn.net/a", { ...base, fetchImpl: impl }), (e) => e instanceof IngestionError && e.code === "BAD_STATUS");
  }
});
