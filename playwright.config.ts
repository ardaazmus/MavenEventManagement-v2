import { defineConfig } from "@playwright/test";

const PORT = process.env.PORT || "3000";
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

// TASK-B 24: Playwright E2E + golden snapshots
// CI flag-ON gate: MAVEN_AUTH=on ile start edilen sunucuda tests/auth.spec.ts devreye girer
// (flag-off'ta otomatik SKIP — OFF modunda E2E bayt-özdeş davranışı korunur).
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/support/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "off",
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "demo-auth-off",
      use: { browserName: "chromium" },
      metadata: {
        authMode: "off",
        role: "none",
        description: "Default demo mode without authentication requirement",
      },
    },
    {
      name: "staff-auth-on",
      use: { browserName: "chromium" },
      metadata: {
        authMode: "on",
        role: "staff",
        description: "Authenticated staff mode with full operations access",
      },
    },
    {
      name: "participant-auth-on",
      use: { browserName: "chromium" },
      metadata: {
        authMode: "on",
        role: "participant",
        description: "Authenticated attendee/participant mode with restricted scope",
      },
    },
  ],
});
