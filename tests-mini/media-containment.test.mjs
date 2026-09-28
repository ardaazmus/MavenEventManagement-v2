import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import JSZip from "jszip";

const libPath = path.resolve("src/lib/media/archive.ts");

function asset(over) {
  return {
    id: `a-${Math.random().toString(36).slice(2, 8)}`,
    name: "dosya.png",
    kind: "IMAGE",
    mimeType: "image/png",
    sizeKb: 12,
    dataUrl: null,
    externalUrl: null,
    tags: null,
    linkedType: null,
    linkedId: null,
    folderId: null,
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    ...over,
  };
}

function frame(over = {}) {
  return {
    edition: { id: "ed-1", name: "Zirve", slug: "zirve-2026", seriesName: "Seri" },
    rootFolder: { id: "root", name: "Medya", parentId: null },
    folders: [],
    systemFolders: { PHOTOS: "Fotograflar" },
    ...over,
  };
}

test("P14.1 - bayrak kapalıyken dış URL'lere SIFIR istek; hepsi .url olur", async () => {
  const { buildMediaArchive, mediaExportFetchExternal } = await import(pathToFileURL(libPath).href);
  assert.strictEqual(mediaExportFetchExternal({}), false, "güvenli varsayılan: kapalı");
  assert.strictEqual(mediaExportFetchExternal({ MEDIA_EXPORT_FETCH_EXTERNAL: "on" }), true);
  assert.strictEqual(mediaExportFetchExternal({ MEDIA_EXPORT_FETCH_EXTERNAL: "yes" }), false, "yalnız on açar");

  let calls = 0;
  const built = await buildMediaArchive(
    frame({
      assets: [
        asset({ name: "gizli.png", externalUrl: "http://169.254.169.254/meta" }),
        asset({ name: "acik.png", externalUrl: "https://cdn.ornek.net/x.png" }),
        asset({ name: "gomulu.png", dataUrl: "data:image/png;base64,aGk=" }),
      ],
      fetchExternal: false,
      fetchOne: async () => { calls++; return { bytes: Buffer.from("x"), contentType: "image/png" }; },
    }),
  );
  assert.strictEqual(calls, 0, "bayrak kapalıyken indirme denenmemeli");
  assert.deepStrictEqual(built.summary, { totalAssets: 3, embedded: 1, externalDownloaded: 0, externalFallbackUrl: 2 });

  const zip = await JSZip.loadAsync(built.buffer);
  const names = Object.keys(zip.files);
  assert.ok(names.includes("Medya/gizli.png.url"), `.url bırakılmalı: ${names.join(",")}`);
  assert.ok(names.includes("Medya/acik.png.url"));
  assert.ok(names.includes("Medya/gomulu.png"));
  assert.ok(names.includes("Medya/manifest.json"));
  const shortcut = await zip.file("Medya/acik.png.url").async("string");
  assert.ok(shortcut.includes("URL=https://cdn.ornek.net/x.png"), "dış bağlantı korunmalı");
});

test("P14.1 - bayrak açıkken indirme denenir; varsayılan yol doğrulayıcıdan geçer", async () => {
  const { buildMediaArchive } = await import(pathToFileURL(libPath).href);
  const seen = [];
  const built = await buildMediaArchive(
    frame({
      assets: [
        asset({ name: "ok.png", externalUrl: "https://cdn.ornek.net/ok.png" }),
        asset({ name: "bozuk.png", externalUrl: "https://cdn.ornek.net/bozuk.png" }),
      ],
      fetchExternal: true,
      fetchOne: async (url) => {
        seen.push(url);
        if (url.includes("bozuk")) throw new Error("404");
        return { bytes: Buffer.from("BYTES"), contentType: "image/png" };
      },
    }),
  );
  assert.deepStrictEqual(seen, ["https://cdn.ornek.net/ok.png", "https://cdn.ornek.net/bozuk.png"]);
  assert.strictEqual(built.summary.externalDownloaded, 1);
  assert.strictEqual(built.summary.externalFallbackUrl, 1);
  const zip = await JSZip.loadAsync(built.buffer);
  assert.ok(zip.files["Medya/ok.png"], "indirilen gömülmeli");
  assert.ok(zip.files["Medya/bozuk.png.url"], "başarısız indirme .url'ye düşmeli");

  // Varsayılan fetchOne (fetchValidated): sahte DNS özel IP döndürürse ağa çıkılmaz.
  const built2 = await buildMediaArchive(
    frame({
      assets: [asset({ name: "rebind.png", externalUrl: "https://tuzak.ornek.net/x.png" })],
      fetchExternal: true,
      dnsLookup: async () => ["10.1.2.3"],
    }),
  );
  assert.strictEqual(built2.summary.externalDownloaded, 0);
  assert.strictEqual(built2.summary.externalFallbackUrl, 1);
});

test("P14.1 - üretim bütçesi (deadline) aşılırsa arşiv iptal olur", async () => {
  const { buildMediaArchive, ArchiveDeadlineError } = await import(pathToFileURL(libPath).href);
  let now = 1000;
  await assert.rejects(
    () =>
      buildMediaArchive(
        frame({
          assets: [asset({ name: "yavas.png", externalUrl: "https://cdn.ornek.net/y.png" })],
          fetchExternal: true,
          deadlineMs: 50,
          now: () => now,
          fetchOne: async () => { now += 5000; return { bytes: Buffer.from("x"), contentType: "image/png" }; },
        }),
      ),
    (e) => e instanceof ArchiveDeadlineError,
  );
});

test("P14.1 - rota kablosu: üretici + bayrak kullanılır, ham fetch kalmaz", async () => {
  const src = fs.readFileSync(path.resolve("src/app/api/media/export/route.ts"), "utf8");
  assert.ok(src.includes("buildMediaArchive"), "rota paylaşılan üreticiyi kullanmalı");
  assert.ok(src.includes("mediaExportFetchExternal"), "rota bayrağı okumalı");
  assert.ok(!src.includes("isPublicHttpUrl"), "yerel SSRF filtresi doğrulayıcıya taşınmalı");
  assert.ok(!src.match(/(^|[^A-Za-z])fetch\(/), "rotada ham fetch kalmamalı");
  assert.ok(src.includes("requireStaff"), "kadro kapısı korunmalı");
  assert.ok(src.includes("logExport"), "denetim günlüğü korunmalı");
});
