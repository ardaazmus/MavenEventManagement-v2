import type { DomainEntityManifest } from "../types";

export const AccountingManifest: DomainEntityManifest = {
  id: "accounting",
  name: "Muhasebe & Fiş Defteri",
  tableName: "ExpenseRecord",
  dependsOn: ["editions", "organizations"],
  impacts: ["finance", "dashboard"],
  eventsEmitted: [],
  eventsSubscribed: ["payment.received"],
  fields: {
    description: {
      key: "description",
      label: "Açıklama / Fiş Detayı",
      type: "text",
      required: true,
      synonyms: ["aciklama", "detay", "description", "item"],
    },
    category: {
      key: "category",
      label: "Kategori",
      type: "select",
      options: ["VENUE", "CATERING", "AV_TECH", "PRINTING", "TRANSFER", "ACCOMMODATION", "OTHER"],
      required: true,
      synonyms: ["kategori", "tur", "kalem"],
    },
    amount: {
      key: "amount",
      label: "Tutar",
      type: "number",
      required: true,
      synonyms: ["tutar", "fiyat", "amount", "bedel", "ucret"],
    },
    currency: {
      key: "currency",
      label: "Para Birimi",
      type: "select",
      options: ["TRY", "USD", "EUR"],
      required: true,
      synonyms: ["doviz", "para birimi", "currency"],
    },
    receiptNo: {
      key: "receiptNo",
      label: "Fatura / Fiş No",
      type: "text",
      synonyms: ["fatura no", "fis no", "invoice no", "receipt"],
    },
  },
  ui: {
    primaryView: "src/components/maven/views/accounting.tsx",
    supportsInlineGrid: true,
    supportsBulkPaste: true,
    supportsQuickAdd: true,
  },
};
