"use client";
// Kişiler & Kurum/Kuruluşlar — 360 görünümleri (§54, §55)
// Kişi 360: kimlik → katılımlar → roller → kayıt/ödeme → bilimsel → program → konaklama → yaka kartı/tarama → sertifika
// R9-c: Roller & Yetkiler sekmesi (özel rol motoru + hiyerarşi + giriş mock'u), CV & VCard, aile/refakatçi,
//       kurumsal kimlik kartı + kontak yönetimi + kurum QR paneli
// R10-a: çift tık → kişi düzenleme, kişi fotoğrafı + kurum logosu (upload-linked, benzersiz adla medya klasörüne)
import { useEffect, useRef, useState } from "react";
import { listEntity, apiSend, apiGet } from "@/lib/client";
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  useEffect(() => { setPreview(currentUrl ?? null); }, [currentUrl]);

  const pick = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = ""; // aynı dosya yeniden seçilebilsin
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Desteklenmeyen dosya", description: "Lütfen bir görsel dosyası seçin (image/*).", variant: "destructive" });
      return;
    }
    if (file.size > MAX_IMAGE_KB * 1024) {
      toast({ title: "Dosya çok büyük", description: `Görsel en fazla ${MAX_IMAGE_KB} KB olabilir — daha küçük bir dosya seçin.`, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("Dosya okunamadı"));
        fr.readAsDataURL(file);
      });
      const res = await apiSend<UploadLinkedResult>("/api/media/upload-linked", "POST", {
        editionId, systemFolder, name: assetName, dataUrl, linkedType, linkedId,
      });
      const finalUrl = res.asset.dataUrl ?? dataUrl;
      await onApply(finalUrl);
      setPreview(finalUrl);
      toast({ title: "Görsel yüklendi", description: `Medya Arşivi → ${folderLabel}: ${res.asset.name}` });
    } catch (e) {
      toast({ title: "Yükleme başarısız", description: e instanceof Error ? e.message : "Görsel yüklenemedi", variant: "destructive" });
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
            {preview ? "Değiştir" : "Görsel Seç"}
          </Button>
          <span className="text-[11px] text-muted-foreground">{preview ? "görsel bağlı" : "görsel yok"}</span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Medya Arşivi → {folderLabel} klasörüne benzersiz adla kaydedilir (≤ {MAX_IMAGE_KB} KB).</p>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={pick} disabled={busy} aria-label="Görsel dosyası seç" />
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
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3">
      <p className="truncate text-sm font-semibold">{p.fullName}</p>
      {p.email && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
      {(p.company || p.title) && <p className="truncate text-xs text-muted-foreground">{[p.company, p.title].filter(Boolean).join(" · ")}</p>}
      <p className="mt-1 text-[11px] text-muted-foreground">kayıt: {fmtDate(p.createdAt)}</p>
    </div>
  );
}

// ── R9-c: CV zaman çizelgesi (kişi 360 içi) ─────────────────────────────────
function CvPanel({ personId, editionId }: { personId: string; editionId: string | null }) {
  const { toast } = useToast();
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
      toast({ title: editing ? "CV kaydı güncellendi" : "CV kaydı eklendi", description: form.title });
      setOpen(false); reload();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "CV kaydı kaydedilemedi", variant: "destructive" });
    } finally { setBusy(false); }
  };
  const remove = async (c: CvEntryRow) => {
    try {
      await apiSend(`/api/cv-entries/${c.id}`, "DELETE");
      toast({ title: "CV kaydı silindi", description: c.title });
      reload();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Silinemedi", variant: "destructive" });
    }
  };

  const groups = CV_KIND_ORDER.map((k) => ({ kind: k, items: (cvs ?? []).filter((c) => c.kind === k).sort((a, b) => a.order - b.order) })).filter((g) => g.items.length > 0);
  const canAdd = Boolean(editionId);

  return (
    <SectionCard
      title="CV & Deneyimler"
      desc="Eğitim, deneyim, ödül, dil, yayın ve sertifikalar — kişiye bağlı zaman çizelgesi"
      action={
        <Button size="sm" variant="outline" onClick={openNew} disabled={!canAdd} aria-label="CV kaydı ekle">
          <Icons.Plus className="size-3.5" /> Ekle
        </Button>
      }
    >
      {!canAdd && <p className="mb-2 text-[11px] text-amber-600">CV kaydı için bir edisyon seçili olmalı (etkinlik izolasyonu).</p>}
      {loading ? <Loading rows={2} /> : error ? <ErrorState message={error} onRetry={reload} /> : groups.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">Henüz CV kaydı yok — &quot;Ekle&quot; ile ilk kaydı girin.</p>
      ) : (
        <div className="maven-scroll max-h-96 space-y-4 overflow-y-auto pr-1">
          {groups.map((g, gi) => (
            <div key={g.kind} className="maven-stagger-item" style={{ animationDelay: `${gi * 60}ms` }}>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                <Chip tone="teal">{label(CV_KIND, g.kind)}</Chip>
                <span className="font-normal tabular-nums text-muted-foreground">{g.items.length} kayıt</span>
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
                          {c.isCurrent && <Chip tone="emerald">Devam ediyor</Chip>}
                          <button onClick={() => openEdit(c)} className="rounded p-1 text-muted-foreground opacity-60 transition hover:bg-muted hover:text-foreground group-hover:opacity-100" aria-label={`${c.title} kaydını düzenle`}>
                            <Icons.Pencil className="size-3.5" />
                          </button>
                          <button onClick={() => remove(c)} className="rounded p-1 text-muted-foreground opacity-60 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100" aria-label={`${c.title} kaydını sil`}>
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
            <DialogTitle>{editing ? "CV Kaydını Düzenle" : "Yeni CV Kaydı"}</DialogTitle>
            <DialogDescription>Tür, başlık ve tarih aralığı — &quot;Devam ediyor&quot; işaretliyse bitiş tarihi yok sayılır.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Tür</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CV_KIND).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Sıra</Label><Input type="number" className="mt-1 tabular-nums" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Başlık *</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Örn. Endüstri Mühendisliği — Lisans" /></div>
            <div><Label>Kurum / Okul</Label><Input className="mt-1" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} /></div>
            <div><Label>Şehir</Label><Input className="mt-1" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div><Label>Başlangıç</Label><Input type="date" className="mt-1 tabular-nums" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div>
              <Label className={cn(form.isCurrent && "opacity-50")}>Bitiş</Label>
              <Input type="date" className="mt-1 tabular-nums" disabled={form.isCurrent} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="cv-current" checked={form.isCurrent} onCheckedChange={(v) => setForm({ ...form, isCurrent: v === true })} />
              <Label htmlFor="cv-current" className="cursor-pointer text-sm font-normal">Devam ediyor</Label>
            </div>
            <div className="sm:col-span-2"><Label>Açıklama</Label><Textarea className="mt-1" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button onClick={save} disabled={busy || !form.title.trim()}>{busy ? "Kaydediliyor…" : "Kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// ── R9-c: QR VCard kartı (kişi 360 içi) ─────────────────────────────────────
function VCardPanel({ personId }: { personId: string }) {
  const { toast } = useToast();
  const { data, error, reload, loading } = useApi<PersonVCard | null>(
    () => apiGet<PersonVCard>(`/api/people/${personId}/vcard?format=json`),
    [personId],
  );
  const copyQr = async () => {
    if (!data?.qrDataUrl) return;
    try {
      await navigator.clipboard.writeText(data.qrDataUrl);
      toast({ title: "QR veri adresi kopyalandı", description: "data:image/png;base64,… — tasarım araçlarında kullanılabilir." });
    } catch {
      toast({ title: "Kopyalanamadı", description: "Tarayıcı pano erişimini engelledi.", variant: "destructive" });
    }
  };

  const noContact = data && !data.person.email && !data.person.phone;

  return (
    <SectionCard
      title="QR VCard"
      desc="Yaka kartı ve etiket için taranabilir sanal kartvizit (vCard 3.0)"
      action={
        data && (
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/people/${personId}/vcard?format=vcf`} download>
              <Icons.Download className="size-3.5" /> vCard indir
            </a>
          </Button>
        )
      }
    >
      {loading ? <Loading rows={2} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data ? (
        <p className="text-xs text-muted-foreground">Kartvizit üretilemedi.</p>
      ) : noContact ? (
        <EmptyState title="Kartvizit için iletişim bilgisi yok" desc="QR kartvizit üretimi için kişiye en az e-posta veya telefon girin." />
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row">
          {/* QR — köşe vurgulu ince çerçeve */}
          <div className="maven-qrvcard mx-auto shrink-0 sm:mx-0">
            <img src={data.qrDataUrl} alt={`${data.person.fullName} vCard QR kodu`} width={120} height={120} className="size-[120px]" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-sm font-semibold leading-tight">{data.person.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{[data.person.title, data.person.company].filter(Boolean).join(" · ") || "—"}</p>
              {data.person.edition && <p className="mt-0.5 text-[11px] text-muted-foreground">son edisyon: {data.person.edition}</p>}
            </div>
            <div className="flex flex-wrap gap-1">
              {data.person.roles.slice(0, 4).map((r) => <Chip key={r} tone="teal">{label(EVENT_ROLES, r)}</Chip>)}
              {data.person.roles.length > 4 && <Chip tone="neutral">+{data.person.roles.length - 4}</Chip>}
              {data.person.roles.length === 0 && <span className="text-[11px] text-muted-foreground">atanmış rol yok</span>}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="ghost" className="h-7" onClick={copyQr}>
                <Icons.Copy className="size-3.5" /> QR&apos;ı kopyala
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
    : "yükleniyor…";

  return (
    <SectionCard title="Aile & Refakatçiler" desc="Ana kişi–misafir hiyerarşisi (Parent_ID kuralı)">
      <Row360Line label="Bağlı olduğu kişi">
        {person.parentPersonId ? (
          <span className="inline-flex items-center gap-1.5">
            <Icons.Link2 className="size-3.5 text-teal-600" aria-hidden />
            <span className="font-medium">{parentLabel}</span>
          </span>
        ) : "—"}
      </Row360Line>
      <Row360Line label="Bağlantı türü">{person.relationType ? <Chip tone="violet">{label(RELATION_TYPE, person.relationType)}</Chip> : "—"}</Row360Line>
      <Separator className="my-2" />
      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Refakatçiler</p>
      {loading ? <Loading rows={1} /> : error ? <ErrorState message={error} onRetry={reload} /> : dependents.length === 0 ? (
        <p className="text-xs text-muted-foreground">Bu kişiye bağlı refakatçi yok.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {dependents.map((d, i) => (
            <Chip key={d.id} tone="teal">
              <span className="maven-stagger-item inline-flex items-center gap-1" style={{ animationDelay: `${i * 50}ms` }}>
                <Icons.UserRound className="size-3" aria-hidden />
                {d.firstName} {d.lastName}
                <span className="opacity-70">· {label(RELATION_TYPE, d.relationType)}</span>
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
      toast({ title: editing ? "Rol güncellendi" : "Rol oluşturuldu", description: `${form.name} · seviye ${form.hierarchyLevel}` });
      setDialogOpen(false); reload(); bump();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Rol kaydedilemedi", variant: "destructive" });
    } finally { setBusy(false); }
  };
  const toggleActive = async (r: CustomRoleRow) => {
    try {
      await apiSend(`/api/custom-roles/${r.id}`, "PUT", { isActive: !r.isActive });
      toast({ title: r.isActive ? "Rol pasifleştirildi" : "Rol aktifleştirildi", description: r.name });
      reload();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Durum değiştirilemedi", variant: "destructive" });
    }
  };
  const deleteRole = async (r: CustomRoleRow) => {
    try {
      await apiSend(`/api/custom-roles/${r.id}`, "DELETE");
      toast({ title: "Rol silindi", description: r.name });
      reload(); bump();
    } catch (e) {
      toast({ title: "Silinemedi", description: e instanceof Error ? e.message : "Rola bağlı atamalar olabilir.", variant: "destructive" });
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
      toast({ title: "Rol atandı", description: `${fullName(parts?.find((p) => p.id === assignPart)?.person ?? null)} → ${kind === "cus" ? sorted.find((r) => r.id === value)?.name : label(EVENT_ROLES, value)}` });
      setAssignPart(""); setAssignRole(""); bump();
    } catch (e) {
      toast({ title: "Atama başarısız", description: e instanceof Error ? e.message : "Rol atanamadı", variant: "destructive" });
    } finally { setAssignBusy(false); }
  };

  // ── giriş ekranı mock'u ──
  const [mockId, setMockId] = useState("");
  const mockRole = sorted.find((r) => r.id === mockId) ?? null;

  if (!currentEditionId) {
    return <EmptyState title="Edisyon seçili değil" desc="Özel roller edisyon kapsamında tanımlanır — üstten bir etkinlik seçin." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        {/* ── Özel rol kartları ── */}
        <SectionCard
          title="Özel Roller"
          desc="Edisyona özel rol tanımları — hiyerarşi seviyesi 1 (en üst) → 99 (en alt)"
          action={<Button size="sm" onClick={openNew}><Icons.Plus className="size-4" /> Yeni Rol</Button>}
        >
          {loading ? <Loading rows={3} /> : error ? <ErrorState message={error} onRetry={reload} /> : sorted.length === 0 ? (
            <EmptyState title="Henüz özel rol yok" desc="Akreditasyon denetçisi, gala host gibi etkinliğe özel roller tanımlayın." />
          ) : (
            <div className="maven-scroll grid max-h-96 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {sorted.map((r, i) => (
                <div key={r.id} className="maven-stagger-item rounded-xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-start gap-2.5">
                    <span className={cn("mt-0.5 size-3 shrink-0 rounded-full shadow-sm", ROLE_DOT[r.color ?? "teal"] ?? ROLE_DOT.teal)} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold">{r.name}</p>
                        <Chip tone="neutral">Sv. <span className="tabular-nums">{r.hierarchyLevel}</span></Chip>
                        {!r.isActive && <Chip tone="amber">pasif</Chip>}
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{r.key}</p>
                      {r.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {parsePerms(r.permissions).map((p) => <Chip key={p} tone="teal">{CAP_LABEL[p] ?? p}</Chip>)}
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t pt-2">
                        <Chip tone={r.isSystem ? "violet" : "neutral"}>{r.isSystem ? "sistem rolü" : "özel rol"}</Chip>
                        <span className="ml-auto flex items-center gap-0.5">
                          <button onClick={() => openEdit(r)} className="rounded p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={`${r.name} rolünü düzenle`}>
                            <Icons.Pencil className="size-3.5" />
                          </button>
                          <button onClick={() => toggleActive(r)} className="rounded p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={r.isActive ? `${r.name} rolünü pasifleştir` : `${r.name} rolünü aktifleştir`}>
                            <Icons.Power className={cn("size-3.5", r.isActive && "text-emerald-600")} />
                          </button>
                          {!r.isSystem && (
                            <button onClick={() => deleteRole(r)} className="rounded p-1.5 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600" aria-label={`${r.name} rolünü sil`}>
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
        <SectionCard title="Rol Giriş Ekranı" desc="Dış portal rol girişi — yalnızca tasarım önizlemesi">
          <Select value={mockId} onValueChange={setMockId}>
            <SelectTrigger className="h-9" aria-label="Mock ekranı için rol seç"><SelectValue placeholder="Rol seçin…" /></SelectTrigger>
            <SelectContent>
              {sorted.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} · Sv. {r.hierarchyLevel}</SelectItem>)}
              {sorted.length === 0 && <SelectItem value="__none" disabled>Önce özel rol tanımlayın</SelectItem>}
            </SelectContent>
          </Select>
          {mockRole ? (
            <RoleLoginMock key={mockRole.id} role={mockRole} />
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Bir rol seçildiğinde portal giriş ekranı önizlemesi burada görünür.</p>
          )}
        </SectionCard>
      </div>

      {/* ── Hiyerarşi rayı ── */}
      <SectionCard title="Hiyerarşi Rayı" desc="Seviye sırasına göre yetki zinciri — büyük daire üst yetki">
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">Rol tanımı yok — zincir boş.</p>
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
                      title={`${r.name} — seviye ${r.hierarchyLevel}`}
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
      <SectionCard title="Rol Ataması" desc="Katılım seç → rol ver; özel roller EventRoleAssignment.customRoleId ile bağlanır">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div>
            <Label className="text-xs text-muted-foreground">Katılım (kişi)</Label>
            <Select value={assignPart} onValueChange={setAssignPart}>
              <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Katılım seçin…" /></SelectTrigger>
              <SelectContent className="maven-scroll max-h-72">
                {(parts ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {fullName(p.person)}{p.person.company ? ` — ${p.person.company}` : ""}
                  </SelectItem>
                ))}
                {(parts ?? []).length === 0 && <SelectItem value="__none" disabled>Bu edisyonda katılım yok</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Rol</Label>
            <Select value={assignRole} onValueChange={setAssignRole}>
              <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Rol seçin…" /></SelectTrigger>
              <SelectContent>
                {Object.entries(EVENT_ROLES).map(([k, v]) => <SelectItem key={k} value={`std:${k}`}>{v}</SelectItem>)}
                {sorted.length > 0 && (
                  <>
                    <div className="my-1 border-t" />
                    {sorted.map((r) => <SelectItem key={r.id} value={`cus:${r.id}`}>{r.name} (özel · Sv. {r.hierarchyLevel})</SelectItem>)}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button className="h-9" onClick={doAssign} disabled={assignBusy || !assignPart || !assignRole}>
            {assignBusy ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.UserCheck className="size-4" />} Ata
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Katılım listesi en fazla 50 kayıt gösterir; kişi araması Kişiler sekmesindeki 360 görünümünden yapılabilir.</p>
      </SectionCard>

      {/* ── rol oluştur/düzenle diyaloğu ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Özel Rolü Düzenle" : "Yeni Özel Rol"}</DialogTitle>
            <DialogDescription>Anahtar benzersiz olmalı (edisyon kapsamında); yetkiler CAPABILITIES anahtarlarından seçilir.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Rol adı *</Label>
              <Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, key: form.keyTouched ? form.key : slugifyKey(e.target.value) })} placeholder="Örn. Akreditasyon Denetçisi" />
            </div>
            <div className="sm:col-span-2">
              <Label>Anahtar (key)</Label>
              <Input className={cn("mt-1 font-mono text-xs", keyClash && "border-rose-400 focus-visible:ring-rose-300")} value={keyHint} onChange={(e) => setForm({ ...form, key: slugifyKey(e.target.value), keyTouched: true })} placeholder="otomatik öneri" />
              <p className={cn("mt-1 text-[11px]", keyClash ? "text-rose-600" : "text-muted-foreground")}>
                {keyClash ? "Bu anahtar başka rolde kullanılıyor — benzersiz olmalı." : `slug önerisi: ${keyHint || "—"}`}
              </p>
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-baseline justify-between">
                <Label>Hiyerarşi seviyesi</Label>
                <span className="text-xs font-semibold tabular-nums text-primary">{form.hierarchyLevel} <span className="font-normal text-muted-foreground">(1 en üst · 99 en alt)</span></span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Slider value={[form.hierarchyLevel]} min={1} max={99} step={1} onValueChange={(v) => setForm({ ...form, hierarchyLevel: v[0] ?? 50 })} aria-label="Hiyerarşi seviyesi" />
                <Input type="number" min={1} max={99} className="h-9 w-20 tabular-nums" value={form.hierarchyLevel} onChange={(e) => setForm({ ...form, hierarchyLevel: Math.min(99, Math.max(1, Number(e.target.value) || 1)) })} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>Renk</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Rol rengi">
                {ROLE_COLORS.map((c) => (
                  <button key={c.key} type="button" role="radio" aria-checked={form.color === c.key} onClick={() => setForm({ ...form, color: c.key })}
                    className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      form.color === c.key ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40")}>
                    <span className={cn("size-3 rounded-full", ROLE_DOT[c.key])} aria-hidden /> {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>Yetkiler (CAPABILITIES)</Label>
              <div className="maven-scroll mt-1.5 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border bg-muted/20 p-2.5">
                {CAPABILITIES.map((c) => {
                  const on = form.permissions.includes(c.key);
                  return (
                    <button key={c.key} type="button" aria-pressed={on} title={c.desc}
                      onClick={() => setForm({ ...form, permissions: on ? form.permissions.filter((p) => p !== c.key) : [...form.permissions, c.key] })}
                      className={cn("rounded-md border px-2 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        on ? "border-teal-300 bg-teal-50 text-teal-700" : "bg-card text-muted-foreground hover:border-teal-300 hover:text-teal-700")}>
                      {on && <Icons.Check className="mr-1 inline size-3" aria-hidden />}{c.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>Açıklama</Label>
              <Textarea className="mt-1" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Rolün kapsamı ve sorumluluğu…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Vazgeç</Button>
            <Button onClick={saveRole} disabled={busy || !form.name.trim() || !keyHint || keyClash}>
              {busy ? "Kaydediliyor…" : editing ? "Güncelle" : "Oluştur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// rol giriş ekranı mock'u — tarayıcı çerçevesi + su damgası (yalnız tasarım)
function RoleLoginMock({ role }: { role: CustomRoleRow }) {
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
          <span className="-rotate-12 text-3xl font-bold uppercase tracking-[0.3em] text-muted-foreground/10">Önizleme</span>
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
              <Label className="text-[10px] text-muted-foreground">E-posta</Label>
              <Input disabled placeholder="ornek@kurum.com" className="mt-0.5 h-8 bg-muted/40 text-xs" aria-label="E-posta (devre dışı önizleme)" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Şifre</Label>
              <Input disabled type="password" placeholder="••••••••" className="mt-0.5 h-8 bg-muted/40 text-xs" aria-label="Şifre (devre dışı önizleme)" />
            </div>
            <Button disabled className="h-8 w-full text-xs">Giriş Yap</Button>
            <p className="flex items-center gap-1 pt-0.5 text-[10px] text-muted-foreground">
              <Icons.Info className="size-3 shrink-0" aria-hidden />
              Bu ekran gerçek kimlik doğrulama içermez — dış portal ayrı uygulamasının tasarım önizlemesidir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PeopleView() {
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

  const { data, error, reload, loading } = useApi<PersonRow[]>(() => listEntity<PersonRow>("people", { q, limit: 300 }), [q]);

  // Olası mükerrerler — tenant geneli (edisyon-bağımsız, null-guard gerekmez); edisyon değişince tazelensin
  const { data: dupData, error: dupError, reload: dupReload } = useApi<DuplicatesData>(() => apiGet<DuplicatesData>("/api/people/duplicates"), [currentEditionId, refreshKey]);

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
        toast({ title: "Kişi güncellendi", description: `${form.firstName} ${form.lastName}` });
      } else {
        await apiSend("/api/people", "POST", { ...payload, tenantId: tenant?.id });
        toast({ title: "Kişi oluşturuldu", description: `${form.firstName} ${form.lastName} tenant içine eklendi.` });
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
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Kişi kaydedilemedi", variant: "destructive" });
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
      toast({ title: "Hata", description: "Kaynak ve hedef aynı olamaz.", variant: "destructive" });
      return;
    }
    setMergeBusy(true);
    try {
      const r = await apiSend<{ mergedRegistrations?: number; resolvedEditions?: number }>("/api/flows", "POST", {
        action: "person.merge", sourceId: source.id, targetId: target.id, resolutions, fillProfile: true,
      });
      toast({
        title: "Kişiler birleştirildi — geçmiş korundu",
        description: `${source.fullName} → ${target.fullName}${r.mergedRegistrations ? ` · ${r.mergedRegistrations} kayıt taşındı` : ""}${r.resolvedEditions ? ` · ${r.resolvedEditions} edisyonda çakışma çözüldü` : ""}`,
      });
      setMergeSug(null);
      setMergeTarget(null);
      setMergePreview(null);
      reload(); dupReload(); bump(); // kişi listesi + mükerrer listesi + global sayaçlar
    } catch (e) {
      toast({ title: "Birleştirme başarısız", description: e instanceof Error ? e.message : "Kişiler birleştirilemedi", variant: "destructive" });
    } finally {
      setMergeBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Kişiler" desc="Tenant içinde tekil kimlik — e-posta güçlü işaret, kesin kimlik değil (birleştirme onaylı yapılır)">
        {dupData && dupData.suggestions.length === 0 && (
          <Chip tone="emerald">
            <span className="inline-flex items-center gap-1"><Icons.CheckCircle2 className="size-3" aria-hidden />Mükerrer yok</span>
          </Chip>
        )}
        <Input placeholder="Ad, e-posta, kurum ara…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-56" />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={openCreate}><Icons.UserPlus className="size-4" /> Kişi Ekle</Button></DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingPerson ? "Kişiyi Düzenle" : "Yeni Kişi"}</DialogTitle>
              <DialogDescription>Tüm kişi durumunu tek ekranda gör/düzenle — refakatçi/misafir profili için ana kişi bağlanabilir (Parent_ID). Çift tıklama ile de açılır.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Ad *</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
              <div><Label>Soyad *</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>E-posta</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Telefon</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Şehir</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><Label>Kurum</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
              <div><Label>Unvan</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Ülke</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
              <div>
                <Label>LinkedIn</Label>
                <Input value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} placeholder="linkedin.com/in/…" />
              </div>
              <div>
                <Label>Durum</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Aktif</SelectItem>
                    <SelectItem value="PASSIVE">Pasif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Bio</Label>
                <Textarea rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Kısa özgeçmiş / tanıtım…" />
              </div>
              {/* R10-a: kişi fotoğrafı — benzersiz adla Medya Arşivi → Kişi Fotoğrafları klasörüne */}
              {editingPerson ? (
                <div className="rounded-lg border bg-muted/20 p-3 sm:col-span-2">
                  <p className="mb-2 text-xs font-semibold">Kişi Fotoğrafı</p>
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
                    folderLabel="Kişi Fotoğrafları"
                    alt={`${editingPerson.firstName} ${editingPerson.lastName} fotoğrafı`}
                  />
                </div>
              ) : (
                <p className="text-[11px] leading-snug text-muted-foreground sm:col-span-2">Fotoğraf, kişi kaydedildikten sonra “Kişiyi Düzenle” ekranından eklenir — benzersiz adla Medya Arşivi → Kişi Fotoğrafları klasörüne gider.</p>
              )}
              <div className="sm:col-span-2">
                <Label>Bağlı olduğu ana kişi (opsiyonel)</Label>
                <Select value={form.parentPersonId} onValueChange={(v) => setForm({ ...form, parentPersonId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Yok" /></SelectTrigger>
                  <SelectContent className="maven-scroll max-h-64">
                    <SelectItem value="none">— Ana kişi yok —</SelectItem>
                    {(data ?? []).filter((p) => p.id !== editingPerson?.id).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.company ? ` — ${p.company}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className={cn(form.parentPersonId === "none" && "opacity-50")}>Bağlantı türü</Label>
                <Select value={form.relationType} onValueChange={(v) => setForm({ ...form, relationType: v })} disabled={form.parentPersonId === "none"}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RELATION_TYPE).filter(([k]) => k !== "SELF").map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">Eş, çocuk, misafir veya asistan — refakatçi yaka kartlarında gösterilir.</p>
              </div>
            </div>
            <DialogFooter><Button onClick={savePerson} disabled={!form.firstName || !form.lastName}>{editingPerson ? "Kaydet" : "Oluştur"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Tabs defaultValue="people">
        <TabsList className="h-auto">
          <TabsTrigger value="people"><Icons.Users className="size-4" /> Kişiler</TabsTrigger>
          <TabsTrigger value="roles"><Icons.ShieldCheck className="size-4" /> Roller &amp; Yetkiler</TabsTrigger>
        </TabsList>

        {/* ═══ Kişiler sekmesi — mevcut akış korunmuş ═══ */}
        <TabsContent value="people" className="mt-4">
          {/* ── Olası Mükerrerler (R2-b) — öneri bağlamaz, birleştirme onaylı yapılır ── */}
          {dupError && !dupData && (
            <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icons.TriangleAlert className="size-3.5 shrink-0 text-amber-500" aria-hidden />
              Mükerrer taraması yüklenemedi — kişi listesi etkilenmedi.
            </p>
          )}
          {dupData && dupData.suggestions.length > 0 && (
            <SectionCard
              title="Olası Mükerrerler"
              desc="Tenant genelinde kimlik eşleşmesi — öneriler bağlamadan incelenmelidir"
              action={<Chip tone="amber">{dupData.suggestions.length} öneri</Chip>}
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
                            <Icons.Merge className="size-4" /> Birleştir
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

          {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (data ?? []).length === 0 ? (
            <EmptyState title="Kişi bulunamadı" desc="Filtre sonucu yok — aramayı temizleyin veya yeni kişi ekleyin." />
          ) : (
            <div className="grid gap-2">
              {(data ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => open360(p)}
                  onDoubleClick={() => openEdit(p)}
                  title="Çift tıkla: kişiyi düzenle — tüm kişi alanları tek diyaloğda"
                  className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-primary/40 hover:shadow-sm"
                >
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt={`${p.firstName} ${p.lastName} fotoğrafı`} className="size-9 shrink-0 rounded-full border object-cover" />
                  ) : (
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {p.firstName[0]}{p.lastName[0]}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p.firstName} {p.lastName}
                      {p.status === "MERGED" && <Chip tone="rose">birleştirildi</Chip>}
                      {p.parentPersonId && <Chip tone="violet">refakatçi</Chip>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{p.title ? `${p.title} · ` : ""}{p.company ?? "—"} · {p.email ?? "e-posta yok"}</p>
                  </div>
                  <Icons.ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}

          {/* ── Birleştirme onay diyaloğu — hedef seçimi + çakışma çözümü (R7) ── */}
          <Dialog open={Boolean(mergeSug)} onOpenChange={(o) => { if (!o) setMergeSug(null); }}>
            <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Kişileri Birleştir</DialogTitle>
                <DialogDescription>{mergeSug?.note ?? "Kaynak kişi hedefe taşınır; hedef kayıt korunur."}</DialogDescription>
              </DialogHeader>

              <div role="radiogroup" aria-label="Korunacak kişi" className="grid gap-2 sm:grid-cols-2">
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
                          {i === 0 ? "A'yı koru" : "B'yi koru"} <span className="font-normal text-muted-foreground">({i === 0 ? "B" : "A"} birleşir)</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{p.fullName} · {p.email ?? "e-posta yok"} · {p.company ?? "—"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* ── Çakışma önizlemesi — hedef seçilince yüklenir ── */}
              {previewLoading && (
                <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><Icons.Loader2 className="size-3.5 animate-spin" /> Çakışma analizi yapılıyor…</p>
              )}
              {mergePreview && !previewLoading && (
                <div className="maven-portal-enter space-y-3">
                  {/* profil alan farkları */}
                  {mergePreview.fieldDiffs.length > 0 && (
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Icons.SlidersHorizontal className="size-3.5 text-primary" /> Profil alanları</p>
                      <ul className="space-y-1">
                        {mergePreview.fieldDiffs.map((f) => (
                          <li key={f.field} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                            <span className="w-14 shrink-0 font-medium text-muted-foreground">{MERGE_FIELD_LABELS[f.field] ?? f.field}</span>
                            {f.kind === "fill" ? (
                              <Chip tone="teal">hedef boş → &quot;{f.source}&quot; kaynaktan doldurulur</Chip>
                            ) : (
                              <Chip tone="amber">farklı: hedef &quot;{f.target}&quot; · kaynak &quot;{f.source}&quot; → hedef korunur</Chip>
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
                        {mergePreview.conflictingEditions.length} edisyonda iki katılım var — kazanan seçilmeli
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
                                {s.regNo ? <><span className="font-mono">{s.regNo}</span> · </> : "kayıt yok · "}
                                {s.regStatus ? <>{REGISTRATION_STATUS[s.regStatus] ?? s.regStatus}{s.categoryName ? ` (${s.categoryName})` : ""} · </> : ""}
                                {s.badgeCount > 0 ? `${s.badgeCount} yaka kartı` : "yaka kartı yok"}
                              </span>
                            </button>
                          );
                        };
                        return (
                          <div key={c.editionId} className="rounded-lg border bg-card p-2.5">
                            <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">{c.editionName} · {fmtDate(c.startDate)}</p>
                            <div role="radiogroup" aria-label={`${c.editionName} için kazanacak katılım`} className="flex flex-col gap-2 sm:flex-row">
                              <SideBox sideName="source" s={c.source} />
                              <SideBox sideName="target" s={c.target} />
                            </div>
                            <p className="mt-1.5 text-[10px] text-muted-foreground">
                              {winner === "target"
                                ? `${mergePreview.source.firstName} katılımındaki kayıtlar/yaka kartları/taramalar ${mergePreview.target.firstName} katılımına taşınır, boşalan silinir.`
                                : `${mergePreview.target.firstName} katılımındaki kayıtlar/yaka kartları/taramalar ${mergePreview.source.firstName} katılımına taşınır, boşalan silinir.`}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700">
                      <Icons.CheckCircle2 className="size-3.5" aria-hidden /> Edisyon çakışması yok — katılımlar doğrudan taşınır.
                    </p>
                  )}

                  {/* taşınacaklar özeti */}
                  <div className="flex flex-wrap gap-1.5">
                    {mergePreview.movableParticipations > 0 && <Chip tone="teal">{mergePreview.movableParticipations} katılım</Chip>}
                    {Object.entries(mergePreview.moves).filter(([, n]) => n > 0).map(([k, n]) => (
                      <Chip key={k} tone="neutral">{n} {MERGE_MOVE_LABELS[k] ?? k}</Chip>
                    ))}
                    {mergePreview.loserBadges > 0 && (
                      <Chip tone="amber">{mergePreview.loserBadges} yaka kartı kaybeden taraftan kazanan tarafına taşınır</Chip>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                <Icons.TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                <span>Birleştirme geri alınamaz ve tek işlemde yapılır. Kaynak kişinin katılımları, bildirileri, yazarlıkları, hakemlikleri, görevleri ve saha taramaları hedefe taşınır; kaynak kişi MERGED durumuna geçer ve kişiler listesinde gizlenir.</span>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMergeSug(null)} disabled={mergeBusy}>İptal</Button>
                <Button onClick={confirmMerge} disabled={mergeBusy || !mergeTarget || previewLoading}>
                  {mergeBusy ? <Icons.Loader2 className="size-4 animate-spin" aria-hidden /> : <Icons.Merge className="size-4" aria-hidden />}
                  Birleştir
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
                  {detail?.person.status === "MERGED" && <Chip tone="rose">birleştirildi</Chip>}
                </SheetTitle>
                <SheetDescription>Kişi 360 — modüllerin gerçeklerini birleştiren görünüm; veri sahibi değildir.</SheetDescription>
              </SheetHeader>
              {detailLoading ? <div className="p-6"><Loading rows={5} /></div> : !detail ? (
                <EmptyState title="360 verisi alınamadı" />
              ) : (
                <div className="space-y-4 px-4 pb-8">
                  <SectionCard
                    title="Kimlik"
                    action={
                      <Button size="sm" variant="outline" onClick={() => openEdit(detail.person)}>
                        <Icons.Pencil className="size-3.5" /> Düzenle
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
                        folderLabel="Kişi Fotoğrafları"
                        alt={`${detail.person.firstName} ${detail.person.lastName} fotoğrafı`}
                      />
                    </div>
                    <Row360Line label="E-posta">{detail.person.email ?? "—"}</Row360Line>
                    <Row360Line label="Telefon">{detail.person.phone ?? "—"}</Row360Line>
                    <Row360Line label="Kurum">{detail.person.company ?? "—"}</Row360Line>
                    <Row360Line label="Unvan">{detail.person.title ?? "—"}</Row360Line>
                    <Row360Line label="Şehir">{detail.person.city ?? "—"}</Row360Line>
                    <Row360Line label="Ülke">{detail.person.country ?? "—"}</Row360Line>
                    {detail.person.linkedin && (
                      <Row360Line label="LinkedIn">
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
                      <SectionCard key={part.id} title={part.edition?.name ?? "Edisyon"} desc={`Katılım · kaynak: ${label(REG_SOURCES, part.source)}`}>
                        <Row360Line label="Kayıt">
                          {reg ? (
                            <span className="inline-flex flex-wrap items-center justify-end gap-1">
                              <StatusBadge map={REGISTRATION_STATUS} value={reg.status} />
                              <StatusBadge map={PAYMENT_STATUS} value={["SPONSOR_ENTITLEMENT", "SPEAKER_ENTITLEMENT", "HOST_COMPLIMENTARY", "STAFF"].includes(reg.fundingSource) ? "NOT_REQUIRED" : "PENDING"} />
                            </span>
                          ) : "kayıt yok"}
                        </Row360Line>
                        <Row360Line label="Kategori">{reg?.category?.name ?? "—"}</Row360Line>
                        <Row360Line label="Fon kaynak">{label(FUNDING_SOURCES, reg?.fundingSource)}</Row360Line>
                        <Row360Line label="Katılım"><StatusBadge map={ATTENDANCE_STATUS} value={part.attendance} /></Row360Line>
                        <Row360Line label="Yaka Kartı">
                          {badge ? <span className="inline-flex items-center gap-1"><Chip tone="violet">{badge.profile?.name ?? "Profil"}</Chip> <StatusBadge map={BADGE_STATUS} value={badge.status} /></span> : "—"}
                        </Row360Line>
                        <Separator className="my-2" />
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">Roller</p>
                        <div className="flex flex-wrap gap-1">
                          {(part.roleAssignments ?? []).map((r) => <Chip key={r.id} tone="teal">{label(EVENT_ROLES, r.role)}</Chip>)}
                          {(part.roleAssignments ?? []).length === 0 && <span className="text-xs text-muted-foreground">rol atanmadı</span>}
                        </div>
                        {(part.programAssignments ?? []).length > 0 && (
                          <>
                            <p className="mb-1 mt-3 text-xs font-semibold text-muted-foreground">Program</p>
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
                            <p className="mb-1 mt-3 text-xs font-semibold text-muted-foreground">Son taramalar</p>
                            <div className="space-y-1">
                              {part.scanEvents.slice(0, 4).map((s) => (
                                <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                                  <span>{s.location === "SESSION" ? "Oturum girişi" : s.location} · {fmtDateTime(s.scannedAt)}</span>
                                  <Chip tone={s.result === "ALLOWED" ? "emerald" : s.result === "DENIED" ? "rose" : "amber"}>{s.result}</Chip>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        {(part.certIssues ?? []).length > 0 && (
                          <>
                            <p className="mb-1 mt-3 text-xs font-semibold text-muted-foreground">Sertifikalar</p>
                            <div className="space-y-1">
                              {part.certIssues.map((c) => (
                                <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="truncate">{c.definition.name}</span>
                                  <StatusBadge map={CERTIFICATE_STATUS} value={c.status} />
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
                    <SectionCard title="Bilimsel" desc="yazarlık ve hakemlik">
                      {detail.submissions.map((s) => (
                        <Row360Line key={s.id} label={s.code}>
                          <span className="inline-flex items-center justify-end gap-1"><span className="max-w-52 truncate">{s.title}</span> <StatusBadge map={SUBMISSION_STATUS} value={s.status} /></span>
                        </Row360Line>
                      ))}
                      {detail.reviewAssignments.map((r) => (
                        <Row360Line key={r.id} label="Hakemlik">
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
  const { toast } = useToast();
  const { data, error, reload, loading } = useApi<OrgVCard>(
    () => apiGet<OrgVCard>(`/api/organizations/${orgId}/vcard?format=json`),
    [orgId],
  );
  const copyLocation = async () => {
    if (!data?.locationQrDataUrl) return;
    try {
      await navigator.clipboard.writeText(data.locationQrDataUrl);
      toast({ title: "Konum QR veri adresi kopyalandı", description: "Tabela ve yönlendirme tasarımında kullanılabilir." });
    } catch {
      toast({ title: "Kopyalanamadı", description: "Tarayıcı pano erişimini engelledi.", variant: "destructive" });
    }
  };

  return (
    <SectionCard
      title="Kurum QR Paneli"
      desc="Kartvizit ve konum yönlendirmesi — tabela, stand ve baskı malzemelerinde kullanılır"
      action={
        data && (
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/organizations/${orgId}/vcard?format=vcf`} download>
              <Icons.Download className="size-3.5" /> vCard indir
            </a>
          </Button>
        )
      }
    >
      {loading ? <Loading rows={2} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data ? (
        <p className="text-xs text-muted-foreground">QR üretilemedi.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="maven-stagger-item flex flex-col items-center gap-2 rounded-xl border bg-muted/20 p-4" style={{ animationDelay: "0ms" }}>
            <div className="maven-qrvcard">
              <img src={data.qrDataUrl} alt={`${orgName} kurum vCard QR kodu`} width={120} height={120} className="size-[120px]" />
            </div>
            <p className="text-xs font-semibold">Kurum QR</p>
            <p className="text-center text-[11px] leading-snug text-muted-foreground">vCard kartviziti — taramada kişi rehberine kurum olarak eklenir</p>
          </div>
          <div className="maven-stagger-item flex flex-col items-center gap-2 rounded-xl border bg-muted/20 p-4" style={{ animationDelay: "80ms" }}>
            <div className="maven-qrvcard">
              <img src={data.locationQrDataUrl} alt={`${orgName} konum QR kodu`} width={120} height={120} className="size-[120px]" />
            </div>
            <p className="text-xs font-semibold">Konum QR</p>
            <p className="max-w-full break-words text-center text-[11px] leading-snug text-muted-foreground">{data.locationPayload || "konum bilgisi yok"}</p>
            <Button size="sm" variant="ghost" className="h-7" onClick={copyLocation}>
              <Icons.Copy className="size-3.5" /> Konum QR&apos;ı kopyala
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── R9-c: Kurum iletişim kişileri (sınırsız kontak, rol + birincil yıldızı) ──
function OrgContactsPanel({ orgId, contacts, onChanged }: { orgId: string; contacts: OrgContactRow[]; onChanged: () => void }) {
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
      toast({ title: editing ? "İletişim kişisi güncellendi" : "İletişim kişisi eklendi", description: form.name });
      setOpen(false); onChanged();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Kontak kaydedilemedi", variant: "destructive" });
    } finally { setBusy(false); }
  };
  const togglePrimary = async (c: OrgContactRow) => {
    try {
      if (!c.isPrimary) {
        for (const o of contacts) { if (o.isPrimary && o.id !== c.id) await apiSend(`/api/organization-contacts/${o.id}`, "PUT", { isPrimary: false }); }
        await apiSend(`/api/organization-contacts/${c.id}`, "PUT", { isPrimary: true });
        toast({ title: "Birincil kontak güncellendi", description: c.name });
      } else {
        await apiSend(`/api/organization-contacts/${c.id}`, "PUT", { isPrimary: false });
        toast({ title: "Birincil işareti kaldırıldı", description: c.name });
      }
      onChanged();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Güncellenemedi", variant: "destructive" });
    }
  };
  const remove = async (c: OrgContactRow) => {
    try {
      await apiSend(`/api/organization-contacts/${c.id}`, "DELETE");
      toast({ title: "İletişim kişisi silindi", description: c.name });
      onChanged();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Silinemedi", variant: "destructive" });
    }
  };

  return (
    <SectionCard
      title="İletişim Kişileri"
      desc="Rol bazlı sınırsız kontak — ödeme, teknik, basın sorumluları ayrı ayrı tutulur"
      action={<Button size="sm" variant="outline" onClick={openNew}><Icons.Plus className="size-3.5" /> Ekle</Button>}
    >
      {contacts.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">Kayıtlı kontak yok — &quot;Ekle&quot; ile ilk iletişim kişisini girin.</p>
      ) : (
        <div className="maven-scroll max-h-96 space-y-2 overflow-y-auto pr-1">
          {contacts.map((c, i) => (
            <div key={c.id} className="maven-stagger-item group flex items-start gap-2.5 rounded-lg border bg-muted/20 p-2.5 transition-colors hover:border-teal-500/30" style={{ animationDelay: `${i * 40}ms` }}>
              <button
                onClick={() => togglePrimary(c)}
                className="mt-0.5 shrink-0 rounded p-0.5 transition hover:scale-110"
                aria-label={c.isPrimary ? `${c.name} birincil işaretini kaldır` : `${c.name} kontak birincil yap`}
                title={c.isPrimary ? "Birincil kontak — kaldırmak için tıkla" : "Birincil kontak yap"}
              >
                <Icons.Star className={cn("size-4", c.isPrimary ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40 hover:text-amber-400")} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-medium leading-tight">{c.name}</p>
                  <Chip tone={c.role === "PRIMARY" ? "teal" : "neutral"}>{label(CONTACT_ROLE, c.role)}</Chip>
                  {c.department && <Chip tone="violet">{c.department}</Chip>}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {[c.title, c.email, c.phone].filter(Boolean).join(" · ") || "iletişim bilgisi yok"}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
                <button onClick={() => openEdit(c)} className="rounded p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={`${c.name} kontak düzenle`}>
                  <Icons.Pencil className="size-3.5" />
                </button>
                <button onClick={() => remove(c)} className="rounded p-1.5 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600" aria-label={`${c.name} kontak sil`}>
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
            <DialogTitle>{editing ? "İletişim Kişisini Düzenle" : "Yeni İletişim Kişisi"}</DialogTitle>
            <DialogDescription>Kurumun ödeme, teknik veya basın sorumlusunu ayrı ayrı kaydedin.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Ad Soyad *</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Unvan</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div>
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTACT_ROLE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Departman</Label><Input className="mt-1" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Örn. Finans" /></div>
            <div><Label>Telefon</Label><Input className="mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>E-posta</Label><Input type="email" className="mt-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="contact-primary" checked={form.isPrimary} onCheckedChange={(v) => setForm({ ...form, isPrimary: v === true })} />
              <Label htmlFor="contact-primary" className="cursor-pointer text-sm font-normal">Birincil kontak (kartvizitte görünür)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button onClick={save} disabled={busy || !form.name.trim()}>{busy ? "Kaydediliyor…" : "Kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

export function OrganizationsView() {
  const { tenant, bump, refreshKey, currentEditionId } = useApp();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<OrgRow | null>(null);
  const [detail, setDetail] = useState<Org360 | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<OrgRow | null>(null);
  const [form, setForm] = useState({ name: "", type: "COMPANY", city: "", website: "", generalEmail: "", address: "", description: "", locationNote: "" });

  const { data, error, reload, loading } = useApi<OrgRow[]>(() => listEntity<OrgRow>("organizations", { q }), [q, refreshKey]);

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
        toast({ title: "Kurum güncellendi", description: form.name });
      } else {
        await apiSend("/api/organizations", "POST", { ...payload, tenantId: tenant?.id });
        toast({ title: "Kurum oluşturuldu", description: form.name });
      }
      setCreateOpen(false); setForm(defaultOrgForm); setEditingOrg(null);
      reload(); bump();
      if (selected?.id === editingOrg?.id) void reloadDetail();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Kurum kaydedilemedi", variant: "destructive" });
    }
  };

  return (
    <div>
      <PageHeader title="Kurum/Kuruluşlar" desc="Sponsor bir TÜR değil, edisyona atanan ROL'dür (§4) — kalıcı profil burada, roller edisyon içinde">
        <Input placeholder="Kurum ara…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-56" />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={openCreate}><Icons.Building2 className="size-4" /> Kurum Ekle</Button></DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingOrg ? "Kurumu Düzenle" : "Yeni Kurum"}</DialogTitle>
              <DialogDescription>Kurumsal kimlik kartı alanları QR kartvizite gömülür.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              {/* R10-a: kurum logosu — benzersiz adla Medya Arşivi → Kurum/Kuruluş Logoları klasörüne */}
              {editingOrg ? (
                <div className="rounded-lg border bg-muted/20 p-3 sm:col-span-2">
                  <p className="mb-2 text-xs font-semibold">Kurum/Kuruluş Logosu</p>
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
                    folderLabel="Kurum/Kuruluş Logoları"
                    alt={`${editingOrg.name} logosu`}
                  />
                </div>
              ) : (
                <p className="text-[11px] leading-snug text-muted-foreground sm:col-span-2">Logo, kurum kaydedildikten sonra “Kurumu Düzenle” ekranından eklenir — Medya Arşivi → Kurum/Kuruluş Logoları klasörüne benzersiz adla kaydedilir.</p>
              )}
              <div className="sm:col-span-2"><Label>Ad</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>Tür</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ORG_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Şehir</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><Label>Web</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
              <div><Label>Genel E-posta</Label><Input type="email" placeholder="info@kurum.com" value={form.generalEmail} onChange={(e) => setForm({ ...form, generalEmail: e.target.value })} /></div>
              <div className="sm:col-span-2">
                <Label>Adres</Label>
                <Textarea className="mt-1" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Mahalle, cadde, no, ilçe / il" />
              </div>
              <div className="sm:col-span-2">
                <Label>Açıklama</Label>
                <Textarea className="mt-1" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Kurum hakkında kısa bilgi…" />
              </div>
              <div className="sm:col-span-2">
                <Label>Konum Notu</Label>
                <Input value={form.locationNote} onChange={(e) => setForm({ ...form, locationNote: e.target.value })} placeholder="Salon / Fuar / Otel konumu — QR'a gömülür" />
                <p className="mt-1 text-[11px] text-muted-foreground">Örn. &quot;Fuar Alanı · Stand A24&quot; — Konum QR bu notu kullanır.</p>
              </div>
            </div>
            <DialogFooter><Button onClick={saveOrg} disabled={!form.name}>{editingOrg ? "Kaydet" : "Oluştur"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {(data ?? []).map((o, i) => (
            <button key={o.id} onClick={() => open360(o)} onDoubleClick={() => openEdit(o)} title="Çift tıkla: kurumu düzenle" className="maven-stagger-item min-w-0 cursor-pointer rounded-xl border bg-card p-4 text-left transition hover:border-primary/40 hover:shadow-sm" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-center gap-2">
                {o.logoUrl ? (
                  <img src={o.logoUrl} alt={`${o.name} logosu`} className="size-12 shrink-0 rounded-lg border bg-background object-contain p-0.5" />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-500/10 text-violet-600"><Icons.Building2 className="size-4" /></span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{o.name}</p>
                  <p className="text-xs text-muted-foreground">{o.city ?? "—"} · {label(ORG_TYPES, o.type)}</p>
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
                <Chip tone="teal">{o._count?.eventAssignments ?? 0} etkinlik rolü</Chip>
                <Chip tone="violet">{o._count?.sponsorAgreements ?? 0} anlaşma</Chip>
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
            <SheetDescription>Kurum 360 — kimlik kartı, roller, sözleşmeler, haklar, standlar, finans ve kontaklar</SheetDescription>
          </SheetHeader>
          {!detail ? <div className="p-6"><Loading rows={5} /></div> : (
            <div className="space-y-4 px-4 pb-8">
              <SectionCard
                title="Kurumsal Kimlik Kartı"
                desc="Genel iletişim ve konum — QR kartvizitine gömülür (düşünce bulutu 5)"
                action={
                  <Button size="sm" variant="outline" onClick={() => openEdit(detail.organization)}>
                    <Icons.Pencil className="size-3.5" /> Düzenle
                  </Button>
                }
              >
                {/* R10-a: logo — kurum 360 kimlik kartında görüntülenir ve buradan yüklenir */}
                <div className="mb-2 rounded-lg border bg-muted/20 p-3">
                  <p className="mb-2 text-xs font-semibold">Kurum/Kuruluş Logosu</p>
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
                    folderLabel="Kurum/Kuruluş Logoları"
                    alt={`${detail.organization.name} logosu`}
                  />
                </div>
                <Row360Line label="Tür"><Chip tone="violet">{label(ORG_TYPES, detail.organization.type)}</Chip></Row360Line>
                <Row360Line label="Genel E-posta">{detail.organization.generalEmail ?? "—"}</Row360Line>
                <Row360Line label="Web">{detail.organization.website ?? "—"}</Row360Line>
                <Row360Line label="Adres">
                  {detail.organization.address
                    ? <span className="whitespace-pre-line text-xs leading-snug">{detail.organization.address}</span>
                    : "—"}
                </Row360Line>
                <Row360Line label="Konum Notu">
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

              <SectionCard title="Rol ve Görevler" desc="etkinlik bazında atamalar">
                {detail.eventAssignments.length === 0 ? <EmptyState title="Bu kuruma atanmış etkinlik rolü yok" /> : detail.eventAssignments.map((a) => (
                  <Row360Line key={a.id} label={a.edition.name}><Chip tone="teal">{a.role}</Chip></Row360Line>
                ))}
              </SectionCard>

              {detail.sponsorAgreements.map((ag) => (
                <SectionCard key={ag.id} title={ag.package?.name ?? ag.tier?.name ?? "Sponsorluk"} desc={`durum: ${ag.status} · ${fmtMoney(ag.amount, ag.currency)}`}>
                  <Row360Line label="Sözleşme"><Chip tone={ag.status === "ACTIVE" || ag.status === "CONTRACTED" ? "emerald" : "amber"}>{ag.status}</Chip></Row360Line>
                  {detail.entitlements.filter((e) => e.quantityGranted > 0).map((e) => (
                    <Row360Line key={e.id} label={e.label}>
                      <span className="tabular-nums text-sm font-medium">
                        {e.quantityConsumed} / {e.quantityGranted}
                        {e.quantityReserved > 0 && <span className="ml-1 text-xs text-amber-600">(+{e.quantityReserved} ayrılmış)</span>}
                        <span className="ml-1 text-xs text-emerald-600">kalan {Math.max(0, e.quantityGranted - e.quantityConsumed - e.quantityReserved)}</span>
                      </span>
                    </Row360Line>
                  ))}
                  <Row360Line label="Stand">
                    {detail.boothAllocations.length > 0
                      ? detail.boothAllocations.map((b) => <span key={b.id} className="ml-1"><Chip tone="violet">{b.boothUnit.code}</Chip> {b.boothUnit.sizeSqm} m²</span>)
                      : "—"}
                  </Row360Line>
                  <Separator className="my-2" />
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">Teslimler</p>
                  <div className="space-y-1">
                    {ag.deliverables.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                        <span>{d.name}</span>
                        <StatusBadge map={{ NOT_STARTED: "Başlamadı", WAITING_SPONSOR: "Sponsor bekliyor", SUBMITTED: "Gönderildi", UNDER_REVIEW: "İncelemede", APPROVED: "Onaylandı", REJECTED: "Reddedildi", COMPLETED: "Tamamlandı" }} value={d.status} />
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ))}

              {detail.orders.length > 0 && (
                <SectionCard title="Finansal" desc="siparişler">
                  {detail.orders.map((o) => (
                    <Row360Line key={o.id} label={o.orderNo}>
                      <span className="tabular-nums">{fmtMoney(o.totalAmount, o.currency)} <StatusBadge map={{ OPEN: "Açık", PARTIALLY_PAID: "Kısmi ödendi", PAID: "Ödendi", CANCELLED: "İptal" }} value={o.status} /></span>
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
