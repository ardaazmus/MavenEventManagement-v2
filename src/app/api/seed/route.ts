// /api/seed — Maven demo verisi (idempotent: önce temizler)
// Senaryolar: canlı edisyon (No-Dig 2026), sponsor hak dökümü 20/14/2/4,
// bilimsel akış, gecelik stok, finans çok eksenli, saha taramaları.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createRegistrationFromSubmission } from "@/lib/api/registration-chain";

const D = (offsetDays: number, h = 9, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(h, m, 0, 0);
  return d;
};

export async function POST() {
  try {
    await wipe();

    // ── Tenant & Kullanıcılar (§48) ──
    const tenant = await db.tenant.create({
      data: {
        name: "Maven Etkinlik Çözümleri", slug: "maven-demo", plan: "ENTERPRISE",
        country: "Türkiye", timezone: "Europe/Istanbul",
        users: {
          create: [
            { email: "elif@maven.demo", name: "Elif Kaya", role: "ORG_OWNER" },
            { email: "burak@maven.demo", name: "Burak Demir", role: "EVENT_MANAGER" },
            { email: "zeynep@maven.demo", name: "Zeynep Arslan", role: "FINANCE_MANAGER" },
            { email: "kaan@maven.demo", name: "Kaan Yıldız", role: "REGISTRATION_MANAGER" },
            { email: "selin@maven.demo", name: "Selin Öztürk", role: "SCIENTIFIC_MANAGER" },
            { email: "mert@maven.demo", name: "Mert Şahin", role: "ONSITE_MANAGER" },
          ],
        },
      },
    });

    // ── Kurumlar (sponsor TÜRÜ değil — rol ataması §4) ──
    const [abcPharma, association, pco, icc, beta, media, uni, hotelOrg] = await Promise.all([
      db.organization.create({ data: { tenantId: tenant.id, name: "ABC Pharma", type: "COMPANY", country: "Türkiye", city: "İstanbul", website: "https://abcpharma.example", taxNo: "1234567890" } }),
      db.organization.create({ data: { tenantId: tenant.id, name: "No-Dig Türkiye Derneği", type: "ASSOCIATION", country: "Türkiye", city: "Ankara" } }),
      db.organization.create({ data: { tenantId: tenant.id, name: "Eventiva PCO", type: "AGENCY", country: "Türkiye", city: "İstanbul" } }),
      db.organization.create({ data: { tenantId: tenant.id, name: "İstanbul Kongre Merkezi", type: "VENUE", country: "Türkiye", city: "İstanbul" } }),
      db.organization.create({ data: { tenantId: tenant.id, name: "Beta Mühendislik", type: "COMPANY", country: "Türkiye", city: "Ankara" } }),
      db.organization.create({ data: { tenantId: tenant.id, name: "TeknoBasın Medya", type: "COMPANY", country: "Türkiye", city: "İstanbul" } }),
      db.organization.create({ data: { tenantId: tenant.id, name: "Delta Üniversitesi", type: "UNIVERSITY", country: "Türkiye", city: "İzmir" } }),
      db.organization.create({ data: { tenantId: tenant.id, name: "Maslak Grand Otel", type: "HOTEL", country: "Türkiye", city: "İstanbul" } }),
    ]);

    await db.organizationContact.createMany({
      data: [
        { organizationId: abcPharma.id, name: "Deniz Yalçın", title: "Pazarlama Direktörü", email: "deniz@abcpharma.example", isPrimary: true },
        { organizationId: pco.id, name: "Ceren Aksoy", title: "Proje Müdürü", email: "ceren@eventiva.example", isPrimary: true },
        { organizationId: icc.id, name: "Onur Kılıç", title: "Satış Müdürü", email: "onur@icc.example", isPrimary: true },
      ],
    });

    // ── Kişiler (tenant içinde tekil) ──
    const peopleData = [
      ["Ahmet", "Yılmaz", "ahmet.yilmaz@example.com", "ABC Pharma", "Ar-Ge Müdürü"],
      ["Mehmet", "Demir", "mehmet.demir@example.com", "Delta Üniversitesi", "Prof. Dr."],
      ["Ayşe", "Kara", "ayse.kara@example.com", "Delta Üniversitesi", "Doç. Dr."],
      ["Fatma", "Çelik", "fatma.celik@example.com", "Beta Mühendislik", "Genel Müdür"],
      ["Mustafa", "Koç", "mustafa.koc@example.com", "Yol Yapım A.Ş.", "Proje Direktörü"],
      ["Zeynep", "Aydın", "zeynep.aydin@example.com", "Hükümet Metrosu Daire Başkanlığı", "Mühendis"],
      ["Emre", "Özkan", "emre.ozkan@example.com", "Tünel İnşaat Ltd.", "Saha Şefi"],
      ["Seda", "Polat", "seda.polat@example.com", "GeoLab Danışmanlık", "Jeoteknik Uzman"],
      ["Can", "Arslan", "can.arslan@example.com", "Delta Üniversitesi", "Arş. Gör."],
      ["Deniz", "Şahin", "deniz.sahin@example.com", "ABC Pharma", "Ürün Yöneticisi"],
      ["Ece", "Doğan", "ece.dogan@example.com", "TeknoBasın Medya", "Muhabir"],
      ["Kerem", "Aksoy", "kerem.aksoy@example.com", "Maven Ekibi", "Operasyon Görevlisi"],
      ["Leyla", "Güneş", "leyla.gunes@example.com", "Maven Ekibi", "Kayıt Görevlisi"],
      ["Barış", "Tekin", "baris.tekin@example.com", "Özel", "Bağımsız"],
      ["Gizem", "Bulut", "gizem.bulut@example.com", "Yol Yapım A.Ş.", "Kalite Uzmanı"],
      ["Onur", "Erdem", "onur.erdem@example.com", "Tünel İnşaat Ltd.", "Makine Mühendisi"],
      ["Pınar", "Yavuz", "pinar.yavuz@example.com", "Delta Üniversitesi", "Y. Lisans Öğrencisi"],
      ["Serpil", "Ateş", "serpil.ates@example.com", "GeoLab Danışmanlık", "Laborant"],
      ["Tolga", "Uçar", "tolga.ucar@example.com", "Beta Mühendislik", "Satış Yöneticisi"],
      ["Ünsal", "Kağan", "unsal.kagan@example.com", "Hükümet Metrosu", "İnşaat Mühendisi"],
      ["Vildan", "Serin", "vildan.serin@example.com", "Özel", "Refakatçi"],
      ["Yusuf", "Bilgin", "yusuf.bilgin@example.com", "Maven Ekibi", "Kapı Görevlisi"],
      ["Hande", "Soyer", "hande.soyer@example.com", "ABC Pharma", "Medikal Temsilci"],
      ["Murat", "İnce", "murat.ince@example.com", "ABC Pharma", "Satış Uzmanı"],
    ] as const;
    const people = [];
    for (const [firstName, lastName, email, company, title] of peopleData) {
      people.push(await db.person.create({ data: { tenantId: tenant.id, firstName, lastName, email, company, title, country: "Türkiye" } }));
    }
    const P = Object.fromEntries(people.map((p, i) => [peopleData[i][0], p]));

    // ── Seriler & Edisyonlar ──
    const seriesNoDig = await db.eventSeries.create({
      data: { tenantId: tenant.id, name: "No-Dig Turkey", slug: "no-dig-turkey", template: "SCIENTIFIC_CONGRESS", description: "Kazısız teknolojiler ulusal kongresi — yıllık seri" },
    });
    const seriesTech = await db.eventSeries.create({
      data: { tenantId: tenant.id, name: "Maven TechDays", slug: "maven-techdays", template: "TRADE_FAIR", description: "B2B teknoloji fuarı" },
    });

    const edition1 = await db.eventEdition.create({
      data: {
        tenantId: tenant.id, seriesId: seriesNoDig.id,
        name: "No-Dig Turkey 2026", slug: "no-dig-turkey-2026", editionLabel: "2026",
        status: "ONSITE", isPublished: true, template: "SCIENTIFIC_CONGRESS",
        startDate: D(-1, 8, 30), endDate: D(2, 18, 0),
        venueName: "İstanbul Kongre Merkezi", city: "İstanbul", country: "Türkiye",
        format: "HYBRID", description: "Kazısız teknolojiler ve tünel mühendisliği kongresi.",
        coverColor: "teal", languages: "tr,en", isFeatured: true,
      },
    });
    const edition2 = await db.eventEdition.create({
      data: {
        tenantId: tenant.id, seriesId: seriesTech.id,
        name: "Maven TechDays 2027", slug: "maven-techdays-2027", editionLabel: "2027",
        status: "PLANNING", isPublished: false, template: "TRADE_FAIR",
        startDate: D(120, 10, 0), endDate: D(122, 18, 0),
        venueName: "Lütfi Kırdar", city: "İstanbul", country: "Türkiye",
        format: "IN_PERSON", description: "B2B teknoloji fuarı ve eşlik eden zirve.",
        coverColor: "violet",
      },
    });

    // ── Yetenekler (§6 şablonlar) ──
    const caps1 = ["REGISTRATION", "SCIENTIFIC", "PROGRAM", "SPONSORSHIP", "EXHIBITION", "ACCOMMODATION", "BADGING", "ACCESS_CONTROL", "CERTIFICATES", "COMMUNICATIONS", "OPERATIONS", "CME_CREDITS"];
    for (const key of caps1) {
      await db.eventCapability.create({ data: { editionId: edition1.id, key, enabled: true, setupNote: key === "CME_CREDITS" ? "uyarı: kredi kuralı tanımlı değil" : "hazır" } });
    }
    const caps2 = ["REGISTRATION", "PROGRAM", "SPONSORSHIP", "EXHIBITION", "FLOOR_PLAN", "BADGING", "ACCESS_CONTROL", "COMMUNICATIONS", "OPERATIONS"];
    for (const key of caps2) {
      await db.eventCapability.create({ data: { editionId: edition2.id, key, enabled: key !== "PROGRAM" } });
    }

    // ── Kurum-atama (aynı kurum çok rol §4) ──
    await db.eventOrganizationAssignment.createMany({
      data: [
        { editionId: edition1.id, organizationId: association.id, role: "SCIENTIFIC_OWNER" },
        { editionId: edition1.id, organizationId: pco.id, role: "PCO" },
        { editionId: edition1.id, organizationId: icc.id, role: "VENUE" },
        { editionId: edition1.id, organizationId: abcPharma.id, role: "SPONSOR" },
        { editionId: edition1.id, organizationId: abcPharma.id, role: "EXHIBITOR" },
        { editionId: edition1.id, organizationId: abcPharma.id, role: "WORKSHOP_SPONSOR" },
        { editionId: edition1.id, organizationId: beta.id, role: "EXHIBITOR" },
        { editionId: edition1.id, organizationId: media.id, role: "MEDIA_PARTNER" },
        { editionId: edition1.id, organizationId: uni.id, role: "ACADEMIC_PARTNER" },
        { editionId: edition1.id, organizationId: hotelOrg.id, role: "HOTEL" },
        { editionId: edition2.id, organizationId: pco.id, role: "PCO" },
      ],
    });

    // ── Kayıt kategorileri ──
    const catRegular = await db.registrationCategory.create({ data: { editionId: edition1.id, name: "Kongre Katılımı", code: "REG", basePrice: 5000, capacity: 800, paymentInstruction: "Havale/EFT: Maven Etkinlik Çözümleri · TR33 0006 ... — açıklamaya kayıt no yazın", order: 0 } });
    const catStudent = await db.registrationCategory.create({ data: { editionId: edition1.id, name: "Öğrenci", code: "STU", basePrice: 1500, requiresApproval: true, capacity: 200, paymentInstruction: "Öğrenci belgesi onayı sonrası ödeme bağlantısı e-posta ile gönderilir", order: 1 } });
    const catSpeaker = await db.registrationCategory.create({ data: { editionId: edition1.id, name: "Davetli Konuşmacı", code: "SPK", basePrice: 0, order: 2 } });
    const catExhibitor = await db.registrationCategory.create({ data: { editionId: edition1.id, name: "Fuarcı Personeli", code: "EXH", basePrice: 0, order: 3 } });
    const catVip = await db.registrationCategory.create({ data: { editionId: edition1.id, name: "VIP", code: "VIP", basePrice: 0, order: 4 } });
    const catPress = await db.registrationCategory.create({ data: { editionId: edition1.id, name: "Basın", code: "PRS", basePrice: 0, order: 5 } });
    const catAccomp = await db.registrationCategory.create({ data: { editionId: edition1.id, name: "Refakatçi", code: "ACC", basePrice: 2000, paymentInstruction: "Refakatçi kayıtları ana katılımcı siparişine eklenir", order: 6 } });

    // ── Katılımlar & Kayıtlar (çok eksenli) ──
    type Row = [string, string, string, string, string, string, string | null, string | null];
    const rows: Row[] = [
      // ad, kategori, regStatus, source, funding, attendance, roles, snapshotCompany
      ["Ahmet", "SPK", "CONFIRMED", "SCIENTIFIC_PORTAL", "SPEAKER_ENTITLEMENT", "CHECKED_IN", "SPEAKER,AUTHOR", null],
      ["Mehmet", "SPK", "CONFIRMED", "SCIENTIFIC_PORTAL", "SPEAKER_ENTITLEMENT", "CHECKED_IN", "SPEAKER,REVIEWER,COMMITTEE_MEMBER", null],
      ["Ayşe", "REG", "CONFIRMED", "PUBLIC_FORM", "ORGANIZATION_PAID", "CHECKED_IN", "MODERATOR,ATTENDEE", null],
      ["Fatma", "EXH", "CONFIRMED", "EXHIBITOR_PORTAL", "SPONSOR_ENTITLEMENT", "CHECKED_IN", "EXHIBITOR_STAFF,ATTENDEE", null],
      ["Mustafa", "REG", "CONFIRMED", "PUBLIC_FORM", "SELF_PAID", "CHECKED_IN", "ATTENDEE", null],
      ["Zeynep", "REG", "CONFIRMED", "GROUP_REGISTRATION", "ORGANIZATION_PAID", "CHECKED_IN", "ATTENDEE", null],
      ["Emre", "REG", "CONFIRMED", "ONSITE_WALK_IN", "SELF_PAID", "CHECKED_IN", "ATTENDEE", null],
      ["Seda", "REG", "CONFIRMED", "PUBLIC_FORM", "SELF_PAID", "CHECKED_IN", "ATTENDEE,PANELIST", null],
      ["Can", "STU", "PENDING_APPROVAL", "PUBLIC_FORM", "SELF_PAID", "NOT_ARRIVED", "ATTENDEE,AUTHOR", null],
      ["Deniz", "EXH", "CONFIRMED", "SPONSOR_PORTAL", "SPONSOR_ENTITLEMENT", "CHECKED_IN", "EXHIBITOR_STAFF", null],
      ["Ece", "PRS", "CONFIRMED", "INVITATION", "HOST_COMPLIMENTARY", "CHECKED_IN", "PRESS", null],
      ["Kerem", "REG", "CONFIRMED", "ADMIN_ENTRY", "STAFF", "CHECKED_IN", "STAFF", null],
      ["Leyla", "REG", "CONFIRMED", "ADMIN_ENTRY", "STAFF", "CHECKED_OUT", "STAFF", null],
      ["Barış", "REG", "PENDING_APPROVAL", "PUBLIC_FORM", "SELF_PAID", "NOT_ARRIVED", "ATTENDEE", null],
      ["Gizem", "REG", "CONFIRMED", "GROUP_REGISTRATION", "ORGANIZATION_PAID", "NOT_ARRIVED", "ATTENDEE", null],
      ["Onur", "REG", "CONFIRMED", "PUBLIC_FORM", "SELF_PAID", "CHECKED_IN", "ATTENDEE", null],
      ["Pınar", "STU", "SUBMITTED", "PUBLIC_FORM", "SELF_PAID", "NOT_ARRIVED", "ATTENDEE,AUTHOR", null],
      ["Serpil", "REG", "CONFIRMED", "PUBLIC_FORM", "SELF_PAID", "CHECKED_IN", "ATTENDEE", null],
      ["Tolga", "EXH", "CONFIRMED", "SPONSOR_PORTAL", "SPONSOR_ENTITLEMENT", "CHECKED_IN", "EXHIBITOR_STAFF", null],
      ["Ünsal", "REG", "DRAFT", "ADMIN_ENTRY", "ORGANIZATION_PAID", "NOT_ARRIVED", null, null],
      ["Vildan", "ACC", "CONFIRMED", "PUBLIC_FORM", "SELF_PAID", "CHECKED_IN", "ATTENDEE", null],
      ["Yusuf", "REG", "CONFIRMED", "ADMIN_ENTRY", "STAFF", "CHECKED_IN", "STAFF", null],
      ["Hande", "EXH", "PENDING_APPROVAL", "SPONSOR_PORTAL", "SPONSOR_ENTITLEMENT", "NOT_ARRIVED", "EXHIBITOR_STAFF", null],
      ["Murat", "EXH", "REJECTED", "SPONSOR_PORTAL", "SPONSOR_ENTITLEMENT", "NOT_ARRIVED", null, null],
      ["Seda", "VIP", "CONFIRMED", "INVITATION", "HOST_COMPLIMENTARY", "NOT_ARRIVED", "VIP", null],
    ];

    let regNo = 1;
    const participationMap = new Map<string, { participationId: string; registrationId: string; editionId: string }>();
    for (const [name, catCode, regStatus, source, funding, attendance, roles, snapCompany] of rows) {
      const person = P[name];
      const cat = [catRegular, catStudent, catSpeaker, catExhibitor, catVip, catPress, catAccomp].find((c) => c.code === catCode)!;
      const participation = await db.eventParticipation.upsert({
        where: { editionId_personId: { editionId: edition1.id, personId: person.id } },
        create: { editionId: edition1.id, personId: person.id, source, attendance },
        update: { attendance },
      });
      // sponsor portal EXH kayıtlarında claim oluşur (2 ayrılmış + onaylılar tüketilmiş)
      const registration = await db.registration.create({
        data: {
          editionId: edition1.id, participationId: participation.id, categoryId: cat.id,
          confirmationNo: `REG-2026-${String(regNo).padStart(4, "0")}`,
          source, fundingSource: funding, status: regStatus,
          submittedAt: regStatus === "DRAFT" ? null : D(-14 + regNo, 11, 30),
          decidedAt: ["CONFIRMED", "REJECTED"].includes(regStatus) ? D(-10 + regNo, 15, 0) : null,
          decidedBy: ["CONFIRMED", "REJECTED"].includes(regStatus) ? "Kaan Yıldız" : null,
          cancelReason: regStatus === "REJECTED" ? "Sponsor kotası tükenmiş" : null,
          notes: regStatus === "DRAFT" ? "Taslak — katılımcı göndermedi" : null,
        },
      });
      await db.eventProfileSnapshot.create({
        data: {
          participationId: participation.id,
          badgeName: `${person.firstName} ${person.lastName}`,
          company: snapCompany ?? person.company, title: person.title, country: person.country,
        },
      });
      if (roles) {
        for (const r of roles.split(",")) {
          await db.eventRoleAssignment.create({ data: { participationId: participation.id, role: r, status: "ACTIVE" } });
        }
      }
      participationMap.set(name, { participationId: participation.id, registrationId: registration.id, editionId: edition1.id });
      regNo++;
    }

    // ── Sponsorluk (§13-15) ──
    const tierGold = await db.sponsorTierDefinition.create({ data: { editionId: edition1.id, name: "Gold Sponsor", displayOrder: 1, capacity: 5, price: 500000, brandingRules: "Ana sahneye logo, program kitabı arka kapak" } });
    const tierSilver = await db.sponsorTierDefinition.create({ data: { editionId: edition1.id, name: "Silver Sponsor", displayOrder: 2, capacity: 10, price: 250000 } });
    const tierBronze = await db.sponsorTierDefinition.create({ data: { editionId: edition1.id, name: "Bronz Sponsor", displayOrder: 3, capacity: 15, price: 100000 } });
    const tierMedia = await db.sponsorTierDefinition.create({ data: { editionId: edition1.id, name: "Medya Sponsoru", displayOrder: 4, capacity: 2, price: 0 } });

    const pkgGold = await db.sponsorPackage.create({
      data: {
        editionId: edition1.id, tierId: tierGold.id, name: "Gold Sponsorship 2026", price: 500000,
        rightsSpec: "20× Ücretsiz Kayıt · 5× Fuarcı Personeli · 1× 12m² Stant · 1× Konuşma Slotu · 2× Gala Davetiyesi · Web Sitesi Logosu",
      },
    });
    const pkgSilver = await db.sponsorPackage.create({ data: { editionId: edition1.id, tierId: tierSilver.id, name: "Silver Sponsorship 2026", price: 250000, rightsSpec: "10× Ücretsiz Kayıt · 1× Stant Opsiyonu · Program İlanı" } });

    const agrAbc = await db.sponsorAgreement.create({
      data: { editionId: edition1.id, organizationId: abcPharma.id, packageId: pkgGold.id, tierId: tierGold.id, amount: 500000, status: "ACTIVE", signedAt: D(-90, 14) },
    });
    const agrBeta = await db.sponsorAgreement.create({
      data: { editionId: edition1.id, organizationId: beta.id, packageId: pkgSilver.id, tierId: tierSilver.id, amount: 250000, status: "CONTRACTED", signedAt: D(-60, 11) },
    });
    await db.sponsorAgreement.create({ data: { editionId: edition1.id, organizationId: media.id, tierId: tierMedia.id, amount: 0, status: "PROSPECT" } });

    // Entitlement havuzları — 09-C örneği: 20 granted / 14 consumed / 2 reserved / 4 kalan
    const entReg = await db.entitlement.create({
      data: { editionId: edition1.id, ownerOrganizationId: abcPharma.id, source: "SPONSOR_PACKAGE", type: "COMPLIMENTARY_REGISTRATION", label: "Gold Sponsor Ücretsiz Katılım Hakkı", quantityGranted: 20, quantityConsumed: 0, quantityReserved: 0, restrictions: "Yalnız Fuarcı Personeli veya misafir kategorisi" },
    });
    await db.entitlement.create({ data: { editionId: edition1.id, ownerOrganizationId: abcPharma.id, source: "SPONSOR_PACKAGE", type: "GALA_TICKET", label: "Gala Davetiyesi Hakkı", quantityGranted: 10, quantityConsumed: 6 } });
    await db.entitlement.create({ data: { editionId: edition1.id, ownerOrganizationId: abcPharma.id, source: "SPONSOR_PACKAGE", type: "BOOTH", label: "12m² Stant Hakkı", quantityGranted: 1, quantityConsumed: 1 } });
    await db.entitlement.create({ data: { editionId: edition1.id, ownerOrganizationId: abcPharma.id, source: "SPONSOR_PACKAGE", type: "SESSION_ACCESS", label: "Workshop Salonu Erişimi", quantityGranted: 30, quantityConsumed: 11 } });
    const entBadge = await db.entitlement.create({ data: { editionId: edition1.id, ownerOrganizationId: beta.id, source: "SPONSOR_PACKAGE", type: "BADGE", label: "Fuarcı Personeli Rozeti", quantityGranted: 5, quantityConsumed: 5 } });
    await db.entitlement.create({ data: { editionId: edition1.id, ownerPersonId: P.Mehmet.id, source: "SPEAKER", type: "COMPLIMENTARY_REGISTRATION", label: "Konuşmacı Ücretsiz Kayıt", quantityGranted: 1, quantityConsumed: 1 } });

    // claimleri gerçek havuza bağla + consumed/reserved say (12+2 = 14 tüketim görünümü)
    const exhNames = ["Fatma", "Deniz", "Tolga", "Hande", "Murat"];
    let consumedCount = 0; let reservedCount = 0;
    for (const [name, rec] of participationMap) {
      if (!exhNames.includes(name)) continue;
      const reg = await db.registration.findUnique({ where: { id: rec.registrationId } });
      if (!reg) continue;
      const isBeta = name === "Tolga"; // Beta badge hakkı
      const claim = await db.entitlementClaim.create({
        data: {
          entitlementId: isBeta ? entBadge.id : entReg.id,
          participationId: rec.participationId, registrationId: rec.registrationId,
          status: reg.status === "CONFIRMED" ? "CONSUMED" : reg.status === "REJECTED" ? "RELEASED" : "RESERVED",
          consumedAt: reg.status === "CONFIRMED" ? D(-9, 10) : null,
          releasedAt: reg.status === "REJECTED" ? D(-8, 9) : null,
          guestName: `${P[name].firstName} ${P[name].lastName}`,
        },
      });
      if (claim.status === "CONSUMED" && !isBeta) consumedCount++;
      if (claim.status === "RESERVED" && !isBeta) reservedCount++;
    }
    // 14 tüketim görünümü: havuza ek "misafir" claimler (portaldan eklenen, kayıt tamamlanmış 12 kişi daha)
    const extraGuests = ["Nihan Ergün", "Kemal Tuna", "Aslı Bakır", "Sinan Toprak", "Merve Kılıçdağ", "Ferhat Aksu", "Berrin Yücel", "Okan Turan", "Ahmet Yılmaz Jr.", "Selin Topcu", "Rana Efe", "Cem Kuray"];
    for (const guest of extraGuests) {
      await db.entitlementClaim.create({ data: { entitlementId: entReg.id, status: "CONSUMED", consumedAt: D(-9, 10), guestName: guest, notes: "Sponsor portal misafiri — kayıt tamamlandı" } });
      consumedCount++;
    }
    // ikinci ayrılmış hak (onay bekleyen misafir)
    await db.entitlementClaim.create({ data: { entitlementId: entReg.id, status: "RESERVED", guestName: "Yasemin Aldat", notes: "Sponsor portal misafiri — onay bekliyor" } });
    reservedCount++;
    await db.entitlement.update({ where: { id: entReg.id }, data: { quantityConsumed: consumedCount, quantityReserved: reservedCount } });
    await db.entitlement.update({ where: { id: entBadge.id }, data: { quantityConsumed: 5, quantityReserved: 0 } });

    // teslimler (§51)
    await db.deliverable.createMany({
      data: [
        { agreementId: agrAbc.id, name: "Logo", type: "LOGO", status: "APPROVED", dueDate: D(-30) },
        { agreementId: agrAbc.id, name: "Banner Tasarımı", type: "BANNER", status: "WAITING_SPONSOR", dueDate: D(3), responsible: "Deniz Yalçın" },
        { agreementId: agrAbc.id, name: "Misafir Listesi", type: "GUEST_LIST", status: "SUBMITTED", dueDate: D(-5) },
        { agreementId: agrAbc.id, name: "Stand Tasarımı", type: "STAND_DESIGN", status: "APPROVED", dueDate: D(-12) },
        { agreementId: agrAbc.id, name: "Firma Tanıtım Metni", type: "DESCRIPTION", status: "COMPLETED", dueDate: D(-40) },
        { agreementId: agrBeta.id, name: "Logo", type: "LOGO", status: "COMPLETED", dueDate: D(-20) },
        { agreementId: agrBeta.id, name: "Program İlanı", type: "AD", status: "UNDER_REVIEW", dueDate: D(2) },
      ],
    });

    // ── Fuar / stantlar (§19-22) ──
    const boothRows: [string, number, string, number][] = [["A21", 12, "SHELL_SCHEME", 60000], ["A22", 12, "SHELL_SCHEME", 60000], ["A23", 12, "SHELL_SCHEME", 60000], ["A24", 12, "SHELL_SCHEME", 60000], ["A25", 12, "SHELL_SCHEME", 60000], ["B01", 24, "SPACE_ONLY", 100000], ["B02", 24, "SPACE_ONLY", 100000]];
    for (const [code, size, type, price] of boothRows) {
      await db.boothUnit.create({ data: { editionId: edition1.id, code, sizeSqm: size, type, price } });
    }
    const boothA24 = await db.boothUnit.findFirst({ where: { editionId: edition1.id, code: "A24" } })!;
    const boothB01 = await db.boothUnit.findFirst({ where: { editionId: edition1.id, code: "B01" } })!;
    await db.boothAllocation.create({ data: { boothUnitId: boothA24!.id, agreementId: agrAbc.id, organizationId: abcPharma.id, status: "CONTRACTED" } });
    await db.boothUnit.update({ where: { id: boothA24!.id }, data: { status: "CONTRACTED" } });
    await db.floorPlanObject.create({ data: { boothUnitId: boothA24!.id, label: "ABC Pharma — A24", x: 12, y: 4, width: 4, height: 3 } });
    await db.boothAllocation.create({ data: { boothUnitId: boothB01!.id, organizationId: beta.id, status: "OPTION" } });
    await db.boothUnit.update({ where: { id: boothB01!.id }, data: { status: "OPTION", optionExpiresAt: D(4, 17) } });

    // ── Bilimsel (§24-28) ──
    await db.scientificSetup.create({
      data: {
        editionId: edition1.id, callTitle: "No-Dig Turkey 2026 Bildiri Çağrısı",
        callDescription: "Kazısız teknolojiler, tünel mühendisliği ve geoteknik konularında özgün çalışmalar bekleniyor.",
        reviewMode: "SINGLE_BLIND", submissionDeadline: D(-45), reviewDeadline: D(-20), wordLimit: 500, isVisible: true,
      },
    });
    const tr1 = await db.track.create({ data: { editionId: edition1.id, name: "Kazı Teknolojileri", description: "TBM, mikro tünel, HDD" } });
    const tr2 = await db.track.create({ data: { editionId: edition1.id, name: "Tünel Mühendisliği", description: "Tasarım, işletme, bakım" } });
    const tr3 = await db.track.create({ data: { editionId: edition1.id, name: "Geoteknik", description: "Zemin iyileştirme, enjeksiyon" } });

    const subData: [string, string, string, string, string, string | null, string | null][] = [
      // title, track, type, status, presenting, decision, fileStatus
      ["TBM Kesici Kafa Aşınmasının Makine Öğrenmesi ile Tahmini", "Kazı Teknolojileri", "ORAL", "ACCEPTED", "Ahmet Yılmaz", "ACCEPT_ORAL", "APPROVED"],
      ["Mikro Tünel Uygulamalarında Yerleşim İzlerinin İzlenmesi", "Kazı Teknolojileri", "ORAL", "ACCEPTED", "Mehmet Demir", "ACCEPT_ORAL", "APPROVED"],
      ["HDD Projelerinde Risk Matrisi Yaklaşımı", "Kazı Teknolojileri", "ORAL", "ACCEPTED", "Ayşe Kara", "ACCEPT_ORAL", null],
      ["Tünel Havalandırmasında Enerji Optimizasyonu", "Tünel Mühendisliği", "POSTER", "ACCEPTED", "Seda Polat", "ACCEPT_POSTER", "MISSING"],
      ["Enjeksiyon Basınç Parametrelerinin Saha Deneyimi", "Geoteknik", "POSTER", "ACCEPTED", "Emre Özkan", "ACCEPT_POSTER", "FORMAT_ISSUE"],
      ["Derin Kazı Duvarlarında Dekonvolüsyon Analizi", "Geoteknik", "ORAL", "UNDER_REVIEW", "Can Arslan", null, null],
      ["Tünel Açılmış Zeminlerde Çökme Tahmini", "Tünel Mühendisliği", "ORAL", "UNDER_REVIEW", "Gizem Bulut", null, null],
      ["Yeni Nesil Bentonit Karışımlarının Laboratuvar Karşılaştırması", "Geoteknik", "ORAL", "UNDER_REVIEW", "Pınar Yavuz", null, null],
      ["TBM Disk Kesicilerinde Yeniden Kullanım Ekonomisi", "Kazı Teknolojileri", "ORAL", "REVISION_REQUIRED", "Onur Erdem", "REVISION_REQUIRED", null],
      ["Kentsel Kazılarda Titreşim Sınır Değerleri", "Tünel Mühendisliği", "ORAL", "SUBMITTED", "Barış Tekin", null, null],
      ["Epoxy Enjeksiyonun Suya Doygun Zeminlerde Performansı", "Geoteknik", "POSTER", "SUBMITTED", "Serpil Ateş", null, null],
      ["Tünel Yangın Senaryolarında Simülasyon Karşılaştırması", "Tünel Mühendisliği", "ORAL", "REJECTED", "Ünsal Kağan", "REJECT", null],
      ["Hidrolik Fraktür İzleme Teknikleri", "Geoteknik", "ORAL", "WITHDRAWN", "Fatma Çelik", "WITHDRAWN", null],
      ["Kesici Kafa Geometrisinin Torque Profiline Etkisi", "Kazı Teknolojileri", "ORAL", "DRAFT", "Ahmet Yılmaz", null, null],
    ];
    let subNo = 100;
    const subByName = new Map<string, string>();
    for (const [title, trackName, type, status, presenting, decision, fileStatus] of subData) {
      const track = [tr1, tr2, tr3].find((t) => t.name === trackName)!;
      const [pFirst, ...rest] = presenting.split(" ");
      const person = people.find((p) => p.firstName === pFirst && p.lastName === rest.join(" "));
      const sub = await db.submission.create({
        data: {
          editionId: edition1.id, trackId: track.id, submitterId: person?.id,
          code: `SUB-${subNo}`, title, type, status, presentingAuthorName: presenting,
          fileStatus, submittedAt: status === "DRAFT" ? null : D(-44 + subNo % 20, 16),
          abstract: `${title} — bu çalışmada saha ve laboratuvar verileri karşılaştırılmıştır.`,
          keywords: "tünel, kazı, geoteknik",
        },
      });
      await db.authorship.create({ data: { submissionId: sub.id, personId: person?.id, name: presenting, organizationName: person?.company, isPresenting: true, isCorresponding: true, position: 1 } });
      if (decision) {
        await db.decision.create({ data: { submissionId: sub.id, decision, rationale: decision === "REJECT" ? "Özgünlük yetersiz bulundu" : decision === "REVISION_REQUIRED" ? "Metodoloji bölümü netleştirilmeli" : "Komite oybirliğiyle uygun buldu", decidedBy: "Bilimsel Komite", decidedAt: D(-18, 12) } });
      }
      if (status === "UNDER_REVIEW") {
        const reviewers = [P.Mehmet, P.Ayşe, P.Seda];
        for (const [i, rv] of reviewers.entries()) {
          const st = ["ASSIGNED", "IN_PROGRESS", "OVERDUE"][i];
          const ra = await db.reviewAssignment.create({ data: { submissionId: sub.id, reviewerId: rv.id, status: st, dueDate: D(i === 2 ? -3 : 5), invitedAt: D(-15) } });
          if (st === "ASSIGNED") {
            await db.review.create({ data: { assignmentId: ra.id, score: 4, recommendation: "ACCEPT_ORAL", comment: "Metodoloji sağlam, saha verisi değerli." } });
          }
        }
      }
      subByName.set(title, sub.id);
      subNo++;
    }

    // ── Program (§28: kabul ≠ otomatik slot) ──
    const roomMain = await db.programRoom.create({ data: { editionId: edition1.id, name: "Ana Salon", capacity: 600, floor: "Kat 1" } });
    const roomB = await db.programRoom.create({ data: { editionId: edition1.id, name: "Salon B", capacity: 120, floor: "Kat 2" } });
    const roomPoster = await db.programRoom.create({ data: { editionId: edition1.id, name: "Poster Alanı", capacity: 300, floor: "Kat 1" } });

    const sesKeynote = await db.programSession.create({ data: { editionId: edition1.id, roomId: roomMain.id, title: "Açılış Konuşması: Türkiye'de Kazısız Gelecek", type: "KEYNOTE", startTime: D(0, 9, 30), endTime: D(0, 10, 30), status: "PUBLISHED", isVisible: true, accessRule: "OPEN" } });
    const ses1 = await db.programSession.create({ data: { editionId: edition1.id, roomId: roomMain.id, trackId: tr1.id, submissionId: subByName.get("TBM Kesici Kafa Aşınmasının Makine Öğrenmesi ile Tahmini"), title: "TBM Kesici Kafa Aşınması — ML Tahmini", type: "TALK", startTime: D(0, 11, 0), endTime: D(0, 11, 30), status: "PUBLISHED", isVisible: true } });
    const ses2 = await db.programSession.create({ data: { editionId: edition1.id, roomId: roomB.id, title: "HDD Risk Yönetimi Atölyesi", type: "WORKSHOP", startTime: D(0, 14, 0), endTime: D(0, 16, 0), capacity: 40, status: "APPROVED", accessRule: "REGISTRATION_REQUIRED" } });
    const sesPanel = await db.programSession.create({ data: { editionId: edition1.id, roomId: roomMain.id, title: "Büyük Projelerde Paydaş Paneli", type: "PANEL", startTime: D(1, 10, 0), endTime: D(1, 11, 30), status: "ASSIGNED" } });
    const sesPoster = await db.programSession.create({ data: { editionId: edition1.id, roomId: roomPoster.id, title: "Poster Oturumu I", type: "POSTER_SESSION", startTime: D(1, 13, 0), endTime: D(1, 14, 30), status: "DRAFT" } });
    await db.programSession.create({ data: { editionId: edition1.id, roomId: roomMain.id, title: "Öğle Arası", type: "BREAK", startTime: D(0, 12, 30), endTime: D(0, 14, 0), status: "PUBLISHED", isVisible: true } });
    await db.programSession.create({ data: { editionId: edition1.id, roomId: roomMain.id, title: "Kapanış & Sertifika Töreni", type: "NETWORKING", startTime: D(2, 16, 0), endTime: D(2, 17, 30), status: "DRAFT" } });

    await db.programAssignment.createMany({
      data: [
        { sessionId: sesKeynote.id, participationId: participationMap.get("Mehmet")!.participationId, personId: P.Mehmet.id, role: "SPEAKER", status: "CONFIRMED" },
        { sessionId: sesKeynote.id, participationId: participationMap.get("Ayşe")!.participationId, personId: P.Ayşe.id, role: "SESSION_CHAIR", status: "CONFIRMED" },
        { sessionId: ses1.id, participationId: participationMap.get("Ahmet")!.participationId, personId: P.Ahmet.id, role: "SPEAKER", status: "CONFIRMED" },
        { sessionId: ses2.id, participationId: participationMap.get("Seda")!.participationId, personId: P.Seda.id, role: "MODERATOR", status: "ACCEPTED" },
        { sessionId: sesPanel.id, participationId: participationMap.get("Mustafa")!.participationId, personId: P.Mustafa.id, role: "PANELIST", status: "INVITED" },
      ],
    });
    // program bekleyen: kabul edilmiş ama oturumsuz (ses2/ses1 bağlandı; 3. kabul ve posterler bağlanmadı)

    // ── Konaklama (§31-35) ──
    const hotel = await db.hotelProperty.create({ data: { editionId: edition1.id, name: "Maslak Grand Otel", city: "İstanbul", district: "Maslak", contactName: "Rezervasyon", contactPhone: "+90 212 000 00 00" } });
    const rtSingle = await db.roomType.create({ data: { hotelId: hotel.id, name: "Standard Single", capacity: 1, pricePerNight: 3500 } });
    const rtDouble = await db.roomType.create({ data: { hotelId: hotel.id, name: "Standard Double", capacity: 2, pricePerNight: 4200 } });
    const blockSingle = await db.roomBlock.create({ data: { hotelId: hotel.id, roomTypeId: rtSingle.id, name: "Maven Tek Kişilik Blok", releaseDate: D(7), cancellationPolicy: "Girişten 72 saat öncesine kadar ücretsiz", payerPolicy: "Rezervasyon bazında" } });
    const blockDouble = await db.roomBlock.create({ data: { hotelId: hotel.id, roomTypeId: rtDouble.id, name: "Maven Çift Kişilik Blok", releaseDate: D(7), cancellationPolicy: "Girişten 72 saat öncesine kadar ücretsiz", payerPolicy: "SELF" } });
    for (let i = -1; i <= 2; i++) {
      await db.inventoryNight.create({ data: { blockId: blockSingle.id, date: D(i), totalRooms: 30, reservedRooms: 12 } });
      await db.inventoryNight.create({ data: { blockId: blockDouble.id, date: D(i), totalRooms: 20, reservedRooms: i === 0 ? 18 : 11 } });
    }
    const res1 = await db.reservation.create({ data: { editionId: edition1.id, blockId: blockDouble.id, roomTypeId: rtDouble.id, primaryGuestParticipationId: participationMap.get("Mehmet")!.participationId, guestName: "Mehmet Demir", checkIn: D(-1), checkOut: D(2), payerType: "ORGANIZATION", payerName: "Delta Üniversitesi", status: "CONFIRMED" } });
    await db.occupancySlot.createMany({ data: [{ reservationId: res1.id, participationId: participationMap.get("Mehmet")!.participationId, guestName: "Mehmet Demir", position: 1 }] });
    await db.roommateRequest.create({ data: { requesterParticipationId: participationMap.get("Ahmet")!.participationId, targetParticipationId: participationMap.get("Onur")!.participationId, targetName: "Onur Erdem", status: "ACCEPTED" } });
    await db.reservation.createMany({
      data: [
        { editionId: edition1.id, blockId: blockSingle.id, roomTypeId: rtSingle.id, primaryGuestParticipationId: participationMap.get("Seda")!.participationId, guestName: "Seda Polat", checkIn: D(-1), checkOut: D(1), payerType: "SELF", status: "CONFIRMED" },
        { editionId: edition1.id, blockId: blockSingle.id, roomTypeId: rtSingle.id, primaryGuestParticipationId: participationMap.get("Can")!.participationId, guestName: "Can Arslan", checkIn: D(0), checkOut: D(2), payerType: "SELF", status: "REQUESTED" },
        { editionId: edition1.id, blockId: blockDouble.id, roomTypeId: rtDouble.id, guestName: "Bekleme — Heyet Odası", checkIn: D(0), checkOut: D(2), payerType: "SPONSOR", payerName: "ABC Pharma", status: "WAITLIST" },
        { editionId: edition1.id, blockId: blockSingle.id, roomTypeId: rtSingle.id, guestName: "İptal — Deneme", checkIn: D(-1), checkOut: D(0), payerType: "SELF", status: "CANCELLED" },
      ],
    });

    // ── Form Merkezi (§44 + kullanıcı isteği: kayıt/anket/mobil QA + spam koruması) ──
    const form = await db.formDefinition.create({
      data: {
        editionId: edition1.id, name: "Online Kayıt Formu", type: "REGISTRATION",
        audience: "PARTICIPANT", status: "PUBLISHED", version: 3, isPublic: true,
        description: "No-Dig Turkey 2026 online kayıt — onay akışı ve online ödeme entegre.",
        honeypotEnabled: true, minSubmitSeconds: 4, maxPerEmailPerDay: 5,
        blockedDomains: "spam.xyz, tempmail.xyz, guvensizmail.com",
        autoApprove: false, enableOnlinePayment: true, defaultCategoryId: catRegular.id,
        successMessage: "Kayıt başvurunuz alındı! Ödeme bağlantısı e-posta ile de gönderilir.",
      },
    });
    const f1 = await db.formField.create({ data: { formId: form.id, label: "Kurum / Şirket", type: "TEXT", required: "ALWAYS", placeholder: "Örn. ABC Pharma", order: 1 } });
    const f2 = await db.formField.create({ data: { formId: form.id, label: "Unvan", type: "TEXT", order: 2 } });
    const f3 = await db.formField.create({ data: { formId: form.id, label: "Beslenme tercihi", type: "SINGLE_CHOICE", options: "Standart\nVejetaryen\nHelal\nGlutensiz", sensitivity: "OPERATIONAL_SENSITIVE", order: 3 } });
    const f4 = await db.formField.create({ data: { formId: form.id, label: "Erişim ihtiyacı var mı?", type: "CHECKBOX", sensitivity: "TEAM_ONLY", order: 4 } });
    const f5 = await db.formField.create({ data: { formId: form.id, label: "Konaklama istiyor musunuz?", type: "CHECKBOX", conditionField: "Kayıt kategorisi", conditionValue: "REG", order: 5 } });
    const f6 = await db.formField.create({ data: { formId: form.id, label: "Varış tarihi", type: "DATE", conditionField: "Konaklama istiyor musunuz?", conditionValue: "true", order: 6 } });
    const f7 = await db.formField.create({ data: { formId: form.id, label: "Ödeme yöntemi", type: "SINGLE_CHOICE", options: "Online Kart\nHavale / EFT\nÖdeme Linki", required: "ALWAYS", order: 7, helpText: "Online Kart seçiminde sanal POS üzerinden anında ödeme yapabilirsiniz." } });
    for (const [name, rec] of [...participationMap].slice(0, 10)) {
      const person = P[name];
      await db.formAnswer.createMany({
        data: [
          { formId: form.id, fieldId: f1.id, participationId: rec.participationId, answer: person.company },
          { formId: form.id, fieldId: f2.id, participationId: rec.participationId, answer: person.title },
          { formId: form.id, fieldId: f3.id, participationId: rec.participationId, answer: ["Standart", "Vejetaryen", "Helal"][Number(rec.participationId.slice(-1).charCodeAt(0)) % 3] },
        ],
      });
    }

    // Anket formu — mobil interaktif alanlar (NPS/RATING/QA) + dağılım istatistiği demesi
    const survey = await db.formDefinition.create({
      data: {
        editionId: edition1.id, name: "Kongre Memnuniyet Anketi", type: "SURVEY",
        status: "PUBLISHED", isPublic: true, autoApprove: true,
        description: "Oturum kalitesi ve öneri ölçümü — mobil uygulamada interaktif olarak da açılır.",
        honeypotEnabled: true, minSubmitSeconds: 3, maxPerEmailPerDay: 3,
        successMessage: "Görüşünüz için teşekkürler!",
      },
    });
    const sv1 = await db.formField.create({ data: { formId: survey.id, label: "Kongreyi nereden duydunuz?", type: "SINGLE_CHOICE", options: "E-posta\nSosyal Medya\nArkadaş Önerisi\nDernek Duyurusu", order: 1 } });
    const sv2 = await db.formField.create({ data: { formId: survey.id, label: "Oturum kalitesi (1-5)", type: "RATING", mobileInteractive: true, order: 2 } });
    const sv3 = await db.formField.create({ data: { formId: survey.id, label: "Bizi bir meslektaşınıza önerme olasılığınız (0-10)", type: "NPS", mobileInteractive: true, order: 3 } });
    const sv4 = await db.formField.create({ data: { formId: survey.id, label: "No-Dig teknolojisi hangi alanda kullanılır?", type: "QA_QUIZ", options: "Kazısız altyapı\nAçık ocak madenciliği\nZiraat", mobileInteractive: true, order: 4 } });
    const sv5 = await db.formField.create({ data: { formId: survey.id, label: "Önerileriniz", type: "LONGTEXT", order: 5 } });
    const surveyRespondents = [
      ["İlkay Tan", "ilkay.tan@example.com", "E-posta", 4, 9, "Kazısız altyapı", "Program çok akıcıydı."],
      ["Sercan Uz", "sercan.uz@example.com", "Sosyal Medya", 5, 10, "Kazısız altyapı", "Tebrikler!"],
      ["Merve Ak", "merve.ak@example.com", "Arkadaş Önerisi", 3, 7, "Ziraat", "Salon ses sistemi geliştirilebilir."],
      ["Hakan Vişne", "hakan.visne@example.com", "E-posta", 4, 8, "Kazısız altyapı", null],
      ["Duygu Keser", "duygu.keser@example.com", "Dernek Duyurusu", 5, 10, "Kazısız altyapı", "Gelecek yıl 2 günlük atölye olsun."],
      ["Baran Toprak", "baran.toprak@example.com", "Sosyal Medya", 2, 5, "Açık ocak madenciliği", "Kayıt masasında kuyruk oluştu."],
      ["Esra Nur Akın", "esra.akin@example.com", "E-posta", 4, 9, "Kazısız altyapı", null],
      ["Cem Doğrusöz", "cem.dogrusoz@example.com", "Arkadaş Önerisi", 5, 10, "Kazısız altyapı", "Mükemmel organizasyon."],
    ] as const;
    for (const [i, s] of surveyRespondents.entries()) {
      const sub = await db.formSubmission.create({
        data: {
          formId: survey.id, editionId: edition1.id,
          respondentName: s[0], respondentEmail: s[1],
          status: "APPROVED", spamScore: 0, elapsedSeconds: 25 + i * 7,
          source: i % 4 === 0 ? "MOBILE" : "WEB_PUBLIC",
          createdAt: D(-i, 12),
        },
      });
      await db.formAnswer.createMany({
        data: [
          { formId: survey.id, fieldId: sv1.id, submissionId: sub.id, answer: s[2] },
          { formId: survey.id, fieldId: sv2.id, submissionId: sub.id, answer: String(s[3]) },
          { formId: survey.id, fieldId: sv3.id, submissionId: sub.id, answer: String(s[4]) },
          { formId: survey.id, fieldId: sv4.id, submissionId: sub.id, answer: s[5] },
          ...(s[6] ? [{ formId: survey.id, fieldId: sv5.id, submissionId: sub.id, answer: s[6] }] : []),
        ],
      });
    }

    // Kayıt formu gönderileri — spam örnekleri + bekleyenler + onaylı zincir örneği
    const spamSub1 = await db.formSubmission.create({
      data: {
        formId: form.id, editionId: edition1.id,
        respondentName: "SEO Robot", respondentEmail: "promobot@spam.xyz",
        status: "SPAM", spamScore: 100, honeypotValue: "http://bit.ly/reklam",
        elapsedSeconds: 1.2, submitIp: "203.0.113.66", source: "WEB_PUBLIC",
        spamReasons: JSON.stringify(["Gizli doğrulama alanı dolduruldu (honeypot) — otomatik bot davranışı"]),
        createdAt: D(0, 7, 41),
      },
    });
    const spamSub2 = await db.formSubmission.create({
      data: {
        formId: form.id, editionId: edition1.id,
        respondentName: "Bulk Mail", respondentEmail: "kazanc@tempmail.xyz",
        status: "SPAM", spamScore: 100, elapsedSeconds: 2.5, submitIp: "198.51.100.23",
        spamReasons: JSON.stringify(["E-posta alan adı engelli listede: tempmail.xyz"]),
        createdAt: D(0, 8, 3),
      },
    });
    const spamSub3 = await db.formSubmission.create({
      data: {
        formId: form.id, editionId: edition1.id,
        respondentName: "Hızlı Bot", respondentEmail: "hizli@hizlibot.net",
        status: "SPAM", spamScore: 60, elapsedSeconds: 0.8, submitIp: "203.0.113.66",
        spamReasons: JSON.stringify(["Form 0.8 sn'de dolduruldu (insan minimumu 4 sn)"]),
        createdAt: D(0, 8, 11),
      },
    });
    const pendSub1 = await db.formSubmission.create({
      data: {
        formId: form.id, editionId: edition1.id,
        respondentName: "Zafer Kaya", respondentEmail: "zafer.kaya@example.com",
        phone: "+90 532 111 22 33", organization: "Kaya İnşaat",
        status: "PENDING", spamScore: 0, elapsedSeconds: 38, submitIp: "88.241.10.5",
        spamReasons: null, createdAt: D(0, 9, 15),
      },
    });
    await db.formAnswer.createMany({
      data: [
        { formId: form.id, fieldId: f1.id, submissionId: pendSub1.id, answer: "Kaya İnşaat" },
        { formId: form.id, fieldId: f2.id, submissionId: pendSub1.id, answer: "Saha Müdürü" },
        { formId: form.id, fieldId: f3.id, submissionId: pendSub1.id, answer: "Standart" },
        { formId: form.id, fieldId: f7.id, submissionId: pendSub1.id, answer: "Online Kart" },
      ],
    });
    const pendSub2 = await db.formSubmission.create({
      data: {
        formId: form.id, editionId: edition1.id,
        respondentName: "Nil Aksu", respondentEmail: "nil.aksu@example.com",
        organization: "GeoLab Danışmanlık", status: "PENDING", spamScore: 0,
        elapsedSeconds: 52, submitIp: "78.163.44.9", createdAt: D(0, 10, 2),
      },
    });
    await db.formAnswer.createMany({
      data: [
        { formId: form.id, fieldId: f1.id, submissionId: pendSub2.id, answer: "GeoLab Danışmanlık" },
        { formId: form.id, fieldId: f7.id, submissionId: pendSub2.id, answer: "Havale / EFT" },
      ],
    });
    const apprSub1 = await db.formSubmission.create({
      data: {
        formId: form.id, editionId: edition1.id,
        respondentName: "Tuna Meriç", respondentEmail: "tuna.meric@example.com",
        organization: "Meriç Zemin Sistemleri", status: "APPROVED", spamScore: 0,
        elapsedSeconds: 44, submitIp: "85.99.71.2", createdAt: D(-1, 15, 40),
      },
    });
    await db.formAnswer.createMany({
      data: [
        { formId: form.id, fieldId: f1.id, submissionId: apprSub1.id, answer: "Meriç Zemin Sistemleri" },
        { formId: form.id, fieldId: f3.id, submissionId: apprSub1.id, answer: "Helal" },
        { formId: form.id, fieldId: f7.id, submissionId: apprSub1.id, answer: "Online Kart" },
      ],
    });
    // Onaylı gönderi → kayıt zinciri + ödemesi tahsil edilmiş sipariş (muhasebe demesi)
    const { registration: apprReg, order: apprOrder, payment: apprPay } =
      await createRegistrationFromSubmission(apprSub1.id, { paymentSource: "ONLINE_CARD" });
    if (apprReg && apprOrder && apprPay) {
      await db.payment.update({
        where: { id: (apprPay as { id: string }).id },
        data: { status: "SUCCEEDED", paidAt: D(-1, 16, 2), reference: "TR-SEED-0981" },
      });
      await db.order.update({ where: { id: (apprOrder as { id: string }).id }, data: { status: "PAID" } });
    }
    await db.formSubmission.update({ where: { id: apprSub1.id }, data: { registrationId: (apprReg as { id: string }).id } });

    // Bağlantı cevapları: mevcut katılımcıların form yanıtlarını gönderiye bağla (geçmiş veri bütünlüğü görünümü)
    await db.formSubmission.create({
      data: {
        formId: form.id, editionId: edition1.id,
        respondentName: "Gizem Bulut", respondentEmail: "gizem.bulut@example.com",
        organization: "Yol Yapım A.Ş.", status: "APPROVED", spamScore: 0,
        elapsedSeconds: 61, source: "ADMIN", createdAt: D(-3, 11),
      },
    });

    // Geri bildirim formu — kapalı durum örneği
    await db.formDefinition.create({
      data: {
        editionId: edition1.id, name: "Oturum Geri Bildirimi (Salon B)", type: "FEEDBACK",
        status: "CLOSED", description: "Salon B oturumları için anlık memnuniyet — oturum sonunda kapatıldı.",
        honeypotEnabled: true, minSubmitSeconds: 2,
      },
    });
    // Taslak özel form — TechDays fuarcı ihtiyaç formu
    await db.formDefinition.create({
      data: {
        editionId: edition2.id, name: "TechDays Fuarcı İhtiyaç Formu", type: "CUSTOM",
        audience: "ORGANIZATION", status: "DRAFT",
        description: "Stand elektrik, mobilya ve katalog bilgileri — kurulum öncesi toplanacak.",
      },
    });

    // ── Muhasebe: ek/saha harcamaları (kullanıcı isteği: kayıt muhasebesiyle entegre) ──
    await db.expense.createMany({
      data: [
        { editionId: edition1.id, code: "GSN-2026-001", category: "FIELD_EXPENSE", title: "Kapı A yedek barkod okuyucu (acil alım)", description: "Tarama cihazı arızası — fuar günü sabah acil satın alma", amount: 4200, vendor: "Nokta Bilişim", incurredAt: D(0, 8, 30), spentBy: "Mert Şahin", paymentMethod: "CASH", status: "APPROVED", receiptNo: "FTR-1181", approvedBy: "Burak Demir" },
        { editionId: edition1.id, code: "GSN-2026-002", category: "CATERING", title: "Ek kahve molası — Salon B", description: "Oturum yoğunluğu nedeniyle ikram sifarişi artırıldı", amount: 6800, vendor: "Lezzet Catering", incurredAt: D(-1, 14), spentBy: "Kerem Aksoy", paymentMethod: "COMPANY_CARD", status: "PENDING_RECEIPT" },
        { editionId: edition1.id, code: "GSN-2026-003", category: "LOGISTICS", title: "Poster panosu kargo (Ankara → İstanbul)", amount: 2350, vendor: "Yurtiçi Kargo", incurredAt: D(-4), spentBy: "Selin Öztürk", paymentMethod: "BANK_TRANSFER", status: "PAID", receiptNo: "FTR-0972" },
        { editionId: edition1.id, code: "GSN-2026-004", category: "TECH", title: "Yedek mikrofon seti kiralama", description: "Ana salon yedek ekipman — 3 günlük kiralama", amount: 9800, vendor: "Ses Sistemleri A.Ş.", incurredAt: D(-2), spentBy: "Mert Şahin", paymentMethod: "BANK_TRANSFER", status: "APPROVED", receiptNo: "FTR-1043", approvedBy: "Burak Demir" },
        { editionId: edition1.id, code: "GSN-2026-005", category: "STAFF_TRAVEL", title: "Görevli havalimanı transferi (taksi)", description: "Yusuf B. — gece vardiyası dönüşü", amount: 1250, incurredAt: D(-1, 23, 30), spentBy: "Yusuf Bilgin", paymentMethod: "PERSONAL_REIMBURSE", status: "REIMBURSED", approvedBy: "Elif Kaya" },
        { editionId: edition1.id, code: "GSN-2026-006", category: "MARKETING", title: "Canlı yayın kurgu ek paketi", description: "Sosyal medya canlı yayın destek paketi (teklif aşaması)", amount: 15000, vendor: "Medya Prodüksiyon", incurredAt: D(1), paymentMethod: "BANK_TRANSFER", status: "PLANNED" },
        { editionId: edition1.id, code: "GSN-2026-007", category: "FIELD_EXPENSE", title: "Fuar alanı ek elektrik panosu bağlantısı", description: "Stand yoğunluğu — panosuz ek hat çekimi, sahada nakit ödeme", amount: 5400, vendor: "ICC Teknik Servis", incurredAt: D(0, 11), spentBy: "Kerem Aksoy", paymentMethod: "CASH", status: "APPROVED", receiptNo: "MAKBUZ-77", approvedBy: "Mert Şahin" },
        { editionId: edition1.id, code: "GSN-2026-008", category: "OTHER", title: "Kayıt masası ek matbaa baskısı", description: "Beklenmedik yoğun kayıt — ek program kitabı baskısı", amount: 3100, vendor: "Anadolu Matbaa", incurredAt: D(-1, 9), spentBy: "Leyla Güneş", paymentMethod: "COMPANY_CARD", status: "PENDING_RECEIPT" },
      ],
    });

    // ── Katalog / ek hizmetler ──
    await db.catalogItem.createMany({
      data: [
        { editionId: edition1.id, category: "GALA", name: "Gala Yemeği", description: "3. gün akşam gala yemeği", price: 2500, quantity: 300 },
        { editionId: edition1.id, category: "TOUR", name: "Teknik Gezi — Marmaray", price: 1000, quantity: 60, availableFor: "ALL" },
        { editionId: edition1.id, category: "ADDON", name: "Ek Atölye: HDD Güvenlik", price: 750, quantity: 40 },
        { editionId: edition1.id, category: "SERVICE", name: "Stand Ekstra Elektrik", price: 1500, availableFor: "SPONSOR" },
      ],
    });

    // ── Sipariş & Ödeme (§36-39) ──
    const o1 = await db.order.create({ data: { editionId: edition1.id, orderNo: "ORD-2026-0001", buyerPersonId: P.Mustafa.id, payerName: "Mustafa Koç", totalAmount: 5000, status: "PAID" } });
    await db.orderLine.create({ data: { orderId: o1.id, participationId: participationMap.get("Mustafa")!.participationId, registrationId: participationMap.get("Mustafa")!.registrationId, description: "Kongre Katılımı — Erken Kayıt", quantity: 1, unitPrice: 5000, total: 5000 } });
    await db.payment.create({ data: { orderId: o1.id, amount: 5000, source: "ONLINE_CARD", status: "SUCCEEDED", reference: "PAY-99112", paidAt: D(-12, 14) } });

    const o2 = await db.order.create({ data: { editionId: edition1.id, orderNo: "ORD-2026-0002", buyerOrganizationId: uni.id, payerName: "Delta Üniversitesi", totalAmount: 20000, status: "PARTIALLY_PAID" } });
    await db.orderLine.create({ data: { orderId: o2.id, participationId: participationMap.get("Ayşe")!.participationId, registrationId: participationMap.get("Ayşe")!.registrationId, description: "Kongre Katılımı × 3 (kurumsal)", quantity: 3, unitPrice: 5000, total: 15000 } });
    await db.orderLine.create({ data: { orderId: o2.id, participationId: participationMap.get("Vildan")!.participationId, registrationId: participationMap.get("Vildan")!.registrationId, description: "Refakatçi Kaydı", quantity: 1, unitPrice: 2000, total: 2000 } });
    await db.orderLine.create({ data: { orderId: o2.id, description: "Gala Yemeği × 3", catalogItemId: null, quantity: 3, unitPrice: 1000, total: 3000 } });
    await db.payment.create({ data: { orderId: o2.id, amount: 12000, source: "BANK_TRANSFER", status: "SUCCEEDED", reference: "HV-77231", paidAt: D(-8) } });

    const o3 = await db.order.create({ data: { editionId: edition1.id, orderNo: "ORD-2026-0003", buyerPersonId: P.Barış.id, payerName: "Barış Tekin", totalAmount: 5000, status: "OPEN" } });
    await db.orderLine.create({ data: { orderId: o3.id, participationId: participationMap.get("Barış")!.participationId, registrationId: participationMap.get("Barış")!.registrationId, description: "Kongre Katılımı", quantity: 1, unitPrice: 5000, total: 5000 } });

    const o4 = await db.order.create({ data: { editionId: edition1.id, orderNo: "ORD-2026-0004", buyerOrganizationId: abcPharma.id, payerName: "ABC Pharma", totalAmount: 12000, status: "PARTIALLY_PAID" } });
    await db.orderLine.create({ data: { orderId: o4.id, description: "Stand Ekstra Elektrik × 2", quantity: 2, unitPrice: 1500, total: 3000 } });
    await db.orderLine.create({ data: { orderId: o4.id, description: "Gala Davetiyesi (hak dışı) × 6", quantity: 6, unitPrice: 1500, total: 9000 } });
    await db.payment.create({ data: { orderId: o4.id, amount: 8000, source: "MANUAL_EXTERNAL", status: "SUCCEEDED", reference: "SF-2231", enteredBy: "Zeynep Arslan", reason: "Kurum faturası havale ile ödendi", paidAt: D(-6) } });
    await db.refund.create({ data: { orderId: o4.id, amount: 2000, reason: "İptal edilen gala davetiyesi × 2", status: "PROCESSED", requestedBy: "Zeynep Arslan", processedAt: D(-4) } });
    await db.refund.create({ data: { orderId: o4.id, amount: 500, reason: "Kalem düzeltme bekliyor", status: "REQUESTED" } });

    const o5 = await db.order.create({ data: { editionId: edition1.id, orderNo: "ORD-2026-0005", buyerPersonId: P.Onur.id, payerName: "Onur Erdem", totalAmount: 6000, status: "PAID" } });
    await db.orderLine.create({ data: { orderId: o5.id, participationId: participationMap.get("Onur")!.participationId, registrationId: participationMap.get("Onur")!.registrationId, description: "Kongre Katılımı", quantity: 1, unitPrice: 5000, total: 5000 } });
    await db.orderLine.create({ data: { orderId: o5.id, description: "Teknik Gezi — Marmaray", quantity: 1, unitPrice: 1000, total: 1000 } });
    await db.payment.create({ data: { orderId: o5.id, amount: 6000, source: "POS", status: "SUCCEEDED", paidAt: D(-2, 10) } });

    const o6 = await db.order.create({ data: { editionId: edition1.id, orderNo: "ORD-2026-0006", buyerPersonId: P.Gizem.id, payerName: "Gizem Bulut", totalAmount: 5000, status: "PARTIALLY_PAID" } });
    await db.orderLine.create({ data: { orderId: o6.id, participationId: participationMap.get("Gizem")!.participationId, registrationId: participationMap.get("Gizem")!.registrationId, description: "Kongre Katılımı — grup", quantity: 1, unitPrice: 5000, total: 5000 } });
    await db.payment.create({ data: { orderId: o6.id, amount: 2000, source: "PAYMENT_LINK", status: "SUCCEEDED", paidAt: D(-1, 9) } });
    await db.payment.create({ data: { orderId: o2.id, amount: 2000, source: "MANUAL_EXTERNAL", status: "PENDING", enteredBy: "Kaan Yıldız", reason: "Muhasebe ekstresi beklemede" } });
    await db.payment.create({ data: { orderId: o3.id, amount: 5000, source: "ONLINE_CARD", status: "FAILED", reference: "PAY-99377" } });

    // ── LCV (davetler) ──
    await db.invitation.createMany({
      data: [
        { editionId: edition1.id, organizationId: abcPharma.id, email: "nihan.ergun@example.com", fullName: "Nihan Ergün", suggestedCategoryId: catExhibitor.code, status: "COMING", sentAt: D(-20), respondedAt: D(-15) },
        { editionId: edition1.id, organizationId: abcPharma.id, email: "kemal.tuna@example.com", fullName: "Kemal Tuna", suggestedCategoryId: catExhibitor.code, status: "COMING", sentAt: D(-20), respondedAt: D(-14) },
        { editionId: edition1.id, organizationId: uni.id, email: "hoca@delta.example", fullName: "Doç. Dr. Ali Vural", status: "RESPONSE_PENDING", sentAt: D(-10) },
        { editionId: edition1.id, organizationId: media.id, email: "haber@teknobasin.example", fullName: "Ceren Gezer", status: "COMING", sentAt: D(-18), respondedAt: D(-16) },
        { editionId: edition1.id, organizationId: icc.id, email: "yonetim@icc.example", fullName: "ICC Yönetim Heyeti", status: "COMING", sentAt: D(-25), respondedAt: D(-22) },
        { editionId: edition1.id, organizationId: beta.id, email: "planlama@beta.example", fullName: "Beta Planlama Ekibi", status: "NOT_COMING", sentAt: D(-22), respondedAt: D(-19) },
        { editionId: edition1.id, organizationId: media.id, email: "spor@teknobasin.example", fullName: "Mert Uçar (Basın)", status: "NOT_COMING", sentAt: D(-22), respondedAt: D(-20) },
        { editionId: edition1.id, organizationId: uni.id, email: "sekreterlik@delta.example", fullName: "Delta Sekreterlik", status: "DELIVERED", sentAt: D(-5) },
        { editionId: edition1.id, organizationId: pco.id, email: "ekip@eventiva.example", fullName: "Eventiva Ekip Liderleri", status: "DELIVERED", sentAt: D(-4) },
        { editionId: edition1.id, organizationId: abcPharma.id, email: "global@abcpharma.example", fullName: "ABC Global Delegation", status: "NO_RESPONSE", sentAt: D(-30) },
        { editionId: edition1.id, organizationId: hotelOrg.id, email: "genel@maslakgrand.example", fullName: "Maslak Grand GM", status: "COMING", sentAt: D(-12), respondedAt: D(-11) },
        { editionId: edition1.id, organizationId: pco.id, email: "av@eventiva.example", fullName: "Avukat Gül Erten", status: "RESPONSE_PENDING", sentAt: D(-7) },
      ],
    });

    // ── Rozet & Credential & Taramalar (§40-42) ──
    const bpDelegate = await db.badgeProfile.create({ data: { editionId: edition1.id, name: "Delegate", accessAreas: "Ana Salon, Poster Alanı", color: "teal" } });
    const bpSpeaker = await db.badgeProfile.create({ data: { editionId: edition1.id, name: "Speaker", accessAreas: "Ana Salon, Salon B, Backstage", color: "amber" } });
    const bpExhibitor = await db.badgeProfile.create({ data: { editionId: edition1.id, name: "Exhibitor", accessAreas: "Fuar Alanı, Kurulum Saatleri", color: "violet" } });
    const bpVip = await db.badgeProfile.create({ data: { editionId: edition1.id, name: "VIP", accessAreas: "Ana Salon, VIP Lounge, Gala", color: "rose" } });
    const bpStaff = await db.badgeProfile.create({ data: { editionId: edition1.id, name: "Staff", accessAreas: "Tüm alanlar", color: "neutral" } });
    const bpPress = await db.badgeProfile.create({ data: { editionId: edition1.id, name: "Press", accessAreas: "Ana Salon, Basın Odası", color: "sky" } });

    let badgeNo = 1;
    for (const [name, rec] of participationMap) {
      const roles = await db.eventRoleAssignment.findMany({ where: { participationId: rec.participationId } });
      const roleSet = new Set(roles.map((r) => r.role));
      const profile = roleSet.has("SPEAKER") ? bpSpeaker : roleSet.has("STAFF") ? bpStaff : roleSet.has("VIP") ? bpVip : roleSet.has("PRESS") ? bpPress : roleSet.has("EXHIBITOR_STAFF") ? bpExhibitor : bpDelegate;
      const reg = await db.registration.findUnique({ where: { id: rec.registrationId } });
      const badgeStatus = reg?.status === "CONFIRMED" ? "PRINTED" : reg?.status === "PENDING_APPROVAL" ? "READY" : "NOT_ELIGIBLE";
      const bi = await db.badgeInstance.create({
        data: { participationId: rec.participationId, profileId: profile.id, badgeNo: `BDG-2026-${String(badgeNo).padStart(4, "0")}`, status: badgeStatus, issuedAt: ["PRINTED", "READY"].includes(badgeStatus) ? D(-3) : null, printedAt: badgeStatus === "PRINTED" ? D(-2) : null },
      });
      if (badgeStatus !== "NOT_ELIGIBLE") {
        await db.credential.create({ data: { participationId: rec.participationId, badgeId: bi.id, code: `QR-${String(badgeNo).padStart(4, "0")}`, type: "QR", accessProfile: profile.accessAreas, validFrom: D(-1), validUntil: D(3) } });
      }
      badgeNo++;
    }

    // taramalar: bugün ~18 giriş + 3 tekrar + 2 ret + oturum girişleri
    const scanNames = ["Ahmet", "Mehmet", "Ayşe", "Fatma", "Mustafa", "Zeynep", "Emre", "Seda", "Deniz", "Ece", "Kerem", "Leyla", "Onur", "Serpil", "Tolga", "Vildan", "Yusuf"];
    for (const [i, name] of scanNames.entries()) {
      const rec = participationMap.get(name)!;
      const cred = await db.credential.findFirst({ where: { participationId: rec.participationId } });
      await db.scanEvent.create({ data: { participationId: rec.participationId, credentialId: cred?.id, personId: P[name].id, location: "MAIN_DOOR", doorName: "Kapı A", action: "ENTRY", result: "ALLOWED", device: "kapi-a-1", operator: "Yusuf Bilgin", scannedAt: D(0, 8 + Math.floor(i / 4), (i * 7) % 60) } });
    }
    for (const name of ["Ahmet", "Mustafa", "Deniz"]) {
      const rec = participationMap.get(name)!;
      const cred = await db.credential.findFirst({ where: { participationId: rec.participationId } });
      await db.scanEvent.create({ data: { participationId: rec.participationId, credentialId: cred?.id, personId: P[name].id, location: "MAIN_DOOR", doorName: "Kapı A", action: "RESCAN", result: "RESCAN_WARNING", reason: "Bu rozet bugün daha önce okutuldu", device: "kapi-b-2", operator: "Leyla Güneş", scannedAt: D(0, 12, 15) } });
    }
    // reddedilen: Murat (kayıt REJECTED, rozet yok) — personId ile
    await db.scanEvent.create({ data: { personId: P.Murat.id, location: "MAIN_DOOR", doorName: "Kapı B", action: "ENTRY", result: "DENIED", reason: "Kayıt durumu: REJECTED", device: "kapi-b-2", operator: "Leyla Güneş", scannedAt: D(0, 10, 5) } });
    // oturum girişleri (ayrı tarama listesi)
    for (const name of ["Mehmet", "Ahmet", "Ayşe", "Seda", "Fatma"]) {
      const rec = participationMap.get(name)!;
      const cred = await db.credential.findFirst({ where: { participationId: rec.participationId } });
      await db.scanEvent.create({ data: { participationId: rec.participationId, credentialId: cred?.id, personId: P[name].id, sessionId: ses1.id, location: "SESSION", action: "SESSION_ENTRY", result: "ALLOWED", device: "salon-a", operator: "Oturum Görevlisi", scannedAt: D(0, 11, 2) } });
    }
    // dünkü girişler
    for (const name of ["Mehmet", "Ayşe", "Fatma", "Kerem"]) {
      const rec = participationMap.get(name)!;
      const cred = await db.credential.findFirst({ where: { participationId: rec.participationId } });
      await db.scanEvent.create({ data: { participationId: rec.participationId, credentialId: cred?.id, personId: P[name].id, location: "MAIN_DOOR", doorName: "Kapı A", action: "ENTRY", result: "ALLOWED", device: "kapi-a-1", operator: "Yusuf Bilgin", scannedAt: D(-1, 9, 0) } });
    }

    // ── Sertifikalar (§43) ──
    const certPart = await db.certificateDefinition.create({ data: { editionId: edition1.id, name: "Katılımcı Sertifikası", type: "PARTICIPANT", eligibilityRule: "registration=CONFIRMED AND etkinlik girişi var", signerName: "Prof. Dr. Mehmet Demir" } });
    const certSpeaker = await db.certificateDefinition.create({ data: { editionId: edition1.id, name: "Konuşmacı Sertifikası", type: "SPEAKER", eligibilityRule: "program assignment=CONFIRMED AND oturum gerçekleştirildi", signerName: "Prof. Dr. Mehmet Demir" } });
    await db.certificateDefinition.create({ data: { editionId: edition1.id, name: "Hakem Sertifikası", type: "REVIEWER", eligibilityRule: "tamamlanan inceleme >= 2", signerName: "Bilimsel Komite" } });
    await db.certificateIssue.create({ data: { definitionId: certPart.id, participationId: participationMap.get("Mehmet")!.participationId, status: "DELIVERED", generatedAt: D(-1), deliveredAt: D(-1), eligibilityNote: "Uygunluk koşulları sağlandı" } });
    await db.certificateIssue.create({ data: { definitionId: certPart.id, participationId: participationMap.get("Ayşe")!.participationId, status: "GENERATED", generatedAt: D(0, 8), eligibilityNote: "Uygunluk koşulları sağlandı" } });
    await db.certificateIssue.create({ data: { definitionId: certPart.id, participationId: participationMap.get("Mustafa")!.participationId, status: "GENERATED", generatedAt: D(0, 8), eligibilityNote: "Uygunluk koşulları sağlandı" } });
    await db.certificateIssue.create({ data: { definitionId: certPart.id, participationId: participationMap.get("Can")!.participationId, status: "NOT_ELIGIBLE", eligibilityNote: "Eksik: geçerli giriş yok" } });
    await db.certificateIssue.create({ data: { definitionId: certSpeaker.id, participationId: participationMap.get("Ahmet")!.participationId, status: "ELIGIBLE", eligibilityNote: "Oturum bekleniyor" } });

    // ── Kampanyalar ──
    await db.campaign.createMany({
      data: [
        { editionId: edition1.id, name: "Ödeme Hatırlatma", segmentRule: "kayıt onaylı + açık bakiye > 0", audienceCount: 26, status: "SENT", subject: "Kayıt onayınız hazır — ödeme hatırlatması", body: "Sayın katılımcımız, kaydınız onaylandı. Ödemenizi {deadline} tarihine kadar tamamlayabilirsiniz.", sentAt: D(-2, 10), sentCount: 26, deliveredCount: 25, openCount: 17, clickCount: 8 },
        { editionId: edition1.id, name: "Bilimsel Çağrı Duyurusu", segmentRule: "tüm person", audienceCount: 240, status: "SENT", isSegmentFixed: false, subject: "Bildiri çağrısı — son 10 gün", sentAt: D(-40, 9), sentCount: 240, deliveredCount: 236, openCount: 141, clickCount: 63 },
        { editionId: edition1.id, name: "Program Yayınlandı", segmentRule: "kayıt onaylı", audienceCount: 148, status: "TESTED", subject: "Program yayında — kişisel gündeminizi oluşturun", testSentTo: "burak@maven.demo" },
        { editionId: edition2.id, name: "TechDays Erken Kayıt", segmentRule: "geçen yıl fuarcı kurumlar", audienceCount: 90, status: "DRAFT" },
      ],
    });

    // ── Operasyon görevleri ──
    await db.task.createMany({
      data: [
        { editionId: edition1.id, title: "Gala oturma planını onaylat", module: "SOCIAL_EVENTS", status: "IN_PROGRESS", priority: "HIGH", assigneeId: P.Kerem.id, dueDate: D(1) },
        { editionId: edition1.id, title: "Banner teslimini takip et (ABC Pharma)", module: "SPONSORSHIP", status: "TODO", priority: "HIGH", assigneeId: P.Kerem.id, dueDate: D(3) },
        { editionId: edition1.id, title: "Poster dosyası eksikleri kapat", module: "SCIENTIFIC", status: "BLOCKED", priority: "URGENT", assigneeId: null, dueDate: D(-1) },
        { editionId: edition1.id, title: "Kapı görevlisi vardiyasını yayınla", module: "ONSITE", status: "DONE", priority: "MEDIUM", assigneeId: P.Yusuf.id, dueDate: D(-2), completedAt: D(-2) },
        { editionId: edition1.id, title: "Manuel ödeme teyitlerini kapat", module: "FINANCE", status: "IN_PROGRESS", priority: "HIGH", dueDate: D(0) },
        { editionId: edition1.id, title: "Otel bloğu release öncesi mutabakat", module: "ACCOMMODATION", status: "TODO", priority: "MEDIUM", dueDate: D(6) },
        { editionId: edition1.id, title: "Sertifika imza onayı al", module: "CERTIFICATES", status: "REVIEW", priority: "LOW", dueDate: D(2) },
        { editionId: edition1.id, title: "CME kredi kuralı tanımlanmalı (uyarı)", module: "OPERATIONS", status: "BACKLOG", priority: "LOW" },
        { editionId: edition2.id, title: "TechDays salon planını oluştur", module: "PROGRAM", status: "TODO", priority: "MEDIUM", dueDate: D(30) },
        { editionId: edition2.id, title: "Sponsor paket sayfalarını güncelle", module: "SPONSORSHIP", status: "BACKLOG", priority: "LOW" },
      ],
    });

    // ── Delegasyon & refakatçi ──
    const del = await db.delegation.create({ data: { editionId: edition1.id, name: "ABC Pharma Heyeti", type: "SPONSOR_GROUP", billingOrganizationId: abcPharma.id, paymentAccount: "ABC Merkez Hesap", rules: "Kayıtlar sponsor hakkından düşülür; değişiklik portal onayı ister" } });
    await db.delegationMember.createMany({ data: [{ delegationId: del.id, participationId: participationMap.get("Fatma")!.participationId, role: "LEADER" }, { delegationId: del.id, participationId: participationMap.get("Deniz")!.participationId }] });
    await db.companion.create({ data: { participationId: participationMap.get("Mustafa")!.participationId, name: "Elif Koç", type: "ADULT", notes: "Gala + tur hakları var" } });

    // ── Aktivite günlüğü (§47 domain event örnekleri) ──
    await db.activityLog.createMany({
      data: [
        { tenantId: tenant.id, editionId: edition1.id, type: "EDITION_PUBLISHED", message: "Etkinlik yayınlandı: No-Dig Turkey 2026 — kayıt bağlantısı açık", actorName: "Burak Demir", createdAt: D(-40) },
        { tenantId: tenant.id, editionId: edition1.id, type: "SPONSOR_AGREEMENT", message: "Sözleşme aktifleşti: ABC Pharma — Gold Sponsorship 2026 (500.000 TRY)", actorName: "Selin Öztürk", createdAt: D(-38) },
        { tenantId: tenant.id, editionId: edition1.id, type: "ENTITLEMENT_SAVED", message: "Hak havuzu tanımlandı: Gold Sponsor Ücretsiz Katılım × 20", actorName: "Selin Öztürk", createdAt: D(-38) },
        { tenantId: tenant.id, editionId: edition1.id, type: "DECISION_SAVED", message: "Bilimsel karar: SUB-100 → ACCEPT_ORAL", actorName: "Bilimsel Komite", createdAt: D(-18) },
        { tenantId: tenant.id, editionId: edition1.id, type: "PAYMENT_RECEIVED", message: "Tahsilat: 12.000 TRY — Delta Üniversitesi (HAVALE)", actorName: "Zeynep Arslan", createdAt: D(-8) },
        { tenantId: tenant.id, editionId: edition1.id, type: "BOOTH_ALLOCATED", message: "Stand tahsis edildi: A24 → ABC Pharma (12 m², CONTRACTED)", actorName: "Burak Demir", createdAt: D(-30) },
        { tenantId: tenant.id, editionId: edition1.id, type: "SESSION_SAVED", message: "Oturum yayınlandı: Açılış Konuşması — Ana Salon", actorName: "Burak Demir", createdAt: D(-5) },
        { tenantId: tenant.id, editionId: edition1.id, type: "SCAN_ALLOWED", message: "Canlı saha: ilk giriş kaydı — Kapı A açıldı", actorName: "Kapı Görevlisi", createdAt: D(0, 8, 2) },
        { tenantId: tenant.id, editionId: edition1.id, type: "SCAN_DENIED", message: "Tarama reddedildi: kayıt iptal durumunda", actorName: "Kapı Görevlisi", createdAt: D(0, 10, 5) },
        { tenantId: tenant.id, editionId: edition1.id, type: "CAMPAIGN_SAVED", message: "Kampanya gönderildi: Ödeme Hatırlatma — 26 alıcı, 8 tıklama", actorName: "Burak Demir", createdAt: D(-2) },
        { tenantId: tenant.id, editionId: edition2.id, type: "EDITION_CREATED", message: "Yeni edisyon taslağı: Maven TechDays 2027", actorName: "Elif Kaya", createdAt: D(-3) },
      ],
    });

    // yetim claim temizliği (LATER ile oluşturulanları sil)
    await db.entitlementClaim.deleteMany({ where: { entitlementId: "LATER" } });

    const counts = {
      people: await db.person.count(),
      organizations: await db.organization.count(),
      editions: await db.eventEdition.count(),
      registrations: await db.registration.count(),
      sponsorAgreements: await db.sponsorAgreement.count(),
      submissions: await db.submission.count(),
      sessions: await db.programSession.count(),
      scanEvents: await db.scanEvent.count(),
      forms: await db.formDefinition.count(),
      formSubmissions: await db.formSubmission.count(),
      expenses: await db.expense.count(),
    };
    return NextResponse.json({ ok: true, counts });
  } catch (e) {
    console.error("POST /api/seed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Seed başarısız" }, { status: 500 });
  }
}

