import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const permissionsPath = path.resolve("src/lib/api/permissions.ts");
const itemRoutePath = path.resolve("src/app/api/[entity]/[id]/route.ts");

test("P04.3 - Action mapping for item route methods (GET->VIEW, PUT->UPDATE, DELETE->DELETE)", async () => {
  const { actionForMethod } = await import(pathToFileURL(permissionsPath).href);
  assert.strictEqual(actionForMethod("GET"), "VIEW");
  assert.strictEqual(actionForMethod("PUT"), "UPDATE");
  assert.strictEqual(actionForMethod("PATCH"), "UPDATE");
  assert.strictEqual(actionForMethod("DELETE"), "DELETE");
});

test("P04.3 - ORG_OWNER has VIEW, UPDATE, and DELETE access on item entities", async () => {
  const { authorizeEntity } = await import(pathToFileURL(permissionsPath).href);

  for (const entity of ["people", "organizations", "expenses", "submissions"]) {
    assert.strictEqual(
      authorizeEntity({ entity, action: "VIEW", role: "ORG_OWNER" }),
      true,
      `ORG_OWNER must be authorized to VIEW ${entity}`,
    );
    assert.strictEqual(
      authorizeEntity({ entity, action: "UPDATE", role: "ORG_OWNER" }),
      true,
      `ORG_OWNER must be authorized to UPDATE ${entity}`,
    );
    assert.strictEqual(
      authorizeEntity({ entity, action: "DELETE", role: "ORG_OWNER" }),
      true,
      `ORG_OWNER must be authorized to DELETE ${entity}`,
    );
  }
});

test("P04.3 - VIEWER has read-only access (GET allowed, PUT and DELETE forbidden with 403)", async () => {
  const { authorizeEntity } = await import(pathToFileURL(permissionsPath).href);

  // VIEW allowed on standard entities
  assert.strictEqual(
    authorizeEntity({ entity: "people", action: "VIEW", role: "VIEWER" }),
    true,
    "VIEWER must be authorized to VIEW person item",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "expenses", action: "VIEW", role: "VIEWER" }),
    true,
    "VIEWER must be authorized to VIEW expense item",
  );

  // UPDATE and DELETE denied
  assert.strictEqual(
    authorizeEntity({ entity: "people", action: "UPDATE", role: "VIEWER" }),
    false,
    "VIEWER must NOT be authorized to UPDATE person item",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "people", action: "DELETE", role: "VIEWER" }),
    false,
    "VIEWER must NOT be authorized to DELETE person item",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "expenses", action: "UPDATE", role: "VIEWER" }),
    false,
    "VIEWER must NOT be authorized to UPDATE expense item",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "expenses", action: "DELETE", role: "VIEWER" }),
    false,
    "VIEWER must NOT be authorized to DELETE expense item",
  );
});

test("P04.3 - Participant roles (ATTENDEE, etc.) are denied GET, PUT, and DELETE on item routes", async () => {
  const { authorizeEntity } = await import(pathToFileURL(permissionsPath).href);

  for (const role of ["ATTENDEE", "PARTICIPANT", "SPEAKER", "AUTHOR"]) {
    for (const action of ["VIEW", "UPDATE", "DELETE"]) {
      assert.strictEqual(
        authorizeEntity({ entity: "people", action, role }),
        false,
        `${role} must NOT be authorized to ${action} on people`,
      );
      assert.strictEqual(
        authorizeEntity({ entity: "expenses", action, role }),
        false,
        `${role} must NOT be authorized to ${action} on expenses`,
      );
    }
  }
});

