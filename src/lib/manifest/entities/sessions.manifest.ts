import type { DomainEntityManifest } from "../types";

export const SessionManifest: DomainEntityManifest = {
  id: "sessions",
  name: "Program & Oturumlar",
  tableName: "ProgramSession",
  dependsOn: ["editions", "halls"],
  impacts: ["speakers", "attendees", "portal", "onsite"],
  eventsEmitted: ["session.scheduled", "session.conflict_detected"],
  eventsSubscribed: [],
  fields: {
    title: {
      key: "title",
      label: "Oturum Başlığı",
      type: "text",
      required: true,
      synonyms: ["session title", "oturum", "baslik", "konu"],
    },
    roomId: {
      key: "roomId",
      label: "Salon",
      type: "relation",
      targetEntity: "Hall",
      required: true,
      synonyms: ["hall", "salon", "oda", "room"],
    },
    startTime: {
      key: "startTime",
      label: "Başlangıç Zamanı",
      type: "date",
      required: true,
      synonyms: ["start", "baslangic", "saat"],
    },
    endTime: {
      key: "endTime",
      label: "Bitiş Zamanı",
      type: "date",
      required: true,
      synonyms: ["end", "bitis"],
    },
    track: {
      key: "track",
      label: "Tematik Akış (Track)",
      type: "text",
      synonyms: ["tema", "track", "alan"],
    },
  },
  ui: {
    primaryView: "src/components/maven/views/scientific.tsx",
    supportsInlineGrid: true,
    supportsBulkPaste: false,
    supportsQuickAdd: true,
    supportsTimetableGrid: true,
  },
};
