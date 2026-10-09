/**
 * Maven Event Management V2 — Ürün Sözlüğü, Modül Sahipliği ve Bilgi Mimarisi
 *
 * Kaynak: proje-hafizasi/12-PRODUCT-TRANSFORMATION-ROADMAP.md (Faz 1)
 *
 * Bu modül; Firma A, Firma B, İş, İş Türü, İş Profili, Portföy Kaydı, İş İlişkisi,
 * Katılım ve Modül kavramlarını kullanıcı dilinde sabitler. 26 modülün tamamının
 * ürün sorumluluğunu, çalışma bağlamını (GLOBAL vs WORK) ve hedef menü konumunu yönetir.
 */

// ─── 1. Temel Ürün Kavramları ve Aktör Hiyerarşisi ────────────────────────────

export const PRODUCT_ACTORS = {
  FIRMA_A: {
    key: "FIRMA_A",
    title: "Platform Sahibi (Firma A)",
    description: "Platformun teknik, lisans, global altyapı ve ürün yetkisi sahibidir.",
    isCustomerFacing: false,
  },
  FIRMA_B: {
    key: "FIRMA_B",
    title: "Organizasyon Şirketi / Kiracı (Firma B)",
    description: "Platformu kullanan müşteri firmadır; kendi personelini, işlerini, portföyünü ve dış deneyimlerini yönetir.",
    isCustomerFacing: true,
  },
} as const;

// ─── 2. İş, İş Grupları, Türleri ve Profilleri ────────────────────────────────

export const WORK_GROUPS = [
  { id: "EVENT_ORGANIZATION", label: "Etkinlik / Organizasyon", description: "Kongre, fuar, sempozyum veya kurumsal buluşmalar" },
  { id: "TRAVEL_CLIENT", label: "Seyahat / Müşteri İşi", description: "Münferit veya grup seyahatleri, tur ve transfer operasyonları" },
  { id: "CUSTOM", label: "Özel İş", description: "Firma B'nin kendi belirlediği operasyonel süreçler" },
] as const;

export type WorkGroupId = (typeof WORK_GROUPS)[number]["id"];

export const WORK_TYPES = [
  { id: "CONGRESS", groupId: "EVENT_ORGANIZATION", label: "Kongre", description: "Akademik veya sektörel bildiri ve oturumlu etkinlikler" },
  { id: "FAIR", groupId: "EVENT_ORGANIZATION", label: "Fuar", description: "Stant alanları, katılımcı ve ziyaretçi odaklı fuar organizasyonu" },
  { id: "CORPORATE", groupId: "EVENT_ORGANIZATION", label: "Kurumsal Etkinlik", description: "Şirket içi toplantı, ürün lansmanı veya bayi buluşması" },
  { id: "WEDDING", groupId: "EVENT_ORGANIZATION", label: "Düğün & Davet", description: "Özel davet, düğün ve sosyal kutlama etkinlikleri" },
  { id: "TRAVEL", groupId: "TRAVEL_CLIENT", label: "Seyahat / Tur", description: "Bireysel veya grup konaklama, transfer ve gezi operasyonu" },
  { id: "CUSTOM", groupId: "CUSTOM", label: "Özel Organizasyon", description: "Esnek modül yapılandırmalı özel iş" },
] as const;

export type WorkTypeId = (typeof WORK_TYPES)[number]["id"];

export const WORK_PROFILES = {
  scope: [
    { id: "INDIVIDUAL", label: "Tek Kişi", description: "Münferit katılım veya seyahat" },
    { id: "GROUP", label: "Grup", description: "Heyet, delege veya toplu katılım" },
  ],
  segment: [
    { id: "STANDARD", label: "Standart", description: "Genel katılım standartları" },
    { id: "VIP", label: "VIP / Protokol", description: "Özel ağırlama ve refakat protokolü" },
  ],
  privacy: [
    { id: "PUBLIC", label: "Genel / Açık", description: "Dış kayda veya kamuya açık etkinlik" },
    { id: "PRIVATE", label: "Özel / Kapalı", description: "Yalnızca davetlilerin erişebildiği kapalı iş" },
  ],
  ownership: [
    { id: "OWN_WORK", label: "Firma B Kendi İşi", description: "Firma B'nin kendi adına düzenlediği iş" },
    { id: "CLIENT_WORK", label: "Müşteri İşi", description: "Müşteri veya düzenleyen kurum adına yürütülen iş" },
  ],
} as const;

export const WORK_LIFECYCLE_STAGES = [
  { id: "OPPORTUNITY", label: "Fırsat", category: "PLANNING" },
  { id: "BID", label: "Teklif", category: "PLANNING" },
  { id: "AWARDED", label: "Kazanıldı", category: "PLANNING" },
  { id: "PLANNING", label: "Planlanan", category: "PLANNING" },
  { id: "CONFIGURATION", label: "Kurulum", category: "ACTIVE" },
  { id: "SALES", label: "Satış", category: "ACTIVE" },
  { id: "REGISTRATION", label: "Kayıt", category: "ACTIVE" },
  { id: "LOGISTICS", label: "Lojistik", category: "ACTIVE" },
  { id: "PRE_EVENT", label: "Etkinlik Öncesi", category: "ACTIVE" },
  { id: "ONSITE", label: "Canlı / Sahada", category: "ACTIVE" },
  { id: "POST_EVENT", label: "Etkinlik Sonrası", category: "COMPLETED" },
  { id: "RECONCILIATION", label: "Mutabakat", category: "COMPLETED" },
  { id: "ARCHIVED", label: "Arşiv", category: "ARCHIVE" },
] as const;

export type WorkLifecycleStage = (typeof WORK_LIFECYCLE_STAGES)[number]["id"];

// ─── 5 Aşamalı Makro İş Yaşam Döngüsü (Faz 11) ─────────────────────────────────
export type MacroLifecycleStage = "DRAFT" | "PLANNING" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

export interface MacroLifecycleStageDef {
  id: MacroLifecycleStage;
  label: string;
  description: string;
  colorTone: "neutral" | "amber" | "emerald" | "violet" | "slate";
}

