// Katılımcı dış portalı — kişinin kendi verilerinin dış kullanıcıdan görünen hali.
// Mimari (§12 kayıt kaynakları): PUBLIC_FORM/SPONSOR_PORTAL gibi kaynaklarla gelen
// katılımcı; kendi kayıt, ödeme, program, konaklama ve bekleme teklifini görür.
// TASK-A F1 (OWASP API1:2023 — BOLA): bu uç YETENEK BELİRTECİYLE kapılanır —
//   belirteç yok → 410; sahte/bilinmeyen/yanlış kapsam/yabancı kişi-edisyon → 404;
//   süresi geçmiş/iptal → 410. PII (e-posta, ad, rezervasyon, ödeme…) YALNIZ geçerli
//   belirteçle döner (KVKK m.4 veri minimizasyonu). Belirteç yanıtta ASLA yer almaz.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expireStaleOffers } from "@/lib/api/waitlist-engine";
import { resolvePublicEdition } from "@/lib/api/public-guard";
import { extractToken, validatePortalToken, touchToken } from "@/lib/api/portal-tokens";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const editionId = sp.get("editionId");
    const personId = sp.get("personId");
    if (!editionId || !personId) {
      return NextResponse.json({ error: "editionId ve personId zorunlu" }, { status: 400 });
    }

    // TASK-A F1: belirteç kapısı — belirsizlik varlık ifşa etmez
    const raw = extractToken(req);
    if (!raw) {
      return NextResponse.json({ error: "Portal erişim anahtarı gerekli — bağlantınızı onay e-postasından kullanın" }, { status: 410 });
    }
    const check = await validatePortalToken(raw);
    if (!check.ok) {
      // EXPIRED/REVOKED → 410 (kaynak artık bu anahtarla erişilemez); UNKNOWN → 404 (varlık ifşa edilmez)
      return NextResponse.json(
        { error: check.reason === "UNKNOWN" ? "Etkinlik bulunamadı" : "Erişim anahtarınız geçersiz veya süresi dolmuş" },
        { status: check.reason === "UNKNOWN" ? 404 : 410 },
      );
    }
    const token = check.token;
    // kapsam + sahiplik: PARTICIPANT belirteci yalnız kendi kişisi + kendi edisyonu için geçerli
    if (token.scope !== "PARTICIPANT" || token.personId !== personId || token.editionId !== editionId) {
      return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    }
    touchToken(token.id);

    // Faz A public allowlist: editionId → kiracı çözümlenemiyorsa 404
    const publicEdition = await resolvePublicEdition(editionId);
    if (!publicEdition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    // süresi geçen teklifleri kapat — portal görünümü hep güncel
    await expireStaleOffers(editionId);

    const person = await db.person.findUnique({
      where: { id: personId },
    });
    if (!person) return NextResponse.json({ error: "Kişi bulunamadı" }, { status: 404 });

    const participation = await db.eventParticipation.findUnique({
      where: { editionId_personId: { editionId, personId } },
      include: {
        roleAssignments: true,
        badgeInstances: { include: { profile: true } },
        certIssues: { include: { definition: true } },
        snapshots: { orderBy: { createdAt: "desc" } },
        reservations: { include: { roomType: { include: { hotel: true } }, block: true } },
        programAssignments: { include: { session: { include: { room: true } } }, orderBy: { id: "asc" } },
        entitlementClaims: { include: { entitlement: true } },
      },
    });

    const registrations = await db.registration.findMany({
      where: { editionId, participationId: participation?.id },
      include: { category: true },
      orderBy: { createdAt: "desc" },
    });

    const registrationIds = registrations.map((r) => r.id);
    const orders = await db.order.findMany({
      where: {
        editionId,
        OR: [
          { buyerPersonId: personId },
          { lines: { some: { OR: [{ participationId: participation?.id ?? "__none__" }, { registrationId: { in: registrationIds } }] } } },
        ],
      },
      include: { lines: true, payments: { orderBy: { createdAt: "desc" } }, refunds: true },
      orderBy: { createdAt: "desc" },
    });

    const waitlist = await db.waitlistEntry.findMany({
      where: { editionId, personId },
      include: { category: true, convertedRegistration: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    // edisyon özeti — portal başlığında gösterilir
    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      include: { series: true },
    });

    // ── TASK-B 25/26: kişisel sayfa zenginleştirme ──
    // (a) görünür portal blokları — katılımcı yüzeyi (yalnız düzenleyici içeriği, PII yok)
    const blocks = await db.portalBlock.findMany({
      where: { editionId, isVisible: true, audience: { in: ["PARTICIPANT", "BOTH"] } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, type: true, title: true, payloadJson: true, order: true },
    });

    // (b) yaka kartı önizlemesi — yalnız VERİLMİŞ aile (ISSUED|PRINTED|REPRINTED);
    // BadgeProfile'da önizleme-alanı YOK (şema denetlendi) → yalnız {id, name} ifşa edilir.
    // Belirteç (PortalToken) bu yanıtta zaten hiçbir biçimde dolaşmaz.
    const issuedBadge = participation?.badgeInstances.find((b) => ["ISSUED", "PRINTED", "REPRINTED"].includes(b.status));
    const badgePreview = issuedBadge
      ? {
          badgeNo: issuedBadge.badgeNo,
          status: issuedBadge.status,
          profileName: issuedBadge.profile?.name ?? null,
          profile: issuedBadge.profile ? { id: issuedBadge.profile.id, name: issuedBadge.profile.name } : null,
        }
      : null;

    // (c) CV — yalnız SPEAKER/REVIEWER rolü varsa ve yalnız KENDİ kayıtları
    // (personId = belirteç sahibi kişi; edition kapsamlı CvEntry izolasyonu)
    const portalRoles = (participation?.roleAssignments ?? []).map((r) => r.role);
    const cv = portalRoles.includes("SPEAKER") || portalRoles.includes("REVIEWER")
      ? await db.cvEntry.findMany({
          where: { personId, editionId },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          select: { id: true, kind: true, title: true, organization: true, startDate: true, endDate: true, isCurrent: true, description: true },
        })
      : [];

    // (d) bakiye toplamı — zaten çekilmiş siparişler üzerinden TEK reduce (ek sorgu yok)
    const balanceTotal = orders.reduce((sum, o) => {
      const paid = o.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
      return sum + Math.max(0, o.totalAmount - paid);
    }, 0);

    return NextResponse.json({
      // TASK-B 25: düzenleyici kontrollü içerik blokları — üst-seviye anahtar
      blocks,
      edition: edition
        ? { id: edition.id, name: edition.name, startDate: edition.startDate, endDate: edition.endDate, venueName: edition.venueName, city: edition.city, isPublished: edition.isPublished, seriesName: edition.series?.name ?? null }
        : null,
      // TASK-A F1: portalToken alanı KALDIRILDI — belirteç yanıt gövdelerinde ASLA dolaşmaz
      person: {
        id: person.id, firstName: person.firstName, lastName: person.lastName,
        email: person.email, title: person.title, organizationName: person.company,
      },
      participation: participation
        ? {
            id: participation.id, source: participation.source, attendance: participation.attendance,
            notes: participation.notes,
            roleAssignments: participation.roleAssignments.map((r) => ({ id: r.id, role: r.role })),
            badges: participation.badgeInstances.map((b) => ({ id: b.id, status: b.status, badgeNo: b.badgeNo, profileName: b.profile?.name ?? null })),
            certificates: participation.certIssues.map((c) => ({ id: c.id, status: c.status, note: c.eligibilityNote, definitionName: c.definition?.name ?? null, generatedAt: c.generatedAt, deliveredAt: c.deliveredAt })),
            snapshot: participation.snapshots[0] ? { badgeName: participation.snapshots[0].badgeName, company: participation.snapshots[0].company, title: participation.snapshots[0].title } : null,
            reservations: participation.reservations.map((r) => ({
              id: r.id, guestName: r.guestName, checkIn: r.checkIn, checkOut: r.checkOut,
              status: r.status, payerType: r.payerType, payerName: r.payerName,
              roomType: r.roomType?.name ?? null, hotel: r.roomType?.hotel?.name ?? null,
            })),
            program: participation.programAssignments.map((pa) => ({
              id: pa.id, role: pa.role,
              sessionTitle: pa.session?.title ?? null, sessionType: pa.session?.type ?? null,
              startTime: pa.session?.startTime ?? null, endTime: pa.session?.endTime ?? null,
              room: pa.session?.room?.name ?? null, cmeCredits: pa.session?.cmeCredits ?? 0,
            })),
            claims: participation.entitlementClaims.map((c) => ({
              id: c.id, status: c.status, guestName: c.guestName,
              entitlementLabel: c.entitlement?.label ?? null,
            })),
          }
        : null,
      registrations: registrations.map((r) => ({
        id: r.id, confirmationNo: r.confirmationNo, status: r.status, source: r.source,
        fundingSource: r.fundingSource, submittedAt: r.submittedAt, decidedAt: r.decidedAt,
        cancelReason: r.cancelReason, notes: r.notes,
        categoryName: r.category?.name ?? null, categoryCode: r.category?.code ?? null,
        basePrice: r.category?.basePrice ?? 0, currency: r.category?.currency ?? "TRY",
      })),
      // TASK-B 26: yaka kartı önizlemesi (verilmiş ise) — profil kimliği/yoksa null
      badgePreview,
      // TASK-B 26: CV — konuşmacı/hakem rolüne sahip kişinin kendi CV kayıtları
      cv,
      orders: orders.map((o) => {
        const paid = o.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
        const pending = o.payments.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amount, 0);
        return {
          id: o.id, orderNo: o.orderNo, status: o.status, totalAmount: o.totalAmount,
          currency: o.currency, createdAt: o.createdAt, payerName: o.payerName,
          lines: o.lines.map((l) => ({ id: l.id, description: l.description, quantity: l.quantity, total: l.total })),
          payments: o.payments.map((p) => ({ id: p.id, amount: p.amount, source: p.source, status: p.status, reference: p.reference, paidAt: p.paidAt })),
          paid, pending, remaining: Math.max(0, o.totalAmount - paid),
        };
      }),
      // TASK-B 26: kalan bakiye toplamı (kuruş) — başarıyla ödenmiş tutarlar düşülür
      balanceTotal,
      waitlist: waitlist.map((w) => ({
        id: w.id, status: w.status, priority: w.priority, notes: w.notes,
        offeredAt: w.offeredAt, offerExpiresAt: w.offerExpiresAt, respondedAt: w.respondedAt,
        categoryName: w.category?.name ?? "Genel", categoryCode: w.category?.code ?? null,
        convertedRegistrationNo: w.convertedRegistration?.confirmationNo ?? null,
      })),
    });
  } catch (err) {
    console.error("portal/participant error:", err);
    return NextResponse.json({ error: "Portal verisi alınamadı" }, { status: 500 });
  }
}
