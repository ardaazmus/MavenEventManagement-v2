"use client";
// Yaka Kartı Tasarımcısı (düşünce bulutu 8-bis) — sol: tasarım listesi, orta: mm hassasiyetli kanvas,
// sağ: tasarım + eleman özellik paneli. Gerçek veriyle önizleme + print-sheet baskı sayfası.
import { useMemo, useRef, useState } from "react";
import { listEntity, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Chip, EmptyState, Loading, SectionCard, useApi } from "./bits";
import { BADGE_FIELD_KEYS, BADGE_FONTS, label } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Sabitler ────────────────────────────────────────────────────────────────

const PX_PER_MM = 3.2; // mm → px ölçeği (kanvas render)
const MAX_BG_BYTES = 600 * 1024; // arka plan dataURL sınırı

type ElementType = "TEXT" | "FIELD" | "QR" | "LOGO" | "SPONSOR_LOGO" | "PROGRAM" | "CONTACT";

interface DesignElement {
  type: ElementType;
  x: number; y: number; w: number; h: number; // mm
  fontSize?: number; weight?: number; color?: string; align?: string;
  fieldKey?: string; text?: string;
}

interface BadgeDesignData {
  id: string;
  name: string;
  widthMm: number; heightMm: number; bleedMm: number; cornerMm: number;
  sideCount: number; fontKey: string;
  frontBackgroundDataUrl: string | null; backBackgroundDataUrl: string | null;
  frontElements: string | null; backElements: string | null;
  qrSource: string; sponsorHierarchyKey: string | null;
  showProgramOnBack: boolean; backContactInfo: string | null;
  isActive: boolean; isDefault: boolean;
}

interface ParticipationRow {
  id: string;
  person: { firstName: string; lastName: string; company: string | null; title: string | null; country: string | null; city: string | null };
  registrations: { confirmationNo: string | null; category?: { name: string } | null }[];
  roleAssignments: { role: string }[];
  badgeInstances: { badgeNo: string; status: string; profile?: { name: string; accessAreas: string | string[] | null } | null }[];
}

// mm sayıları güvenli biçimde yuvarla (0.1mm hassasiyet)
const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

const ELEMENT_MENU: { type: ElementType; label: string; icon: React.ReactNode }[] = [
  { type: "TEXT", label: "Metin", icon: <Icons.Type className="size-3.5" /> },
  { type: "FIELD", label: "Alan", icon: <Icons.Braces className="size-3.5" /> },
  { type: "QR", label: "QR", icon: <Icons.QrCode className="size-3.5" /> },
  { type: "LOGO", label: "Logo", icon: <Icons.Sparkles className="size-3.5" /> },
  { type: "SPONSOR_LOGO", label: "Sponsor Logo", icon: <Icons.Handshake className="size-3.5" /> },
  { type: "PROGRAM", label: "Program", icon: <Icons.CalendarDays className="size-3.5" /> },
  { type: "CONTACT", label: "İletişim", icon: <Icons.Phone className="size-3.5" /> },
];

const WEIGHTS: Record<string, string> = { "400": "Normal", "500": "Medium", "600": "Semi Bold", "700": "Bold", "800": "Extra Bold" };

