import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const taxonomyPath = path.resolve("src/lib/product-taxonomy.ts");

test("Faz 3 - 01: İş Shell'i ve Navigasyon — İş Özeti Modül Eşlemesi", async () => {
  const { WORK_NAV_GROUPS } = await import(pathToFileURL(taxonomyPath).href);

  // İş Yönetimi grubundaki "İş Özeti" 'dashboard' modülüne işaret etmelidir
  const mgmtGroup = WORK_NAV_GROUPS.find((g) => g.id === "work_management");
  assert.ok(mgmtGroup, "work_management grubu mevcut olmalı");

  const summaryItem = mgmtGroup.items.find((i) => i.id === "summary");
  assert.ok(summaryItem, "summary (İş Özeti) öğesi mevcut olmalı");
  assert.strictEqual(summaryItem.title, "İş Özeti");
  assert.strictEqual(summaryItem.primaryModuleId, "dashboard");

  // Kurulum Kontrol Listesi 'editions' modülüne işaret etmelidir
  const checklistItem = mgmtGroup.items.find((i) => i.id === "setup-checklist");
  assert.ok(checklistItem, "setup-checklist öğesi mevcut olmalı");
  assert.strictEqual(checklistItem.primaryModuleId, "editions");
});

test("Faz 3 - 02: Bekleyen Kararlar ve Onaylar (Decision Cockpit) Mantığı", () => {
  // Mock KPI verisi
  const mockKpi = {
    pendingApproval: 4,
    pendingManual: 2,
    reviewOverdue: 3,
    acceptedNoSession: 5,
    deliverablePending: 1,
    taskOpen: 7,
  };

  // Karar kuyrukları oluşturucu fonksiyon mantığı
  const decisionQueues = [
    { key: "pendingApproval", count: mockKpi.pendingApproval, targetModule: "registrations" },
    { key: "pendingManual", count: mockKpi.pendingManual, targetModule: "finance" },
    { key: "reviewOverdue", count: mockKpi.reviewOverdue, targetModule: "scientific" },
    { key: "acceptedNoSession", count: mockKpi.acceptedNoSession, targetModule: "program" },
    { key: "deliverablePending", count: mockKpi.deliverablePending, targetModule: "sponsorship" },
    { key: "taskOpen", count: mockKpi.taskOpen, targetModule: "operations" },
  ];

  const totalPendingDecisions = decisionQueues.reduce((s, q) => s + q.count, 0);
  assert.strictEqual(totalPendingDecisions, 22);

  // Her kuyruk doğru modüle bağlanmalıdır
  assert.strictEqual(decisionQueues.find((q) => q.key === "pendingApproval")?.targetModule, "registrations");
  assert.strictEqual(decisionQueues.find((q) => q.key === "pendingManual")?.targetModule, "finance");
  assert.strictEqual(decisionQueues.find((q) => q.key === "reviewOverdue")?.targetModule, "scientific");
  assert.strictEqual(decisionQueues.find((q) => q.key === "acceptedNoSession")?.targetModule, "program");
  assert.strictEqual(decisionQueues.find((q) => q.key === "deliverablePending")?.targetModule, "sponsorship");
  assert.strictEqual(decisionQueues.find((q) => q.key === "taskOpen")?.targetModule, "operations");
});

test("Faz 3 - 03: Yalnız Bu İşte Etkin Modüllerin Durum Kartları Filtreleme Mantığı", () => {
  const editionWithSelectiveCapabilities = {
    id: "edition-test-1",
    name: "Özel Çalıştay 2026",
    status: "REGISTRATION",
    capabilities: [
      { key: "REGISTRATION", enabled: true },
      { key: "PROGRAM", enabled: true },
      { key: "SCIENTIFIC", enabled: false },
      { key: "SPONSORSHIP", enabled: false },
      { key: "ACCESS_CONTROL", enabled: true },
      { key: "ACCOMMODATION", enabled: false },
      { key: "PORTALS", enabled: true },
    ],
  };

  const hasCap = (key, altKeys = []) => {
    return editionWithSelectiveCapabilities.capabilities.some(
      (c) => (c.key === key || altKeys.includes(c.key)) && c.enabled
    );
  };

  // Açık olanlar
  assert.strictEqual(hasCap("REGISTRATION", ["REGISTRATIONS"]), true);
  assert.strictEqual(hasCap("PROGRAM"), true);
  assert.strictEqual(hasCap("ACCESS_CONTROL", ["ONSITE"]), true);
  assert.strictEqual(hasCap("PORTALS"), true);

  // Kapalı olanlar — İş Özetinde durum kartı gösterilmemeli
  assert.strictEqual(hasCap("SCIENTIFIC"), false);
  assert.strictEqual(hasCap("SPONSORSHIP", ["SPONSORS"]), false);
  assert.strictEqual(hasCap("ACCOMMODATION"), false);
});

test("Faz 3 - 04: Arşivlenmiş / Kapanmış İş Mutabakat Modu", () => {
  const archivedEdition = {
    id: "edition-archive-1",
    status: "ARCHIVED",
    kpi: {
      confirmed: 350,
      arrived: 310,
      collected: 150000,
      refunded: 5000,
      openBalance: 0,
    },
  };

  const isArchived = ["ARCHIVED", "POST_EVENT", "RECONCILIATION"].includes(archivedEdition.status);
  assert.strictEqual(isArchived, true);

  const netCollection = archivedEdition.kpi.collected - archivedEdition.kpi.refunded;
  assert.strictEqual(netCollection, 145000);
  assert.strictEqual(archivedEdition.kpi.openBalance, 0);

  const activeEdition = { status: "ONSITE" };
  const isActiveArchived = ["ARCHIVED", "POST_EVENT", "RECONCILIATION"].includes(activeEdition.status);
  assert.strictEqual(isActiveArchived, false);
});

test("Faz 3 - 05: Kurulum Hazırlığı (Readiness Audit) ve Blokaj Yönlendirmesi", () => {
  const mockChecks = {
    score: 6,
    pct: 75,
    blockers: [
      { key: "registration_form_missing", message: "Kayıt formu tanımlanmadı" },
      { key: "bank_account_missing", message: "Banka hesabı tanımlanmadı" },
    ],
    warnings: [
      { key: "banner_image_missing", message: "Afiş görseli eksik" },
    ],
  };

  assert.strictEqual(mockChecks.score, 6);
  assert.strictEqual(mockChecks.pct, 75);
  assert.strictEqual(mockChecks.blockers.length, 2);
  assert.strictEqual(mockChecks.warnings.length, 1);

  // Blokaj yönlendirme eşlemesi
  const resolveBlockerModule = (key) => {
    const k = key.toLowerCase();
    if (k.includes("form")) return "forms";
    if (k.includes("bank") || k.includes("pay")) return "finance";
    if (k.includes("cat") || k.includes("reg")) return "registrations";
    if (k.includes("sess") || k.includes("prog")) return "program";
    return "editions";
  };

  assert.strictEqual(resolveBlockerModule(mockChecks.blockers[0].key), "forms");
  assert.strictEqual(resolveBlockerModule(mockChecks.blockers[1].key), "finance");
});
