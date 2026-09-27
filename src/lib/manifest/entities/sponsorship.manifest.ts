import type { DomainEntityManifest } from "../types";

export const SponsorshipManifest: DomainEntityManifest = {
  id: "sponsorship",
  name: "Sponsorluk & Satış Boru Hattı",
  tableName: "SponsorAgreement",
  dependsOn: ["editions", "organizations"],
  impacts: ["accounting", "floors", "portal"],
  eventsEmitted: [],
  eventsSubscribed: ["payment.received"],
  fields: {
    organizationId: {
      key: "organizationId",
      label: "Sponsor Firma",
      type: "relation",
      targetEntity: "Organization",
      required: true,
      synonyms: ["company", "firma", "sponsor"],
    },
    tier: {
      key: "tier",
      label: "Sponsorluk Paketi",
      type: "select",
      options: ["DIAMOND", "PLATINUM", "GOLD", "SILVER", "BRONZE", "SESSION_SPONSOR"],
      required: true,
      synonyms: ["paket", "tier", "seviye"],
    },
    stage: {
      key: "stage",
      label: "Aşama (Kanban)",
      type: "select",
      options: ["LEAD", "PROPOSAL", "NEGOTIATION", "CONTRACTED", "PAID"],
      required: true,
      synonyms: ["asama", "stage", "status", "durum"],
    },
    amount: {
      key: "amount",
      label: "Sözleşme Bedeli",
      type: "number",
      required: true,
      synonyms: ["tutar", "bedel", "amount", "fiyat"],
    },
  },
  ui: {
    primaryView: "src/components/maven/views/sponsorship.tsx",
    supportsInlineGrid: true,
    supportsBulkPaste: false,
    supportsQuickAdd: true,
    supportsKanbanBoard: true,
  },
};
