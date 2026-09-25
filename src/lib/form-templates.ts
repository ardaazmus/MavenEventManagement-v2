// FORM-EXP2 — Hazır form şablonu kütüphanesi.
// Kullanıcı kaydı, quiz, oylama, anket, RSVP ve geri bildirim için tek-tık form kurulumu.
// Şablonlar SAF veridir — etiketler i18n yapraklarından UYGULAMA ANINDA (istemcide, geçerli
// dilde) çözülür; mantık kuralları alan-kimliğiyle (oluşturma sonrası) bağlanır.
// Uygulama akışı form-center.applyTemplate'tedir: POST /api/forms → sıralı POST /api/form-fields
// → mantık bağlama PUT'ları (var olan genel API'ler — yeni sunucu rotası gerektirmez).

export interface TemplateField {
  type: string; // FORM_FIELD_TYPES anahtarı
  labelKey: string; // i18n yaprağı: forms.tpl.<tpl>.<labelKey>
  optionsKeys?: string[]; // satır-bazlı seçenekler (her biri i18n yaprağı)
  columnsKeys?: string[]; // MATRIX kolonları
  required?: "ALWAYS" | "OPTIONAL" | "CONDITIONAL";
  width?: number; // % 25..100
  points?: number; // QA_QUIZ ağırlığı
  correctIndex?: number; // QA_QUIZ doğru cevabı → optionsKeys indeksi
  step?: number; // çok-adımlı form adımı (varsayılan 1)
  mobile?: boolean; // mobil interaktif öge
  // mantık kapısı: bu alana uygulanır — hedef alanı dizi indeksiyle bağla
  logic?: {
    toIndex: number; // fields dizisindeki hedef alan
    op: "EQ" | "NEQ" | "CONTAINS" | "GT" | "LT" | "EMPTY" | "NOT_EMPTY";
    valueKey?: string; // karşılaştırma değeri (i18n yaprağı — seçenek değeriyle aynı dilde)
    value?: string; // sabit değer (valueKey yoksa)
    action?: "SHOW" | "HIDE";
  }[];
}

