// CRON-E2E — Modül: Portal Anasayfa (widget grid)
// Tam akış: widget grid admin yapılandırmasını (widgetsJson) yansıtır —
// AUTH görünürlüğü, sıra (order) ve enabled kapatma anında portala yansır
import { test, expect } from "@playwright/test";
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { guestLogin } from "./_helpers";

const db = new PrismaClient();
const SLUG = "no-dig-turkey-2026";

test("SMOKE — anasayfa widget'ları (sıradaki oturum + sponsorlar) görünür", async ({ page }) => {
  await guestLogin(page);
  await expect(page.getByText(/Sıradaki oturum|Next session/i)).toBeVisible();
  await expect(page.getByText(/Sponsorlarımız|Our sponsors/i)).toBeVisible();
});

test("FULL — widget grid admin yapılandırmasına göre görünürlük + sıra yansır", async ({ page }) => {
  const edition = await db.eventEdition.findUnique({ where: { slug: SLUG }, select: { id: true } });
  expect(edition).not.toBeNull();
  const config = await db.eventPortalConfig.findUnique({ where: { editionId: edition!.id }, select: { id: true, widgetsJson: true } });

  type W = { key: string; enabled: boolean; visibility: "ALL" | "AUTH"; order: number };
  // sunucu tarafı tek doğruluk: content route DEFAULT_WIDGETS + widgetsJson birleşimi
  const DEFAULTS: W[] = [
    { key: "agenda", enabled: true, visibility: "ALL", order: 0 },
    { key: "speakers", enabled: true, visibility: "ALL", order: 1 },
    { key: "forms", enabled: true, visibility: "ALL", order: 2 },
    { key: "qa", enabled: true, visibility: "ALL", order: 3 },
    { key: "map", enabled: true, visibility: "ALL", order: 4 },
    { key: "b2b", enabled: true, visibility: "AUTH", order: 5 },
    { key: "game", enabled: true, visibility: "ALL", order: 6 },
  ];
  const merged: W[] = (() => {
    let parsed: Record<string, { enabled?: boolean; visibility?: string; order?: number }> | null = null;
    try { parsed = config?.widgetsJson ? JSON.parse(config.widgetsJson) : null; } catch { parsed = null; }
    return DEFAULTS.map((d) => {
      const o = parsed?.[d.key];
      if (!o || typeof o !== "object") return { ...d };
      return {
        key: d.key,
        enabled: o.enabled === undefined ? d.enabled : Boolean(o.enabled),
        visibility: d.key === "b2b" ? "AUTH" : o.visibility === "AUTH" ? "AUTH" : "ALL",
        order: Number.isFinite(o.order) ? Math.max(0, Math.round(Number(o.order))) : d.order,
      };
    });
  })();

  const LABELS: Record<string, RegExp> = {
    agenda: /Genel Program|Agenda|Program/i,
    speakers: /Konuşmacılar|Speakers/i,
    forms: /Formlar & Quizler|Forms & Quizzes/i,
    qa: /Soru-Cevap|Q&A/i,
    map: /Mekan & Kroki|Venue|Map/i,
    b2b: /B2B Görüşmeler|B2B/i,
    game: /Görevler & Rozetler|Badges & Quests/i,
  };
  const person = await db.person.create({
    data: { tenantId: (await db.eventEdition.findUnique({ where: { slug: SLUG }, select: { tenantId: true } }))!.tenantId, firstName: "E2E", lastName: "Widget", email: `e2e-widget-${Date.now()}@test.local` },
    select: { id: true },
  });

  try {
    // ── GUEST grid: yalnız ALL görünür + admin sırası korunur ──
    await guestLogin(page);
    const grid = page.getByRole("list", { name: /Modüller|Modules/i });
    const guestExpected = merged.filter((w) => w.enabled && w.visibility === "ALL").sort((a, b) => a.order - b.order);
    expect(guestExpected.length).toBeGreaterThan(0);
    // ilk kart admin'in en düşük order'lı widget'ıdır
    await expect(grid.getByRole("listitem").first()).toHaveText(new RegExp(LABELS[guestExpected[0].key].source, "i"));
    // AUTH-only (b2b) GUEST grid'inde ASLA yok
    if (merged.some((w) => w.key === "b2b" && w.enabled)) {
      await expect(grid.getByRole("listitem").filter({ hasText: LABELS.b2b })).toHaveCount(0);
    }
    const guestCount = await grid.getByRole("listitem").count();
    expect(guestCount).toBe(guestExpected.length);

    // ── AUTH grid: b2b dahil ──
    const raw = `pt_${randomBytes(16).toString("hex")}`;
    await db.portalToken.create({
      data: { tokenHash: createHash("sha256").update(raw).digest("hex"), scope: "PARTICIPANT", editionId: edition!.id, personId: person.id, issuedBy: "E2E", expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await page.goto(`/?portal=${SLUG}&t=${raw}`);
    await expect(page.getByRole("list", { name: /Modüller|Modules/i })).toBeVisible({ timeout: 20_000 });
    const authGrid = page.getByRole("list", { name: /Modüller|Modules/i });
    const authExpected = merged.filter((w) => w.enabled).sort((a, b) => a.order - b.order);
    expect(await authGrid.getByRole("listitem").count()).toBe(authExpected.length);
    if (authExpected.some((w) => w.key === "b2b")) {
      await expect(authGrid.getByRole("listitem").filter({ hasText: LABELS.b2b })).toBeVisible();
    }

    // ── admin kapatması grid'e anında yansır (map kapat → kaybolur → diğerleri yerinde) ──
    // canlı AUTH oturumu localStorage'da yaşıyor — portal otomatik devam eder
    const disabled = merged.map((w) => (w.key === "map" ? { ...w, enabled: false } : w));
    await db.eventPortalConfig.update({ where: { id: config!.id }, data: { widgetsJson: JSON.stringify(disabled) } });
    await page.goto("/?portal=no-dig-turkey-2026");
    const gridAfter = page.getByRole("list", { name: /Modüller|Modules/i });
    await expect(gridAfter.getByRole("listitem").filter({ hasText: LABELS.map })).toHaveCount(0);
    // diğerleri hâlâ yerinde
    await expect(gridAfter.getByRole("listitem").filter({ hasText: LABELS.agenda })).toBeVisible();
  } finally {
    await db.portalToken.deleteMany({ where: { personId: person.id } }).catch(() => undefined);
    await db.person.delete({ where: { id: person.id } }).catch(() => undefined);
    if (config) await db.eventPortalConfig.update({ where: { id: config.id }, data: { widgetsJson: config.widgetsJson } }).catch(() => undefined);
  }
});
