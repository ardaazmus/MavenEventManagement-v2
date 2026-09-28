import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const permissionsPath = path.resolve("src/lib/api/permissions.ts");
const routePath = path.resolve("src/app/api/[entity]/route.ts");

test("P04.2 - Action mapping for HTTP methods is correct", async () => {
  const { actionForMethod } = await import(pathToFileURL(permissionsPath).href);
  assert.strictEqual(actionForMethod("GET"), "VIEW");
  assert.strictEqual(actionForMethod("HEAD"), "VIEW");
  assert.strictEqual(actionForMethod("POST"), "CREATE");
  assert.strictEqual(actionForMethod("PUT"), "UPDATE");
  assert.strictEqual(actionForMethod("PATCH"), "UPDATE");
  assert.strictEqual(actionForMethod("DELETE"), "DELETE");
  assert.strictEqual(actionForMethod("GET", true), "EXPORT");
});

test("P04.2 - ORG_OWNER and ORG_ADMIN have full VIEW and CREATE access", async () => {
  const { authorizeEntity } = await import(pathToFileURL(permissionsPath).href);

  for (const role of ["ORG_OWNER", "ORG_ADMIN"]) {
    assert.strictEqual(
      authorizeEntity({ entity: "people", action: "VIEW", role }),
      true,
      `${role} must be authorized to VIEW people`,
    );
    assert.strictEqual(
      authorizeEntity({ entity: "people", action: "CREATE", role }),
      true,
      `${role} must be authorized to CREATE people`,
    );
    assert.strictEqual(
      authorizeEntity({ entity: "expenses", action: "CREATE", role }),
      true,
      `${role} must be authorized to CREATE expenses`,
    );
    assert.strictEqual(
      authorizeEntity({ entity: "submissions", action: "CREATE", role }),
      true,
      `${role} must be authorized to CREATE submissions`,
    );
  }
});

test("P04.2 - VIEWER has read-only access (GET/VIEW allowed, POST/CREATE denied with 403)", async () => {
  const { authorizeEntity } = await import(pathToFileURL(permissionsPath).href);

  // VIEW allowed on standard entities
  assert.strictEqual(
    authorizeEntity({ entity: "people", action: "VIEW", role: "VIEWER" }),
    true,
    "VIEWER must be authorized to VIEW people",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "organizations", action: "VIEW", role: "VIEWER" }),
    true,
    "VIEWER must be authorized to VIEW organizations",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "registrations", action: "VIEW", role: "VIEWER" }),
    true,
    "VIEWER must be authorized to VIEW registrations",
  );

  // CREATE denied
  assert.strictEqual(
    authorizeEntity({ entity: "people", action: "CREATE", role: "VIEWER" }),
    false,
    "VIEWER must NOT be authorized to CREATE people",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "organizations", action: "CREATE", role: "VIEWER" }),
    false,
    "VIEWER must NOT be authorized to CREATE organizations",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "expenses", action: "CREATE", role: "VIEWER" }),
    false,
    "VIEWER must NOT be authorized to CREATE expenses",
  );

  // Mutations denied
  assert.strictEqual(
    authorizeEntity({ entity: "people", action: "UPDATE", role: "VIEWER" }),
    false,
    "VIEWER must NOT be authorized to UPDATE",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "people", action: "DELETE", role: "VIEWER" }),
    false,
    "VIEWER must NOT be authorized to DELETE",
  );

  // Sensitive modules like integrations denied even for VIEW
  assert.strictEqual(
    authorizeEntity({ entity: "api-integrations", action: "VIEW", role: "VIEWER" }),
    false,
    "VIEWER must NOT be authorized to VIEW integrations",
  );
});

test("P04.2 - Participant roles (ATTENDEE, etc.) are denied access to management routes", async () => {
  const { authorizeEntity } = await import(pathToFileURL(permissionsPath).href);

  const participantRoles = ["ATTENDEE", "PARTICIPANT", "SPEAKER", "AUTHOR", "REVIEWER"];

  for (const role of participantRoles) {
    assert.strictEqual(
      authorizeEntity({ entity: "people", action: "VIEW", role }),
      false,
      `Participant role ${role} must NOT be authorized to VIEW people`,
    );
    assert.strictEqual(
      authorizeEntity({ entity: "people", action: "CREATE", role }),
      false,
      `Participant role ${role} must NOT be authorized to CREATE people`,
    );
    assert.strictEqual(
      authorizeEntity({ entity: "expenses", action: "VIEW", role }),
      false,
      `Participant role ${role} must NOT be authorized to VIEW expenses`,
    );
    assert.strictEqual(
      authorizeEntity({ entity: "tasks", action: "CREATE", role }),
      false,
      `Participant role ${role} must NOT be authorized to CREATE tasks`,
    );
  }
});

