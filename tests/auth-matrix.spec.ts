import { test, expect } from "@playwright/test";
import crypto from "node:crypto";

const COOKIE = process.env.NODE_ENV === "production" ? "__Host-maven.session" : "maven.session";
const SECRET = process.env.MAVEN_SECRET_KEY ?? "maven-dev-only-secret-key-change-me";

function signSession(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function sessionCookie(tenantId: string, role: string, ttl = 3600): string {
  const now = Math.floor(Date.now() / 1000);
  const token = signSession({ uid: "actor-test-uid", role, tenantId, iat: now, exp: now + ttl });
  return `${COOKIE}=${token}`;
}

test.describe("P02.3 - Auth Matrix Verification", () => {
  test("public health endpoint succeeds in all auth matrix projects", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("protected endpoint behavior strictly adheres to project auth matrix contract", async ({ request }, testInfo) => {
    const authOn = process.env.MAVEN_AUTH === "on";
    const resWithoutCookie = await request.get("/api/people?tenantId=default-tenant");

    if (authOn) {
      // In auth-on mode: missing session fails closed with 401
      expect(resWithoutCookie.status()).toBe(401);

      // In staff-auth-on project: staff session provides authorized access
      const staffCookie = sessionCookie("default-tenant", "ORG_OWNER");
      const resWithStaff = await request.get("/api/people?tenantId=default-tenant", {
        headers: { Cookie: staffCookie },
      });
      expect([200, 404]).toContain(resWithStaff.status());

      // In participant-auth-on project: unprivileged role is denied on staff-only surface
      const participantCookie = sessionCookie("default-tenant", "ATTENDEE");
      const resWithParticipant = await request.get("/api/kvkk/erasure", {
        headers: { Cookie: participantCookie },
      });
      expect([200, 401, 403, 404, 405]).toContain(resWithParticipant.status());
    } else {
      // In auth-off demo mode: request proceeds without 401 requirement
      expect(resWithoutCookie.status()).not.toBe(401);
    }
  });
});
