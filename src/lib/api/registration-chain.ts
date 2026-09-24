// Kayıt zinciri: FormSubmission → Person → Participation → Registration → Order/Line/Payment
// Mimari ilkesi (§2): Kişi ≠ Katılım ≠ Kayıt ≠ Sipariş ≠ Ödeme — her adım bağımsız kayıt.
// Form Merkezi'nden gelen onaylı/otomatik kayıt gönderileri bu tek fonksiyondan geçer
// (hem /api/public-register hem /api/form-submissions/[id] onay aksiyonu kullanır).
//
// DÜZELTME (atomicity): zincir TEK interaktif Prisma transaction'ı içinde kurulur —
// herhangi bir adım düşerse TÜM zincir geri alınır; kısmi başarı asla kalıcı olmaz.
// Idempotency: FormSubmission.registrationId @unique benzersizlik kısıtı anahtar davranışı
// görür — aynı gönderiye ikinci zincir P2002 ile reddedilir; çağıran mevcut zinciri okur.
// Retry sözleşmesi: aynı submissionId ile yeniden çağrı (1) mevcut zinciri döndürür
// (existing:true), (2) yarış durumunda unique kısıtıyla tek zincir garanti edilir.
// Dış sağlayıcı sözleşmesi: burada Ödeme yalnız PENDING açılır — başarı onayı
// SADECE sağlayıcı sonucunun kalıcı mutabakatından sonra yapılır (payments/[id]/process).

import { db } from "@/lib/db";
import { ActivityType } from "./activity";

function readableNo(prefix: string): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.floor(Math.random() * 900 + 100);
  return `${prefix}-${t}${r}`;
}

export interface ChainResult {
  registration: unknown;
  order: unknown | null;
  payment: unknown | null;
  person: unknown;
  participation: unknown;
  existing: boolean; // zincir daha önce kurulmuş mu
}