function parseElements(json: string | null): DesignElement[] {
  try {
    const arr = json ? (JSON.parse(json) as DesignElement[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export function BadgeDesigner() {
  const { currentEditionId, tenant, bump, refreshKey } = useApp();
  const { toast } = useToast();

  const [designId, setDesignId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BadgeDesignData | null>(null);
  const [side, setSide] = useState<"front" | "back">("front");
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewPid, setPreviewPid] = useState<string | null>(null);
  const [printSel, setPrintSel] = useState<Set<string>>(new Set());
  const [copies, setCopies] = useState(1);
  const [printing, setPrinting] = useState(false);
  const frontFileRef = useRef<HTMLInputElement>(null);
  const backFileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ idx: number; startX: number; startY: number; origX: number; origY: number } | null>(null);

  // tasarım listesi
  const { data: designs, error, reload, loading } = useApi<BadgeDesignData[]>(
    () => (currentEditionId ? listEntity<BadgeDesignData>("badge-designs", { editionId: currentEditionId }) : Promise.resolve([])),
    [currentEditionId, refreshKey],
  );

  // gerçek veriyle önizleme — katılımcılar (person + kayıt + yaka kartı + roller dahil)
  const { data: participations } = useApi<ParticipationRow[]>(
    () => (currentEditionId ? listEntity<ParticipationRow>("participations", { editionId: currentEditionId, limit: 30 }) : Promise.resolve([])),
    [currentEditionId, refreshKey],
  );

  const draftElements = useMemo(
    () => (draft ? parseElements(side === "front" ? draft.frontElements : draft.backElements) : []),
    [draft, side],
  );

  const selectDesign = (d: BadgeDesignData) => {
    setDesignId(d.id);
    setDraft({ ...d });
    setSelIdx(null);
    setSide("front");
    setPrintSel(new Set());
  };

  const newDesign = () => {
    setDesignId(null);
    setDraft({
      id: "", name: "Yeni Tasarım", widthMm: 105, heightMm: 148, bleedMm: 3, cornerMm: 4,
      sideCount: 1, fontKey: "inter", frontBackgroundDataUrl: null, backBackgroundDataUrl: null,
      frontElements: JSON.stringify([
        { type: "LOGO", x: 8, y: 6, w: 40, h: 10, fontSize: 4.5, weight: 800, color: "0f766e", align: "left" },
        { type: "FIELD", fieldKey: "badgeName", x: 8, y: 22, w: 60, h: 12, fontSize: 7, weight: 800, color: "0f172a", align: "left" },
        { type: "QR", x: 74, y: 116, w: 22, h: 22 },
      ] as DesignElement[]),
      backElements: null, qrSource: "CREDENTIAL", sponsorHierarchyKey: null,
      showProgramOnBack: false, backContactInfo: null, isActive: true, isDefault: false,
    });
    setSelIdx(null);
    setSide("front");
  };

  const patchDraft = (patch: Partial<BadgeDesignData>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const setElements = (els: DesignElement[]) =>
    patchDraft(side === "front" ? { frontElements: JSON.stringify(els) } : { backElements: JSON.stringify(els) });

  const updateElement = (idx: number, patch: Partial<DesignElement>) => {
    const els = draftElements.map((el, i) => (i === idx ? { ...el, ...patch } : el));
    setElements(els);
  };

  const addElement = (type: ElementType) => {
    const els = draftElements;
    const offset = els.length * 4;
    const base: DesignElement = { type, x: r1(8 + offset), y: r1(8 + offset), w: 40, h: 10, fontSize: 3.2, weight: 600, color: "0f172a", align: "left" };
    if (type === "QR") { base.w = 22; base.h = 22; base.x = r1(draft ? draft.widthMm - 30 : 70); base.y = r1(draft ? draft.heightMm - 30 : 116); delete base.fontSize; delete base.weight; delete base.align; }
    if (type === "SPONSOR_LOGO") { base.w = 40; base.h = 14; base.color = "475569"; }
    if (type === "PROGRAM") { base.w = 70; base.h = 40; base.fontSize = 2.4; }
    if (type === "CONTACT") { base.w = 60; base.h = 24; base.fontSize = 2.8; base.color = "475569"; }
    if (type === "TEXT") { base.text = "Metin"; }
    if (type === "FIELD") { base.fieldKey = "fullName"; }
    setElements([...els, base]);
    setSelIdx(els.length);
  };

  const removeElement = (idx: number) => {
    setElements(draftElements.filter((_, i) => i !== idx));
    setSelIdx(null);
  };

  // arka plan yükleme (≤600KB dataURL)
  const uploadBackground = (target: "front" | "back", file: File) => {
    if (file.size > MAX_BG_BYTES) {
      toast({ title: "Görsel çok büyük", description: `En fazla 600 KB yüklenebilir — seçilen dosya ${(file.size / 1024).toFixed(0)} KB.`, variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      patchDraft(target === "front" ? { frontBackgroundDataUrl: String(reader.result) } : { backBackgroundDataUrl: String(reader.result) });
      toast({ title: "Arka plan eklendi", description: "Tasarımcıdan gelen görsel en arka layer'a eklenir." });
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!draft || !currentEditionId) return;
    if (!draft.name.trim()) { toast({ title: "Tasarım adı zorunlu", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        editionId: currentEditionId, name: draft.name.trim(),
        widthMm: draft.widthMm, heightMm: draft.heightMm, bleedMm: draft.bleedMm, cornerMm: draft.cornerMm,
        sideCount: draft.sideCount, fontKey: draft.fontKey,
        frontBackgroundDataUrl: draft.frontBackgroundDataUrl, backBackgroundDataUrl: draft.backBackgroundDataUrl,
        frontElements: draft.frontElements, backElements: draft.backElements,
        qrSource: draft.qrSource, sponsorHierarchyKey: draft.sponsorHierarchyKey,
        showProgramOnBack: draft.showProgramOnBack, backContactInfo: draft.backContactInfo,
        isActive: draft.isActive, isDefault: draft.isDefault,
      };
      const saved = draft.id
        ? await apiSend<BadgeDesignData>(`/api/badge-designs/${draft.id}`, "PUT", payload)
        : await apiSend<BadgeDesignData>("/api/badge-designs", "POST", payload);
      setDraft({ ...draft, id: saved.id });
      setDesignId(saved.id);
      toast({ title: draft.id ? "Tasarım güncellendi" : "Tasarım oluşturuldu", description: `${saved.name} · ${saved.widthMm}×${saved.heightMm} mm · ${saved.sideCount === 2 ? "çift" : "tek"} taraflı` });
      reload(); bump();
    } catch (e) {
      toast({ title: "Kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setSaving(false); }
  };

  // baskı sayfası — text/html döner, blob URL yeni sekmede açılır (popup engellenirse iframe)
  const openPrintSheet = async (participationIds: string[], copyCount: number) => {
    if (!currentEditionId || !draft?.id) {
      toast({ title: "Önce tasarımı kaydedin", description: "Baskı sayfası kayıtlı tasarım üzerinden üretilir.", variant: "destructive" });
      return;
    }
    if (participationIds.length === 0) {
      toast({ title: "Katılımcı seçilmedi", description: "Baskı listesinden en az bir katılımcı seçin.", variant: "destructive" });
      return;
    }
    setPrinting(true);
    try {
      const res = await fetch("/api/badges/print-sheet", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionId: currentEditionId, designId: draft.id, participationIds, copies: copyCount }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Baskı sayfası üretilemedi (${res.status})`);
      }
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url);
      if (!win) {
        const frame = document.createElement("iframe");
        frame.style.position = "fixed";
        frame.style.right = "0"; frame.style.bottom = "0";
        frame.style.width = "0"; frame.style.height = "0"; frame.style.border = "0";
        frame.src = url;
        document.body.appendChild(frame);
        toast({ title: "Baskı sayfası hazır", description: "Açılır pencere engellendi — sayfa yerleşik çerçevede açıldı." });
      }
    } catch (e) {
      toast({ title: "Baskı başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setPrinting(false); }
  };

  // alan bağlama — gerçek katılımcı verisiyle değer üretimi (print-sheet ile aynı eşleme)
  const fieldVal = (key: string, p?: ParticipationRow): string => {
    if (!p) {
      const found = BADGE_FIELD_KEYS.find((f) => f.key === key);
      return found ? `[${found.label}]` : "";
    }
    const person = p.person;
    const reg = p.registrations[0];
    const badge = p.badgeInstances[0];
    switch (key) {
      case "fullName": return `${person.firstName} ${person.lastName}`;
      case "firstName": return person.firstName;
      case "lastName": return person.lastName;
      case "badgeName": return `${person.firstName} ${person.lastName}`;
      case "title": return person.title ?? "";
      case "company": return person.company ?? "";
      case "country": return person.country ?? "";
      case "city": return person.city ?? "";
      case "role": return p.roleAssignments.map((r) => r.role).join(", ");
      case "profileName": return badge?.profile?.name ?? "";
      case "accessAreas": return badge?.profile?.accessAreas
        ? (Array.isArray(badge.profile.accessAreas) ? badge.profile.accessAreas.join(", ") : badge.profile.accessAreas)
        : "";
      case "badgeNo": return badge?.badgeNo ?? "";
      case "confirmationNo": return reg?.confirmationNo ?? "";
      case "categoryName": return reg?.category?.name ?? "";
      case "qr": return "";
      default: return "";
    }
  };

  const previewPerson = participations?.find((p) => p.id === previewPid) ?? participations?.[0];

  // ─── Kanvas eleman render ──────────────────────────────────────────────────

  const renderElement = (el: DesignElement, idx: number) => {
    const selected = selIdx === idx && !previewMode;
    const wPx = el.w * PX_PER_MM;
    const hPx = el.h * PX_PER_MM;
    const color = `#${(el.color ?? "111827").replace("#", "")}`;
    const fontSize = (el.fontSize ?? 3.2) * PX_PER_MM;
    const style: React.CSSProperties = {
      position: "absolute", left: el.x * PX_PER_MM, top: el.y * PX_PER_MM, width: wPx, height: hPx,
      fontSize, fontWeight: (el.weight ?? 400) as React.CSSProperties["fontWeight"], color,
      textAlign: (el.align ?? "left") as React.CSSProperties["textAlign"], overflow: "hidden",
    };
    let content: React.ReactNode = null;
    switch (el.type) {
      case "QR":
        content = (
          <span className={cn("flex size-full items-center justify-center rounded-[2px] border border-dashed", previewMode ? "border-teal-600/50 bg-teal-50/60" : "border-teal-500/70 bg-teal-50")}>
            <Icons.QrCode className="text-teal-700" style={{ width: hPx * 0.62, height: hPx * 0.62 }} />
          </span>
        );
        break;
      case "LOGO":
        content = <span className="flex h-full items-center justify-center truncate tracking-wide" style={{ justifyContent: el.align === "left" ? "flex-start" : el.align === "right" ? "flex-end" : "center" }}>{tenant?.name ?? "Maven"}</span>;
        break;
      case "SPONSOR_LOGO":
        content = <span className="flex h-full items-center justify-center truncate rounded border border-dashed border-slate-400/60 bg-white/50 px-1 text-center">{draft?.sponsorHierarchyKey || "Sponsor Logosu"}</span>;
        break;
      case "PROGRAM":
        content = (
          <span className="flex h-full flex-col gap-0.5 overflow-hidden">
            <span className="truncate font-semibold">Açılış · 09:00</span>
            <span className="truncate">Ana Oturum · 10:15</span>
            <span className="truncate">Panel · 13:30</span>
            <span className="truncate text-muted-foreground">Kapanış · 17:00</span>
          </span>
        );
        break;
      case "CONTACT":
        content = <span className="whitespace-pre-line">{draft?.backContactInfo || "İletişim bilgisi\nsatır satır"}</span>;
        break;
      case "FIELD": {
        const val = previewMode ? fieldVal(el.fieldKey ?? "", previewPerson) : (previewPerson ? fieldVal(el.fieldKey ?? "", undefined) : "");
        content = <span className={cn("flex h-full items-center overflow-hidden leading-tight", el.type === "FIELD" && "justify-start")} style={{ alignItems: "center", wordBreak: "break-word" }}>{previewMode ? val || "—" : val}</span>;
        break;
      }
      case "TEXT":
        content = <span style={{ wordBreak: "break-word" }}>{el.text || "Metin"}</span>;
        break;
    }
    return (
      <div
        key={`${side}-${idx}`}
        style={style}
        onPointerDown={previewMode ? undefined : (e) => {
          e.stopPropagation();
          setSelIdx(idx);
          dragRef.current = { idx, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={previewMode ? undefined : (e) => {
          const d = dragRef.current;
          if (!d || d.idx !== idx || !draft) return;
          const dx = (e.clientX - d.startX) / PX_PER_MM;
          const dy = (e.clientY - d.startY) / PX_PER_MM;
          updateElement(idx, { x: r1(clamp(d.origX + dx, 0, draft.widthMm)), y: r1(clamp(d.origY + dy, 0, draft.heightMm)) });
        }}
        onPointerUp={previewMode ? undefined : () => { dragRef.current = null; }}
        className={cn(
          "group",
          !previewMode && "cursor-move touch-none select-none",
          selected && "ring-2 ring-teal-500 ring-offset-1 ring-offset-white",
          el.type === "FIELD" && !previewMode && "bg-teal-500/5",
          el.type === "TEXT" && !previewMode && "bg-slate-500/5",
        )}
        title={previewMode ? undefined : `${el.type} — sürükleyerek taşı`}
      >
        {content}
      </div>
    );
  };

  // ─── Alt paneller ──────────────────────────────────────────────────────────

  const numField = (labelText: string, value: number, onChange: (n: number) => void, step = 0.5, min = 0, max = 400) => (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{labelText}</Label>
      <Input type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(r1(Number(e.target.value) || 0))}
        className="h-8 text-xs tabular-nums" />
    </div>
  );

  if (!currentEditionId) return <EmptyState title="Edisyon seçin" desc="Tasarımcı edisyon bazlı çalışır." />;

  return (
    <div className="space-y-4">
      {/* üst çubuk */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
        <Icons.Palette className="size-4 text-teal-600" />
        <span className="text-sm font-semibold">Yaka Kartı Tasarımcısı</span>
        {draft && <Chip tone="teal">{draft.widthMm}×{draft.heightMm} mm · {draft.sideCount === 2 ? "çift" : "tek"} taraflı</Chip>}
        {draft?.isDefault && <Chip tone="amber">varsayılan tasarım</Chip>}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={newDesign}><Icons.Plus className="size-3.5" /> Yeni Tasarım</Button>
          <Button
            variant={previewMode ? "default" : "outline"}
            size="sm"
            onClick={() => { setPreviewMode((v) => !v); setSelIdx(null); }}
            disabled={!draft}
            title="Alanları gerçek katılımcı verisiyle göster"
          >
            {previewMode ? <Icons.Pencil className="size-3.5" /> : <Icons.Eye className="size-3.5" />} {previewMode ? "Tasarıma Dön" : "Gerçek Veriyle Önizle"}
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !draft}>
            {saving ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Save className="size-3.5" />} Kaydet
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* SOL — tasarım listesi */}
        <div className="animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none min-w-0 lg:col-span-3">
          <SectionCard title="Tasarımlar" desc="edisyon bazlı kayıtlı yaka kartı şablonları">
            {loading ? <Loading rows={4} /> : error ? (
              <p className="text-xs text-rose-600">{error}</p>
            ) : (designs ?? []).length === 0 ? (
              <EmptyState title="Tasarım yok" desc="Yeni Tasarım ile başlayın." />
            ) : (
              <div className="maven-scroll max-h-96 space-y-1.5 overflow-y-auto">
                {(designs ?? []).map((d, i) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => selectDesign(d)}
                    style={{ animationDelay: `${i * 40}ms` }}
                    className={cn(
                      "w-full animate-in fade-in slide-in-from-left-1 rounded-lg border p-2.5 text-left transition hover:border-teal-400 hover:bg-teal-50/40 motion-reduce:animate-none",
                      designId === d.id ? "border-teal-500 bg-teal-50/70 ring-1 ring-teal-400" : "bg-card",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icons.IdCard className="size-3.5 shrink-0 text-teal-600" />
                      <span className="truncate text-xs font-semibold">{d.name}</span>
                      {d.isDefault && <Icons.Star className="ml-auto size-3 shrink-0 fill-amber-400 text-amber-500" />}
                    </div>
                    <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                      {d.widthMm}×{d.heightMm} mm · {d.sideCount === 2 ? "2 yüz" : "1 yüz"} · {parseElements(d.frontElements).length} ön eleman
                    </p>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          {/* baskı listesi */}
          <SectionCard title="Baskı Kuyruğu" desc="katılımcı seç (en fazla 20) · kopya sayısı belirle" className="mt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Kopya:</span>
              <Select value={String(copies)} onValueChange={(v) => setCopies(Number(v))}>
                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
              <Chip tone="teal">{printSel.size} seçili</Chip>
              <Button
                size="sm"
                className="ml-auto"
                disabled={printing || !draft?.id || printSel.size === 0}
                onClick={() => openPrintSheet([...printSel].slice(0, 20), copies)}
                title={draft?.id ? "Baskı sayfasını yeni sekmede açar" : "Önce tasarımı kaydedin"}
              >
                {printing ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Printer className="size-3.5" />} Baskı sayfası aç
              </Button>
            </div>
            <div className="maven-scroll mt-3 max-h-96 space-y-1 overflow-y-auto">
              {(participations ?? []).length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">Katılımcı bulunamadı.</p>
              ) : (
                (participations ?? []).map((p) => {
                  const badge = p.badgeInstances[0];
                  const checked = printSel.has(p.id);
                  return (
                    <label
                      key={p.id}
                      className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition hover:bg-teal-50/40", checked ? "border-teal-400 bg-teal-50/60" : "bg-card")}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={!checked && printSel.size >= 20}
                        onCheckedChange={() =>
                          setPrintSel((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.id)) next.delete(p.id);
                            else if (next.size < 20) next.add(p.id);
                            return next;
                          })
                        }
                        aria-label={`${p.person.firstName} ${p.person.lastName} seç`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.person.firstName} {p.person.lastName}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {p.person.company ?? "—"}{badge ? ` · #${badge.badgeNo.slice(-6)}` : ""}
                        </span>
                      </span>
                      {badge && <Chip tone={badge.status === "READY" ? "teal" : "neutral"}>{badge.status === "READY" ? "hazır" : badge.status.toLocaleLowerCase("tr-TR")}</Chip>}
                    </label>
                  );
                })
              )}
            </div>
          </SectionCard>
        </div>

        {/* ORTA — kanvas */}
        <div className="animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none min-w-0 lg:col-span-5" style={{ animationDelay: "60ms" }}>
          <SectionCard
            title="Kanvas"
            desc={draft ? `${draft.widthMm + draft.bleedMm * 2}×${draft.heightMm + draft.bleedMm * 2} mm (baskı payı dahil kesim) · ızgara: 5 mm` : "tasarım seçin"}
            action={
              draft?.sideCount === 2 ? (
                <div className="flex rounded-full border bg-muted/40 p-0.5">
                  {(["front", "back"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setSide(s); setSelIdx(null); }}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition",
                        side === s ? "bg-teal-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s === "front" ? "Ön" : "Arka"}
                    </button>
                  ))}
                </div>
              ) : <Chip>ön yüz</Chip>
            }
          >
            {!draft ? (
              <EmptyState title="Tasarım seçilmedi" desc="Soldaki listeden bir tasarım seçin veya yeni tasarım oluşturun." />
            ) : (
              <div className="maven-scroll overflow-x-auto">
                {/* üst cetvel (mm) */}
                <div className="flex" style={{ marginLeft: 18 }}>
                  {Array.from({ length: Math.floor(draft.widthMm / 10) + 1 }).map((_, i) => (
                    <span key={i} className="shrink-0 border-l border-slate-300 text-[9px] tabular-nums text-muted-foreground" style={{ width: 10 * PX_PER_MM, paddingLeft: 2 }}>
                      {i * 10}
                    </span>
                  ))}
                </div>
                <div className="flex">
                  {/* sol cetvel (mm) */}
                  <div className="flex w-[18px] shrink-0 flex-col pt-0">
                    {Array.from({ length: Math.floor(draft.heightMm / 10) + 1 }).map((_, i) => (
                      <span key={i} className="shrink-0 border-t border-slate-300 text-[9px] leading-none tabular-nums text-muted-foreground" style={{ height: 10 * PX_PER_MM }}>{i * 10}</span>
                    ))}
                  </div>
                  {/* kart yüzeyi */}
                  <div
                    className="relative shrink-0 shadow-lg"
                    style={{
                      width: draft.widthMm * PX_PER_MM,
                      height: draft.heightMm * PX_PER_MM,
                      borderRadius: draft.cornerMm * PX_PER_MM * 0.5,
                      fontFamily: BADGE_FONTS[draft.fontKey]?.css ?? "Inter, sans-serif",
                      backgroundImage: draft[side === "front" ? "frontBackgroundDataUrl" : "backBackgroundDataUrl"]
                        ? `url('${draft[side === "front" ? "frontBackgroundDataUrl" : "backBackgroundDataUrl"]}')`
                        : side === "front"
                          ? "linear-gradient(160deg,#f8fafc 0%,#eef7f6 60%,#d9efec 100%)"
                          : "linear-gradient(160deg,#ffffff 0%,#f8fafc 100%)",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      // mm ızgara — 5mm ince, 10mm belirgin
                      backgroundRepeat: draft[side === "front" ? "frontBackgroundDataUrl" : "backBackgroundDataUrl"] ? "no-repeat" : "repeat, repeat",
                      backgroundBlendMode: draft[side === "front" ? "frontBackgroundDataUrl" : "backBackgroundDataUrl"] ? undefined : "normal",
                      boxShadow: "0 1px 3px rgba(0,0,0,.18)",
                    }}
                    onPointerDown={() => setSelIdx(null)}
                  >
                    {!draft[side === "front" ? "frontBackgroundDataUrl" : "backBackgroundDataUrl"] && (
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          backgroundImage:
                            `repeating-linear-gradient(to right, rgba(13,148,136,.10) 0 1px, transparent 1px ${5 * PX_PER_MM}px),` +
                            `repeating-linear-gradient(to bottom, rgba(13,148,136,.10) 0 1px, transparent 1px ${5 * PX_PER_MM}px),` +
                            `repeating-linear-gradient(to right, rgba(13,148,136,.18) 0 1px, transparent 1px ${10 * PX_PER_MM}px),` +
                            `repeating-linear-gradient(to bottom, rgba(13,148,136,.18) 0 1px, transparent 1px ${10 * PX_PER_MM}px)`,
                        }}
                      />
                    )}
                    {/* baskı payı çerçevesi */}
                    <div className="pointer-events-none absolute inset-0" style={{ border: `1.5px dashed rgba(217,119,6,.45)`, borderRadius: draft.cornerMm * PX_PER_MM * 0.5 }} title={`baskı payı ${draft.bleedMm} mm`} />
                    {draftElements.map((el, i) => renderElement(el, i))}
                    {previewMode && (
                      <span className="absolute bottom-1 right-2 rounded-full bg-teal-600/85 px-2 py-0.5 text-[9px] font-medium text-white">
                        {previewPerson ? `${previewPerson.person.firstName} ${previewPerson.person.lastName}` : "örnek veri"}
                      </span>
                    )}
                  </div>
                </div>
                {previewMode && (
                  <div className="mt-3 flex items-center gap-2">
                    <Label className="text-[11px] text-muted-foreground">Önizleme kişisi:</Label>
                    <Select value={previewPerson?.id ?? ""} onValueChange={setPreviewPid}>
                      <SelectTrigger className="h-7 w-56 text-xs"><SelectValue placeholder="Katılımcı seçin" /></SelectTrigger>
                      <SelectContent>
                        {(participations ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.person.firstName} {p.person.lastName} — {p.person.company ?? "—"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </div>

        {/* SAĞ — özellik paneli */}
        <div className="animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none min-w-0 lg:col-span-4" style={{ animationDelay: "120ms" }}>
          {/* tasarım özellikleri */}
          <SectionCard title="Tasarım Özellikleri" desc="ölçüler mm cinsindendir">
            {!draft ? <p className="text-xs text-muted-foreground">Tasarım seçin.</p> : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Tasarım adı</Label>
                  <Input value={draft.name} onChange={(e) => patchDraft({ name: e.target.value })} className="h-8 text-xs" placeholder="örn. Standart Konferans — Dikey" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {numField("Genişlik (mm)", draft.widthMm, (n) => patchDraft({ widthMm: clamp(n, 40, 200) }), 1, 40, 200)}
                  {numField("Yükseklik (mm)", draft.heightMm, (n) => patchDraft({ heightMm: clamp(n, 40, 300) }), 1, 40, 300)}
                  {numField("Baskı payı (mm)", draft.bleedMm, (n) => patchDraft({ bleedMm: clamp(n, 0, 10) }), 0.5, 0, 10)}
                  {numField("Köşe yarıçapı (mm)", draft.cornerMm, (n) => patchDraft({ cornerMm: clamp(n, 0, 20) }), 0.5, 0, 20)}
                </div>
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">{draft.sideCount === 2 ? "Çift taraflı" : "Tek taraflı"}</p>
                    <p className="text-[11px] text-muted-foreground">arka yüz: program + sponsor + iletişim</p>
                  </div>
                  <Switch
                    checked={draft.sideCount === 2}
                    onCheckedChange={(v) => { patchDraft({ sideCount: v ? 2 : 1 }); if (!v && side === "back") { setSide("front"); setSelIdx(null); } }}
                    aria-label="Çift taraflı tasarım"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Yazı tipi</Label>
                    <Select value={draft.fontKey} onValueChange={(v) => patchDraft({ fontKey: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(BADGE_FONTS).map(([k, f]) => <SelectItem key={k} value={k}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">QR kaynağı</Label>
                    <Select value={draft.qrSource} onValueChange={(v) => patchDraft({ qrSource: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CREDENTIAL">Kimlik Kodu (Credential)</SelectItem>
                        <SelectItem value="VCARD">vCard (Kişi Kartı)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Sponsor hiyerarşi anahtarı</Label>
                  <Input value={draft.sponsorHierarchyKey ?? ""} onChange={(e) => patchDraft({ sponsorHierarchyKey: e.target.value })} className="h-8 text-xs" placeholder="Gold Sponsor" />
                  <p className="text-[10px] text-muted-foreground">Arka yüzde bu düzeydeki sponsor logosu gösterilir (örn. "Gold Sponsor").</p>
                </div>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-xs font-medium">Arkada program göster</span>
                  <Switch checked={draft.showProgramOnBack} onCheckedChange={(v) => patchDraft({ showProgramOnBack: v })} aria-label="Arkada program göster" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Arka yüz iletişim bilgisi</Label>
                  <Textarea value={draft.backContactInfo ?? ""} onChange={(e) => patchDraft({ backContactInfo: e.target.value })} rows={3} className="text-xs" placeholder={"Organizasyon\ninfo@…\n+90 …"} />
                </div>

                {/* arka plan yükleme */}
                <div className="rounded-lg border border-dashed bg-muted/20 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium"><Icons.ImageUp className="size-3.5 text-teal-600" /> Arka plan görseli ({side === "front" ? "ön" : "arka"} yüz)</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Tasarımcıdan gelen görsel en arka layer&apos;a eklenir · en fazla 600 KB</p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      ref={side === "front" ? frontFileRef : backFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBackground(side, f); e.target.value = ""; }}
                    />
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => (side === "front" ? frontFileRef : backFileRef).current?.click()}>
                      <Icons.Upload className="size-3" /> Görsel seç
                    </Button>
                    {draft[side === "front" ? "frontBackgroundDataUrl" : "backBackgroundDataUrl"] && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-600 hover:text-rose-700" onClick={() => patchDraft(side === "front" ? { frontBackgroundDataUrl: null } : { backBackgroundDataUrl: null })}>
                        <Icons.Trash2 className="size-3" /> Kaldır
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          {/* eleman özellikleri */}
          <SectionCard
            title="Elemanlar"
            desc={previewMode ? "önizleme modunda düzenleme kapalı" : selIdx !== null ? "seçili eleman özellikleri — sürükleyerek taşı" : "elemana tıklayarak seçin"}
            className="mt-4"
          >
            <div className="flex flex-wrap gap-1.5">
              {ELEMENT_MENU.map((m) => (
                <Button key={m.type} variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={!draft || previewMode} onClick={() => addElement(m.type)}>
                  {m.icon} {m.label}
                </Button>
              ))}
            </div>
            {selIdx !== null && draftElements[selIdx] && (() => {
              const el = draftElements[selIdx];
              const hex = `#${(el.color ?? "0f172a").replace("#", "")}`;
              return (
                <div className="mt-3 space-y-2.5 rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center justify-between">
                    <Chip tone="teal">{label({ TEXT: "Metin", FIELD: "Alan", QR: "QR", LOGO: "Logo", SPONSOR_LOGO: "Sponsor Logo", PROGRAM: "Program", CONTACT: "İletişim" } as Record<string, string>, el.type)}</Chip>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-rose-600 hover:text-rose-700" onClick={() => removeElement(selIdx)}>
                      <Icons.Trash2 className="size-3" /> Elemanı sil
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {numField("X (mm)", el.x, (n) => updateElement(selIdx, { x: n }))}
                    {numField("Y (mm)", el.y, (n) => updateElement(selIdx, { y: n }))}
                    {numField("G (mm)", el.w, (n) => updateElement(selIdx, { w: Math.max(n, 1) }))}
                    {numField("Y (mm) h", el.h, (n) => updateElement(selIdx, { h: Math.max(n, 1) }))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {numField("Yazı boyu (mm)", el.fontSize ?? 3.2, (n) => updateElement(selIdx, { fontSize: clamp(n, 0.5, 20) }), 0.2, 0.5, 20)}
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Kalınlık</Label>
                      <Select value={String(el.weight ?? 400)} onValueChange={(v) => updateElement(selIdx, { weight: Number(v) })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(WEIGHTS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Renk</Label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={hex} onChange={(e) => updateElement(selIdx, { color: e.target.value.replace("#", "") })} className="h-8 w-10 cursor-pointer rounded border" aria-label="Eleman rengi" />
                        <Input value={hex} onChange={(e) => updateElement(selIdx, { color: e.target.value.replace("#", "") })} className="h-8 font-mono text-[11px]" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Hizalama</Label>
                      <Select value={el.align ?? "left"} onValueChange={(v) => updateElement(selIdx, { align: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Sola</SelectItem>
                          <SelectItem value="center">Ortaya</SelectItem>
                          <SelectItem value="right">Sağa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {el.type === "FIELD" && (
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Alan bağlama</Label>
                      <Select value={el.fieldKey ?? "fullName"} onValueChange={(v) => updateElement(selIdx, { fieldKey: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BADGE_FIELD_KEYS.filter((f) => f.key !== "qr").map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {el.type === "TEXT" && (
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Metin içeriği</Label>
                      <Textarea value={el.text ?? ""} onChange={(e) => updateElement(selIdx, { text: e.target.value })} rows={2} className="text-xs" />
                    </div>
                  )}
                </div>
              );
            })()}
            {selIdx === null && !previewMode && draft && (
              <div className="maven-scroll mt-3 max-h-40 space-y-1 overflow-y-auto">
                {draftElements.length === 0 ? (
                  <p className="py-2 text-center text-[11px] text-muted-foreground">Bu yüzde eleman yok — yukarıdaki düğmelerle ekleyin.</p>
                ) : draftElements.map((el, i) => (
                  <button key={i} type="button" onClick={() => setSelIdx(i)}
                    className={cn("flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition hover:border-teal-400 hover:bg-teal-50/40", selIdx === i && "border-teal-500 bg-teal-50/60")}>
                    <Icons.GripVertical className="size-3 text-muted-foreground" />
                    <span className="font-medium">{ELEMENT_MENU.find((m) => m.type === el.type)?.label ?? el.type}</span>
                    {el.fieldKey && <span className="text-muted-foreground">· {BADGE_FIELD_KEYS.find((f) => f.key === el.fieldKey)?.label ?? el.fieldKey}</span>}
                    {el.text && <span className="truncate text-muted-foreground">· {el.text}</span>}
                    <span className="ml-auto tabular-nums text-muted-foreground">{el.x},{el.y} mm</span>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
