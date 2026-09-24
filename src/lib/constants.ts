// Maven Event Management — Durum eksenleri ve modül sabitleri
// Kaynak: Ortak Organizasyonel Mimari §10 (çok eksenli durum modeli), §6 (capabilities), §53 (menü)

// ─── Durum eksenleri (§10) — birbirine karıştırılmayan eksenler ────────────

export const REGISTRATION_STATUS = {
  DRAFT: "Taslak",
  SUBMITTED: "Gönderildi",
  PENDING_APPROVAL: "Onay bekliyor",
  CONFIRMED: "Onaylandı",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal",
} as const;

// Bekleme listesi (kategori bazlı otomatik teklif motoru)
export const WAITLIST_STATUS = {
  WAITING: "Bekliyor",
  OFFERED: "Teklif verildi",
  CONVERTED: "Kayda dönüştü",
  DECLINED: "Teklifi reddetti",
  EXPIRED: "Süresi doldu",
  CANCELLED: "Çıkarıldı",
} as const;

export const WAITLIST_OFFER_HOURS = 48;

export const PAYMENT_STATUS = {
  NOT_REQUIRED: "Gerekmez",
  PENDING: "Bekliyor",
  PARTIALLY_PAID: "Kısmi",
  PAID: "Ödendi",
  FAILED: "Başarısız",
  PARTIALLY_REFUNDED: "Kısmi iade",
  REFUNDED: "İade",
} as const;

export const ATTENDANCE_STATUS = {
  NOT_ARRIVED: "Gelmedi",
  CHECKED_IN: "Giriş yaptı",
  CHECKED_OUT: "Çıkış yaptı",
  NO_SHOW: "No-show",
} as const;

export const BADGE_STATUS = {
  NOT_ELIGIBLE: "Uygun değil",
  READY: "Hazır",
  ISSUED: "Verildi",
  PRINTED: "Basıldı",
  REPRINTED: "Yeniden basıldı",
  VOID: "Geçersiz",
} as const;

export const CERTIFICATE_STATUS = {
  NOT_ELIGIBLE: "Uygun değil",
  ELIGIBLE: "Uygun",
  GENERATED: "Oluşturuldu",
  DELIVERED: "Gönderildi",
  REVOKED: "İptal",
} as const;

export const ACCOMMODATION_STATUS = {
  NOT_REQUESTED: "Talep yok",
  REQUESTED: "Talep",
  WAITLIST: "Bekleme",
  RESERVED: "Ayrıldı",
  CONFIRMED: "Teyit",
  CHECKED_IN: "Giriş",
  CHECKED_OUT: "Çıkış",
  CANCELLED: "İptal",
} as const;

export const SUBMISSION_STATUS = {
  DRAFT: "Taslak",
  SUBMITTED: "Gönderildi",
  UNDER_REVIEW: "İncelemede",
  REVISION_REQUIRED: "Revizyon",
  ACCEPTED: "Kabul",
  REJECTED: "Ret",
  WITHDRAWN: "Çekildi",
  WAITLIST: "Yedek",
} as const;

export const SESSION_STATUS = {
  DRAFT: "Taslak",
  ASSIGNED: "Atandı",
  APPROVED: "Onaylandı",
  PUBLISHED: "Yayınlandı",
  CANCELLED: "İptal",
} as const;

export const INVITATION_STATUS = {
  INVITED: "Davetli",
  DELIVERED: "Teslim",
  RESPONSE_PENDING: "Yanıt bekliyor",
  COMING: "Gelecek",
  NOT_COMING: "Gelmeyecek",
  NO_RESPONSE: "Yanıt yok",
} as const;

export const DELIVERABLE_STATUS = {
  NOT_STARTED: "Başlamadı",
  WAITING_SPONSOR: "Sponsor bekliyor",
  SUBMITTED: "Gönderildi",
  UNDER_REVIEW: "İncelemede",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  COMPLETED: "Tamamlandı",
} as const;

export const CLAIM_STATUS = {
  RESERVED: "Ayrıldı",
  CONSUMED: "Kullanıldı",
  RELEASED: "Geri verildi",
  EXPIRED: "Süresi doldu",
} as const;

