// ─── Kademeli Etkinlik Kurulum Rehberi / Setup Checklist (F-07) ───────────
// Hızlı taslak oluşturma sonrasında, edisyonun hazırlık adımlarını kademeli
// olarak değerlendiren ve yönlendiren merkezi hesaplama motoru.

export type ChecklistStepKey =
  | "BASICS"
  | "STAKEHOLDER"
  | "STAFF"
  | "REGISTRATION"
  | "PROGRAM"
  | "PORTAL"
  | "PUBLISH";

export type ChecklistStepStatus = "COMPLETED" | "PENDING" | "OPTIONAL";

export interface ChecklistStep {
  key: ChecklistStepKey;
  title: string;
  description: string;
  status: ChecklistStepStatus;
  isRequired: boolean;
  targetModule: string;
  actionLabel: string;
  detail?: string;
}

export interface SetupChecklistRawData {
  edition: {
    id: string;
    name: string;
    description?: string | null;
    logoUrl?: string | null;
    headerImageUrl?: string | null;
    portalHeaderTitle?: string | null;
    portalHeaderImageUrl?: string | null;
    isPublished: boolean;
  };
  stakeholderCount: number;
  staffCount: number;
  categoryCount: number;
  sessionCount: number;
  blockersCount: number;
}

export interface SetupChecklistResult {
  editionId: string;
  editionName: string;
  completionPct: number;
  completedStepsCount: number;
  totalRequiredStepsCount: number;
  isReadyForPublish: boolean;
  isPublished: boolean;
  nextStep: ChecklistStep | null;
  steps: ChecklistStep[];
}

/**
 * Verilen durum verilerine göre kurulum rehberi adımlarını değerlendiren saf işlev.
 */
export function evaluateSetupChecklist(data: SetupChecklistRawData): SetupChecklistResult {
  const { edition, stakeholderCount, staffCount, categoryCount, sessionCount, blockersCount } = data;

  const isBasicsDone = Boolean(
    edition.logoUrl ||
    edition.headerImageUrl ||
    (edition.description && edition.description.trim().length > 10)
  );

  const isStakeholderDone = stakeholderCount > 0;
  const isStaffDone = staffCount > 0;
  const isRegDone = categoryCount > 0;
  const isProgramDone = sessionCount > 0;
  const isPortalDone = Boolean(edition.portalHeaderTitle || edition.portalHeaderImageUrl);
  const isPublishDone = edition.isPublished;

  const steps: ChecklistStep[] = [
    {
      key: "BASICS",
      title: "Temel Künye & Görseller",
      description: "Etkinlik logosu, başlık görseli ve kısa açıklamasını ekleyin.",
      status: isBasicsDone ? "COMPLETED" : "PENDING",
      isRequired: true,
      targetModule: "editions",
      actionLabel: isBasicsDone ? "Görselleri İncele" : "Görsel ve Açıklama Ekle",
      detail: isBasicsDone ? "Logo veya açıklama mevcut" : "Henüz logo veya detaylı açıklama girilmedi",
    },
    {
      key: "STAKEHOLDER",
      title: "Müşteri / Düzenleyen Kurum",
      description: "Etkinliğin adına düzenlendiği müşteri kurumu veya derneği atayın.",
      status: isStakeholderDone ? "COMPLETED" : "PENDING",
      isRequired: true,
      targetModule: "people",
      actionLabel: isStakeholderDone ? "Kurumları Yönet" : "Müşteri / Kurum Ata",
      detail: isStakeholderDone ? `${stakeholderCount} kurum rolü atandı` : "Henüz atanmış bir düzenleyici kurum yok",
    },
    {
      key: "STAFF",
      title: "Operasyon Ekibi",
      description: "Saha, kayıt ve finans operasyonunu yürütecek ekip rollerini tanımlayın.",
      status: isStaffDone ? "COMPLETED" : "PENDING",
      isRequired: true,
      targetModule: "team",
      actionLabel: isStaffDone ? "Ekibi İncele" : "Ekip Rollerini Ata",
      detail: isStaffDone ? `${staffCount} ekip üyesi veya yönetici hazır` : "Etkinliğe özel personel atanmadı",
    },
    {
      key: "REGISTRATION",
      title: "Kayıt Kategorileri",
      description: "Katılımcıların kaydolabileceği en az bir bilet veya kayıt kategorisi tanımlayın.",
      status: isRegDone ? "COMPLETED" : "PENDING",
      isRequired: true,
      targetModule: "registrations",
      actionLabel: isRegDone ? "Kategorileri Düzenle" : "Kayıt Kategorisi Ekle",
      detail: isRegDone ? `${categoryCount} kayıt kategorisi aktif` : "Kayıt kategorisi bulunmuyor",
    },
    {
      key: "PROGRAM",
      title: "Program & Oturumlar",
      description: "Etkinlik salonlarını ve temel oturum akışını taslak olarak planlayın.",
      status: isProgramDone ? "COMPLETED" : "OPTIONAL",
      isRequired: false,
      targetModule: "program",
      actionLabel: isProgramDone ? "Programı Gör" : "Oturum Ekle",
      detail: isProgramDone ? `${sessionCount} oturum planlandı` : "İsteğe bağlı: henüz oturum girilmedi",
    },
    {
      key: "PORTAL",
      title: "Dış Portal Tasarımı",
      description: "Katılımcı dış portalı için başlık, renk ve kapak görselini özelleştirin.",
      status: isPortalDone ? "COMPLETED" : "OPTIONAL",
      isRequired: false,
      targetModule: "portals",
      actionLabel: isPortalDone ? "Portalı Düzenle" : "Portalı Özelleştir",
      detail: isPortalDone ? "Özel portal başlığı veya görseli mevcut" : "Varsayılan portal teması kullanılıyor",
    },
    {
      key: "PUBLISH",
      title: "Yayınlama & Canlıya Alma",
      description: "Yayın ön kontrolünü tamamlayın ve dış kayıtları/erişimi açın.",
      status: isPublishDone ? "COMPLETED" : "PENDING",
      isRequired: true,
      targetModule: "editions",
      actionLabel: isPublishDone ? "Yayında" : blockersCount === 0 ? "Yayına Al" : "Engelleri İncele",
      detail: isPublishDone
        ? "Etkinlik canlıda ve kayıtlara açık"
        : blockersCount === 0
          ? "Tüm ön kontroller geçti — yayına hazır"
          : `${blockersCount} kritik yayın engeli var`,
    },
  ];

  const requiredSteps = steps.filter((s) => s.isRequired);
  const completedRequiredSteps = requiredSteps.filter((s) => s.status === "COMPLETED");
  const completionPct = Math.round((completedRequiredSteps.length / requiredSteps.length) * 100);

  const nextStep = requiredSteps.find((s) => s.status !== "COMPLETED") ?? null;
  const isReadyForPublish = blockersCount === 0 && !isPublishDone && completionPct >= 80;

  return {
    editionId: edition.id,
    editionName: edition.name,
    completionPct,
    completedStepsCount: completedRequiredSteps.length,
    totalRequiredStepsCount: requiredSteps.length,
    isReadyForPublish,
    isPublished: isPublishDone,
    nextStep,
    steps,
  };
}