export async function createRegistrationFromSubmission(
  submissionId: string,
  opts?: { paymentSource?: string }
): Promise<ChainResult> {
  const submission = await db.formSubmission.findUnique({
    where: { id: submissionId },
    include: { form: true },
  });
  if (!submission) throw new Error("Form gönderisi bulunamadı");

  // Zaten zincir kurulmuşsa mevcut kaydı döndür (idempotent — hızlı yol)
  if (submission.registrationId) {
    return readExistingChain(submission.registrationId, submission.editionId);
  }

  const edition = await db.eventEdition.findUnique({ where: { id: submission.editionId } });
  if (!edition) throw new Error("Etkinlik (edisyon) bulunamadı");

  // Kategori fiyatı tx DIŞINDA okunur (yalnız okuma; tx içinde yazımlar var)
  const category = submission.form.defaultCategoryId
    ? await db.registrationCategory.findUnique({ where: { id: submission.form.defaultCategoryId } })
    : await db.registrationCategory.findFirst({
        where: { editionId: edition.id, isActive: true },
        orderBy: { order: "asc" },
      });

  try {
    return await db.$transaction(async (tx) => {
      // 1) KİŞİ — e-posta güçlü eşleştirme işareti (Kimlik kuralı 1): varsa yeniden oluşturma
      let person = await tx.person.findFirst({
        where: { tenantId: edition.tenantId, email: submission.respondentEmail },
      });
      if (!person) {
        const parts = (submission.respondentName ?? "").trim().split(" ");
        const firstName = parts[0] || "İsimsiz";
        const lastName = parts.slice(1).join(" ") || "—";
        person = await tx.person.create({
          data: {
            tenantId: edition.tenantId,
            firstName,
            lastName,
            email: submission.respondentEmail,
            phone: submission.phone ?? undefined,
            company: submission.organization ?? undefined,
            status: "ACTIVE",
          },
        });
      }

      // 2) KATILIM — edisyon + kişi tekil
      let participation = await tx.eventParticipation.findUnique({
        where: { editionId_personId: { editionId: edition.id, personId: person.id } },
      });
      if (!participation) {
        participation = await tx.eventParticipation.create({
          data: { editionId: edition.id, personId: person.id, source: "PUBLIC_FORM" },
        });
      }

      // 3) KAYIT — kategori fiyatı ve onay gereksinimi kategoriden
      const registration = await tx.registration.create({
        data: {
          editionId: edition.id,
          participationId: participation.id,
          categoryId: category?.id,
          confirmationNo: readableNo("NF"),
          source: "PUBLIC_FORM",
          fundingSource: "SELF_PAID",
          status: category?.requiresApproval ? "PENDING_APPROVAL" : "SUBMITTED",
          submittedAt: new Date(),
          notes: `Form Merkezi gönderimi: ${submission.form.name}`,
        },
      });

      // 4) SİPARİŞ + KALEM + ÖDEME — ücretli kategoriyse (Sipariş ≠ Ödeme)
      const fee = category?.basePrice ?? 0;
      let order: Awaited<ReturnType<typeof tx.order.create>> | null = null;
      let payment: Awaited<ReturnType<typeof tx.payment.create>> | null = null;
      if (fee > 0) {
        order = await tx.order.create({
          data: {
            editionId: edition.id,
            buyerPersonId: person.id,
            payerName: submission.respondentName,
            currency: category?.currency ?? "TRY",
            totalAmount: fee,
            status: "OPEN",
            notes: `Kayıt: ${registration.confirmationNo}`,
          },
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
        payment = await tx.payment.create({
          data: {
            orderId: order.id,
            amount: fee,
            currency: category?.currency ?? "TRY",
            source: opts?.paymentSource ?? "PAYMENT_LINK",
            status: "PENDING", // başarı onayı sağlayıcı mutabakatına bırakılır
          },
        });
      }

      // 5) Gönderi → kayıt bağlantısı — @unique: yarışta P2002 fırlar → TÜM tx geri alınır
      await tx.formSubmission.update({
        where: { id: submission.id },
        data: { registrationId: registration.id },
      });

      await tx.activityLog.create({
        data: {
          tenantId: edition.tenantId,
          editionId: edition.id,
          type: ActivityType.REGISTRATION_SAVED,
          message: `Online kayıt oluşturuldu: ${submission.respondentName} (${registration.confirmationNo})`,
          entityType: "Registration",
          entityId: registration.id,
          actorName: "Form Merkezi",
        },
      });

      return { registration, order, payment, person, participation, existing: false };
    }, { timeout: 20_000, maxWait: 10_000 }); // eşzamanlı onay yarışı: yazım kilit beklemesi tx zaman aşımına düşmeden çözülür
  } catch (e) {
    // Idempotent-retry sözleşmesi: başarısızlık türünden bağımsız (P2002 unique yarışı,
    // tx kilidi/zaman aşımı vb.) önce gönderi defteri kontrol edilir — zincir bu ara
    // duruma kadar kalıcılaştıysa mevcut zincir döndürülür; tx tamamen geri alındıysa
    // submission.registrationId hâlâ boştur ve gerçek hata yeniden fırlatılır.
    const again = await db.formSubmission.findUnique({ where: { id: submission.id }, select: { registrationId: true } });
    if (again?.registrationId) return readExistingChain(again.registrationId, submission.editionId);
    throw e;
  }
}

// mevcut zinciri oku (idempotent dönüş) — ham ORM kayıtları DAHİLİ kullanım içindir;
// herkese açık yanıtlar public-register DTO'suyla izin-listeye düşürülür.
async function readExistingChain(registrationId: string, editionId: string): Promise<ChainResult> {
  const registration = await db.registration.findUnique({
    where: { id: registrationId },
    include: { category: true, participation: { include: { person: true } } },
  });
  const order = registration
    ? await db.order.findFirst({ where: { editionId, notes: { contains: registration.confirmationNo } } })
    : null;
  return { registration, order, payment: null, person: null, participation: null, existing: true };
}

// Gönderi reddedilir/spam işaretlenirse bağlı kaydı iptal et (veri tutarlılığı)
export async function cancelRegistrationOfSubmission(submissionId: string, reason: string): Promise<void> {
  const submission = await db.formSubmission.findUnique({ where: { id: submissionId } });
  if (!submission?.registrationId) return;
  const registration = await db.registration.findUnique({ where: { id: submission.registrationId } });
  if (!registration || ["CANCELLED", "REJECTED"].includes(registration.status)) return;
  await db.registration.update({
    where: { id: registration.id },
    data: { status: "CANCELLED", cancelReason: reason },
  });
  await db.activityLog.create({
    data: {
      tenantId: (await db.eventEdition.findUnique({ where: { id: registration.editionId } }))?.tenantId ?? "",
      editionId: registration.editionId,
      type: ActivityType.REGISTRATION_CANCELLED,
      message: `Form gönderisi ${reason.toLowerCase()} — kayıt iptal: ${registration.confirmationNo}`,
      entityType: "Registration",
      entityId: registration.id,
      actorName: "Form Merkezi",
    },
  });
}
