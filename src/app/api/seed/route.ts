// /api/seed — Maven demo verisi (idempotent: önce temizler)
// Senaryolar: canlı edisyon (No-Dig 2026), sponsor hak dökümü 20/14/2/4,
// bilimsel akış, gecelik stok, finans çok eksenli, saha taramaları.
// DETAY İLKESİ (kullanıcı): her demo kaydı TAM girişli olur — eksik verili
// kayıt tutulmaz; kişi fotoğrafları, kurum logoları, otel görselleri medya
// klasörüne BENZERSİZ adla eklenir.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Person } from "@prisma/client";
import { createRegistrationFromSubmission } from "@/lib/api/registration-chain";
import { ensureSystemFolders } from "@/lib/media-system";

const D = (offsetDays: number, h = 9, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(h, m, 0, 0);
  return d;
};

// — SVG dataURL üreteçleri (demo görselleri; tümü medya klasörüne benzersiz adla girer) —
const svgUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const AVATAR_COLORS = ["0f766e", "7c3aed", "b45309", "be185d", "0369a1", "4d7c0f", "c2410c", "4338ca"];
const avatarSvg = (initials: string, i: number) =>
  svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#e2e8f0"/><circle cx="120" cy="96" r="44" fill="#${AVATAR_COLORS[i % AVATAR_COLORS.length]}"/><text x="120" y="112" font-family="Arial" font-size="36" font-weight="bold" fill="#fff" text-anchor="middle">${initials}</text><path d="M40 220 Q120 140 200 220 Z" fill="#${AVATAR_COLORS[i % AVATAR_COLORS.length]}"/></svg>`);
