import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// N-10: ENVANTER → REPO ZİNCİRİ — envanterdeki her rota dosyası
// (a) diskte VAR, (b) gitignore kurbanı DEĞİL, (c) git tarafından İZLENİYOR olmalı.
// Kök neden dersi (M-05): dosya diskte olup .gitignore kurbanı olduğunda yerel
// kapılar yeşil kalır ama CI (temiz klon) ENOENT ile kırmızı olur.
// Bu test o sınıfı kalıcı olarak kapatır.

const scriptPath = path.resolve("scripts/route-policy.mjs");

async function loadDefinitions() {
  const mod = await import(pathToFileURL(scriptPath).href);
  return mod.ROUTE_POLICY_DEFINITIONS;
}

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...opts });
}

test("N-10 - envanter rotaları: diskte var + ignore edilmemiş + git'te izleniyor", async () => {
  const defs = await loadDefinitions();
  const files = Object.keys(defs);
  assert.ok(files.length > 150, "envanter beklenenden küçük: " + files.length);

  const missing = files.filter((f) => !fs.existsSync(f));
  assert.deepStrictEqual(missing, [], "diskte olmayan envanter rotaları:\n" + missing.join("\n"));

  let ignored = [];
  try {
    const out = git(["check-ignore", "--no-index", "--stdin"], { input: files.join("\n") });
    ignored = out.split(/\r?\n/).filter(Boolean);
  } catch (e) {
    if (e.status !== 1) throw e; // 1 = hiçbiri ignore edilmiyor
    ignored = [];
  }
  assert.deepStrictEqual(ignored, [], "gitignore bu envanter rotalarını dışlıyor (CI'da ENOENT üretir):\n" + ignored.join("\n"));

  const tracked = new Set(git(["ls-files"]).split(/\r?\n/).filter(Boolean));
  const untracked = files.filter((f) => !tracked.has(f));
  assert.deepStrictEqual(untracked, [], "git'te izlenmeyen envanter rotaları (commit edilmemiş):\n" + untracked.join("\n"));
});
