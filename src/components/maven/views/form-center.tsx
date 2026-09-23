"use client";
// Form Merkezi — kayıt formları, anketler ve mobil interaktif QA öğeleri tek merkezde.
// 4 sekme: Formlar (liste) · Tasarım Stüdyosu (alan editörü + spam/ödeme ayarları) ·
// Yanıtlar & İstatistik (inceleme kuyruğu + dağılım analizi) · Canlı Kayıt Masası (halka açık önizleme).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listEntity, apiSend, apiGet } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import {
  FORM_TYPES, FORM_TYPE_HINTS, FORM_FIELD_TYPES, FORM_SUBMISSION_STATUS, SUBMISSION_SOURCES,
  STATUS_TONE, label, fmtDate, fmtDateTime, fmtMoney, CHOICE_FIELD_TYPES,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";

// ─── API tipleri (sözleşme: UI AGENT SÖZLEŞMESİ / registry) ─────────────────

interface FormFieldDef {
  id: string; formId: string; order: number; label: string; type: string;
  required: string; options?: string | null; placeholder?: string | null; helpText?: string | null;
  sensitivity: string; mobileInteractive: boolean; conditionField?: string | null; conditionValue?: string | null;
  correctAnswer?: string | null;
}
interface FormDef {
  id: string; editionId: string; name: string; type: string; status: string;
  description?: string | null; successMessage?: string | null; isPublic: boolean; autoApprove: boolean;
  honeypotEnabled: boolean; minSubmitSeconds: number | null; maxPerEmailPerDay: number | null;
  blockedDomains?: string | null; enableOnlinePayment: boolean; defaultCategoryId?: string | null;
  fields: FormFieldDef[]; _count?: { submissions: number };
}
interface SubmissionRow {
  id: string; respondentName: string; respondentEmail: string; phone?: string | null; organization?: string | null;
  status: string; spamScore: number; spamReasons?: string | null; elapsedSeconds?: number | null;
  source: string; createdAt: string; submitIp?: string | null;
  quizScore?: number | null; quizCorrect?: number | null; quizTotal?: number | null;
  form?: { id: string; name: string; type: string; status: string } | null;
  registration?: { confirmationNo: string; status: string; category?: { name: string } | null } | null;
}
interface SubmissionDetail extends SubmissionRow {
  form: FormDef;
  answers: { id: string; fieldId: string; answer?: string | null }[];
  registration?: {
    confirmationNo: string; status: string; category?: { name: string } | null;
    participation?: { person: { firstName: string; lastName: string } } | null;
  } | null;
}
interface FieldStat {
  fieldId: string; label: string; type: string; mobileInteractive: boolean;
  responseCount: number; responseRate: number;
  distribution?: { value: string; count: number }[];
  numeric?: { avg: number; min: number; max: number } | null;
  nps?: { score: number; promoters: number; passives: number; detractors: number } | null;
  samples?: string[];
}
interface QuizFieldStat { fieldId: string; label: string; correctAnswer?: string | null; answered: number; correctCount: number; wrongCount: number; correctRate: number }
interface QuizStats { questionCount: number; scoredCount: number; avgScore: number | null; passRate: number; buckets: { label: string; count: number }[]; fields: QuizFieldStat[] }
interface FormStats {
  form: { id: string; name: string; type: string; status: string };
  totals: { submissions: number; valid: number; spam: number; spamRate: number; approved: number; pending: number; rejected: number; avgElapsedSeconds: number | null };
  daily: { date: string; count: number }[];
  fields: FieldStat[];
  quiz?: QuizStats | null;
}
interface RegisterResult {
  submissionId: string; status: string; spamScore: number; spamReasons: string[]; chainError?: string | null;
  quizScore?: number | null; quizCorrect?: number | null; quizTotal?: number | null;
  registration?: { id: string; confirmationNo: string; status: string } | null;
  order?: { id: string; orderNo: string; totalAmount: number; currency: string } | null;
  payment?: { id: string; amount: number; currency: string; status: string } | null;
}
interface PayProcessResult { outcome: string; message: string; payment?: { id: string; status: string; reference?: string | null } }
interface CategoryRow { id: string; name: string }

// ─── Yerel sabitler & yardımcılar ───────────────────────────────────────────

type TabKey = "list" | "studio" | "inbox" | "live";
type ChipTone = "neutral" | "teal" | "amber" | "rose" | "violet" | "emerald";

const FORM_STATUS_MAP: Record<string, string> = { DRAFT: "Taslak", PUBLISHED: "Yayında", CLOSED: "Kapalı" };
const REG_STATUS_MAP: Record<string, string> = {
  DRAFT: "Taslak", SUBMITTED: "Gönderildi", PENDING_APPROVAL: "Onay bekliyor",
  CONFIRMED: "Onaylandı", REJECTED: "Reddedildi", CANCELLED: "İptal",
};
const SENSITIVITY_MAP: Record<string, string> = {
  STANDARD: "Standart", OPERATIONAL_SENSITIVE: "Operasyonel Duyarlı", TEAM_ONLY: "Sadece Ekip",
};
const TYPE_TONE: Record<string, ChipTone> = {
  REGISTRATION: "teal", SURVEY: "violet", FEEDBACK: "emerald", QA_MOBILE: "amber", CUSTOM: "neutral",
};
// options (satır bazlı seçenekler) giren alan türleri
const OPTION_FIELD_TYPES = ["SINGLE_CHOICE", "MULTI_CHOICE", "QA_QUIZ", "COUNTRY"];
// mobil interaktif öge olarak otomatik açılan türler
const MOBILE_TYPES = ["RATING", "NPS", "QA_QUIZ"];
const PAY_METHOD_OPTS = [
  { value: "ONLINE_CARD", label: "Online Kart" },
  { value: "BANK_TRANSFER", label: "Havale / EFT" },
  { value: "PAYMENT_LINK", label: "Ödeme Linki" },
];

// JSON dizi alanını güvenle çöz (spamReasons, çoklu seçim yanıtları)
function parseJsonArray(v?: string | null): string[] {
  if (!v) return [];
  try {
    const p: unknown = JSON.parse(v);
    if (Array.isArray(p)) return p.map(String);
  } catch {
    /* JSON değilse virgülle ayrılmış */
  }
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}
// apiSend PATCH metotunu kapsamıyor → gönderi inceleme aksiyonları için yerel yardımcı (göreli yol)
async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "İşlem başarısız");
  return data as T;
}
const numOr = (v: string, dflt: number) => (Number.isFinite(Number(v)) ? Number(v) : dflt);
const barLabel = (v: string) => (v === "true" ? "Evet" : v === "false" ? "Hayır" : v);

// ─── Ana bileşen ────────────────────────────────────────────────────────────