test("P04.2 - Specialized staff managers are authorized only for their domains", async () => {
  const { authorizeEntity } = await import(pathToFileURL(permissionsPath).href);

  // FINANCE_MANAGER
  assert.strictEqual(
    authorizeEntity({ entity: "expenses", action: "CREATE", role: "FINANCE_MANAGER" }),
    true,
    "FINANCE_MANAGER must be authorized for expenses",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "submissions", action: "CREATE", role: "FINANCE_MANAGER" }),
    false,
    "FINANCE_MANAGER must NOT be authorized for scientific submissions",
  );

  // SCIENTIFIC_MANAGER
  assert.strictEqual(
    authorizeEntity({ entity: "submissions", action: "CREATE", role: "SCIENTIFIC_MANAGER" }),
    true,
    "SCIENTIFIC_MANAGER must be authorized for scientific submissions",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "expenses", action: "CREATE", role: "SCIENTIFIC_MANAGER" }),
    false,
    "SCIENTIFIC_MANAGER must NOT be authorized for finance expenses",
  );
});

test("P04.2 - Unknown entities and unregistered roles trigger deny-by-default", async () => {
  const { authorizeEntity } = await import(pathToFileURL(permissionsPath).href);

  assert.strictEqual(
    authorizeEntity({ entity: "unknown-entity-xyz", action: "VIEW", role: "ORG_OWNER" }),
    false,
    "Unknown entity must be denied even for ORG_OWNER",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "people", action: "VIEW", role: "UNKNOWN_MALICIOUS_ROLE" }),
    false,
    "Unknown role must be denied by default",
  );
});

test("P04.2 - Auth-off demo mode (role null/undefined) preserves open access", async () => {
  const { authorizeEntity } = await import(pathToFileURL(permissionsPath).href);

  assert.strictEqual(
    authorizeEntity({ entity: "people", action: "VIEW", role: null }),
    true,
    "Null role (auth-off) must preserve access",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "people", action: "CREATE", role: undefined }),
    true,
    "Undefined role (auth-off) must preserve access",
  );
});

test("P04.2 - src/app/api/[entity]/route.ts enforces authorization before tenant guard", async () => {
  assert.ok(fs.existsSync(routePath), "src/app/api/[entity]/route.ts must exist");
  const content = fs.readFileSync(routePath, "utf8");

  // Check imports
  assert.ok(
    content.includes("authorizeEntity") || content.includes("authorizeDualRead"),
    "route.ts must import and use authorizeEntity or authorizeDualRead",
  );
  assert.ok(
    content.includes("requestActor"),
    "route.ts must import and use requestActor",
  );

  // Check GET enforces VIEW
  const getIndex = content.indexOf("export async function GET");
  assert.ok(getIndex !== -1, "GET handler must exist");
  const getBlock = content.slice(getIndex, content.indexOf("export async function POST"));
  const hasGetAuth = getBlock.includes("authorizeEntity") || getBlock.includes("authorizeDualRead");
  assert.ok(hasGetAuth, "GET handler must call authorizeEntity or authorizeDualRead");
  assert.ok(
    getBlock.includes("applyListGuard"),
    "GET handler must call applyListGuard",
  );
  const getAuthIdx = getBlock.includes("authorizeDualRead") ? getBlock.indexOf("authorizeDualRead") : getBlock.indexOf("authorizeEntity");
  assert.ok(
    getAuthIdx < getBlock.indexOf("applyListGuard"),
    "In GET handler, authorization must be called BEFORE applyListGuard",
  );

  // Check POST enforces CREATE
  const postIndex = content.indexOf("export async function POST");
  assert.ok(postIndex !== -1, "POST handler must exist");
  const postBlock = content.slice(postIndex);
  const hasPostAuth = postBlock.includes("authorizeEntity") || postBlock.includes("authorizeDualRead");
  assert.ok(hasPostAuth, "POST handler must call authorizeEntity or authorizeDualRead");
  assert.ok(
    postBlock.includes("applyWriteGuard"),
    "POST handler must call applyWriteGuard",
  );
  const postAuthIdx = postBlock.includes("authorizeDualRead") ? postBlock.indexOf("authorizeDualRead") : postBlock.indexOf("authorizeEntity");
  assert.ok(
    postAuthIdx < postBlock.indexOf("applyWriteGuard"),
    "In POST handler, authorization must be called BEFORE applyWriteGuard",
  );
});