export interface FormTemplate {
  key: string;
  formType: string; // REGISTRATION|SURVEY|FEEDBACK|QA_MOBILE|CUSTOM
  icon: string; // form-center'da lucide ikon eşlemesi
  nameKey: string; // forms.tpl.<key>.name
  descKey: string; // forms.tpl.<key>.desc
  settings?: {
    hasPublicResults?: boolean; // oylama/anket sonuçları herkese açık
    enableSteps?: boolean; // adım-adım doldurma
    autoApprove?: boolean;
  };
  fields: TemplateField[];
}

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    key: "reg",
    formType: "REGISTRATION",
    icon: "UserPlus",
    nameKey: "tpl.reg.name",
    descKey: "tpl.reg.desc",
    settings: { enableSteps: true },
    fields: [
      { type: "SECTION", labelKey: "tpl.reg.f1", width: 100, step: 1 },
      { type: "TEXT", labelKey: "tpl.reg.f2", required: "ALWAYS", width: 50, step: 1 },
      { type: "TEXT", labelKey: "tpl.reg.f3", required: "ALWAYS", width: 50, step: 1 },
      { type: "PHONE", labelKey: "tpl.reg.f4", width: 50, step: 1 },
      { type: "TEXT", labelKey: "tpl.reg.f5", width: 50, step: 1 },
      { type: "SINGLE_CHOICE", labelKey: "tpl.reg.f6", width: 100, step: 2, optionsKeys: ["tpl.reg.o1", "tpl.reg.o2", "tpl.reg.o3"] },
      { type: "TERMS", labelKey: "tpl.reg.f7", required: "ALWAYS", width: 100, step: 2 },
    ],
  },
  {
    key: "quiz",
    formType: "QA_MOBILE",
    icon: "HelpCircle",
    nameKey: "tpl.quiz.name",
    descKey: "tpl.quiz.desc",
    fields: [
      { type: "SECTION", labelKey: "tpl.quiz.f1", width: 100 },
      { type: "QA_QUIZ", labelKey: "tpl.quiz.f2", required: "ALWAYS", width: 100, points: 1, correctIndex: 0, mobile: true,
        optionsKeys: ["tpl.quiz.o1a", "tpl.quiz.o1b", "tpl.quiz.o1c"] },
      { type: "QA_QUIZ", labelKey: "tpl.quiz.f3", required: "ALWAYS", width: 100, points: 1, correctIndex: 1, mobile: true,
        optionsKeys: ["tpl.quiz.o2a", "tpl.quiz.o2b", "tpl.quiz.o2c"] },
      { type: "QA_QUIZ", labelKey: "tpl.quiz.f4", width: 100, points: 2, correctIndex: 2, mobile: true,
        optionsKeys: ["tpl.quiz.o3a", "tpl.quiz.o3b", "tpl.quiz.o3c"] },
      { type: "QA_QUIZ", labelKey: "tpl.quiz.f5", width: 100, points: 3, correctIndex: 1, mobile: true,
        optionsKeys: ["tpl.quiz.o4a", "tpl.quiz.o4b", "tpl.quiz.o4c"] },
    ],
  },
  {
    key: "vote",
    formType: "CUSTOM",
    icon: "Vote",
    nameKey: "tpl.vote.name",
    descKey: "tpl.vote.desc",
    settings: { hasPublicResults: true, autoApprove: true },
    fields: [
      { type: "SECTION", labelKey: "tpl.vote.f1", width: 100 },
      { type: "VOTE", labelKey: "tpl.vote.f2", required: "ALWAYS", width: 100, mobile: true,
        optionsKeys: ["tpl.vote.o1", "tpl.vote.o2", "tpl.vote.o3", "tpl.vote.o4"] },
      { type: "RATING", labelKey: "tpl.vote.f3", width: 50, mobile: true },
      { type: "LONGTEXT", labelKey: "tpl.vote.f4", width: 50 },
    ],
  },
  {
    key: "survey",
    formType: "SURVEY",
    icon: "BarChart3",
    nameKey: "tpl.survey.name",
    descKey: "tpl.survey.desc",
    fields: [
      { type: "SECTION", labelKey: "tpl.survey.f1", width: 100 },
      { type: "NPS", labelKey: "tpl.survey.f2", required: "ALWAYS", width: 100, mobile: true },
      // mantık kapısı örneği: NPS 7'den küçükse neden-sorusu GÖSTERİLİR
      { type: "LONGTEXT", labelKey: "tpl.survey.f3", width: 100,
        logic: [{ toIndex: 1, op: "LT", value: "7", action: "SHOW" }] },
      { type: "MATRIX", labelKey: "tpl.survey.f4", width: 100,
        optionsKeys: ["tpl.survey.r1", "tpl.survey.r2", "tpl.survey.r3"],
        columnsKeys: ["tpl.survey.c1", "tpl.survey.c2", "tpl.survey.c3", "tpl.survey.c4", "tpl.survey.c5"] },
      { type: "MULTI_CHOICE", labelKey: "tpl.survey.f5", width: 100,
        optionsKeys: ["tpl.survey.o1", "tpl.survey.o2", "tpl.survey.o3", "tpl.survey.o4"] },
    ],
  },
  {
    key: "rsvp",
    formType: "CUSTOM",
    icon: "CalendarCheck",
    nameKey: "tpl.rsvp.name",
    descKey: "tpl.rsvp.desc",
    settings: { autoApprove: true },
    fields: [
      { type: "SECTION", labelKey: "tpl.rsvp.f1", width: 100 },
      { type: "YESNO", labelKey: "tpl.rsvp.f2", required: "ALWAYS", width: 50 },
      // katılım "Evet" ise misafir sayısı görünür (mantık kapısı)
      { type: "NUMBER", labelKey: "tpl.rsvp.f3", width: 50, step: 1,
        logic: [{ toIndex: 1, op: "EQ", valueKey: "tpl.rsvp.yes", action: "SHOW" }] },
      { type: "TEXT", labelKey: "tpl.rsvp.f4", width: 50 },
      { type: "LONGTEXT", labelKey: "tpl.rsvp.f5", width: 50 },
    ],
  },
  {
    key: "feedback",
    formType: "FEEDBACK",
    icon: "MessageSquareHeart",
    nameKey: "tpl.feedback.name",
    descKey: "tpl.feedback.desc",
    fields: [
      { type: "SECTION", labelKey: "tpl.feedback.f1", width: 100 },
      { type: "RATING", labelKey: "tpl.feedback.f2", required: "ALWAYS", width: 50, mobile: true },
      { type: "MULTI_CHOICE", labelKey: "tpl.feedback.f3", width: 50,
        optionsKeys: ["tpl.feedback.o1", "tpl.feedback.o2", "tpl.feedback.o3", "tpl.feedback.o4"] },
      { type: "LONGTEXT", labelKey: "tpl.feedback.f4", width: 100 },
      { type: "NPS", labelKey: "tpl.feedback.f5", width: 100, mobile: true },
    ],
  },
];

// Şablonun i18n yaprak önekini verir: forms.tpl.<key>.*
export const templatePrefix = (key: string) => `tpl.${key}`;