// ─── Form Merkezi (kullanıcı isteği: kayıt formu, anket, mobil interaktif) ──

export const FORM_TYPES: Record<string, string> = {
  REGISTRATION: "Kayıt Formu",
  SURVEY: "Anket",
  FEEDBACK: "Geri Bildirim",
  QA_MOBILE: "Mobil İnteraktif / QA",
  CUSTOM: "Özel Form",
};

export const FORM_TYPE_HINTS: Record<string, string> = {
  REGISTRATION: "Onay akışı, kategori fiyatı ve online ödeme ile kayıt oluşturur",
  SURVEY: "Anonim/üye anketleri — dağılım istatistikleri otomatik",
  FEEDBACK: "Oturum ve edisyon sonu memnuniyet ölçümü",
  QA_MOBILE: "Mobil uygulamada interaktif öge: NPS, rating, quiz soruları",
  CUSTOM: "Organizasyon içi ihtiyaç formları (görevliler, tedarik, vb.)",
};

export const FORM_FIELD_TYPES: Record<string, string> = {
  TEXT: "Kısa Metin",
  LONGTEXT: "Uzun Metin",
  NUMBER: "Sayı",
  EMAIL: "E-posta",
  PHONE: "Telefon",
  DATE: "Tarih",
  SINGLE_CHOICE: "Tek Seçim",
  MULTI_CHOICE: "Çok Seçim",
  CHECKBOX: "Onay Kutusu",
  COUNTRY: "Ülke",
  FILE: "Dosya",
  RATING: "Puanlama (1-5)",
  NPS: "NPS (0-10)",
  QA_QUIZ: "Quiz / QA",
  SECTION: "Bölüm Başlığı",
};

// istatistikte dağılım hesaplanan alanlar
export const CHOICE_FIELD_TYPES = ["SINGLE_CHOICE", "MULTI_CHOICE", "CHECKBOX", "RATING", "NPS"];

export const FORM_SUBMISSION_STATUS = {
  PENDING: "İnceleniyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  SPAM: "Spam",
} as const;

export const SUBMISSION_SOURCES: Record<string, string> = {
  WEB_PUBLIC: "Web (Herkese Açık)",
  KIOSK: "Kiosk / Sahada",
  MOBILE: "Mobil Uygulama",
  ADMIN: "Admin Girişi",
};

// ─── Muhasebe — gider kalemleri (kayıt muhasebesi ile entegre) ───────────────

export const EXPENSE_STATUS = {
  PLANNED: "Planlandı",
  PENDING_RECEIPT: "Fiş Bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  PAID: "Ödendi",
  REIMBURSED: "Personeline Ödendi",
} as const;

export const EXPENSE_CATEGORY: Record<string, string> = {
  FIELD_EXPENSE: "Saha Harcaması",
  VENDOR: "Tedarikçi",
  LOGISTICS: "Lojistik / Kargo",
  MARKETING: "Pazarlama",
  VENUE: "Mekân",
  TECH: "Teknoloji / AV",
  CATERING: "İkram / Catering",
  STAFF_TRAVEL: "Personel Seyahat",
  OTHER: "Diğer",
};

export const EXPENSE_PAYMENT_METHOD: Record<string, string> = {
  COMPANY_CARD: "Kurum Kartı",
  CASH: "Nakit",
  BANK_TRANSFER: "Havale / EFT",
  PERSONAL_REIMBURSE: "Personel Karşıladı",
};

export const PAYMENT_METHODS: Record<string, string> = {
  ONLINE_CARD: "Online Kart",
  BANK_TRANSFER: "Havale / EFT",
  POS: "Sahada POS",
  CASH: "Nakit",
  PAYMENT_LINK: "Ödeme Linki",
  MANUAL_EXTERNAL: "Manuel / Dış", 
};

export const ORDER_STATUS = {
  OPEN: "Açık",
  PARTIALLY_PAID: "Kısmi ödendi",
  PAID: "Ödendi",
  CANCELLED: "İptal",
} as const;

export const RESERVATION_STATUS = ACCOMMODATION_STATUS;
export const TASK_STATUS = { BACKLOG: "Havuz", TODO: "Yapılacak", IN_PROGRESS: "Devam", REVIEW: "İnceleme", DONE: "Bitti", BLOCKED: "Engelli" } as const;
export const TASK_PRIORITY = { LOW: "Düşük", MEDIUM: "Orta", HIGH: "Yüksek", URGENT: "Acil" } as const;

