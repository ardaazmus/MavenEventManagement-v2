// ============================================================================
// MAVEN EVENT MANAGEMENT — DOMAIN MANIFEST TYPES (§4.2)
// Declarative Metadata Contracts for Entities, Impact Analysis & Dynamic UI
// ============================================================================

import type { DomainEventMap } from "../events/domain-event-bus";

export interface FieldDefinition {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "select" | "relation" | "multiselect" | "textarea" | "url";
  required?: boolean;
  options?: string[];
  targetEntity?: string;           // relation tipi için hedef varlık
  synonyms?: string[];             // Fuzzy clipboard eşleme için eş anlamlılar
  validationRules?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;              // Regex deseni
    min?: number;
    max?: number;
  };
  visibilityRules?: Array<{        // Koşullu görünürlük kuralları
    field: string;
    operator: "equals" | "not_equals" | "in" | "not_in" | "gt" | "lt";
    value: unknown;
  }>;
}

export interface DomainEntityManifest {
  id: string;
  name: string;
  tableName: string;
  dependsOn: string[];             // Çalışması için gereken üst modüller
  impacts: string[];               // Değiştiğinde etki alanına giren modüller
  eventsEmitted: (keyof DomainEventMap)[];
  eventsSubscribed: (keyof DomainEventMap)[];
  fields: Record<string, FieldDefinition>;
  statusAxes?: {                   // Çoklu-eksen durum tanımları (Cvent modeli)
    [axisName: string]: {
      label: string;
      states: string[];
      defaultState: string;
    };
  };
  ui: {
    primaryView: string;
    supportsInlineGrid: boolean;
    supportsBulkPaste: boolean;
    supportsQuickAdd: boolean;
    supportsTimetableGrid?: boolean;   // Zaman×Salon matrisi
    supportsSvgFloorPlan?: boolean;    // SVG kat planı
    supportsRoomingMatrix?: boolean;   // Rooming list matrisi
    supportsKanbanBoard?: boolean;     // Kanban boru hattı
  };
}
