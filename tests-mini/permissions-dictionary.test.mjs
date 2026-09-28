import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

test("P04.1 - src/lib/api/permissions.ts exists and defines action set and module set", async () => {
  const permPath = path.resolve("src/lib/api/permissions.ts");
  assert.ok(fs.existsSync(permPath), "src/lib/api/permissions.ts must exist");

  const permModule = await import(pathToFileURL(permPath).href);
  assert.ok(Array.isArray(permModule.ACTIONS), "ACTIONS must be an array");
  assert.deepStrictEqual(
    [...permModule.ACTIONS],
    ["VIEW", "CREATE", "UPDATE", "DELETE", "EXPORT", "APPROVE", "MANAGE"],
    "ACTIONS must match required 7 actions exactly",
  );

  // Büyüme-toleranslı: sayı kilidi yeni modülü cezalandırmaz; şekil module-coherence'te kilitli.
  assert.ok(permModule.MODULE_IDS.length >= 26, `MODULE_IDS en az 26 modül içermeli, görülen: ${permModule.MODULE_IDS.length}`);
});

test("P04.1 - All registry entities are mapped with zero unmapped or orphan entities", async () => {
  const permPath = path.resolve("src/lib/api/permissions.ts");
  const permModule = await import(pathToFileURL(permPath).href);
  const { ENTITY_POLICY_MAP, MODULE_IDS } = permModule;

  const registryContent = fs.readFileSync(path.resolve("src/lib/api/registry.ts"), "utf8");
  const regex = /^\s{2}(?:"([^"\r\n]+)"|([a-z0-9-]+)):\s*\{/gm;
  let m;
  const registryKeys = [];
  while ((m = regex.exec(registryContent)) !== null) {
    registryKeys.push(m[1] || m[2]);
  }

  assert.ok(registryKeys.length >= 80, `Registry must have at least 80 entities, found ${registryKeys.length}`);

  for (const entityKey of registryKeys) {
    const policy = ENTITY_POLICY_MAP[entityKey];
    assert.ok(policy, `Entity '${entityKey}' in registry must have an entity policy in ENTITY_POLICY_MAP`);
    assert.ok(
      MODULE_IDS.includes(policy.module),
      `Entity '${entityKey}' mapped to module '${policy.module}' which must be in MODULE_IDS`,
    );
  }
});

test("P04.1 - Unknown entities trigger deny-by-default", async () => {
  const permPath = path.resolve("src/lib/api/permissions.ts");
  const permModule = await import(pathToFileURL(permPath).href);
  const { getEntityPolicy, authorizeEntity } = permModule;

  assert.strictEqual(getEntityPolicy("non-existent-entity-12345"), null, "Unknown entity policy must be null");
  assert.strictEqual(
    authorizeEntity({ entity: "non-existent-entity-12345", action: "VIEW", role: "ORG_OWNER" }),
    false,
    "Unknown entity authorization must return false (deny-by-default)",
  );
});

test("P04.1 - Golden snapshot: entity-to-module mapping is deterministic", async () => {
  const permPath = path.resolve("src/lib/api/permissions.ts");
  const permModule = await import(pathToFileURL(permPath).href);
  const { ENTITY_POLICY_MAP } = permModule;

  // Snapshot sample checks
  assert.strictEqual(ENTITY_POLICY_MAP["organizations"].module, "organizations");
  assert.strictEqual(ENTITY_POLICY_MAP["people"].module, "people");
  assert.strictEqual(ENTITY_POLICY_MAP["registrations"].module, "registrations");
  assert.strictEqual(ENTITY_POLICY_MAP["expenses"].module, "finance");
  assert.strictEqual(ENTITY_POLICY_MAP["incomes"].module, "finance");
  assert.strictEqual(ENTITY_POLICY_MAP["sponsor-agreements"].module, "sponsorship");
  assert.strictEqual(ENTITY_POLICY_MAP["hotels"].module, "accommodation");
  assert.strictEqual(ENTITY_POLICY_MAP["submissions"].module, "scientific");
  assert.strictEqual(ENTITY_POLICY_MAP["sessions"].module, "program");
  assert.strictEqual(ENTITY_POLICY_MAP["scan-events"].module, "onsite");
  assert.strictEqual(ENTITY_POLICY_MAP["badge-profiles"].module, "badges");
  assert.strictEqual(ENTITY_POLICY_MAP["campaigns"].module, "communications");
});
