import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const libPath = path.resolve("src/lib/privacy/masking.ts");

test("P14.1 - maskeleme ilkelleri: ad/e-posta/telefon/kurum deterministik maskelenir", async () => {
  const { maskName, maskEmail, maskPhone, maskCompany } = await import(pathToFileURL(libPath).href);

  assert.strictEqual(maskName("Ayşe", "Yılmaz"), "Ayşe Y.");
  assert.strictEqual(maskName("", ""), "—");
  assert.strictEqual(maskEmail("ayse@example.com"), "a•••@example.com");
  assert.strictEqual(maskEmail(null), "—");
  assert.strictEqual(maskPhone("+905321234567"), "••• ••• 45 67");
  assert.strictEqual(maskPhone(null), "—");
  assert.strictEqual(maskCompany("Acme Medikal A.Ş."), "A••• A.Ş.");
  assert.strictEqual(maskCompany(null), "—");
});

test("P14.1 - maskScanPerson: anonime maskeli, kadroya tam + masked bayrağı", async () => {
  const { maskScanPerson } = await import(pathToFileURL(libPath).href);
  const person = { id: "p1", firstName: "Ayşe", lastName: "Yılmaz", company: "Acme", title: "Dr." };

  const anon = maskScanPerson(person, { staffVerified: false });
  assert.strictEqual(anon.masked, true);
  assert.strictEqual(anon.name, "Ayşe Y.");
  assert.ok(!JSON.stringify(anon).includes("Yılmaz"), "soyadı sızmamalı");
  assert.strictEqual(anon.title, undefined, "unvan anonime verilmez");

  const staff = maskScanPerson(person, { staffVerified: true });
  assert.strictEqual(staff.masked, false);
  assert.strictEqual(staff.name, "Ayşe Yılmaz");
  assert.strictEqual(staff.title, "Dr.");
});

test("P14.1 - scan route anonime maskeli yanıt verir, kadroya tam (kablo)", async () => {
  const src = fs.readFileSync(path.resolve("src/app/api/scan/route.ts"), "utf8");
  assert.ok(src.includes("maskScanPerson"), "scan maskeleme lib'ini kullanmalı");
  assert.ok(src.includes("requestActor") || src.includes("STAFF"), "scan kadro bağlamını okumalı");
  assert.ok(src.includes("masked"), "yanıt masked bayrağı taşımalı");
});

test("P14.1 - saha UI maskeli kartı ayrı gösterir", async () => {
  const src = fs.readFileSync(path.resolve("src/components/maven/views/onsite.tsx"), "utf8");
  assert.ok(src.includes("masked"), "onsite görünümü masked bayrağını işlemeli");
});
