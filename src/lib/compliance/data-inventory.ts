// ─── P18.1: Veri envanteri — model → amaç → hukuki dayanak → saklama → silme ──
// KVKK m.4 (amaçla bağlılık, ölçülülük) + m.7 (silme/yok etme/anonimleştirme)
// için makine-okunur kayıt. Her kişisel-veri taşıyan model burada listelenir;
// test kapsamı kilitler (yeni PII modeli eklenirse envanter + test büyür).
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.

export interface InventoryEntry {
  model: string;
  piiFields: string[];
  purpose: string;
  legalBasis: string;
  retentionDays: number | null; // null = süresiz yasal saklama (gerekçeli)
  retentionNote: string;
  deletionMethod: "ANONYMIZE" | "DELETE" | "ARCHIVE_THEN_DELETE";
}

export const DATA_INVENTORY: InventoryEntry[] = [
  {
    model: "Person",
    piiFields: ["firstName", "lastName", "email", "phone", "photoUrl", "bio", "linkedin", "city"],
    purpose: "Katılımcı kimliği ve iletişim",
    legalBasis: "KVKK m.5/2-c (sözleşmenin kurulması/ifası) + açık rıza (iletişim)",
    retentionDays: null,
    retentionNote: "Yasal saklama süresince tombstone; silme talebinde anonimleştirme (P18.4)",
    deletionMethod: "ANONYMIZE",
  },
  {
    model: "EventParticipation",
    piiFields: ["notes"],
    purpose: "Etkinlik katılımı ve yoklama",
    legalBasis: "KVKK m.5/2-c (sözleşme) + m.5/2-f (meşru menfaat: etkinlik güvenliği)",
    retentionDays: 2555,
    retentionNote: "7 yıl etkinlik kaydı; kişi silmede katılım satırı korunur, kişi tombstone olur",
    deletionMethod: "ARCHIVE_THEN_DELETE",
  },
  {
    model: "Registration",
    piiFields: ["confirmationNo"],
    purpose: "Kayıt ve onay akışı",
    legalBasis: "KVKK m.5/2-c (sözleşme)",
    retentionDays: 2555,
    retentionNote: "Katılım kaydıyla birlikte 7 yıl",
    deletionMethod: "ARCHIVE_THEN_DELETE",
  },
  {
    model: "Order",
    piiFields: ["payerName"],
    purpose: "Tahsilat ve faturalama",
    legalBasis: "VUK m.253 (10 yıl belge saklama) + KVKK m.5/2-ç (hukuki yükümlülük)",
    retentionDays: 3650,
    retentionNote: "10 yıl mali saklama; erken silinemez (legal hold)",
    deletionMethod: "ARCHIVE_THEN_DELETE",
  },
  {
    model: "Payment",
    piiFields: ["reference"],
    purpose: "Ödeme kanıtı",
    legalBasis: "VUK m.253 + KVKK m.5/2-ç",
    retentionDays: 3650,
    retentionNote: "Siparişle birlikte 10 yıl",
    deletionMethod: "ARCHIVE_THEN_DELETE",
  },
  {
    model: "CustomerContact",
    piiFields: ["displayName", "email", "phone", "company", "title", "city"],
    purpose: "Ticari iletişim havuzu",
    legalBasis: "Açık rıza (KVKK m.5/1) + İYS onayı (6563 s.k.)",
    retentionDays: 1095,
    retentionNote: "Rıza geri çekilince iletişim durur; kayıt 3 yıl kanıt saklanır",
    deletionMethod: "DELETE",
  },
  {
    model: "ContactConsent",
    piiFields: ["address"],
    purpose: "Rıza kanıtı",
    legalBasis: "KVKK m.5/1 ispat yükü + İYS mevzuatı",
    retentionDays: 1095,
    retentionNote: "Geri çekmeden sonra 3 yıl kanıt",
    deletionMethod: "DELETE",
  },
  {
    model: "SendDecision",
    piiFields: ["recipient"],
    purpose: "Gönderim denetimi",
    legalBasis: "KVKK m.12 (veri güvenliği kayıtları) + meşru menfaat",
    retentionDays: 1095,
    retentionNote: "3 yıl değişmez denetim",
    deletionMethod: "ARCHIVE_THEN_DELETE",
  },
  {
    model: "MailSuppression",
    piiFields: ["email"],
    purpose: "Göndermeme listesi (güvenli çıkış)",
    legalBasis: "KVKK m.4 + 6563 s.k. (ret beyanı saklanır)",
    retentionDays: null,
    retentionNote: "Süresiz — silinmesi yeniden gönderime yol açar (kara liste istisnası)",
    deletionMethod: "ANONYMIZE",
  },
  {
    model: "MediaAsset",
    piiFields: ["dataUrl", "externalUrl", "thumbDataUrl"],
    purpose: "Etkinlik medyası (katılımcı fotoğrafları dahil)",
    legalBasis: "Açık rıza (görüntü) + sözleşme",
    retentionDays: 1825,
    retentionNote: "5 yıl; silme talebinde kişinin medyaları kaldırılır",
    deletionMethod: "DELETE",
  },
  {
    model: "FormAnswer",
    piiFields: ["value"],
    purpose: "Form yanıtları",
    legalBasis: "KVKK m.5/2-c + açık rıza (özel nitelikliyse m.6)",
    retentionDays: 1825,
    retentionNote: "5 yıl; kişi silmede yanıtlar anonimleştirilir",
    deletionMethod: "ANONYMIZE",
  },
  {
    model: "ScanEvent",
    piiFields: [],
    purpose: "Saha giriş-çıkış izleri",
    legalBasis: "Meşru menfaat (etkinlik güvenliği)",
    retentionDays: 365,
    retentionNote: "1 yıl sonra toplulaştırılıp silinir",
    deletionMethod: "DELETE",
  },
  {
    model: "Reservation",
    piiFields: [],
    purpose: "Konaklama tahsisi",
    legalBasis: "KVKK m.5/2-c (sözleşme)",
    retentionDays: 1825,
    retentionNote: "Katılım kaydıyla birlikte 5 yıl",
    deletionMethod: "ARCHIVE_THEN_DELETE",
  },
  {
    model: "BadgeInstance",
    piiFields: [],
    purpose: "Yaka kartı basım izi",
    legalBasis: "Meşru menfaat",
    retentionDays: 365,
    retentionNote: "1 yıl",
    deletionMethod: "DELETE",
  },
  {
    model: "CertificateIssue",
    piiFields: [],
    purpose: "Sertifika tescili",
    legalBasis: "Hukuki yükümlülük (belge gerçekliği)",
    retentionDays: null,
    retentionNote: "Süresiz tescil (ad-soyad sertifika üstünde kalır; itirazda şerh düşülür)",
    deletionMethod: "ARCHIVE_THEN_DELETE",
  },
  {
    model: "KvkkErasureRequest",
    piiFields: ["email"],
    purpose: "Silme talebi takibi",
    legalBasis: "KVKK m.11/13 (başvuru yükümlülüğü)",
    retentionDays: 1095,
    retentionNote: "3 yıl başvuru kanıtı",
    deletionMethod: "DELETE",
  },
  {
    model: "ActivityLog",
    piiFields: ["actorName", "message"],
    purpose: "İşlem günlüğü",
    legalBasis: "KVKK m.12 + meşru menfaat",
    retentionDays: 1095,
    retentionNote: "3 yıl; kişi silmede ad maskelenir",
    deletionMethod: "ANONYMIZE",
  },
  {
    model: "User",
    piiFields: ["email", "name"],
    purpose: "Personel hesabı",
    legalBasis: "Sözleşme + hukuki yükümlülük (5651/İş K.)",
    retentionDays: 730,
    retentionNote: "İşten ayrılmadan 2 yıl sonra anonimleştirme",
    deletionMethod: "ANONYMIZE",
  },
];

export function inventoryByModel(model: string): InventoryEntry | null {
  return DATA_INVENTORY.find((e) => e.model === model) ?? null;
}

export function modelsByDeletionMethod(method: InventoryEntry["deletionMethod"]): string[] {
  return DATA_INVENTORY.filter((e) => e.deletionMethod === method).map((e) => e.model);
}

export function validateInventory(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of DATA_INVENTORY) {
    if (seen.has(e.model)) problems.push(`yinelenen model: ${e.model}`);
    seen.add(e.model);
    if (!e.purpose || !e.legalBasis || !e.retentionNote) problems.push(`eksik alan: ${e.model}`);
    if (e.retentionDays !== null && (e.retentionDays <= 0 || e.retentionDays > 36500)) {
      problems.push(`geçersiz saklama: ${e.model} (${e.retentionDays})`);
    }
    if (!["ANONYMIZE", "DELETE", "ARCHIVE_THEN_DELETE"].includes(e.deletionMethod)) {
      problems.push(`geçersiz silme yöntemi: ${e.model}`);
    }
  }
  return problems;
}