export const MACRO_LIFECYCLE_STAGES: readonly MacroLifecycleStageDef[] = [
  { id: "DRAFT", label: "Taslak", description: "Kurulumu ve hazırlığı süren, henüz dış yayına veya satışa açılmamış iş.", colorTone: "neutral" },
  { id: "PLANNING", label: "Planlanan", description: "Hedef tarihi belirlenmiş, teklif, bütçe veya hazırlık evresindeki iş.", colorTone: "amber" },
  { id: "ACTIVE", label: "Aktif", description: "Yayında, kaydı açık veya canlı saha operasyonu devam eden iş.", colorTone: "emerald" },
  { id: "COMPLETED", label: "Tamamlanan", description: "Etkinliği sona ermiş, operasyonel ve mali mutabakatı süren iş.", colorTone: "violet" },
  { id: "ARCHIVED", label: "Arşiv", description: "Mali ve idari mutabakatı tamamlanmış, salt-okunur geçmiş iş kaydı.", colorTone: "slate" },
] as const;

export function getMacroLifecycleStage(edition: { status?: string; isPublished?: boolean } | string): MacroLifecycleStage {
  const status = typeof edition === "string" ? edition : (edition?.status ?? "DRAFT");
  const isPublished = typeof edition === "object" ? Boolean(edition?.isPublished) : true;

  if (status === "ARCHIVED") return "ARCHIVED";
  if (status === "POST_EVENT" || status === "RECONCILIATION") return "COMPLETED";
  if (!isPublished || status === "DRAFT") return "DRAFT";
  if (["OPPORTUNITY", "BID", "AWARDED", "PLANNING"].includes(status)) return "PLANNING";
  return "ACTIVE";
}

// ─── 3. Portföy, İlişki ve Katılım Ayrımı ────────────────────────────────────

export const PORTFOLIO_CONCEPTS = {
  PORTFOLIO_RECORD: {
    term: "Portföy Kaydı",
    definition: "Firma B'nin geçmiş ve mevcut işlerden biriktirdiği kişi, şirket ve kurum ana kayıtlarıdır. Portföy kaydı tek başına bir iş katılımı değildir.",
    scope: "GLOBAL",
  },
  WORK_RELATIONSHIP: {
    term: "İş İlişkisi",
    definition: "Bir kişi veya kurumun belirli bir işteki rolüdür; müşteri, düzenleyen, katılımcı, sponsor, tedarikçi veya ekip üyesi olabilir.",
    scope: "WORK",
  },
  WORK_PARTICIPATION: {
    term: "İş Katılımı",
    definition: "Bir kişinin belirli bir işe kaydı, onay durumu, hakları ve işe özel bilgileridir. Aynı kişi farklı işlerde farklı katılım kayıtlarına sahip olabilir.",
    scope: "WORK",
  },
} as const;

// ─── 4. Global Navigasyon Hiyerarşisi (Firma B Global Çalışma Alanı) ──────────

export interface GlobalNavAreaDef {
  id: "jobs" | "portfolio" | "comms" | "reports" | "settings";
  title: string;
  icon: string;
  secondaryMenu: readonly { id: string; title: string; hint?: string }[];
}

export const GLOBAL_NAV_AREAS: readonly GlobalNavAreaDef[] = [
  {
    id: "jobs",
    title: "İşler ve Organizasyonlar",
    icon: "Briefcase",
    secondaryMenu: [
      { id: "my-jobs", title: "İşlerim", hint: "Kullanıcıya atanmış işler" },
      { id: "active", title: "Aktif", hint: "Yayında veya hazırlığı süren canlı işler" },
      { id: "planning", title: "Planlanan", hint: "Gelecek dönem işleri" },
      { id: "attention", title: "Dikkat Gereken", hint: "Geciken görev, onay bekleyen karar veya blokajlar" },
      { id: "completed", title: "Tamamlanan", hint: "Operasyonu bitmiş mutabakat işleri" },
      { id: "archive", title: "Arşiv", hint: "Geçmiş iş kayıtları" },
      { id: "departments", title: "Departmanlar", hint: "Departman bazlı iş dağılımı" },
      { id: "saved-views", title: "Kayıtlı Görünümler", hint: "Özelleştirilmiş filtre listeleri" },
    ],
  },
  {
    id: "portfolio",
    title: "Firma Portföyü",
    icon: "Contact",
    secondaryMenu: [
      { id: "people", title: "Kişiler", hint: "Firma B'nin kalıcı kişi ana kayıtları" },
      { id: "organizations", title: "Kurumlar", hint: "Tüzel kişi, dernek, şirket ve kurumlar" },
      { id: "clients", title: "Müşteriler", hint: "İş verilen müşteri kurum ve kişiler" },
      { id: "relationships", title: "İlişkiler", hint: "Portföy genelindeki iş ve bağ ilişkileri" },
      { id: "segments", title: "Segmentler", hint: "Dinamik veya statik portföy kitleleri" },
      { id: "portfolio-forms", title: "Portföy Formları", hint: "İş dışı genel başvuru ve talep formları" },
    ],
  },
  {
    id: "comms",
    title: "Genel İletişim",
    icon: "Megaphone",
    secondaryMenu: [
      { id: "overview", title: "Genel Bakış", hint: "Firma geneli iletişim panosu" },
      { id: "audiences", title: "Kitleler", hint: "Genel iletişim kitle listeleri" },
      { id: "segments", title: "Segmentler", hint: "Filtrelenmiş alıcı kümeleri" },
      { id: "campaigns", title: "Kampanyalar", hint: "Duyuru ve bülten kampanyaları" },
      { id: "templates", title: "Şablonlar", hint: "Firma hazır e-posta ve mesaj şablonları" },
      { id: "approvals", title: "Onaylar", hint: "Gönderim öncesi teyit bekleyenler" },
      { id: "delivery-history", title: "Gönderim Geçmişi", hint: "İletim, açılma ve teslimat logları" },
    ],
  },
  {
    id: "reports",
    title: "Firma Raporları",
    icon: "BarChart3",
    secondaryMenu: [
      { id: "portfolio-report", title: "Portföy", hint: "Kişi/kurum portföy büyüme ve analizleri" },
      { id: "works-report", title: "İş Portföyü", hint: "Tüm işlerin çapraz karşılaştırması" },
      { id: "operations-report", title: "Operasyon", hint: "Görev ve operasyon tamamlama metrikleri" },
      { id: "finance-report", title: "Finans", hint: "Firma çapraz defter, tahsilat ve mutabakat" },
      { id: "comms-report", title: "İletişim", hint: "Toplu iletişim başarı ve etkileşimleri" },
      { id: "exports-report", title: "Dışa Aktarımlar", hint: "Dışa aktarma kuyruğu ve dosya geçmişi" },
    ],
  },
  {
    id: "settings",
    title: "Firma Ayarları",
    icon: "Settings",
    secondaryMenu: [
      { id: "profile", title: "Firma Profili", hint: "Firma B unvan, marka, adres ve kimlik bilgileri" },
      { id: "staff-teams", title: "Çalışanlar ve Ekipler", hint: "Firma çalışanları ve operasyon ekipleri" },
      { id: "departments", title: "Departmanlar", hint: "İç departman yapılanması" },
      { id: "roles-access", title: "Roller ve Erişim", hint: "Firma genel rol ve yetki tanımları" },
      { id: "modules", title: "Modüller", hint: "Firma B'ye tanımlı ürün modülü aktivasyonları" },
      { id: "templates", title: "Genel Şablonlar", hint: "İş ve form başlangıç şablonları" },
      { id: "comms-consents", title: "İletişim ve İzinler", hint: "KVKK, İYS ve iletişim kanalı ayarları" },
      { id: "integrations", title: "Entegrasyonlar", hint: "Ödeme, SMS, e-posta ve API bağlantıları" },
      { id: "compliance", title: "Uyumluluk", hint: "Veri saklama, log ve yasal uyum ilkeleri" },
    ],
  },
] as const;

