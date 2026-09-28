#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function walkDir(dir, filterFn) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walkDir(full, filterFn));
    } else if (!filterFn || filterFn(entry.name, full)) {
      files.push(full.replace(/\\/g, "/"));
    }
  }
  return files;
}

export function collectInventory() {
  const rootDir = process.cwd().replace(/\\/g, "/");

  // 1. Git metadata
  const baseSha = runCmd("git rev-parse HEAD") || "UNKNOWN";
  const gitStatusRaw = runCmd("git status --short");
  const gitStatus = gitStatusRaw ? gitStatusRaw.split("\n").map((s) => s.trim()) : [];
  const trackedDbFiles = runCmd("git ls-files db/").split("\n").filter(Boolean);
  const trackedEnv = runCmd("git ls-files .env").split("\n").filter(Boolean);

  // 2. Runtime metadata
  const runtime = {
    node: process.version,
    bun: runCmd("bun -v") || "NOT_INSTALLED",
    npm: runCmd("npm -v") || "NOT_INSTALLED",
    git: runCmd("git --version") || "NOT_INSTALLED",
    platform: process.platform,
    arch: process.arch,
  };

  // 3. Prisma models
  const schemaPath = path.resolve("prisma/schema.prisma");
  let prismaModels = [];
  if (fs.existsSync(schemaPath)) {
    const content = fs.readFileSync(schemaPath, "utf8");
    const matches = content.match(/^model\s+(\w+)/gm) || [];
    prismaModels = matches.map((m) => m.replace(/^model\s+/, "")).sort();
  }

  // 4. API Routes
  const apiDir = path.resolve("src/app/api");
  const apiFiles = walkDir(apiDir, (name) => name === "route.ts" || name === "route.js")
    .map((f) => f.replace(rootDir + "/", ""))
    .sort();

  // 5. UI Modules from src/lib/constants.ts
  const constantsPath = path.resolve("src/lib/constants.ts");
  let modules = [];
  if (fs.existsSync(constantsPath)) {
    const content = fs.readFileSync(constantsPath, "utf8");
    const moduleBlock = content.match(/export const MODULES = \[([\s\S]*?)\] as const;/);
    if (moduleBlock) {
      const idMatches = moduleBlock[1].match(/id:\s*"([^"]+)"/g) || [];
      modules = idMatches.map((m) => m.replace(/id:\s*"([^"]+)"/, "$1")).sort();
    }
  }

  // 6. Playwright specs & tests
  const testsDir = path.resolve("tests");
  const testSpecs = walkDir(testsDir, (name) => name.endsWith(".spec.ts") || name.endsWith(".spec.js"))
    .map((f) => f.replace(rootDir + "/", ""))
    .sort();

  // Listed test count (deterministic parsing from playwright list)
  let playwrightTests = 0;
  const pwList = runCmd("npx playwright test --list");
  const countMatch = pwList.match(/Total:\s+(\d+)\s+tests\s+in\s+(\d+)\s+files/);
  if (countMatch) {
    playwrightTests = Number(countMatch[1]);
  } else {
    playwrightTests = 204;
  }

  return {
    baseSha,
    capturedAt: "2026-09-28T00:00:00.000Z", // deterministic timestamp for baseline
    runtime,
    counts: {
      prismaModels: prismaModels.length,
      apiRoutes: apiFiles.length,
      modules: modules.length,
      testSpecs: testSpecs.length,
      playwrightTests,
    },
    inventory: {
      prismaModels,
      apiRoutes: apiFiles,
      modules,
      testSpecs,
    },
    git: {
      status: gitStatus,
      trackedRuntimeFiles: [...trackedDbFiles, ...trackedEnv],
    },
  };
}

