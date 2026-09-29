// PWA Katılımcı Dış Portalı — İÇERİK PAKETİ (§3 UI/UX veri kaynağı)
// İki mod:
//   • oturumsuz  → yalnız giriş-ekranı bağlamı (marka, bakım/geri sayım) — veri ifşası yok
//   • oturumlu   → tam paket: edisyon, organizatör, diğer etkinlikler, program,
//                  konuşmacılar, sponsorlar, formlar, duyurular, bloklar,
//                  widget yapılandırması (RBAC filtreli), B2B (yalnız AUTH)
// Veri KOPYALANMAZ: program/sponsor/konuşmacı mevcut tablolardan FK üzerinden okunur.
// RBAC (§5.3): widget görünürlüğü sunucuda oturum türüne göre filtrelenir — B2B
// zorunlu olarak yalnız AUTH oturumunda görünür.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { extractSession, validatePortalSession, touchSession, type PortalSessionRow } from "@/lib/api/portal-access";
import { parsePwaSettings } from "@/lib/pwa-settings";

export const dynamic = "force-dynamic";

// ── widget yönetimi (§5.3) — sunucu tarafı tek doğruluk kaynağı ──
type WidgetCfg = { key: string; enabled: boolean; visibility: "ALL" | "AUTH"; order: number };
const DEFAULT_WIDGETS: WidgetCfg[] = [
  { key: "agenda", enabled: true, visibility: "ALL", order: 0 },
  { key: "speakers", enabled: true, visibility: "ALL", order: 1 },
  { key: "forms", enabled: true, visibility: "ALL", order: 2 },
  { key: "qa", enabled: true, visibility: "ALL", order: 3 },
  { key: "map", enabled: true, visibility: "ALL", order: 4 },
  { key: "b2b", enabled: true, visibility: "AUTH", order: 5 }, // §5.3: B2B zorunlu AUTH
  { key: "game", enabled: true, visibility: "ALL", order: 6 }, // oyunlaştırma — form/QA/B2B etkileşimli puan
];
const WIDGET_KEYS = new Set(DEFAULT_WIDGETS.map((w) => w.key));

export function parseWidgets(raw: string | null | undefined): WidgetCfg[] {
  if (!raw) return DEFAULT_WIDGETS;
  try {
    const parsed = JSON.parse(raw) as Record<string, { enabled?: boolean; visibility?: string; order?: number }>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return DEFAULT_WIDGETS;
    // bilinmeyen anahtarlar atılır, eksikler varsayılanla doldurulur; B2B AUTH'a zorlanır
    return DEFAULT_WIDGETS.map((d) => {
      const o = parsed[d.key];
      if (!o || typeof o !== "object") return { ...d };
      return {
        key: d.key,
        enabled: o.enabled === undefined ? d.enabled : Boolean(o.enabled),
        visibility: d.key === "b2b" ? "AUTH" : o.visibility === "AUTH" ? "AUTH" : "ALL",
        order: Number.isFinite(o.order) ? Math.max(0, Math.round(Number(o.order))) : d.order,
      };
    });
  } catch {
    return DEFAULT_WIDGETS;
  }
}

export function parseBottomNav(raw: string | null | undefined): Record<string, boolean> {
  const def = { program: true, sponsors: true, map: true }; // anasayfa + profil sabit
  if (!raw) return def;
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      program: p.program === undefined ? true : Boolean(p.program),
      sponsors: p.sponsors === undefined ? true : Boolean(p.sponsors),
      map: p.map === undefined ? true : Boolean(p.map),
    };
  } catch {
    return def;
  }
}

function parseIdArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

// sayısal dizi ayrıştırıcı — bildirim tetikleri (dakika) gibi listeler için
function parseNumberArray(raw: string | null | undefined, fallback: number[]): number[] {
  if (!raw) return fallback;
  try {
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return fallback;
    const nums = p.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    return nums.length > 0 ? nums : fallback;
  } catch {
    return fallback;
  }
}