export type GlobalNavAreaId = (typeof GLOBAL_NAV_AREAS)[number]["id"];

// ─── 5. İşe Özel İkinci Menü Hiyerarşisi (9 Sabit İş Grubu) ──────────────────

export interface WorkNavGroupDef {
  id: string;
  title: string;
  icon: string;
  items: readonly {
    id: string;
    title: string;
    primaryModuleId?: string;
    description: string;
  }[];
}

export const WORK_NAV_GROUPS: readonly WorkNavGroupDef[] = [
  {
    id: "work_management",
    title: "İş Yönetimi",
    icon: "FolderKanban",
    items: [
      { id: "summary", title: "İş Özeti", primaryModuleId: "dashboard", description: "İşin sağlık kokpiti, sıradaki adımlar ve modül durumları" },
      { id: "setup-checklist", title: "Kurulum Kontrol Listesi", primaryModuleId: "editions", description: "Kademeli iş kurulumu ve yayın engelleri" },
      { id: "work-info", title: "İş Bilgileri", primaryModuleId: "editions", description: "İşin adı, tarihleri, yeri ve temel kimliği" },
      { id: "client-organizer", title: "Müşteri ve Düzenleyen", primaryModuleId: "organizations", description: "İşin sahibi müşteri ve paydaş kurum ilişkileri" },
      { id: "team-permissions", title: "Ekip ve Yetkiler", primaryModuleId: "settings", description: "İşte görevli personel ve rol atamaları" },
      { id: "tasks-approvals", title: "Görevler ve Onaylar", primaryModuleId: "operations", description: "İşe özel görevler, tedarikçiler ve operasyonel onaylar" },
    ],
  },
  {
    id: "people_registration",
    title: "Kişiler ve Kayıt",
    icon: "Users2",
    items: [
      { id: "people-orgs", title: "Kişiler ve Kurumlar", primaryModuleId: "people", description: "Yalnız bu işle ilişkili kişi ve kurumların görünümü" },
      { id: "participants", title: "Katılımcılar", primaryModuleId: "registrations", description: "Kesinleşmiş ve onaylanmış iş katılımcıları" },
      { id: "categories-rights", title: "Kategoriler ve Haklar", primaryModuleId: "registrations", description: "Kayıt kategorileri, kontenjanlar ve dahil olan haklar" },
      { id: "forms", title: "Formlar", primaryModuleId: "forms", description: "İşe özel başvuru, anket ve değerlendirme formları" },
      { id: "approval-center", title: "Onay Merkezi", primaryModuleId: "registrations", description: "Başvuru inceleme, onay/ret ve bekleme listesi kararları" },
      { id: "import-export", title: "İçe / Dışa Aktarım", primaryModuleId: "registrations", description: "Kayıt ve katılımcı verisi toplu aktarımları" },
    ],
  },
  {
    id: "program_content",
    title: "Program ve İçerik",
    icon: "BookOpenCheck",
    items: [
      { id: "scientific", title: "Bilimsel", primaryModuleId: "scientific", description: "Bildiriler, hakem değerlendirmeleri, kararlar ve CME" },
      { id: "program", title: "Program", primaryModuleId: "program", description: "Oturumlar, salonlar, konuşmacılar ve zaman çizelgesi" },
      { id: "social-tours", title: "Sosyal ve Tur Planı", primaryModuleId: "social", description: "Gala, kokteyl, teknik ve kültürel gezi planları" },
    ],
  },
  {
    id: "sponsor_exhibition",
    title: "Sponsor ve Fuar",
    icon: "Store",
    items: [
      { id: "sponsors", title: "Sponsorlar", primaryModuleId: "sponsorship", description: "İşe destek veren sponsor kurumlar" },
      { id: "packages-agreements", title: "Paketler ve Anlaşmalar", primaryModuleId: "sponsorship", description: "Sponsorluk paketleri ve imzalı sözleşmeler" },
      { id: "deliverables-entitlements", title: "Haklar ve Teslimatlar", primaryModuleId: "sponsorship", description: "Vaat edilen teslimatlar ve hak kullanım takibi" },
      { id: "booths-floors", title: "Stantlar / Floor Studio", primaryModuleId: "floors", description: "Fuar planı, stant alanları ve yerleşim geometrisi" },
      { id: "b2b", title: "B2B", primaryModuleId: "b2b", description: "İkili iş görüşmeleri ve eşleşme takvimi" },
    ],
  },
  {
    id: "venue_onsite",
    title: "Mekân ve Saha",
    icon: "MapPin",
    items: [
      { id: "venues-spaces", title: "Mekânlar ve Alanlar", primaryModuleId: "floors", description: "Etkinlik merkezi, salonlar ve fiziki alanlar" },
      { id: "onsite-operations", title: "Saha Operasyonu", primaryModuleId: "onsite", description: "Canlı tarama, kapı geçişleri, check-in ve kiosklar" },
      { id: "badges-print", title: "Yaka Kartları ve Baskı", primaryModuleId: "badges", description: "Kart tasarımları ve canlı baskı kuyruğu" },
      { id: "certificates-docs", title: "Belgeler ve Sertifikalar", primaryModuleId: "certificates", description: "Katılım belgesi, sertifika üretimi ve teslimat" },
    ],
  },
  {
    id: "accommodation_services",
    title: "Konaklama ve Hizmetler",
    icon: "Hotel",
    items: [
      { id: "accommodation", title: "Konaklama", primaryModuleId: "accommodation", description: "Otel blokları, gece stokları ve oda rezervasyonları" },
      { id: "travel-transfers", title: "Seyahat ve Transfer", primaryModuleId: "accommodation", description: "Uçuş, karşılama ve araç transfer takibi" },
      { id: "extra-services", title: "Ek Hizmetler", primaryModuleId: "finance", description: "Ücretli veya ücretsiz ilave hizmet talepleri" },
    ],
  },
  {
    id: "communication_experience",
    title: "İletişim ve Deneyim",
    icon: "Radio",
    items: [
      { id: "work-comms", title: "İş İletişimi", primaryModuleId: "communications", description: "Yalnızca bu işin kitlelerine giden duyuru ve mesajlar" },
      { id: "external-experiences", title: "Dış Deneyimler", primaryModuleId: "portals", description: "Katılımcı mobil PWA, web vitrini ve dış portallar" },
      { id: "media", title: "Medya", primaryModuleId: "media", description: "İşe ait görsel ve dosya arşivi" },
    ],
  },
  {
    id: "work_reports",
    title: "İş Raporları",
    icon: "FileSpreadsheet",
    items: [
      { id: "work-finance-reports", title: "Finans ve Bütçe Raporları", primaryModuleId: "accounting", description: "İşin gelir, gider, tahsilat ve mutabakat raporları" },
      { id: "work-reg-reports", title: "Kayıt ve Katılım İstatistikleri", primaryModuleId: "registrations", description: "Katılımcı profili, doluluk ve analizler" },
      { id: "work-sponsor-reports", title: "Sponsor ve ROI Raporu", primaryModuleId: "sponsorship", description: "Sponsorluk gerçekleşme ve teslimat metrikleri" },
    ],
  },
  {
    id: "work_settings",
    title: "İş Ayarları",
    icon: "Sliders",
    items: [
      { id: "work-general-settings", title: "İş Kimliği ve Zaman", primaryModuleId: "settings", description: "Zaman dilimi, para birimi ve iş parametreleri" },
      { id: "work-module-settings", title: "Etkin Modüller", primaryModuleId: "settings", description: "Bu işte açık modül ve yeteneklerin yönetimi" },
      { id: "work-portal-settings", title: "Yayın ve Dış Görünüm", primaryModuleId: "portals", description: "Dış deneyimlerin yayın ayarları ve markalama" },
    ],
  },
] as const;