const logoSvg = (name: string, color: string) =>
  svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect width="320" height="120" rx="16" fill="#${color}"/><text x="24" y="56" font-family="Arial" font-size="26" font-weight="bold" fill="#fff">${name.slice(0, 18)}</text><text x="24" y="88" font-family="Arial" font-size="15" fill="#ffffffbb">${name.slice(0, 18).toLowerCase().replace(/[^a-z0-9]+/g, "")}.example</text></svg>`);
const coverSvg = (title: string, c1: string, c2: string) =>
  svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#${c1}"/><stop offset="1" stop-color="#${c2}"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><text x="32" y="64" font-family="Arial" font-size="30" font-weight="bold" fill="#ffffffe6">${title}</text><path d="M0 300 Q160 240 320 300 T640 300 V360 H0 Z" fill="#ffffff33"/><path d="M0 320 Q160 270 320 320 T640 320 V360 H0 Z" fill="#ffffff22"/></svg>`);

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

    // ── Kurumlar (sponsor TÜRÜ değil — rol ataması §4) — TAM kimlik kartı girişli ──
    const [abcPharma, association, pco, icc, beta, media, uni, hotelOrg] = await Promise.all([
      db.organization.create({ data: { tenantId: tenant.id, name: "ABC Pharma", type: "COMPANY", country: "Türkiye", city: "İstanbul", website: "https://abcpharma.example", taxNo: "1234567890", generalEmail: "info@abcpharma.example", address: "Maslak Mah. Büyükdere Cad. No:255 Sarıyer / İstanbul", description: "ABC Pharma — 1998'den beri endüstriyel çözümler; No-Dig serisinin kurumsal sponsoru.", locationNote: "Fuar Alanı · Stand A24 · Maslak Grand Otel lobisi karşısı", notes: "Gold sponsor — 2026 sözleşmesi aktif" } }),
      db.organization.create({ data: { tenantId: tenant.id, name: "No-Dig Türkiye Derneği", type: "ASSOCIATION", country: "Türkiye", city: "Ankara", website: "https://nodig.example", taxNo: "2345678901", generalEmail: "dernek@nodig.example", address: "Kızılay Meydanı No:7 Çankaya / Ankara", description: "Kazısız teknolojileri tanıtmak amacıyla kurulmuş meslek derneği; bilimsel sahibi.", locationNote: "Bilimsel Komite toplantıları: Dernek Merkezi Kat 3" } }),
      db.organization.create({ data: { tenantId: tenant.id, name: "Eventiva PCO", type: "AGENCY", country: "Türkiye", city: "İstanbul", website: "https://eventiva.example", taxNo: "3456789012", generalEmail: "projeler@eventiva.example", address: "Levent Mah. Yönetim Cad. No:12 Beşiktaş / İstanbul", description: "Profesyonel kongre organizatörü — saha ve kayıt operasyonlarını yürütür.", locationNote: "Organizasyon ofisi: ICC Kat 2 / Oda 214" } }),
      db.organization.create({ data: { tenantId: tenant.id, name: "İstanbul Kongre Merkezi", type: "VENUE", country: "Türkiye", city: "İstanbul", website: "https://icc.example", taxNo: "4567890123", generalEmail: "etkinlik@icc.example", address: "Taşkışla Caddesi No:1 Harbiye / Şişli İstanbul", description: "Ana mekan — Ana Salon (600), Salon B (120), Poster Alanı ve fuar salonu.", locationNote: "Yükleme boşaltma kapısı: arka blok B kapısı — 06:00-10:00" } }),
      db.organization.create({ data: { tenantId: tenant.id, name: "Beta Mühendislik", type: "COMPANY", country: "Türkiye", city: "Ankara", website: "https://beta.example", taxNo: "5678901234", generalEmail: "info@beta.example", address: "Çukurambar Mah. Mühendisler Sok. No:8 Çankaya / Ankara", description: "Tünel ve altyapı mühendisliği — Silver sponsor; Beta Sound markasıyla saha ekipmanları.", locationNote: "Fuar Alanı · Stand B02 (Beta Sound)" } }),
      db.organization.create({ data: { tenantId: tenant.id, name: "TeknoBasın Medya", type: "COMPANY", country: "Türkiye", city: "İstanbul", website: "https://teknobasin.example", taxNo: "6789012345", generalEmail: "haber@teknobasin.example", address: "Bomanti Mah. Medya Sok. No:4 Ümraniye / İstanbul", description: "Sektörel yayıncılık — baskı + dijital; medya sponsoru ve basın kitabı ortağı.", locationNote: "Basın odası akredite masası: ICC Fuaye" } }),
      db.organization.create({ data: { tenantId: tenant.id, name: "Delta Üniversitesi", type: "UNIVERSITY", country: "Türkiye", city: "İzmir", website: "https://delta.example", taxNo: "7890123456", generalEmail: "kongre@delta.example", address: "Üniversite Cad. No:35 Urla / İzmir", description: "Akademik partner — Jeoteknik Mühendislik bölümü ve CME akreditasyon ortağı.", locationNote: "Heyet odası talebi: ICC Kat 3 VIP lounge yanlı" } }),
      db.organization.create({ data: { tenantId: tenant.id, name: "Maslak Grand Otel", type: "HOTEL", country: "Türkiye", city: "İstanbul", website: "https://maslakgrand.example", taxNo: "8901234567", generalEmail: "rezervasyon@maslakgrand.example", address: "Maslak Mah. Oteller Cad. No:19 Sarıyer / İstanbul", description: "Kongre anlaşmalı oteli — 4 yıldız; tek/çift blok sözleşmesi yapıldı.", locationNote: "Mekâna yürüme mesafesi 7 dk — servis 08:30" } }),
    ]);

    await db.organizationContact.createMany({
      data: [
        { organizationId: abcPharma.id, name: "Deniz Yalçın", title: "Pazarlama Direktörü", email: "deniz@abcpharma.example", isPrimary: true },
        { organizationId: pco.id, name: "Ceren Aksoy", title: "Proje Müdürü", email: "ceren@eventiva.example", isPrimary: true },
        { organizationId: icc.id, name: "Onur Kılıç", title: "Satış Müdürü", email: "onur@icc.example", isPrimary: true },
      ],
    });

    // ── Kişiler (tenant içinde tekil) — telefon, şehir, biyografi TAM girişli ──
    const peopleData: [string, string, string, string, string, string, string, string][] = [
      // ad, soyad, e-posta, kurum, unvan, telefon, şehir, biyografi
      ["Ahmet", "Yılmaz", "ahmet.yilmaz@example.com", "ABC Pharma", "Ar-Ge Müdürü", "+90 532 210 11 01", "İstanbul", "12 yıllık TBM kesici kafa Ar-Ge deneyimi; 8 haklı patent."],
      ["Mehmet", "Demir", "mehmet.demir@example.com", "Delta Üniversitesi", "Prof. Dr.", "+90 532 210 11 02", "İzmir", "Delta Üniversitesi Jeoteknik bölüm başkanı; kongre başkanı."],
      ["Ayşe", "Kara", "ayse.kara@example.com", "Delta Üniversitesi", "Doç. Dr.", "+90 532 210 11 03", "İzmir", "HDD proje yönetimi ve risk analizi alanında akademisyen."],
      ["Defne", "Kaya", "defne.kaya@example.com", "Delta Üniversitesi", "Öğretim Üyesi", "+90 532 210 11 04", "İzmir", "Zemin iyileştirme yöntemleri; TÜBİTAK 2 proje yürütücüsü."],
      ["Fatma", "Çelik", "fatma.celik@example.com", "Beta Mühendislik", "Genel Müdür", "+90 532 210 11 05", "Ankara", "Beta Mühendislik kurucu ortağı; ABC Pharma heyet lideri."],
      ["Mustafa", "Koç", "mustafa.koc@example.com", "Yol Yapım A.Ş.", "Proje Direktörü", "+90 532 210 11 06", "İstanbul", "Metro ve tünel projelerinde 18 yıl saha yönetimi."],
      ["Zeynep", "Aydın", "zeynep.aydin@example.com", "Hükümet Metrosu Daire Başkanlığı", "Mühendis", "+90 532 210 11 07", "Ankara", "Kamu altyapı projelerinde teknik heyet üyesi."],
      ["Emre", "Özkan", "emre.ozkan@example.com", "Tünel İnşaat Ltd.", "Saha Şefi", "+90 532 210 11 08", "İstanbul", "HDD ve mikro tünel sahalarında vardiya şefi."],
      ["Seda", "Polat", "seda.polat@example.com", "GeoLab Danışmanlık", "Jeoteknik Uzman", "+90 532 210 11 09", "İstanbul", "Zemin ve kaya laboratuvar testleri; panelist ve uzman konuşmacı."],
      ["Can", "Arslan", "can.arslan@example.com", "Delta Üniversitesi", "Arş. Gör.", "+90 532 210 11 10", "İzmir", "Doktora öğrencisi — derin kazı duvarları üzerine çalışıyor."],
      ["Deniz", "Şahin", "deniz.sahin@example.com", "ABC Pharma", "Ürün Yöneticisi", "+90 532 210 11 11", "İstanbul", "Endüstriyel ürün portföyü yönetimi; fuar personeli."],
      ["Ece", "Doğan", "ece.dogan@example.com", "TeknoBasın Medya", "Muhabir", "+90 532 210 11 12", "İstanbul", "Sektörel haberler ve roportajlar; akredite basın."],
      ["Kerem", "Aksoy", "kerem.aksoy@example.com", "Maven Ekibi", "Operasyon Görevlisi", "+90 532 210 11 13", "İstanbul", "Etkinlik operasyonları ve saha koordinasyonu; MBA."],
      ["Leyla", "Güneş", "leyla.gunes@example.com", "Maven Ekibi", "Kayıt Görevlisi", "+90 532 210 11 14", "İstanbul", "Kayıt masası ve misafir karşılama; 3 dil."],
      ["Barış", "Tekin", "baris.tekin@example.com", "Bağımsız", "Danışman", "+90 532 210 11 15", "Bursa", "Bağımsız tünel danışmanı; kayıt onay bekliyor."],
      ["Gizem", "Bulut", "gizem.bulut@example.com", "Yol Yapım A.Ş.", "Kalite Uzmanı", "+90 532 210 11 16", "İstanbul", "ISO 9001 denetçi; grup kaydı — Yol Yapım heyeti."],
      ["Onur", "Erdem", "onur.erdem@example.com", "Tünel İnşaat Ltd.", "Makine Mühendisi", "+90 532 210 11 17", "İstanbul", "TBM bakım ve disk kesici ekonomisi üzerine çalışıyor."],
      ["Pınar", "Yavuz", "pinar.yavuz@example.com", "Delta Üniversitesi", "Y. Lisans Öğrencisi", "+90 532 210 11 18", "İzmir", "Bentonit çamuru reolojisi üzerine yüksek lisans; öğrenci kaydı."],
      ["Serpil", "Ateş", "serpil.ates@example.com", "GeoLab Danışmanlık", "Laborant", "+90 532 210 11 19", "İstanbul", "Epoxy enjeksiyon deneyleri; poster sunumu var."],
      ["Tolga", "Uçar", "tolga.ucar@example.com", "Beta Mühendislik", "Satış Yöneticisi", "+90 532 210 11 20", "Ankara", "Beta Sound saha ekipman satışları; fuar personeli."],
      ["Ünsal", "Kağan", "unsal.kagan@example.com", "Hükümet Metrosu", "İnşaat Mühendisi", "+90 532 210 11 21", "Ankara", "Metro inşaatları; taslak kayıt — kurumsal ödeme bekliyor."],
      ["Vildan", "Serin", "vildan.serin@example.com", "Serbest", "Refakatçi", "+90 532 210 11 22", "İzmir", "Delta Üniversitesi heyetiyle gelen refakatçi."],
      ["Yusuf", "Bilgin", "yusuf.bilgin@example.com", "Maven Ekibi", "Kapı Görevlisi", "+90 532 210 11 23", "İstanbul", "Erişim kontrol ve kapı operasyonları; ISO 20121 sertifikalı."],
      ["Hande", "Soyer", "hande.soyer@example.com", "ABC Pharma", "Medikal Temsilci", "+90 532 210 11 24", "İstanbul", "ABC Pharma saha ekibi; sponsor hak ile kayıt beklemede."],
      ["Murat", "İnce", "murat.ince@example.com", "ABC Pharma", "Satış Uzmanı", "+90 532 210 11 25", "İstanbul", "ABC Pharma satış; sponsor kotası dolduğu için kayıt reddedildi."],
    ] as const;
    const bioByFirst: Record<string, string> = Object.fromEntries(peopleData.map((r) => [r[0], r[7]]));
    const people: Person[] = [];
    for (const [firstName, lastName, email, company, title, phone, city] of peopleData) {
      people.push(await db.person.create({ data: { tenantId: tenant.id, firstName, lastName, email, company, title, phone, city, country: "Türkiye", bio: bioByFirst[firstName] ?? null } }));
    }
    const P = Object.fromEntries(people.map((p, i) => [peopleData[i][0], p])) as Record<string, Person>;

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
    const caps1 = ["REGISTRATION", "SCIENTIFIC", "PROGRAM", "SPONSORSHIP", "EXHIBITION", "FLOOR_PLAN", "ACCOMMODATION", "BADGING", "ACCESS_CONTROL", "CERTIFICATES", "COMMUNICATIONS", "OPERATIONS", "CME_CREDITS", "SOCIAL_EVENTS", "TOURS", "B2B_MEETINGS"];
    for (const key of caps1) {
      await db.eventCapability.create({ data: { editionId: edition1.id, key, enabled: true, setupNote: key === "CME_CREDITS" ? "uyarı: kredi kuralı tanımlı değil" : key === "FLOOR_PLAN" ? "Floor Studio uygulamasıyla ortak kimlik (§20)" : "hazır" } });
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
    const catVip = await db.registrationCategory.create({ data: { editionId: edition1.id, name: "VIP", code: "VIP", basePrice: 0, capacity: 1, order: 4 } });
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

    // ── Bekleme listesi (VIP kategorisi 1 kontenjan — dolu; REG'te sıra bekleyenler) ──
    const waitlistSeed: [string, typeof catVip, number, string | null][] = [
      ["Hande", catVip, 10, "VIP kotası için beklemede — sponsor ile görüştü"],
      ["Murat", catVip, 20, null],
      ["Barış", catVip, 30, null],
      ["Ünsal", catRegular, 40, "Erken kayıt dönemi kaçırdı"],
      ["Can", catRegular, 50, null],
    ];
    for (const [name, cat, prio, note] of waitlistSeed) {
      const person = P[name];
      const participation = await db.eventParticipation.upsert({
        where: { editionId_personId: { editionId: edition1.id, personId: person.id } },
        create: { editionId: edition1.id, personId: person.id, source: "ADMIN_ENTRY", attendance: "NOT_ARRIVED" },
        update: {},
      });
      // Ünsal'a canlı teklif: dış portal (Katılımcı Görünümü) kabul/ret akışının demosu
      const isLiveOffer = name === "Ünsal";
      const expires = new Date();
      expires.setHours(expires.getHours() + 46);
      await db.waitlistEntry.create({
        data: {
          editionId: edition1.id, personId: person.id, participationId: participation.id,
          categoryId: cat.id, priority: prio, notes: note,
          createdAt: D(-8 + Math.floor(prio / 10), 10, 0),
          ...(isLiveOffer ? { status: "OFFERED", offeredAt: new Date(), offerExpiresAt: expires } : {}),
        },
      });
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
    const entBadge = await db.entitlement.create({ data: { editionId: edition1.id, ownerOrganizationId: beta.id, source: "SPONSOR_PACKAGE", type: "BADGE", label: "Fuarcı Personeli Yaka Kartı", quantityGranted: 5, quantityConsumed: 5 } });
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

    // ── Fuar / stantlar (§19-22) — tam salon düzeni + Floor Studio geometrisi ──
    const boothRows: [string, number, string, number][] = [
      ["A21", 12, "SHELL_SCHEME", 60000], ["A22", 12, "SHELL_SCHEME", 60000], ["A23", 12, "SHELL_SCHEME", 60000],
      ["A24", 12, "SHELL_SCHEME", 60000], ["A25", 12, "SHELL_SCHEME", 60000], ["A26", 12, "SHELL_SCHEME", 60000],
      ["A27", 12, "SHELL_SCHEME", 60000], ["A28", 12, "SHELL_SCHEME", 60000],
      ["B01", 24, "SPACE_ONLY", 100000], ["B02", 24, "SPACE_ONLY", 100000], ["B03", 24, "SPACE_ONLY", 100000],
      ["B04", 24, "SPACE_ONLY", 100000], ["B05", 24, "SPACE_ONLY", 100000],
      ["C01", 12, "SHELL_SCHEME", 55000], ["C02", 12, "SHELL_SCHEME", 55000], ["C03", 12, "SHELL_SCHEME", 55000],
      ["C04", 12, "SHELL_SCHEME", 55000], ["C05", 12, "SHELL_SCHEME", 55000],
    ];
    for (const [code, size, type, price] of boothRows) {
      await db.boothUnit.create({ data: { editionId: edition1.id, code, sizeSqm: size, type, price } });
    }
    const boothByCode = async (code: string) => (await db.boothUnit.findFirst({ where: { editionId: edition1.id, code } }))!;
    const boothA24 = await boothByCode("A24");
    const boothB01 = await boothByCode("B01");
    await db.boothAllocation.create({ data: { boothUnitId: boothA24!.id, agreementId: agrAbc.id, organizationId: abcPharma.id, status: "CONTRACTED" } });
    await db.boothUnit.update({ where: { id: boothA24!.id }, data: { status: "CONTRACTED" } });
    await db.boothAllocation.create({ data: { boothUnitId: boothB01!.id, organizationId: beta.id, status: "OPTION" } });
    await db.boothUnit.update({ where: { id: boothB01!.id }, data: { status: "OPTION", optionExpiresAt: D(4, 17) } });
    // durum çeşitliliği (plan renk paleti için): A25 HOLD, B03 BLOCKED, C02 RELEASED
    await db.boothUnit.update({ where: { id: (await boothByCode("A25")).id }, data: { status: "HELD" } });
    await db.boothUnit.update({ where: { id: (await boothByCode("B03")).id }, data: { status: "BLOCKED" } });
    await db.boothUnit.update({ where: { id: (await boothByCode("C02")).id }, data: { status: "RELEASED" } });

    // ── Floor Studio geometrisi: A sırası (4×3), B sırası (6×4), C sırası (4×3) + dekor ──
    // A24 ABC Pharma sözleşmeli — etiketi kuruluş adıyla
    const geoRows: [string, number, number, number, number, string?][] = [
      ["A21", 2, 4, 4, 3], ["A22", 7, 4, 4, 3], ["A23", 12, 4, 4, 3], ["A24", 17, 4, 4, 3, "ABC Pharma — A24"],
      ["A25", 22, 4, 4, 3], ["A26", 27, 4, 4, 3], ["A27", 32, 4, 4, 3], ["A28", 37, 4, 4, 3],
      ["B01", 2, 10, 6, 4], ["B02", 9, 10, 6, 4], ["B03", 16, 10, 6, 4], ["B04", 23, 10, 6, 4], ["B05", 30, 10, 6, 4],
      ["C01", 2, 17, 4, 3], ["C02", 7, 17, 4, 3], ["C03", 12, 17, 4, 3], ["C04", 17, 17, 4, 3], ["C05", 22, 17, 4, 3],
    ];
    for (const [code, x, y, width, height, label] of geoRows) {
      const bu = await boothByCode(code);
      await db.floorPlanObject.create({ data: { boothUnitId: bu.id, label: label ?? code, x, y, width, height } });
    }
    // dekor/servis objeleri — Floor Studio sahipli (boothUnitId null)
    await db.floorPlanObject.createMany({
      data: [
        { label: "ANA GİRİŞ", x: 18, y: 22.5, width: 8, height: 2 },
        { label: "KAYIT MASASI", x: 30, y: 22.5, width: 7, height: 2 },
        { label: "KAFE", x: 38, y: 12, width: 5, height: 5 },
      ],
    });
    // B02 Beta Sound CONTRACTED örneği (tahsis + geometri etiketi)
    const boothB02 = await boothByCode("B02");
    await db.boothAllocation.create({ data: { boothUnitId: boothB02!.id, agreementId: agrBeta.id, organizationId: beta.id, status: "CONTRACTED" } });
    await db.boothUnit.update({ where: { id: boothB02!.id }, data: { status: "CONTRACTED" } });
    await db.floorPlanObject.update({ where: { boothUnitId: boothB02!.id }, data: { label: "Beta Sound — B02" } });

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

    const subData: [string, string, string, string, string, string | null, string | null, string, string][] = [
      // title, track, type, status, presenting, decision, fileStatus, abstract, keywords
      ["TBM Kesici Kafa Aşınmasının Makine Öğrenmesi ile Tahmini", "Kazı Teknolojileri", "ORAL", "ACCEPTED", "Ahmet Yılmaz", "ACCEPT_ORAL", "APPROVED",
        "Çalışmada, İstanbul metro projelerinden derlenen 1.240 kesici kafa verisiyle eğitilen makine öğrenmesi modellerinin aşınma tahmini performansı karşılaştırılmıştır. Rastgele orman modeli %92 doğrulukla en iyi sonucu vermiş; kesme torque'u, kayıntı hızı ve formasyon dayanımı en etkili değişkenler olarak öne çıkmıştır. Saha mühendislerine yönelik erken uyarı eşiği önerisi sunulmaktadır.",
        "TBM, kesici kafa, aşınma, makine öğrenmesi"],
      ["Mikro Tünel Uygulamalarında Yerleşim İzlerinin İzlenmesi", "Kazı Teknolojileri", "ORAL", "ACCEPTED", "Mehmet Demir", "ACCEPT_ORAL", "APPROVED",
        "Mikro tünel açılışlarında oluşan yüzey yerleşim izleri, üç farklı şehirde toplam 18 hat üzerinde optik nivelleme ve uzayda sabitlenmiş radar ile izlenmiştir. Yerleşim çukuru profilleri penetrasyon hızına bağlı olarak modellenmiş; boru çapı büyüdükçe maksimum yerleşimin doğrusal arttığı gözlemlenmiştir. Uygulamalı tolerans tabloları sunulmaktadır.",
        "mikro tünel, yerleşim izi, optik nivelleme"],
      ["HDD Projelerinde Risk Matrisi Yaklaşımı", "Kazı Teknolojileri", "ORAL", "ACCEPTED", "Ayşe Kara", "ACCEPT_ORAL", null,
        "Yatay yönlü sondaj (HDD) projelerinde karşılaşılan 42 risk kategorisi FMEA yöntemiyle puanlanmış, yeraltı engel çakışması ve çamur kaçığı en yüksek risk skoruna sahip iki kategori olarak belirlenmiştir. Proje aşamasına göre değişen risk ağırlıkları için dinamik bir matris modeli önerilmekte ve üç pilot projede doğrulanmaktadır.",
        "HDD, risk analizi, FMEA, çamur kaçığı"],
      ["Tünel Havalandırmasında Enerji Optimizasyonu", "Tünel Mühendisliği", "POSTER", "ACCEPTED", "Seda Polat", "ACCEPT_POSTER", "MISSING",
        "İnşaat fazındaki tünerlerde jet fan yerleşiminin enerji tüketimi üzerindeki etkisi CFD analizleriyle incelenmiştir. Fan sayısı sabit tutularak açı optimizasyonu yapıldığında %14 enerji tasarrufu sağlanmış; karbon ayak izi azaltımına karşılık gelen eşdeğer değer raporlanmıştır. Sunum dosyası tamamlanacak (dosya durumu: eksik).",
        "havalandırma, jet fan, CFD, enerji"],
      ["Enjeksiyon Basınç Parametrelerinin Saha Deneyimi", "Geoteknik", "POSTER", "ACCEPTED", "Emre Özkan", "ACCEPT_POSTER", "FORMAT_ISSUE",
        "Farklı jeolojik ortamlarda yürütülen 26 enjeksiyon jobundan saha kayıtları derlenerek basınç/akış ilişkileri değerlendirilmiştir. Düşük başlangıç basıncı + kademeli artış şemasının delik kaybını %22 azalttığı saptanmıştır. Poster dosyası şablon uyumsuzluğu nedeniyle format düzeltmesi beklemektedir.",
        "enjeksiyon, basınç, geoteknik, saha deneyi"],
      ["Derin Kazı Duvarlarında Dekonvolüsyon Analizi", "Geoteknik", "ORAL", "UNDER_REVIEW", "Can Arslan", null, null,
        "Ankara killerinde 18 m derinliğe kadar inen kazı duvarlarının inklometre verileri, yerleşim ölçümleriyle birlikte dekonvolüsyon yöntemiyle geri analiz edilmiştir. Duvar sertlik profilinin ölçüm gürültüsünden ayrıştırılmasında Wiener filtresi kullanılmıştır. İki hakem incelemesi sürmektedir.",
        "derin kazı, inklometre, dekonvolüsyon"],
      ["Tünel Açılmış Zeminlerde Çökme Tahmini", "Tünel Mühendisliği", "ORAL", "UNDER_REVIEW", "Gizem Bulut", null, null,
        "Geçmiş 30 yıla ait tünel çökme vakaları bölgesel zemin verisiyle eşleştirilerek ampirik bir çökme olasılık modeli kurulmuştur. Model, oturmuş deneysel formüllerle uyumlu olmakla birlikte kil oranı eklendiğinde daha iyi performans vermektedir.",
        "çökme, tünel, ampirik model, kil oranı"],
      ["Yeni Nesil Bentonit Karışımlarının Laboratuvar Karşılaştırması", "Geoteknik", "ORAL", "UNDER_REVIEW", "Pınar Yavuz", null, null,
        "Beş farklı polimer katkılı bentonit çamurunun reolojik özellikleri, filtrasyon davranışı ve göllerme süresi laboratuvarda karşılaştırılmıştır. Polimer katkılı karışımlar standart bentonite göre %31 daha düşük filtre kaybı göstermiştir. Yüksek lisans tez çalışmasının ilk sonuçlarıdır.",
        "bentonit, reoloji, filtrasyon, polimer"],
      ["TBM Disk Kesicilerinde Yeniden Kullanım Ekonomisi", "Kazı Teknolojileri", "ORAL", "REVISION_REQUIRED", "Onur Erdem", "REVISION_REQUIRED", null,
        "Yeniden tıraşlanan disk kesicilerin maliyet-ömrü analizi, 3 projelik saha verisiyle karşılaştırılmıştır. Yeniden kullanım eşyüeri belirli aşınma eşiklerinin altında kaldığında ekonomik olmaktadır. Revizyon: metodoloji bölümünde veri seti ayrımı netleştirilmelidir.",
        "disk kesici, maliyet analizi, yeniden kullanım"],
      ["Kentsel Kazılarda Titreşim Sınır Değerleri", "Tünel Mühendisliği", "ORAL", "SUBMITTED", "Barış Tekin", null, null,
        "Kentsel açık kazı ve tünel çalışmalarında ölçülen titreşim hızları, yapısal hasar eşikleriyle karşılaştırılmış; mevcut mevzuat sınır değerlerinin bazı hassas yapılarda yetersiz kaldığı gösterilmiştir. Değerlendirme hakem ataması beklemektedir.",
        "titreşim, kentsel kazı, hasar eşiği"],
      ["Epoxy Enjeksiyonun Suya Doygun Zeminlerde Performansı", "Geoteknik", "POSTER", "SUBMITTED", "Serpil Ateş", null, null,
        "Suya doygun kum numunelerine uygulanan epoxy enjeksiyonun dayanım artışı, doygunluk derecesine bağlı olarak laboratuvarda ölçülmüştür. Tam doygunlukta bile 0,8 MPa dayanım artışı elde edilmiştir. Poster biçiminde sunulacaktır.",
        "epoxy enjeksiyon, doygun zemin, dayanım"],
      ["Tünel Yangın Senaryolarında Simülasyon Karşılaştırması", "Tünel Mühendisliği", "ORAL", "REJECTED", "Ünsal Kağan", "REJECT", null,
        "FDS ve iki farklı ticari yazılımın aynı yangın senaryosundaki sıcaklık ve duman yayılımı tahminleri karşılaştırılmıştır. Komite özgünlük yetersizliği nedeniyle reddetmiştir; literatür taraması tek başına yeterli yenilik taşımamaktadır.",
        "yangın, FDS, simülasyon"],
      ["Hidrolik Fraktür İzleme Teknikleri", "Geoteknik", "ORAL", "WITHDRAWN", "Fatma Çelik", "WITHDRAWN", null,
        "Hidrolik fraktür deneylerinde mikro-sismik izleme ve açısal deformasyon ölçüm tekniklerinin karşılaştırılması planlanmıştı; saha erişimi engeli nedeniyle yazarlar çalışmayı geri çekmiştir.",
        "hidrolik fraktür, mikro-sismik"],
      ["Kesici Kafa Geometrisinin Torque Profiline Etkisi", "Kazı Teknolojileri", "ORAL", "DRAFT", "Ahmet Yılmaz", null, null,
        "Farklı kesici kafa açılarında torque dalgalanmasının simülasyonu; taslak aşamasında — henüz gönderilmemiştir.",
        "kesici kafa, torque, simülasyon"],
    ];
    let subNo = 100;
    const subByName = new Map<string, string>();
    for (const [title, trackName, type, status, presenting, decision, fileStatus, abstract, keywords] of subData) {
      const track = [tr1, tr2, tr3].find((t) => t.name === trackName)!;
      const [pFirst, ...rest] = presenting.split(" ");
      const person = people.find((p) => p.firstName === pFirst && p.lastName === rest.join(" "));
      const sub = await db.submission.create({
        data: {
          editionId: edition1.id, trackId: track.id, submitterId: person?.id,
          code: `SUB-${subNo}`, title, type, status, presentingAuthorName: presenting,
          fileStatus, submittedAt: status === "DRAFT" ? null : D(-44 + subNo % 20, 16),
          abstract, keywords,
          fileUrl: status === "ACCEPTED" && fileStatus === "APPROVED" ? `https://assets.maven.demo/sub-${subNo}-fulltext.pdf` : null,
          posterNo: type === "POSTER" && status === "ACCEPTED" ? `P-${subNo - 99}` : null,
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

    const sesKeynote = await db.programSession.create({ data: { editionId: edition1.id, roomId: roomMain.id, title: "Açılış Konuşması: Türkiye'de Kazısız Gelecek", description: "Kongre başkanı Prof. Dr. Mehmet Demir'in açılış konuşması: ulusal altyapı yatırımlarında kazısız teknolojilerin 10 yıllık görünümü ve 2026 yol haritası.", type: "KEYNOTE", startTime: D(0, 9, 30), endTime: D(0, 10, 30), status: "PUBLISHED", isVisible: true, accessRule: "OPEN", cmeCredits: 2 } });
    const ses1 = await db.programSession.create({ data: { editionId: edition1.id, roomId: roomMain.id, trackId: tr1.id, submissionId: subByName.get("TBM Kesici Kafa Aşınmasının Makine Öğrenmesi ile Tahmini"), title: "TBM Kesici Kafa Aşınması — ML Tahmini", description: "Kabul edilen bildiri SUB-100 sunumu; 1.240 saha verisiyle eğitilen aşınma tahmin modelleri ve erken uyarı eşikleri.", type: "TALK", startTime: D(0, 11, 0), endTime: D(0, 11, 30), status: "PUBLISHED", isVisible: true, cmeCredits: 1.5 } });
    const ses2 = await db.programSession.create({ data: { editionId: edition1.id, roomId: roomB.id, title: "HDD Risk Yönetimi Atölyesi", description: "Sınırlı kontenjanlı uygulamalı atölye: FMEA tabanlı risk matrisi kurulumu, çamur kaçığı senaryoları ve saha vaka analizleri. Katılım kayıt gerektirir.", type: "WORKSHOP", startTime: D(0, 14, 0), endTime: D(0, 16, 0), capacity: 40, status: "APPROVED", accessRule: "REGISTRATION_REQUIRED", cmeCredits: 3 } });
    const sesPanel = await db.programSession.create({ data: { editionId: edition1.id, roomId: roomMain.id, title: "Büyük Projelerde Paydaş Paneli", description: "Kamu, yüklenici ve akademi temsilcileriyle büyük ölçekli tünelleme projelerinde paydaş uyumu, periyot ve maliyet gerçekleri.", type: "PANEL", startTime: D(1, 10, 0), endTime: D(1, 11, 30), status: "ASSIGNED" } });
    const sesPoster = await db.programSession.create({ data: { editionId: edition1.id, roomId: roomPoster.id, title: "Poster Oturumu I", description: "Kabul edilen posterlerin yazarları panolarında; jüri dolaşımı 13:45'te başlar. Poster numaraları kabul kararındaki P- önekli sıradır.", type: "POSTER_SESSION", startTime: D(1, 13, 0), endTime: D(1, 14, 30), status: "DRAFT" } });
    await db.programSession.create({ data: { editionId: edition1.id, roomId: roomMain.id, title: "Öğle Arası", description: "Ara ikram — fuar alanında stantlar ziyarete açık. Cuma namını için ICC mescit katı kullanılabilir.", type: "BREAK", startTime: D(0, 12, 30), endTime: D(0, 14, 0), status: "PUBLISHED", isVisible: true } });
    await db.programSession.create({ data: { editionId: edition1.id, roomId: roomMain.id, title: "Kapanış & Sertifika Töreni", description: "Değerlendirme sonuçları, en iyi bildiri ödülleri ve katılımcı sertifikalarının törenle teslimi. Gala yemeği öncesi hatıra fotoğrafı.", type: "NETWORKING", startTime: D(2, 16, 0), endTime: D(2, 17, 30), status: "DRAFT" } });

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

    // ── Konaklama (§31-35) — DETAYLI otel girişi: logo, kapak, adres, iletişim, yıldız ──
    const hotel = await db.hotelProperty.create({
      data: {
        editionId: edition1.id, name: "Maslak Grand Otel", city: "İstanbul", district: "Maslak",
        address: "Maslak Mah. Oteller Cad. No:19 Sarıyer / İstanbul — metro Maslak çıkışına 3 dk",
        contactName: "Sibel Erten", contactPhone: "+90 212 000 00 00 (dahili 114)",
        email: "rezervasyon@maslakgrand.example", website: "https://maslakgrand.example",
        starRating: 4, checkInNote: "Giriş 14:00 / Çıkış 12:00 — kongre misafirlerine erken giriş önceliği",
        notes: "Maven blok sözleşmesi: 30 tek + 20 çift oda. Kongre servisi lobiden 08:30 kalkış. Fatura kuruma düzenlenebilir (payerPolicy SELF olanlar hariç).",
      },
    });
    const hotel2 = await db.hotelProperty.create({
      data: {
        editionId: edition1.id, name: "Boğaz Suit Otel", city: "İstanbul", district: "Etiler",
        address: "Nispetiye Cad. No:42 Etiler / Beşiktaş İstanbul — sağ kol senaryosu (yedek otel)",
        contactName: "Cem Akman", contactPhone: "+90 212 333 44 55",
        email: "groups@bogazsuit.example", website: "https://bogazsuit.example",
        starRating: 5, checkInNote: "Giriş 15:00 / Çıkış 12:00 — grup check-in 2. kat resepsiyondan",
        notes: "Yedek/kalite yükseltme oteli — Maslak Grand dolulukta taşırma planı. 10 suit + 15 deluxe oda opsiyonu 05.05 tarihine kadar serbest.",
      },
    });
    const rtSingle = await db.roomType.create({ data: { hotelId: hotel.id, name: "Standard Single", capacity: 1, pricePerNight: 3500 } });
    const rtDouble = await db.roomType.create({ data: { hotelId: hotel.id, name: "Standard Double", capacity: 2, pricePerNight: 4200 } });
    const blockSingle = await db.roomBlock.create({ data: { hotelId: hotel.id, roomTypeId: rtSingle.id, name: "Maven Tek Kişilik Blok", releaseDate: D(7), cancellationPolicy: "Girişten 72 saat öncesine kadar ücretsiz", payerPolicy: "Rezervasyon bazında" } });
    const blockDouble = await db.roomBlock.create({ data: { hotelId: hotel.id, roomTypeId: rtDouble.id, name: "Maven Çift Kişilik Blok", releaseDate: D(7), cancellationPolicy: "Girişten 72 saat öncesine kadar ücretsiz", payerPolicy: "SELF" } });
    // Yedek otel: suite blok (doluluk taşırma senaryosu)
    const rtSuite = await db.roomType.create({ data: { hotelId: hotel2.id, name: "Deluxe Suite", capacity: 2, pricePerNight: 6800 } });
    const blockSuite = await db.roomBlock.create({ data: { hotelId: hotel2.id, roomTypeId: rtSuite.id, name: "Maven Suite Yedek Blok", releaseDate: D(5), cancellationPolicy: "Girişten 48 saat öncesine kadar ücretsiz", payerPolicy: "Rezervasyon bazında" } });
    for (let i = -1; i <= 2; i++) {
      await db.inventoryNight.create({ data: { blockId: blockSingle.id, date: D(i), totalRooms: 30, reservedRooms: 12 } });
      await db.inventoryNight.create({ data: { blockId: blockDouble.id, date: D(i), totalRooms: 20, reservedRooms: i === 0 ? 18 : 11 } });
      await db.inventoryNight.create({ data: { blockId: blockSuite.id, date: D(i), totalRooms: 10, reservedRooms: 0 } });
    }
    const res1 = await db.reservation.create({ data: { editionId: edition1.id, blockId: blockDouble.id, roomTypeId: rtDouble.id, primaryGuestParticipationId: participationMap.get("Mehmet")!.participationId, guestName: "Mehmet Demir", checkIn: D(-1), checkOut: D(2), payerType: "ORGANIZATION", payerName: "Delta Üniversitesi", status: "CONFIRMED" } });
    await db.occupancySlot.createMany({ data: [{ reservationId: res1.id, participationId: participationMap.get("Mehmet")!.participationId, guestName: "Mehmet Demir", position: 1 }] });
    await db.roommateRequest.create({ data: { requesterParticipationId: participationMap.get("Ahmet")!.participationId, targetParticipationId: participationMap.get("Onur")!.participationId, targetName: "Onur Erdem", status: "ACCEPTED" } });
    await db.reservation.createMany({
      data: [
        { editionId: edition1.id, blockId: blockSingle.id, roomTypeId: rtSingle.id, primaryGuestParticipationId: participationMap.get("Seda")!.participationId, guestName: "Seda Polat", checkIn: D(-1), checkOut: D(1), payerType: "SELF", status: "CONFIRMED" },
        { editionId: edition1.id, blockId: blockSingle.id, roomTypeId: rtSingle.id, primaryGuestParticipationId: participationMap.get("Can")!.participationId, guestName: "Can Arslan", checkIn: D(0), checkOut: D(2), payerType: "SELF", status: "REQUESTED" },
        { editionId: edition1.id, blockId: blockDouble.id, roomTypeId: rtDouble.id, guestName: "ICC Heyet Odası (Blok Talebi)", checkIn: D(0), checkOut: D(2), payerType: "SPONSOR", payerName: "ABC Pharma", notes: "Delta Üniversitesi heyeti — VIP lounge yanlı oda talebi, sponsor karşılar", status: "WAITLIST" },
        { editionId: edition1.id, blockId: blockSingle.id, roomTypeId: rtSingle.id, guestName: "Pelin Aksoy", checkIn: D(-1), checkOut: D(0), payerType: "SELF", notes: "Uçuş iptali nedeniyle rezervasyonu misafir iptal etti — 72 saat kuralı dışında ücret yok", status: "CANCELLED" },
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
    const sv4 = await db.formField.create({ data: { formId: survey.id, label: "No-Dig teknolojisi hangi alanda kullanılır?", type: "QA_QUIZ", options: "Kazısız altyapı\nAçık ocak madenciliği\nZiraat", correctAnswer: "Kazısız altyapı", mobileInteractive: true, order: 4 } });
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
      // QA_QUIZ scoring — doğru cevap: Kazısız altyapı (mobil QA motoru)
      const quizCorrect = s[5] === "Kazısız altyapı" ? 1 : 0;
      const sub = await db.formSubmission.create({
        data: {
          formId: survey.id, editionId: edition1.id,
          respondentName: s[0], respondentEmail: s[1],
          status: "APPROVED", spamScore: 0, elapsedSeconds: 25 + i * 7,
          source: i % 4 === 0 ? "MOBILE" : "WEB_PUBLIC",
          quizScore: quizCorrect * 100, quizCorrect, quizTotal: 1,
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

    // ── Yaka Kartı & Credential & Taramalar (§40-42) ──
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

    // ── Mükerrer kişi senaryosu (R7): aynı e-posta + aynı edisyonda İKİ katılım ──
    // Defne Kaya (eski kayıt — hedef adayı): onaylı kongre kaydı + basılmış yaka kartı + tarama
    // Defne Kaya (yeni kayıt — kaynak adayı): öğrenci kategorisinde onay bekleyen + yaka kartı yok
    const defne2 = await db.person.create({
      data: { tenantId: tenant.id, firstName: "Defne", lastName: "Kaya", email: "defne.kaya@example.com", phone: "+90 532 111 22 33", company: "Yol Yapım A.Ş.", title: "Saha Mühendisi", country: "Türkiye" },
    });
    const defne1 = P["Defne"];
    const partDefne1 = await db.eventParticipation.upsert({
      where: { editionId_personId: { editionId: edition1.id, personId: defne1.id } },
      create: { editionId: edition1.id, personId: defne1.id, source: "PUBLIC_FORM", attendance: "CHECKED_IN" },
      update: {},
    });
    await db.registration.create({
      data: {
        editionId: edition1.id, participationId: partDefne1.id, categoryId: catRegular.id,
        confirmationNo: `REG-2026-${String(regNo).padStart(4, "0")}`,
        source: "PUBLIC_FORM", fundingSource: "SELF_PAID", status: "CONFIRMED",
        submittedAt: D(-12), decidedAt: D(-10), decidedBy: "Kaan Yıldız",
      },
    });
    regNo++;
    await db.eventProfileSnapshot.create({ data: { participationId: partDefne1.id, badgeName: "Defne Kaya", company: "Delta Üniversitesi", title: "Öğretim Üyesi", country: "Türkiye" } });
    await db.eventRoleAssignment.create({ data: { participationId: partDefne1.id, role: "ATTENDEE", status: "ACTIVE" } });
    const badgeDefne1 = await db.badgeInstance.create({
      data: { participationId: partDefne1.id, profileId: bpDelegate.id, badgeNo: `BDG-2026-${String(badgeNo).padStart(4, "0")}`, status: "PRINTED", issuedAt: D(-3), printedAt: D(-2) },
    });
    await db.credential.create({ data: { participationId: partDefne1.id, badgeId: badgeDefne1.id, code: `QR-${String(badgeNo).padStart(4, "0")}`, type: "QR", accessProfile: bpDelegate.accessAreas, validFrom: D(-1), validUntil: D(3) } });
    await db.scanEvent.create({ data: { participationId: partDefne1.id, personId: defne1.id, location: "MAIN_DOOR", doorName: "Kapı A", action: "ENTRY", result: "ALLOWED", device: "kapi-a-1", operator: "Yusuf Bilgin", scannedAt: D(0, 9, 5) } });
    badgeNo++;

    const partDefne2 = await db.eventParticipation.create({
      data: { editionId: edition1.id, personId: defne2.id, source: "PUBLIC_FORM", attendance: "NOT_ARRIVED" },
    });
    await db.registration.create({
      data: {
        editionId: edition1.id, participationId: partDefne2.id, categoryId: catStudent.id,
        confirmationNo: `REG-2026-${String(regNo).padStart(4, "0")}`,
        source: "PUBLIC_FORM", fundingSource: "SELF_PAID", status: "SUBMITTED", submittedAt: D(-2),
      },
    });
    regNo++;
    await db.eventProfileSnapshot.create({ data: { participationId: partDefne2.id, badgeName: "Defne Kaya", company: "Yol Yapım A.Ş.", title: "Saha Mühendisi", country: "Türkiye" } });
    await db.badgeInstance.create({
      data: { participationId: partDefne2.id, profileId: bpDelegate.id, badgeNo: `BDG-2026-${String(badgeNo).padStart(4, "0")}`, status: "NOT_ELIGIBLE" },
    });
    badgeNo++;

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
      await db.scanEvent.create({ data: { participationId: rec.participationId, credentialId: cred?.id, personId: P[name].id, location: "MAIN_DOOR", doorName: "Kapı A", action: "RESCAN", result: "RESCAN_WARNING", reason: "Bu yaka kartı bugün daha önce okutuldu", device: "kapi-b-2", operator: "Leyla Güneş", scannedAt: D(0, 12, 15) } });
    }
    // reddedilen: Murat (kayıt REJECTED, yaka kartı yok) — personId ile
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

    // ── GENİŞLETME DALGASI: düşünce bulutu 1-9 demo verisi ──
    // (1) Custom rol motoru + CV + QR VCard zaten kişiden üretiliyor
    await db.customRole.createMany({
      data: [
        { editionId: edition1.id, key: "cme_auditor", name: "Akreditasyon Denetçisi", color: "violet", hierarchyLevel: 10, permissions: JSON.stringify(["CME_CREDITS", "CERTIFICATES"]), description: "CME kredi kayıtlarını denetler, resmî raporu imzalar" },
        { editionId: edition1.id, key: "gala_host", name: "Gala Host", color: "amber", hierarchyLevel: 30, permissions: JSON.stringify(["SOCIAL_EVENTS", "ACCESS_CONTROL"]), description: "Gala girişi ve VIP refakat operasyonu" },
        { editionId: edition1.id, key: "floor_ranger", name: "Fuar Sahası Görevlisi", color: "teal", hierarchyLevel: 55, permissions: JSON.stringify(["EXHIBITION", "FLOOR_PLAN"]), description: "Stand kurulum ve saha yönlendirmesi" },
      ],
    });
    // CV örnekleri — konuşmacı/profil verisi zenginleştirme (elle giriş senaryosu)
    await db.cvEntry.createMany({
      data: [
        { personId: P.Kerem.id, editionId: edition1.id, kind: "EXPERIENCE", title: "Kıdemli Organizasyon Direktörü", organization: "Maven Etkinlik Çözümleri", city: "İstanbul", startDate: D(-2200), isCurrent: true, order: 1 },
        { personId: P.Kerem.id, editionId: edition1.id, kind: "EDUCATION", title: "İşletme Yüksek Lisansı (MBA)", organization: "Boğaziçi Üniversitesi", city: "İstanbul", startDate: D(-4200), endDate: D(-3300), order: 2 },
        { personId: P.Kerem.id, editionId: edition1.id, kind: "LANGUAGE", title: "İngilizce — C2", order: 3 },
        { personId: P.Yusuf.id, editionId: edition1.id, kind: "EXPERIENCE", title: "Saha Operasyonları Şefi", organization: "Maven Etkinlik Çözümleri", city: "İstanbul", startDate: D(-1500), isCurrent: true, order: 1 },
        { personId: P.Yusuf.id, editionId: edition1.id, kind: "CERTIFICATION", title: "ISO 20121 Sürdürülebilir Etkinlik Yöneticisi", startDate: D(-700), order: 2 },
        { personId: P.Kerem.id, editionId: edition1.id, kind: "AWARD", title: "Yılın Etkinlik Yöneticisi — TEBD Ödülü", startDate: D(-500), order: 0 },
      ],
    });

    // (2) Oturum materyalleri — bildiri/sunum/video/speaker metni bağlantıları
    await db.sessionMaterial.createMany({
      data: [
        { sessionId: sesKeynote.id, editionId: edition1.id, type: "SLIDES", title: "Açılış Sunumu — Kazısız Gelecek 2026", url: "https://assets.maven.demo/keynote-slides.pdf", mimeType: "application/pdf", sizeKb: 8400, status: "READY", order: 1 },
        { sessionId: sesKeynote.id, editionId: edition1.id, type: "SPEAKER_TEXT", title: "Konuşmacı Açılış Metni", url: "https://assets.maven.demo/keynote-script.docx", mimeType: "application/msword", sizeKb: 42, status: "READY", order: 2 },
        { sessionId: ses1.id, editionId: edition1.id, type: "FULL_PAPER", title: "TBM Kesici Kafa Aşınması — Tam Metin", url: "https://assets.maven.demo/sub100-fulltext.pdf", mimeType: "application/pdf", sizeKb: 12500, status: "READY", order: 1 },
        { sessionId: ses1.id, editionId: edition1.id, type: "VIDEO", title: "Sunum Kaydı (7 dk)", url: "https://video.maven.demo/sub100", durationMin: 7, status: "PENDING", order: 2 },
        { sessionId: ses2.id, editionId: edition1.id, type: "SLIDES", title: "HDD Risk Atölyesi Çalışma Kitabı", url: "https://assets.maven.demo/hdd-workshop.pdf", mimeType: "application/pdf", sizeKb: 5600, status: "READY", order: 1 },
        { sessionId: ses2.id, editionId: edition1.id, type: "ABSTRACT", title: "Atölye Özeti", url: "https://assets.maven.demo/hdd-abstract.pdf", mimeType: "application/pdf", sizeKb: 220, status: "READY", order: 2 },
      ],
    });

    // (3) Merkezi medya arşivi — SİSTEM klasörleri (kullanıcı kuralı: yaka kartı,
    // sertifika, kişi fotoğrafı, kurum logosu, otel, materyal, portal KENDİ klasöründe;
    // her yükleme BENZERSİZ adla) + kullanıcı klasörü örneği
    const sysFolders = await ensureSystemFolders(edition1.id);
    const F = sysFolders.folders;
    const uniq = () => Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);

    // Kişi fotoğrafları — her katılımcıya baş harfli avatar; kişi kaydına benzersiz adla bağlanır
    for (const [i, p] of people.entries()) {
      const initials = (p.firstName[0] + (p.lastName[0] ?? "")).toUpperCase();
      const name = `kisi-${p.firstName}-${p.lastName}-fotografi-${uniq()}.svg`
        .toLowerCase().replace(/[^a-z0-9.\-]+/g, "-");
      const asset = await db.mediaAsset.create({
        data: {
          editionId: edition1.id, folderId: F.KISI_FOTOGRAF.id, name,
          kind: "IMAGE", mimeType: "image/svg+xml", sizeKb: 1,
          dataUrl: avatarSvg(initials, i), tags: "portre,demo",
          linkedType: "PERSON", linkedId: p.id, uploadedBy: "Kayıt Görevlisi",
        },
      });
      await db.person.update({ where: { id: p.id }, data: { photoUrl: asset.dataUrl } });
    }

    // Kurum/Kuruluş logoları — her kuruma marka rengiyle logo; benzersiz ad + medya bağlantısı
    const orgLogos: [typeof abcPharma, string, string][] = [
      [abcPharma, "ABC Pharma", "0f766e"], [association, "No-Dig Türkiye Derneği", "1d4ed8"], [pco, "Eventiva PCO", "b45309"],
      [icc, "İstanbul Kongre Merkezi", "334155"], [beta, "Beta Mühendislik", "7c3aed"], [media, "TeknoBasın Medya", "be185d"],
      [uni, "Delta Üniversitesi", "0369a1"], [hotelOrg, "Maslak Grand Otel", "92400e"],
    ];
    for (const [org, name, color] of orgLogos) {
      const name2 = `kurum-${name}-logosu-${uniq()}.svg`.toLowerCase().replace(/[^a-z0-9.\-]+/g, "-");
      const asset = await db.mediaAsset.create({
        data: {
          editionId: edition1.id, folderId: F.KURUM_LOGO.id, name: name2,
          kind: "IMAGE", mimeType: "image/svg+xml", sizeKb: 2,
          dataUrl: logoSvg(name, color), tags: "logo,kurum",
          linkedType: "ORGANIZATION", linkedId: org.id, uploadedBy: "Elif Kaya",
        },
      });
      await db.organization.update({ where: { id: org.id }, data: { logoUrl: asset.dataUrl } });
    }
    // Basın kiti — kurum logoları klasörünün altında kullanıcı klasörü
    const mfPress = await db.mediaFolder.create({ data: { editionId: edition1.id, parentId: F.KURUM_LOGO.id, name: "2026 Basın Kiti", description: "Medya sponsoru ile paylaşılan baskı hazır materyaller" } });
    await db.mediaAsset.create({ data: { editionId: edition1.id, folderId: mfPress.id, name: `basin-kiti-2026-${uniq()}.pdf`, kind: "DOCUMENT", mimeType: "application/pdf", sizeKb: 15400, externalUrl: "https://assets.maven.demo/press2026.pdf", tags: "basın,kitapçık", uploadedBy: "Elif Kaya" } });

    // Otel görselleri — logo + kapak (her otel için; OTEL klasörü)
    for (const [h, color] of [[hotel, "92400e"], [hotel2, "0e7490"]] as [typeof hotel, string][]) {
      const logoA = await db.mediaAsset.create({ data: { editionId: edition1.id, folderId: F.OTEL.id, name: `otel-${h.name}-logosu-${uniq()}.svg`.toLowerCase().replace(/[^a-z0-9.\-]+/g, "-"), kind: "IMAGE", mimeType: "image/svg+xml", sizeKb: 2, dataUrl: logoSvg(h.name, color), tags: "otel,logo", linkedType: "HOTEL", linkedId: h.id, uploadedBy: "Burak Demir" } });
      const coverA = await db.mediaAsset.create({ data: { editionId: edition1.id, folderId: F.OTEL.id, name: `otel-${h.name}-kapak-${uniq()}.svg`.toLowerCase().replace(/[^a-z0-9.\-]+/g, "-"), kind: "IMAGE", mimeType: "image/svg+xml", sizeKb: 3, dataUrl: coverSvg(h.name, color, "0f172a"), tags: "otel,kapak", linkedType: "HOTEL", linkedId: h.id, uploadedBy: "Burak Demir" } });
      await db.hotelProperty.update({ where: { id: h.id }, data: { logoUrl: logoA.dataUrl, imageUrl: coverA.dataUrl } });
    }

    // Portal görselleri — dış portal header arka planı + edisyon tasarım alanları
    const portalBg = await db.mediaAsset.create({ data: { editionId: edition1.id, folderId: F.PORTAL.id, name: `portal-header-arkaplan-${uniq()}.svg`.toLowerCase().replace(/[^a-z0-9.\-]+/g, "-"), kind: "IMAGE", mimeType: "image/svg+xml", sizeKb: 4, dataUrl: coverSvg("No-Dig Turkey 2026 — Kayısız Gelecek", "134e4a", "0f172a"), tags: "portal,header", linkedType: "PORTAL", uploadedBy: "Burak Demir" } });
    await db.eventEdition.update({
      where: { id: edition1.id },
      data: {
        portalHeaderTitle: "No-Dig Turkey 2026",
        portalHeaderSubtitle: "Kazısız Teknolojiler Ulusal Kongresi — 24-27 Eylül, İstanbul Kongre Merkezi",
        portalHeaderImageUrl: portalBg.dataUrl,
        portalHeaderAccent: "#14b8a6",
      },
    });

    // Materyaller — oturum dosyalarının medya klasörü kopyaları (MATERYAL klasörü)
    const allMaterials = await db.sessionMaterial.findMany({ where: { editionId: edition1.id } });
    for (const m of allMaterials) {
      const name = `materyal-${m.title}-${uniq()}.pdf`.toLowerCase().replace(/[^a-z0-9.\-]+/g, "-");
      const asset = await db.mediaAsset.create({
        data: { editionId: edition1.id, folderId: F.MATERYAL.id, name, kind: "DOCUMENT", mimeType: m.mimeType ?? "application/pdf", sizeKb: m.sizeKb, externalUrl: m.url, tags: "materyal,oturum", linkedType: "SESSION", linkedId: m.sessionId, uploadedBy: "Selin Öztürk" },
      });
      await db.sessionMaterial.update({ where: { id: m.id }, data: { notes: `Medya: ${asset.name} (Materyaller klasörü)` } });
    }

    // Etkinlik fotoğrafları — kullanıcı klasörü örneği (sistem klasörü değil)
    const mfPhotos = await db.mediaFolder.create({ data: { editionId: edition1.id, name: "Etkinlik Fotoğrafları", description: "Gün sıralı saha fotoğraf arşivi — görevliler yükler" } });
    await db.mediaAsset.createMany({
      data: [
        { editionId: edition1.id, folderId: mfPhotos.id, name: `acilis-genel-gorunum-${uniq()}.jpg`, kind: "IMAGE", mimeType: "image/jpeg", sizeKb: 6200, externalUrl: "https://assets.maven.demo/opening.jpg", tags: "açılış,ana salon", uploadedBy: "Yusuf Bilgin" },
        { editionId: edition1.id, folderId: mfPhotos.id, name: `kayit-masasi-sabah-${uniq()}.jpg`, kind: "IMAGE", mimeType: "image/jpeg", sizeKb: 4300, externalUrl: "https://assets.maven.demo/reg-desk.jpg", tags: "kayıt masası,1. gün", uploadedBy: "Leyla Güneş" },
        { editionId: edition1.id, folderId: null, name: `sponsor-karsilama-video-${uniq()}.mp4`, kind: "VIDEO", mimeType: "video/mp4", sizeKb: 148000, externalUrl: "https://video.maven.demo/sponsor-welcome", tags: "sponsor,hoş geldin", uploadedBy: "Selin Öztürk" },
      ],
    });

    // (4) API Geçidi — çift yönlü entegrasyon örnekleri + log dili
    await db.apiIntegration.createMany({
      data: [
        { tenantId: tenant.id, editionId: edition1.id, name: "CRM Kişi Eşitleme", direction: "OUTBOUND", kind: "REST", baseUrl: "https://crm.maven-demo.example/api/v1/participants", authType: "API_KEY", authConfig: JSON.stringify({ key: "demo-crm-***" }), status: "ACTIVE", notes: "Onaylı kayıtlar gecelik CRM'e aktarılır" },
        { tenantId: tenant.id, name: "Iyzico Sanal POS", direction: "OUTBOUND", kind: "PAYMENT", provider: "IYZICO", baseUrl: "https://api.iyzico.example/payment/pos/auth", authType: "BASIC", authConfig: JSON.stringify({ user: "maven-api", pass: "***" }), status: "ACTIVE", notes: "Form Merkezi online ödemeleri bu kanaldan akar" },
        { tenantId: tenant.id, editionId: edition1.id, name: "Kayıt Webhook (dış form)", direction: "INBOUND", kind: "WEBHOOK", inboundToken: "maven-hook-demo-token", status: "ACTIVE", notes: "POST /api/integrations/hook/maven-hook-demo-token — type=PARTICIPANT ile kişi+katılım upsert" },
        { tenantId: tenant.id, editionId: edition1.id, name: "Mailjet Kampanya Kanalı", direction: "OUTBOUND", kind: "MAIL", provider: "MAILJET", authType: "API_KEY", authConfig: JSON.stringify({ key: "mj-***" }), status: "DRAFT", notes: "Toplu gönderimler spam'e düşmemesi için" },
      ],
    });
    const apiIntegrationDemo = await db.apiIntegration.findFirst({ where: { name: "CRM Kişi Eşitleme" } });
    await db.integrationLog.createMany({
      data: [
        { integrationId: apiIntegrationDemo!.id, editionId: edition1.id, direction: "OUTBOUND", method: "POST", endpoint: "https://crm.maven-demo.example/api/v1/participants", statusCode: 200, ok: true, durationMs: 412, summary: "200 OK — 148 kayıt eşitlendi", createdAt: D(-1) },
        { integrationId: apiIntegrationDemo!.id, editionId: edition1.id, direction: "OUTBOUND", method: "POST", endpoint: "https://crm.maven-demo.example/api/v1/participants", statusCode: 502, ok: false, durationMs: 8000, summary: "HATA: 502 Bad Gateway — tekrar denendi", createdAt: D(-2) },
        { editionId: edition1.id, direction: "INBOUND", method: "POST", endpoint: "/api/integrations/hook/maven-hook-demo-token", statusCode: 202, ok: true, durationMs: 84, summary: "Webhook: type=PARTICIPANT → yeni kişi + katılım", payload: '{"type":"PARTICIPANT","fullName":"Ayşe Yılmaz","email":"ayse@example.com"}', createdAt: D(-1) },
      ],
    });

    // (5) 360 Branding — e-posta şablonları + mail sağlayıcılar + kampanya fazları
    await db.emailTemplate.createMany({
      data: [
        { editionId: edition1.id, name: "Davet — Erken Kayıt", category: "INVITATION", phase: "PRE_EVENT", subject: "{{series}} {{editionLabel}} davetiniz hazır", htmlBody: "<div style=\"font-family:Arial\"><h2 style=\"color:#0f766e\">{{series}} {{editionLabel}}</h2><p>Sayın {{fullName}}, <b>{{edition}}</b> etkinliğine davetlisiniz.</p><p><a href=\"{{registerUrl}}\" style=\"background:#0f766e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none\">Kaydınızı oluşturun</a></p><p style=\"color:#6b7280;font-size:12px\">{{venue}} · {{date}}</p></div>", usageCount: 2 },
        { editionId: edition1.id, name: "Kayıt Onayı + Ödeme Bağlantısı", category: "CONFIRMATION", phase: "PRE_EVENT", subject: "Kayıt onayınız — {{confirmationNo}}", htmlBody: "<div style=\"font-family:Arial\"><h3>Kaydınız onaylandı 🎉</h3><p>Teyit numaranız: <b>{{confirmationNo}}</b></p><p>Kalan bakiye: <b>{{remaining}}</b> — <a href=\"{{payUrl}}\">Online ödeyin</a></p></div>", usageCount: 5 },
        { editionId: edition1.id, name: "Etkileşimli Quiz — Etkinlik İçi", category: "QUIZ", phase: "DURING_EVENT", subject: "Soruları yanıtlayın, CME kredisi kazanın", htmlBody: "<div style=\"font-family:Arial\"><h3>Günün quiz sorusu</h3><p>{{quizQuestion}}</p><p><a href=\"{{quizUrl}}\">Quiz'i açın →</a></p></div>" },
        { editionId: edition1.id, name: "Teşekkür + Sertifika Teslimi", category: "THANK_YOU", phase: "POST_EVENT", subject: "Teşekkürler — sertifikanız ekte", htmlBody: "<div style=\"font-family:Arial\"><h2>Teşekkür ederiz!</h2><p>Sertifikanız ekte: <b>{{certificateSerial}}</b></p><p>Gelecek edisyon için erken kayıt avantajı: {{earlyBirdUrl}}</p></div>" },
      ],
    });
    await db.mailProviderConfig.createMany({
      data: [
        { tenantId: tenant.id, name: "Şirket SMTP (Firma Sunucu)", kind: "SMTP", host: "smtp.maven-demo.example", port: 587, username: "etkinlik@maven-demo.example", password: "***", fromEmail: "etkinlik@maven-demo.example", fromName: "Maven Etkinlik", replyTo: "destek@maven-demo.example", dailyLimit: 2000, isDefault: true, status: "ACTIVE" },
        { tenantId: tenant.id, name: "Mailjet — Toplu Gönderim", kind: "MAILJET", fromEmail: "bulten@maven-demo.example", fromName: "Maven Bülten", dailyLimit: 12000, status: "ACTIVE" },
      ],
    });
    const tplConfirm = await db.emailTemplate.findFirst({ where: { category: "CONFIRMATION" } });
    const providerSmtp = await db.mailProviderConfig.findFirst({ where: { kind: "SMTP" } });
    await db.campaign.updateMany({ where: { editionId: edition1.id, name: "Ödeme Hatırlatma" }, data: { phase: "PRE_EVENT", audienceMode: "SEGMENT", templateId: tplConfirm?.id ?? null, providerId: providerSmtp?.id ?? null } });
    await db.campaign.updateMany({ where: { editionId: edition1.id, name: "Program Yayınlandı" }, data: { phase: "DURING_EVENT", audienceMode: "BOTH", customRecipients: "basin@maven-demo.example, vip@guestlist.example", providerId: (await db.mailProviderConfig.findFirst({ where: { kind: "MAILJET" } }))?.id ?? null } });

    // (6) Kurum kimlik kartı + çoklu kontak + konum QR notu
    await db.organization.update({
      where: { id: abcPharma.id },
      data: {
        generalEmail: "info@abcpharma.example",
        address: "Maslak Mah. Büyükdere Cad. No:255 Sarıyer / İstanbul",
        description: "ABC Pharma — 1998'den beri endüstriyel çözümler; No-Dig serisinin kurumsal sponsoru.",
        locationNote: "Fuar Alanı · Stand A24 · Maslak Grand Otel lobisi karşısı",
      },
    });
    await db.organizationContact.createMany({
      data: [
        { organizationId: abcPharma.id, name: "Sibel Aksu", title: "Finans Müdürü", email: "finans@abcpharma.example", phone: "+90 212 555 01 90", role: "PAYMENT", department: "Finans" },
        { organizationId: abcPharma.id, name: "Cem Tekin", title: "Teknik Operasyon", email: "teknik@abcpharma.example", role: "TECHNICAL", department: "Operasyon" },
      ],
    });

    // (7) Sponsorluk — paket dışı custom hak + onay akışı örneği
    await db.entitlement.create({ data: { editionId: edition1.id, ownerOrganizationId: abcPharma.id, source: "PROMO", type: "CUSTOM", label: "VIP Lounge Kahve Servisi (sponsor ayrıcalığı)", quantityGranted: 4, approvalStatus: "PROPOSED", restrictions: "Etkinlik komitesi onayı sonrası geçerli" } });

    // (8) Konaklama — occupancy/rate/no-show örneği + aile misafiri (Person self-ref)
    await db.reservation.update({
      where: { id: res1.id },
      data: { occupancyType: "DOUBLE", ratePerNight: 4200, nights: 3 },
    });
    const resCancel = await db.reservation.findFirst({ where: { editionId: edition1.id, status: "CANCELLED" } });
    if (resCancel) await db.reservation.update({ where: { id: resCancel.id }, data: { noShow: true, noShowFee: 1500 } });
    const parentMustafa = participationMap.get("Mustafa");
    if (parentMustafa) {
      const parent = await db.eventParticipation.findUnique({ where: { id: parentMustafa.participationId }, include: { person: true } });
      if (parent) {
        const child = await db.person.create({ data: { tenantId: tenant.id, firstName: "Elif", lastName: parent.person.lastName, relationType: "SPOUSE", parentPersonId: parent.personId, email: null } });
        await db.eventParticipation.create({ data: { editionId: edition1.id, personId: child.id, source: "ADMIN_ENTRY", notes: "Refakatçi — Mustafa'ya bağlı aile misafiri" } });
      }
    }

    // (8-bis) Yaka kartı tasarımcısı — varsayılan tasarım + profillere bağla
    const badgeDesignMain = await db.badgeDesign.create({
      data: {
        editionId: edition1.id, name: "Standart Konferans — Dikey", widthMm: 105, heightMm: 148, bleedMm: 3, cornerMm: 5,
        sideCount: 2, fontKey: "montserrat", qrSource: "CREDENTIAL", sponsorHierarchyKey: "Gold Sponsor",
        showProgramOnBack: true, backContactInfo: "Maven Etkinlik Çözümleri\ninfo@maven.events\n+90 212 000 00 00\nmaven.events/nodig2026",
        frontElements: JSON.stringify([
          { type: "LOGO", x: 8, y: 6, w: 40, h: 10, fontSize: 4.5, weight: 800, color: "0f766e", align: "left" },
          { type: "FIELD", fieldKey: "badgeName", x: 8, y: 24, w: 89, h: 12, fontSize: 7.5, weight: 800, color: "0f172a", align: "left" },
          { type: "FIELD", fieldKey: "title", x: 8, y: 37, w: 89, h: 6, fontSize: 3.4, weight: 500, color: "475569", align: "left" },
          { type: "FIELD", fieldKey: "company", x: 8, y: 43, w: 89, h: 6, fontSize: 3.4, weight: 700, color: "0f766e", align: "left" },
          { type: "FIELD", fieldKey: "profileName", x: 8, y: 122, w: 40, h: 7, fontSize: 3.2, weight: 800, color: "ffffff", align: "left" },
          { type: "FIELD", fieldKey: "accessAreas", x: 8, y: 129, w: 60, h: 5, fontSize: 2.4, weight: 500, color: "ffffff", align: "left" },
          { type: "QR", x: 70, y: 118, w: 27, h: 27, align: "center" },
        ]),
        backElements: JSON.stringify([
          { type: "TEXT", text: "PROGRAM — 1. GÜN", x: 8, y: 6, w: 80, h: 8, fontSize: 4.2, weight: 800, color: "0f766e", align: "left" },
          { type: "PROGRAM", x: 8, y: 16, w: 89, h: 55, fontSize: 2.4, color: "1f2937", align: "left" },
          { type: "SPONSOR_LOGO", x: 8, y: 78, w: 89, h: 18, align: "center" },
          { type: "CONTACT", x: 8, y: 104, w: 89, h: 30, fontSize: 2.8, color: "475569", align: "left" },
          { type: "QR", x: 70, y: 6, w: 20, h: 20 },
        ]),
        isDefault: true,
      },
    });
    // (8-bis) Yaka kartı tasarımcısı — varsayılan tasarım + profillere bağla + arka plan (YAKA_KARTI klasörü)
    const badgeBg = coverSvg("MAVEN", "134e4a", "0f766e");
    const badgeBgAsset = await db.mediaAsset.create({ data: { editionId: edition1.id, folderId: F.YAKA_KARTI.id, name: `yaka-karti-arkaplan-standart-dikey-${uniq()}.svg`.toLowerCase().replace(/[^a-z0-9.\-]+/g, "-"), kind: "IMAGE", mimeType: "image/svg+xml", sizeKb: 3, dataUrl: badgeBg, tags: "yaka kartı,arka plan", linkedType: "BADGE_DESIGN", linkedId: badgeDesignMain.id, uploadedBy: "Burak Demir" } });
    await db.mediaAsset.create({ data: { editionId: edition1.id, folderId: F.YAKA_KARTI.id, name: `yaka-karti-tasarim-standart-dikey-${uniq()}.json`.toLowerCase().replace(/[^a-z0-9.\-]+/g, "-"), kind: "DOCUMENT", mimeType: "application/json", sizeKb: 4, externalUrl: "https://assets.maven.demo/badge-design-main.json", tags: "yaka kartı,tasarım", linkedType: "BADGE_DESIGN", linkedId: badgeDesignMain.id, uploadedBy: "Burak Demir" } });
    await db.badgeDesign.update({ where: { id: badgeDesignMain.id }, data: { frontBackgroundDataUrl: badgeBgAsset.dataUrl } });
    await db.badgeProfile.update({ where: { id: bpDelegate.id }, data: { designId: badgeDesignMain.id } });
    await db.badgeProfile.update({ where: { id: bpSpeaker.id }, data: { designId: badgeDesignMain.id } });

    // (9) Sertifika tasarımcısı — KANVAS yerleşimi (designJson) + arka plan (SERTIFIKA klasörü)
    const certBg = coverSvg("", "fffdf6", "f1ead4");
    const certBgAsset = await db.mediaAsset.create({ data: { editionId: edition1.id, folderId: F.SERTIFIKA.id, name: `sertifika-arkaplan-katilimci-${uniq()}.svg`.toLowerCase().replace(/[^a-z0-9.\-]+/g, "-"), kind: "IMAGE", mimeType: "image/svg+xml", sizeKb: 2, dataUrl: certBg, tags: "sertifika,arka plan", linkedType: "CERTIFICATE", linkedId: certPart.id, uploadedBy: "Selin Öztürk" } });
    await db.certificateDefinition.updateMany({
      where: { editionId: edition1.id },
      data: {
        widthMm: 297, heightMm: 210, bleedMm: 5, fontKey: "playfair", textColor: "1f2937",
        bodyTemplate: "<p>Bu belge, <b>{{edition}}</b> etkinliğinde <b>{{tier}}</b> statüsüyle görev almasının onurunu taşıdığını belgelemek üzere {{date}} tarihinde düzenlenmiştir.</p><p style=\"margin-top:6mm\"><b>{{fullName}}</b><br/><span style=\"color:#6b7280\">{{title}} — {{company}}</span></p>",
        tierNote: "Katılımcı düzeyi",
        backgroundDataUrl: certBgAsset.dataUrl,
        designJson: JSON.stringify([
          { id: "c1", type: "line", x: 12, y: 12, w: 273, h: 0, color: "b45309", align: "left" },
          { id: "c2", type: "line", x: 12, y: 198, w: 273, h: 0, color: "b45309", align: "left" },
          { id: "c3", type: "text", x: 30, y: 28, w: 237, h: 16, text: "NO-DIG TURKEY 2026", fontSize: 13, fontWeight: 800, color: "0f766e", align: "center" },
          { id: "c4", type: "text", x: 30, y: 46, w: 237, h: 10, text: "Katılım Sertifikası", fontSize: 8, fontWeight: 500, color: "6b7280", align: "center" },
          { id: "c5", type: "text", x: 40, y: 84, w: 217, h: 34, text: "Bu belge {{fullName}} kişisinin {{edition}} etkinliğine {{tier}} olarak katılımını belgeler.", fontSize: 6.5, fontWeight: 400, color: "1f2937", align: "center" },
          { id: "c6", type: "text", x: 40, y: 128, w: 217, h: 12, text: "{{fullName}}", fontSize: 10, fontWeight: 700, color: "111827", align: "center" },
          { id: "c7", type: "text", x: 40, y: 140, w: 217, h: 8, text: "{{title}} — {{company}}", fontSize: 5.5, fontWeight: 400, color: "6b7280", align: "center" },
          { id: "c8", type: "text", x: 30, y: 172, w: 120, h: 10, text: "Prof. Dr. Mehmet Demir\nKongre Başkanı", fontSize: 5, fontWeight: 500, color: "374151", align: "left" },
          { id: "c9", type: "text", x: 160, y: 172, w: 107, h: 10, text: "{{date}} — İstanbul", fontSize: 5, fontWeight: 400, color: "374151", align: "right" },
        ]),
      },
    });

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
    db.invitation, db.scanEvent, db.credential, db.badgeInstance, db.badgeProfile, db.badgeDesign,
    db.certificateIssue, db.certificateDefinition, db.floorPlanObject, db.boothAllocation, db.boothUnit,
    db.waitlistEntry,
    db.deliverable, db.sponsorAgreement, db.sponsorPackage, db.sponsorTierDefinition,
    db.entitlementClaim, db.entitlement, db.refund, db.payment, db.orderLine, db.order, db.catalogItem,
    db.occupancySlot, db.roommateRequest, db.reservation, db.inventoryNight, db.roomBlock, db.roomType, db.hotelProperty,
    db.review, db.reviewAssignment, db.decision, db.authorship, db.sessionMaterial, db.submission, db.track, db.scientificSetup,
    db.programAssignment, db.programSession, db.programRoom,
    db.eventRoleAssignment, db.registration, db.registrationCategory, db.eventProfileSnapshot, db.eventParticipation,
    db.eventOrganizationAssignment, db.eventCapability, db.eventEdition, db.eventSeries,
    db.organizationContact, db.organization, db.task, db.campaign, db.activityLog, db.cvEntry, db.customRole, db.person, db.user,
    db.mediaAsset, db.mediaFolder, db.integrationLog, db.apiIntegration, db.emailTemplate, db.mailProviderConfig, db.tenant,
  ];
  for (const m of order) {
    await (m as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
}
