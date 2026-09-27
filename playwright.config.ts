import { defineConfig } from "@playwright/test";

// TASK-B 24: Playwright E2E + golden snapshots
// CI flag-ON gate: MAVEN_AUTH=on ile start edilen sunucuda tests/auth.spec.ts devreye girer
// (flag-off'ta otomatik SKIP — OFF modunda E2E bayt-özdeş davranışı korunur).
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "off",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
