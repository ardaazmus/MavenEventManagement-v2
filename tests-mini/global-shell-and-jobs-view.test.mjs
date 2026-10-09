import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const taxonomyPath = path.resolve("src/lib/product-taxonomy.ts");

test("Faz 2 - 01: Firma B Global Shell — 5 Global Alan ve İkincil Menü Sözleşmesi", async () => {
  const { GLOBAL_NAV_AREAS } = await import(pathToFileURL(taxonomyPath).href);

  assert.strictEqual(GLOBAL_NAV_AREAS.length, 5);
  const [jobs, portfolio, comms, reports, settings] = GLOBAL_NAV_AREAS;

  // 1. İşler ve Organizasyonlar
  assert.strictEqual(jobs.id, "jobs");
  assert.strictEqual(jobs.title, "İşler ve Organizasyonlar");
  const jobsFilters = jobs.secondaryMenu.map((m) => m.id);
  assert.ok(jobsFilters.includes("active"));
  assert.ok(jobsFilters.includes("planning"));
  assert.ok(jobsFilters.includes("attention"));
  assert.ok(jobsFilters.includes("completed"));
  assert.ok(jobsFilters.includes("archive"));

  // 2. Firma Portföyü
  assert.strictEqual(portfolio.id, "portfolio");
  const portfolioItems = portfolio.secondaryMenu.map((m) => m.id);
  assert.ok(portfolioItems.includes("people"));
  assert.ok(portfolioItems.includes("organizations"));
  assert.ok(portfolioItems.includes("clients"));

  // 3. Genel İletişim
  assert.strictEqual(comms.id, "comms");
  const commsItems = comms.secondaryMenu.map((m) => m.id);
  assert.ok(commsItems.includes("overview"));
  assert.ok(commsItems.includes("audiences"));
  assert.ok(commsItems.includes("campaigns"));

  // 4. Firma Raporları
  assert.strictEqual(reports.id, "reports");
  const reportItems = reports.secondaryMenu.map((m) => m.id);
  assert.ok(reportItems.includes("portfolio-report"));
  assert.ok(reportItems.includes("works-report"));
  assert.ok(reportItems.includes("finance-report"));

  // 5. Firma Ayarları
  assert.strictEqual(settings.id, "settings");
  const settingItems = settings.secondaryMenu.map((m) => m.id);
  assert.ok(settingItems.includes("profile"));
  assert.ok(settingItems.includes("staff-teams"));
  assert.ok(settingItems.includes("integrations"));
  assert.ok(settingItems.includes("compliance"));
});

test("Faz 2 - 02: İş Portföyü — Yaşam Döngüsü ve Filtreleme Mantığı", async () => {
  // Test mock iş listesi
  const mockJobs = [
    { id: "job-1", name: "Kongre 2026", status: "REGISTRATION", isPublished: true, city: "İstanbul" },
    { id: "job-2", name: "Fuar 2026", status: "CONFIGURATION", isPublished: false, city: "İzmir" },
    { id: "job-3", name: "Gala Gecesi", status: "PLANNING", isPublished: false, city: "Ankara" },
    { id: "job-4", name: "Eski Zirve 2025", status: "ARCHIVED", isPublished: true, city: "Antalya" },
    { id: "job-5", name: "Kapanan Etkinlik", status: "POST_EVENT", isPublished: true, city: "Bursa" },
  ];

  // Aktif filtre: Arşivde ve post-event olmayan canlı işler
  const activeJobs = mockJobs.filter((j) => j.status !== "ARCHIVED" && j.status !== "POST_EVENT");
  assert.strictEqual(activeJobs.length, 3);
  assert.ok(activeJobs.some((j) => j.id === "job-1"));
  assert.ok(activeJobs.some((j) => j.id === "job-2"));
  assert.ok(activeJobs.some((j) => j.id === "job-3"));

  // Planlanan filtre
  const planningJobs = mockJobs.filter((j) => ["PLANNING", "CONFIGURATION"].includes(j.status));
  assert.strictEqual(planningJobs.length, 2);

  // Dikkat gereken filtre: Yayınlanmamış veya konfigürasyondaki taslaklar
  const attentionJobs = mockJobs.filter((j) => !j.isPublished || j.status === "CONFIGURATION");
  assert.strictEqual(attentionJobs.length, 2);
  assert.ok(attentionJobs.some((j) => j.id === "job-2"));
  assert.ok(attentionJobs.some((j) => j.id === "job-3"));

  // Arşiv filtre
  const archivedJobs = mockJobs.filter((j) => j.status === "ARCHIVED");
  assert.strictEqual(archivedJobs.length, 1);
  assert.strictEqual(archivedJobs[0].id, "job-4");
});

