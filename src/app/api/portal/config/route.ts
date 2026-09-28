// Admin Yapılandırma Modülü — "Katılımcı Portalı Ayarları" veri ucu (§5)
// GET  : yapılandırma + bağlama seçenekleri (formlar, edisyonlar, sponsorlar, kişiler)
// PUT  : yapılandırma kaydı — TÜM alanlar doğrulanır; ActivityLog PII'siz iz bırakır
// Yetki: requireAdmin + resolveEditionContext (kiracı/edisyon bağlamı — IDOR kapalı)
// Kapsülleme (§Teknik 3): yalnız EventPortalConfig + edition portalHeader* alanlarına
// yazar; bilet/muhasebe/program tablolarına DOKUNMAZ.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth/request-context";
import { generateEventCode, normalizeEventCode } from "@/lib/api/portal-access";
import { ALL_FONT_KEYS } from "@/lib/portal-fonts";

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

// JSON dizi alanları: dizi ↔ depolama dizesi
function toJsonArray(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return JSON.stringify(v.filter((x) => typeof x === "string"));
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    try {
      const p = JSON.parse(t) as unknown;
      return Array.isArray(p) ? JSON.stringify(p.filter((x) => typeof x === "string")) : null;
    } catch {
      return null;
    }
  }
  return null;
}
function toJsonObject(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "object" && !Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    try {
      const p = JSON.parse(t) as unknown;
      return p && typeof p === "object" && !Array.isArray(p) ? JSON.stringify(p) : null;
    } catch {
      return null;
    }
  }
  return null;
}
function toHexColor(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim())) return v.trim().toLowerCase();
  return undefined; // geçersiz → alan yok sayılır
}
function toDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "portal-config-read", limit: 60, windowMs: 60_000 });
    if (denied) return denied;
    const editionId = req.nextUrl.searchParams.get("editionId");
    const ctx = await resolveEditionContext(editionId, { required: true });
    const eid = ctx.editionId as string;

    // kayıt yoksa varsayılanlarla oluştur (lazy init — sıfır hardcode)
    const config = await db.eventPortalConfig.upsert({
      where: { editionId: eid },
      create: { editionId: eid },
      update: {},
    });

    // bağlama seçenekleri (§5.2/5.5): diğer edisyonlar, kayıt formları, sponsorlar, kişiler
    const edition = await db.eventEdition.findUnique({
      where: { id: eid },
      select: { tenantId: true, portalHeaderTitle: true, portalHeaderSubtitle: true, portalHeaderImageUrl: true, portalHeaderAccent: true },
    });
    const [editions, forms, agreements, people] = await Promise.all([
      db.eventEdition.findMany({
        where: { tenantId: edition?.tenantId ?? "__none__", NOT: { id: eid } },
        select: { id: true, name: true, editionLabel: true, startDate: true, isPublished: true },
        orderBy: { startDate: "asc" },
      }),
      db.formDefinition.findMany({
        where: { editionId: eid, isPublic: true },
        select: { id: true, name: true, type: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
      db.sponsorAgreement.findMany({
        where: { editionId: eid, status: { in: ["ACTIVE", "CONTRACTED"] } },
        select: { organization: { select: { id: true, name: true, logoUrl: true } }, tier: { select: { name: true } } },
      }),
      db.eventParticipation.findMany({
        where: { editionId: eid },
        select: { person: { select: { id: true, firstName: true, lastName: true, email: true, company: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const sponsorMap = new Map<string, { id: string; name: string; logoUrl: string | null; tierName: string | null }>();
    for (const a of agreements) {
      if (a.organization && !sponsorMap.has(a.organization.id)) {
        sponsorMap.set(a.organization.id, { id: a.organization.id, name: a.organization.name, logoUrl: a.organization.logoUrl, tierName: a.tier?.name ?? null });
      }
    }

    return NextResponse.json({
      config,
      header: {
        title: edition?.portalHeaderTitle ?? "",
        subtitle: edition?.portalHeaderSubtitle ?? "",
      },
      lookups: {
        editions,
        forms,
        sponsors: [...sponsorMap.values()],
        people: people.map((p) => p.person).filter((p): p is NonNullable<typeof p> => Boolean(p)).slice(0, 500),
      },
    });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/config GET:", e);
    return NextResponse.json({ error: "Portal yapılandırması alınamadı" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "portal-config-write", limit: 30, windowMs: 60_000 });
    if (denied) return denied;
    const body = (await req.json()) as {
      editionId?: string;
      portalEnabled?: boolean;
      maintenanceMessage?: string | null;
      countdownTo?: string | null;
      eventCode?: string | null; // "__AUTO__" → yeni kod üret
      allowRegistrationRedirect?: boolean;
      registrationFormId?: string | null;
      portalLogoUrl?: string | null;
      portalBannerUrl?: string | null;
      themeColor?: string | null;
      headerEvents?: string[] | null;
      bottomNav?: Record<string, boolean> | null;
      widgets?: Record<string, { enabled?: boolean; visibility?: string; order?: number }> | null;
      notificationsEnabled?: boolean;
      notifyOffsets?: number[] | null;
      sponsorIds?: string[] | null;
      venueMapUrl?: string | null;
      venueMapEnabled?: boolean;
      pwaEnabled?: boolean;
      headerTitle?: string | null;
      headerSubtitle?: string | null;
      // ── Mobil Portal tasarım kontrolü (§5.2+ kullanıcı isteği) ──
      fontFamily?: string | null;
      fontScale?: number | null;
      headerBgColor?: string | null;
      footerBgColor?: string | null;
      contentBgColor?: string | null;
      headerBgImage?: string | null;
      footerBgImage?: string | null;
      contentBgImage?: string | null;
      portalSponsorLogoUrl?: string | null;
      portalSponsorName?: string | null;
      portalSponsorUrl?: string | null;
      iconOverrides?: Record<string, { icon?: string; svg?: string; color?: string }> | null;
      iconLayout?: Record<string, number> | null;
      // ── Ekran üst-bant görünürlüğü (her ekran için custom karar) ──
      chrome?: { topHeader?: Record<string, boolean>; eventBar?: Record<string, boolean> } | null;
      // ── Oyunlaştırma (§ gamification — formlarla etkileşimli) ──
      gameEnabled?: boolean;
      gameConfig?: { points?: Record<string, number>; levels?: { name: string; min: number }[]; qaCap?: number; masking?: string } | null;
    };
    if (!body.editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
    const ctx = await resolveEditionContext(body.editionId, { required: true });
    const eid = ctx.editionId as string;

    const data: Record<string, unknown> = {};
    if (body.portalEnabled !== undefined) data.portalEnabled = Boolean(body.portalEnabled);
    if (body.maintenanceMessage !== undefined) data.maintenanceMessage = body.maintenanceMessage?.slice(0, 300) || null;
    const cd = toDate(body.countdownTo);
    if (cd !== undefined) data.countdownTo = cd;
    if (body.eventCode !== undefined) {
      if (body.eventCode === "__AUTO__") {
        data.eventCode = generateEventCode();
      } else {
        data.eventCode = body.eventCode ? normalizeEventCode(body.eventCode).slice(0, 24) : null;
      }
    }
    if (body.allowRegistrationRedirect !== undefined) data.allowRegistrationRedirect = Boolean(body.allowRegistrationRedirect);
    if (body.registrationFormId !== undefined) {
      if (body.registrationFormId) {
        // hedef form bu edisyona ait mi? (çapraz bağlama kapalı)
        const f = await db.formDefinition.findUnique({ where: { id: body.registrationFormId }, select: { editionId: true } });
        if (!f || f.editionId !== eid) return NextResponse.json({ error: "Kayıt formu bu etkinliğe ait değil" }, { status: 400 });
      }
      data.registrationFormId = body.registrationFormId || null;
    }
    if (body.portalLogoUrl !== undefined) data.portalLogoUrl = body.portalLogoUrl?.slice(0, 2_000_000) || null;
    if (body.portalBannerUrl !== undefined) data.portalBannerUrl = body.portalBannerUrl?.slice(0, 2_000_000) || null;
    const theme = toHexColor(body.themeColor);
    if (theme !== undefined) data.themeColor = theme;
    if (body.headerEvents !== undefined) data.headerEventsJson = toJsonArray(body.headerEvents);
    if (body.bottomNav !== undefined) data.bottomNavJson = toJsonObject(body.bottomNav);
    if (body.widgets !== undefined) {
      const obj = toJsonObject(body.widgets);
      if (obj) {
        // §5.3: B2B görünürlüğü ZORUNLU AUTH — istek ne derse desin
        const parsed = JSON.parse(obj) as Record<string, { enabled?: boolean; visibility?: string; order?: number }>;
        for (const k of Object.keys(parsed)) {
          if (k === "b2b") parsed[k] = { ...parsed[k], visibility: "AUTH" };
        }
        data.widgetsJson = JSON.stringify(parsed);
      } else {
        data.widgetsJson = null;
      }
    }
    if (body.notificationsEnabled !== undefined) data.notificationsEnabled = Boolean(body.notificationsEnabled);
    if (body.notifyOffsets !== undefined) {
      const offs = Array.isArray(body.notifyOffsets)
        ? body.notifyOffsets.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n <= 10_080).slice(0, 5)
        : [];
      data.notifyOffsetsJson = offs.length > 0 ? JSON.stringify(offs) : JSON.stringify([60, 30, 10]);
    }
    if (body.sponsorIds !== undefined) data.sponsorIdsJson = toJsonArray(body.sponsorIds);
    if (body.venueMapUrl !== undefined) data.venueMapUrl = body.venueMapUrl?.slice(0, 2_000_000) || null;
    if (body.venueMapEnabled !== undefined) data.venueMapEnabled = Boolean(body.venueMapEnabled);
    if (body.pwaEnabled !== undefined) data.pwaEnabled = Boolean(body.pwaEnabled);

    // ── tasarım alanları (§5.2+) ──
    if (body.fontFamily !== undefined) {
      data.fontFamily = body.fontFamily && ALL_FONT_KEYS.has(body.fontFamily) ? body.fontFamily : null;
    }
    if (body.fontScale !== undefined) {
      const n = Number(body.fontScale);
      data.fontScale = Number.isFinite(n) && n >= 90 && n <= 120 ? Math.round(n) : null;
    }
    for (const k of ["headerBgColor", "footerBgColor", "contentBgColor"] as const) {
      const c = toHexColor(body[k]);
      if (c !== undefined) data[k] = c;
    }
    for (const k of ["headerBgImage", "footerBgImage", "contentBgImage"] as const) {
      if (body[k] !== undefined) data[k] = (body[k] as string | null)?.slice(0, 2_000_000) || null;
    }
    if (body.portalSponsorLogoUrl !== undefined) data.portalSponsorLogoUrl = body.portalSponsorLogoUrl?.slice(0, 2_000_000) || null;
    if (body.portalSponsorName !== undefined) data.portalSponsorName = body.portalSponsorName?.slice(0, 120) || null;
    if (body.portalSponsorUrl !== undefined) {
      const u = body.portalSponsorUrl?.trim() || "";
      // yalnız http(s) — javascript:/data: enjeksiyonu kapalı
      data.portalSponsorUrl = /^https?:\/\//i.test(u) ? u.slice(0, 300) : null;
    }
    if (body.iconOverrides !== undefined) {
      const obj = toJsonObject(body.iconOverrides);
      if (obj) {
        // biçim doğrulama: {navKey: {icon?, svg?, color?}} — icon kütüphane adı, svg yalnız data:image/(svg|png|jpeg|webp)
        const parsed = JSON.parse(obj) as Record<string, { icon?: unknown; svg?: unknown; color?: unknown }>;
        const clean: Record<string, { icon?: string; svg?: string; color?: string }> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (!v || typeof v !== "object") continue;
          const e: { icon?: string; svg?: string; color?: string } = {};
          if (typeof v.icon === "string" && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(v.icon)) e.icon = v.icon;
          if (typeof v.svg === "string" && /^data:image\/(svg\+xml|png|jpeg|webp);base64,/.test(v.svg) && v.svg.length <= 2_000_000) e.svg = v.svg;
          if (typeof v.color === "string" && /^#[0-9a-fA-F]{6}$/.test(v.color)) e.color = v.color.toLowerCase();
          if (e.icon || e.svg || e.color) clean[k] = e;
        }
        data.iconOverridesJson = JSON.stringify(clean);
      } else {
        data.iconOverridesJson = null;
      }
    }
    if (body.iconLayout !== undefined) {
      const obj = toJsonObject(body.iconLayout);
      if (obj) {
        // biçim: {navKey: order} — order 0..9 tamsayı (grid konum/sıra)
        const parsed = JSON.parse(obj) as Record<string, unknown>;
        const clean: Record<string, number> = {};
        for (const [k, v] of Object.entries(parsed)) {
          const n = Number(v);
          if (Number.isInteger(n) && n >= 0 && n <= 9) clean[k] = n;
        }
        data.iconLayoutJson = JSON.stringify(clean);
      } else {
        data.iconLayoutJson = null;
      }
    }

    // ── ekran üst-bant görünürlüğü (chrome) — bilinen ekran anahtarlarıyla beyaz-liste ──
    if (body.chrome !== undefined) {
      // MC-9: nav ekran kümesiyle birebir — "form" bilinçli dışarıda (formda üst-bant gizlenemez).
      const CHROME_SCREENS = new Set(["home", "program", "speakers", "forms", "qa", "sponsors", "map", "b2b", "profile", "game"]);
      if (body.chrome && typeof body.chrome === "object") {
        const clean: { topHeader: Record<string, boolean>; eventBar: Record<string, boolean> } = { topHeader: {}, eventBar: {} };
        for (const [screen, on] of Object.entries(body.chrome.topHeader ?? {})) {
          if (CHROME_SCREENS.has(screen)) clean.topHeader[screen] = Boolean(on);
        }
        for (const [screen, on] of Object.entries(body.chrome.eventBar ?? {})) {
          if (CHROME_SCREENS.has(screen)) clean.eventBar[screen] = Boolean(on);
        }
        data.chromeJson = JSON.stringify(clean);
      } else {
        data.chromeJson = null;
      }
    }

    // ── oyunlaştırma yapılandırması ──
    if (body.gameEnabled !== undefined) data.gameEnabled = Boolean(body.gameEnabled);
    if (body.gameConfig !== undefined) {
      if (body.gameConfig && typeof body.gameConfig === "object") {
        const points: Record<string, number> = {};
        for (const [k, v] of Object.entries(body.gameConfig.points ?? {})) {
          if (!"FORM_SUBMIT,QA_SUBMIT,B2B_ACCEPT".split(",").includes(k)) continue;
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0 && n <= 10_000) points[k] = Math.round(n);
        }
        const levels: { name: string; min: number }[] = [];
        const rawLevels = Array.isArray(body.gameConfig.levels) ? body.gameConfig.levels : [];
        for (const l of rawLevels) {
          if (!l || typeof l !== "object") continue;
          const name = String((l as { name?: unknown }).name ?? "").trim().slice(0, 40);
          const min = Number((l as { min?: unknown }).min);
          if (!name || !Number.isFinite(min) || min < 0 || min > 1_000_000) continue;
          levels.push({ name, min: Math.round(min) });
        }
        levels.sort((a, b) => a.min - b.min);
        const qaCap = Number((body.gameConfig as { qaCap?: unknown }).qaCap);
        const cleanGame: Record<string, unknown> = { points, levels: levels.length >= 2 ? levels : [] };
        if (Number.isFinite(qaCap)) cleanGame.qaCap = Math.max(1, Math.min(50, Math.round(qaCap)));
        // liderlik ad-masking politikası — yalnız bilinen değerler; eksikse mevcut config'teki değer korunur
        const masking = String((body.gameConfig as { masking?: unknown }).masking ?? "").toUpperCase();
        if ("MASKED,FULL,HIDDEN".split(",").includes(masking)) {
          cleanGame.masking = masking;
        } else {
          const cur = await db.eventPortalConfig.findUnique({
            where: { editionId: eid },
            select: { gameConfigJson: true },
          });
          const curMasking = cur?.gameConfigJson
            ? (JSON.parse(cur.gameConfigJson) as { masking?: string }).masking
            : undefined;
          if (curMasking) cleanGame.masking = curMasking;
        }
        if (levels.length >= 2) data.gameConfigJson = JSON.stringify(cleanGame);
      } else {
        data.gameConfigJson = null;
      }
    }

    const config = await db.eventPortalConfig.upsert({
      where: { editionId: eid },
      create: { editionId: eid, ...data },
      update: data,
    });

    // edition portalHeader* (mevcut alanlar — Dış Portal başlığı tasarımıyla paylaşılır)
    const edData: Record<string, unknown> = {};
    if (body.headerTitle !== undefined) edData.portalHeaderTitle = body.headerTitle?.slice(0, 120) || null;
    if (body.headerSubtitle !== undefined) edData.portalHeaderSubtitle = body.headerSubtitle?.slice(0, 200) || null;
    if (Object.keys(edData).length > 0) {
      await db.eventEdition.update({ where: { id: eid }, data: edData });
    }

    await db.activityLog.create({
      data: {
        editionId: eid,
        type: "PORTAL_CONFIG_SAVED",
        message: `Portal yapılandırması güncellendi — portal ${config.portalEnabled ? "AKTİF" : "PASİF"}, kod: ${config.eventCode ? "tanımlı" : "yok"}`,
        entityType: "portal-config",
        entityId: config.id,
        actorName: "Yönetici",
      },
    });
    return NextResponse.json(config);
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/config PUT:", e);
    return NextResponse.json({ error: "Portal yapılandırması kaydedilemedi" }, { status: 400 });
  }
}
