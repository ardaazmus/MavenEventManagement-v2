// Manuel & toplu içe-aktarma kayıt zinciri — Admin tekil giriş (Manuel Kayıt) ve
// Excel/CSV içe aktarma (Kayıt & Katılımcılar modülü) TEK fonksiyondan geçer.
//
// Mimari ilkesi (§2, registration-chain.ts ile aynı): Kişi ≠ Katılım ≠ Kayıt ≠
// Sipariş ≠ Ödeme — her adım bağımsız kayıt; zincir TEK interaktif Prisma
// transaction'ı içinde kurulur, kısmi başarı asla kalıcı olmaz.
//
// Sözleşmeler:
//  - Kimlik kuralı 1: e-posta GÜÇLÜ EŞLEŞTİRME işareti — varsa YENİ kişi oluşturulmaz,
//    mevcut kişiye kayıt açılır (yoksa oluşturulur).
//  - Mükerrer koruması: kişinin bu edisyonda aktif (CANCELLED/REJECTED hariç) kaydı
//    varsa DUPLICATE hatası — toplu akışta satır "atlandı" olarak raporlanır.
//  - Kapasite (P3 deseni): kategori kapasitesi tx İÇİNDE taze sayımla denetlenir
//    (SQLite tek-yazıcı serileştirme); CAPACITY hatası beklenen iş kuralıdır (409).
//  - Sipariş/Ödeme: yalnız ücretli kategori + SELF_PAID — kurum/sponsor/konaklama
//    ödemeleri Finans modülünün ayrı işlemleridir (burada otomatik açılmaz).
//  - Kaynak (§12): ADMIN_ENTRY (manuel) | IMPORT (içe aktarma) — çağıran belirler.
//  - Durum beyaz listesi: DRAFT|SUBMITTED|PENDING_APPROVAL|CONFIRMED — REJECTED/
//    CANCELLED ilk-yazımda anlamsız (akış kararları flows'a aittir).

import { db } from "@/lib/db";
import { ActivityType } from "./activity";
import { readableNo } from "./registration-chain";

export const MANUAL_STATUSES = ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "CONFIRMED"] as const;
export const MANUAL_FUNDING = [
  "SELF_PAID", "ORGANIZATION_PAID", "SPONSOR_ENTITLEMENT", "HOST_COMPLIMENTARY",
  "SPEAKER_ENTITLEMENT", "STAFF", "SCHOLARSHIP", "GRANT", "PROMO",
] as const;

export type ManualErrorCode = "EDITION_NOT_FOUND" | "VALIDATION" | "CATEGORY" | "CAPACITY" | "DUPLICATE";