test("P04.3 - Domain managers have UPDATE/DELETE rights only in their assigned modules", async () => {
  const { authorizeEntity } = await import(pathToFileURL(permissionsPath).href);

  // FINANCE_MANAGER
  assert.strictEqual(
    authorizeEntity({ entity: "expenses", action: "UPDATE", role: "FINANCE_MANAGER" }),
    true,
    "FINANCE_MANAGER can UPDATE expenses",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "expenses", action: "DELETE", role: "FINANCE_MANAGER" }),
    true,
    "FINANCE_MANAGER can DELETE expenses",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "submissions", action: "UPDATE", role: "FINANCE_MANAGER" }),
    false,
    "FINANCE_MANAGER cannot UPDATE scientific submissions",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "submissions", action: "DELETE", role: "FINANCE_MANAGER" }),
    false,
    "FINANCE_MANAGER cannot DELETE scientific submissions",
  );

  // SCIENTIFIC_MANAGER
  assert.strictEqual(
    authorizeEntity({ entity: "submissions", action: "UPDATE", role: "SCIENTIFIC_MANAGER" }),
    true,
    "SCIENTIFIC_MANAGER can UPDATE scientific submissions",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "submissions", action: "DELETE", role: "SCIENTIFIC_MANAGER" }),
    true,
    "SCIENTIFIC_MANAGER can DELETE scientific submissions",
  );
  assert.strictEqual(
    authorizeEntity({ entity: "expenses", action: "UPDATE", role: "SCIENTIFIC_MANAGER" }),
    false,
    "SCIENTIFIC_MANAGER cannot UPDATE expenses",
  );
});

test("P04.3 - src/app/api/[entity]/[id]/route.ts enforces authorization before ensureInScope", async () => {
  assert.ok(fs.existsSync(itemRoutePath), "src/app/api/[entity]/[id]/route.ts must exist");
  const content = fs.readFileSync(itemRoutePath, "utf8");

  // Check required imports
  assert.ok(
    content.includes("authorizeEntity") || content.includes("authorizeDualRead"),
    "item route must import and use authorizeEntity or authorizeDualRead",
  );
  assert.ok(
    content.includes("actionForMethod"),
    "item route must import and use actionForMethod",
  );
  assert.ok(
    content.includes("requestActor"),
    "item route must import and use requestActor",
  );

  // Check GET handler
  const getIndex = content.indexOf("export async function GET");
  const putIndex = content.indexOf("export async function PUT");
  const deleteIndex = content.indexOf("export async function DELETE");

  assert.ok(getIndex !== -1 && putIndex !== -1 && deleteIndex !== -1, "GET, PUT, DELETE must all exist");

  const getBlock = content.slice(getIndex, putIndex);
  const hasGetAuth = getBlock.includes("authorizeEntity") || getBlock.includes("authorizeDualRead");
  assert.ok(hasGetAuth, "GET handler must call authorizeEntity or authorizeDualRead");
  assert.ok(getBlock.includes("ensureInScope"), "GET handler must call ensureInScope");
  const getAuthIdx = getBlock.includes("authorizeDualRead") ? getBlock.indexOf("authorizeDualRead") : getBlock.indexOf("authorizeEntity");
  assert.ok(
    getAuthIdx < getBlock.indexOf("ensureInScope"),
    "In GET, authorization must be called BEFORE ensureInScope",
  );

  const putBlock = content.slice(putIndex, deleteIndex);
  const hasPutAuth = putBlock.includes("authorizeEntity") || putBlock.includes("authorizeDualRead");
  assert.ok(hasPutAuth, "PUT handler must call authorizeEntity or authorizeDualRead");
  assert.ok(putBlock.includes("ensureInScope"), "PUT handler must call ensureInScope");
  const putAuthIdx = putBlock.includes("authorizeDualRead") ? putBlock.indexOf("authorizeDualRead") : putBlock.indexOf("authorizeEntity");
  assert.ok(
    putAuthIdx < putBlock.indexOf("ensureInScope"),
    "In PUT, authorization must be called BEFORE ensureInScope",
  );

  const deleteBlock = content.slice(deleteIndex);
  const hasDeleteAuth = deleteBlock.includes("authorizeEntity") || deleteBlock.includes("authorizeDualRead");
  assert.ok(hasDeleteAuth, "DELETE handler must call authorizeEntity or authorizeDualRead");
  assert.ok(deleteBlock.includes("ensureInScope"), "DELETE handler must call ensureInScope");
  const delAuthIdx = deleteBlock.includes("authorizeDualRead") ? deleteBlock.indexOf("authorizeDualRead") : deleteBlock.indexOf("authorizeEntity");
  assert.ok(
    delAuthIdx < deleteBlock.indexOf("ensureInScope"),
    "In DELETE, authorization must be called BEFORE ensureInScope",
  );
});