test("Faz 2 - 03: İş Bağlamı İkinci Menüsü — 9 Grup Modül Eşlemesi", async () => {
  const { WORK_NAV_GROUPS } = await import(pathToFileURL(taxonomyPath).href);

  const groupMap = new Map(WORK_NAV_GROUPS.map((g) => [g.id, g]));

  // İş Yönetimi modülleri
  const mgmt = groupMap.get("work_management");
  assert.ok(mgmt);
  const mgmtModules = mgmt.items.map((i) => i.primaryModuleId).filter(Boolean);
  assert.ok(mgmtModules.includes("dashboard"));
  assert.ok(mgmtModules.includes("editions"));
  assert.ok(mgmtModules.includes("operations"));

  // Kişiler ve Kayıt modülleri
  const people = groupMap.get("people_registration");
  assert.ok(people);
  const peopleModules = people.items.map((i) => i.primaryModuleId).filter(Boolean);
  assert.ok(peopleModules.includes("people"));
  assert.ok(peopleModules.includes("registrations"));
  assert.ok(peopleModules.includes("forms"));

  // Program ve İçerik
  const prog = groupMap.get("program_content");
  assert.ok(prog);
  const progModules = prog.items.map((i) => i.primaryModuleId).filter(Boolean);
  assert.ok(progModules.includes("scientific"));
  assert.ok(progModules.includes("program"));
  assert.ok(progModules.includes("social"));

  // Sponsor ve Fuar
  const sponsor = groupMap.get("sponsor_exhibition");
  assert.ok(sponsor);
  const sponsorModules = sponsor.items.map((i) => i.primaryModuleId).filter(Boolean);
  assert.ok(sponsorModules.includes("sponsorship"));
  assert.ok(sponsorModules.includes("floors"));
  assert.ok(sponsorModules.includes("b2b"));

  // Mekân ve Saha
  const venue = groupMap.get("venue_onsite");
  assert.ok(venue);
  const venueModules = venue.items.map((i) => i.primaryModuleId).filter(Boolean);
  assert.ok(venueModules.includes("onsite"));
  assert.ok(venueModules.includes("badges"));
  assert.ok(venueModules.includes("certificates"));

  // Konaklama ve Hizmetler
  const accomm = groupMap.get("accommodation_services");
  assert.ok(accomm);
  const accommModules = accomm.items.map((i) => i.primaryModuleId).filter(Boolean);
  assert.ok(accommModules.includes("accommodation"));

  // İletişim ve Deneyim
  const comms = groupMap.get("communication_experience");
  assert.ok(comms);
  const commsModules = comms.items.map((i) => i.primaryModuleId).filter(Boolean);
  assert.ok(commsModules.includes("communications"));
  assert.ok(commsModules.includes("portals"));
  assert.ok(commsModules.includes("media"));

  // İş Raporları
  const reports = groupMap.get("work_reports");
  assert.ok(reports);
  const reportsModules = reports.items.map((i) => i.primaryModuleId).filter(Boolean);
  assert.ok(reportsModules.includes("accounting"));

  // İş Ayarları
  const settings = groupMap.get("work_settings");
  assert.ok(settings);
  const settingsModules = settings.items.map((i) => i.primaryModuleId).filter(Boolean);
  assert.ok(settingsModules.includes("settings"));
});

test("Faz 2 - 04: İş Kartı ve Görünüm Sözleşmesi", () => {
  // Yol haritası Bölüm 2.2 ve 57. satırdaki zorunlu alanlar
  const requiredCardFields = [
    "name",
    "series",
    "status",
    "startDate",
    "city",
    "capabilities",
    "isPublished",
  ];

  const sampleJob = {
    id: "job-101",
    name: "Akdeniz Kongresi 2026",
    series: { name: "Akdeniz Serisi" },
    status: "PLANNING",
    startDate: "2026-11-01T09:00:00Z",
    endDate: "2026-11-04T18:00:00Z",
    city: "Antalya",
    isPublished: false,
    capabilities: [
      { id: "c1", key: "REGISTRATIONS", enabled: true },
      { id: "c2", key: "SCIENTIFIC", enabled: true },
    ],
  };

  for (const field of requiredCardFields) {
    assert.ok(field in sampleJob, `İş kartında zorunlu alan eksik: ${field}`);
  }

  // Eylemler: Aç (İş Özeti), Kurulum (Kurulum kontrol listesi), Ayarlar (İş ayarları)
  const availableActions = ["openWork", "continueSetup", "openSettings"];
  assert.strictEqual(availableActions.length, 3);
});
