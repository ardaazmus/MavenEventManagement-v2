// ─── P14.2: İhracat rıza filtresi + KVKK denetim kaydı ─────────────────────────
// Kişi bağlantılı exportlar rızasız kişiyi dışarıda bırakır (consentVersion
// yoksa satır yok). HER export bir denetim kaydı yazar (tip + sayı + aktör).
export function personConsentWhere(): { consentVersion: { not: null } } {
  return { consentVersion: { not: null } };
}

export type ExportType =
  | "REGISTRATIONS"
  | "RESERVATIONS"
  | "CUSTOMER_CONTACTS"
  | "FORM_SUBMISSIONS"
  | "ACCOUNTING"
  | "MEDIA"
  | "LEADS"
  | "ANALYTICS"
  | "COMPANY_SNAPSHOT";

export interface ExportAuditPrisma {
  activityLog: {
    create: (args: never) => Promise<unknown>;
  };
}

type CreateFn = (args: { data: Record<string, unknown> }) => Promise<unknown>;

export interface LogExportInput {
  tenantId: string | null;
  editionId: string | null;
  type: ExportType;
  count: number;
  actorName: string | null;
}

export async function logExport(prisma: ExportAuditPrisma, input: LogExportInput): Promise<void> {
  const create = prisma.activityLog.create as unknown as CreateFn;
  await create({
    data: {
      type: "EXPORT_DOWNLOADED",
      message: `Dışa aktarım: ${input.type} (${input.count} satır)`,
      tenantId: input.tenantId,
      editionId: input.editionId,
      entityType: "Export",
      actorName: input.actorName ?? "Bilinmeyen",
    },
  });
}
