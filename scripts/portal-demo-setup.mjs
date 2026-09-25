// ─── PWA Katılımcı Portalı — demo kurulum (idempotent) ──────────────────────
// Kullanım: `bun run scripts/portal-demo-setup.mjs` — /api/seed sonrası portal
// demo durumunu geri kurar: portal aktif, etkinlik kodu, kroki, B2B planları,
// karşılama duyurusu. Mevcut kayıtları korur (upsert / boş-ise-oluştur).
// Not: gerçek müşteri ortamında bu betik ÇALIŞTIRILMAZ — yalnız demo/sandbox.
import { db } from "../src/lib/db.ts";

const SLUG = "no-dig-turkey-2026";

const edition = await db.eventEdition.findUnique({ where: { slug: SLUG } });
if (!edition) {
  console.error("demo edisyon yok — önce /api/seed çalıştırın");
  process.exit(1);
}

// 1) yapılandırma: aktif portal + kod + tema + kroki (mevcut değerler korunur)
const existing = await db.eventPortalConfig.findUnique({ where: { editionId: edition.id } });
const config = await db.eventPortalConfig.upsert({
  where: { editionId: edition.id },
  create: {
    editionId: edition.id,
    portalEnabled: true,
    eventCode: "DEMO26",
    themeColor: "#0d9488",
    venueMapUrl: "/portal-kroki-demo.png",
    venueMapEnabled: true,
    headerEventsJson: JSON.stringify(
      (await db.eventEdition.findMany({ where: { tenantId: edition.tenantId, isPublished: true, NOT: { id: edition.id } }, select: { id: true } })).map((e) => e.id),
    ),
  },
  update: {
    portalEnabled: existing?.portalEnabled ?? true,
    eventCode: existing?.eventCode ?? "DEMO26",
    venueMapUrl: existing?.venueMapUrl ?? "/portal-kroki-demo.png",
    venueMapEnabled: existing?.venueMapEnabled ?? true,
    themeColor: existing?.themeColor ?? "#0d9488",
  },
});
console.log("config:", { enabled: config.portalEnabled, code: config.eventCode, map: config.venueMapEnabled });

// 2) B2B demo — yalnız hiç plan yoksa oluştur (idempotent)
const planCount = await db.b2bPlan.count({ where: { editionId: edition.id } });
if (planCount === 0) {
  const people = await db.person.findMany({
    where: { participations: { some: { editionId: edition.id } } },
    select: { id: true, email: true, firstName: true },
    take: 6,
  });
  const ahmet = people.find((p) => p.email === "ahmet.yilmaz@example.com") ?? people[0];
  const ayse = people.find((p) => p.email === "ayse.kara@example.com") ?? people[1];
  if (ahmet && ayse) {
    const p1 = await db.b2bPlan.create({
      data: {
        editionId: edition.id, subject: "Teknoloji Ortaklığı Görüşmesi",
        description: "Yeni tünelleme sensörleri iş birliği",
        startsAt: new Date(Date.now() + 26 * 3_600_000), endsAt: new Date(Date.now() + 26.5 * 3_600_000),
        venue: "Fuar Alanı", location: "M4", status: "ACTIVE",
      },
    });
    const p2 = await db.b2bPlan.create({
      data: {
        editionId: edition.id, subject: "Tedarik Zinciri Toplantısı",
        startsAt: new Date(Date.now() + 50 * 3_600_000), endsAt: new Date(Date.now() + 50.5 * 3_600_000),
        venue: "Fuar Alanı", location: "M7", status: "ACTIVE",
      },
    });
    await db.b2bAssignment.createMany({
      data: [
        { planId: p1.id, personId: ahmet.id, role: "PARTICIPANT" },
        { planId: p1.id, personId: ayse.id, role: "HOST" },
        { planId: p2.id, personId: ahmet.id, role: "HOST" },
      ],
    });
    console.log("b2b demo: 2 plan, 3 atama");
  }
} else {
  console.log("b2b demo: mevcut planlar korundu (" + planCount + ")");
}

// 3) karşılama duyurusu — yalnız hiç duyuru yoksa
const annCount = await db.portalAnnouncement.count({ where: { editionId: edition.id } });
if (annCount === 0) {
  await db.portalAnnouncement.create({
    data: {
      editionId: edition.id,
      title: "Katılımcı Portalına Hoş Geldiniz",
      message: "Program, konuşmacılar, sponsorlar ve B2B randevularınız artık cebinizde. Ana salondaki kahve molası duyurularını buradan takip edin.",
      level: "INFO",
      target: "ALL",
      sentBy: "AUTO",
    },
  });
  console.log("karşılama duyurusu eklendi");
} else {
  console.log("duyurular korundu (" + annCount + ")");
}

console.log("portal demo hazır — /?portal=" + SLUG);
process.exit(0);
