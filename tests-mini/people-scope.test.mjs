import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const libPath = path.resolve("src/lib/people/directory.ts");

async function setup(tag) {
  const iso = await createIsolatedTestDb(`p16-${tag}`);
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p16-${tag}-${uniq}` } });
  const other = await iso.prisma.tenant.create({ data: { name: "X", slug: `t-p16x-${tag}-${uniq}` } });
  const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-p16-${tag}-${uniq}` } });
  return { iso, tenant, other, edition };
}

test("P16.3 - normalizasyon: e-posta/ad/telefon/kurum", async () => {
  const { normalizeEmail, normalizeName, normalizePhone, normalizeOrg } = await import(pathToFileURL(libPath).href);
  assert.strictEqual(normalizeEmail("  Ayse.YILMAZ@Ornek.NET "), "ayse.yilmaz@ornek.net");
  assert.strictEqual(normalizeEmail("e-postasız"), null);
  assert.strictEqual(normalizeEmail(null), null);
  assert.strictEqual(normalizeName("  AYŞE  "), "ayşe");
  assert.strictEqual(normalizePhone("+90 (532) 111 22 33"), "5321112233");
  assert.strictEqual(normalizePhone("05321112233"), "5321112233");
  assert.strictEqual(normalizeOrg("Acme Ltd. Şti."), "acme");
  assert.strictEqual(normalizeOrg("  MAVEN  A.Ş. "), "maven");
});