async function wipe() {
  const order = [
    db.companion, db.delegationMember, db.delegation, db.formAnswer, db.formSubmission, db.formField, db.formDefinition,
    db.expense,
    db.invitation, db.scanEvent, db.credential, db.badgeInstance, db.badgeProfile,
    db.certificateIssue, db.certificateDefinition, db.floorPlanObject, db.boothAllocation, db.boothUnit,
    db.deliverable, db.sponsorAgreement, db.sponsorPackage, db.sponsorTierDefinition,
    db.entitlementClaim, db.entitlement, db.refund, db.payment, db.orderLine, db.order, db.catalogItem,
    db.occupancySlot, db.roommateRequest, db.reservation, db.inventoryNight, db.roomBlock, db.roomType, db.hotelProperty,
    db.review, db.reviewAssignment, db.decision, db.authorship, db.submission, db.track, db.scientificSetup,
    db.programAssignment, db.programSession, db.programRoom,
    db.eventRoleAssignment, db.registration, db.registrationCategory, db.eventProfileSnapshot, db.eventParticipation,
    db.eventOrganizationAssignment, db.eventCapability, db.eventEdition, db.eventSeries,
    db.organizationContact, db.organization, db.task, db.campaign, db.activityLog, db.person, db.user, db.tenant,
  ];
  for (const m of order) {
    await (m as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
}