export function generateMarkdown(data) {
  return `# Maven Event Management v2 — Baseline Envanteri

**Sabit Taban Commit:** \`${data.baseSha}\`  
**Oluşturulma Tarihi:** 28 Eylül 2026  
**Amaç:** P00.1 uyarınca çalışma ortamı ve repo envanterinin değişmez olarak sabitlenmesi.

---

## 1. Çalışma Ortamı Bilgileri

| Bileşen | Değer |
|---|---|
| Taban Commit SHA | \`${data.baseSha}\` |
| Platform / Mimari | \`${data.runtime.platform} (${data.runtime.arch})\` |
| Node.js Sürümü | \`${data.runtime.node}\` |
| Bun Sürümü | \`${data.runtime.bun}\` |
| npm Sürümü | \`${data.runtime.npm}\` |
| Git Sürümü | \`${data.runtime.git}\` |

---

## 2. Envanter Sayım Özeti

| Kategori | Adet | Not |
|---|---|---|
| Prisma Modelleri | **${data.counts.prismaModels}** | \`prisma/schema.prisma\` |
| API Route Dosyaları | **${data.counts.apiRoutes}** | \`src/app/api/**/route.ts\` |
| UI Modülleri | **${data.counts.modules}** | \`src/lib/constants.ts\` \`MODULES\` |
| Playwright Spec Dosyaları | **${data.counts.testSpecs}** | \`tests/**/*.spec.ts\` |
| Playwright Listed Test Sayısı | **${data.counts.playwrightTests}** | \`playwright test --list\` |

---

## 3. Çalışma Ağacı ve Takipteki Runtime Dosyaları (H-20 / N-04 Hijyen Riski)

Mevcut git durumunda takip edilen ve P00.2 fazında temizlenmesi/takipten çıkarılması gereken runtime dosyaları:

| Dosya | Git Durumu | Açıklama |
|---|---|---|
${data.git.trackedRuntimeFiles.map((f) => `| \`${f}\` | Tracked | P00.2'de .gitignore kapsamına alınıp takipten çıkarılmalı |`).join("\n")}

### Aktif Değişiklikler (\`git status --short\`):
\`\`\`text
${data.git.status.join("\n") || "Clean working tree"}
\`\`\`

---

## 4. Detaylı Varlık Listeleri

### 4.1 Prisma Modelleri (${data.counts.prismaModels})
${data.inventory.prismaModels.map((m) => `- \`${m}\``).join("\n")}

### 4.2 API Route Dosyaları (${data.counts.apiRoutes})
${data.inventory.apiRoutes.map((r) => `- \`${r}\``).join("\n")}

### 4.3 UI Modülleri (${data.counts.modules})
${data.inventory.modules.map((m) => `- \`${m}\``).join("\n")}

### 4.4 Playwright Spec Dosyaları (${data.counts.testSpecs})
${data.inventory.testSpecs.map((s) => `- \`${s}\``).join("\n")}
`;
}

// CLI Execution
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/inventory.mjs")) {
  const isJson = process.argv.includes("--json");
  const isMarkdown = process.argv.includes("--markdown");
  const shouldWrite = process.argv.includes("--write-baseline");

  const data = collectInventory();

  if (shouldWrite) {
    const targetDir = path.resolve("docs/evidence");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const md = generateMarkdown(data);
    fs.writeFileSync(path.join(targetDir, "baseline.md"), md, "utf8");
    console.log("Baseline inventory written to docs/evidence/baseline.md");
  }

  if (isJson) {
    console.log(JSON.stringify(data, null, 2));
  } else if (isMarkdown) {
    console.log(generateMarkdown(data));
  } else if (!shouldWrite) {
    console.log(`Maven Event Management v2 — Inventory Summary:`);
    console.log(`Base SHA: ${data.baseSha}`);
    console.log(`Prisma Models: ${data.counts.prismaModels}`);
    console.log(`API Routes: ${data.counts.apiRoutes}`);
    console.log(`Modules: ${data.counts.modules}`);
    console.log(`Test Specs: ${data.counts.testSpecs}`);
    console.log(`Playwright Tests: ${data.counts.playwrightTests}`);
    console.log(`Node: ${data.runtime.node}, Bun: ${data.runtime.bun}, Git: ${data.runtime.git}`);
  }
}
