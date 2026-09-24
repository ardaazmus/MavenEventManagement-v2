// Maven Live Bus — canlı bildirim veri yolu (§47 domain event → gerçek zamanlı UI)
// ------------------------------------------------------------------
// Yayın kanalı  : Next.js API katmanı → HTTP POST /publish { room, payload }
// Abonelik      : tarayıcı socket.io → io("/?XTransformPort=3003") → subscribe { editionId }
// Odalar        : "global" + "edition:<id>" (edisyon odası aboneleri her iki olayı da alır)
// Hazırlık      : oda bazlı izleyici sayısı → presence olayı (kimse yoksa oda düşer)
// Dayanıklılık  : durum yok — yalnız aktarım; kalıcılık ActivityLog (Prisma) sorumluluğundadır
import { createServer } from "http";
import { Server } from "socket.io";
import crypto from "crypto";
import { authorizeSubscribe } from "./auth";

const PORT = 3003;        // socket.io — tarayıcıya açık (Caddy XTransformPort ile)
const PUB_PORT = 3004;    // HTTP yayın ucu — yalnız Next.js sunucu içi (localhost)

// socket.io path "/" ile çalıştığı için tüm HTTP isteklerini engine.io yutar;
// yayın ucu bu yüzden ayrı iç porta alınır (tarayıcı bu porta asla dokunmaz).
// P1 (yeni-fazlar 6): yayın ucu paylaşımlı anahtarla korunur — CORS güven olarak
  // SAYILMAZ (sunucu-sunucu kanalında CORS zaten anlamsızdır). Anahtar iki tarafta
  // aynı env (LIVE_BUS_KEY) / aynı geliştirme-başvuru değerinden gelir.
  const PUB_KEY = process.env.LIVE_BUS_KEY ?? "maven-live-bus-dev-key";
  function publishKeyOk(req: { headers: Record<string, string | string[] | undefined> }): boolean {
    const got = req.headers["x-live-bus-key"];
    const value = Array.isArray(got) ? got[0] : got;
    if (typeof value !== "string" || value.length === 0) return false;
    const a = crypto.createHash("sha256").update(value).digest();
    const b = crypto.createHash("sha256").update(PUB_KEY).digest();
    return crypto.timingSafeEqual(a, b);
  }

  const pubServer = createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // Sağlık kontrolü
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, clients: io.engine.clientsCount, rooms: roomCounts() }));
    return;
  }

  // Yayın ucu — yalnız Next.js sunucu içinden (loopback + paylaşımlı anahtar)
  if (req.method === "POST" && req.url === "/publish") {
    if (!publishKeyOk(req)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "yetkisiz yayın" }));
      return;
    }
    let body = "";
    let overflow = false;
    req.on("data", (chunk: Buffer) => {
      if (body.length + chunk.length > 64_000) { overflow = true; return; }
      body += chunk;
    });
    req.on("end", () => {
      if (overflow) { res.writeHead(413); res.end("payload too large"); return; }
      try {
        const parsed = JSON.parse(body) as { room?: string; payload?: unknown };
        if (!parsed?.room || typeof parsed.room !== "string" || !parsed.payload) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "room ve payload zorunlu" }));
          return;
        }
        io.to(parsed.room).emit("activity", parsed.payload);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, room: parsed.room, receivers: io.sockets.adapter.rooms.get(parsed.room)?.size ?? 0 }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "geçersiz JSON" }));
      }
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "bilinmeyen yol" }));
});

const io = new Server({
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── Hazırlık (presence) takibi ──
// socket.id → katıldığı edisyon (null = global izleyici)
const presence = new Map<string, string | null>();

function roomsForSocket(editionId: string | null): string[] {
  return editionId ? ["global", `edition:${editionId}`] : ["global"];
}

function roomCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const room of io.sockets.adapter.rooms.keys()) {
    if (room.startsWith("edition:")) counts[room] = io.sockets.adapter.rooms.get(room)?.size ?? 0;
  }
  counts.global = io.sockets.adapter.rooms.get("global")?.size ?? 0;
  return counts;
}

function broadcastPresence() {
  io.emit("presence", { clients: io.engine.clientsCount, rooms: roomCounts() });
}

io.on("connection", (socket) => {
  // P1 (yeni-fazlar 6): abonelik KİMİLİ + edisyon yetkisi — Next.js güvenli yolu
  // (bus-authorize) doğrulaması olmadan hiçbir odaya katılım yok (fail-closed).
  socket.on("subscribe", async (data: { editionId?: string | null } = {}) => {
    const editionId = data?.editionId ?? null;
    const cookieHeader = String(socket.handshake.headers.cookie ?? "");
    const verdict = await authorizeSubscribe({ cookieHeader, editionId });
    if (!verdict.ok) {
      socket.emit("unauthorized", { reason: verdict.reason ?? "kimlik doğrulanamadı", at: new Date().toISOString() });
      return;
    }
    // önceki odalardan ayrıl (edisyon değişimi)
    const prev = presence.get(socket.id) ?? null;
    for (const room of roomsForSocket(prev)) socket.leave(room);
    presence.set(socket.id, verdict.editionId ?? null);
    for (const room of roomsForSocket(verdict.editionId ?? null)) socket.join(room);
    socket.emit("subscribed", { editionId: verdict.editionId ?? null, rooms: roomsForSocket(verdict.editionId ?? null), at: new Date().toISOString() });
    broadcastPresence();
  });

  socket.on("disconnect", () => {
    presence.delete(socket.id);
    broadcastPresence();
  });

  socket.on("error", (error: unknown) => {
    console.error(`[live-bus] socket error (${socket.id}):`, error);
  });
});

pubServer.listen(PUB_PORT, "127.0.0.1", () => {
  console.log(`[live-bus] yayın ucu :${PUB_PORT} (loopback-only, POST /publish, GET /health)`);
});

io.listen(PORT);
console.log(`[live-bus] socket.io :${PORT} (path "/")`);

process.on("SIGTERM", () => {
  pubServer.close(() => io.close(() => process.exit(0)));
});
process.on("SIGINT", () => {
  pubServer.close(() => io.close(() => process.exit(0)));
});
