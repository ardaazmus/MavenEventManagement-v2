import type { DomainEntityManifest } from "../types";

export const PeopleManifest: DomainEntityManifest = {
  id: "people",
  name: "Kişiler & CRM",
  tableName: "Person",
  dependsOn: ["tenants"],
  impacts: ["registrations", "scientific", "accommodation", "badges", "onsite"],
  eventsEmitted: [],
  eventsSubscribed: [],
  fields: {
    firstName: {
      key: "firstName",
      label: "Ad",
      type: "text",
      required: true,
      synonyms: ["first name", "name", "isim", "ad", "given name"],
    },
    lastName: {
      key: "lastName",
      label: "Soyad",
      type: "text",
      required: true,
      synonyms: ["last name", "surname", "soyisim", "soyad", "family name"],
    },
    email: {
      key: "email",
      label: "E-posta",
      type: "text",
      required: true,
      synonyms: ["e-mail", "mail", "eposta", "email address", "iletisim eposta"],
    },
    phone: {
      key: "phone",
      label: "Telefon",
      type: "text",
      synonyms: ["gsm", "tel", "telefon", "mobile", "phone number"],
    },
    company: {
      key: "company",
      label: "Kurum / Şirket",
      type: "text",
      synonyms: ["organisation", "organization", "kurum", "sirket", "firma", "hastane", "universite"],
    },
    title: {
      key: "title",
      label: "Ünvan",
      type: "text",
      synonyms: ["unvan", "job title", "position", "gorev", "akademik unvan"],
    },
  },
  ui: {
    primaryView: "src/components/maven/views/people.tsx",
    supportsInlineGrid: true,
    supportsBulkPaste: true,
    supportsQuickAdd: true,
  },
};