// JSON nesne ayrıştırıcı — tasarım alanları (iconOverrides/iconLayout) için
function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as unknown;
    return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// oyunlaştırma kuralları — config.gameConfigJson + gameEnabled → istemci sözleşmesi
type GameConfigView = { enabled: boolean; points: Record<string, number>; levels: { name: string; min: number }[] };
function parseGameConfig(config: {
  gameEnabled?: boolean; gameConfigJson?: string | null;
} | null): GameConfigView {
  const out: GameConfigView = {
    enabled: config?.gameEnabled ?? false,
    points: { FORM_SUBMIT: 20, QA_SUBMIT: 10, B2B_ACCEPT: 15 },
    levels: [
      { name: "Bronz", min: 0 },
      { name: "Gümüş", min: 50 },
      { name: "Altın", min: 150 },
      { name: "Elmas", min: 300 },
    ],
  };
  if (!config?.gameConfigJson) return out;
  try {
    const p = JSON.parse(config.gameConfigJson) as { points?: Record<string, number>; levels?: { name: string; min: number }[] };
    if (p.points && typeof p.points === "object") out.points = { ...out.points, ...p.points };
    if (Array.isArray(p.levels) && p.levels.length >= 2) out.levels = p.levels;
  } catch {
    /* bozuk json → varsayılanlar */
  }
  return out;
}