export type WorkNavGroupId = (typeof WORK_NAV_GROUPS)[number]["id"];

export interface WorkOperationalHubItemDef {
  id: string;
  title: string;
  primaryModuleId: string;
  defaultSubView?: string | null;
  description: string;
}

export interface WorkOperationalHubDef {
  id: string;
  canonicalGroupId: string;
  titleKey: string;
  defaultTitle: string;
  icon: string;
  primaryModuleId: string;
  primarySubView?: string | null;
  badgeType?: "setup" | "approval" | "onsite" | "active";
  items: readonly WorkOperationalHubItemDef[];
}

export const WORK_OPERATIONAL_HUBS: readonly WorkOperationalHubDef[] = [
  {
    id: "hub_cockpit",
    canonicalGroupId: "work_management",
    titleKey: "dualSidebar.hubCockpit",
    defaultTitle: "Kokpit ve Yönetim",
    icon: "FolderKanban",
    primaryModuleId: "dashboard",
    badgeType: "setup",
    items: [
      { id: "summary", title: "İş Özeti", primaryModuleId: "dashboard", description: "İşin sağlık kokpiti, sıradaki adımlar ve modül durumları" },
      { id: "setup-checklist", title: "Kurulum Kontrol Listesi", primaryModuleId: "editions", defaultSubView: "checklist", description: "Kademeli iş kurulumu ve yayın engelleri" },
      { id: "tasks-approvals", title: "Görevler ve Onaylar", primaryModuleId: "operations", description: "İşe özel görevler, tedarikçiler ve operasyonel onaylar" },
      { id: "client-organizer", title: "Müşteri ve Düzenleyen", primaryModuleId: "organizations", description: "İşin sahibi müşteri ve paydaş kurum ilişkileri" },
      { id: "team-permissions", title: "Ekip ve Yetkiler", primaryModuleId: "settings", description: "İşte görevli personel ve rol atamaları" },
      { id: "work-info", title: "İş Bilgileri", primaryModuleId: "editions", description: "İşin adı, tarihleri, yeri ve temel kimliği" },
    ],
  },
  {
    id: "hub_registration",
    canonicalGroupId: "people_registration",
    titleKey: "dualSidebar.hubRegistration",
    defaultTitle: "Katılım ve Kayıt",
    icon: "Users2",
    primaryModuleId: "registrations",
    badgeType: "approval",
    items: [
      { id: "participants", title: "Katılımcılar", primaryModuleId: "registrations", defaultSubView: "list", description: "Kesinleşmiş ve onaylanmış iş katılımcıları" },
      { id: "categories-rights", title: "Kategoriler ve Haklar", primaryModuleId: "registrations", defaultSubView: "categories", description: "Kayıt kategorileri, kontenjanlar ve dahil olan haklar" },
      { id: "approval-center", title: "Onay Merkezi", primaryModuleId: "registrations", defaultSubView: "approval", description: "Başvuru inceleme, onay/ret ve bekleme listesi kararları" },
      { id: "forms", title: "Formlar", primaryModuleId: "forms", description: "İşe özel başvuru, anket ve değerlendirme formları" },
      { id: "import-export", title: "İçe / Dışa Aktarım", primaryModuleId: "registrations", defaultSubView: "import", description: "Kayıt ve katılımcı verisi toplu aktarımları" },
      { id: "people-orgs", title: "Kişiler ve Kurumlar", primaryModuleId: "people", description: "Yalnız bu işle ilişkili kişi ve kurumların görünümü" },
    ],
  },
  {
    id: "hub_program",
    canonicalGroupId: "program_content",
    titleKey: "dualSidebar.hubProgram",
    defaultTitle: "Program ve İçerik",
    icon: "BookOpenCheck",
    primaryModuleId: "program",
    items: [
      { id: "program", title: "Program", primaryModuleId: "program", description: "Oturumlar, salonlar, konuşmacılar ve zaman çizelgesi" },
      { id: "scientific", title: "Bilimsel", primaryModuleId: "scientific", description: "Bildiriler, hakem değerlendirmeleri, kararlar ve CME" },
      { id: "social-tours", title: "Sosyal ve Tur Planı", primaryModuleId: "social", description: "Gala, kokteyl, teknik ve kültürel gezi planları" },
    ],
  },
  {
    id: "hub_sponsor",
    canonicalGroupId: "sponsor_exhibition",
    titleKey: "dualSidebar.hubSponsor",
    defaultTitle: "Sponsor ve Sergi",
    icon: "Store",
    primaryModuleId: "sponsorship",
    badgeType: "active",
    items: [
      { id: "sponsors", title: "Sponsorlar", primaryModuleId: "sponsorship", defaultSubView: "sponsors", description: "İşe destek veren sponsor kurumlar" },
      { id: "packages-agreements", title: "Paketler ve Anlaşmalar", primaryModuleId: "sponsorship", defaultSubView: "packages", description: "Sponsorluk paketleri ve imzalı sözleşmeler" },
      { id: "deliverables-entitlements", title: "Haklar ve Teslimatlar", primaryModuleId: "sponsorship", defaultSubView: "deliverables", description: "Vaat edilen teslimatlar ve hak kullanım takibi" },
      { id: "booths-floors", title: "Stantlar / Floor Studio", primaryModuleId: "floors", description: "Fuar planı, stant alanları ve yerleşim geometrisi" },
      { id: "b2b", title: "B2B", primaryModuleId: "b2b", description: "İkili iş görüşmeleri ve eşleşme takvimi" },
    ],
  },
  {
    id: "hub_logistics",
    canonicalGroupId: "venue_onsite",
    titleKey: "dualSidebar.hubLogistics",
    defaultTitle: "Saha ve Lojistik",
    icon: "MapPin",
    primaryModuleId: "onsite",
    badgeType: "onsite",
    items: [
      { id: "onsite-operations", title: "Saha Operasyonu", primaryModuleId: "onsite", defaultSubView: "desk", description: "Canlı tarama, kapı geçişleri, check-in ve kiosklar" },
      { id: "badges-print", title: "Yaka Kartları ve Baskı", primaryModuleId: "badges", defaultSubView: "queue", description: "Kart tasarımları ve canlı baskı kuyruğu" },
      { id: "certificates-docs", title: "Belgeler ve Sertifikalar", primaryModuleId: "certificates", description: "Katılım belgesi, sertifika üretimi ve teslimat" },
      { id: "accommodation", title: "Konaklama", primaryModuleId: "accommodation", defaultSubView: "hotels", description: "Otel blokları, gece stokları ve oda rezervasyonları" },
      { id: "travel-transfers", title: "Seyahat ve Transfer", primaryModuleId: "accommodation", defaultSubView: "transfers", description: "Uçuş, karşılama ve araç transfer takibi" },
      { id: "venues-spaces", title: "Mekânlar ve Alanlar", primaryModuleId: "floors", description: "Etkinlik merkezi, salonlar ve fiziki alanlar" },
      { id: "extra-services", title: "Ek Hizmetler", primaryModuleId: "finance", description: "Ücretli veya ücretsiz ilave hizmet talepleri" },
    ],
  },
  {
    id: "hub_comms",
    canonicalGroupId: "communication_experience",
    titleKey: "dualSidebar.hubComms",
    defaultTitle: "İletişim ve Deneyim",
    icon: "Radio",
    primaryModuleId: "communications",
    items: [
      { id: "work-comms", title: "İş İletişimi", primaryModuleId: "communications", description: "Yalnızca bu işin kitlelerine giden duyuru ve mesajlar" },
      { id: "external-experiences", title: "Dış Deneyimler", primaryModuleId: "portals", defaultSubView: "pwa", description: "Katılımcı mobil PWA, web vitrini ve dış portallar" },
      { id: "media", title: "Medya", primaryModuleId: "media", description: "İşe ait görsel ve dosya arşivi" },
    ],
  },
] as const;

