import type { DomainEntityManifest } from "../types";

export const RegistrationManifest: DomainEntityManifest = {
  id: "registrations",
  name: "Kayıt Yönetimi",
  tableName: "Registration",
  dependsOn: ["people", "editions", "tickets"],
  impacts: ["badges", "accounting", "accommodation", "onsite", "portal"],
  eventsEmitted: ["registration.created", "registration.confirmed", "registration.cancelled"],
  eventsSubscribed: ["payment.received"],
  statusAxes: {
    registrationStatus: {
      label: "Kayıt Durumu",
      states: ["DRAFT", "PENDING_APPROVAL", "CONFIRMED", "WAITLISTED", "CANCELLED", "DENIED"],
      defaultState: "DRAFT",
    },
    paymentStatus: {
      label: "Ödeme Durumu",
      states: ["NO_BALANCE", "PAID", "PARTIALLY_PAID", "PENDING_INVOICE", "OVERPAID", "REFUNDED"],
      defaultState: "NO_BALANCE",
    },
    attendanceStatus: {
      label: "Katılım Durumu",
      states: ["NOT_ARRIVED", "CHECKED_IN", "CHECKED_OUT", "NO_SHOW"],
      defaultState: "NOT_ARRIVED",
    },
  },
  fields: {
    registrationNumber: {
      key: "registrationNumber",
      label: "Kayıt No",
      type: "text",
      required: true,
      synonyms: ["reg no", "registration number", "kayit no", "onay no", "ticket no"],
    },
    personId: {
      key: "personId",
      label: "Kişi",
      type: "relation",
      targetEntity: "Person",
      required: true,
      synonyms: ["katilimci", "attendee", "delegate", "delege", "kisi", "name"],
    },
    ticketTypeId: {
      key: "ticketTypeId",
      label: "Bilet Tipi",
      type: "relation",
      targetEntity: "TicketType",
      required: true,
      synonyms: ["bilet", "ticket", "pass", "badge category", "kategori"],
    },
    agencyGroupId: {
      key: "agencyGroupId",
      label: "Acente Grubu",
      type: "relation",
      targetEntity: "AgencyGroup",
      synonyms: ["acente", "agency", "group", "grup", "kurum"],
    },
  },
  ui: {
    primaryView: "src/components/maven/views/registrations.tsx",
    supportsInlineGrid: true,
    supportsBulkPaste: true,
    supportsQuickAdd: true,
  },
};
