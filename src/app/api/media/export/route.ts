// ============================================================================
// GET /api/media/export?editionId=… — Medya klasörünü ZIP olarak indirir
// Kullanıcı kuralı: "Medya klasörünü proje sonunda export edebilmeliyim zip olarak."
// Yapı:  Medya/  → kategori klasörleri → varlıklar (dataUrl'ler binary olarak,
//        dış bağlantılar en iyi çaba ile çekilir) + manifest.json
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

// ── P4 (yeni-fazlar 16): dış bağlantı indirme savunmaları ──
// SSRF: loopback/özel/bağlantı-yerel/multicast/metadata ağ bloğu; redirect İZLENMEZ
// (manual) — 3xx → .url bırakma yoluna düşer; boyut + içerik-türü sınırı; zip girişi
// safe-basename (path-traversal yok).
import net from "net";
function isPublicHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.replace(/[\[\]]/g, "").toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return null;
    if (host === "metadata.google.internal" || host === "169.254.169.254") return null;
    if (net.isIP(host)) {
      const ip = host;
      if (net.isIPv4(ip)) {
        const o = ip.split(".").map(Number);
        if (o[0] === 127 || o[0] === 10 || o[0] === 0 || (o[0] === 169 && o[1] === 254) || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168) || (o[0] === 100 && o[1] >= 64 && o[1] <= 127)) return null;
        if (o[0] >= 224) return null; // multicast/rezerve
      } else {
        const low = ip.toLowerCase();
        if (low === "::1" || low === "::" || low.startsWith("fc") || low.startsWith("fd") || low.startsWith("fe80") || low.startsWith("::ffff:127.")) return null;
      }
    }
    return u;
  } catch {
    return null;
  }
}
function safeEntryName(name: string): string {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "varlik";
  return base.replace(/[\u0000-\u001f]/g, "").trim() || "varlik";
}

import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { AUTH_ENABLED, hasSession } from "@/lib/auth-flag";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ensureSystemFolders, slugifyName } from "@/lib/media-system";

export const runtime = "nodejs";

interface AssetRow {
  id: string; name: string; kind: string; mimeType: string | null; sizeKb: number | null;
  dataUrl: string | null; externalUrl: string | null; tags: string | null; linkedType: string | null;
  linkedId: string | null; folderId: string | null; createdAt: Date;
}

function safeDir(name: string): string {
  return slugifyName(name).replace(/[^a-z0-9-]/g, "");
}

export async function GET(req: NextRequest) {
  try {
  // S3: toplu indirme istismarı kapısı — 10 indirme/dk/IP
  const dlDenied = enforceRateLimit(req, { key: "media-export", limit: 10, windowMs: 60_000 });
  if (dlDenied) return dlDenied;

    // G0-f: auth bayrağı açıkken oturum zorunlu — katılımcı fotoğrafları KVKK kapsamında PII'dir
    if (AUTH_ENABLED && !(await hasSession(req))) {
      return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
    }

    const editionId = req.nextUrl.searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 422 });

    // G0-b: medya arşivi PII taşır — edisyon bağlamına doğrulanır (bogus/yabancı → 404)
    try {
      await resolveEditionContext(editionId, { required: true });
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      select: { name: true, slug: true, series: { select: { name: true } } },
    });
    if (!edition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    const { root, folders } = await ensureSystemFolders(editionId);

    const allFolders = await db.mediaFolder.findMany({ where: { editionId } });
    const assets = (await db.mediaAsset.findMany({
      where: { editionId },
      orderBy: [{ folderId: "asc" }, { name: "asc" }],
    })) as unknown as AssetRow[];

    const zip = new JSZip();
    const rootDir: JSZip = zip.folder("Medya")!;

    // klasör id → zip yolu (kök + kategori klasörleri garantili)
    const dirOf = new Map<string, JSZip>();
    dirOf.set(root.id, rootDir);
    for (const f of allFolders) {
      if (f.id === root.id) continue;
      const parentDir = f.parentId ? (dirOf.get(f.parentId) ?? rootDir) : rootDir;
      dirOf.set(f.id, parentDir.folder(safeDir(f.name) || "klasor")!);
    }

    const manifest: Array<Record<string, unknown>> = [];
    let embedded = 0, linked = 0, failed = 0;

    for (const a of assets) {
      const dir = (a.folderId ? dirOf.get(a.folderId) : rootDir) ?? rootDir;
      const entry = {
        name: a.name, kind: a.kind, mimeType: a.mimeType, sizeKb: a.sizeKb,
        tags: a.tags, linkedType: a.linkedType, linkedId: a.linkedId,
        createdAt: a.createdAt.toISOString(), source: a.dataUrl ? "embedded" : a.externalUrl ? "external" : "none",
      };
      manifest.push({ ...entry, folder: allFolders.find((f) => f.id === a.folderId)?.name ?? "Medya" });

      if (a.dataUrl && a.dataUrl.startsWith("data:")) {
        const base64 = a.dataUrl.slice(a.dataUrl.indexOf(",") + 1);
        dir.file(safeEntryName(a.name), base64, { base64: true });
        embedded++;
      } else if (a.externalUrl) {
        // P4: SSRF filtresi (özel ağ/metadata YOK) + redirect izlenmez + 25MB tavan +
        // html türü reddi; başarısızlıkta güvenli .url bırakma (dış bağlantı silinmez)
        try {
          const target = isPublicHttpUrl(a.externalUrl);
          if (!target) throw new Error("ssrf-blocked");
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(target, { signal: ctrl.signal, redirect: "manual" });
          clearTimeout(t);
          if (!res.ok) throw new Error(String(res.status));
          if (res.status >= 300 && res.status < 400) throw new Error("redirect-not-followed");
          const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
          if (ctype.includes("text/html")) throw new Error("html-red");
          const len = Number(res.headers.get("content-length") ?? "0");
          if (len > 25 * 1024 * 1024) throw new Error("too-large");
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 25 * 1024 * 1024) throw new Error("too-large");
          dir.file(safeEntryName(a.name), Buffer.from(buf));
          linked++;
        } catch {
          dir.file(`${safeEntryName(a.name)}.url`, `[InternetShortcut]\nURL=${a.externalUrl}\n`);
          failed++;
        }
      }
    }

    rootDir.file("manifest.json", JSON.stringify({
      exportedAt: new Date().toISOString(),
      edition: { id: editionId, name: edition.name, slug: edition.slug, series: edition.series?.name ?? null },
      rootFolder: root.name,
      systemFolders: Object.fromEntries(Object.entries(folders).map(([k, v]) => [k, v.name])),
      summary: { totalAssets: assets.length, embedded, externalDownloaded: linked, externalFallbackUrl: failed },
      assets: manifest,
    }, null, 2));

    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `medya-arsivi-${slugifyName(edition.slug)}-${stamp}.zip`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ZIP üretilemedi" }, { status: 500 });
  }
}