export const WORK_UTILITY_HUBS: readonly WorkOperationalHubDef[] = [
  {
    id: "hub_reports",
    canonicalGroupId: "work_reports",
    titleKey: "dualSidebar.hubReports",
    defaultTitle: "İş Raporları",
    icon: "FileSpreadsheet",
    primaryModuleId: "accounting",
    items: [
      { id: "work-finance-reports", title: "Finans ve Bütçe Raporları", primaryModuleId: "accounting", defaultSubView: "defter", description: "İşin gelir, gider, tahsilat ve mutabakat raporları" },
      { id: "work-reg-reports", title: "Kayıt ve Katılım İstatistikleri", primaryModuleId: "registrations", defaultSubView: "reports", description: "Katılımcı profili, doluluk ve analizler" },
      { id: "work-sponsor-reports", title: "Sponsor ve ROI Raporu", primaryModuleId: "sponsorship", defaultSubView: "roi", description: "Sponsorluk gerçekleşme ve teslimat metrikleri" },
    ],
  },
  {
    id: "hub_settings",
    canonicalGroupId: "work_settings",
    titleKey: "dualSidebar.hubSettings",
    defaultTitle: "İş Ayarları",
    icon: "Sliders",
    primaryModuleId: "settings",
    items: [
      { id: "work-general-settings", title: "İş Kimliği ve Zaman", primaryModuleId: "settings", description: "Zaman dilimi, para birimi ve iş parametreleri" },
      { id: "work-module-settings", title: "Etkin Modüller", primaryModuleId: "settings", description: "Bu işte açık modül ve yeteneklerin yönetimi" },
      { id: "work-portal-settings", title: "Yayın ve Dış Görünüm", primaryModuleId: "portals", defaultSubView: "settings", description: "Dış deneyimlerin yayın ayarları ve markalama" },
    ],
  },
] as const;


// ─── 6. 26 Modülün Hedef Eşleme Kataloğu (Kayıpsızlık Garantisi) ──────────────

export interface ProductModuleCatalogEntry {
  id: string;
  title: string;
  responsibility: string;
  scope: "GLOBAL" | "WORK" | "CROSS_CONTEXT";
  targetNavArea: string;
  targetGroupTitle: string;
  targetItemTitle: string;
  workflowRole: string;
}