export function FormCenterView() {
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();

  // Veri — formlar + kayıt kategorileri (ödeme paneli için)
  const { data: forms, error, reload, loading } = useApi<FormDef[]>(
    () => listEntity<FormDef>("forms", { editionId: currentEditionId ?? undefined }),
    [currentEditionId, refreshKey],
  );
  const { data: categories } = useApi<CategoryRow[]>(
    () => listEntity<CategoryRow>("registration-categories", { editionId: currentEditionId ?? undefined }),
    [currentEditionId, refreshKey],
  );

  const formList = useMemo(() => forms ?? [], [forms]);
  const categoryList = useMemo(() => categories ?? [], [categories]);

  // Sekme + seçili form (liste→stüdyo geçişinde de kullanılır)
  const [tab, setTab] = useState<TabKey>("list");
  const [selectedFormId, setSelectedFormId] = useState("");
  const selectedForm = formList.find((f) => f.id === selectedFormId) ?? null;

  const [busy, setBusy] = useState<string | null>(null);

  // Yeni form dialogu
  const [createOpen, setCreateOpen] = useState(false);
  const emptyNewForm = {
    name: "", type: "REGISTRATION", description: "",
    honeypotEnabled: true, minSubmitSeconds: "4", maxPerEmailPerDay: "5", blockedDomains: "",
    enableOnlinePayment: false, defaultCategoryId: "AUTO", autoApprove: false,
  };
  const [newForm, setNewForm] = useState(emptyNewForm);

  // Alan ekleme dialogu
  const [fieldOpen, setFieldOpen] = useState(false);
  const emptyNewField = {
    label: "", type: "TEXT", placeholder: "", helpText: "", options: "",
    required: "OPTIONAL", conditionField: "", conditionValue: "",
    sensitivity: "STANDARD", mobileInteractive: false, correctAnswer: "",
  };
  const [newField, setNewField] = useState(emptyNewField);

  // Stüdyo — form ayarları yerel kopyası (seçim değişince sunucudan doldurulur)
  const [settings, setSettings] = useState({
    name: "", description: "", successMessage: "",
    honeypotEnabled: true, minSubmitSeconds: "4", maxPerEmailPerDay: "5",
    blockedDomains: "", autoApprove: false,
    enableOnlinePayment: false, defaultCategoryId: "AUTO",
  });

  // Yanıtlar sekmesi filtreleri + detay dialogu
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Canlı kayıt masası durumu
  const [liveFormId, setLiveFormId] = useState("");
  const [ans, setAns] = useState<Record<string, string>>({});
  const [multi, setMulti] = useState<Record<string, string[]>>({});
  const [visitor, setVisitor] = useState({ name: "", email: "", phone: "", organization: "" });
  const [honeypot, setHoneypot] = useState("");
  const [payMethod, setPayMethod] = useState("ONLINE_CARD");
  const [liveResult, setLiveResult] = useState<RegisterResult | null>(null);
  const [pay, setPay] = useState({ cardHolder: "", cardNumber: "", expiry: "", cvc: "" });
  const [payOutcome, setPayOutcome] = useState<PayProcessResult | null>(null);
  const [resetTick, setResetTick] = useState(0);
  const startRef = useRef<number>(Date.now());

  const liveForms = useMemo(
    () => formList.filter((f) => f.status === "PUBLISHED" && f.isPublic),
    [formList],
  );
  const liveForm = liveForms.find((f) => f.id === liveFormId) ?? null;

  // Gönderiler + istatistik (seçili form + filtreler)
  const {
    data: submissions, error: subError, reload: reloadSubs, loading: subLoading,
  } = useApi<SubmissionRow[]>(
    () => selectedFormId
      ? listEntity<SubmissionRow>("form-submissions", {
          formId: selectedFormId,
          status: statusFilter === "ALL" ? undefined : statusFilter,
          source: sourceFilter === "ALL" ? undefined : sourceFilter,
          limit: 300,
        })
      : Promise.resolve([]),
    [selectedFormId, statusFilter, sourceFilter, refreshKey],
  );
  const subList = useMemo(() => submissions ?? [], [submissions]);

  const {
    data: stats, error: statsError, reload: reloadStats, loading: statsLoading,
  } = useApi<FormStats | null>(
    async () => (selectedFormId ? apiGet<FormStats>(`/api/form-stats?formId=${selectedFormId}`) : null),
    [selectedFormId, refreshKey],
  );

  // İlk formu otomatik seç; edisyon değişince geçersiz seçimi temizle (stüdyo/yanıtlar ortak)
  useEffect(() => {
    if (selectedFormId && !formList.some((f) => f.id === selectedFormId)) setSelectedFormId("");
    else if (!selectedFormId && formList.length > 0) setSelectedFormId(formList[0].id);
  }, [selectedFormId, formList]);

  // Canlı masada yayında + herkese açık ilk formu seç; geçersiz seçimi temizle
  useEffect(() => {
    if (liveFormId && !liveForms.some((f) => f.id === liveFormId)) setLiveFormId("");
    else if (!liveFormId && liveForms.length > 0) setLiveFormId(liveForms[0].id);
  }, [liveFormId, liveForms]);

  // Seçili form değişince (veya kaydedilince) ayar panelini sunucu değerleriyle tazele
  useEffect(() => {
    const f = formList.find((x) => x.id === selectedFormId);
    if (!f) return;
    setSettings({
      name: f.name,
      description: f.description ?? "",
      successMessage: f.successMessage ?? "",
      honeypotEnabled: f.honeypotEnabled,
      minSubmitSeconds: String(f.minSubmitSeconds ?? 4),
      maxPerEmailPerDay: String(f.maxPerEmailPerDay ?? 5),
      blockedDomains: f.blockedDomains ?? "",
      autoApprove: f.autoApprove,
      enableOnlinePayment: f.enableOnlinePayment,
      defaultCategoryId: f.defaultCategoryId ?? "AUTO",
    });
  }, [selectedFormId, formList]);

  // Zaman tuzağı: form göründüğünde sayaç başlat
  useEffect(() => {
    startRef.current = Date.now();
  }, [liveFormId, resetTick]);

  // ── Aksiyonlar ────────────────────────────────────────────────────────────

  const createForm = async () => {
    setBusy("create");
    try {
      const created = await apiSend<{ id: string }>("/api/forms", "POST", {
        editionId: currentEditionId,
        name: newForm.name,
        type: newForm.type,
        description: newForm.description,
        honeypotEnabled: newForm.honeypotEnabled,
        minSubmitSeconds: numOr(newForm.minSubmitSeconds, 4),
        maxPerEmailPerDay: numOr(newForm.maxPerEmailPerDay, 5),
        blockedDomains: newForm.blockedDomains,
        enableOnlinePayment: newForm.type === "REGISTRATION" ? newForm.enableOnlinePayment : false,
        defaultCategoryId: newForm.defaultCategoryId === "AUTO" ? null : newForm.defaultCategoryId,
        autoApprove: newForm.autoApprove,
      });
      toast({ title: "Form oluşturuldu", description: "Tasarım stüdyosundan alanları ekleyebilirsiniz." });
      setCreateOpen(false);
      setNewForm(emptyNewForm);
      setSelectedFormId(created.id);
      setTab("studio");
      reload();
      bump();
    } catch (e) {
      toast({ title: "Form oluşturulamadı", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const togglePublish = async (f: FormDef) => {
    setBusy(`pub-${f.id}`);
    try {
      await apiSend(`/api/forms/${f.id}`, "PUT", { status: f.status === "PUBLISHED" ? "CLOSED" : "PUBLISHED" });
      toast({ title: f.status === "PUBLISHED" ? "Form kapatıldı" : "Form yayına alındı", description: f.name });
      reload();
      bump();
    } catch (e) {
      toast({ title: "Durum değiştirilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const togglePublic = async (f: FormDef, v: boolean) => {
    setBusy(`public-${f.id}`);
    try {
      await apiSend(`/api/forms/${f.id}`, "PUT", { isPublic: v });
      toast({ title: v ? "Form herkese açık bağlantıya açıldı" : "Herkese açık erişim kapatıldı", description: f.name });
      reload();
      bump();
    } catch (e) {
      toast({ title: "Erişim ayarı güncellenemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  // Stüdyo kaydet — boş metin alanları null gider (registry sanitize ile uyumlu)
  const saveFormSettings = async () => {
    if (!selectedForm) return;
    setBusy("settings");
    try {
      await apiSend(`/api/forms/${selectedForm.id}`, "PUT", {
        name: settings.name,
        description: settings.description,
        successMessage: settings.successMessage,
        honeypotEnabled: settings.honeypotEnabled,
        minSubmitSeconds: numOr(settings.minSubmitSeconds, 4),
        maxPerEmailPerDay: numOr(settings.maxPerEmailPerDay, 5),
        blockedDomains: settings.blockedDomains,
        autoApprove: settings.autoApprove,
        enableOnlinePayment: settings.enableOnlinePayment,
        defaultCategoryId: settings.defaultCategoryId === "AUTO" ? null : settings.defaultCategoryId,
      });
      toast({ title: "Form ayarları kaydedildi", description: selectedForm.name });
      reload();
      bump();
    } catch (e) {
      toast({ title: "Ayarlar kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const addField = async () => {
    if (!selectedForm) return;
    setBusy("field");
    try {
      await apiSend("/api/form-fields", "POST", {
        formId: selectedForm.id,
        label: newField.label,
        type: newField.type,
        placeholder: newField.placeholder,
        helpText: newField.helpText,
        options: newField.options,
        required: newField.required,
        conditionField: newField.conditionField,
        conditionValue: newField.conditionValue,
        sensitivity: newField.sensitivity,
        mobileInteractive: newField.mobileInteractive,
        correctAnswer: newField.type === "QA_QUIZ" ? (newField.correctAnswer || null) : null,
        order: selectedForm.fields.length + 1,
      });
      toast({ title: "Alan eklendi", description: `${newField.label} — sıra ${selectedForm.fields.length + 1}` });
      setFieldOpen(false);
      setNewField(emptyNewField);
      reload();
      bump();
    } catch (e) {
      toast({ title: "Alan eklenemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  // Sıra değişimi: iki alanın order değerini karşılıklı güncelle
  const moveField = async (fieldId: string, dir: -1 | 1) => {
    if (!selectedForm) return;
    const list = [...selectedForm.fields].sort((a, b) => a.order - b.order);
    const idx = list.findIndex((f) => f.id === fieldId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= list.length) return;
    const a = list[idx];
    const b = list[j];
    setBusy(`move-${fieldId}`);
    try {
      await apiSend(`/api/form-fields/${a.id}`, "PUT", { order: b.order });
      await apiSend(`/api/form-fields/${b.id}`, "PUT", { order: a.order });
      reload();
      bump();
    } catch (e) {
      toast({ title: "Sıra değiştirilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const deleteField = async (fieldId: string, fieldLabel: string) => {
    setBusy(`del-${fieldId}`);
    try {
      await apiSend(`/api/form-fields/${fieldId}`, "DELETE");
      toast({ title: "Alan silindi", description: fieldLabel });
      reload();
      bump();
    } catch (e) {
      toast({ title: "Alan silinemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  // QA_QUIZ doğru cevabı — stüdyoda satır içi seçim, anında puanlamaya etki eder
  const setCorrectAnswer = async (fieldId: string, value: string) => {
    setBusy(`ca-${fieldId}`);
    try {
      await apiSend(`/api/form-fields/${fieldId}`, "PUT", { correctAnswer: value || null });
      toast({
        title: value ? `Doğru cevap: ${value}` : "Doğru cevap kaldırıldı",
        description: value ? "Yeni gönderiler quiz puanıyla kaydedilir." : "Bu soru artık puanlanmaz.",
      });
      reload();
      bump();
    } catch (e) {
      toast({ title: "Doğru cevap kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const submissionAction = async (id: string, action: "approve" | "reject" | "spam" | "pending") => {
    setBusy(`sub-${id}`);
    try {
      await apiPatch(`/api/form-submissions/${id}`, { action });
      const titles: Record<string, string> = {
        approve: "Gönderi onaylandı", reject: "Gönderi reddedildi",
        spam: "Spam olarak işaretlendi", pending: "İncelemeye alındı",
      };
      toast({
        title: titles[action],
        description: action === "approve" ? "Kayıt formu ise kayıt zinciri kurulur." : undefined,
      });
      reloadSubs();
      reloadStats();
      bump();
    } catch (e) {
      toast({ title: "Aksiyon başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await apiGet<SubmissionDetail>(`/api/form-submissions/${id}`));
    } catch (e) {
      toast({ title: "Detay yüklenemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
      setDetailId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // Çoklu seçim yanıtları JSON dizi olarak saklanır
  const toggleMulti = (fieldId: string, opt: string, on: boolean) => {
    setMulti((m) => {
      const cur = m[fieldId] ?? [];
      return { ...m, [fieldId]: on ? [...cur, opt] : cur.filter((x) => x !== opt) };
    });
  };

  // Koşullu alan görünürlüğü: conditionField etiketine uyan önceki sorunun yanıtına bakılır
  const isLiveVisible = (f: FormFieldDef): boolean => {
    if (!liveForm || !f.conditionField) return true;
    const src = liveForm.fields.find((x) => x.label === f.conditionField);
    if (!src) return true;
    const val = ans[src.id] ?? "";
    if (f.conditionValue === "true") return val === "true";
    return val !== "" && val === (f.conditionValue ?? "");
  };

  const submitLive = async () => {
    if (!liveForm) return;
    setBusy("live");
    try {
      const answers: Record<string, string> = {};
      for (const f of liveForm.fields) {
        if (f.type === "SECTION") continue;
        if (f.type === "MULTI_CHOICE") {
          answers[f.id] = JSON.stringify(multi[f.id] ?? []);
          continue;
        }
        const v = ans[f.id];
        if (v !== undefined && v !== "") answers[f.id] = v;
      }
      const res = await apiSend<RegisterResult>("/api/public-register", "POST", {
        formId: liveForm.id,
        respondentName: visitor.name,
        respondentEmail: visitor.email,
        phone: visitor.phone,
        organization: visitor.organization,
        answers,
        honeypotValue: honeypot,
        elapsedSeconds: Math.round((Date.now() - startRef.current) / 1000),
        paymentMethod: payMethod,
        source: "WEB_PUBLIC",
      });
      setLiveResult(res);
      setPayOutcome(null);
      bump();
      if (res.status === "SPAM") {
        toast({ title: "Gönderi spam şüphesiyle işaretlendi", description: `Skor ${Math.round(res.spamScore)}`, variant: "destructive" });
      } else {
        toast({
          title: res.status === "APPROVED" ? "Kaydınız onaylandı" : "Başvurunuz alındı",
          description: res.status === "PENDING" ? "Form Merkezi yanıt sekmesinden inceleyebilirsiniz." : undefined,
        });
      }
    } catch (e) {
      toast({ title: "Gönderim başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const processPayment = async () => {
    if (!liveResult?.payment) return;
    setBusy("pay");
    try {
      const res = await apiSend<PayProcessResult>(`/api/payments/${liveResult.payment.id}/process`, "POST", {
        cardHolder: pay.cardHolder,
        cardNumber: pay.cardNumber,
        expiry: pay.expiry,
        cvc: pay.cvc,
      });
      setPayOutcome(res);
      bump();
      if (res.outcome === "SUCCEEDED") {
        toast({ title: "Ödeme başarılı", description: res.message });
      } else {
        toast({ title: "Ödeme başarısız", description: res.message, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Ödeme işlemi başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const resetLive = () => {
    setAns({});
    setMulti({});
    setVisitor({ name: "", email: "", phone: "", organization: "" });
    setHoneypot("");
    setPayMethod("ONLINE_CARD");
    setLiveResult(null);
    setPayOutcome(null);
    setPay({ cardHolder: "", cardNumber: "", expiry: "", cvc: "" });
    setResetTick((t) => t + 1);
  };

  // ── Canlı masada alan render'ı (tip bazlı) ────────────────────────────────

  const renderLiveField = (f: FormFieldDef) => {
    const opts = (f.options ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
    const value = ans[f.id] ?? "";
    const reqStar = f.required === "ALWAYS" ? <span className="text-rose-500"> *</span> : null;

    const wrap = (children: ReactNode) => (
      <div key={f.id} className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-medium">
            {f.label}
            {reqStar}
          </Label>
          {f.mobileInteractive && <Badge variant="outline" className="text-[10px]">Mobil Öge</Badge>}
        </div>
        {children}
        {f.helpText && <p className="text-xs text-muted-foreground">{f.helpText}</p>}
      </div>
    );

    switch (f.type) {
      case "SECTION":
        return (
          <div key={f.id} className="border-b pb-1.5">
            <p className="text-sm font-semibold">{f.label}</p>
            {f.helpText && <p className="text-xs text-muted-foreground">{f.helpText}</p>}
          </div>
        );
      case "LONGTEXT":
        return wrap(
          <Textarea rows={3} value={value} placeholder={f.placeholder ?? ""} onChange={(e) => setAns({ ...ans, [f.id]: e.target.value })} />,
        );
      case "NUMBER":
        return wrap(
          <Input type="number" value={value} placeholder={f.placeholder ?? ""} onChange={(e) => setAns({ ...ans, [f.id]: e.target.value })} />,
        );
      case "EMAIL":
        return wrap(
          <Input type="email" value={value} placeholder={f.placeholder ?? "ornek@eposta.com"} onChange={(e) => setAns({ ...ans, [f.id]: e.target.value })} />,
        );
      case "PHONE":
        return wrap(
          <Input type="tel" value={value} placeholder={f.placeholder ?? "+90"} onChange={(e) => setAns({ ...ans, [f.id]: e.target.value })} />,
        );
      case "DATE":
        return wrap(<Input type="date" value={value} onChange={(e) => setAns({ ...ans, [f.id]: e.target.value })} />);
      case "SINGLE_CHOICE":
      case "QA_QUIZ":
        return wrap(
          <Select value={value} onValueChange={(v) => setAns({ ...ans, [f.id]: v })}>
            <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
            <SelectContent>
              {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>,
        );
      case "MULTI_CHOICE":
        return wrap(
          <div className="grid gap-1.5 rounded-lg border p-2.5">
            {opts.map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={multi[f.id]?.includes(o) ?? false}
                  onCheckedChange={(c) => toggleMulti(f.id, o, c === true)}
                />
                {o}
              </label>
            ))}
            {opts.length === 0 && <p className="text-xs text-muted-foreground">Seçenek tanımlanmamış</p>}
          </div>,
        );
      case "CHECKBOX":
        return wrap(
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={value === "true"} onCheckedChange={(c) => setAns({ ...ans, [f.id]: c ? "true" : "false" })} />
            {f.helpText ? f.label : f.label}
          </label>,
        );
      case "COUNTRY":
        return wrap(
          <Input value={value} placeholder="Ülke" onChange={(e) => setAns({ ...ans, [f.id]: e.target.value })} />,
        );
      case "FILE":
        return wrap(<Input disabled placeholder="Dosya seç (önizlemede kapalı)" />);
      case "RATING":
        return wrap(
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} yıldız`}
                onClick={() => setAns({ ...ans, [f.id]: String(n) })}
                className="rounded-md p-1 transition hover:bg-amber-50"
              >
                <Icons.Star className={`size-5 ${Number(value) >= n ? "fill-amber-400 text-amber-500" : "text-muted-foreground/40"}`} />
              </button>
            ))}
            {value && <span className="ml-1 text-xs text-muted-foreground">{value}/5</span>}
          </div>,
        );
      case "NPS":
        return wrap(
          <div className="grid gap-1">
            <div className="grid grid-cols-11 gap-1">
              {Array.from({ length: 11 }, (_, n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={Number(value) === n}
                  onClick={() => setAns({ ...ans, [f.id]: String(n) })}
                  className={`h-8 min-w-0 rounded-md border text-xs font-medium tabular-nums transition ${
                    Number(value) === n ? "border-teal-600 bg-teal-600 text-white" : "hover:border-teal-400"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Hiç olmaz</span>
              <span>Kesinlikle öneririm</span>
            </div>
          </div>,
        );
      default:
        return wrap(
          <Input value={value} placeholder={f.placeholder ?? ""} onChange={(e) => setAns({ ...ans, [f.id]: e.target.value })} />,
        );
    }
  };

  // ── Gönderi tablosundaki spam puanı hücresi (STATUS_TONE doğrudan kullanım) ─
  const spamPill = (score: number) =>
    score > 0 ? (
      <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_TONE.SPAM}`}>
        Skor {Math.round(score)}
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    );

  // ── QA_QUIZ skoru hücresi — bant bazlı renk (≥75 emerald, ≥50 amber, <50 rose) ─
  const quizPill = (sub: { quizScore?: number | null; quizCorrect?: number | null; quizTotal?: number | null }) => {
    if (sub.quizScore == null) return <span className="text-xs text-muted-foreground">—</span>;
    const tone = sub.quizScore >= 75 ? STATUS_TONE.CONVERTED : sub.quizScore >= 50 ? STATUS_TONE.WAITING : STATUS_TONE.SPAM;
    return (
      <span
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
        title={`Quiz başarısı %${Math.round(sub.quizScore)} — 75+ yeşil, 50+ amber, altı kırmızı`}
      >
        <Icons.Sigma className="size-3" />
        Quiz %{Math.round(sub.quizScore)}
        {sub.quizCorrect != null && sub.quizTotal ? ` · ${sub.quizCorrect}/${sub.quizTotal}` : ""}
      </span>
    );
  };

  const npsStat = stats?.fields.find((st) => st.type === "NPS" && st.nps) ?? null;

  // ───────────────────────────────────────────────────────────── RENDER ─────

  return (
    <div className="space-y-5">
      <PageHeader title="Form Merkezi" desc="Kayıt formları, anketler ve mobil interaktif QA öğeleri tek merkezde tasarlanır — spam korumalı, online ödemeli">
        <Button onClick={() => { setNewForm(emptyNewForm); setCreateOpen(true); }}>
          <Icons.Plus className="size-4" /> Yeni Form
        </Button>
      </PageHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="list"><Icons.FileInput className="size-4" /> Formlar</TabsTrigger>
          <TabsTrigger value="studio"><Icons.PenTool className="size-4" /> Tasarım Stüdyosu</TabsTrigger>
          <TabsTrigger value="inbox"><Icons.Inbox className="size-4" /> Yanıtlar &amp; İstatistik</TabsTrigger>
          <TabsTrigger value="live"><Icons.MonitorSmartphone className="size-4" /> Canlı Kayıt Masası</TabsTrigger>
        </TabsList>

        {/* ══ TAB 1 — FORMLAR ══════════════════════════════════════════════ */}
        <TabsContent value="list" className="mt-4 space-y-4">
          {loading ? (
            <Loading rows={4} />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : formList.length === 0 ? (
            <EmptyState
              title="Henüz form yok"
              desc="Sağ üstteki Yeni Form butonuyla kayıt formu, anket veya mobil QA ögesi oluşturun."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {formList.map((f) => (
                <div key={f.id} className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{f.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{f.description ?? "Açıklama yok"}</p>
                    </div>
                    <StatusBadge map={FORM_STATUS_MAP} value={f.status} />
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <Chip tone={TYPE_TONE[f.type] ?? "neutral"}>{label(FORM_TYPES, f.type)}</Chip>
                    {f.honeypotEnabled && (
                      <Chip tone="neutral"><Icons.ShieldCheck className="size-3" /> Spam koruması</Chip>
                    )}
                    {f.type === "REGISTRATION" && f.enableOnlinePayment && (
                      <Chip tone="emerald"><Icons.CreditCard className="size-3" /> Online ödeme</Chip>
                    )}
                    {f.isPublic && (
                      <Chip tone="violet"><Icons.Globe className="size-3" /> Herkese açık</Chip>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Icons.Inbox className="size-3.5" /> {f._count?.submissions ?? 0} gönderi
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Icons.List className="size-3.5" /> {f.fields.length} alan
                    </span>
                  </div>
                  <Separator className="my-3" />
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setSelectedFormId(f.id); setTab("studio"); }}
                    >
                      <Icons.PenTool className="size-3.5" /> Stüdyoda Düzenle
                    </Button>
                    <Button
                      size="sm"
                      variant={f.status === "PUBLISHED" ? "ghost" : "default"}
                      disabled={busy !== null}
                      onClick={() => togglePublish(f)}
                    >
                      {f.status === "PUBLISHED"
                        ? <><Icons.Lock className="size-3.5" /> Kapat</>
                        : <><Icons.Upload className="size-3.5" /> Yayınla</>}
                    </Button>
                    <div className="ml-auto flex items-center gap-1.5">
                      <Switch
                        checked={f.isPublic}
                        disabled={busy !== null}
                        aria-label="Herkese açık erişim"
                        onCheckedChange={(v) => togglePublic(f, v)}
                      />
                      <span className="text-xs text-muted-foreground">Herkese açık</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ══ TAB 2 — TASARIM STÜDYOSU ═════════════════════════════════════ */}
        <TabsContent value="studio" className="mt-4 space-y-4">
          {formList.length === 0 ? (
            <EmptyState
              title="Düzenlenecek form yok"
              desc="Önce Yeni Form ile bir form oluşturun; ardından alanları burada tasarlayın."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1">
                  <Label className="text-xs">Düzenlenecek form</Label>
                  <Select value={selectedFormId} onValueChange={setSelectedFormId}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="Form seçin" /></SelectTrigger>
                    <SelectContent>
                      {formList.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name} · {label(FORM_TYPES, f.type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedForm && (
                  <div className="flex items-center gap-1.5 pb-1">
                    <StatusBadge map={FORM_STATUS_MAP} value={selectedForm.status} />
                    <Chip tone={TYPE_TONE[selectedForm.type] ?? "neutral"}>{label(FORM_TYPES, selectedForm.type)}</Chip>
                  </div>
                )}
              </div>

              {selectedForm && (
                <div className="grid gap-4 lg:grid-cols-5">
                  {/* SOL — Alan listesi */}
                  <div className="lg:col-span-3">
                    <SectionCard
                      title="Alanlar"
                      desc={`${selectedForm.fields.length} alan — sıra numarasına göre gösterilir`}
                      action={
                        <Button size="sm" onClick={() => { setNewField(emptyNewField); setFieldOpen(true); }}>
                          <Icons.Plus className="size-3.5" /> Alan Ekle
                        </Button>
                      }
                    >
                      {selectedForm.fields.length === 0 ? (
                        <EmptyState title="Bu formda henüz alan yok" desc="Alan Ekle ile ilk soruyu ekleyin." />
                      ) : (
                        <div className="max-h-96 space-y-2 overflow-y-auto maven-scroll pr-1">
                          {[...selectedForm.fields]
                            .sort((a, b) => a.order - b.order)
                            .map((f, i) => (
                              <div
                                key={f.id}
                                className={`flex items-center gap-2 rounded-lg border p-2.5 ${
                                  f.type === "SECTION" ? "bg-muted/40 border-l-4 border-l-teal-500" : ""
                                }`}
                              >
                                <span className="w-6 shrink-0 text-center text-xs font-medium tabular-nums text-muted-foreground">
                                  {i + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className={`truncate text-sm font-medium ${f.type === "SECTION" ? "font-semibold" : ""}`}>
                                      {f.label}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">{label(FORM_FIELD_TYPES, f.type)}</span>
                                    {f.required === "ALWAYS" && <Chip tone="amber">Zorunlu</Chip>}
                                    {f.required === "CONDITIONAL" && (
                                      <span className="inline-flex items-center rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
                                        Koşullu
                                      </span>
                                    )}
                                    {f.mobileInteractive && <Chip tone="teal">Mobil</Chip>}
                                    {f.sensitivity !== "STANDARD" && (
                                      <Chip tone="violet">{label(SENSITIVITY_MAP, f.sensitivity)}</Chip>
                                    )}
                                  </div>
                                  {f.required === "CONDITIONAL" && f.conditionField && (
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                      Koşul: {f.conditionField} = {f.conditionValue ?? "—"}
                                    </p>
                                  )}
                                  {f.type === "QA_QUIZ" && (
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                        <Icons.KeyRound className="size-3" /> Doğru cevap:
                                      </span>
                                      <Select value={f.correctAnswer ?? undefined} onValueChange={(v) => setCorrectAnswer(f.id, v)}>
                                        <SelectTrigger className="h-7 w-44 text-[11px]" disabled={busy !== null}>
                                          <SelectValue placeholder="Seçin — puanlama kapalı" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {(f.options ?? "").split("\n").map((s) => s.trim()).filter(Boolean).map((opt) => (
                                            <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {busy === `ca-${f.id}` && <Icons.Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                                    </div>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-center gap-0.5">
                                  <Button
                                    size="icon" variant="ghost" className="size-7" aria-label="Yukarı taşı"
                                    disabled={i === 0 || busy !== null}
                                    onClick={() => moveField(f.id, -1)}
                                  >
                                    <Icons.ArrowUp className="size-3.5" />
                                  </Button>
                                  <Button
                                    size="icon" variant="ghost" className="size-7" aria-label="Aşağı taşı"
                                    disabled={i === selectedForm.fields.length - 1 || busy !== null}
                                    onClick={() => moveField(f.id, 1)}
                                  >
                                    <Icons.ArrowDown className="size-3.5" />
                                  </Button>
                                  <Button
                                    size="icon" variant="ghost" className="size-7 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                    aria-label="Alanı sil"
                                    disabled={busy !== null}
                                    onClick={() => deleteField(f.id, f.label)}
                                  >
                                    <Icons.Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </SectionCard>
                  </div>

                  {/* SAĞ — Ayar panelleri */}
                  <div className="space-y-4 lg:col-span-2">
                    <SectionCard title="Form Ayarları" desc="başlık, açıklama ve gönderi sonrası mesaj">
                      <div className="grid gap-3">
                        <div className="grid gap-1">
                          <Label className="text-xs">Form adı</Label>
                          <Input value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Açıklama</Label>
                          <Textarea rows={2} value={settings.description} onChange={(e) => setSettings({ ...settings, description: e.target.value })} />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Başarı mesajı</Label>
                          <Input
                            value={settings.successMessage}
                            placeholder="Örn. Kaydınız alındı, teşekkür ederiz"
                            onChange={(e) => setSettings({ ...settings, successMessage: e.target.value })}
                          />
                        </div>
                        <Button size="sm" disabled={busy !== null} onClick={saveFormSettings}>
                          <Icons.Check className="size-4" /> Kaydet
                        </Button>
                      </div>
                    </SectionCard>

                    <SectionCard
                      title={<span className="flex items-center gap-2"><Icons.ShieldCheck className="size-4 text-teal-600" /> Spam Koruması</span>}
                      desc="bot gönderileri otomatik puanlanır ve inceleme kuyruğuna düşer"
                    >
                      <div className="grid gap-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">Gizli alan tuzağı (honeypot)</p>
                            <p className="text-xs text-muted-foreground">Gizli alan botları yakalar</p>
                          </div>
                          <Switch
                            checked={settings.honeypotEnabled}
                            disabled={busy !== null}
                            aria-label="Honeypot"
                            onCheckedChange={(v) => setSettings({ ...settings, honeypotEnabled: v })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="grid gap-1">
                            <Label className="text-xs">Zaman tuzağı (sn)</Label>
                            <Input
                              type="number" min={0} value={settings.minSubmitSeconds}
                              onChange={(e) => setSettings({ ...settings, minSubmitSeconds: e.target.value })}
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">E-posta günlük limit</Label>
                            <Input
                              type="number" min={1} value={settings.maxPerEmailPerDay}
                              onChange={(e) => setSettings({ ...settings, maxPerEmailPerDay: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Engelli alan adları (virgülle)</Label>
                          <Input
                            value={settings.blockedDomains}
                            placeholder="spam.xyz, tempmail.xyz"
                            onChange={(e) => setSettings({ ...settings, blockedDomains: e.target.value })}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">Temiz gönderileri otomatik onayla</p>
                            <p className="text-xs text-muted-foreground">Spam eşiği altındaki gönderiler doğrudan onaylanır</p>
                          </div>
                          <Switch
                            checked={settings.autoApprove}
                            disabled={busy !== null}
                            aria-label="Otomatik onay"
                            onCheckedChange={(v) => setSettings({ ...settings, autoApprove: v })}
                          />
                        </div>
                        <Button size="sm" disabled={busy !== null} onClick={saveFormSettings}>
                          <Icons.Check className="size-4" /> Kaydet
                        </Button>
                      </div>
                    </SectionCard>

                    {selectedForm.type === "REGISTRATION" && (
                      <SectionCard
                        title={<span className="flex items-center gap-2"><Icons.CreditCard className="size-4 text-emerald-600" /> Online Ödeme</span>}
                        desc="kayıt formu gönderiminde sanal POS akışı açılır"
                      >
                        <div className="grid gap-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">Online ödeme aktif</p>
                              <p className="text-xs text-muted-foreground">Kayıt sonrası ödeme adımı gösterilir</p>
                            </div>
                            <Switch
                              checked={settings.enableOnlinePayment}
                              disabled={busy !== null}
                              aria-label="Online ödeme"
                              onCheckedChange={(v) => setSettings({ ...settings, enableOnlinePayment: v })}
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">Varsayılan kategori</Label>
                            <Select
                              value={settings.defaultCategoryId || "AUTO"}
                              onValueChange={(v) => setSettings({ ...settings, defaultCategoryId: v })}
                            >
                              <SelectTrigger><SelectValue placeholder="Kategori seçin" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="AUTO">Kategori otomatik</SelectItem>
                                {categoryList.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button size="sm" disabled={busy !== null} onClick={saveFormSettings}>
                            <Icons.Check className="size-4" /> Kaydet
                          </Button>
                        </div>
                      </SectionCard>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ══ TAB 3 — YANITLAR & İSTATİSTİK ════════════════════════════════ */}
        <TabsContent value="inbox" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">Form</Label>
              <Select value={selectedFormId} onValueChange={setSelectedFormId}>
                <SelectTrigger className="w-60"><SelectValue placeholder="Form seçin" /></SelectTrigger>
                <SelectContent>
                  {formList.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Durum</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tümü</SelectItem>
                  {Object.entries(FORM_SUBMISSION_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Kaynak</Label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tümü</SelectItem>
                  {Object.entries(SUBMISSION_SOURCES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <SectionCard title="Gönderiler" desc="onaylanan kayıt formu gönderileri kayıt zinciri kurar; spam gönderiler balon dışında tutulur">
            {!selectedFormId ? (
              <EmptyState title="Form seçin" desc="Yanıtları görmek için yukarıdan bir form seçin." />
            ) : subLoading ? (
              <Loading rows={4} />
            ) : subError ? (
              <ErrorState message={subError} onRetry={reloadSubs} />
            ) : subList.length === 0 ? (
              <EmptyState title="Bu filtrede gönderi yok" desc="Canlı Kayıt Masası sekmesinden test gönderimi yapabilirsiniz." />
            ) : (
              <>
                {/* masaüstü tablo */}
                <div className="hidden max-h-96 overflow-y-auto maven-scroll md:block">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Gönderen</th>
                        <th className="py-2 pr-3 font-medium">Kurum</th>
                        <th className="py-2 pr-3 font-medium">Form</th>
                        <th className="py-2 pr-3 font-medium">Durum</th>
                        <th className="py-2 pr-3 font-medium">Spam</th>
                        <th className="py-2 pr-3 font-medium">Quiz</th>
                        <th className="py-2 pr-3 font-medium">Süre</th>
                        <th className="py-2 pr-3 font-medium">Kaynak</th>
                        <th className="py-2 pr-3 font-medium">Tarih</th>
                        <th className="py-2 text-right font-medium">Aksiyon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subList.map((s) => (
                        <tr key={s.id} className="border-b align-top last:border-0 hover:bg-muted/40">
                          <td className="py-2 pr-3">
                            <p className="font-medium">{s.respondentName}</p>
                            <p className="text-xs text-muted-foreground">{s.respondentEmail}</p>
                          </td>
                          <td className="py-2 pr-3 text-xs">{s.organization ?? "—"}</td>
                          <td className="py-2 pr-3 text-xs">{s.form?.name ?? "—"}</td>
                          <td className="py-2 pr-3"><StatusBadge map={FORM_SUBMISSION_STATUS} value={s.status} /></td>
                          <td className="py-2 pr-3">{spamPill(s.spamScore)}</td>
                          <td className="py-2 pr-3">{quizPill(s)}</td>
                          <td className="py-2 pr-3 text-xs tabular-nums">{s.elapsedSeconds != null ? `${Math.round(s.elapsedSeconds)} sn` : "—"}</td>
                          <td className="py-2 pr-3 text-xs">{label(SUBMISSION_SOURCES, s.source)}</td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(s.createdAt)}</td>
                          <td className="py-2">
                            <div className="flex items-center justify-end gap-0.5">
                              <Button size="icon" variant="ghost" className="size-7" aria-label="Detay" onClick={() => openDetail(s.id)}>
                                <Icons.Eye className="size-3.5" />
                              </Button>
                              {s.status !== "SPAM" && (
                                <>
                                  <Button
                                    size="icon" variant="ghost" className="size-7 text-emerald-600 hover:bg-emerald-50"
                                    aria-label="Onayla" disabled={busy !== null || s.status === "APPROVED"}
                                    onClick={() => submissionAction(s.id, "approve")}
                                  >
                                    <Icons.Check className="size-3.5" />
                                  </Button>
                                  <Button
                                    size="icon" variant="ghost" className="size-7 text-rose-600 hover:bg-rose-50"
                                    aria-label="Ret" disabled={busy !== null || s.status === "REJECTED"}
                                    onClick={() => submissionAction(s.id, "reject")}
                                  >
                                    <Icons.X className="size-3.5" />
                                  </Button>
                                  <Button
                                    size="icon" variant="ghost" className="size-7 text-amber-600 hover:bg-amber-50"
                                    aria-label="Spam işaretle" disabled={busy !== null}
                                    onClick={() => submissionAction(s.id, "spam")}
                                  >
                                    <Icons.Flag className="size-3.5" />
                                  </Button>
                                </>
                              )}
                              {s.status === "SPAM" && (
                                <Button
                                  size="sm" variant="outline" className="h-7 px-2 text-xs"
                                  disabled={busy !== null}
                                  onClick={() => submissionAction(s.id, "pending")}
                                >
                                  <Icons.Undo2 className="size-3" /> İncelemeye Al
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* mobil kartlar */}
                <div className="max-h-96 space-y-2 overflow-y-auto maven-scroll md:hidden">
                  {subList.map((s) => (
                    <div key={s.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{s.respondentName}</p>
                          <p className="truncate text-xs text-muted-foreground">{s.respondentEmail}</p>
                        </div>
                        <StatusBadge map={FORM_SUBMISSION_STATUS} value={s.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {s.organization && <span>{s.organization}</span>}
                        <span>{s.form?.name}</span>
                        {spamPill(s.spamScore)}
                        {quizPill(s)}
                        <span>{s.elapsedSeconds != null ? `${Math.round(s.elapsedSeconds)} sn` : null}</span>
                        <span>{label(SUBMISSION_SOURCES, s.source)}</span>
                        <span>{fmtDate(s.createdAt)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openDetail(s.id)}>
                          <Icons.Eye className="size-3" /> Detay
                        </Button>
                        {s.status !== "SPAM" ? (
                          <>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-emerald-700" disabled={busy !== null} onClick={() => submissionAction(s.id, "approve")}>
                              <Icons.Check className="size-3" /> Onayla
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-rose-700" disabled={busy !== null} onClick={() => submissionAction(s.id, "reject")}>
                              <Icons.X className="size-3" /> Ret
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-amber-700" disabled={busy !== null} onClick={() => submissionAction(s.id, "spam")}>
                              <Icons.Flag className="size-3" /> Spam
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy !== null} onClick={() => submissionAction(s.id, "pending")}>
                            <Icons.Undo2 className="size-3" /> İncelemeye Al
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </SectionCard>

          {/* İstatistik bölümü */}
          {selectedFormId && (
            statsLoading ? (
              <Loading rows={3} />
            ) : statsError ? (
              <ErrorState message={statsError} onRetry={reloadStats} />
            ) : stats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiCard
                    label="Toplam Gönderi" value={stats.totals.submissions}
                    sub={`geçerli ${stats.totals.valid} · spam ${stats.totals.spam}`}
                    icon={<Icons.Inbox className="size-4" />}
                  />
                  <KpiCard
                    label="Onaylı" value={stats.totals.approved} tone="emerald"
                    sub={`bekleyen ${stats.totals.pending} · ret ${stats.totals.rejected}`}
                    icon={<Icons.Check className="size-4" />}
                  />
                  <KpiCard
                    label="Spam Oranı" value={`${stats.totals.spamRate}%`} tone="rose"
                    sub="spam koruması yakaladı"
                    icon={<Icons.ShieldCheck className="size-4" />}
                  />
                  <KpiCard
                    label="Ort. Doldurma" value={stats.totals.avgElapsedSeconds != null ? `${stats.totals.avgElapsedSeconds} sn` : "—"}
                    tone="violet" sub="form açılma → gönderim" icon={<Icons.Timer className="size-4" />}
                  />
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <SectionCard
                    title="Günlük Akış"
                    desc="son 14 gün gönderi adedi"
                    className={npsStat ? "lg:col-span-2" : "lg:col-span-3"}
                  >
                    {(() => {
                      const max = Math.max(...stats.daily.map((d) => d.count), 1);
                      return (
                        <div>
                          <div className="flex h-28 items-end gap-1">
                            {stats.daily.map((d) => (
                              <div
                                key={d.date}
                                title={`${fmtDate(d.date)} — ${d.count} gönderi`}
                                className={`min-w-2 flex-1 rounded-t ${d.count > 0 ? "bg-teal-500/80" : "bg-muted"}`}
                                style={{ height: `${Math.max((d.count / max) * 100, 4)}%` }}
                              />
                            ))}
                          </div>
                          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                            <span>{fmtDate(stats.daily[0]?.date)}</span>
                            <span>{fmtDate(stats.daily[stats.daily.length - 1]?.date)}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </SectionCard>

                  {npsStat?.nps && (
                    <SectionCard title="NPS Skoru" desc={npsStat.label}>
                      <div className="flex items-end gap-4">
                        <span className={`text-5xl font-semibold tabular-nums ${npsStat.nps.score >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {npsStat.nps.score}
                        </span>
                        <div className="space-y-0.5 text-xs">
                          <p className="text-emerald-700">Promoter: {npsStat.nps.promoters}</p>
                          <p className="text-amber-700">Pasif: {npsStat.nps.passives}</p>
                          <p className="text-rose-700">Detractor: {npsStat.nps.detractors}</p>
                        </div>
                      </div>
                    </SectionCard>
                  )}

                  {stats.quiz && (
                    <SectionCard
                      title="QA Quiz Sonuçları"
                      desc={`${stats.quiz.questionCount} soru · ${stats.quiz.scoredCount} puanlanmış gönderi`}
                      className={npsStat ? "lg:col-span-3" : "lg:col-span-2"}
                    >
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="rounded-lg border bg-muted/20 p-3 text-center">
                          <p className="text-xs text-muted-foreground">Ortalama Skor</p>
                          <p className={`text-3xl font-semibold tabular-nums ${(stats.quiz.avgScore ?? 0) >= 75 ? "text-emerald-600" : (stats.quiz.avgScore ?? 0) >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                            %{stats.quiz.avgScore != null ? Math.round(stats.quiz.avgScore * 10) / 10 : "—"}
                          </p>
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3 text-center">
                          <p className="text-xs text-muted-foreground">Geçme Oranı (50+)</p>
                          <p className="text-3xl font-semibold tabular-nums text-teal-600">%{stats.quiz.passRate}</p>
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3">
                          <p className="mb-1.5 text-xs text-muted-foreground">Skor Dağılımı</p>
                          <div className="space-y-1">
                            {stats.quiz.buckets.map((b) => (
                              <div key={b.label} className="flex items-center gap-2">
                                <span className="w-12 shrink-0 text-[10px] tabular-nums text-muted-foreground">{b.label}</span>
                                <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
                                  <div
                                    className={`h-full rounded ${b.label === "75-100" ? "bg-emerald-500" : b.label === "50-74" ? "bg-amber-400" : "bg-rose-400"}`}
                                    style={{ width: `${Math.max((b.count / Math.max(stats.quiz?.scoredCount ?? 1, 1)) * 100, b.count > 0 ? 6 : 0)}%` }}
                                  />
                                </div>
                                <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{b.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      {stats.quiz.fields.length > 0 && (
                        <div className="mt-3 space-y-1.5 border-t pt-3">
                          {stats.quiz.fields.map((qf) => (
                            <div key={qf.fieldId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                              <span className="min-w-0 flex-1 truncate font-medium">{qf.label}</span>
                              <span className="text-[11px] text-muted-foreground">
                                doğru cevap: <span className="font-medium text-emerald-700">{qf.correctAnswer ?? "—"}</span>
                              </span>
                              <div className="flex h-1.5 w-24 overflow-hidden rounded bg-muted" title={`${qf.correctCount} doğru / ${qf.wrongCount} yanlış`}>
                                <div className="h-full bg-emerald-500" style={{ width: `${qf.correctRate}%` }} />
                                <div className="h-full bg-rose-400" style={{ width: `${100 - qf.correctRate}%` }} />
                              </div>
                              <span className="w-14 text-right tabular-nums text-muted-foreground">
                                {qf.correctCount}✓ {qf.wrongCount}✗
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>
                  )}
                </div>

                {stats.fields.length === 0 ? (
                  <EmptyState title="Alan istatistiği yok" desc="Formda istatistik hesaplanabilir alan bulunmuyor." />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {stats.fields.map((st) => {
                      const dist = st.distribution ?? [];
                      const maxCount = Math.max(...dist.map((d) => d.count), 1);
                      const isChoice = CHOICE_FIELD_TYPES.includes(st.type);
                      return (
                        <div key={st.fieldId} className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{st.label}</p>
                              <p className="text-xs text-muted-foreground">{label(FORM_FIELD_TYPES, st.type)}</p>
                            </div>
                            {st.mobileInteractive && <Badge variant="outline" className="shrink-0">Mobil Öge</Badge>}
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Yanıt oranı: <span className="font-semibold text-foreground">{st.responseRate}%</span> ({st.responseCount} yanıt)
                          </p>
                          {isChoice && dist.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {dist.map((d) => (
                                <div key={d.value} className="flex items-center gap-2 text-xs">
                                  <span className="w-24 shrink-0 truncate" title={barLabel(d.value)}>{barLabel(d.value)}</span>
                                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.round((d.count / maxCount) * 100)}%` }} />
                                  </div>
                                  <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">{d.count}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {st.numeric && (
                            <p className="mt-2 text-xs">
                              Ort <span className="font-semibold tabular-nums">{st.numeric.avg}</span>
                              <span className="text-muted-foreground"> ({st.numeric.min}–{st.numeric.max})</span>
                            </p>
                          )}
                          {st.samples && st.samples.length > 0 && (
                            <div className="mt-2 space-y-0.5">
                              {st.samples.map((smp, i) => (
                                <p key={i} className="truncate text-xs italic text-muted-foreground">{smp}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null
          )}
        </TabsContent>

        {/* ══ TAB 4 — CANLI KAYIT MASASI ═══════════════════════════════════ */}
        <TabsContent value="live" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Halkaya açık kayıt sayfasının birebir önizlemesi — spam koruması ve online ödeme akışı canlı test edilir.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">Yayındaki form</Label>
              <Select value={liveFormId} onValueChange={setLiveFormId}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Form seçin" /></SelectTrigger>
                <SelectContent>
                  {liveForms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name} · {label(FORM_TYPES, f.type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Chip tone="teal">Ziyaretçi görünümü</Chip>
          </div>

          {liveForms.length === 0 ? (
            <EmptyState
              title="Yayında herkese açık form yok"
              desc="Formlar sekmesinde formu yayınlayın ve Herkese Açık anahtarını açın."
            />
          ) : !liveForm ? (
            <EmptyState title="Form seçin" desc="Önizlemek için yukarıdan yayındaki bir form seçin." />
          ) : (
            <div className="mx-auto w-full max-w-2xl space-y-4">
              <SectionCard title={liveForm.name} desc={liveForm.description ?? undefined}>
                <div className="relative space-y-4">
                  {liveForm.fields.filter(isLiveVisible).map((f) => renderLiveField(f))}

                  <Separator />

                  {/* Ziyaretçi bilgileri — REGISTRATION'da tam, diğerlerinde ad + e-posta */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <Label className="text-xs">Ad Soyad</Label>
                      <Input value={visitor.name} onChange={(e) => setVisitor({ ...visitor, name: e.target.value })} />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">E-posta<span className="text-rose-500"> *</span></Label>
                      <Input type="email" value={visitor.email} onChange={(e) => setVisitor({ ...visitor, email: e.target.value })} />
                    </div>
                    {liveForm.type === "REGISTRATION" && (
                      <>
                        <div className="grid gap-1">
                          <Label className="text-xs">Telefon</Label>
                          <Input type="tel" value={visitor.phone} onChange={(e) => setVisitor({ ...visitor, phone: e.target.value })} />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Kurum</Label>
                          <Input value={visitor.organization} onChange={(e) => setVisitor({ ...visitor, organization: e.target.value })} />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Ödeme yöntemi — sadece online ödemeli kayıt formu */}
                  {liveForm.type === "REGISTRATION" && liveForm.enableOnlinePayment && (
                    <div className="grid gap-1">
                      <Label className="text-xs">Ödeme yöntemi</Label>
                      <Select value={payMethod} onValueChange={setPayMethod}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PAY_METHOD_OPTS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Honeypot — gizli alan, ekran okuyuculardan da saklanır */}
                  {liveForm.honeypotEnabled && (
                    <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden>
                      <Input
                        value={honeypot}
                        name="website"
                        autoComplete="off"
                        tabIndex={-1}
                        onChange={(e) => setHoneypot(e.target.value)}
                      />
                    </div>
                  )}

                  <Button
                    className="w-full"
                    disabled={busy !== null || !visitor.email.trim()}
                    onClick={submitLive}
                  >
                    <Icons.Send className="size-4" /> {busy === "live" ? "Gönderiliyor…" : liveForm.type === "REGISTRATION" ? "Kaydımı Gönder" : "Yanıtı Gönder"}
                  </Button>
                  <p className="text-center text-[11px] text-muted-foreground">
                    Spam koruması aktif: {liveForm.honeypotEnabled ? "honeypot, " : ""}
                    zaman tuzağı {liveForm.minSubmitSeconds ?? 4} sn, e-posta günlük limit {liveForm.maxPerEmailPerDay ?? 5}
                  </p>
                </div>
              </SectionCard>

              {/* Gönderim sonucu */}
              {liveResult && (
                <SectionCard title="Gönderim Sonucu" desc={`Gönderi no: ${liveResult.submissionId.slice(0, 12)}…`}>
                  <div className="space-y-3">
                    {liveResult.status === "SPAM" ? (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                        <p className="flex items-center gap-2 font-semibold">
                          <Icons.ShieldAlert className="size-4" /> Spam şüphesi — gönderi incelemeye alındı
                        </p>
                        <p className="mt-1 text-xs">Skor: {Math.round(liveResult.spamScore)}</p>
                        {liveResult.spamReasons.length > 0 && (
                          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                            {liveResult.spamReasons.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <div className={`rounded-lg border p-4 text-sm ${liveResult.status === "APPROVED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                        <p className="flex items-center gap-2 font-semibold">
                          <Icons.CheckCircle2 className="size-4" />
                          {liveResult.status === "APPROVED" ? "Kaydınız onaylandı" : "Başvurunuz alındı — incelemede"}
                        </p>
                        {liveForm.successMessage && <p className="mt-1 text-xs">{liveForm.successMessage}</p>}
                        {liveResult.registration && (
                          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span>Kayıt No: <span className="font-mono font-semibold">{liveResult.registration.confirmationNo}</span></span>
                            <StatusBadge map={REG_STATUS_MAP} value={liveResult.registration.status} />
                          </p>
                        )}
                      </div>
                    )}
                    {liveResult.chainError && (
                      <p className="text-xs text-rose-600">Kayıt zinciri uyarısı: {liveResult.chainError}</p>
                    )}

                    {/* QA quiz anında puan — doğru cevabı işaretlenmiş sorular için */}
                    {liveResult.quizScore != null && liveResult.status !== "SPAM" && (
                      <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-3 text-sm text-teal-800">
                        <p className="flex items-center gap-2 font-semibold">
                          <Icons.Sigma className="size-4" /> Quiz sonucu: %{Math.round(liveResult.quizScore)}
                          {liveResult.quizCorrect != null && liveResult.quizTotal ? ` — ${liveResult.quizCorrect}/${liveResult.quizTotal} doğru` : ""}
                        </p>
                        <p className="mt-0.5 text-xs">Yanıtınız mobil QA motorunca otomatik puanlandı.</p>
                      </div>
                    )}

                    {/* Online ödeme simülasyonu */}
                    {liveResult.payment && liveResult.status !== "SPAM" && payOutcome?.outcome !== "SUCCEEDED" && (
                      <div className="rounded-lg border p-4">
                        <p className="flex items-center gap-2 text-sm font-semibold">
                          <Icons.CreditCard className="size-4" /> Online Ödeme
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Tutar: <span className="font-semibold text-foreground">{fmtMoney(liveResult.payment.amount, liveResult.payment.currency ?? "TRY")}</span>
                          {liveResult.order && <> · Sipariş {liveResult.order.orderNo}</>}
                        </p>
                        {payOutcome?.outcome === "FAILED" && (
                          <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                            {payOutcome.message} — kart bilgilerini düzeltip tekrar deneyin.
                          </p>
                        )}
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="grid gap-1 sm:col-span-2">
                            <Label className="text-xs">Kart üzerindeki isim</Label>
                            <Input value={pay.cardHolder} onChange={(e) => setPay({ ...pay, cardHolder: e.target.value })} />
                          </div>
                          <div className="grid gap-1 sm:col-span-2">
                            <Label className="text-xs">Kart numarası</Label>
                            <Input
                              inputMode="numeric" placeholder="4242 4242 4242 4242"
                              value={pay.cardNumber}
                              onChange={(e) => setPay({ ...pay, cardNumber: e.target.value })}
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">Son kullanma</Label>
                            <Input placeholder="AA/YY" value={pay.expiry} onChange={(e) => setPay({ ...pay, expiry: e.target.value })} />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">CVC</Label>
                            <Input placeholder="123" value={pay.cvc} onChange={(e) => setPay({ ...pay, cvc: e.target.value })} />
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            disabled={busy !== null || !pay.cardHolder.trim() || !pay.cardNumber.trim() || !pay.expiry.trim() || !pay.cvc.trim()}
                            onClick={processPayment}
                          >
                            <Icons.Lock className="size-3.5" /> {busy === "pay" ? "İşleniyor…" : "Ödemeyi Tamamla"}
                          </Button>
                          <Chip tone="teal">4242 4242 4242 4242 → Başarılı</Chip>
                          <Chip tone="neutral">**0000 → Red</Chip>
                        </div>
                      </div>
                    )}
                    {payOutcome?.outcome === "SUCCEEDED" && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                        <p className="flex items-center gap-2 font-semibold">
                          <Icons.CheckCircle2 className="size-4" /> Ödeme başarılı
                        </p>
                        <p className="mt-1 text-xs">
                          Referans: <span className="font-mono">{payOutcome.payment?.reference ?? "—"}</span>
                          {payOutcome.message ? ` · ${payOutcome.message}` : ""}
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={resetLive}>
                        <Icons.RotateCcw className="size-3.5" /> Yeni Gönderim
                      </Button>
                    </div>
                  </div>
                </SectionCard>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ══ YENİ FORM DİALOGU ══════════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto maven-scroll sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Yeni Form</DialogTitle>
            <DialogDescription>
              Kayıt formu, anket, geri bildirim veya mobil interaktif QA ögesi oluşturun.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Form adı</Label>
              <Input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="Örn. Online Kayıt Formu" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Tür</Label>
              <Select value={newForm.type} onValueChange={(v) => setNewForm({ ...newForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FORM_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{FORM_TYPE_HINTS[newForm.type]}</p>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Açıklama</Label>
              <Textarea rows={2} value={newForm.description} onChange={(e) => setNewForm({ ...newForm, description: e.target.value })} />
            </div>

            <Separator />
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <Icons.ShieldCheck className="size-3.5 text-teal-600" /> Spam Koruması
            </p>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Gizli alan tuzağı (honeypot)</p>
                <p className="text-xs text-muted-foreground">Gizli alan botları yakalar</p>
              </div>
              <Switch
                checked={newForm.honeypotEnabled}
                aria-label="Honeypot"
                onCheckedChange={(v) => setNewForm({ ...newForm, honeypotEnabled: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label className="text-xs">Zaman tuzağı (sn)</Label>
                <Input type="number" min={0} value={newForm.minSubmitSeconds} onChange={(e) => setNewForm({ ...newForm, minSubmitSeconds: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">E-posta günlük limit</Label>
                <Input type="number" min={1} value={newForm.maxPerEmailPerDay} onChange={(e) => setNewForm({ ...newForm, maxPerEmailPerDay: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Engelli alan adları (virgülle ayır)</Label>
              <Input value={newForm.blockedDomains} placeholder="spam.xyz, tempmail.xyz" onChange={(e) => setNewForm({ ...newForm, blockedDomains: e.target.value })} />
            </div>

            {newForm.type === "REGISTRATION" && (
              <>
                <Separator />
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Icons.CreditCard className="size-3.5 text-emerald-600" /> Kayıt &amp; Ödeme
                </p>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Online ödeme aktif</p>
                    <p className="text-xs text-muted-foreground">Kayıt sonrası sanal POS adımı gösterilir</p>
                  </div>
                  <Switch
                    checked={newForm.enableOnlinePayment}
                    aria-label="Online ödeme"
                    onCheckedChange={(v) => setNewForm({ ...newForm, enableOnlinePayment: v })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Varsayılan kategori</Label>
                  <Select value={newForm.defaultCategoryId} onValueChange={(v) => setNewForm({ ...newForm, defaultCategoryId: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTO">Kategori otomatik</SelectItem>
                      {categoryList.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Temiz gönderileri otomatik onayla</p>
                    <p className="text-xs text-muted-foreground">Spam eşiği altındakiler doğrudan onaylanır</p>
                  </div>
                  <Switch
                    checked={newForm.autoApprove}
                    aria-label="Otomatik onay"
                    onCheckedChange={(v) => setNewForm({ ...newForm, autoApprove: v })}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Vazgeç</Button>
            <Button disabled={busy !== null || !newForm.name.trim()} onClick={createForm}>
              {busy === "create" ? "Oluşturuluyor…" : "Formu Oluştur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ ALAN EKLE DİALOGU ══════════════════════════════════════════════ */}
      <Dialog open={fieldOpen} onOpenChange={(o) => !o && setFieldOpen(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto maven-scroll sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Alan Ekle</DialogTitle>
            <DialogDescription>
              {selectedForm ? `${selectedForm.name} — yeni alan sıra ${selectedForm.fields.length + 1} olarak eklenir.` : "Form seçilmedi."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Etiket</Label>
              <Input value={newField.label} onChange={(e) => setNewField({ ...newField, label: e.target.value })} placeholder="Örn. Kurum Adı" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Alan türü</Label>
              <Select
                value={newField.type}
                onValueChange={(v) =>
                  setNewField((p) => ({
                    ...p,
                    type: v,
                    mobileInteractive: MOBILE_TYPES.includes(v) ? true : p.mobileInteractive,
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FORM_FIELD_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {newField.type !== "SECTION" && (
              <div className="grid gap-1">
                <Label className="text-xs">Placeholder</Label>
                <Input value={newField.placeholder} onChange={(e) => setNewField({ ...newField, placeholder: e.target.value })} />
              </div>
            )}
            <div className="grid gap-1">
              <Label className="text-xs">Yardım metni</Label>
              <Input value={newField.helpText} onChange={(e) => setNewField({ ...newField, helpText: e.target.value })} />
            </div>
            {OPTION_FIELD_TYPES.includes(newField.type) && (
              <div className="grid gap-1">
                <Label className="text-xs">Seçenekler</Label>
                <Textarea
                  rows={3}
                  value={newField.options}
                  placeholder={"Seçenek başına bir satır:\nKongre Kaydı\nWorkshop\nGala Yemeği"}
                  onChange={(e) => setNewField({ ...newField, options: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label className="text-xs">Zorunluluk</Label>
                <Select value={newField.required} onValueChange={(v) => setNewField({ ...newField, required: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPTIONAL">Opsiyonel</SelectItem>
                    <SelectItem value="ALWAYS">Zorunlu</SelectItem>
                    <SelectItem value="CONDITIONAL">Koşullu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Gizlilik</Label>
                <Select value={newField.sensitivity} onValueChange={(v) => setNewField({ ...newField, sensitivity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SENSITIVITY_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {newField.required === "CONDITIONAL" && (
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label className="text-xs">Koşul alanı (önceki sorunun etiketi)</Label>
                  <Input value={newField.conditionField} onChange={(e) => setNewField({ ...newField, conditionField: e.target.value })} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Koşul değeri</Label>
                  <Input
                    value={newField.conditionValue}
                    placeholder="Onay kutusu için true"
                    onChange={(e) => setNewField({ ...newField, conditionValue: e.target.value })}
                  />
                </div>
              </div>
            )}
            {MOBILE_TYPES.includes(newField.type) && (
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-teal-50/40 p-3">
                <div>
                  <p className="text-sm font-medium">Mobil uygulamada interaktif öge</p>
                  <p className="text-xs text-muted-foreground">Bu tür mobil interaktif olarak otomatik açıldı</p>
                </div>
                <Switch
                  checked={newField.mobileInteractive}
                  aria-label="Mobil interaktif"
                  onCheckedChange={(v) => setNewField({ ...newField, mobileInteractive: v })}
                />
              </div>
            )}
            {newField.type === "QA_QUIZ" && (
              <div className="rounded-lg border bg-emerald-50/40 p-3">
                <Label className="text-xs font-medium">Doğru Cevap (QA motoru puanlaması)</Label>
                <Select
                  value={newField.correctAnswer || undefined}
                  onValueChange={(v) => setNewField({ ...newField, correctAnswer: v })}
                >
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Seçeneklerden seçin…" /></SelectTrigger>
                  <SelectContent>
                    {newField.options.split("\n").map((s) => s.trim()).filter(Boolean).map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  İşaretlenirse gönderiler otomatik puanlanır (quiz skoru %) — mobil uygulamada interaktif test olarak çalışır.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldOpen(false)}>Vazgeç</Button>
            <Button disabled={busy !== null || !newField.label.trim() || !selectedForm} onClick={addField}>
              {busy === "field" ? "Ekleniyor…" : "Alanı Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ GÖNDERİ DETAY DİALOGU ══════════════════════════════════════════ */}
      <Dialog open={detailId !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-2xl">
          {detailLoading || !detail ? (
            <Loading rows={4} />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {detail.respondentName}
                  <StatusBadge map={FORM_SUBMISSION_STATUS} value={detail.status} />
                </DialogTitle>
                <DialogDescription>
                  {detail.form?.name} · {fmtDateTime(detail.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div><span className="text-xs text-muted-foreground">E-posta</span><p>{detail.respondentEmail}</p></div>
                <div><span className="text-xs text-muted-foreground">Telefon</span><p>{detail.phone ?? "—"}</p></div>
                <div><span className="text-xs text-muted-foreground">Kurum</span><p>{detail.organization ?? "—"}</p></div>
                <div><span className="text-xs text-muted-foreground">Kaynak</span><p>{label(SUBMISSION_SOURCES, detail.source)}</p></div>
                <div><span className="text-xs text-muted-foreground">Doldurma süresi</span><p>{detail.elapsedSeconds != null ? `${Math.round(detail.elapsedSeconds)} sn` : "—"}</p></div>
                <div><span className="text-xs text-muted-foreground">Gönderi IP</span><p className="font-mono text-xs">{detail.submitIp ?? "—"}</p></div>
              </div>

              {(detail.spamScore > 0 || parseJsonArray(detail.spamReasons).length > 0) && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <p className="font-semibold">Spam puanı: {Math.round(detail.spamScore)}</p>
                  {parseJsonArray(detail.spamReasons).length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {parseJsonArray(detail.spamReasons).map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                </div>
              )}

              <Separator />
              <p className="text-xs font-semibold">Alan Yanıtları</p>
              {(detail.quizScore != null) && (
                <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-3 text-xs text-teal-800">
                  <p className="flex items-center gap-2 font-semibold">
                    <Icons.Sigma className="size-3.5" /> Quiz skoru: %{Math.round(detail.quizScore)}
                    {detail.quizCorrect != null && detail.quizTotal ? ` — ${detail.quizCorrect}/${detail.quizTotal} doğru` : ""}
                  </p>
                </div>
              )}
              <div className="max-h-64 space-y-1.5 overflow-y-auto maven-scroll pr-1">
                {(detail.form?.fields ?? [])
                  .filter((f) => f.type !== "SECTION")
                  .map((f) => {
                    const raw = detail.answers.find((a) => a.fieldId === f.id)?.answer ?? "";
                    let shown = raw;
                    if (f.type === "MULTI_CHOICE" || f.type === "QA_QUIZ") shown = parseJsonArray(raw).join(", ") || "—";
                    else if (f.type === "CHECKBOX") shown = raw === "true" ? "Evet" : raw === "false" ? "Hayır" : "—";
                    const isQuiz = f.type === "QA_QUIZ" && Boolean(f.correctAnswer);
                    const isCorrect = isQuiz && raw.trim() === f.correctAnswer;
                    return (
                      <div key={f.id} className={`flex items-start justify-between gap-3 rounded-md px-2.5 py-1.5 text-xs ${isQuiz ? (isCorrect ? "border border-emerald-200 bg-emerald-50" : "border border-rose-200 bg-rose-50") : "bg-muted/50"}`}>
                        <span className="min-w-0 shrink-0 font-medium">
                          {f.label}
                          {isQuiz && (
                            <span className={`ml-1.5 inline-flex items-center gap-0.5 align-middle text-[10px] font-semibold ${isCorrect ? "text-emerald-700" : "text-rose-700"}`}>
                              {isCorrect ? <Icons.Check className="size-3" /> : <Icons.X className="size-3" />}
                              {isCorrect ? "doğru" : `yanlış — doğrusu: ${f.correctAnswer}`}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-right text-muted-foreground" title={shown}>{shown || "—"}</span>
                      </div>
                    );
                  })}
              </div>

              {detail.registration && (
                <>
                  <Separator />
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
                    <span className="text-xs text-muted-foreground">Bağlı kayıt:</span>
                    <span className="font-mono text-xs font-semibold">{detail.registration.confirmationNo}</span>
                    <StatusBadge map={REG_STATUS_MAP} value={detail.registration.status} />
                    {detail.registration.category && <Chip tone="teal">{detail.registration.category.name}</Chip>}
                    {detail.registration.participation?.person && (
                      <span className="text-xs text-muted-foreground">
                        {detail.registration.participation.person.firstName} {detail.registration.participation.person.lastName}
                      </span>
                    )}
                  </div>
                </>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailId(null)}>Kapat</Button>
                {detail.status !== "SPAM" ? (
                  <>
                    <Button
                      variant="destructive" disabled={busy !== null}
                      onClick={async () => { await submissionAction(detail.id, "reject"); setDetailId(null); }}
                    >
                      <Icons.X className="size-3.5" /> Ret
                    </Button>
                    <Button disabled={busy !== null} onClick={async () => { await submissionAction(detail.id, "approve"); setDetailId(null); }}>
                      <Icons.Check className="size-3.5" /> Onayla
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline" disabled={busy !== null}
                    onClick={async () => { await submissionAction(detail.id, "pending"); setDetailId(null); }}
                  >
                    <Icons.Undo2 className="size-3.5" /> İncelemeye Al
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