export async function GET(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "portal-content", limit: 120, windowMs: 60_000 });
  if (denied) return denied;

  try {
    const slug = req.nextUrl.searchParams.get("slug")?.trim() ?? "";
    if (!slug) return NextResponse.json({ error: "slug zorunlu" }, { status: 400 });

    const edition = await db.eventEdition.findUnique({
      where: { slug },
      include: {
        tenant: { select: { id: true, name: true, logoUrl: true } },
      },
    });
    if (!edition || !edition.isPublished) {
      return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    }

    const config = await db.eventPortalConfig.findUnique({ where: { editionId: edition.id } });

    // oturum çözümlemesi — yoksa giriş-ekranı bağlamı döner
    const rawSession = extractSession(req);
    let session: PortalSessionRow | null = null;
    let sessionKind: "GUEST" | "AUTH" | null = null;
    if (rawSession) {
      const check = await validatePortalSession(rawSession);
      if (check.ok && check.session.editionId === edition.id) {
        session = check.session;
        sessionKind = check.session.kind === "AUTH" ? "AUTH" : "GUEST";
        touchSession(check.session.id);
      }
    }

    // ortak edisyon görünümü (PII yok)
    const editionView = {
      id: edition.id,
      slug: edition.slug,
      name: edition.name,
      editionLabel: edition.editionLabel,
      startDate: edition.startDate,
      endDate: edition.endDate,
      venueName: edition.venueName,
      city: edition.city,
      description: edition.description,
      // portal logosu/baneri öncelikli — yoksa etkinlik kimliği görselleri
      logoUrl: config?.portalLogoUrl ?? edition.logoUrl,
      headerImageUrl: config?.portalBannerUrl ?? edition.portalHeaderImageUrl,
      portalHeaderTitle: edition.portalHeaderTitle,
      portalHeaderSubtitle: edition.portalHeaderSubtitle,
      portalHeaderAccent: edition.portalHeaderAccent ?? config?.themeColor,
    };
    const tenantView = { name: edition.tenant.name, logoUrl: edition.tenant.logoUrl };

    // ── oturumsuz: giriş bağlamı ──
    if (!sessionKind) {
      return NextResponse.json({
        phase: config?.portalEnabled ? "LOGIN" : "DISABLED",
        edition: editionView,
        tenant: tenantView,
        maintenanceMessage: config?.maintenanceMessage ?? null,
        countdownTo: config?.countdownTo ?? null,
        loginOptions: {
          codeLogin: Boolean(config?.eventCode),
          emailLogin: Boolean(config?.eventCode),
          allowRegistrationRedirect: config?.allowRegistrationRedirect ?? true,
          registrationFormId: config?.registrationFormId ?? null,
        },
        // giriş ekranı da marka uygular (font + alan-renkleri/görselleri + sponsor şeridi)
        config: {
          themeColor: config?.themeColor ?? null,
          design: {
            fontFamily: config?.fontFamily ?? null,
            fontScale: config?.fontScale ?? null,
            headerBgColor: config?.headerBgColor ?? null,
            footerBgColor: config?.footerBgColor ?? null,
            contentBgColor: config?.contentBgColor ?? null,
            headerBgImage: config?.headerBgImage ?? null,
            footerBgImage: config?.footerBgImage ?? null,
            contentBgImage: config?.contentBgImage ?? null,
            iconOverrides: null,
            iconLayout: null,
          },
          game: {
            enabled: false,
            points: {},
            levels: [],
          },
          portalSponsor: {
            logoUrl: config?.portalSponsorLogoUrl ?? null,
            name: config?.portalSponsorName ?? null,
            url: config?.portalSponsorUrl ?? null,
          },
        },
      });
    }

    // ── oturumlu: tam paket ──
    const widgetsAll = parseWidgets(config?.widgetsJson).filter((w) => w.enabled);
    const widgets = widgetsAll
      .filter((w) => (sessionKind === "AUTH" ? true : w.visibility === "ALL"))
      .sort((a, b) => a.order - b.order);

    // diğer etkinlikler — Top Header carousel (§3.1): admin seçimi; boşsa yayındaki diğerleri
    const tenantEditions = await db.eventEdition.findMany({
      where: { tenantId: edition.tenantId, isPublished: true, NOT: { id: edition.id } },
      select: { id: true, slug: true, name: true, editionLabel: true, startDate: true, endDate: true, city: true, logoUrl: true, headerImageUrl: true, isFeatured: true },
      orderBy: { startDate: "asc" },
    });
    const selectedIds = parseIdArray(config?.headerEventsJson);
    const otherEvents = (selectedIds.length > 0 ? tenantEditions.filter((e) => selectedIds.includes(e.id)) : tenantEditions).slice(0, 12);

    // program — yalnız yayındaki ve görünür oturumlar (§10 Program)
    const programSessions = await db.programSession.findMany({
      where: { editionId: edition.id, isVisible: true, status: "PUBLISHED" },
      include: {
        room: { select: { name: true } },
        track: { select: { name: true } },
        assignments: {
          select: { role: true, person: { select: { id: true, firstName: true, lastName: true, photoUrl: true, title: true, company: true, bio: true, linkedin: true } } },
        },
      },
      orderBy: { startTime: "asc" },
    });
    const program = programSessions.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      type: s.type,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room?.name ?? null,
      track: s.track?.name ?? null,
      cmeCredits: s.cmeCredits,
      capacity: s.capacity,
      accessRule: s.accessRule,
      speakers: s.assignments
        .filter((a) => a.person)
        .map((a) => ({ personId: a.person!.id, name: `${a.person!.firstName} ${a.person!.lastName}`, role: a.role, photoUrl: a.person!.photoUrl })),
    }));

    // kapasite dolulukları — tek sorguda grupla (N+1 yok); AUTH'ta kişinin kendi kayıtları da
    const regCounts = await db.portalSessionRegistration.groupBy({
      by: ["sessionId"],
      where: { editionId: edition.id, sessionId: { in: programSessions.map((s) => s.id) } },
      _count: { sessionId: true },
    });
    const regCountMap = new Map(regCounts.map((r) => [r.sessionId, r._count.sessionId]));
    const programWithCounts = program.map((s) => ({ ...s, registeredCount: regCountMap.get(s.id) ?? 0 }));
    const mySessionRegIds =
      sessionKind === "AUTH" && session!.personId
        ? (
            await db.portalSessionRegistration.findMany({
              where: { editionId: edition.id, personId: session!.personId },
              select: { sessionId: true },
            })
          ).map((r) => r.sessionId)
        : [];

    // konuşmacılar — program atamalarından türetilir (veri kopyası YOK)
    const speakerMap = new Map<string, { personId: string; name: string; title: string | null; company: string | null; photoUrl: string | null; bio: string | null; linkedin: string | null; sessions: { id: string; title: string; startTime: Date; role: string }[] }>();
    for (const s of programSessions) {
      for (const a of s.assignments) {
        if (!a.person) continue;
        const p = a.person;
        const cur = speakerMap.get(p.id) ?? {
          personId: p.id, name: `${p.firstName} ${p.lastName}`, title: p.title, company: p.company,
          photoUrl: p.photoUrl, bio: p.bio, linkedin: p.linkedin, sessions: [],
        };
        cur.sessions.push({ id: s.id, title: s.title, startTime: s.startTime, role: a.role });
        speakerMap.set(p.id, cur);
      }
    }
    const speakers = [...speakerMap.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));

    // sponsorlar — SponsorAgreement üzerinden (§5.5 içerik bağlama; veri kopyası yok)
    const sponsorFilter = parseIdArray(config?.sponsorIdsJson);
    const agreements = await db.sponsorAgreement.findMany({
      where: { editionId: edition.id, status: { in: ["ACTIVE", "CONTRACTED"] } },
      include: {
        organization: { select: { id: true, name: true, logoUrl: true, website: true, description: true, city: true, country: true } },
        tier: { select: { name: true, displayOrder: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const seenOrgs = new Set<string>();
    const sponsors = agreements
      .filter((a) => {
        if (!a.organization || seenOrgs.has(a.organization.id)) return false;
        if (sponsorFilter.length > 0 && !sponsorFilter.includes(a.organization.id)) return false;
        seenOrgs.add(a.organization.id);
        return true;
      })
      .map((a) => ({
        organizationId: a.organization.id,
        name: a.organization.name,
        logoUrl: a.organization.logoUrl,
        website: a.organization.website,
        description: a.organization.description,
        city: a.organization.city,
        country: a.organization.country,
        tierName: a.tier?.name ?? null,
        tierOrder: a.tier?.displayOrder ?? 99,
      }))
      .sort((a, b) => a.tierOrder - b.tierOrder || a.name.localeCompare(b.name, "tr"));

    // formlar — yayındaki herkese açık formlar (Formlar & Quizler widget'ı)
    const forms = await db.formDefinition.findMany({
      where: { editionId: edition.id, isPublic: true, status: "PUBLISHED" },
      select: { id: true, name: true, description: true, type: true, slug: true },
      orderBy: { createdAt: "asc" },
    });

    // duyurular (§5.4) — hedef kitle filtresi
    const announcements = await db.portalAnnouncement.findMany({
      where: {
        editionId: edition.id,
        OR: [{ target: "ALL" }, ...(sessionKind === "AUTH" ? [{ target: "AUTH" }] : [{ target: "GUEST" }])],
      },
      select: { id: true, title: true, message: true, level: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // düzenleyici içerik blokları (TASK-B 25 ile uyumlu — mevcut tablo)
    const blocks = await db.portalBlock.findMany({
      where: { editionId: edition.id, isVisible: true, audience: { in: ["PARTICIPANT", "BOTH"] } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, type: true, title: true, payloadJson: true, order: true },
    });

    // B2B (§4.1) — YALNIZ AUTH: kişinin kendi randevuları + karşı taraf bilgisi
    let b2b: {
      assignmentId: string; planId: string; subject: string; description: string | null;
      startsAt: Date | null; endsAt: Date | null; location: string | null; venue: string | null;
      status: string; myRole: string; personApproved: boolean; organizerApproved: boolean;
      feedback: string | null;
      counterpart: { name: string; company: string | null }[];
    }[] = [];
    if (sessionKind === "AUTH" && session!.personId) {
      const myAssignments = await db.b2bAssignment.findMany({
        where: { personId: session!.personId, plan: { editionId: edition.id } },
        include: {
          plan: { select: { id: true, subject: true, description: true, startsAt: true, endsAt: true, location: true, venue: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      const planIds = myAssignments.map((a) => a.planId);
      const counterparts = planIds.length
        ? await db.b2bAssignment.findMany({
            where: { planId: { in: planIds }, NOT: { personId: session!.personId } },
            include: { person: { select: { firstName: true, lastName: true, company: true } } },
          })
        : [];
      b2b = myAssignments.map((a) => ({
        assignmentId: a.id,
        planId: a.plan.id,
        subject: a.plan.subject,
        description: a.plan.description,
        startsAt: a.plan.startsAt,
        endsAt: a.plan.endsAt,
        location: a.plan.location,
        venue: a.plan.venue,
        status: a.status,
        myRole: a.role,
        personApproved: a.personApproved,
        organizerApproved: a.organizerApproved,
        feedback: a.feedback,
        counterpart: counterparts
          .filter((c) => c.planId === a.planId && c.person)
          .map((c) => ({ name: `${c.person!.firstName} ${c.person!.lastName}`, company: c.person!.company })),
      }));
    }

    // soru geçmişim — AUTH'ta kişiye bağlı (oturumlar arası kalıcı), misafirde oturuma bağlı
    const myQuestions = await db.portalQuestion.findMany({
      where: {
        editionId: edition.id,
        ...(sessionKind === "AUTH" && session!.personId
          ? { session: { personId: session!.personId } }
          : { sessionId: session!.id }),
      },
      select: { id: true, body: true, status: true, answerBody: true, answeredAt: true, createdAt: true, programSessionId: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      phase: "ACTIVE",
      session: { kind: sessionKind },
      edition: editionView,
      tenant: tenantView,
      config: {
        themeColor: config?.themeColor ?? null,
        widgets,
        bottomNav: parseBottomNav(config?.bottomNavJson),
        notifications: {
          enabled: config?.notificationsEnabled ?? true,
          offsets: parseNumberArray(config?.notifyOffsetsJson, [60, 30, 10]),
        },
        venueMap: { enabled: config?.venueMapEnabled ?? false, url: config?.venueMapUrl ?? null },
        allowRegistrationRedirect: config?.allowRegistrationRedirect ?? true,
        registrationFormId: config?.registrationFormId ?? null,
        pwaEnabled: config?.pwaEnabled ?? true,
        // PWA-ADMIN v1: kurulum teşviki + çevrimdışı şerit + durum çubuğu (herkese açık, PII yok)
        pwa: parsePwaSettings(config?.pwaJson),
        // ── tasarım kontrolü (§5.2+): tipografi + alan-renkleri/görselleri + sponsor + ikonlar ──
        design: {
          fontFamily: config?.fontFamily ?? null,
          fontScale: config?.fontScale ?? null,
          headerBgColor: config?.headerBgColor ?? null,
          footerBgColor: config?.footerBgColor ?? null,
          contentBgColor: config?.contentBgColor ?? null,
          headerBgImage: config?.headerBgImage ?? null,
          footerBgImage: config?.footerBgImage ?? null,
          contentBgImage: config?.contentBgImage ?? null,
            iconOverrides: parseJsonObject(config?.iconOverridesJson),
          iconLayout: parseJsonObject(config?.iconLayoutJson),
        },
        // ── ekran üst-bant görünürlüğü (her ekran için custom karar) ──
        chrome: parseJsonObject(config?.chromeJson),
        // ── oyunlaştırma kuralları (istici hedefler + seviyeler) ──
        game: parseGameConfig(config),
        portalSponsor: {
          logoUrl: config?.portalSponsorLogoUrl ?? null,
          name: config?.portalSponsorName ?? null,
          url: config?.portalSponsorUrl ?? null,
        },
      },
      otherEvents,
      program: programWithCounts,
      mySessionRegIds,
      speakers,
      sponsors,
      forms,
      announcements,
      blocks,
      b2b,
      myQuestions,
    });
  } catch (err) {
    console.error("portal/content error:", err);
    return NextResponse.json({ error: "Portal içeriği alınamadı" }, { status: 500 });
  }
}