// ─── Sosyal Etkinlik & Tur Planı (birleşik modül) ───────────────────────────

export const SOCIAL_KINDS: Record<string, string> = {
  SOCIAL: "Sosyal Etkinlik",
  TOUR: "Tur Planı",
};

export const SOCIAL_PLAN_TYPES: Record<string, string> = {
  GALA: "Gala",
  COCKTAIL: "Kokteyl",
  OFFICIAL_DINNER: "Resmi Yemek",
  WELCOME_RECEPTION: "Ağırşama (Welcome)",
  CLOSING: "Kapanış",
  NETWORKING: "Networking",
  CULTURAL_TOUR: "Kültür Turu",
  CITY_TOUR: "Şehir Turu",
  TECHNICAL_TOUR: "Teknik Gezi",
  OTHER: "Diğer",
};

export const SOCIAL_PLAN_STATUS = {
  DRAFT: "Taslak",
  ANNOUNCED: "Duyuruldu",
  CLOSED: "Kayıt Kapandı",
  CANCELLED: "İptal",
} as const;

export const SOCIAL_ANNOUNCE_CHANNELS: Record<string, string> = {
  IN_APP: "Uygulama İçi",
  EMAIL: "E-posta",
  SMS: "SMS",
  PUSH: "Push (Mobil)",
};

export const SOCIAL_RESPONSE = {
  INVITED: "Davet Edildi",
  ACCEPTED: "Katılıyor",
  DECLINED: "Katılmıyor",
} as const;

// ─── B2B Planı ──────────────────────────────────────────────────────────────

export const B2B_PLAN_STATUS = {
  DRAFT: "Taslak",
  PENDING_APPROVAL: "Onay Bekliyor",
  ACTIVE: "Etkin (Karşılıklı Onay)",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
} as const;

export const B2B_ASSIGNMENT_STATUS = {
  ASSIGNED: "Atandı",
  ACCEPTED: "Kabul Edildi",
  DECLINED: "Reddedildi",
  COMPLETED: "Gerçekleşti",
} as const;

export const B2B_ROLES: Record<string, string> = {
  HOST: "Ev Sahibi",
  GUEST: "Misafir",
  PARTICIPANT: "Katılımcı",
};

// ─── Yetenekler (§6) — hard-code edilen event türü YOK ──────────────────────

export const CAPABILITIES = [
  { key: "REGISTRATION", label: "Kayıt", desc: "Kategoriler, formlar, onay akışı, katılımcı listesi" },
  { key: "SCIENTIFIC", label: "Bilimsel", desc: "Bildiri çağrısı, hakem, karar, poster/sunum" },
  { key: "PROGRAM", label: "Program", desc: "Oturum, salon, çakışma, kişisel program" },
  { key: "SPONSORSHIP", label: "Sponsorluk", desc: "Paket, sözleşme, haklar, teslimler" },
  { key: "EXHIBITION", label: "Fuar", desc: "Stand tahsisi, fuar alanı" },
  { key: "FLOOR_PLAN", label: "Floor Studio", desc: "Mekânsal plan, stant geometrisi (ayrı uygulama)" },
  { key: "ACCOMMODATION", label: "Konaklama", desc: "Otel, gecelik stok, rezervasyon, oda arkadaşı" },
  { key: "TRAVEL", label: "Seyahat", desc: "Transfer, tur" },
  { key: "BADGING", label: "Yaka Kartı", desc: "Yaka kartı profilleri, basım" },
  { key: "ACCESS_CONTROL", label: "Erişim", desc: "Kapılar, geçiş hakları" },
  { key: "CERTIFICATES", label: "Sertifika", desc: "Uygunluk kuralları, belge üretimi" },
  { key: "CME_CREDITS", label: "CME Kredi", desc: "Kredi defteri" },
  { key: "TOURS", label: "Tur Planı", desc: "Sosyal & teknik tur programı (Sosyal & Tur modülü ile birleşik)" },
  { key: "SOCIAL_EVENTS", label: "Sosyal & Tur Planı", desc: "Gala, kokteyl, resmi yemek ve tur planları — kişilere duyurulur" },
  { key: "B2B_MEETINGS", label: "B2B Planı", desc: "Kişiye B2B planı atama, mobil kabul, karşılıklı onay, görüş" },
  { key: "OPERATIONS", label: "Operasyon", desc: "Görev, tedarikçi, lojistik" },
  { key: "COMMUNICATIONS", label: "İletişim", desc: "Segment, kampanya, gönderim" },
] as const;

