// ─── P14.1: Medya arşiv üreticisi — acil containment ───────────────────────────
// Yol haritası: dış URL'ler indirilmek yerine `.url` manifestine yazılır;
// indirme yalnız MEDIA_EXPORT_FETCH_EXTERNAL=on bayrağıyla açılır (güvenli
// varsayılan: kapalı). Bayrak açıkken bile indirme P14.2 doğrulayıcısından
// geçer; başarısızlıkta güvenli `.url` bırakma. Üretim bütçesi deadlineMs
// ile sınırlıdır (süre üst sınırı).
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.
import JSZip from "jszip";
import { fetchValidated, type DnsLookup } from "./ingestion.ts";

export class ArchiveDeadlineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveDeadlineError";
  }
}

export function mediaExportFetchExternal(env: Record<string, string | undefined> = process.env): boolean {
  return (env.MEDIA_EXPORT_FETCH_EXTERNAL ?? "").trim().toLowerCase() === "on";
}

export function mediaExportDeadlineMs(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.MEDIA_EXPORT_DEADLINE_MS ?? "");
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 300_000);
  return 60_000;
}

export function safeEntryName(name: string): string {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "varlik";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").trim();
  return cleaned || "varlik";
}

const TR_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  Ç: "C", Ğ: "G", İ: "I", Ö: "O", Ş: "S", Ü: "U",
};

export function safeDirSegment(name: string): string {
  return String(name ?? "")
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => TR_MAP[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/[^a-z0-9-]/g, "") || "klasor";
}

export interface ArchiveAsset {
  id: string;
  name: string;
  kind: string;
  mimeType: string | null;
  sizeKb: number | null;
  dataUrl: string | null;
  externalUrl: string | null;
  tags: string | null;
  linkedType: string | null;
  linkedId: string | null;
  folderId: string | null;
  createdAt: Date;
}

export interface ArchiveFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ArchiveEdition {
  id: string;
  name: string;
  slug: string;
  seriesName: string | null;
}

export type FetchOne = (url: string) => Promise<{ bytes: Buffer; contentType: string }>;

export interface BuildArchiveOptions {
  edition: ArchiveEdition;
  rootFolder: ArchiveFolder;
  folders: ArchiveFolder[];
  systemFolders: Record<string, string>;
  assets: ArchiveAsset[];
  fetchExternal: boolean;
  fetchOne?: FetchOne;
  dnsLookup?: DnsLookup;
  deadlineMs?: number;
  now?: () => number;
}

export interface ArchiveSummary {
  totalAssets: number;
  embedded: number;
  externalDownloaded: number;
  externalFallbackUrl: number;
}

export interface BuiltArchive {
  buffer: Buffer;
  summary: ArchiveSummary;
  manifest: Array<Record<string, unknown>>;
}

export async function buildMediaArchive(opts: BuildArchiveOptions): Promise<BuiltArchive> {
  const now = opts.now ?? Date.now;
  const deadlineMs = opts.deadlineMs ?? 60_000;
  const started = now();
  const checkDeadline = () => {
    if (now() - started > deadlineMs) {
      throw new ArchiveDeadlineError(`Medya arşiv bütçesi aşıldı (>${deadlineMs}ms)`);
    }
  };
  const fetchOne: FetchOne =
    opts.fetchOne ??
    (async (url: string) => {
      const got = await fetchValidated(url, { dnsLookup: opts.dnsLookup });
      return { bytes: got.bytes, contentType: got.contentType };
    });

  const zip = new JSZip();
  const rootDir = zip.folder("Medya")!;
  const dirOf = new Map<string, JSZip>();
  dirOf.set(opts.rootFolder.id, rootDir);
  for (const f of opts.folders) {
    if (f.id === opts.rootFolder.id) continue;
    const parentDir = f.parentId ? (dirOf.get(f.parentId) ?? rootDir) : rootDir;
    dirOf.set(f.id, parentDir.folder(safeDirSegment(f.name))!);
  }

  const manifest: Array<Record<string, unknown>> = [];
  let embedded = 0;
  let externalDownloaded = 0;
  let externalFallbackUrl = 0;

  for (const a of opts.assets) {
    checkDeadline();
    const dir = (a.folderId ? dirOf.get(a.folderId) : rootDir) ?? rootDir;
    manifest.push({
      name: a.name,
      kind: a.kind,
      mimeType: a.mimeType,
      sizeKb: a.sizeKb,
      tags: a.tags,
      linkedType: a.linkedType,
      linkedId: a.linkedId,
      createdAt: a.createdAt.toISOString(),
      source: a.dataUrl ? "embedded" : a.externalUrl ? "external" : "none",
      folder: opts.folders.find((f) => f.id === a.folderId)?.name ?? opts.rootFolder.name,
    });

    if (a.dataUrl && a.dataUrl.startsWith("data:")) {
      const base64 = a.dataUrl.slice(a.dataUrl.indexOf(",") + 1);
      dir.file(safeEntryName(a.name), base64, { base64: true });
      embedded++;
    } else if (a.externalUrl) {
      let stored = false;
      if (opts.fetchExternal) {
        try {
          const got = await fetchOne(a.externalUrl);
          dir.file(safeEntryName(a.name), got.bytes);
          externalDownloaded++;
          stored = true;
        } catch {
          stored = false;
        }
      }
      if (!stored) {
        // P14.1 containment: dış bağlantı ASLA kaybolmaz — `.url` kısayolu bırakılır.
        dir.file(`${safeEntryName(a.name)}.url`, `[InternetShortcut]\nURL=${a.externalUrl}\n`);
        externalFallbackUrl++;
      }
    }
  }

  checkDeadline();
  rootDir.file(
    "manifest.json",
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        edition: { id: opts.edition.id, name: opts.edition.name, slug: opts.edition.slug, series: opts.edition.seriesName },
        rootFolder: opts.rootFolder.name,
        systemFolders: opts.systemFolders,
        summary: { totalAssets: opts.assets.length, embedded, externalDownloaded, externalFallbackUrl },
        assets: manifest,
      },
      null,
      2,
    ),
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, summary: { totalAssets: opts.assets.length, embedded, externalDownloaded, externalFallbackUrl }, manifest };
}
