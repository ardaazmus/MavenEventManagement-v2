// ONE-OFF key-usage check (TASK-B 18-19-20 gate) — run: node tool-results/compliance-gates/keycheck.mjs
// Extracts every compliance.* literal from compliance.tsx and asserts each exists in BOTH
// fragment JSONs. Also verifies dynamic enum families and t() var placeholders.
import { readFileSync } from "node:fs";

const view = readFileSync("/home/z/my-project/src/components/maven/views/compliance.tsx", "utf8");
const tr = JSON.parse(readFileSync("/home/z/my-project/src/i18n/_new/compliance.tr.json", "utf8"));
const en = JSON.parse(readFileSync("/home/z/my-project/src/i18n/_new/compliance.en.json", "utf8"));

// flatten nested dict → dotted leaf keys
const flat = (obj, pfx = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flat(v, `${pfx}${k}.`) : [`${pfx}${k}`],
  );
const trKeys = new Set(flat(tr));
const enKeys = new Set(flat(en));

// all compliance.* literals appearing anywhere in the view (t() calls, KEY maps, dynamic-family bases)
const hits = [...new Set(view.match(/compliance\.[A-Za-z0-9_.]+/g) ?? [])]
  .map((k) => (k.endsWith(".") ? k.slice(0, -1) : k)) // `compliance.jrJur.${x}` şablonlarının ön-ekleri
  .filter((k) => !k.endsWith(".")) // soyut aile ön-ekleri (variant'ları dynKeys kapsar)
  .sort();

// dynamic template keys: `compliance.jrJur.${j.jurisdiction}` etc. → their enum variants
// (not: `compliance.jrJur` tek başına yaprak DEĞİL — soyut aile ön-ekidir, variant'ları aşağıda listelenir)
const ABSTRACT_FAMILIES = new Set(["compliance.jrJur", "compliance.jrCookie", "compliance.jrTransfer"]);
const dynFamilies = [
  { re: /`compliance\.jrJur\.\$\{[^}]+\}`/g, variants: ["compliance.jrJur.TR", "compliance.jrJur.EU", "compliance.jrJur.CUSTOM"] },
  { re: /`compliance\.jrCookie\.\$\{[^}]+\}`/g, variants: ["compliance.jrCookie.STRICT", "compliance.jrCookie.OPT_OUT"] },
  { re: /`compliance\.jrTransfer\.\$\{[^}]+\}`/g, variants: ["compliance.jrTransfer.BOARD_AUTHORIZATION", "compliance.jrTransfer.SCC", "compliance.jrTransfer.ADEQUACY"] },
];
const dynKeys = dynFamilies.flatMap((f) => (view.match(f.re) ? f.variants : []));

const all = [...new Set([...hits, ...dynKeys, "modules.compliance"])].filter((k) => !ABSTRACT_FAMILIES.has(k));
const missingTr = all.filter((k) => !trKeys.has(k));
const missingEn = all.filter((k) => !enKeys.has(k));

// unused-in-view keys (informational)
const usedSet = new Set(all);
const unusedTr = [...trKeys].filter((k) => !usedSet.has(k));

console.log(`keys referenced in compliance.tsx (literals + dynamic variants + modules.compliance): ${all.length}`);
console.log(`fragment TR leaves: ${trKeys.size} · fragment EN leaves: ${enKeys.size}`);
console.log(`missing in TR: ${missingTr.length}${missingTr.length ? " → " + missingTr.join(", ") : ""}`);
console.log(`missing in EN: ${missingEn.length}${missingEn.length ? " → " + missingEn.join(", ") : ""}`);
console.log(`TR/EN key parity: ${trKeys.size === enKeys.size && [...trKeys].every((k) => enKeys.has(k)) ? "OK" : "MISMATCH"}`);
console.log(`unused fragment keys (informational): ${unusedTr.length} → ${unusedTr.join(", ") || "none"}`);
console.log(missingTr.length === 0 && missingEn.length === 0 ? "RESULT: ALL-COVERED ✓" : "RESULT: FAIL ✗");

// placeholder sanity: t("..", { x }) keys must contain {x} in the TR value
const varCalls = [...view.matchAll(/t\("([a-z.A-Z0-9]+)",\s*\{([^}]*)\}\)/g)];
let phOk = true;
for (const [, key, vars] of varCalls) {
  const names = [...vars.matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
  const dictVal = lookup(tr, key) ?? "";
  for (const n of names) {
    if (!dictVal.includes(`{${n}}`)) {
      phOk = false;
      console.log(`PLACEHOLDER MISMATCH: ${key} expects {${n}} — TR value: "${dictVal}"`);
    }
  }
}
console.log(`placeholder check: ${phOk ? "OK" : "FAIL"}`);

function lookup(obj, path) {
  let acc = obj;
  for (const p of path.split(".")) {
    if (acc && typeof acc === "object" && p in acc) acc = acc[p];
    else return undefined;
  }
  return typeof acc === "string" ? acc : undefined;
}
