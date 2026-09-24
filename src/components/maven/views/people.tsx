"use client";
// Kişiler & Kurum/Kuruluşlar — 360 görünümleri (§54, §55)
// Kişi 360: kimlik → katılımlar → roller → kayıt/ödeme → bilimsel → program → konaklama → yaka kartı/tarama → sertifika
// R9-c: Roller & Yetkiler sekmesi (özel rol motoru + hiyerarşi + giriş mock'u), CV & VCard, aile/refakatçi,
//       kurumsal kimlik kartı + kontak yönetimi + kurum QR paneli
// R10-a: çift tık → kişi düzenleme, kişi fotoğrafı + kurum logosu (upload-linked, benzersiz adla medya klasörüne)
import { useEffect, useMemo, useRef, useState } from "react";
import { listEntity, listEntityPaged, apiSend, apiGet } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { fmtDate, fmtDateTime, fmtMoney, EVENT_ROLES, REG_SOURCES, FUNDING_SOURCES, REGISTRATION_STATUS, PAYMENT_STATUS, ATTENDANCE_STATUS, SUBMISSION_STATUS, SESSION_STATUS, ACCOMMODATION_STATUS, BADGE_STATUS, CERTIFICATE_STATUS, CAPABILITIES, CONTACT_ROLE, RELATION_TYPE, CV_KIND, MATERIAL_TYPE, label } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLang, t, tLabel } from "@/lib/i18n";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

interface PersonRow {
  id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; company?: string | null; title?: string | null; city?: string | null; country?: string | null; status: string; mergedIntoId?: string | null;
  parentPersonId?: string | null; relationType?: string | null; photoUrl?: string | null; bio?: string | null; linkedin?: string | null;
}
interface Person360 {
  person: PersonRow;
  participations: {
    id: string; source: string; attendance: string; editionId: string;
    edition: { name: string; startDate?: string | null };
    registrations: { id: string; status: string; fundingSource: string; confirmationNo: string; category?: { name: string } | null }[];
    roleAssignments: { id: string; role: string; status: string }[];
    programAssignments: { id: string; role: string; status: string; session: { title: string; startTime: string; status: string } }[];
    scanEvents: { id: string; action: string; result: string; scannedAt: string; location: string }[];
    certIssues: { id: string; status: string; definition: { name: string } }[];
    badgeInstances: { id: string; status: string; profile?: { name: string } | null }[];
  }[];
  submissions: { id: string; code: string; title: string; status: string }[];
  reviewAssignments: { id: string; status: string; submission: { code: string; title: string } }[];
}
// Mükerrer kişi önerileri (R2-b) — /api/people/duplicates sözleşmesi (tenant geneli, edisyon-bağımsız)
interface DuplicatePerson { id: string; fullName: string; email?: string | null; phone?: string | null; title?: string | null; company?: string | null; city?: string | null; status: string; createdAt: string; }
interface DuplicateSuggestion { key: string; reason: string; persons: DuplicatePerson[]; olderId?: string | null; note?: string | null; }
interface DuplicatesData { totalPersons: number; suggestions: DuplicateSuggestion[]; reasonLabels: Record<string, string>; }

// Birleştirme önizlemesi (/api/people/merge-preview sözleşmesi)
interface MergePreviewSide { participationId: string; regStatus: string | null; regNo: string | null; categoryName: string | null; attendance: string; badgeCount: number; }
interface MergeConflictEdition { editionId: string; editionName: string; startDate: string; source: MergePreviewSide; target: MergePreviewSide; defaultWinner: "target" | "source"; }
interface MergePreview {
  source: { id: string; firstName: string; lastName: string; createdAt: string };
  target: { id: string; firstName: string; lastName: string; createdAt: string };
  conflictingEditions: MergeConflictEdition[];
  movableParticipations: number;
  moves: { submissions: number; authorships: number; reviewAssignments: number; scanEvents: number; tasks: number; contacts: number; delegationsLed: number; waitlistEntries: number };
  fieldDiffs: { field: string; source: string | null; target: string | null; kind: "fill" | "conflict" }[];
  loserBadges: number;
}
const MERGE_FIELD_LABELS: Record<string, string> = { email: "E-posta", phone: "Telefon", title: "Unvan", company: "Kurum", city: "Şehir", country: "Ülke", bio: "Bio" };
const MERGE_MOVE_LABELS: Record<string, string> = {
  submissions: "bildiri", authorships: "yazarlık", reviewAssignments: "hakemlik", scanEvents: "saha taraması",
  tasks: "görev", contacts: "iletişim", delegationsLed: "delegasyon liderliği", waitlistEntries: "bekleme kaydı",
};
const REASON_TONE: Record<string, "emerald" | "amber" | "violet"> = { EMAIL: "emerald", NAME_PHONE: "amber", NAME_ORG: "violet" };
interface OrgRow { id: string; name: string; type?: string | null; city?: string | null; country?: string | null; website?: string | null; generalEmail?: string | null; address?: string | null; description?: string | null; locationNote?: string | null; logoUrl?: string | null; _count?: { eventAssignments?: number; sponsorAgreements?: number } }
interface Org360 {
  organization: OrgRow;
  eventAssignments: { id: string; role: string; edition: { name: string } }[];
  sponsorAgreements: { id: string; amount: number; currency: string; status: string; tier?: { name: string } | null; package?: { name: string } | null; deliverables: { id: string; name: string; status: string }[] }[];
  entitlements: { id: string; label: string; type: string; quantityGranted: number; quantityConsumed: number; quantityReserved: number }[];
  boothAllocations: { id: string; status: string; boothUnit: { code: string; sizeSqm: number } }[];
  orders: { id: string; orderNo: string; totalAmount: number; status: string; currency: string }[];
  contacts: OrgContactRow[];
}

// ── R9-c: yeni varlık sözleşmeleri ──────────────────────────────────────────
interface CustomRoleRow { id: string; editionId: string; key: string; name: string; color?: string | null; hierarchyLevel: number; permissions?: string | null; description?: string | null; isSystem: boolean; isActive: boolean; }
interface CvEntryRow { id: string; personId: string; editionId: string; kind: string; title: string; organization?: string | null; city?: string | null; startDate?: string | null; endDate?: string | null; isCurrent: boolean; description?: string | null; order: number; }
interface PersonVCard { vcard: string; qrDataUrl: string; person: { id: string; fullName: string; title?: string | null; company?: string | null; email?: string | null; phone?: string | null; edition?: string | null; roles: string[] }; }
interface OrgVCard { vcard: string; qrDataUrl: string; locationQrDataUrl: string; locationPayload: string; organization: { id: string; name: string; type?: string | null; website?: string | null; generalEmail?: string | null; address?: string | null; locationNote?: string | null; logoUrl?: string | null; contacts: { id: string; name: string; role: string; email?: string | null; phone?: string | null; isPrimary: boolean }[] }; }
interface OrgContactRow { id: string; organizationId: string; personId?: string | null; name: string; title?: string | null; email?: string | null; phone?: string | null; isPrimary: boolean; role: string; department?: string | null; }
interface ParticipationLite { id: string; person: { firstName: string; lastName: string; company?: string | null }; }

// ── R9-c: yerel sabitler ────────────────────────────────────────────────────
// Rol renk paleti (teal/amber ağırlıklı — maven renk dili)
const ROLE_COLORS = [
  { key: "teal", label: "Turkuaz" }, { key: "amber", label: "Kehribar" }, { key: "violet", label: "Menekşe" },
  { key: "emerald", label: "Zümrüt" }, { key: "rose", label: "Gül" }, { key: "neutral", label: "Nötr" },
] as const;
const ROLE_SOLID: Record<string, string> = {
  teal: "bg-teal-500 text-white", amber: "bg-amber-500 text-white", violet: "bg-violet-500 text-white",
  emerald: "bg-emerald-500 text-white", rose: "bg-rose-500 text-white", neutral: "bg-neutral-400 text-white",
};
const ROLE_DOT: Record<string, string> = {
  teal: "bg-teal-500", amber: "bg-amber-500", violet: "bg-violet-500", emerald: "bg-emerald-500", rose: "bg-rose-500", neutral: "bg-neutral-400",
};
const ROLE_RING: Record<string, string> = {
  teal: "ring-teal-500/25", amber: "ring-amber-500/25", violet: "ring-violet-500/25",
  emerald: "ring-emerald-500/25", rose: "ring-rose-500/25", neutral: "ring-neutral-400/25",
};
// hiyerarşi dairesi boyutu — küçük seviye no = en üst → büyük daire
const railSize = (lvl: number) => (lvl <= 20 ? "size-16 text-sm" : lvl <= 40 ? "size-12 text-xs" : lvl <= 60 ? "size-10 text-[11px]" : "size-9 text-[10px]");
const CAP_LABEL: Record<string, string> = Object.fromEntries(CAPABILITIES.map((c) => [c.key, c.label]));
// Kurum türleri — PCO eklendi (düşünce bulutu 5); sponsor TÜR değil, edisyona atanan ROL'dür (§4)
const ORG_TYPES: Record<string, string> = {
  COMPANY: "Şirket", ASSOCIATION: "Dernek", UNIVERSITY: "Üniversite", PCO: "PCO (Profesyonel Organizatör)",
  AGENCY: "Ajans", VENUE: "Mekân", HOTEL: "Otel", PUBLIC_AUTHORITY: "Kamu", MEDIA: "Medya",
};
// sponsor teslim durumları — sabit map, render'da tLabel köprüsüyle çevrilir
const DELIVERABLE_MAP: Record<string, string> = {
  NOT_STARTED: "Başlamadı", WAITING_SPONSOR: "Sponsor bekliyor", SUBMITTED: "Gönderildi", UNDER_REVIEW: "İncelemede",
  APPROVED: "Onaylandı", REJECTED: "Reddedildi", COMPLETED: "Tamamlandı",
};
const CV_KIND_ORDER = ["EDUCATION", "EXPERIENCE", "AWARD", "LANGUAGE", "PUBLICATION", "CERTIFICATION"] as const;
const parsePerms = (raw?: string | null): string[] => { try { const p = JSON.parse(raw ?? "[]"); return Array.isArray(p) ? p.map(String) : []; } catch { return []; } };
const slugifyKey = (s: string) =>
  s.toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
const fullName = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : "—");

// ── R10-a: bağlantılı medya yükleyici (kişi fotoğrafı / kurum logosu) ───────
// Kullanıcı kuralı: görsel, kaynak kaydıyla birlikte BENZERSİZ adla medya
// klasörüne eklenir (POST /api/media/upload-linked) → PUT ile kayda yazılır.
interface LinkedAsset { id: string; name: string; dataUrl?: string | null }
interface UploadLinkedResult { asset: LinkedAsset; folder: { id: string; name: string; systemKey: string } }
const MAX_IMAGE_KB = 600; // SQLite satırı tavanı — sunucu tarafıyla aynı