export const PRODUCT_MODULE_CATALOG: readonly ProductModuleCatalogEntry[] = [
  {
    id: "dashboard",
    title: "Genel Bakış / İş Özeti",
    responsibility: "Firma genelinde işler listesi; iş içinde karar ve durum odaklı İş Özeti.",
    scope: "CROSS_CONTEXT",
    targetNavArea: "jobs",
    targetGroupTitle: "İş Yönetimi",
    targetItemTitle: "İş Özeti",
    workflowRole: "Çalışma başlangıç noktası, eksik bilgi ve sıradaki kararların karar panosu.",
  },
  {
    id: "operations",
    title: "Operasyon & Görevler",
    responsibility: "Görev, tedarikçi, lojistik takibi ve onaylar.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "İş Yönetimi",
    targetItemTitle: "Görevler ve Onaylar",
    workflowRole: "Operasyonel görevlerin sorumlulara atanması ve tamamlanma takibi.",
  },
  {
    id: "archive",
    title: "Arşiv",
    responsibility: "Tamamlanan edisyon ve arşivlenmiş iş içeriği.",
    scope: "CROSS_CONTEXT",
    targetNavArea: "jobs",
    targetGroupTitle: "İşler ve Organizasyonlar",
    targetItemTitle: "Arşiv Filtresi",
    workflowRole: "Kapanmış işlerin geçmiş verilerini koruma ve inceleme.",
  },
  {
    id: "editions",
    title: "İşler ve Organizasyonlar (Edisyonlar)",
    responsibility: "İş yaratma, dönemsel edisyon geçmişi, kimlik ve yaşam döngüsü.",
    scope: "CROSS_CONTEXT",
    targetNavArea: "jobs",
    targetGroupTitle: "İş Yönetimi",
    targetItemTitle: "İş Bilgileri / Kurulum",
    workflowRole: "İşin ana kaydı ve dönemsel serilerinin oluşturulması.",
  },
  {
    id: "settings",
    title: "Ayarlar (Firma & İş)",
    responsibility: "Firma Ayarları'nda kurumsal varsayılanlar; İş Ayarları'nda işe özel parametreler.",
    scope: "CROSS_CONTEXT",
    targetNavArea: "settings",
    targetGroupTitle: "Firma Ayarları / İş Ayarları",
    targetItemTitle: "Firma Profili / İş Ayarları",
    workflowRole: "Kimlik, yetki, dil, tema ve parametre yapılandırması.",
  },
  {
    id: "portals",
    title: "Dış Deneyimler & Portallar",
    responsibility: "Katılımcı mobil PWA, sponsor ve müşteri dış yüzeyleri.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "İletişim ve Deneyim",
    targetItemTitle: "Dış Deneyimler",
    workflowRole: "Dış kullanıcıların kendi ekranlarından işe erişmesi.",
  },
  {
    id: "compliance",
    title: "Uyumluluk & Gizlilik",
    responsibility: "Veri saklama, KVKK talepleri, denetim izleri ve yasal uyum.",
    scope: "GLOBAL",
    targetNavArea: "settings",
    targetGroupTitle: "Firma Ayarları",
    targetItemTitle: "Uyumluluk",
    workflowRole: "Firma geneli yasal koruma ve denetim loglarının izlenmesi.",
  },
  {
    id: "integrations",
    title: "Entegrasyonlar & API",
    responsibility: "Ödeme geçidi, SMS/e-posta sağlayıcıları, webhook ve harici servisler.",
    scope: "GLOBAL",
    targetNavArea: "settings",
    targetGroupTitle: "Firma Ayarları",
    targetItemTitle: "Entegrasyonlar",
    workflowRole: "Firma B'nin harici teknik altyapı servislerini bağlaması.",
  },
  {
    id: "people",
    title: "Kişiler (Portföy & Katılım)",
    responsibility: "Globalde Firma B kişi ana kayıtları; iş içinde o işe ait ilişki ve roller.",
    scope: "CROSS_CONTEXT",
    targetNavArea: "portfolio",
    targetGroupTitle: "Firma Portföyü / Kişiler ve Kayıt",
    targetItemTitle: "Kişiler",
    workflowRole: "Kişi kimliklerinin tekilleştirilmesi ve iş ilişkilerine bağlanması.",
  },
  {
    id: "organizations",
    title: "Kurumlar & Müşteriler",
    responsibility: "Globalde tüzel kişi ana kayıtları; iş içinde Müşteri ve Düzenleyen ilişkileri.",
    scope: "CROSS_CONTEXT",
    targetNavArea: "portfolio",
    targetGroupTitle: "Firma Portföyü / İş Yönetimi",
    targetItemTitle: "Kurumlar / Müşteri ve Düzenleyen",
    workflowRole: "Müşteri, sponsor ve paydaş tüzel kişilerin yönetimi.",
  },
  {
    id: "communications",
    title: "İş İletişimi",
    responsibility: "Seçili işin katılımcı ve paydaşlarına dönük hedefli bildirim ve e-postalar.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "İletişim ve Deneyim",
    targetItemTitle: "İş İletişimi",
    workflowRole: "Etkinlik duyuruları, hatırlatmalar ve operasyonel iletiler.",
  },
  {
    id: "company-communications",
    title: "Genel İletişim",
    responsibility: "Firma çapında müşteri teması, bültenler ve kitle kampanyaları.",
    scope: "GLOBAL",
    targetNavArea: "comms",
    targetGroupTitle: "Genel İletişim",
    targetItemTitle: "Kampanyalar",
    workflowRole: "İşlerden bağımsız kurumsal pazarlama ve müşteri ilişkileri.",
  },
  {
    id: "registrations",
    title: "Kayıt & Katılımcılar",
    responsibility: "Başvuru, onay, kategori, kota ve kesin kayıtlı katılımcı listeleri.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "Kişiler ve Kayıt",
    targetItemTitle: "Katılımcılar / Onay Merkezi",
    workflowRole: "Başvuruların toplanması, onaylanması ve katılımcı haklarının belirlenmesi.",
  },
  {
    id: "forms",
    title: "Form Merkezi",
    responsibility: "Kayıt formları, anketler, interaktif soru-cevap ve geri bildirim formları.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "Kişiler ve Kayıt",
    targetItemTitle: "Formlar",
    workflowRole: "Dışarıdan veri toplama formlarının tasarlanması ve yanıtların işlenmesi.",
  },
  {
    id: "finance",
    title: "Finans & Tahsilat",
    responsibility: "Siparişler, ödemeler, iadeler ve ek hizmet faturalandırması.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "Konaklama ve Hizmetler / İş Raporları",
    targetItemTitle: "Ek Hizmetler / Finans",
    workflowRole: "İş kapsamındaki parasal hareketlerin ve ikinci onayların takibi.",
  },
  {
    id: "accounting",
    title: "Muhasebe & Mutabakat",
    responsibility: "Gelir/gider, defter dökümleri, bütçe ve mutabakat raporları.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "İş Raporları",
    targetItemTitle: "Finans ve Bütçe Raporları",
    workflowRole: "Mali tabloların ve kârlılık raporlarının hazırlanması.",
  },
  {
    id: "scientific",
    title: "Bilimsel Program & Bildiriler",
    responsibility: "Bildiri başvuruları, hakem değerlendirmeleri, kabul kararları ve CME.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "Program ve İçerik",
    targetItemTitle: "Bilimsel",
    workflowRole: "Akademik içeriklerin toplanması ve program oturumlarına aktarımı.",
  },
  {
    id: "program",
    title: "Program & Oturumlar",
    responsibility: "Oturumlar, salonlar, konuşmacılar ve çizelge takvimi.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "Program ve İçerik",
    targetItemTitle: "Program",
    workflowRole: "Etkinlik akışının zaman ve mekân bazında planlanması.",
  },
  {
    id: "social",
    title: "Sosyal & Tur Planı",
    responsibility: "Gala, karşılama yemeği, sosyal ve teknik geziler.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "Program ve İçerik",
    targetItemTitle: "Sosyal ve Tur Planı",
    workflowRole: "Ana program dışındaki yan etkinlik ve turların yönetimi.",
  },
  {
    id: "sponsorship",
    title: "Sponsorluk & Paketler",
    responsibility: "Sponsor anlaşmaları, paketler, haklar ve teslimatların takibi.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "Sponsor ve Fuar",
    targetItemTitle: "Sponsorlar / Paketler ve Anlaşmalar",
    workflowRole: "Sponsorluk satış ve teslimat taahhütlerinin yönetilmesi.",
  },
  {
    id: "b2b",
    title: "B2B Eşleşme & Görüşmeler",
    responsibility: "İkili iş görüşmeleri, randevu takvimi ve karşılıklı kabul.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "Sponsor ve Fuar",
    targetItemTitle: "B2B",
    workflowRole: "Alıcı ve satıcıların planlı randevularla bir araya getirilmesi.",
  },
  {
    id: "floors",
    title: "Stantlar & Floor Studio",
    responsibility: "Fuar yerleşim planı, stant geometrisi ve alan tahsisleri.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "Sponsor ve Fuar",
    targetItemTitle: "Stantlar / Floor Studio",
    workflowRole: "Fuar ve sergi alanlarının 2B plan üzerinde tahsis edilmesi.",
  },
  {
    id: "media",
    title: "Medya & Dosyalar",
    responsibility: "İşe özel görsel, belge ve medya arşivleri.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "İletişim ve Deneyim",
    targetItemTitle: "Medya",
    workflowRole: "İçerik, afiş ve dokümanların merkezi saklanması.",
  },
  {
    id: "accommodation",
    title: "Konaklama & Transfer",
    responsibility: "Otel oda blokları, gece stokları, rezervasyonlar ve transferler.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "Konaklama ve Hizmetler",
    targetItemTitle: "Konaklama / Seyahat ve Transfer",
    workflowRole: "Katılımcı ve misafirlerin konaklama ve ulaşım ihtiyaçlarının karşılanması.",
  },
  {
    id: "onsite",
    title: "Saha Operasyonu & Check-in",
    responsibility: "Giriş kapıları, barkod/QR taraması, check-in ve kiosklar.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "Mekân ve Saha",
    targetItemTitle: "Saha Operasyonu",
    workflowRole: "Etkinlik günü fiziki katılımcı geçişlerinin kontrolü.",
  },
  {
    id: "badges",
    title: "Yaka Kartı Baskı",
    responsibility: "Yaka kartı şablonu, tasarım ve anlık kart baskı kuyruğu.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "Mekân ve Saha",
    targetItemTitle: "Yaka Kartları ve Baskı",
    workflowRole: "Katılımcıların fiziki yaka kartlarının basılması ve teslimi.",
  },
  {
    id: "certificates",
    title: "Belgeler & Sertifikalar",
    responsibility: "Katılım sertifikaları, hak ediş kuralları ve dijital teslim.",
    scope: "WORK",
    targetNavArea: "jobs",
    targetGroupTitle: "Mekân ve Saha",
    targetItemTitle: "Belgeler ve Sertifikalar",
    workflowRole: "Etkinlik sonrası katılım belgelerinin hak sahiplerine verilmesi.",
  },
] as const;