// ─── Şablonlar (§6) — yetenek seti önerileri ────────────────────────────────

export const TEMPLATES: Record<string, string[]> = {
  SCIENTIFIC_CONGRESS: ["REGISTRATION", "SCIENTIFIC", "PROGRAM", "SPONSORSHIP", "ACCOMMODATION", "BADGING", "ACCESS_CONTROL", "CERTIFICATES", "COMMUNICATIONS", "OPERATIONS"],
  TRADE_FAIR: ["REGISTRATION", "PROGRAM", "SPONSORSHIP", "EXHIBITION", "FLOOR_PLAN", "BADGING", "ACCESS_CONTROL", "COMMUNICATIONS", "OPERATIONS"],
  CORPORATE_EVENT: ["REGISTRATION", "PROGRAM", "BADGING", "ACCESS_CONTROL", "COMMUNICATIONS", "OPERATIONS"],
  CUSTOM: [],
};

// ─── Kurum event rolleri (§4) ───────────────────────────────────────────────

export const ORG_EVENT_ROLES: Record<string, string> = {
  HOST: "Ev Sahibi",
  EVENT_OWNER: "Etkinlik Sahibi",
  CLIENT: "Müşteri",
  PCO: "PCO",
  CO_ORGANIZER: "Ortak Organizatör",
  SCIENTIFIC_OWNER: "Bilimsel Sahip",
  PUBLIC_AUTHORITY: "Kamu Kurumu",
  SUPPORTER: "Destekçi",
  SPONSOR: "Sponsor",
  EXHIBITOR: "Fuarcı",
  VENUE: "Mekân",
  HOTEL: "Otel",
  SUPPLIER: "Tedarikçi",
  MEDIA_PARTNER: "Medya Partneri",
  ACADEMIC_PARTNER: "Akademik Partner",
  ASSOCIATION: "Dernek",
  WORKSHOP_SPONSOR: "Workshop Sponsoru",
};

// ─── Kişi rolleri (§11) ─────────────────────────────────────────────────────

export const EVENT_ROLES: Record<string, string> = {
  ATTENDEE: "Katılımcı",
  AUTHOR: "Yazar",
  REVIEWER: "Hakem",
  SPEAKER: "Konuşmacı",
  MODERATOR: "Moderatör",
  SESSION_CHAIR: "Oturum Başkanı",
  PANELIST: "Panelist",
  COMMITTEE_MEMBER: "Komite Üyesi",
  VIP: "VIP",
  PRESS: "Basın",
  STAFF: "Görevli",
  EXHIBITOR_STAFF: "Stand Görevlisi",
};

// ─── Kayıt kaynakları & fon kaynakları (§12) ────────────────────────────────

export const REG_SOURCES: Record<string, string> = {
  PUBLIC_FORM: "Genel Form",
  INVITATION: "Davet",
  SPONSOR_PORTAL: "Sponsor Portalı",
  EXHIBITOR_PORTAL: "Fuarcı Portalı",
  SCIENTIFIC_PORTAL: "Bilimsel Portal",
  ADMIN_ENTRY: "Admin Girişi",
  IMPORT: "İçe Aktarma",
  API: "API",
  ONSITE_WALK_IN: "Sahada Kayıt",
  GROUP_REGISTRATION: "Grup Kaydı",
  WAITLIST_PROMOTION: "Bekleme Listesi",
};

export const FUNDING_SOURCES: Record<string, string> = {
  SELF_PAID: "Kendi Ödemesi",
  ORGANIZATION_PAID: "Kurum Ödüyor",
  SPONSOR_ENTITLEMENT: "Sponsor Hakkı",
  HOST_COMPLIMENTARY: "Ev Sahibi Daveti",
  SPEAKER_ENTITLEMENT: "Konuşmacı Hakkı",
  STAFF: "Görevli",
  SCHOLARSHIP: "Burs",
  GRANT: "Hibe",
  PROMO: "Promosyon",
};

