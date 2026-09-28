import test from "node:test";
import assert from "node:assert/strict";

// N-05 kilitleri: SheetJS 0.18.5 (npm) CVE-2023-30533 (prototype pollution) +
// CVE-2024-22363 (ReDoS) taşır; düzeltme yalnız resmi 0.20.x derlemesindedir.
// Bağımlılık: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

test("N05-1 - kurulu xlsx 0.20.3+ resmi derlemedir", async () => {
  const XLSX = await import("xlsx");
  const [maj, min, patch] = String(XLSX.version).split(".").map(Number);
  assert.ok(maj > 0 || min > 20 || (min === 20 && patch >= 3), `xlsx sürümü 0.20.3+ olmalı, görülen: ${XLSX.version}`);
});

test("N05-2 - CVE-2023-30533: __proto__ başlıklı sayfa Object.prototype kirletmez", async () => {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([
    ["__proto__", "ad"],
    ["polluted", "E2E"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sayfa1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  // istemci import akışının BİREBİR çağrı şekli (sheetRows:1005 + defval/raw)
  const back = XLSX.read(buf, { type: "buffer", sheetRows: 1005 });
  const rows = XLSX.utils.sheet_to_json(back.Sheets.Sayfa1, { defval: "", raw: false });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(Object.prototype.polluted, undefined);
  assert.strictEqual({}.polluted, undefined);
  delete Object.prototype.polluted;
});

test("N05-3 - istemci+suncu çağrı şekilleri 0.20.x ile uyumludur (round-trip)", async () => {
  const XLSX = await import("xlsx");
  // sunucu: json_to_sheet + book_append_sheet + write(buffer)
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ a: 1, b: "x" }]), "Veri");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  assert.ok(Buffer.isBuffer(buf) && buf.length > 0);
  // istemci: read(array) + sheet_to_json
  const u8 = new Uint8Array(buf);
  const back = XLSX.read(u8, { type: "array", sheetRows: 1005 });
  const rows = XLSX.utils.sheet_to_json(back.Sheets.Veri, { defval: "", raw: false });
  assert.deepStrictEqual(rows, [{ a: "1", b: "x" }]);
  // encode_col/decode_range (muhasebe dışa-aktarımı kullanır)
  assert.strictEqual(XLSX.utils.encode_col(27), "AB");
  assert.deepStrictEqual(XLSX.utils.decode_range("A1:B2"), { s: { c: 0, r: 0 }, e: { c: 1, r: 1 } });
});