// ─── 7. Ayrı Menüsü Olmayan Yeteneklerin Eşleme Sözlüğü ────────────────────────

export interface AuxiliaryCapabilityMapping {
  capability: string;
  targetArea: "GLOBAL_SETTINGS" | "WORK_MANAGEMENT" | "WORK_PEOPLE" | "PORTFOLIO" | "GLOBAL_COMMS" | "WORK_COMMS";
  targetScreen: string;
  description: string;
}

export const AUXILIARY_CAPABILITY_MAPPINGS: readonly AuxiliaryCapabilityMapping[] = [
  {
    capability: "Çalışan, Davet, Departman ve Özel Roller",
    targetArea: "GLOBAL_SETTINGS",
    targetScreen: "Firma Ayarları → Çalışanlar ve Ekipler",
    description: "Firma personeli ve departmanları; işe atama ise İş Yönetimi → Ekip ve Yetkiler altında yapılır.",
  },
  {
    capability: "Portföy Segmenti ve Kurumsal İlişkiler",
    targetArea: "PORTFOLIO",
    targetScreen: "Firma Portföyü → Segmentler / İlişkiler",
    description: "Ana kaydı bulup segment oluşturma ve işe aktarma.",
  },
  {
    capability: "Onay ve Karar Akışları",
    targetArea: "WORK_MANAGEMENT",
    targetScreen: "İş Yönetimi → Görevler ve Onaylar / Kayıt → Onay Merkezi",
    description: "Bekleyen onayların kaynak modülüyle çözümlenmesi.",
  },
  {
    capability: "Bildirim ve Duyuru Merkezi",
    targetArea: "WORK_COMMS",
    targetScreen: "Global Bildirim Zili / İş İletişimi",
    description: "Kullanıcıya özel sistem alarmları ve iş bazlı duyurular.",
  },
  {
    capability: "Marka, Özel Alan ve Şablonlar",
    targetArea: "GLOBAL_SETTINGS",
    targetScreen: "Firma Ayarları → Genel Şablonlar / İş Ayarları",
    description: "Firma varsayılanını oluşturup işe özelleştirme.",
  },
  {
    capability: "Toplu İçe / Dışa Aktarma (Import/Export)",
    targetArea: "WORK_PEOPLE",
    targetScreen: "Kişiler ve Kayıt → İçe/Dışa Aktarım / İlgili Modül Ekranı",
    description: "Veri aktarımının kaynak modül bağlamında yürütülmesi.",
  },
  {
    capability: "Entegrasyon Kayıtları ve Webhook Outbox",
    targetArea: "GLOBAL_SETTINGS",
    targetScreen: "Firma Ayarları → Entegrasyonlar",
    description: "Bağlantıyı firmada yönetme, işlem sonucunu kaynak modülde görme.",
  },
  {
    capability: "Firma Vitrini ve İş Portalları",
    targetArea: "GLOBAL_SETTINGS",
    targetScreen: "Firma Ayarları → Firma Profili / İş → Dış Deneyimler",
    description: "Firma genel vitrini ile işe özel katılımcı/sponsor portallarının ayrımı.",
  },
  {
    capability: "UTM ve Tanıtım Kaynağı Takibi",
    targetArea: "GLOBAL_COMMS",
    targetScreen: "Genel İletişim / İş İletişimi → Kampanyalar",
    description: "Kampanya kaynaklarından kayıt ve dönüşüm analizine erişim.",
  },
] as const;