test("P16.3 - hızlı ekleme: oluşturma, kesin-eşleşmede ilişki, bulanıkta aday", async () => {
  const { quickAddPerson } = await import(pathToFileURL(libPath).href);
  const ctx = await setup("quick");
  try {
    // Temiz kayıt → created (+edisyon ilişkisi).
    const r1 = await quickAddPerson(ctx.iso.prisma, {
      tenantId: ctx.tenant.id, firstName: "Ayşe", lastName: "Yılmaz", email: "Ayse@ornek.net",
      phone: "+90 532 111 22 33", company: "Acme", editionId: ctx.edition.id,
    });
    assert.strictEqual(r1.outcome, "created");
    assert.strictEqual(r1.person.email, "ayse@ornek.net", "e-posta normalize saklanmalı");
    assert.ok(r1.participation, "edisyon ilişkisi kurulmalı");

    // Aynı e-posta (farklı yazım) → attached, master KOPYALANMAZ.
    const before = await ctx.iso.prisma.person.count({ where: { tenantId: ctx.tenant.id } });
    const r2 = await quickAddPerson(ctx.iso.prisma, {
      tenantId: ctx.tenant.id, firstName: "AYŞE", lastName: "YILMAZ", email: " ayse@ORNEK.net ", editionId: ctx.edition.id,
    });
    assert.strictEqual(r2.outcome, "attached");
    assert.strictEqual(r2.person.id, r1.person.id);
    assert.strictEqual(r2.createdRelation, false, "ilişki zaten vardı");
    const after = await ctx.iso.prisma.person.count({ where: { tenantId: ctx.tenant.id } });
    assert.strictEqual(after, before, "kesin eşleşmede yeni master açılmamalı");

    // Bulanık eşleşme (ad+telefon) → duplicate, OTOMATİK yazma yok.
    const r3 = await quickAddPerson(ctx.iso.prisma, {
      tenantId: ctx.tenant.id, firstName: "Ayşe", lastName: "Yılmaz", phone: "05321112233",
    });
    assert.strictEqual(r3.outcome, "duplicate");
    assert.strictEqual(r3.candidates.length, 1);
    assert.strictEqual(r3.candidates[0].reason, "NAME_PHONE");
    const afterFuzzy = await ctx.iso.prisma.person.count({ where: { tenantId: ctx.tenant.id } });
    assert.strictEqual(afterFuzzy, before, "aday varken otomatik oluşturulmamalı");

    // Kurum eşleşmesi → NAME_ORG adayı.
    const r4 = await quickAddPerson(ctx.iso.prisma, {
      tenantId: ctx.tenant.id, firstName: "Ayşe", lastName: "Yılmaz", company: "ACME Ltd.",
    });
    assert.strictEqual(r4.outcome, "duplicate");
    assert.strictEqual(r4.candidates[0].reason, "NAME_ORG");

    // Biçimsiz e-posta 422.
    const { PeopleScopeError } = await import(pathToFileURL(libPath).href);
    await assert.rejects(
      () => quickAddPerson(ctx.iso.prisma, { tenantId: ctx.tenant.id, firstName: "X", lastName: "Y", email: "bozuk" }),
      (e) => e instanceof PeopleScopeError && e.status === 422,
    );
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P16.1/P16.2 - rehber ve etkinlik listesi kiracı-kapsamlı; çapraz sızıntı yok", async () => {
  const { listDirectory, listEventPeople, attachToEdition, PeopleScopeError } = await import(pathToFileURL(libPath).href);
  const ctx = await setup("leak");
  try {
    const mine = await ctx.iso.prisma.person.create({ data: { tenantId: ctx.tenant.id, firstName: "Ben", lastName: "im", email: "ben@ornek.net" } });
    await ctx.iso.prisma.person.create({ data: { tenantId: ctx.other.id, firstName: "El", lastName: "Kişi", email: "el@baska.net" } });
    await attachToEdition(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id, personId: mine.id });

    const dir = await listDirectory(ctx.iso.prisma, { tenantId: ctx.tenant.id });
    assert.strictEqual(dir.items.length, 1);
    assert.strictEqual(dir.items[0].id, mine.id);
    const dirQ = await listDirectory(ctx.iso.prisma, { tenantId: ctx.tenant.id, q: "EL@" });
    assert.strictEqual(dirQ.items.length, 0, "komşu kiracı aramada görünmemeli");

    const ev = await listEventPeople(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id });
    assert.strictEqual(ev.items.length, 1);
    assert.strictEqual(ev.items[0].person.id, mine.id);
    assert.strictEqual(ev.items[0].participation.personId, mine.id);

    // Yabancı edisyona liste/ilişki girişimi 404.
    const foreignEdition = await ctx.iso.prisma.eventEdition.create({ data: { tenantId: ctx.other.id, name: "F", slug: `e-p16f-${Date.now()}` } });
    await assert.rejects(() => listEventPeople(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: foreignEdition.id }), (e) => e instanceof PeopleScopeError && e.status === 404);
    await assert.rejects(
      () => attachToEdition(ctx.iso.prisma, { tenantId: ctx.other.id, editionId: foreignEdition.id, personId: mine.id }),
      (e) => e instanceof PeopleScopeError && e.status === 404,
    );
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P16.2 - etkinliğe ekle kopyalamaz; çıkar master'ı silmez", async () => {
  const { attachToEdition, detachFromEdition } = await import(pathToFileURL(libPath).href);
  const ctx = await setup("attach");
  try {
    const p = await ctx.iso.prisma.person.create({ data: { tenantId: ctx.tenant.id, firstName: "Ali", lastName: "Veli" } });
    const first = await attachToEdition(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id, personId: p.id });
    assert.strictEqual(first.created, true);
    const again = await attachToEdition(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id, personId: p.id });
    assert.strictEqual(again.created, false, "ilişki tekilliği korunur");
    assert.strictEqual(again.participation.id, first.participation.id);
    assert.strictEqual(await ctx.iso.prisma.person.count({ where: { tenantId: ctx.tenant.id } }), 1, "ekleme master kopyalamaz");

    const out = await detachFromEdition(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id, personId: p.id });
    assert.strictEqual(out.detached, true);
    assert.strictEqual(await ctx.iso.prisma.eventParticipation.count({ where: { editionId: ctx.edition.id } }), 0);
    const master = await ctx.iso.prisma.person.findUnique({ where: { id: p.id } });
    assert.ok(master, "etkinlikten çıkarma master'ı silmemeli");

    const noop = await detachFromEdition(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id, personId: p.id });
    assert.strictEqual(noop.detached, false);
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P16.1 - rehber sayfalama imleci kararlı; MERGED varsayılan gizli", async () => {
  const { listDirectory } = await import(pathToFileURL(libPath).href);
  const ctx = await setup("page");
  try {
    for (let i = 0; i < 5; i++) {
      await ctx.iso.prisma.person.create({ data: { tenantId: ctx.tenant.id, firstName: `K${i}`, lastName: "Test", email: `k${i}@ornek.net` } });
    }
    await ctx.iso.prisma.person.create({ data: { tenantId: ctx.tenant.id, firstName: "Eski", lastName: "Kayıt", status: "MERGED", mergedIntoId: "x" } });
    const p1 = await listDirectory(ctx.iso.prisma, { tenantId: ctx.tenant.id, limit: 2 });
    assert.strictEqual(p1.items.length, 2);
    assert.ok(p1.nextCursor);
    const p2 = await listDirectory(ctx.iso.prisma, { tenantId: ctx.tenant.id, limit: 2, cursor: p1.nextCursor });
    const p3 = await listDirectory(ctx.iso.prisma, { tenantId: ctx.tenant.id, limit: 2, cursor: p2.nextCursor });
    const ids = [...p1.items, ...p2.items, ...p3.items].map((r) => r.id);
    assert.strictEqual(new Set(ids).size, 5, "sayfalar çakışmamalı, kayıp olmamalı");
    assert.strictEqual(p3.nextCursor, null, "son sayfada imleç bitmeli");
    assert.ok(!ids.includes((await ctx.iso.prisma.person.findFirst({ where: { tenantId: ctx.tenant.id, status: "MERGED" } })).id), "MERGED varsayılan gizli");
    const withMerged = await listDirectory(ctx.iso.prisma, { tenantId: ctx.tenant.id, includeMerged: true, limit: 10 });
    assert.strictEqual(withMerged.items.length, 6);
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P16 - rota kablosu: rehber/etkinlik/hızlı-ekle/ilişki uçları", async () => {
  const dir = fs.readFileSync(path.resolve("src/app/api/people/directory/route.ts"), "utf8");
  assert.ok(dir.includes("requireStaff") && dir.includes("listDirectory") && dir.includes("resolveContext"));
  const ev = fs.readFileSync(path.resolve("src/app/api/people/event/route.ts"), "utf8");
  assert.ok(ev.includes("verifyEditionTenant") && ev.includes("listEventPeople"));
  const qa = fs.readFileSync(path.resolve("src/app/api/people/quick-add/route.ts"), "utf8");
  assert.ok(qa.includes("quickAddPerson") && qa.includes("duplicate") && qa.includes("201"));
  const at = fs.readFileSync(path.resolve("src/app/api/people/attach/route.ts"), "utf8");
  assert.ok(at.includes("attachToEdition") && at.includes("detachFromEdition"));
  const view = fs.readFileSync(path.resolve("src/components/maven/views/people.tsx"), "utf8");
  assert.ok(view.includes("peopleScope") || view.includes("rehber"), "görünüm kapsam sekmesi sunmalı");
  assert.ok(view.includes("/api/people/quick-add") || view.includes("quick-add"), "görünüm hızlı eklemeyi kullanmalı");
});
