import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const builderPath = path.resolve("src/lib/exports/registrations-xlsx.ts");

test("P14.3b - paylaşılan xlsx üretici: geçerli dosya + rıza filtresi (DB)", async () => {
  const { buildRegistrationsXlsx } = await import(pathToFileURL(builderPath).href);
  const XLSX = await import("xlsx");
  const iso = await createIsolatedTestDb("p14-3b");
  try {
    const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p143b-${Date.now()}` } });
    const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-p143b-${Date.now()}` } });
    const mk = async (consent) => {
      const person = await iso.prisma.person.create({
        data: { tenantId: tenant.id, firstName: "P", lastName: consent ? "Rizali" : "Sessiz", ...(consent ? { consentVersion: "v3", consentAcceptedAt: new Date() } : {}) },
      });
      const part = await iso.prisma.eventParticipation.create({ data: { editionId: edition.id, personId: person.id } });
      await iso.prisma.registration.create({ data: { editionId: edition.id, participationId: part.id, status: "CONFIRMED" } });
    };
    await mk(true);
    await mk(false);

    const out = await buildRegistrationsXlsx(iso.prisma, { editionId: edition.id, status: "ALL", q: "", company: "", official: false });
    assert.strictEqual(out.count, 1, "rızasız kişi dosyada olmamalı");
    assert.match(out.filename, /\.xlsx$/);
    const wb = XLSX.read(out.buffer);
    assert.ok(wb.SheetNames.includes("Katılımcılar"), `beklenen sayfa yok: ${wb.SheetNames.join(",")}`);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    assert.ok(csv.includes("Rizali"), "rızalı kişi dosyada olmalı");
    assert.ok(!csv.includes("Sessiz"), "rızasız kişi dosyada olmamalı");

    const official = await buildRegistrationsXlsx(iso.prisma, { editionId: edition.id, status: "ALL", q: "", company: "", official: true });
    const wbOff = XLSX.read(official.buffer);
    assert.ok(wbOff.SheetNames.includes("Kayıt Onay Belgesi"));
  } finally {
    await iso.cleanup();
  }
});

test("P14.3b - doğrudan indirme 2000 satırda denetimli akışa yönlendirir (kablo)", async () => {
  const src = fs.readFileSync(path.resolve("src/app/api/registrations/export/route.ts"), "utf8");
  assert.ok(src.includes("buildRegistrationsXlsx"), "doğrudan uç paylaşılan üreticiyi kullanmalı");
  assert.ok(src.includes("2000") || src.includes("DIRECT_EXPORT_CAP"), "doğrudan indirme satır tavanı olmalı");
  assert.ok(src.includes("/api/exports"), "tavan aşımında denetimli akışa yönlendirme olmalı");
});

test("P14.3b - iş uçları: talep/kadar/jetonlu-dosya kablosu", async () => {
  const post = fs.readFileSync(path.resolve("src/app/api/exports/route.ts"), "utf8");
  assert.ok(post.includes("requireStaff"), "POST /api/exports kadro kapılı olmalı");
  assert.ok(post.includes("requestExport"), "POST iş defterini kullanmalı");

  const patch = fs.readFileSync(path.resolve("src/app/api/exports/[id]/route.ts"), "utf8");
  assert.ok(patch.includes("requireAdmin"), "PATCH yönetici kapılı olmalı");
  assert.ok(patch.includes("decideExport"), "PATCH karar lib'ini kullanmalı");

  const file = fs.readFileSync(path.resolve("src/app/api/exports/[id]/file/route.ts"), "utf8");
  assert.ok(file.includes("verifyDownloadToken"), "dosya ucu jeton doğrulamalı");
  assert.ok(file.includes("enforceRateLimit"), "dosya ucu hız sınırlı olmalı");
  assert.ok(file.includes("no-store"), "dosya yanıtı no-store olmalı");
  assert.ok(file.includes("recordDownload"), "indirme kayda geçmeli");
  assert.ok(!file.includes("requireStaff") && !file.includes("requireAdmin"), "dosya ucu jeton-kapılı (oturumsuz) olmalı");

  const mw = fs.readFileSync(path.resolve("src/middleware.ts"), "utf8");
  assert.ok(mw.includes("/api/exports/"), "middleware exports önekini açmalı (uç-seviyesi kapılarla)");
});

test("P14.3b - route-policy ihracat işi uçlarını sınıflandırır", async () => {
  const { ROUTE_POLICY_DEFINITIONS } = await import(pathToFileURL(path.resolve("scripts/route-policy.mjs")).href);
  assert.strictEqual(ROUTE_POLICY_DEFINITIONS["src/app/api/exports/route.ts"]?.category, "STAFF");
  assert.strictEqual(ROUTE_POLICY_DEFINITIONS["src/app/api/exports/[id]/route.ts"]?.category, "ADMIN");
  assert.strictEqual(ROUTE_POLICY_DEFINITIONS["src/app/api/exports/[id]/file/route.ts"]?.category, "PUBLIC");
});