export class ManualRegistrationError extends Error {
  code: ManualErrorCode;
  detail?: Record<string, unknown>;
  constructor(code: ManualErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export interface ManualRegistrationInput {
  editionId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  company?: string | null;
  city?: string | null;
  country?: string | null;
  attendance?: string | null; // default NOT_ARRIVED
  categoryId?: string | null;
  status?: string | null; // default: kategori.requiresApproval ? PENDING_APPROVAL : SUBMITTED
  fundingSource?: string | null; // default SELF_PAID
  notes?: string | null;
  source?: string | null; // default ADMIN_ENTRY (§12: ADMIN_ENTRY|IMPORT|GROUP_REGISTRATION…)
  actorName?: string | null; // audit aktörü
}

export interface ManualRegistrationResult {
  registrationId: string;
  confirmationNo: string;
  status: string;
  personId: string;
  personCreated: boolean;
  participationId: string;
  participationCreated: boolean;
  orderCreated: boolean;
  categoryId: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(v: unknown): boolean {
  return typeof v === "string" && EMAIL_RE.test(v.trim());
}

export async function createManualRegistration(input: ManualRegistrationInput): Promise<ManualRegistrationResult> {
  // ── 0) hızlı doğrulama (tx dışı — ucuz ret) ──
  const firstName = String(input.firstName ?? "").trim();
  const lastName = String(input.lastName ?? "").trim();
  if (!firstName || !lastName) {
    throw new ManualRegistrationError("VALIDATION", "Ad ve soyad zorunludur");
  }
  const email = input.email ? String(input.email).trim().toLowerCase() : null;
  if (email && !EMAIL_RE.test(email)) {
    throw new ManualRegistrationError("VALIDATION", "Geçerli bir e-posta adresi girin");
  }
  const status = input.status ? String(input.status) : null;
  if (status && !(MANUAL_STATUSES as readonly string[]).includes(status)) {
    throw new ManualRegistrationError("VALIDATION", `Geçersiz kayıt durumu: ${status}`);
  }
  const fundingSource = input.fundingSource ? String(input.fundingSource) : "SELF_PAID";
  if (!(MANUAL_FUNDING as readonly string[]).includes(fundingSource)) {
    throw new ManualRegistrationError("VALIDATION", `Geçersiz fon kaynağı: ${fundingSource}`);
  }
  const source = input.source ? String(input.source) : "ADMIN_ENTRY";
  const attendance = input.attendance ? String(input.attendance) : "NOT_ARRIVED";

  // ── 1) edisyon + kategori (salt-okunur, tx dışı) ──
  const edition = await db.eventEdition.findUnique({
    where: { id: input.editionId },
    select: { id: true, tenantId: true, name: true },
  });
  if (!edition) throw new ManualRegistrationError("EDITION_NOT_FOUND", "Etkinlik (edisyon) bulunamadı");

  const category = input.categoryId
    ? await db.registrationCategory.findFirst({
        where: { id: input.categoryId, editionId: edition.id },
        select: { id: true, name: true, basePrice: true, currency: true, capacity: true, requiresApproval: true },
      })
    : null;
  if (input.categoryId && !category) {
    throw new ManualRegistrationError("CATEGORY", "Kategori bu etkinlikte bulunamadı");
  }

  const actorName = input.actorName?.trim() || "Yönetici";

  // ── 2) zincir — TEK transaction ──
  try {
    return await db.$transaction(async (tx) => {
      // KİŞİ — e-posta güçlü eşleştirme (Kimlik kuralı 1)
      let person = email
        ? await tx.person.findFirst({
            where: { tenantId: edition.tenantId, email },
            select: { id: true },
          })
        : null;
      let personCreated = false;
      if (!person) {
        person = await tx.person.create({
          data: {
            tenantId: edition.tenantId,
            firstName,
            lastName,
            email: email ?? undefined,
            phone: input.phone || undefined,
            title: input.title || undefined,
            company: input.company || undefined,
            city: input.city || undefined,
            country: input.country || undefined,
            status: "ACTIVE",
          },
          select: { id: true },
        });
        personCreated = true;
      }

      // KATILIM — edisyon + kişi tekil (@@unique editionId_personId)
      let participation = await tx.eventParticipation.findUnique({
        where: { editionId_personId: { editionId: edition.id, personId: person.id } },
        select: { id: true },
      });
      let participationCreated = false;
      if (!participation) {
        participation = await tx.eventParticipation.create({
          data: { editionId: edition.id, personId: person.id, source, attendance },
          select: { id: true },
        });
        participationCreated = true;
      }

      // MÜKERRER KORUMA — kişinin bu edisyonda aktif kaydı varsa yeni kayıt açılmaz
      // (düzeltme mevcut kayıt üzerinden yapılır; toplu akışta satır atlanır).
      const dup = await tx.registration.findFirst({
        where: { editionId: edition.id, participationId: participation.id, status: { notIn: ["CANCELLED", "REJECTED"] } },
        select: { id: true, confirmationNo: true, status: true },
      });
      if (dup) {
        throw new ManualRegistrationError(
          "DUPLICATE",
          `Bu kişi bu etkinlikte zaten kayıtlı (Teyit: ${dup.confirmationNo}, durum: ${dup.status})`,
          { confirmationNo: dup.confirmationNo, registrationId: dup.id }
        );
      }

      // KAPASİTE — atomik tx-içi taze sayım (P3 deseni; iptal/reddedilmiş sayılmaz)
      if (category?.capacity != null && category.capacity > 0) {
        const used = await tx.registration.count({
          where: { editionId: edition.id, categoryId: category.id, status: { notIn: ["CANCELLED", "REJECTED"] } },
        });
        if (used >= category.capacity) {
          throw new ManualRegistrationError(
            "CAPACITY",
            `Kategori kapasitesi dolu (${used}/${category.capacity})`,
            { categoryId: category.id }
          );
        }
      }

      // KAYIT
      const finalStatus = status ?? (category?.requiresApproval ? "PENDING_APPROVAL" : "SUBMITTED");
      const registration = await tx.registration.create({
        data: {
          editionId: edition.id,
          participationId: participation.id,
          categoryId: category?.id ?? null,
          confirmationNo: readableNo("NF"),
          source,
          fundingSource,
          status: finalStatus,
          submittedAt: ["SUBMITTED", "PENDING_APPROVAL", "CONFIRMED"].includes(finalStatus) ? new Date() : null,
          decidedAt: finalStatus === "CONFIRMED" ? new Date() : null,
          decidedBy: finalStatus === "CONFIRMED" ? actorName : null,
          notes: input.notes || null,
        },
        select: { id: true, confirmationNo: true, status: true },
      });

      // SİPARİŞ + ÖDEME — yalnız ücretli kategori + kendi ödemesi (Finans ilkesi)
      const fee = category?.basePrice ?? 0;
      let orderCreated = false;
      if (fee > 0 && fundingSource === "SELF_PAID") {
        const order = await tx.order.create({
          data: {
            editionId: edition.id,
            buyerPersonId: person.id,
            payerName: `${firstName} ${lastName}`,
            currency: category?.currency ?? "TRY",
            totalAmount: fee,
            status: "OPEN",
            notes: `Kayıt: ${registration.confirmationNo}`,
          },
          select: { id: true },
        });
        await tx.orderLine.create({
          data: {
            orderId: order.id,
            participationId: participation.id,
            registrationId: registration.id,
            description: `${category?.name ?? "Katılım"} — ${edition.name}`,
            quantity: 1,
            unitPrice: fee,
            total: fee,
          },
        });
        await tx.payment.create({
          data: {
            orderId: order.id,
            amount: fee,
            currency: category?.currency ?? "TRY",
            source: "ADMIN_ENTRY",
            status: "PENDING", // başarı onayı sağlayıcı mutabakatına bırakılır
          },
        });
        orderCreated = true;
      }

      // AUDIT
      await tx.activityLog.create({
        data: {
          tenantId: edition.tenantId,
          editionId: edition.id,
          type: ActivityType.REGISTRATION_SAVED,
          message: `${source === "IMPORT" ? "İçe aktarma kaydı" : "Manuel kayıt"}: ${firstName} ${lastName} (${registration.confirmationNo})`,
          entityType: "Registration",
          entityId: registration.id,
          actorName,
        },
      });

      return {
        registrationId: registration.id,
        confirmationNo: registration.confirmationNo,
        status: registration.status,
        personId: person.id,
        personCreated,
        participationId: participation.id,
        participationCreated,
        orderCreated,
        categoryId: category?.id ?? null,
      };
    }, { timeout: 20_000, maxWait: 10_000 });
  } catch (e) {
    if (e instanceof ManualRegistrationError) throw e;
    // Prisma P2002 vb. — anlamlı iş kuralına çevrilmeden çağırana taşınır (500)
    throw e;
  }
}

// ── Kategori referans çözümleyici (içe aktarma): id | kod | ad — büyük/küçük duyarsız ──
export async function resolveCategoryRef(
  editionId: string,
  raw: unknown
): Promise<{ id: string; name: string } | null> {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const cat = await db.registrationCategory.findFirst({
    where: {
      editionId,
      OR: [{ id: text }, { code: lower }, { name: lower }],
    },
    select: { id: true, name: true },
  });
  if (cat) return { id: cat.id, name: cat.name };
  // kod/ad büyük-küçük tutarsız dosyalar için ikinci geçiş: contains
  const fuzzy = await db.registrationCategory.findFirst({
    where: { editionId, OR: [{ code: { contains: lower } }, { name: { contains: text } }] },
    select: { id: true, name: true },
  });
  return fuzzy;
}
