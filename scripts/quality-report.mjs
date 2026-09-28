#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const isJson = process.argv.includes("--json");
const simulateFailure = process.argv.includes("--simulate-gate-failure");

const gates = [
  {
    name: "typecheck",
    description: "TypeScript tip doğrulaması (noEmit)",
    command: process.execPath,
    args: ["./node_modules/typescript/bin/tsc", "--noEmit"],
  },
  {
    name: "lint",
    description: "ESLint statik kod analizi",
    command: process.execPath,
    args: ["./node_modules/eslint/bin/eslint.js", "."],
  },
  {
    name: "i18n",
    description: "Hard-coded metin taraması",
    command: process.execPath,
    args: ["scripts/i18n-hardcoded-scan.mjs"],
  },
  {
    name: "tests:mini",
    description: "Karakterizasyon, hijyen ve envanter testleri",
    command: process.execPath,
    args: [
      "--test",
      "tests-mini/inventory-determinism.test.mjs",
      "tests-mini/hygiene.test.mjs",
    ],
  },
];

if (simulateFailure) {
  gates.push({
    name: "simulated:gate",
    description: "Kırık fixture / başarısızlık simülasyonu",
    command: process.execPath,
    args: ["-e", "process.exit(1);"],
  });
}

function runGate(gate) {
  const start = Date.now();
  const res = spawnSync(gate.command, gate.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  const durationMs = Date.now() - start;
  const exitCode = res.status ?? (res.error ? 1 : 0);
  const passed = exitCode === 0;

  let snippet = "";
  if (!passed) {
    const raw = (res.stderr || res.stdout || "").trim();
    const lines = raw.split("\n").filter(Boolean);
    snippet = lines.slice(-5).join(" | ").slice(0, 180);
  }

  return {
    name: gate.name,
    description: gate.description,
    command: `${gate.command} ${gate.args.join(" ")}`,
    exitCode,
    passed,
    durationMs,
    snippet,
  };
}

const results = [];
let hasFailure = false;

for (const gate of gates) {
  const res = runGate(gate);
  results.push(res);
  if (!res.passed) {
    hasFailure = true;
  }
}

const totalDurationMs = results.reduce((acc, r) => acc + r.durationMs, 0);
const passedCount = results.filter((r) => r.passed).length;
const failedCount = results.filter((r) => !r.passed).length;

const reportData = {
  timestamp: new Date().toISOString(),
  hasFailure,
  counts: {
    total: results.length,
    passed: passedCount,
    failed: failedCount,
  },
  totalDurationMs,
  gates: results,
};

if (isJson) {
  console.log(JSON.stringify(reportData, null, 2));
} else {
  console.log(`\n===============================================================`);
  console.log(`  Maven Event Management v2 — Kalite Raporu (Quality Report)`);
  console.log(`===============================================================\n`);
  console.log(
    `Kapı Adı`.padEnd(16) +
      `Durum`.padEnd(10) +
      `Exit`.padEnd(8) +
      `Süre`.padEnd(10) +
      `Açıklama / Hata Özeti`
  );
  console.log("-".repeat(78));

  for (const r of results) {
    const statusStr = r.passed ? "✔ PASS" : "✘ FAIL";
    const exitStr = String(r.exitCode);
    const durStr = `${r.durationMs}ms`;
    const note = r.passed ? r.description : r.snippet || r.description;
    console.log(
      r.name.padEnd(16) +
        statusStr.padEnd(10) +
        exitStr.padEnd(8) +
        durStr.padEnd(10) +
        note
    );
  }

  console.log("-".repeat(78));
  console.log(
    `Toplam: ${results.length} kapı | Geçti: ${passedCount} | Başarısız: ${failedCount} | Süre: ${totalDurationMs}ms\n`
  );

  if (hasFailure) {
    console.error(
      `[FAIL-CLOSED] Kalite kapılarında başarısızlık tespit edildi. Exit code: 1`
    );
  } else {
    console.log(`[PASS] Tüm kalite kapıları başarıyla tamamlandı.`);
  }
}

process.exit(hasFailure ? 1 : 0);
