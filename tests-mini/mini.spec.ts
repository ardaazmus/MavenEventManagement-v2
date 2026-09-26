import { test, expect } from "@playwright/test";
test("mini health", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
});
