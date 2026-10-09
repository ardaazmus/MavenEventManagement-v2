import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const checklistLibPath = path.resolve("src/lib/events/setup-checklist.ts");
const routePolicyPath = path.resolve("scripts/route-policy.mjs");

test("F-07-1 — evaluateSetupChecklist: Yeni taslak edisyon değerlendirmesi", async () => {
  const { evaluateSetupChecklist } = await import(pathToFileURL(checklistLibPath).href);

  const rawDraft = {
    edition: {
      id: "ed_draft",
      name: "Tıp Kongresi 2027",
      description: null,
      logoUrl: null,
      headerImageUrl: null,
      portalHeaderTitle: null,
      portalHeaderImageUrl: null,
      isPublished: false,
    },
    stakeholderCount: 0,
    staffCount: 0,
    categoryCount: 0,
    sessionCount: 0,
    blockersCount: 1, // Kategori yok
  };

  const res = evaluateSetupChecklist(rawDraft);

  assert.strictEqual(res.editionId, "ed_draft");
  assert.strictEqual(res.editionName, "Tıp Kongresi 2027");
  assert.strictEqual(res.isPublished, false);
  assert.strictEqual(res.isReadyForPublish, false);
  assert.strictEqual(res.completedStepsCount, 0);
  assert.strictEqual(res.completionPct, 0);

  // Sıradaki ilk zorunlu adım BASICS olmalı
  assert.ok(res.nextStep);
  assert.strictEqual(res.nextStep.key, "BASICS");
  assert.strictEqual(res.nextStep.status, "PENDING");
  assert.strictEqual(res.nextStep.targetModule, "editions");
});

test("F-07-2 — evaluateSetupChecklist: Kademeli ilerleme (Basics + Müşteri tamamlandı)", async () => {
  const { evaluateSetupChecklist } = await import(pathToFileURL(checklistLibPath).href);

  const rawProgress = {
    edition: {
      id: "ed_prog",
      name: "Bilişim Fuarı 2026",
      description: "Türkiye'nin en kapsamlı teknoloji ve yazılım buluşması.",
      logoUrl: "https://example.com/logo.png",
      headerImageUrl: null,
      portalHeaderTitle: null,
      portalHeaderImageUrl: null,
      isPublished: false,
    },
    stakeholderCount: 1, // Müşteri dernek atandı
    staffCount: 0,
    categoryCount: 0,
    sessionCount: 0,
    blockersCount: 1,
  };

  const res = evaluateSetupChecklist(rawProgress);

  // BASICS ve STAKEHOLDER adımları COMPLETED olmalı
  const basicsStep = res.steps.find((s) => s.key === "BASICS");
  const stakeholderStep = res.steps.find((s) => s.key === "STAKEHOLDER");
  const staffStep = res.steps.find((s) => s.key === "STAFF");

  assert.strictEqual(basicsStep.status, "COMPLETED");
  assert.strictEqual(stakeholderStep.status, "COMPLETED");
  assert.strictEqual(staffStep.status, "PENDING");

  // Sıradaki adım STAFF olmalı
  assert.strictEqual(res.nextStep.key, "STAFF");
  assert.strictEqual(res.completedStepsCount, 2);
  assert.ok(res.completionPct > 0);
});

test("F-07-3 — evaluateSetupChecklist: Yayına hazır edisyon", async () => {
  const { evaluateSetupChecklist } = await import(pathToFileURL(checklistLibPath).href);

  const rawReady = {
    edition: {
      id: "ed_ready",
      name: "Onkoloji Sempozyumu 2026",
      description: "Uluslararası katılımlı yıllık tıp sempozyumu.",
      logoUrl: "https://example.com/logo.png",
      headerImageUrl: "https://example.com/banner.jpg",
      portalHeaderTitle: "Sempozyum Portalı",
      portalHeaderImageUrl: "https://example.com/portal.jpg",
      isPublished: false,
    },
    stakeholderCount: 2,
    staffCount: 3,
    categoryCount: 2,
    sessionCount: 10,
    blockersCount: 0,
  };

  const res = evaluateSetupChecklist(rawReady);

  assert.strictEqual(res.isReadyForPublish, true);
  assert.strictEqual(res.isPublished, false);
  assert.strictEqual(res.nextStep.key, "PUBLISH");
  assert.strictEqual(res.completedStepsCount, 4); // BASICS, STAKEHOLDER, STAFF, REGISTRATION
});

test("F-07-4 — evaluateSetupChecklist: Yayında olan edisyon", async () => {
  const { evaluateSetupChecklist } = await import(pathToFileURL(checklistLibPath).href);

  const rawPublished = {
    edition: {
      id: "ed_pub",
      name: "Yayınlanmış Etkinlik",
      description: "Detaylı açıklama metni burada yer alıyor.",
      logoUrl: "https://example.com/logo.png",
      headerImageUrl: null,
      portalHeaderTitle: null,
      portalHeaderImageUrl: null,
      isPublished: true,
    },
    stakeholderCount: 1,
    staffCount: 1,
    categoryCount: 1,
    sessionCount: 1,
    blockersCount: 0,
  };

  const res = evaluateSetupChecklist(rawPublished);

  assert.strictEqual(res.isPublished, true);
  assert.strictEqual(res.isReadyForPublish, false);
  assert.strictEqual(res.completionPct, 100);
  assert.strictEqual(res.nextStep, null);
});

test("F-07-5 — computeEditionSetupChecklist mock veritabanı entegrasyonu", async () => {
  const { computeEditionSetupChecklist } = await import(pathToFileURL(checklistLibPath).href);

  const mockPrisma = {
    eventEdition: {
      findUnique: async () => ({
        id: "mock_e1",
        name: "Mock Etkinlik",
        description: "Test amaçlı edisyon",
        logoUrl: "https://img.example/logo.png",
        headerImageUrl: null,
        portalHeaderTitle: null,
        portalHeaderImageUrl: null,
        isPublished: false,
      }),
    },
    eventOrganizationAssignment: { count: async () => 1 },
    userRoleAssignment: { count: async () => 2 },
    registrationCategory: { count: async () => 3 },
    programSession: { count: async () => 4 },
  };

  const res = await computeEditionSetupChecklist("mock_e1", mockPrisma);
  assert.strictEqual(res.editionId, "mock_e1");
  assert.strictEqual(res.steps.find((s) => s.key === "REGISTRATION").status, "COMPLETED");
  assert.strictEqual(res.steps.find((s) => s.key === "PROGRAM").status, "COMPLETED");
});

test("F-07-6 — Route Policy envanterinde setup-checklist ucu doğrulaması", async () => {
  const { ROUTE_POLICY_DEFINITIONS } = await import(pathToFileURL(routePolicyPath).href);

  assert.ok(ROUTE_POLICY_DEFINITIONS["src/app/api/editions/[id]/setup-checklist/route.ts"]);
  assert.strictEqual(ROUTE_POLICY_DEFINITIONS["src/app/api/editions/[id]/setup-checklist/route.ts"].category, "STAFF");
  assert.strictEqual(ROUTE_POLICY_DEFINITIONS["src/app/api/editions/[id]/setup-checklist/route.ts"].authRequired, true);
});