// ─── Edisyon yaşam döngüsü (§7) ─────────────────────────────────────────────

export const EDITION_STATUS: Record<string, string> = {
  OPPORTUNITY: "Fırsat",
  BID: "Teklif",
  AWARDED: "Kazanıldı",
  PLANNING: "Planlama",
  CONFIGURATION: "Kurulum",
  SALES: "Satış",
  REGISTRATION: "Kayıt",
  LOGISTICS: "Lojistik",
  PRE_EVENT: "Etkinlik Öncesi",
  ONSITE: "Canlı",
  POST_EVENT: "Etkinlik Sonrası",
  RECONCILIATION: "Mutabakat",
  ARCHIVED: "Arşiv",
};

// ─── Modül menüsü (§53) — capability kapalıysa menü görünmez ───────────────

export const MODULES = [
  { id: "dashboard", label: "Genel Bakış", icon: "LayoutDashboard", capability: null, group: "workspace" },
  { id: "editions", label: "Etkinlikler", icon: "CalendarRange", capability: null, group: "workspace" },
  { id: "portals", label: "Dış Portal", icon: "Globe", capability: null, group: "workspace" },
  { id: "people", label: "Kişiler", icon: "Users", capability: null, group: "people" },
  { id: "organizations", label: "Kurum/Kuruluşlar", icon: "Building2", capability: null, group: "people" },
  { id: "registrations", label: "Kayıt & Katılımcılar", icon: "ClipboardList", capability: "REGISTRATION", group: "edition" },
  { id: "forms", label: "Form Merkezi", icon: "FileInput", capability: null, group: "edition" },
  { id: "accounting", label: "Muhasebe", icon: "Calculator", capability: "REGISTRATION", group: "edition" },
  { id: "scientific", label: "Bilimsel", icon: "GraduationCap", capability: "SCIENTIFIC", group: "edition" },
  { id: "program", label: "Program", icon: "Clock", capability: "PROGRAM", group: "edition" },
  { id: "social", label: "Sosyal & Tur Planı", icon: "PartyPopper", capability: "SOCIAL_EVENTS", group: "edition" },
  { id: "b2b", label: "B2B Planı", icon: "Briefcase", capability: "B2B_MEETINGS", group: "edition" },
  { id: "sponsorship", label: "Sponsor & Fuar", icon: "Handshake", capability: "SPONSORSHIP", group: "edition" },
  { id: "floors", label: "Floor Studio", icon: "Map", capability: "FLOOR_PLAN", group: "edition" },
  { id: "accommodation", label: "Konaklama", icon: "BedDouble", capability: "ACCOMMODATION", group: "edition" },
  { id: "finance", label: "Ödeme & Ek Hizmet", icon: "CreditCard", capability: "REGISTRATION", group: "edition" },
  { id: "communications", label: "İletişim", icon: "Megaphone", capability: "COMMUNICATIONS", group: "edition" },
  { id: "onsite", label: "Sahada", icon: "ScanLine", capability: "BADGING", group: "edition" },
  { id: "badges", label: "Yaka Kartı Baskı", icon: "Printer", capability: "BADGING", group: "edition" },
  { id: "certificates", label: "Belgeler", icon: "Award", capability: "CERTIFICATES", group: "edition" },
  { id: "operations", label: "Operasyon", icon: "ListChecks", capability: null, group: "workspace" },
  { id: "media", label: "Medya Arşivi", icon: "FolderOpen", capability: null, group: "workspace" },
  { id: "integrations", label: "API Geçidi", icon: "PlugZap", capability: null, group: "workspace" },
  { id: "settings", label: "Ayarlar", icon: "Settings", capability: null, group: "workspace" },
] as const;

// ─── Yardımcılar ────────────────────────────────────────────────────────────

export function label(map: Record<string, string>, key?: string | null): string {
  if (!key) return "—";
  return map[key] ?? key;
}