function LinkedPhotoUploader({
  editionId, systemFolder, linkedType, linkedId, assetName, currentUrl, onApply, folderLabel, alt, fit = "cover",
}: {
  editionId: string | null;
  systemFolder: string; // KISI_FOTOGRAF | KURUM_LOGO
  linkedType: "PERSON" | "ORGANIZATION";
  linkedId: string;
  assetName: string;
  currentUrl?: string | null;
  onApply: (dataUrl: string) => Promise<void>;
  folderLabel: string;
  alt: string;
  fit?: "cover" | "contain";
}) {
  const { toast } = useToast();
  useLang(); // dil değişiminde yeniden render
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  useEffect(() => { setPreview(currentUrl ?? null); }, [currentUrl]);

  const pick = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = ""; // aynı dosya yeniden seçilebilsin
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: t("people.upload.badTypeTitle"), description: t("people.upload.badTypeDesc"), variant: "destructive" });
      return;
    }
    if (file.size > MAX_IMAGE_KB * 1024) {
      toast({ title: t("people.upload.tooBigTitle"), description: t("people.upload.tooBigDesc", { max: MAX_IMAGE_KB }), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error(t("people.upload.readFailed")));
        fr.readAsDataURL(file);
      });
      const res = await apiSend<UploadLinkedResult>("/api/media/upload-linked", "POST", {
        editionId, systemFolder, name: assetName, dataUrl, linkedType, linkedId,
      });
      const finalUrl = res.asset.dataUrl ?? dataUrl;
      await onApply(finalUrl);
      setPreview(finalUrl);
      toast({ title: t("people.upload.loaded"), description: t("people.upload.loadedDesc", { folder: folderLabel, name: res.asset.name }) });
    } catch (e) {
      toast({ title: t("people.upload.failed"), description: e instanceof Error ? e.message : t("people.upload.failedDesc"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-3">
      {preview ? (
        <img src={preview} alt={alt} className={cn("size-14 shrink-0 rounded-lg border bg-background", fit === "contain" ? "object-contain p-0.5" : "object-cover")} />
      ) : (
        <span className="grid size-14 shrink-0 place-items-center rounded-lg border border-dashed bg-muted/30 text-muted-foreground" aria-hidden>
          <Icons.ImageUp className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy || !editionId} onClick={() => fileRef.current?.click()}>
            {busy ? <Icons.Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Icons.ImageUp className="size-3.5" />}
            {preview ? t("people.upload.change") : t("people.upload.pick")}
          </Button>
          <span className="text-[11px] text-muted-foreground">{preview ? t("people.upload.attached") : t("people.upload.none")}</span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{t("people.upload.helper", { folder: folderLabel, max: MAX_IMAGE_KB })}</p>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={pick} disabled={busy} aria-label={t("people.upload.ariaPick")} />
    </div>
  );
}

function Row360Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

// Mükerrer öneri satırındaki tek kişi kartı (kimlik özeti + kayıt tarihi)
function DupPersonCard({ p }: { p: DuplicatePerson }) {
  useLang(); // dil değişiminde yeniden render
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3">
      <p className="truncate text-sm font-semibold">{p.fullName}</p>
      {p.email && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
      {(p.company || p.title) && <p className="truncate text-xs text-muted-foreground">{[p.company, p.title].filter(Boolean).join(" · ")}</p>}
      <p className="mt-1 text-[11px] text-muted-foreground">{t("people.dup.registeredAt")} {fmtDate(p.createdAt)}</p>
    </div>
  );
}

// ── R9-c: CV zaman çizelgesi (kişi 360 içi) ─────────────────────────────────
function CvPanel({ personId, editionId }: { personId: string; editionId: string | null }) {
  const { toast } = useToast();
  useLang(); // dil değişiminde yeniden render
  const { data: cvs, error, reload, loading } = useApi<CvEntryRow[]>(
    () => listEntity<CvEntryRow>("cv-entries", { personId, limit: 100 }),
    [personId],
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CvEntryRow | null>(null);
  const [busy, setBusy] = useState(false);
  const empty = { kind: "EXPERIENCE", title: "", organization: "", city: "", startDate: "", endDate: "", isCurrent: false, description: "", order: "0" };
  const [form, setForm] = useState(empty);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (c: CvEntryRow) => {
    setEditing(c);
    setForm({
      kind: c.kind, title: c.title, organization: c.organization ?? "", city: c.city ?? "",
      startDate: c.startDate ? c.startDate.slice(0, 10) : "", endDate: c.endDate ? c.endDate.slice(0, 10) : "",
      isCurrent: c.isCurrent, description: c.description ?? "", order: String(c.order ?? 0),
    });
    setOpen(true);
  };
  const save = async () => {
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      const payload = {
        personId, editionId,
        kind: form.kind, title: form.title.trim(), organization: form.organization || null, city: form.city || null,
        startDate: form.startDate || null, endDate: form.isCurrent ? null : form.endDate || null,
        isCurrent: form.isCurrent, description: form.description || null, order: Number(form.order) || 0,
      };
      if (editing) await apiSend(`/api/cv-entries/${editing.id}`, "PUT", payload);
      else await apiSend("/api/cv-entries", "POST", payload);
      toast({ title: editing ? t("people.cv.updated") : t("people.cv.added"), description: form.title });
      setOpen(false); reload();
    } catch (e) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : t("people.cv.saveFailed"), variant: "destructive" });
    } finally { setBusy(false); }
  };
  const remove = async (c: CvEntryRow) => {
    try {
      await apiSend(`/api/cv-entries/${c.id}`, "DELETE");
      toast({ title: t("people.cv.deleted"), description: c.title });
      reload();
    } catch (e) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : t("people.deleteFailed"), variant: "destructive" });
    }
  };

  const groups = CV_KIND_ORDER.map((k) => ({ kind: k, items: (cvs ?? []).filter((c) => c.kind === k).sort((a, b) => a.order - b.order) })).filter((g) => g.items.length > 0);
  const canAdd = Boolean(editionId);

  return (
    <SectionCard
      title={t("people.cv.title")}
      desc={t("people.cv.desc")}
      action={
        <Button size="sm" variant="outline" onClick={openNew} disabled={!canAdd} aria-label={t("people.cv.addAria")}>
          <Icons.Plus className="size-3.5" /> {t("people.add")}
        </Button>
      }
    >
      {!canAdd && <p className="mb-2 text-[11px] text-amber-600">{t("people.cv.needEdition")}</p>}
      {loading ? <Loading rows={2} /> : error ? <ErrorState message={error} onRetry={reload} /> : groups.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">{t("people.cv.empty")}</p>
      ) : (
        <div className="maven-scroll max-h-96 space-y-4 overflow-y-auto pr-1">
          {groups.map((g, gi) => (
            <div key={g.kind} className="maven-stagger-item" style={{ animationDelay: `${gi * 60}ms` }}>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                <Chip tone="teal">{tLabel(CV_KIND, g.kind)}</Chip>
                <span className="font-normal tabular-nums text-muted-foreground">{t("people.cv.count", { count: g.items.length })}</span>
              </p>
              {/* zaman çizelgesi: sol hat + nokta düğümleri */}
              <ol className="relative ml-1.5 space-y-3 border-l-2 border-teal-500/25 pl-4">
                {g.items.map((c) => (
                  <li key={c.id} className="group relative">
                    <span className="absolute -left-[21.5px] top-1.5 size-2.5 rounded-full border-2 border-teal-500/60 bg-background" aria-hidden />
                    <div className="rounded-lg border bg-muted/20 p-2.5 transition-colors hover:border-teal-500/30 hover:bg-muted/40">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <p className="min-w-0 text-sm font-medium leading-tight">{c.title}</p>
                        <span className="flex shrink-0 items-center gap-1">
                          {c.isCurrent && <Chip tone="emerald">{t("people.cv.ongoing")}</Chip>}
                          <button onClick={() => openEdit(c)} className="rounded p-1 text-muted-foreground opacity-60 transition hover:bg-muted hover:text-foreground group-hover:opacity-100" aria-label={t("people.cv.editAria", { title: c.title })}>
                            <Icons.Pencil className="size-3.5" />
                          </button>
                          <button onClick={() => remove(c)} className="rounded p-1 text-muted-foreground opacity-60 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100" aria-label={t("people.cv.deleteAria", { title: c.title })}>
                            <Icons.Trash2 className="size-3.5" />
                          </button>
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {[c.organization, c.city].filter(Boolean).join(" · ")}
                        {(c.startDate || c.endDate) && (
                          <span className="tabular-nums"> · {fmtDate(c.startDate)} — {c.isCurrent ? "…" : fmtDate(c.endDate)}</span>
                        )}
                      </p>
                      {c.description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.description}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t("people.cv.editTitle") : t("people.cv.newTitle")}</DialogTitle>
            <DialogDescription>{t("people.cv.dialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("people.lblType")}</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CV_KIND).map(([k]) => <SelectItem key={k} value={k}>{tLabel(CV_KIND, k)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("people.cv.order")}</Label><Input type="number" className="mt-1 tabular-nums" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>{t("people.cv.titleLabel")}</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("people.cv.titlePlaceholder")} /></div>
            <div><Label>{t("people.cv.orgSchool")}</Label><Input className="mt-1" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} /></div>
            <div><Label>{t("people.lblCity")}</Label><Input className="mt-1" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div><Label>{t("people.cv.start")}</Label><Input type="date" className="mt-1 tabular-nums" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div>
              <Label className={cn(form.isCurrent && "opacity-50")}>{t("people.cv.end")}</Label>
              <Input type="date" className="mt-1 tabular-nums" disabled={form.isCurrent} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="cv-current" checked={form.isCurrent} onCheckedChange={(v) => setForm({ ...form, isCurrent: v === true })} />
              <Label htmlFor="cv-current" className="cursor-pointer text-sm font-normal">{t("people.cv.ongoing")}</Label>
            </div>
            <div className="sm:col-span-2"><Label>{t("people.lblDesc")}</Label><Textarea className="mt-1" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("people.cancel")}</Button>
            <Button onClick={save} disabled={busy || !form.title.trim()}>{busy ? t("people.saving") : t("people.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// ── R9-c: QR VCard kartı (kişi 360 içi) ─────────────────────────────────────
function VCardPanel({ personId }: { personId: string }) {
  const { toast } = useToast();
  useLang(); // dil değişiminde yeniden render
  const { data, error, reload, loading } = useApi<PersonVCard | null>(
    () => apiGet<PersonVCard>(`/api/people/${personId}/vcard?format=json`),
    [personId],
  );
  const copyQr = async () => {
    if (!data?.qrDataUrl) return;
    try {
      await navigator.clipboard.writeText(data.qrDataUrl);
      toast({ title: t("people.vcard.copied"), description: t("people.vcard.copiedDesc") });
    } catch {
      toast({ title: t("people.copyFailTitle"), description: t("people.copyFailDesc"), variant: "destructive" });
    }
  };

  const noContact = data && !data.person.email && !data.person.phone;

  return (
    <SectionCard
      title={t("people.vcard.title")}
      desc={t("people.vcard.desc")}
      action={
        data && (
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/people/${personId}/vcard?format=vcf`} download>
              <Icons.Download className="size-3.5" /> {t("people.vcard.download")}
            </a>
          </Button>
        )
      }
    >
      {loading ? <Loading rows={2} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data ? (
        <p className="text-xs text-muted-foreground">{t("people.vcard.genFailed")}</p>
      ) : noContact ? (
        <EmptyState title={t("people.vcard.noContactTitle")} desc={t("people.vcard.noContactDesc")} />
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row">
          {/* QR — köşe vurgulu ince çerçeve */}
          <div className="maven-qrvcard mx-auto shrink-0 sm:mx-0">
            <img src={data.qrDataUrl} alt={t("people.vcard.qrAlt", { name: data.person.fullName })} width={120} height={120} className="size-[120px]" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-sm font-semibold leading-tight">{data.person.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{[data.person.title, data.person.company].filter(Boolean).join(" · ") || "—"}</p>
              {data.person.edition && <p className="mt-0.5 text-[11px] text-muted-foreground">{t("people.vcard.lastEdition", { edition: data.person.edition })}</p>}
            </div>
            <div className="flex flex-wrap gap-1">
              {data.person.roles.slice(0, 4).map((r) => <Chip key={r} tone="teal">{tLabel(EVENT_ROLES, r)}</Chip>)}
              {data.person.roles.length > 4 && <Chip tone="neutral">+{data.person.roles.length - 4}</Chip>}
              {data.person.roles.length === 0 && <span className="text-[11px] text-muted-foreground">{t("people.vcard.noRoles")}</span>}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="ghost" className="h-7" onClick={copyQr}>
                <Icons.Copy className="size-3.5" /> {t("people.vcard.copyQr")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── R9-c: Aile / refakatçi bağları (kişi 360 içi) ───────────────────────────
function FamilyPanel({ person }: { person: PersonRow }) {
  useLang(); // dil değişiminde yeniden render
  // refakatçiler: aynı soyadla arama → client'ta parentPersonId filtresi (hafif yaklaşım)
  const { data: relatives, error, reload, loading } = useApi<PersonRow[]>(
    () => listEntity<PersonRow>("people", { q: person.lastName, limit: 100 }),
    [person.id, person.lastName],
  );
  const [parentInfo, setParentInfo] = useState<{ id: string; name: string | null } | null>(null);

  useEffect(() => {
    if (!person.parentPersonId) return;
    const pid = person.parentPersonId;
    let alive = true;
    apiGet<{ person: PersonRow }>(`/api/people/${pid}`)
      .then((d) => { if (alive) setParentInfo({ id: pid, name: fullName(d.person) }); })
      .catch(() => { if (alive) setParentInfo({ id: pid, name: null }); });
    return () => { alive = false; };
  }, [person.parentPersonId]);

  const dependents = (relatives ?? []).filter((p) => p.parentPersonId === person.id);
  const parentFound = person.parentPersonId ? (relatives ?? []).find((p) => p.id === person.parentPersonId) : null;
  const parentLabel = parentFound ? fullName(parentFound)
    : parentInfo && parentInfo.id === person.parentPersonId ? (parentInfo.name ?? "—")
    : t("people.family.loading");

  return (
    <SectionCard title={t("people.family.title")} desc={t("people.family.desc")}>
      <Row360Line label={t("people.family.linkedTo")}>
        {person.parentPersonId ? (
          <span className="inline-flex items-center gap-1.5">
            <Icons.Link2 className="size-3.5 text-teal-600" aria-hidden />
            <span className="font-medium">{parentLabel}</span>
          </span>
        ) : "—"}
      </Row360Line>
      <Row360Line label={t("people.lblRelation")}>{person.relationType ? <Chip tone="violet">{tLabel(RELATION_TYPE, person.relationType)}</Chip> : "—"}</Row360Line>
      <Separator className="my-2" />
      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("people.family.dependents")}</p>
      {loading ? <Loading rows={1} /> : error ? <ErrorState message={error} onRetry={reload} /> : dependents.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("people.family.none")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {dependents.map((d, i) => (
            <Chip key={d.id} tone="teal">
              <span className="maven-stagger-item inline-flex items-center gap-1" style={{ animationDelay: `${i * 50}ms` }}>
                <Icons.UserRound className="size-3" aria-hidden />
                {d.firstName} {d.lastName}
                <span className="opacity-70">· {tLabel(RELATION_TYPE, d.relationType)}</span>
              </span>
            </Chip>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── R9-c: Roller & Yetkiler sekmesi ─────────────────────────────────────────
function RolesPanel() {
  useLang(); // dil değişiminde yeniden render
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();

  // özel rol tanımları — hiyerarşi seviyesine göre sıralı (registry orderBy)
  const { data: roles, error, reload, loading } = useApi<CustomRoleRow[]>(
    () => listEntity<CustomRoleRow>("custom-roles", { editionId: currentEditionId ?? undefined, limit: 100 }),
    [currentEditionId, refreshKey],
  );
  // katılımlar — rol ataması köprüsü
  const { data: parts } = useApi<ParticipationLite[]>(
    () => listEntity<ParticipationLite>("participations", { editionId: currentEditionId ?? undefined, limit: 50 }),
    [currentEditionId, refreshKey],
  );

  const sorted = (roles ?? []).slice().sort((a, b) => a.hierarchyLevel - b.hierarchyLevel);

  // ── rol oluştur/düzenle diyaloğu ──
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomRoleRow | null>(null);
  const [busy, setBusy] = useState(false);
  const emptyRole = { name: "", key: "", keyTouched: false, hierarchyLevel: 50, color: "teal", permissions: [] as string[], description: "" };
  const [form, setForm] = useState(emptyRole);
  const keyHint = form.keyTouched ? form.key : slugifyKey(form.name);
  const keyClash = Boolean(keyHint && sorted.some((r) => r.key === keyHint && r.id !== editing?.id));

  const openNew = () => { setEditing(null); setForm(emptyRole); setDialogOpen(true); };
  const openEdit = (r: CustomRoleRow) => {
    setEditing(r);
    setForm({ name: r.name, key: r.key, keyTouched: true, hierarchyLevel: r.hierarchyLevel, color: r.color ?? "teal", permissions: parsePerms(r.permissions), description: r.description ?? "" });
    setDialogOpen(true);
  };
  const saveRole = async () => {
    if (!form.name.trim() || !keyHint || keyClash || !currentEditionId) return;
    setBusy(true);
    try {
      const payload = {
        editionId: currentEditionId, name: form.name.trim(), key: keyHint, color: form.color,
        hierarchyLevel: form.hierarchyLevel, permissions: JSON.stringify(form.permissions), description: form.description || null,
      };
      if (editing) await apiSend(`/api/custom-roles/${editing.id}`, "PUT", payload);
      else await apiSend("/api/custom-roles", "POST", payload);
      toast({ title: editing ? t("people.roles.updated") : t("people.roles.created"), description: t("people.roles.savedDesc", { name: form.name, level: form.hierarchyLevel }) });
      setDialogOpen(false); reload(); bump();
    } catch (e) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : t("people.roles.saveFailed"), variant: "destructive" });
    } finally { setBusy(false); }
  };
  const toggleActive = async (r: CustomRoleRow) => {
    try {
      await apiSend(`/api/custom-roles/${r.id}`, "PUT", { isActive: !r.isActive });
      toast({ title: r.isActive ? t("people.roles.deactivated") : t("people.roles.activated"), description: r.name });
      reload();
    } catch (e) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : t("people.roles.toggleFailed"), variant: "destructive" });
    }
  };
  const deleteRole = async (r: CustomRoleRow) => {
    try {
      await apiSend(`/api/custom-roles/${r.id}`, "DELETE");
      toast({ title: t("people.roles.deleted"), description: r.name });
      reload(); bump();
    } catch (e) {
      toast({ title: t("people.deleteFailed"), description: e instanceof Error ? e.message : t("people.roles.deleteBlockedDesc"), variant: "destructive" });
    }
  };

  // ── rol ataması köprüsü ──
  const [assignPart, setAssignPart] = useState("");
  const [assignRole, setAssignRole] = useState(""); // "std:SPEAKER" | "cus:<id>"
  const [assignBusy, setAssignBusy] = useState(false);
  const doAssign = async () => {
    if (!assignPart || !assignRole) return;
    const [kind, value] = assignRole.split(":");
    setAssignBusy(true);
    try {
      if (kind === "cus") {
        const role = sorted.find((r) => r.id === value);
        await apiSend("/api/role-assignments", "POST", { participationId: assignPart, role: role?.key ?? value, customRoleId: value, notes: "Rol panelinden atandı" });
      } else {
        await apiSend("/api/role-assignments", "POST", { participationId: assignPart, role: value, notes: "Rol panelinden atandı" });
      }
      toast({ title: t("people.roles.assigned"), description: t("people.roles.assignedDesc", { person: fullName(parts?.find((p) => p.id === assignPart)?.person ?? null), role: kind === "cus" ? String(sorted.find((r) => r.id === value)?.name) : tLabel(EVENT_ROLES, value) }) });
      setAssignPart(""); setAssignRole(""); bump();
    } catch (e) {
      toast({ title: t("people.roles.assignFailed"), description: e instanceof Error ? e.message : t("people.roles.assignFailedDesc"), variant: "destructive" });
    } finally { setAssignBusy(false); }
  };

  // ── giriş ekranı mock'u ──
  const [mockId, setMockId] = useState("");
  const mockRole = sorted.find((r) => r.id === mockId) ?? null;

  if (!currentEditionId) {
    return <EmptyState title={t("people.roles.noEdition")} desc={t("people.roles.noEditionDesc")} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        {/* ── Özel rol kartları ── */}
        <SectionCard
          title={t("people.roles.title")}
          desc={t("people.roles.desc")}
          action={<Button size="sm" onClick={openNew}><Icons.Plus className="size-4" /> {t("people.roles.newRole")}</Button>}
        >
          {loading ? <Loading rows={3} /> : error ? <ErrorState message={error} onRetry={reload} /> : sorted.length === 0 ? (
            <EmptyState title={t("people.roles.empty")} desc={t("people.roles.emptyDesc")} />
          ) : (
            <div className="maven-scroll grid max-h-96 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {sorted.map((r, i) => (
                <div key={r.id} className="maven-stagger-item rounded-xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-start gap-2.5">
                    <span className={cn("mt-0.5 size-3 shrink-0 rounded-full shadow-sm", ROLE_DOT[r.color ?? "teal"] ?? ROLE_DOT.teal)} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold">{r.name}</p>
                        <Chip tone="neutral">{t("people.roles.sv")} <span className="tabular-nums">{r.hierarchyLevel}</span></Chip>
                        {!r.isActive && <Chip tone="amber">{t("people.roles.passive")}</Chip>}
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{r.key}</p>
                      {r.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {parsePerms(r.permissions).map((p) => <Chip key={p} tone="teal">{tLabel(CAP_LABEL, p)}</Chip>)}
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t pt-2">
                        <Chip tone={r.isSystem ? "violet" : "neutral"}>{r.isSystem ? t("people.roles.systemRole") : t("people.roles.customRole")}</Chip>
                        <span className="ml-auto flex items-center gap-0.5">
                          <button onClick={() => openEdit(r)} className="rounded p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={t("people.roles.editAria", { name: r.name })}>
                            <Icons.Pencil className="size-3.5" />
                          </button>
                          <button onClick={() => toggleActive(r)} className="rounded p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={r.isActive ? t("people.roles.deactivateAria", { name: r.name }) : t("people.roles.activateAria", { name: r.name })}>
                            <Icons.Power className={cn("size-3.5", r.isActive && "text-emerald-600")} />
                          </button>
                          {!r.isSystem && (
                            <button onClick={() => deleteRole(r)} className="rounded p-1.5 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600" aria-label={t("people.roles.deleteAria", { name: r.name })}>
                              <Icons.Trash2 className="size-3.5" />
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── Rol giriş ekranı mock'u (yalnız tasarım önizlemesi) ── */}
        <SectionCard title={t("people.roles.mockTitle")} desc={t("people.roles.mockDesc")}>
          <Select value={mockId} onValueChange={setMockId}>
            <SelectTrigger className="h-9" aria-label={t("people.roles.mockAria")}><SelectValue placeholder={t("people.rolePh")} /></SelectTrigger>
            <SelectContent>
              {sorted.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} · {t("people.roles.sv")} {r.hierarchyLevel}</SelectItem>)}
              {sorted.length === 0 && <SelectItem value="__none" disabled>{t("people.roles.defineFirst")}</SelectItem>}
            </SelectContent>
          </Select>
          {mockRole ? (
            <RoleLoginMock key={mockRole.id} role={mockRole} />
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">{t("people.roles.mockHint")}</p>
          )}
        </SectionCard>
      </div>

      {/* ── Hiyerarşi rayı ── */}
      <SectionCard title={t("people.roles.railTitle")} desc={t("people.roles.railDesc")}>
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("people.roles.railEmpty")}</p>
        ) : (
          <div className="maven-scroll overflow-x-auto pb-2">
            <div className="flex min-w-max items-center py-2">
              {sorted.map((r, i) => (
                <div key={r.id} className="flex items-center">
                  {i > 0 && <span className="maven-rail-line mx-1 h-0.5 w-8 rounded-full" aria-hidden />}
                  <div className="maven-stagger-item flex flex-col items-center gap-1.5" style={{ animationDelay: `${i * 70}ms` }}>
                    <span
                      className={cn("grid place-items-center rounded-full font-bold shadow-sm ring-2 ring-offset-2 ring-offset-card transition-transform hover:scale-105",
                        ROLE_SOLID[r.color ?? "teal"] ?? ROLE_SOLID.teal,
                        railSize(r.hierarchyLevel),
                        ROLE_RING[r.color ?? "teal"] ?? ROLE_RING.teal
                      )}
                      title={t("people.roles.levelTip", { name: r.name, level: r.hierarchyLevel })}
                    >
                      <span className="tabular-nums">{r.hierarchyLevel}</span>
                    </span>
                    <span className="max-w-24 truncate text-center text-[10px] font-medium leading-tight text-muted-foreground">{r.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Rol ataması köprüsü ── */}
      <SectionCard title={t("people.roles.assignTitle")} desc={t("people.roles.assignDesc")}>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div>
            <Label className="text-xs text-muted-foreground">{t("people.roles.partLabel")}</Label>
            <Select value={assignPart} onValueChange={setAssignPart}>
              <SelectTrigger className="mt-1 h-9"><SelectValue placeholder={t("people.roles.partPh")} /></SelectTrigger>
              <SelectContent className="maven-scroll max-h-72">
                {(parts ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {fullName(p.person)}{p.person.company ? ` — ${p.person.company}` : ""}
                  </SelectItem>
                ))}
                {(parts ?? []).length === 0 && <SelectItem value="__none" disabled>{t("people.roles.noParticipations")}</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("people.lblRole")}</Label>
            <Select value={assignRole} onValueChange={setAssignRole}>
              <SelectTrigger className="mt-1 h-9"><SelectValue placeholder={t("people.rolePh")} /></SelectTrigger>
              <SelectContent>
                {Object.entries(EVENT_ROLES).map(([k]) => <SelectItem key={k} value={`std:${k}`}>{tLabel(EVENT_ROLES, k)}</SelectItem>)}
                {sorted.length > 0 && (
                  <>
                    <div className="my-1 border-t" />
                    {sorted.map((r) => <SelectItem key={r.id} value={`cus:${r.id}`}>{t("people.roles.customRoleItem", { name: r.name, level: r.hierarchyLevel })}</SelectItem>)}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button className="h-9" onClick={doAssign} disabled={assignBusy || !assignPart || !assignRole}>
            {assignBusy ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.UserCheck className="size-4" />} {t("people.roles.assignBtn")}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{t("people.roles.assignHint")}</p>
      </SectionCard>

      {/* ── rol oluştur/düzenle diyaloğu ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("people.roles.editDialogTitle") : t("people.roles.newDialogTitle")}</DialogTitle>
            <DialogDescription>{t("people.roles.dialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t("people.roles.nameLabel")}</Label>
              <Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, key: form.keyTouched ? form.key : slugifyKey(e.target.value) })} placeholder={t("people.roles.namePh")} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("people.roles.keyLabel")}</Label>
              <Input className={cn("mt-1 font-mono text-xs", keyClash && "border-rose-400 focus-visible:ring-rose-300")} value={keyHint} onChange={(e) => setForm({ ...form, key: slugifyKey(e.target.value), keyTouched: true })} placeholder={t("people.roles.keyPh")} />
              <p className={cn("mt-1 text-[11px]", keyClash ? "text-rose-600" : "text-muted-foreground")}>
                {keyClash ? t("people.roles.keyClash") : t("people.roles.slugSuggestion", { slug: keyHint || "—" })}
              </p>
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-baseline justify-between">
                <Label>{t("people.roles.levelLabel")}</Label>
                <span className="text-xs font-semibold tabular-nums text-primary">{form.hierarchyLevel} <span className="font-normal text-muted-foreground">{t("people.roles.levelRange")}</span></span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Slider value={[form.hierarchyLevel]} min={1} max={99} step={1} onValueChange={(v) => setForm({ ...form, hierarchyLevel: v[0] ?? 50 })} aria-label={t("people.roles.levelAria")} />
                <Input type="number" min={1} max={99} className="h-9 w-20 tabular-nums" value={form.hierarchyLevel} onChange={(e) => setForm({ ...form, hierarchyLevel: Math.min(99, Math.max(1, Number(e.target.value) || 1)) })} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>{t("people.roles.colorLabel")}</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("people.roles.colorAria")}>
                {ROLE_COLORS.map((c) => (
                  <button key={c.key} type="button" role="radio" aria-checked={form.color === c.key} onClick={() => setForm({ ...form, color: c.key })}
                    className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      form.color === c.key ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40")}>
                    <span className={cn("size-3 rounded-full", ROLE_DOT[c.key])} aria-hidden /> {t(`people.color.${c.key}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>{t("people.roles.capsLabel")}</Label>
              <div className="maven-scroll mt-1.5 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border bg-muted/20 p-2.5">
                {CAPABILITIES.map((c) => {
                  const on = form.permissions.includes(c.key);
                  return (
                    <button key={c.key} type="button" aria-pressed={on} title={t(`people.capDesc.${c.key}`)}
                      onClick={() => setForm({ ...form, permissions: on ? form.permissions.filter((p) => p !== c.key) : [...form.permissions, c.key] })}
                      className={cn("rounded-md border px-2 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        on ? "border-teal-300 bg-teal-50 text-teal-700" : "bg-card text-muted-foreground hover:border-teal-300 hover:text-teal-700")}>
                      {on && <Icons.Check className="mr-1 inline size-3" aria-hidden />}{tLabel(CAP_LABEL, c.key)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>{t("people.lblDesc")}</Label>
              <Textarea className="mt-1" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("people.roles.descPh")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("people.cancel")}</Button>
            <Button onClick={saveRole} disabled={busy || !form.name.trim() || !keyHint || keyClash}>
              {busy ? t("people.saving") : editing ? t("people.update") : t("people.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// rol giriş ekranı mock'u — tarayıcı çerçevesi + su damgası (yalnız tasarım)
function RoleLoginMock({ role }: { role: CustomRoleRow }) {
  useLang(); // dil değişiminde yeniden render
  const bgOnly = ROLE_DOT[role.color ?? "teal"] ?? ROLE_DOT.teal;
  return (
    <div className="maven-portal-frame relative mt-3 overflow-hidden rounded-2xl border bg-card shadow-lg ring-1 ring-black/[0.03]">
      <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-rose-400/90" />
          <span className="size-2.5 rounded-full bg-amber-400/90" />
          <span className="size-2.5 rounded-full bg-emerald-400/90" />
        </span>
        <span className="mx-auto flex max-w-[180px] flex-1 items-center gap-1.5 truncate rounded-full border bg-background px-2.5 py-0.5 text-[10px] text-muted-foreground shadow-sm">
          <Icons.Lock className="size-3 shrink-0 text-emerald-500" aria-hidden />
          <span className="truncate font-mono">portal.maven.app/giris?rol={role.key}</span>
        </span>
      </div>
      {/* rol renkli vurgu bandı */}
      <div className={cn("h-1.5 w-full", bgOnly)} aria-hidden />
      <div className="maven-mock-watermark relative px-4 py-5">
        {/* Önizleme su damgası */}
        <span className="pointer-events-none absolute inset-0 grid select-none place-items-center" aria-hidden>
          <span className="-rotate-12 text-3xl font-bold uppercase tracking-[0.3em] text-muted-foreground/10">{t("people.mock.watermark")}</span>
        </span>
        <div className="relative">
          <div className="mb-3 flex items-center gap-2">
            <span className={cn("grid size-9 place-items-center rounded-xl text-white", bgOnly)} aria-hidden>
              <Icons.ShieldCheck className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{role.name}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{role.key} · Sv. {role.hierarchyLevel}</p>
            </div>
          </div>
          <div className="space-y-2.5 opacity-90">
            <div>
              <Label className="text-[10px] text-muted-foreground">{t("people.lblEmail")}</Label>
              <Input disabled placeholder="ornek@kurum.com" className="mt-0.5 h-8 bg-muted/40 text-xs" aria-label={t("people.mock.emailAria")} />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">{t("people.lblPassword")}</Label>
              <Input disabled type="password" placeholder="••••••••" className="mt-0.5 h-8 bg-muted/40 text-xs" aria-label={t("people.mock.passwordAria")} />
            </div>
            <Button disabled className="h-8 w-full text-xs">{t("people.mock.login")}</Button>
            <p className="flex items-center gap-1 pt-0.5 text-[10px] text-muted-foreground">
              <Icons.Info className="size-3 shrink-0" aria-hidden />
              {t("people.mock.disclaimer")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PeopleView() {
  useLang(); // dil değişiminde yeniden render
  const { tenant, bump, currentEditionId, refreshKey } = useApp();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<PersonRow | null>(null);
  const [detail, setDetail] = useState<Person360 | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonRow | null>(null);
  // R10-a: tüm Person skaler alanları — adı/kurumu/şehri yanlışsa tek ekranda düzelt
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "", title: "", city: "", country: "", bio: "", linkedin: "", status: "ACTIVE", parentPersonId: "none", relationType: "SPOUSE" });
  const [mergeSug, setMergeSug] = useState<DuplicateSuggestion | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null); // korunacak (hedef) kişi id
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [resolutions, setResolutions] = useState<Record<string, "target" | "source">>({});

  // TASK-A F6: kişiler imleçli load-more + sunucu-taraflı q arama — 300 satırlık sessiz kesme kaldırıldı
  const { data: peoplePaged, error, reload, loading, more: peopleMore } = useApi<{ items: PersonRow[]; nextCursor?: string | null }>(
    (cursor?: string) => listEntityPaged<PersonRow>("people", { q: q.trim() || undefined, limit: 200 }, cursor),
    [q],
    { append: true },
  );
  const data = useMemo(() => peoplePaged?.items ?? [], [peoplePaged]);

  // Olası mükerrerler — tenant geneli (edisyon-bağımsız, null-guard gerekmez); edisyon değişince tazelensin
  const { data: dupData, error: dupError, reload: dupReload } = useApi<DuplicatesData>(() => apiGet<DuplicatesData>("/api/people/duplicates"), [currentEditionId, refreshKey]);

  // Faz E: sabit durum map'lerini tLabel köprüsüyle çevir (render başına bir kez)
  const regStatusMap = Object.fromEntries(Object.entries(REGISTRATION_STATUS).map(([k]) => [k, tLabel(REGISTRATION_STATUS, k)]));
  const payStatusMap = Object.fromEntries(Object.entries(PAYMENT_STATUS).map(([k]) => [k, tLabel(PAYMENT_STATUS, k)]));
  const attStatusMap = Object.fromEntries(Object.entries(ATTENDANCE_STATUS).map(([k]) => [k, tLabel(ATTENDANCE_STATUS, k)]));
  const badgeStatusMap = Object.fromEntries(Object.entries(BADGE_STATUS).map(([k]) => [k, tLabel(BADGE_STATUS, k)]));
  const certStatusMap = Object.fromEntries(Object.entries(CERTIFICATE_STATUS).map(([k]) => [k, tLabel(CERTIFICATE_STATUS, k)]));
  // SUBMISSION_STATUS: status.REJECTED köprüsü tabanda "Reddedildi" olduğundan çakışır — people.subStatus.* ile çevrilir
  const subStatusMap = Object.fromEntries(Object.entries(SUBMISSION_STATUS).map(([k]) => [k, t(`people.subStatus.${k}`)]));

  const open360 = async (p: PersonRow) => {
    setSelected(p);
    setDetailLoading(true);
    try {
      const d = await apiGet<Person360>(`/api/people/${p.id}`);
      console.log("[360] loaded", p.id, d?.person?.id, Object.keys(d ?? {}).length);
      setDetail(d);
    } catch (e) {
      console.error("[360] failed", p.id, e);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const defaultForm = { firstName: "", lastName: "", email: "", phone: "", company: "", title: "", city: "", country: "", bio: "", linkedin: "", status: "ACTIVE", parentPersonId: "none", relationType: "SPOUSE" };

  const openCreate = () => { setEditingPerson(null); setForm(defaultForm); setCreateOpen(true); };
  const openEdit = (p: PersonRow) => {
    setEditingPerson(p);
    setForm({
      firstName: p.firstName, lastName: p.lastName, email: p.email ?? "", phone: p.phone ?? "",
      company: p.company ?? "", title: p.title ?? "", city: p.city ?? "", country: p.country ?? "",
      bio: p.bio ?? "", linkedin: p.linkedin ?? "", status: p.status === "PASSIVE" ? "PASSIVE" : "ACTIVE",
      parentPersonId: p.parentPersonId ?? "none", relationType: p.relationType ?? "SPOUSE",
    });
    setCreateOpen(true);
  };

  const savePerson = async () => {
    // Yalnız skaler alanlar — registry sanitize "" → null; asla iç içe nesne gönderilmez
    const payload = {
      firstName: form.firstName, lastName: form.lastName,
      email: form.email || null, phone: form.phone || null, company: form.company || null, title: form.title || null,
      city: form.city || null, country: form.country || null, bio: form.bio || null, linkedin: form.linkedin || null,
      status: form.status === "PASSIVE" ? "PASSIVE" : "ACTIVE",
      parentPersonId: form.parentPersonId === "none" ? null : form.parentPersonId,
      relationType: form.parentPersonId === "none" ? null : form.relationType,
    };
    try {
      if (editingPerson) {
        await apiSend(`/api/people/${editingPerson.id}`, "PUT", payload);
        toast({ title: t("people.person.updated"), description: `${form.firstName} ${form.lastName}` });
      } else {
        await apiSend("/api/people", "POST", { ...payload, tenantId: tenant?.id });
        toast({ title: t("people.person.created"), description: t("people.person.createdDesc", { name: `${form.firstName} ${form.lastName}` }) });
      }
      setCreateOpen(false);
      setForm(defaultForm);
      setEditingPerson(null);
      reload(); bump();
      // 360 çekmecesi açıksa veriyi tazele (düzenleme buradan yapılmış olabilir)
      if (selected?.id) {
        try { setDetail(await apiGet<Person360>(`/api/people/${selected.id}`)); } catch { /* yoksay */ }
      }
    } catch (e) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : t("people.person.saveFailed"), variant: "destructive" });
    }
  };

  // Birleştirme diyaloğunu aç — varsayılan hedef: daha eski kayıt (API'nin olderId önerisi)
  const openMerge = (s: DuplicateSuggestion) => {
    const def = s.olderId && s.persons.some((p) => p.id === s.olderId) ? s.olderId : s.persons[0]?.id ?? null;
    setMergeSug(s);
    setMergeTarget(def);
    setMergePreview(null);
    setResolutions({});
  };

  // hedef seçilince çakışma önizlemesi + varsayılan çözümler
  useEffect(() => {
    if (!mergeSug || !mergeTarget) { setMergePreview(null); return; }
    const source = mergeSug.persons.find((p) => p.id !== mergeTarget);
    if (!source) { setMergePreview(null); return; }
    let alive = true;
    setPreviewLoading(true);
    apiGet<MergePreview>(`/api/people/merge-preview?sourceId=${source.id}&targetId=${mergeTarget}`)
      .then((d) => {
        if (!alive) return;
        setMergePreview(d);
        const def: Record<string, "target" | "source"> = {};
        for (const c of d.conflictingEditions) def[c.editionId] = c.defaultWinner;
        setResolutions(def);
      })
      .catch(() => { if (alive) setMergePreview(null); })
      .finally(() => { if (alive) setPreviewLoading(false); });
    return () => { alive = false; };
  }, [mergeSug, mergeTarget]);

  // Onaylı birleştirme — çakışma çözümleriyle (sunucu tek işlemde taşır)
  const confirmMerge = async () => {
    const sug = mergeSug;
    if (!sug || !mergeTarget) return;
    const target = sug.persons.find((p) => p.id === mergeTarget) ?? null;
    const source = sug.persons.find((p) => p.id !== mergeTarget) ?? null;
    if (!target || !source) {
      toast({ title: t("common.error"), description: t("people.merge.sameSide"), variant: "destructive" });
      return;
    }
    setMergeBusy(true);
    try {
      const r = await apiSend<{ mergedRegistrations?: number; resolvedEditions?: number }>("/api/flows", "POST", {
        action: "person.merge", sourceId: source.id, targetId: target.id, resolutions, fillProfile: true,
      });
      const movedPart = r.mergedRegistrations ? t("people.merge.movedRegs", { count: r.mergedRegistrations }) : "";
      const resolvedPart = r.resolvedEditions ? t("people.merge.resolvedEds", { count: r.resolvedEditions }) : "";
      toast({
        title: t("people.merge.doneTitle"),
        description: `${source.fullName} → ${target.fullName}${movedPart}${resolvedPart}`,
      });
      setMergeSug(null);
      setMergeTarget(null);
      setMergePreview(null);
      reload(); dupReload(); bump(); // kişi listesi + mükerrer listesi + global sayaçlar
    } catch (e) {
      toast({ title: t("people.merge.failTitle"), description: e instanceof Error ? e.message : t("people.merge.failDesc"), variant: "destructive" });
    } finally {
      setMergeBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title={t("people.title")} desc={t("people.desc")}>
        {dupData && dupData.suggestions.length === 0 && (
          <Chip tone="emerald">
            <span className="inline-flex items-center gap-1"><Icons.CheckCircle2 className="size-3" aria-hidden />{t("people.dup.none")}</span>
          </Chip>
        )}
        <Input placeholder={t("people.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-56" />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={openCreate}><Icons.UserPlus className="size-4" /> {t("people.person.add")}</Button></DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingPerson ? t("people.person.editTitle") : t("people.person.newTitle")}</DialogTitle>
              <DialogDescription>{t("people.person.dialogDesc")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>{t("people.lblFirstName")}</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
              <div><Label>{t("people.lblLastName")}</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>{t("people.lblEmail")}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>{t("people.lblPhone")}</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>{t("people.lblCity")}</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><Label>{t("people.lblCompany")}</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
              <div><Label>{t("people.lblTitle")}</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>{t("people.lblCountry")}</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
              <div>
                <Label>{t("people.lblLinkedin")}</Label>
                <Input value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} placeholder="linkedin.com/in/…" />
              </div>
              <div>
                <Label>{t("people.lblStatus")}</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">{t("people.statusActive")}</SelectItem>
                    <SelectItem value="PASSIVE">{t("people.statusPassive")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>{t("people.lblBio")}</Label>
                <Textarea rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder={t("people.person.bioPh")} />
              </div>
              {/* R10-a: kişi fotoğrafı — benzersiz adla Medya Arşivi → Kişi Fotoğrafları klasörüne */}
              {editingPerson ? (
                <div className="rounded-lg border bg-muted/20 p-3 sm:col-span-2">
                  <p className="mb-2 text-xs font-semibold">{t("people.person.photoLabel")}</p>
                  <LinkedPhotoUploader
                    editionId={currentEditionId}
                    systemFolder="KISI_FOTOGRAF"
                    linkedType="PERSON"
                    linkedId={editingPerson.id}
                    assetName={`${form.firstName || editingPerson.firstName}-${form.lastName || editingPerson.lastName}-fotografi`}
                    currentUrl={editingPerson.photoUrl}
                    onApply={async (dataUrl) => {
                      await apiSend(`/api/people/${editingPerson.id}`, "PUT", { photoUrl: dataUrl });
                      setEditingPerson({ ...editingPerson, photoUrl: dataUrl });
                      reload();
                      if (selected?.id === editingPerson.id) setDetail((d) => (d ? { ...d, person: { ...d.person, photoUrl: dataUrl } } : d));
                    }}
                    folderLabel={t("people.folder.personPhotos")}
                    alt={t("people.photoAlt", { name: `${editingPerson.firstName} ${editingPerson.lastName}` })}
                  />
                </div>
              ) : (
                <p className="text-[11px] leading-snug text-muted-foreground sm:col-span-2">{t("people.person.photoHint")}</p>
              )}
              <div className="sm:col-span-2">
                <Label>{t("people.person.parentLabel")}</Label>
                <Select value={form.parentPersonId} onValueChange={(v) => setForm({ ...form, parentPersonId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder={t("people.nonePh")} /></SelectTrigger>
                  <SelectContent className="maven-scroll max-h-64">
                    <SelectItem value="none">{t("people.person.noParent")}</SelectItem>
                    {data.filter((p) => p.id !== editingPerson?.id).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.company ? ` — ${p.company}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className={cn(form.parentPersonId === "none" && "opacity-50")}>{t("people.lblRelation")}</Label>
                <Select value={form.relationType} onValueChange={(v) => setForm({ ...form, relationType: v })} disabled={form.parentPersonId === "none"}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RELATION_TYPE).filter(([k]) => k !== "SELF").map(([k]) => <SelectItem key={k} value={k}>{tLabel(RELATION_TYPE, k)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">{t("people.person.relationHint")}</p>
              </div>
            </div>
            <DialogFooter><Button onClick={savePerson} disabled={!form.firstName || !form.lastName}>{editingPerson ? t("people.save") : t("people.create")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Tabs defaultValue="people">
        <TabsList className="h-auto">
          <TabsTrigger value="people"><Icons.Users className="size-4" /> {t("people.tabPeople")}</TabsTrigger>
          <TabsTrigger value="roles"><Icons.ShieldCheck className="size-4" /> {t("people.tabRoles")}</TabsTrigger>
        </TabsList>

        {/* ═══ Kişiler sekmesi — mevcut akış korunmuş ═══ */}
        <TabsContent value="people" className="mt-4">
          {/* ── Olası Mükerrerler (R2-b) — öneri bağlamaz, birleştirme onaylı yapılır ── */}
          {dupError && !dupData && (
            <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icons.TriangleAlert className="size-3.5 shrink-0 text-amber-500" aria-hidden />
              {t("people.dup.scanFailed")}
            </p>
          )}
          {dupData && dupData.suggestions.length > 0 && (
            <SectionCard
              title={t("people.dup.title")}
              desc={t("people.dup.desc")}
              action={<Chip tone="amber">{t("people.dup.suggestionCount", { count: dupData.suggestions.length })}</Chip>}
              className="mb-4"
            >
              <div className="maven-scroll max-h-96 space-y-3 overflow-y-auto">
                {dupData.suggestions.map((s) => {
                  const [a, b] = s.persons;
                  return (
                    <div key={s.key} className="rounded-lg border bg-muted/20 p-3">
                      <div className="grid grid-cols-1 items-stretch gap-2 md:grid-cols-[1fr_auto_1fr] md:gap-3">
                        <DupPersonCard p={a} />
                        <div className="flex items-center justify-center gap-2 md:w-40 md:flex-col">
                          <Icons.ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <Chip tone={REASON_TONE[s.reason] ?? "neutral"}>{dupData.reasonLabels[s.reason] ?? s.reason}</Chip>
                          <Button size="sm" variant="outline" onClick={() => openMerge(s)}>
                            <Icons.Merge className="size-4" /> {t("people.merge.btn")}
                          </Button>
                        </div>
                        <DupPersonCard p={b} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : data.length === 0 ? (
            <EmptyState title={t("people.emptyTitle")} desc={t("people.emptyDesc")} />
          ) : (
            <div className="grid gap-2">
              {data.map((p) => (
                <button
                  key={p.id}
                  onClick={() => open360(p)}
                  onDoubleClick={() => openEdit(p)}
                  title={t("people.person.dblClickTip")}
                  className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-primary/40 hover:shadow-sm"
                >
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt={t("people.photoAlt", { name: `${p.firstName} ${p.lastName}` })} className="size-9 shrink-0 rounded-full border object-cover" />
                  ) : (
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {p.firstName[0]}{p.lastName[0]}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p.firstName} {p.lastName}
                      {p.status === "MERGED" && <Chip tone="rose">{t("people.mergedChip")}</Chip>}
                      {p.parentPersonId && <Chip tone="violet">{t("people.dependentChip")}</Chip>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{p.title ? `${p.title} · ` : ""}{p.company ?? "—"} · {p.email ?? t("people.noEmail")}</p>
                  </div>
                  <Icons.ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
              {/* TASK-A F6: kesintisiz yükleme */}
              {peopleMore?.hasMore && (
                <div className="flex items-center justify-center pt-1">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={peopleMore.loading} onClick={peopleMore.next}>
                    {peopleMore.loading ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.ChevronsDown className="size-3.5" />}
                    {t("people.loadMore")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Birleştirme onay diyaloğu — hedef seçimi + çakışma çözümü (R7) ── */}
          <Dialog open={Boolean(mergeSug)} onOpenChange={(o) => { if (!o) setMergeSug(null); }}>
            <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{t("people.merge.title")}</DialogTitle>
                <DialogDescription>{mergeSug?.note ?? t("people.merge.defaultDesc")}</DialogDescription>
              </DialogHeader>

              <div role="radiogroup" aria-label={t("people.merge.keepAria")} className="grid gap-2 sm:grid-cols-2">
                {mergeSug?.persons.map((p, i) => {
                  const checked = mergeTarget === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => setMergeTarget(p.id)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        checked ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40"
                      )}
                    >
                      <span aria-hidden className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border", checked ? "border-primary" : "border-muted-foreground/40")}>
                        {checked && <span className="size-2 rounded-full bg-primary" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {i === 0 ? t("people.merge.keepA") : t("people.merge.keepB")} <span className="font-normal text-muted-foreground">({i === 0 ? t("people.merge.mergesB") : t("people.merge.mergesA")})</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{p.fullName} · {p.email ?? t("people.noEmail")} · {p.company ?? "—"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* ── Çakışma önizlemesi — hedef seçilince yüklenir ── */}
              {previewLoading && (
                <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><Icons.Loader2 className="size-3.5 animate-spin" /> {t("people.merge.analyzing")}</p>
              )}
              {mergePreview && !previewLoading && (
                <div className="maven-portal-enter space-y-3">
                  {/* profil alan farkları */}
                  {mergePreview.fieldDiffs.length > 0 && (
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Icons.SlidersHorizontal className="size-3.5 text-primary" /> {t("people.merge.profileFields")}</p>
                      <ul className="space-y-1">
                        {mergePreview.fieldDiffs.map((f) => (
                          <li key={f.field} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                            <span className="w-14 shrink-0 font-medium text-muted-foreground">{tLabel(MERGE_FIELD_LABELS, f.field)}</span>
                            {f.kind === "fill" ? (
                              <Chip tone="teal">{t("people.merge.fillFromSource", { value: f.source ?? "—" })}</Chip>
                            ) : (
                              <Chip tone="amber">{t("people.merge.conflict", { target: f.target ?? "—", source: f.source ?? "—" })}</Chip>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* aynı edisyonda iki katılım — çözüm zorunlu */}
                  {mergePreview.conflictingEditions.length > 0 ? (
                    <div className="space-y-2">
                      <p className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
                        <Icons.TriangleAlert className="size-3.5" aria-hidden />
                        {t("people.merge.conflictCount", { count: mergePreview.conflictingEditions.length })}
                      </p>
                      {mergePreview.conflictingEditions.map((c) => {
                        const winner = resolutions[c.editionId] ?? c.defaultWinner;
                        const SideBox = ({ sideName, s }: { sideName: "source" | "target"; s: MergePreviewSide }) => {
                          const name = sideName === "target" ? `${mergePreview.target.firstName} ${mergePreview.target.lastName}` : `${mergePreview.source.firstName} ${mergePreview.source.lastName}`;
                          const active = winner === sideName;
                          return (
                            <button
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => setResolutions((r) => ({ ...r, [c.editionId]: sideName }))}
                              className={cn(
                                "flex-1 rounded-lg border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                                active ? "maven-winner-glow border-primary bg-primary/5 ring-1 ring-primary/30" : "border-dashed opacity-70 hover:opacity-100 hover:border-primary/40"
                              )}
                            >
                              <span className="flex items-center justify-between gap-1">
                                <span className="truncate text-xs font-semibold">{name}</span>
                                {active && <Icons.CheckCircle2 className="size-3.5 shrink-0 text-primary" aria-hidden />}
                              </span>
                              <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                                {s.regNo ? <><span className="font-mono">{s.regNo}</span> · </> : t("people.merge.noReg")}
                                {s.regStatus ? <>{tLabel(REGISTRATION_STATUS, s.regStatus)}{s.categoryName ? ` (${s.categoryName})` : ""} · </> : ""}
                                {s.badgeCount > 0 ? t("people.merge.badgeCount", { count: s.badgeCount }) : t("people.merge.noBadges")}
                              </span>
                            </button>
                          );
                        };
                        return (
                          <div key={c.editionId} className="rounded-lg border bg-card p-2.5">
                            <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">{c.editionName} · {fmtDate(c.startDate)}</p>
                            <div role="radiogroup" aria-label={t("people.merge.winnerAria", { edition: c.editionName })} className="flex flex-col gap-2 sm:flex-row">
                              <SideBox sideName="source" s={c.source} />
                              <SideBox sideName="target" s={c.target} />
                            </div>
                            <p className="mt-1.5 text-[10px] text-muted-foreground">
                              {winner === "target"
                                ? t("people.merge.moveTemplate", { from: mergePreview.source.firstName, to: mergePreview.target.firstName })
                                : t("people.merge.moveTemplate", { from: mergePreview.target.firstName, to: mergePreview.source.firstName })}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700">
                      <Icons.CheckCircle2 className="size-3.5" aria-hidden /> {t("people.merge.noConflicts")}
                    </p>
                  )}

                  {/* taşınacaklar özeti */}
                  <div className="flex flex-wrap gap-1.5">
                    {mergePreview.movableParticipations > 0 && <Chip tone="teal">{t("people.merge.participationCount", { count: mergePreview.movableParticipations })}</Chip>}
                    {Object.entries(mergePreview.moves).filter(([, n]) => n > 0).map(([k, n]) => (
                      <Chip key={k} tone="neutral">{t("people.merge.moveCount", { count: n, what: tLabel(MERGE_MOVE_LABELS, k) })}</Chip>
                    ))}
                    {mergePreview.loserBadges > 0 && (
                      <Chip tone="amber">{t("people.merge.loserBadges", { count: mergePreview.loserBadges })}</Chip>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                <Icons.TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                <span>{t("people.merge.warning")}</span>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMergeSug(null)} disabled={mergeBusy}>{t("people.cancelMerge")}</Button>
                <Button onClick={confirmMerge} disabled={mergeBusy || !mergeTarget || previewLoading}>
                  {mergeBusy ? <Icons.Loader2 className="size-4 animate-spin" aria-hidden /> : <Icons.Merge className="size-4" aria-hidden />}
                  {t("people.merge.btn")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── Person 360 çekmecesi (§54) ── */}
          <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
            <SheetContent className="w-full overflow-y-auto maven-scroll sm:max-w-xl">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {detail?.person.photoUrl && <img src={detail.person.photoUrl} alt="" className="size-8 shrink-0 rounded-full border object-cover" aria-hidden />}
                  <span className="min-w-0 truncate">{selected?.firstName} {selected?.lastName}</span>
                  {detail?.person.status === "MERGED" && <Chip tone="rose">{t("people.mergedChip")}</Chip>}
                </SheetTitle>
                <SheetDescription>{t("people.p360.desc")}</SheetDescription>
              </SheetHeader>
              {detailLoading ? <div className="p-6"><Loading rows={5} /></div> : !detail ? (
                <EmptyState title={t("people.p360.failed")} />
              ) : (
                <div className="space-y-4 px-4 pb-8">
                  <SectionCard
                    title={t("people.p360.identity")}
                    action={
                      <Button size="sm" variant="outline" onClick={() => openEdit(detail.person)}>
                        <Icons.Pencil className="size-3.5" /> {t("people.edit")}
                      </Button>
                    }
                  >
                    {/* R10-a: kişi fotoğrafı — 360 panelinde de yüklenebilir */}
                    <div className="mb-2 rounded-lg border bg-muted/20 p-3">
                      <LinkedPhotoUploader
                        editionId={currentEditionId}
                        systemFolder="KISI_FOTOGRAF"
                        linkedType="PERSON"
                        linkedId={detail.person.id}
                        assetName={`${detail.person.firstName}-${detail.person.lastName}-fotografi`}
                        currentUrl={detail.person.photoUrl}
                        onApply={async (dataUrl) => {
                          await apiSend(`/api/people/${detail.person.id}`, "PUT", { photoUrl: dataUrl });
                          setDetail((d) => (d ? { ...d, person: { ...d.person, photoUrl: dataUrl } } : d));
                          setSelected((s) => (s && s.id === detail.person.id ? { ...s, photoUrl: dataUrl } : s));
                          reload();
                        }}
                        folderLabel={t("people.folder.personPhotos")}
                        alt={t("people.photoAlt", { name: `${detail.person.firstName} ${detail.person.lastName}` })}
                      />
                    </div>
                    <Row360Line label={t("people.lblEmail")}>{detail.person.email ?? "—"}</Row360Line>
                    <Row360Line label={t("people.lblPhone")}>{detail.person.phone ?? "—"}</Row360Line>
                    <Row360Line label={t("people.lblCompany")}>{detail.person.company ?? "—"}</Row360Line>
                    <Row360Line label={t("people.lblTitle")}>{detail.person.title ?? "—"}</Row360Line>
                    <Row360Line label={t("people.lblCity")}>{detail.person.city ?? "—"}</Row360Line>
                    <Row360Line label={t("people.lblCountry")}>{detail.person.country ?? "—"}</Row360Line>
                    {detail.person.linkedin && (
                      <Row360Line label={t("people.lblLinkedin")}>
                        <span className="block truncate text-xs text-primary underline-offset-2">{detail.person.linkedin}</span>
                      </Row360Line>
                    )}
                    {detail.person.bio && (
                      <>
                        <Separator className="my-2" />
                        <p className="text-xs leading-relaxed text-muted-foreground">{detail.person.bio}</p>
                      </>
                    )}
                  </SectionCard>

                  <FamilyPanel person={detail.person} />

                  {detail.participations.map((part) => {
                    const reg = part.registrations?.[0];
                    const badge = part.badgeInstances?.[0];
                    return (
                      <SectionCard key={part.id} title={part.edition?.name ?? t("people.fallbackEdition")} desc={t("people.p360.participationDesc", { source: tLabel(REG_SOURCES, part.source) })}>
                        <Row360Line label={t("people.p360.regLabel")}>
                          {reg ? (
                            <span className="inline-flex flex-wrap items-center justify-end gap-1">
                              <StatusBadge map={regStatusMap} value={reg.status} />
                              <StatusBadge map={payStatusMap} value={["SPONSOR_ENTITLEMENT", "SPEAKER_ENTITLEMENT", "HOST_COMPLIMENTARY", "STAFF"].includes(reg.fundingSource) ? "NOT_REQUIRED" : "PENDING"} />
                            </span>
                          ) : t("people.p360.noReg")}
                        </Row360Line>
                        <Row360Line label={t("people.p360.category")}>{reg?.category?.name ?? "—"}</Row360Line>
                        <Row360Line label={t("people.p360.funding")}>{tLabel(FUNDING_SOURCES, reg?.fundingSource)}</Row360Line>
                        <Row360Line label={t("people.p360.attendanceLabel")}><StatusBadge map={attStatusMap} value={part.attendance} /></Row360Line>
                        <Row360Line label={t("people.p360.badge")}>
                          {badge ? <span className="inline-flex items-center gap-1"><Chip tone="violet">{badge.profile?.name ?? t("people.p360.profileFallback")}</Chip> <StatusBadge map={badgeStatusMap} value={badge.status} /></span> : "—"}
                        </Row360Line>
                        <Separator className="my-2" />
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("people.p360.roles")}</p>
                        <div className="flex flex-wrap gap-1">
                          {(part.roleAssignments ?? []).map((r) => <Chip key={r.id} tone="teal">{tLabel(EVENT_ROLES, r.role)}</Chip>)}
                          {(part.roleAssignments ?? []).length === 0 && <span className="text-xs text-muted-foreground">{t("people.p360.noRoles")}</span>}
                        </div>
                        {(part.programAssignments ?? []).length > 0 && (
                          <>
                            <p className="mb-1 mt-3 text-xs font-semibold text-muted-foreground">{t("people.p360.program")}</p>
                            <div className="space-y-1">
                              {part.programAssignments.map((pa) => (
                                <div key={pa.id} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="truncate">{pa.session.title} <span className="text-muted-foreground">· {fmtDateTime(pa.session.startTime)}</span></span>
                                  <Chip tone="emerald">{pa.role}</Chip>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        {(part.scanEvents ?? []).length > 0 && (
                          <>
                            <p className="mb-1 mt-3 text-xs font-semibold text-muted-foreground">{t("people.p360.recentScans")}</p>
                            <div className="space-y-1">
                              {part.scanEvents.slice(0, 4).map((s) => (
                                <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                                  <span>{s.location === "SESSION" ? t("people.p360.sessionScan") : s.location} · {fmtDateTime(s.scannedAt)}</span>
                                  <Chip tone={s.result === "ALLOWED" ? "emerald" : s.result === "DENIED" ? "rose" : "amber"}>{s.result}</Chip>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        {(part.certIssues ?? []).length > 0 && (
                          <>
                            <p className="mb-1 mt-3 text-xs font-semibold text-muted-foreground">{t("people.p360.certificates")}</p>
                            <div className="space-y-1">
                              {part.certIssues.map((c) => (
                                <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="truncate">{c.definition.name}</span>
                                  <StatusBadge map={certStatusMap} value={c.status} />
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </SectionCard>
                    );
                  })}

                  <CvPanel personId={detail.person.id} editionId={currentEditionId} />

                  <VCardPanel personId={detail.person.id} />

                  {(detail.submissions ?? []).length > 0 && (
                    <SectionCard title={t("people.p360.scientific")} desc={t("people.p360.scientificDesc")}>
                      {detail.submissions.map((s) => (
                        <Row360Line key={s.id} label={s.code}>
                          <span className="inline-flex items-center justify-end gap-1"><span className="max-w-52 truncate">{s.title}</span> <StatusBadge map={subStatusMap} value={s.status} /></span>
                        </Row360Line>
                      ))}
                      {detail.reviewAssignments.map((r) => (
                        <Row360Line key={r.id} label={t("people.p360.reviewLabel")}>
                          <span className="inline-flex items-center justify-end gap-1"><span className="max-w-52 truncate">{r.submission.code} — {r.submission.title}</span> <Chip tone={r.status === "COMPLETED" ? "emerald" : "amber"}>{r.status}</Chip></span>
                        </Row360Line>
                      ))}
                    </SectionCard>
                  )}
                </div>
              )}
            </SheetContent>
          </Sheet>
        </TabsContent>

        {/* ═══ Roller & Yetkiler sekmesi (R9-c) ═══ */}
        <TabsContent value="roles" className="mt-4">
          <RolesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── R9-c: Kurum QR paneli (Kurum QR + Konum QR) ─────────────────────────────
function OrgQrPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  useLang(); // dil değişiminde yeniden render
  const { toast } = useToast();
  const { data, error, reload, loading } = useApi<OrgVCard>(
    () => apiGet<OrgVCard>(`/api/organizations/${orgId}/vcard?format=json`),
    [orgId],
  );
  const copyLocation = async () => {
    if (!data?.locationQrDataUrl) return;
    try {
      await navigator.clipboard.writeText(data.locationQrDataUrl);
      toast({ title: t("people.orgqr.copied"), description: t("people.orgqr.copiedDesc") });
    } catch {
      toast({ title: t("people.copyFailTitle"), description: t("people.copyFailDesc"), variant: "destructive" });
    }
  };

  return (
    <SectionCard
      title={t("people.orgqr.title")}
      desc={t("people.orgqr.desc")}
      action={
        data && (
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/organizations/${orgId}/vcard?format=vcf`} download>
              <Icons.Download className="size-3.5" /> {t("people.vcard.download")}
            </a>
          </Button>
        )
      }
    >
      {loading ? <Loading rows={2} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data ? (
        <p className="text-xs text-muted-foreground">{t("people.orgqr.genFailed")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="maven-stagger-item flex flex-col items-center gap-2 rounded-xl border bg-muted/20 p-4" style={{ animationDelay: "0ms" }}>
            <div className="maven-qrvcard">
              <img src={data.qrDataUrl} alt={t("people.orgqr.vcardAlt", { name: orgName })} width={120} height={120} className="size-[120px]" />
            </div>
            <p className="text-xs font-semibold">{t("people.orgqr.vcardLabel")}</p>
            <p className="text-center text-[11px] leading-snug text-muted-foreground">{t("people.orgqr.vcardHint")}</p>
          </div>
          <div className="maven-stagger-item flex flex-col items-center gap-2 rounded-xl border bg-muted/20 p-4" style={{ animationDelay: "80ms" }}>
            <div className="maven-qrvcard">
              <img src={data.locationQrDataUrl} alt={t("people.orgqr.locationAlt", { name: orgName })} width={120} height={120} className="size-[120px]" />
            </div>
            <p className="text-xs font-semibold">{t("people.orgqr.locationLabel")}</p>
            <p className="max-w-full break-words text-center text-[11px] leading-snug text-muted-foreground">{data.locationPayload || t("people.orgqr.noLocation")}</p>
            <Button size="sm" variant="ghost" className="h-7" onClick={copyLocation}>
              <Icons.Copy className="size-3.5" /> {t("people.orgqr.copyLocation")}
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── R9-c: Kurum iletişim kişileri (sınırsız kontak, rol + birincil yıldızı) ──
function OrgContactsPanel({ orgId, contacts, onChanged }: { orgId: string; contacts: OrgContactRow[]; onChanged: () => void }) {
  useLang(); // dil değişiminde yeniden render
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OrgContactRow | null>(null);
  const [busy, setBusy] = useState(false);
  const empty = { name: "", title: "", email: "", phone: "", role: "AUTHORIZED", department: "", isPrimary: false };
  const [form, setForm] = useState(empty);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (c: OrgContactRow) => {
    setEditing(c);
    setForm({ name: c.name, title: c.title ?? "", email: c.email ?? "", phone: c.phone ?? "", role: c.role, department: c.department ?? "", isPrimary: c.isPrimary });
    setOpen(true);
  };
  const save = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        organizationId: orgId, name: form.name.trim(), title: form.title || null, email: form.email || null, phone: form.phone || null,
        role: form.role, department: form.department || null, isPrimary: form.isPrimary,
      };
      if (editing) await apiSend(`/api/organization-contacts/${editing.id}`, "PUT", payload);
      else await apiSend("/api/organization-contacts", "POST", payload);
      // birincil yıldızı: yeni birincil seçildiyse eskisini düşür
      if (form.isPrimary) {
        for (const c of contacts) {
          if (c.isPrimary && c.id !== editing?.id) await apiSend(`/api/organization-contacts/${c.id}`, "PUT", { isPrimary: false });
        }
      }
      toast({ title: editing ? t("people.contacts.updated") : t("people.contacts.added"), description: form.name });
      setOpen(false); onChanged();
    } catch (e) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : t("people.contacts.saveFailed"), variant: "destructive" });
    } finally { setBusy(false); }
  };
  const togglePrimary = async (c: OrgContactRow) => {
    try {
      if (!c.isPrimary) {
        for (const o of contacts) { if (o.isPrimary && o.id !== c.id) await apiSend(`/api/organization-contacts/${o.id}`, "PUT", { isPrimary: false }); }
        await apiSend(`/api/organization-contacts/${c.id}`, "PUT", { isPrimary: true });
        toast({ title: t("people.contacts.primaryUpdated"), description: c.name });
      } else {
        await apiSend(`/api/organization-contacts/${c.id}`, "PUT", { isPrimary: false });
        toast({ title: t("people.contacts.primaryRemoved"), description: c.name });
      }
      onChanged();
    } catch (e) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : t("people.contacts.updateFailed"), variant: "destructive" });
    }
  };
  const remove = async (c: OrgContactRow) => {
    try {
      await apiSend(`/api/organization-contacts/${c.id}`, "DELETE");
      toast({ title: t("people.contacts.deleted"), description: c.name });
      onChanged();
    } catch (e) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : t("people.deleteFailed"), variant: "destructive" });
    }
  };

  return (
    <SectionCard
      title={t("people.contacts.title")}
      desc={t("people.contacts.desc")}
      action={<Button size="sm" variant="outline" onClick={openNew}><Icons.Plus className="size-3.5" /> {t("people.add")}</Button>}
    >
      {contacts.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">{t("people.contacts.empty")}</p>
      ) : (
        <div className="maven-scroll max-h-96 space-y-2 overflow-y-auto pr-1">
          {contacts.map((c, i) => (
            <div key={c.id} className="maven-stagger-item group flex items-start gap-2.5 rounded-lg border bg-muted/20 p-2.5 transition-colors hover:border-teal-500/30" style={{ animationDelay: `${i * 40}ms` }}>
              <button
                onClick={() => togglePrimary(c)}
                className="mt-0.5 shrink-0 rounded p-0.5 transition hover:scale-110"
                aria-label={c.isPrimary ? t("people.contacts.removePrimaryAria", { name: c.name }) : t("people.contacts.makePrimaryAria", { name: c.name })}
                title={c.isPrimary ? t("people.contacts.primaryTip") : t("people.contacts.makePrimaryTip")}
              >
                <Icons.Star className={cn("size-4", c.isPrimary ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40 hover:text-amber-400")} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-medium leading-tight">{c.name}</p>
                  <Chip tone={c.role === "PRIMARY" ? "teal" : "neutral"}>{tLabel(CONTACT_ROLE, c.role)}</Chip>
                  {c.department && <Chip tone="violet">{c.department}</Chip>}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {[c.title, c.email, c.phone].filter(Boolean).join(" · ") || t("people.contacts.noInfo")}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
                <button onClick={() => openEdit(c)} className="rounded p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={t("people.contacts.editAria", { name: c.name })}>
                  <Icons.Pencil className="size-3.5" />
                </button>
                <button onClick={() => remove(c)} className="rounded p-1.5 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600" aria-label={t("people.contacts.deleteAria", { name: c.name })}>
                  <Icons.Trash2 className="size-3.5" />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t("people.contacts.editTitle") : t("people.contacts.newTitle")}</DialogTitle>
            <DialogDescription>{t("people.contacts.dialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>{t("people.lblFullName")}</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>{t("people.lblTitle")}</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div>
              <Label>{t("people.lblRole")}</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTACT_ROLE).map(([k]) => <SelectItem key={k} value={k}>{tLabel(CONTACT_ROLE, k)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("people.lblDepartment")}</Label><Input className="mt-1" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder={t("people.contacts.deptPh")} /></div>
            <div><Label>{t("people.lblPhone")}</Label><Input className="mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>{t("people.lblEmail")}</Label><Input type="email" className="mt-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="contact-primary" checked={form.isPrimary} onCheckedChange={(v) => setForm({ ...form, isPrimary: v === true })} />
              <Label htmlFor="contact-primary" className="cursor-pointer text-sm font-normal">{t("people.contacts.primaryCheckbox")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("people.cancel")}</Button>
            <Button onClick={save} disabled={busy || !form.name.trim()}>{busy ? t("people.saving") : t("people.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

export function OrganizationsView() {
  useLang(); // dil değişiminde yeniden render
  const { tenant, bump, refreshKey, currentEditionId } = useApp();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<OrgRow | null>(null);
  const [detail, setDetail] = useState<Org360 | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<OrgRow | null>(null);
  const [form, setForm] = useState({ name: "", type: "COMPANY", city: "", website: "", generalEmail: "", address: "", description: "", locationNote: "" });

  const { data, error, reload, loading } = useApi<OrgRow[]>(() => listEntity<OrgRow>("organizations", { q }), [q, refreshKey]);

  // Faz E: teslim + sipariş durum map'leri (render başına bir kez)
  const deliverableStatusMap = Object.fromEntries(Object.entries(DELIVERABLE_MAP).map(([k]) => [k, tLabel(DELIVERABLE_MAP, k)]));
  // PARTIALLY_PAID taban status sözlüğünde PAYMENT "Kısmi" ile çakıştığından sipariş durumu people.orderStatus.* ile çevrilir
  const orderStatusMap: Record<string, string> = {
    OPEN: t("people.orderStatus.open"), PARTIALLY_PAID: t("people.orderStatus.partiallyPaid"),
    PAID: t("people.orderStatus.paid"), CANCELLED: t("people.orderStatus.cancelled"),
  };

  const open360 = async (o: OrgRow) => {
    setSelected(o);
    setDetail(null);
    try {
      setDetail(await apiGet<Org360>(`/api/organizations/${o.id}`));
    } catch { /* yoksay */ }
  };
  const reloadDetail = async () => {
    if (!selected) return;
    try { setDetail(await apiGet<Org360>(`/api/organizations/${selected.id}`)); } catch { /* yoksay */ }
  };

  const defaultOrgForm = { name: "", type: "COMPANY", city: "", website: "", generalEmail: "", address: "", description: "", locationNote: "" };
  const openCreate = () => { setEditingOrg(null); setForm(defaultOrgForm); setCreateOpen(true); };
  const openEdit = (o: OrgRow) => {
    setEditingOrg(o);
    setForm({ name: o.name, type: o.type ?? "COMPANY", city: o.city ?? "", website: o.website ?? "", generalEmail: o.generalEmail ?? "", address: "", description: "", locationNote: o.locationNote ?? "" });
    // 360 verisindeki tam alanlarla doldur (adres/açıklama listede yok)
    apiGet<Org360>(`/api/organizations/${o.id}`).then((d) => {
      setForm({
        name: d.organization.name, type: d.organization.type ?? "COMPANY", city: d.organization.city ?? "", website: d.organization.website ?? "",
        generalEmail: d.organization.generalEmail ?? "", address: d.organization.address ?? "",
        description: d.organization.description ?? "", locationNote: d.organization.locationNote ?? "",
      });
    }).catch(() => { /* yoksay — liste verisiyle devam */ });
    setCreateOpen(true);
  };

  const saveOrg = async () => {
    const payload = {
      name: form.name, type: form.type, city: form.city || null, website: form.website || null,
      generalEmail: form.generalEmail || null, address: form.address || null, description: form.description || null, locationNote: form.locationNote || null,
    };
    try {
      if (editingOrg) {
        await apiSend(`/api/organizations/${editingOrg.id}`, "PUT", payload);
        toast({ title: t("people.org.updated"), description: form.name });
      } else {
        await apiSend("/api/organizations", "POST", { ...payload, tenantId: tenant?.id });
        toast({ title: t("people.org.created"), description: form.name });
      }
      setCreateOpen(false); setForm(defaultOrgForm); setEditingOrg(null);
      reload(); bump();
      if (selected?.id === editingOrg?.id) void reloadDetail();
    } catch (e) {
      toast({ title: t("common.error"), description: e instanceof Error ? e.message : t("people.org.saveFailed"), variant: "destructive" });
    }
  };

  return (
    <div>
      <PageHeader title={t("people.orgTitle")} desc={t("people.orgDesc")}>
        <Input placeholder={t("people.org.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-56" />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={openCreate}><Icons.Building2 className="size-4" /> {t("people.org.add")}</Button></DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingOrg ? t("people.org.editTitle") : t("people.org.newTitle")}</DialogTitle>
              <DialogDescription>{t("people.org.dialogDesc")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              {/* R10-a: kurum logosu — benzersiz adla Medya Arşivi → Kurum/Kuruluş Logoları klasörüne */}
              {editingOrg ? (
                <div className="rounded-lg border bg-muted/20 p-3 sm:col-span-2">
                  <p className="mb-2 text-xs font-semibold">{t("people.org.logoLabel")}</p>
                  <LinkedPhotoUploader
                    editionId={currentEditionId}
                    systemFolder="KURUM_LOGO"
                    linkedType="ORGANIZATION"
                    linkedId={editingOrg.id}
                    assetName={`${form.name || editingOrg.name}-logosu`}
                    currentUrl={editingOrg.logoUrl}
                    fit="contain"
                    onApply={async (dataUrl) => {
                      await apiSend(`/api/organizations/${editingOrg.id}`, "PUT", { logoUrl: dataUrl });
                      setEditingOrg({ ...editingOrg, logoUrl: dataUrl });
                      reload();
                      if (selected?.id === editingOrg.id) setDetail((d) => (d ? { ...d, organization: { ...d.organization, logoUrl: dataUrl } } : d));
                    }}
                    folderLabel={t("people.folder.orgLogos")}
                    alt={t("people.logoAlt", { name: editingOrg.name })}
                  />
                </div>
              ) : (
                <p className="text-[11px] leading-snug text-muted-foreground sm:col-span-2">{t("people.org.logoHint")}</p>
              )}
              <div className="sm:col-span-2"><Label>{t("people.lblName")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>{t("people.lblType")}</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ORG_TYPES).map(([k]) => <SelectItem key={k} value={k}>{tLabel(ORG_TYPES, k)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t("people.lblCity")}</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><Label>{t("people.lblWeb")}</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
              <div><Label>{t("people.org.generalEmail")}</Label><Input type="email" placeholder="info@kurum.com" value={form.generalEmail} onChange={(e) => setForm({ ...form, generalEmail: e.target.value })} /></div>
              <div className="sm:col-span-2">
                <Label>{t("people.lblAddress")}</Label>
                <Textarea className="mt-1" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={t("people.org.addressPh")} />
              </div>
              <div className="sm:col-span-2">
                <Label>{t("people.lblDesc")}</Label>
                <Textarea className="mt-1" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("people.org.descPh")} />
              </div>
              <div className="sm:col-span-2">
                <Label>{t("people.lblLocationNote")}</Label>
                <Input value={form.locationNote} onChange={(e) => setForm({ ...form, locationNote: e.target.value })} placeholder={t("people.org.locationPh")} />
                <p className="mt-1 text-[11px] text-muted-foreground">{t("people.org.locationExample")}</p>
              </div>
            </div>
            <DialogFooter><Button onClick={saveOrg} disabled={!form.name}>{editingOrg ? t("people.save") : t("people.create")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {(data ?? []).map((o, i) => (
            <button key={o.id} onClick={() => open360(o)} onDoubleClick={() => openEdit(o)} title={t("people.org.dblClickTip")} className="maven-stagger-item min-w-0 cursor-pointer rounded-xl border bg-card p-4 text-left transition hover:border-primary/40 hover:shadow-sm" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-center gap-2">
                {o.logoUrl ? (
                  <img src={o.logoUrl} alt={t("people.logoAlt", { name: o.name })} className="size-12 shrink-0 rounded-lg border bg-background object-contain p-0.5" />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-500/10 text-violet-600"><Icons.Building2 className="size-4" /></span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{o.name}</p>
                  <p className="text-xs text-muted-foreground">{o.city ?? "—"} · {tLabel(ORG_TYPES, o.type)}</p>
                </div>
              </div>
              {(o.generalEmail || o.locationNote) && (
                <p className="mt-2 truncate text-[11px] text-muted-foreground">
                  {o.generalEmail && <span className="inline-flex items-center gap-1"><Icons.Mail className="size-3 shrink-0" aria-hidden />{o.generalEmail}</span>}
                  {o.generalEmail && o.locationNote && " · "}
                  {o.locationNote && <span className="inline-flex items-center gap-1"><Icons.MapPin className="size-3 shrink-0" aria-hidden />{o.locationNote}</span>}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip tone="teal">{t("people.org.roleCount", { count: o._count?.eventAssignments ?? 0 })}</Chip>
                <Chip tone="violet">{t("people.org.agreementCount", { count: o._count?.sponsorAgreements ?? 0 })}</Chip>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Kurum 360 (§55) */}
      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto maven-scroll sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>{t("people.org360.desc")}</SheetDescription>
          </SheetHeader>
          {!detail ? <div className="p-6"><Loading rows={5} /></div> : (
            <div className="space-y-4 px-4 pb-8">
              <SectionCard
                title={t("people.org360.identityTitle")}
                desc={t("people.org360.identityDesc")}
                action={
                  <Button size="sm" variant="outline" onClick={() => openEdit(detail.organization)}>
                    <Icons.Pencil className="size-3.5" /> {t("people.edit")}
                  </Button>
                }
              >
                {/* R10-a: logo — kurum 360 kimlik kartında görüntülenir ve buradan yüklenir */}
                <div className="mb-2 rounded-lg border bg-muted/20 p-3">
                  <p className="mb-2 text-xs font-semibold">{t("people.org.logoLabel")}</p>
                  <LinkedPhotoUploader
                    editionId={currentEditionId}
                    systemFolder="KURUM_LOGO"
                    linkedType="ORGANIZATION"
                    linkedId={detail.organization.id}
                    assetName={`${detail.organization.name}-logosu`}
                    currentUrl={detail.organization.logoUrl}
                    fit="contain"
                    onApply={async (dataUrl) => {
                      await apiSend(`/api/organizations/${detail.organization.id}`, "PUT", { logoUrl: dataUrl });
                      setDetail((d) => (d ? { ...d, organization: { ...d.organization, logoUrl: dataUrl } } : d));
                      setSelected((s) => (s && s.id === detail.organization.id ? { ...s, logoUrl: dataUrl } : s));
                      reload();
                    }}
                    folderLabel={t("people.folder.orgLogos")}
                    alt={t("people.logoAlt", { name: detail.organization.name })}
                  />
                </div>
                <Row360Line label={t("people.lblType")}><Chip tone="violet">{tLabel(ORG_TYPES, detail.organization.type)}</Chip></Row360Line>
                <Row360Line label={t("people.org.generalEmail")}>{detail.organization.generalEmail ?? "—"}</Row360Line>
                <Row360Line label={t("people.lblWeb")}>{detail.organization.website ?? "—"}</Row360Line>
                <Row360Line label={t("people.lblAddress")}>
                  {detail.organization.address
                    ? <span className="whitespace-pre-line text-xs leading-snug">{detail.organization.address}</span>
                    : "—"}
                </Row360Line>
                <Row360Line label={t("people.lblLocationNote")}>
                  {detail.organization.locationNote
                    ? <span className="inline-flex items-center gap-1 text-xs"><Icons.MapPin className="size-3 shrink-0 text-teal-600" aria-hidden />{detail.organization.locationNote}</span>
                    : "—"}
                </Row360Line>
                {detail.organization.description && (
                  <>
                    <Separator className="my-2" />
                    <p className="text-xs leading-relaxed text-muted-foreground">{detail.organization.description}</p>
                  </>
                )}
              </SectionCard>

              <OrgQrPanel orgId={detail.organization.id} orgName={detail.organization.name} />

              <SectionCard title={t("people.org360.rolesTitle")} desc={t("people.org360.rolesDesc")}>
                {detail.eventAssignments.length === 0 ? <EmptyState title={t("people.org360.noRoles")} /> : detail.eventAssignments.map((a) => (
                  <Row360Line key={a.id} label={a.edition.name}><Chip tone="teal">{a.role}</Chip></Row360Line>
                ))}
              </SectionCard>

              {detail.sponsorAgreements.map((ag) => (
                <SectionCard key={ag.id} title={ag.package?.name ?? ag.tier?.name ?? t("people.org360.sponsorship")} desc={t("people.org360.statusMoney", { status: ag.status, amount: fmtMoney(ag.amount, ag.currency) })}>
                  <Row360Line label={t("people.org360.agreement")}><Chip tone={ag.status === "ACTIVE" || ag.status === "CONTRACTED" ? "emerald" : "amber"}>{ag.status}</Chip></Row360Line>
                  {detail.entitlements.filter((e) => e.quantityGranted > 0).map((e) => (
                    <Row360Line key={e.id} label={e.label}>
                      <span className="tabular-nums text-sm font-medium">
                        {e.quantityConsumed} / {e.quantityGranted}
                        {e.quantityReserved > 0 && <span className="ml-1 text-xs text-amber-600">{t("people.org360.reserved", { count: e.quantityReserved })}</span>}
                        <span className="ml-1 text-xs text-emerald-600">{t("people.org360.remaining", { count: Math.max(0, e.quantityGranted - e.quantityConsumed - e.quantityReserved) })}</span>
                      </span>
                    </Row360Line>
                  ))}
                  <Row360Line label={t("people.org360.booth")}>
                    {detail.boothAllocations.length > 0
                      ? detail.boothAllocations.map((b) => <span key={b.id} className="ml-1"><Chip tone="violet">{b.boothUnit.code}</Chip> {b.boothUnit.sizeSqm} m²</span>)
                      : "—"}
                  </Row360Line>
                  <Separator className="my-2" />
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("people.org360.deliverables")}</p>
                  <div className="space-y-1">
                    {ag.deliverables.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                        <span>{d.name}</span>
                        <StatusBadge map={deliverableStatusMap} value={d.status} />
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ))}

              {detail.orders.length > 0 && (
                <SectionCard title={t("people.org360.financeTitle")} desc={t("people.org360.financeDesc")}>
                  {detail.orders.map((o) => (
                    <Row360Line key={o.id} label={o.orderNo}>
                      <span className="tabular-nums">{fmtMoney(o.totalAmount, o.currency)} <StatusBadge map={orderStatusMap} value={o.status} /></span>
                    </Row360Line>
                  ))}
                </SectionCard>
              )}

              <OrgContactsPanel orgId={detail.organization.id} contacts={detail.contacts} onChanged={reloadDetail} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
