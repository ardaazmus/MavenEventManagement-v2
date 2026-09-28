import crypto from "node:crypto";

export const DEV_SECRET = process.env.MAVEN_SECRET_KEY || "maven-dev-only-secret-key-change-me";
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-maven.session" : "maven.session";

export function signSession(payload, secret = DEV_SECRET) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function createSessionCookie(tenantId, role = "ORG_OWNER", ttl = 3600, secret = DEV_SECRET) {
  const now = Math.floor(Date.now() / 1000);
  const token = signSession(
    {
      uid: "e2e-actor-uid",
      role,
      tenantId,
      iat: now,
      exp: now + ttl,
    },
    secret,
  );
  return `${SESSION_COOKIE}=${token}`;
}

export function createAuthHeaders(tenantId, role = "ORG_OWNER", ttl = 3600, secret = DEV_SECRET) {
  return {
    Cookie: createSessionCookie(tenantId, role, ttl, secret),
  };
}

export const ROLES = {
  STAFF: ["ORG_OWNER", "STAFF", "FINANCE_MANAGER"],
  PARTICIPANT: ["ATTENDEE", "PARTICIPANT", "SPEAKER"],
};
