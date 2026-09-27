import type { DomainEntityManifest } from "../types";

export const BoothManifest: DomainEntityManifest = {
  id: "floors",
  name: "Fuar & Kat Planı",
  tableName: "Booth",
  dependsOn: ["editions", "organizations"],
  impacts: ["sponsorship", "operations", "portal"],
  eventsEmitted: ["booth.held", "booth.confirmed", "booth.released"],
  eventsSubscribed: [],
  fields: {
    boothNumber: {
      key: "boothNumber",
      label: "Stant No",
      type: "text",
      required: true,
      synonyms: ["booth no", "stand no", "numara"],
    },
    organizationId: {
      key: "organizationId",
      label: "Kiralayan Firma",
      type: "relation",
      targetEntity: "Organization",
      synonyms: ["company", "exhibitor", "firma", "katilimci firma"],
    },
    areaSqMeters: {
      key: "areaSqMeters",
      label: "Alan (m²)",
      type: "number",
      required: true,
      synonyms: ["area", "m2", "metrekare", "size"],
    },
    powerKw: {
      key: "powerKw",
      label: "Elektrik İhtiyacı (kW)",
      type: "number",
      synonyms: ["power", "elektrik", "kw", "enerji"],
    },
    status: {
      key: "status",
      label: "Stant Durumu",
      type: "select",
      options: ["AVAILABLE", "HELD", "RESERVED", "SOLD"],
      synonyms: ["state", "durum"],
    },
  },
  ui: {
    primaryView: "src/components/maven/views/floors.tsx",
    supportsInlineGrid: true,
    supportsBulkPaste: false,
    supportsQuickAdd: true,
    supportsSvgFloorPlan: true,
  },
};