export function fmtMoney(v: number | null | undefined, currency = "TRY"): string {
  const n = v ?? 0;
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export function fmtDate(d?: string | Date | null, withTime = false): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("tr-TR", withTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(d?: string | Date | null): string {
  return fmtDate(d, true);
}

// Durum rozet renk sınıfları (renk dışı durum işareti de var: metin + ikon)
export const STATUS_TONE: Record<string, string> = {
  // kayıt
  DRAFT: "bg-neutral-100 text-neutral-700 border-neutral-200",
  SUBMITTED: "bg-amber-50 text-amber-700 border-amber-200",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700 border-amber-200",
  CONFIRMED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
  CANCELLED: "bg-rose-50 text-rose-700 border-rose-200",
  // ödeme
  NOT_REQUIRED: "bg-sky-50 text-sky-700 border-sky-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  PARTIALLY_PAID: "bg-amber-50 text-amber-700 border-amber-200",
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-rose-50 text-rose-700 border-rose-200",
  REFUNDED: "bg-purple-50 text-purple-700 border-purple-200",
  PARTIALLY_REFUNDED: "bg-purple-50 text-purple-700 border-purple-200",
  // katılım
  NOT_ARRIVED: "bg-neutral-100 text-neutral-700 border-neutral-200",
  CHECKED_IN: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CHECKED_OUT: "bg-neutral-100 text-neutral-700 border-neutral-200",
  NO_SHOW: "bg-rose-50 text-rose-700 border-rose-200",
  // bildiri
  UNDER_REVIEW: "bg-sky-50 text-sky-700 border-sky-200",
  ACCEPTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  WITHDRAWN: "bg-neutral-100 text-neutral-500 border-neutral-200",
  WAITLIST: "bg-amber-50 text-amber-700 border-amber-200",
  REVISION_REQUIRED: "bg-amber-50 text-amber-700 border-amber-200",
  // program
  ASSIGNED: "bg-sky-50 text-sky-700 border-sky-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PUBLISHED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  // hak
  RESERVED: "bg-amber-50 text-amber-700 border-amber-200",
  CONSUMED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RELEASED: "bg-neutral-100 text-neutral-700 border-neutral-200",
  EXPIRED: "bg-rose-50 text-rose-700 border-rose-200",
  // genel
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  INACTIVE: "bg-neutral-100 text-neutral-700 border-neutral-200",
  SUCCEEDED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PROCESSED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REQUESTED: "bg-amber-50 text-amber-700 border-amber-200",
  SENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SCHEDULED: "bg-sky-50 text-sky-700 border-sky-200",
  COMING: "bg-emerald-50 text-emerald-700 border-emerald-200",
  NOT_COMING: "bg-rose-50 text-rose-700 border-rose-200",
  DELIVERED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  NO_RESPONSE: "bg-neutral-100 text-neutral-600 border-neutral-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CONTRACTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  NEGOTIATION: "bg-amber-50 text-amber-700 border-amber-200",
  PROSPECT: "bg-neutral-100 text-neutral-700 border-neutral-200",
  AVAILABLE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  OPTION: "bg-amber-50 text-amber-700 border-amber-200",
  OCCUPIED: "bg-purple-50 text-purple-700 border-purple-200",
  READY: "bg-sky-50 text-sky-700 border-sky-200",
  ISSUED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PRINTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REPRINTED: "bg-amber-50 text-amber-700 border-amber-200",
  VOID: "bg-rose-50 text-rose-700 border-rose-200",
  ELIGIBLE: "bg-sky-50 text-sky-700 border-sky-200",
  GENERATED: "bg-sky-50 text-sky-700 border-sky-200",
  REVOKED: "bg-rose-50 text-rose-700 border-rose-200",
  // görev
  BACKLOG: "bg-neutral-100 text-neutral-700 border-neutral-200",
  TODO: "bg-sky-50 text-sky-700 border-sky-200",
  IN_PROGRESS: "bg-amber-50 text-amber-700 border-amber-200",
  REVIEW: "bg-purple-50 text-purple-700 border-purple-200",
  DONE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  BLOCKED: "bg-rose-50 text-rose-700 border-rose-200",
  // form merkezi gönderi
  SPAM: "bg-rose-50 text-rose-700 border-rose-200",
  CLOSED: "bg-neutral-100 text-neutral-700 border-neutral-200",
  // gider
  PLANNED: "bg-sky-50 text-sky-700 border-sky-200",
  PENDING_RECEIPT: "bg-amber-50 text-amber-700 border-amber-200",
  REIMBURSED: "bg-purple-50 text-purple-700 border-purple-200",
  // bekleme listesi
  WAITING: "bg-amber-50 text-amber-700 border-amber-200",
  OFFERED: "bg-sky-50 text-sky-700 border-sky-200",
  CONVERTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DECLINED: "bg-rose-50 text-rose-700 border-rose-200",
};

// Stant durum etiketleri (§21) + Floor Studio plan renkleri
export const BOOTH_STATUS: Record<string, string> = {
  AVAILABLE: "Müsait",
  HELD: "Geçici Hold",
  OPTION: "Opsiyon",
  RESERVED: "Rezerve",
  CONTRACTED: "Sözleşmeli",
  BLOCKED: "Bloke",
  OCCUPIED: "İşgal",
  RELEASED: "Serbest Bırakıldı",
};

// Floor Studio planda durum → dolgu/kenar sınıfı (m² orantılı blok üzerine)
export const BOOTH_PLAN_TONE: Record<string, string> = {
  AVAILABLE: "border-emerald-400/70 bg-emerald-100/70 text-emerald-900 hover:bg-emerald-200/70",
  HELD: "border-amber-400/70 bg-amber-100/70 text-amber-900 hover:bg-amber-200/70",
  OPTION: "border-amber-500/80 bg-amber-200/80 text-amber-950 hover:bg-amber-300/80",
  RESERVED: "border-violet-400/70 bg-violet-100/70 text-violet-900 hover:bg-violet-200/70",
  CONTRACTED: "border-teal-600/80 bg-teal-500/25 text-teal-950 hover:bg-teal-500/40",
  BLOCKED: "border-neutral-400/60 bg-neutral-200/70 text-neutral-600 hover:bg-neutral-300/70",
  OCCUPIED: "border-violet-600/80 bg-violet-300/80 text-violet-950 hover:bg-violet-400/80",
  RELEASED: "border-neutral-300/60 bg-neutral-100/60 text-neutral-500 hover:bg-neutral-200/60",
};

// Yetenek kapağında modül ekranları: capability -> modül id (§3 menü ilkesi)
export const CAPABILITY_MODULE: Record<string, string> = {
  REGISTRATION: "registrations",
  SCIENTIFIC: "scientific",
  PROGRAM: "program",
  SPONSORSHIP: "sponsorship",
  ACCOMMODATION: "accommodation",
  COMMUNICATIONS: "communications",
  BADGING: "onsite",
  ACCESS_CONTROL: "onsite",
  CERTIFICATES: "certificates",
  FLOOR_PLAN: "floors",
  EXHIBITION: "floors",
};

// ─── GENİŞLETME DALGASI etiketleri (düşünce bulutu 1-9) ────────────────────

export const CAMPAIGN_PHASE = {
  PRE_EVENT: "Organizasyon Öncesi",
  DURING_EVENT: "Organizasyon Zamanı",
  POST_EVENT: "Organizasyon Sonrası",
} as const;

export const APPROVAL_STATUS = {
  PROPOSED: "Onay Bekliyor",
  APPROVED: "Onaylı",
  REJECTED: "Reddedildi",
} as const;

export const EMAIL_TEMPLATE_CATEGORY = {
  INVITATION: "Davet",
  CONFIRMATION: "Onay / Kayıt Tevdihi",
  PAYMENT_REMINDER: "Ödeme Hatırlatma",
  INFORMATION: "Bilgilendirme",
  QUIZ: "Etkileşimli Quiz",
  THANK_YOU: "Teşekkür",
  CUSTOM: "Özel",
} as const;

export const MAIL_PROVIDER_KIND = {
  SMTP: "SMTP (Kendi Sunucu)",
  MAILJET: "Mailjet",
  SENDGRID: "SendGrid",
  RESEND: "Resend",
  POSTMARK: "Postmark",
  OTHER: "Diğer",
} as const;

export const MEDIA_KIND = {
  IMAGE: "Görsel",
  VIDEO: "Video",
  AUDIO: "Ses",
  DOCUMENT: "Belge",
  SPREADSHEET: "Tablo",
  ARCHIVE: "Arşiv",
  FONT: "Font",
  OTHER: "Diğer",
} as const;

export const MATERIAL_TYPE = {
  ABSTRACT: "Bildiri Özeti",
  FULL_PAPER: "Tam Metin Bildiri",
  SLIDES: "Sunum Dosyası",
  VIDEO: "Video",
  SPEAKER_TEXT: "Konuşmacı Metni",
  LINK: "Bağlantı",
  OTHER: "Diğer",
} as const;

export const INTEGRATION_KIND = {
  REST: "REST API",
  WEBHOOK: "Webhook",
  PAYMENT: "Ödeme",
  MAIL: "E-Posta",
  SMS: "SMS",
  CRM: "CRM",
  TICKETING: "Bilet Sistemi",
} as const;

export const INTEGRATION_DIRECTION = {
  OUTBOUND: "Dışa Aktarım",
  INBOUND: "İçe Veri Çekme / Webhook",
} as const;

export const INTEGRATION_STATUS = {
  DRAFT: "Taslak",
  ACTIVE: "Aktif",
  PAUSED: "Duraklatıldı",
  ERROR: "Hatalı",
} as const;

export const CONTACT_ROLE = {
  PRIMARY: "Ana İletişim",
  AUTHORIZED: "Yetkili Kişi",
  PAYMENT: "Ödeme Sorumlusu",
  TECHNICAL: "Teknik Sorumlu",
  PRESS: "Basın",
  CUSTOM: "Özel",
} as const;

export const RELATION_TYPE = {
  SELF: "Kendisi",
  SPOUSE: "Eş",
  CHILD: "Çocuk",
  GUEST: "Misafir",
  ASSISTANT: "Asistan",
  OTHER: "Diğer",
} as const;

export const CV_KIND = {
  EDUCATION: "Eğitim",
  EXPERIENCE: "Deneyim",
  AWARD: "Ödül",
  LANGUAGE: "Dil",
  PUBLICATION: "Yayın",
  CERTIFICATION: "Sertifika",
} as const;

export const OCCUPANCY_TYPE = {
  SINGLE: "Single (Tek Kişi)",
  DOUBLE: "Double (Çift)",
  FAMILY_SHARED: "Aile / Paylaşımlı",
} as const;

// Yaka kartı alan bağlama seçenekleri — kayıt formu ve kişi verisinden (düşünce bulutu 8-bis)
export const BADGE_FIELD_KEYS = [
  { key: "fullName", label: "Ad Soyad" },
  { key: "firstName", label: "Ad" },
  { key: "lastName", label: "Soyad" },
  { key: "badgeName", label: "Yaka Kartı Adı (Snapshot)" },
  { key: "title", label: "Unvan" },
  { key: "company", label: "Kurum" },
  { key: "country", label: "Ülke" },
  { key: "city", label: "Şehir" },
  { key: "role", label: "Rol" },
  { key: "profileName", label: "Yaka Kartı Profili" },
  { key: "accessAreas", label: "Erişim Alanları" },
  { key: "badgeNo", label: "Yaka Kartı No" },
  { key: "confirmationNo", label: "Teyit No" },
  { key: "categoryName", label: "Kategori" },
  { key: "qr", label: "QR (Kimlik)" },
] as const;

// Serbest font seçimi — baskıda güvenli Google font karşılıkları
export const BADGE_FONTS: Record<string, { label: string; css: string }> = {
  inter: { label: "Inter (Modern)", css: "Inter, system-ui, sans-serif" },
  playfair: { label: "Playfair Display (Klasik)", css: '"Playfair Display", Georgia, serif' },
  montserrat: { label: "Montserrat (Geometrik)", css: '"Montserrat", Arial, sans-serif' },
  merriweather: { label: "Merriweather (Serif)", css: '"Merriweather", Georgia, serif' },
  sourcecode: { label: "Source Code Pro (Mono)", css: '"Source Code Pro", monospace' },
  roboto: { label: "Roboto (Nötr)", css: 'Roboto, Arial, sans-serif' },
};