// ─── 8. Yardımcı Yardımcı Fonksiyonlar ────────────────────────────────────────

/**
 * Bir modül kimliğinin yeni mimarideki kataloğunu döner.
 */
export function getProductModuleEntry(moduleId: string): ProductModuleCatalogEntry | undefined {
  return PRODUCT_MODULE_CATALOG.find((m) => m.id === moduleId);
}

/**
 * Belirli bir global alanın ikinci menü tanımını döner.
 */
export function getGlobalNavArea(areaId: GlobalNavAreaId): GlobalNavAreaDef | undefined {
  return GLOBAL_NAV_AREAS.find((a) => a.id === areaId);
}

/**
 * İşe özel 9 sabit gruptan birinin tanımını döner.
 */
export function getWorkNavGroup(groupId: WorkNavGroupId): WorkNavGroupDef | undefined {
  return WORK_NAV_GROUPS.find((g) => g.id === groupId);
}

/**
 * 26 modülün tamamının eksiksiz tanımlandığını doğrular (kayıpsızlık bekçisi).
 */
export function validateCatalogParity(legacyModuleIds: readonly string[]): {
  isComplete: boolean;
  missingInCatalog: string[];
  extraInCatalog: string[];
} {
  const catalogIds = new Set(PRODUCT_MODULE_CATALOG.map((m) => m.id));
  const legacySet = new Set(legacyModuleIds);

  const missingInCatalog = legacyModuleIds.filter((id) => !catalogIds.has(id));
  const extraInCatalog = PRODUCT_MODULE_CATALOG.filter((m) => !legacySet.has(m.id)).map((m) => m.id);

  return {
    isComplete: missingInCatalog.length === 0,
    missingInCatalog,
    extraInCatalog,
  };
}

// ─── 9. Ürün Bağlam Kapsamları ve Çapraz Köprüler (Faz 12) ────────────────────

export type ProductContextScope =
  | "GLOBAL_COMPANY"       // Firma B Global (Portföy, Genel İletişim, Firma Raporları, Firma Ayarları)
  | "WORK_WORKSPACE"      // İşe Özel Çalışma Alanı (İş Yönetimi, Kişiler/Kayıt, Program, Sponsor, Mekân, Konaklama, İletişim, İş Raporları, İş Ayarları)
  | "PLATFORM_OPERATOR"   // Firma A Platform Alanı (Tenant hesapları, lisanslar ve operatör yönetimi)
  | "EXTERNAL_EXPERIENCE"; // Dış Deneyimler ve Portallar (Katılımcı, sponsor, B2B, müşteri portalları & Event App PWA)

export interface ProductContextScopeDef {
  id: ProductContextScope;
  label: string;
  description: string;
}

export const PRODUCT_CONTEXT_SCOPES: readonly ProductContextScopeDef[] = [
  {
    id: "GLOBAL_COMPANY",
    label: "Firma B Global",
    description: "Firma B kalıcı portföyü, genel iletişim, firma çapraz raporları ve firma ayarları.",
  },
  {
    id: "WORK_WORKSPACE",
    label: "İşe Özel Çalışma Alanı",
    description: "Seçili işe ait yönetim, operasyon, program, katılımcı ve finans modülleri.",
  },
  {
    id: "PLATFORM_OPERATOR",
    label: "Firma A Platform Alanı",
    description: "Tenant hesapları, modül yetkileri, lisanslama ve platform operatör yönetimi.",
  },
  {
    id: "EXTERNAL_EXPERIENCE",
    label: "Dış Deneyimler ve Portallar",
    description: "Katılımcı, sponsor, B2B, müşteri dış portalları ve Event App PWA.",
  },
] as const;

/**
 * Belirli bir modülün ait olduğu ürün bağlam kapsamını döner.
 */
export function getProductContextScope(moduleId: string): ProductContextScope {
  if (
    moduleId === "portfolio" ||
    moduleId === "company-communications" ||
    moduleId === "company-reports" ||
    moduleId === "company-settings"
  ) {
    return "GLOBAL_COMPANY";
  }

  if (moduleId === "portals") {
    return "EXTERNAL_EXPERIENCE";
  }

  if (moduleId === "saas-entitlements" || moduleId === "platform-admin") {
    return "PLATFORM_OPERATOR";
  }

  return "WORK_WORKSPACE";
}

export interface WorkContextBridge {
  id: "summary" | "setup" | "comms" | "portals" | "reports";
  labelKey: string;
  defaultLabel: string;
  icon: string;
  targetModuleId: string;
  subView?: string;
}

export const WORK_CONTEXT_BRIDGES: readonly WorkContextBridge[] = [
  {
    id: "summary",
    labelKey: "contextBridge.summary",
    defaultLabel: "İş Özeti",
    icon: "LayoutDashboard",
    targetModuleId: "dashboard",
  },
  {
    id: "setup",
    labelKey: "contextBridge.setup",
    defaultLabel: "Kurulum",
    icon: "ListChecks",
    targetModuleId: "editions",
    subView: "setup-checklist",
  },
  {
    id: "comms",
    labelKey: "contextBridge.comms",
    defaultLabel: "İletişim",
    icon: "Send",
    targetModuleId: "communications",
  },
  {
    id: "portals",
    labelKey: "contextBridge.portals",
    defaultLabel: "Dış Deneyim",
    icon: "Globe",
    targetModuleId: "portals",
  },
  {
    id: "reports",
    labelKey: "contextBridge.reports",
    defaultLabel: "Raporlar",
    icon: "BarChart3",
    targetModuleId: "accounting",
    subView: "defter",
  },
] as const;

