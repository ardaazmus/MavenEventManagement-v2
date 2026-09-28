import { test, expect } from "@playwright/test";

test.describe("P02.2 - Playwright E2E Smoke & Health Gate", () => {
  test("GET /api/health returns 200 and healthy JSON payload", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.uptimeSec).toBe("number");
    expect(body.db).toBeDefined();
    expect(body.db.ok).toBe(true);
    expect(body.version).toBe("task-b");
    expect(typeof body.authEnabled).toBe("boolean");
  });

  test("GET /api/health/liveness returns 200 process-only probe", async ({ request }) => {
    const res = await request.get("/api/health/liveness");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.alive).toBe(true);
    expect(typeof body.uptimeSec).toBe("number");
  });

  test("GET /api/health/readiness validates readiness contract and schema", async ({ request }) => {
    const res = await request.get("/api/health/readiness");
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    expect(typeof body.ready).toBe("boolean");
    expect(body.db).toBe(true);
    expect(typeof body.migrations).toBe("boolean");
    expect(typeof body.config).toBe("boolean");
  });
});