/**
 * Lazy prisma çözümleyici — Node test ortamında static ESM yükleme hatalarını önler.
 */
async function resolvePrisma(prismaOverride?: unknown) {
  if (prismaOverride) return prismaOverride;
  const { db } = await import("@/lib/db");
  return db;
}

/**
 * Edisyonun veritabanındaki durumunu sorgulayıp kurulum rehberi özetini üretir.
 */
export async function computeEditionSetupChecklist(
  editionId: string,
  prismaOverride?: unknown
): Promise<SetupChecklistResult> {
  const prisma = (await resolvePrisma(prismaOverride)) as {
    eventEdition: {
      findUnique: (args: { where: { id: string }; select: Record<string, boolean> }) => Promise<{
        id: string;
        name: string;
        description: string | null;
        logoUrl: string | null;
        headerImageUrl: string | null;
        portalHeaderTitle: string | null;
        portalHeaderImageUrl: string | null;
        isPublished: boolean;
      } | null>;
    };
    eventOrganizationAssignment: { count: (args: { where: { editionId: string } }) => Promise<number> };
    userRoleAssignment: {
      count: (args: { where: { scopeKey?: string | { in: string[] } } }) => Promise<number>;
    };
    registrationCategory: { count: (args: { where: { editionId: string } }) => Promise<number> };
    programSession: { count: (args: { where: { editionId: string } }) => Promise<number> };
  };

  const edition = await prisma.eventEdition.findUnique({
    where: { id: editionId },
    select: {
      id: true,
      name: true,
      description: true,
      logoUrl: true,
      headerImageUrl: true,
      portalHeaderTitle: true,
      portalHeaderImageUrl: true,
      isPublished: true,
    },
  });

  if (!edition) {
    throw new Error("Etkinlik bulunamadı");
  }

  const [stakeholderCount, staffCount, categoryCount, sessionCount] = await Promise.all([
    prisma.eventOrganizationAssignment.count({ where: { editionId } }),
    prisma.userRoleAssignment.count({ where: { scopeKey: { in: [editionId, "TENANT"] } } }),
    prisma.registrationCategory.count({ where: { editionId } }),
    prisma.programSession.count({ where: { editionId } }),
  ]);

  const rawData: SetupChecklistRawData = {
    edition,
    stakeholderCount,
    staffCount,
    categoryCount,
    sessionCount,
    blockersCount: categoryCount === 0 ? 1 : 0, // temel yayın engeli
  };

  return evaluateSetupChecklist(rawData);
}
