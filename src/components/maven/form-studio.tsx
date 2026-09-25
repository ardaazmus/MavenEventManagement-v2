"use client";
// F-EXP — Form Stüdyosu genişletme bileşenleri.
//  FieldPalette          → sol palet: gruplu bileşen kataloğu (tıkla-ekle)
//  FieldPropertiesPanel  → sağ panel: seçili alanın tüm özellikleri + MANTIK KAPILARI editörü
//  SharePanel            → paylaşım: kısa bağlantı, iframe gömme kodu, QR, captcha/sonuç anahtarları
// Bu bileşenler SAF UI'dır — yazma işini form-center (PUT/DELETE) yürütür.
import { useEffect, useMemo, useState } from "react";
import { FORM_FIELD_TYPES } from "@/lib/constants";
import { tLabel, t } from "@/lib/i18n";
import { LOGIC_OPS, parseLogicRules, type LogicRule } from "@/lib/form-logic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Type, AlignLeft, Hash, Mail, Phone, Link2, Calendar, Clock, Globe, CircleDot,
  ListChecks, CheckSquare, ToggleLeft, Vote, Star, Gauge, HelpCircle, Rows3,
  PenTool, FileText, Heading2, Upload, Plus, Trash2, Copy, QrCode, ExternalLink,
  ShieldCheck, BarChart3, Loader2, Share2, MessageCircle, Send, Twitter, Linkedin,
} from "lucide-react";

// ─── Palet ───────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  TEXT: Type, LONGTEXT: AlignLeft, NUMBER: Hash, EMAIL: Mail, PHONE: Phone, URL: Link2,
  DATE: Calendar, TIME: Clock, COUNTRY: Globe,
  SINGLE_CHOICE: CircleDot, MULTI_CHOICE: ListChecks, CHECKBOX: CheckSquare, YESNO: ToggleLeft,
  VOTE: Vote, RATING: Star, NPS: Gauge, QA_QUIZ: HelpCircle, RANKING: ListChecks,
  MATRIX: Rows3, SIGNATURE: PenTool, TERMS: FileText, FILE: Upload, SECTION: Heading2,
};

export const FIELD_GROUPS: { title: string; types: string[] }[] = [
  { title: t("forms.paletteBasic"), types: ["TEXT", "LONGTEXT", "NUMBER", "EMAIL", "PHONE", "URL", "DATE", "TIME", "COUNTRY"] },
  { title: t("forms.paletteChoice"), types: ["SINGLE_CHOICE", "MULTI_CHOICE", "CHECKBOX", "YESNO", "TERMS"] },
  { title: t("forms.paletteVote"), types: ["VOTE", "RATING", "NPS", "QA_QUIZ", "RANKING"] },
  { title: t("forms.paletteAdvanced"), types: ["MATRIX", "SIGNATURE", "FILE"] },
  { title: t("forms.paletteLayout"), types: ["SECTION"] },
];

export const PALETTE_MIME = "application/x-maven-field-type"; // STUDIO-DND: palet → tuval sürükleme imzası

export function FieldPalette({ onPick }: { onPick: (type: string) => void }) {
  return (
    <div className="grid gap-2.5">
      {FIELD_GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{g.title}</p>
          <div className="grid gap-1">
            {g.types.map((tp) => {
              const Icon = TYPE_ICONS[tp] ?? Type;
              return (
                <button
                  key={tp}
                  type="button"
                  draggable
                  aria-label={tLabel(FORM_FIELD_TYPES, tp)}
                  onClick={() => onPick(tp)}
                  onDragStart={(e) => {
                    // STUDIO-DND: tıkla-ekle'nin yanı sıra tutup tuvale sürüklenebilir
                    e.dataTransfer.setData(PALETTE_MIME, tp);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="flex cursor-grab items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-left text-xs transition hover:border-teal-400 hover:bg-teal-50/50 active:cursor-grabbing"
                >
                  <Icon className="size-3.5 shrink-0 text-teal-700" />
                  <span className="min-w-0 truncate font-medium">{tLabel(FORM_FIELD_TYPES, tp)}</span>
                  <Plus className="ml-auto size-3 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[10px] leading-snug text-muted-foreground">{t("forms.paletteDragHint")}</p>
    </div>
  );
}

// ─── Özellik paneli (seçili alan editörü + mantık kapıları) ──────────────────

export interface FieldDraft {
  label: string; type: string; placeholder: string; helpText: string; options: string; columns: string;
  required: string; conditionField: string; conditionValue: string; sensitivity: string;
  mobileInteractive: boolean; correctAnswer: string; points: string;
  logicRules: LogicRule[]; logicMode: string; logicAction: string;
  gotoStep: string; // FORM-EXP3: logicAction=GOTO hedef adımı (2..20; "" = yok)
  width: string; // STUDIO-DND: % genişlik (25..100)
  step: string; // FORM-EXP2: adım/sayfa numarası (1..20)
}

// STUDIO-DND: adlandırılmış genişlik ön ayarları (özellik paneli) — tuvalde serbest
// sürükleme 5'lik adımlarla 25..100 arası üretir; panel adları en yakın değeri gösterir.
export const WIDTH_PRESETS: { value: string; labelKey: string }[] = [
  { value: "100", labelKey: "forms.widthFull" },
  { value: "75", labelKey: "forms.widthWide" },
  { value: "66", labelKey: "forms.widthTwoThird" },
  { value: "50", labelKey: "forms.widthHalf" },
  { value: "33", labelKey: "forms.widthThird" },
  { value: "25", labelKey: "forms.widthQuarter" },
];

export function draftFromField(f: {
  label: string; type: string; placeholder?: string | null; helpText?: string | null;
  options?: string | null; columns?: string | null; required: string;
  conditionField?: string | null; conditionValue?: string | null; sensitivity: string;
  mobileInteractive: boolean; correctAnswer?: string | null; points?: number | null;
  logicRules?: string | null; logicMode?: string | null; logicAction?: string | null;
  gotoStep?: number | null; // FORM-EXP3
  width?: number | null; step?: number | null;
}): FieldDraft {
  return {
    label: f.label, type: f.type, placeholder: f.placeholder ?? "", helpText: f.helpText ?? "",
    options: f.options ?? "", columns: f.columns ?? "", required: f.required,
    conditionField: f.conditionField ?? "", conditionValue: f.conditionValue ?? "",
    sensitivity: f.sensitivity, mobileInteractive: f.mobileInteractive,
    correctAnswer: f.correctAnswer ?? "", points: f.points != null ? String(f.points) : "1",
    logicRules: parseLogicRules(f.logicRules), logicMode: f.logicMode ?? "ANY", logicAction: f.logicAction ?? "SHOW",
    gotoStep: f.gotoStep != null ? String(f.gotoStep) : "",
    width: String(f.width ?? 100),
    step: String(Math.max(1, f.step ?? 1)),
  };
}

const OP_LABELS: Record<string, string> = {
  EQ: "eşitse", NEQ: "farklıysa", CONTAINS: "içeriyorsa",
  GT: "büyükse", LT: "küçükse", EMPTY: "boşsa", NOT_EMPTY: "doluysa",
};

export function FieldPropertiesPanel({
  field, allFields, busy, enableSteps = false, onSave, onCancel,
}: {
  field: { id: string } & Parameters<typeof draftFromField>[0];
  allFields: { id: string; label: string; type: string }[];
  busy: string | null;
  enableSteps?: boolean; // FORM-EXP2: form adım-adım modundaysa alanın sayfası seçilebilir
  onSave: (draft: FieldDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<FieldDraft>(() => draftFromField(field));
  const [origType, setOrigType] = useState(field.type);
  // alan seçimi değişince taslağı sunucu değerleriyle tazele
  // (render-sırasında-uyarlama deseni — effect'siz, react-hooks uyumlu)
  const [prevFieldId, setPrevFieldId] = useState(field.id);
  if (prevFieldId !== field.id) {
    setPrevFieldId(field.id);
    setDraft(draftFromField(field));
    setOrigType(field.type);
  }

  const opts = draft.options.split("\n").map((s) => s.trim()).filter(Boolean);
  const needsOptions = ["SINGLE_CHOICE", "MULTI_CHOICE", "VOTE", "RANKING", "MATRIX", "QA_QUIZ"].includes(draft.type);
  const upd = (patch: Partial<FieldDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const updRule = (i: number, patch: Partial<LogicRule>) =>
    upd({ logicRules: draft.logicRules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const otherFields = allFields.filter((f) => f.id !== field.id);

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <Label className="text-xs">{t("forms.propsLabel")}</Label>
        <Input value={draft.label} onChange={(e) => upd({ label: e.target.value })} />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">{t("forms.propsType")}</Label>
        <Select value={draft.type} onValueChange={(v) => upd({ type: v, mobileInteractive: ["RATING", "NPS", "QA_QUIZ"].includes(v) ? true : draft.mobileInteractive })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(FORM_FIELD_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        {draft.type !== origType && (
          <p className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">{t("forms.typeChangeWarn")}</p>
        )}
      </div>
      {draft.type !== "SECTION" && (
        <div className="grid gap-1">
          <Label className="text-xs">{t("forms.propsPlaceholder")}</Label>
          <Input value={draft.placeholder} onChange={(e) => upd({ placeholder: e.target.value })} />
        </div>
      )}
      <div className="grid gap-1">
        <Label className="text-xs">{t("forms.propsHelp")}</Label>
        <Input value={draft.helpText} onChange={(e) => upd({ helpText: e.target.value })} />
      </div>
      {needsOptions && (
        <div className="grid gap-1">
          <Label className="text-xs">{draft.type === "MATRIX" ? t("forms.propsRows") : t("forms.propsOptions")}</Label>
          <Textarea rows={3} value={draft.options} placeholder={t("forms.optionsPh")} onChange={(e) => upd({ options: e.target.value })} />
        </div>
      )}
      {draft.type === "MATRIX" && (
        <div className="grid gap-1">
          <Label className="text-xs">{t("forms.propsColumns")}</Label>
          <Textarea rows={3} value={draft.columns} placeholder={t("forms.propsColumnsPh")} onChange={(e) => upd({ columns: e.target.value })} />
          <p className="text-[11px] text-muted-foreground">{t("forms.propsMatrixNote", { r: opts.length, c: draft.columns.split("\n").filter((s) => s.trim()).length })}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label className="text-xs">{t("forms.propsRequired")}</Label>
          <Select value={draft.required} onValueChange={(v) => upd({ required: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="OPTIONAL">{t("forms.reqOptional")}</SelectItem>
              <SelectItem value="ALWAYS">{t("forms.reqAlways")}</SelectItem>
              <SelectItem value="CONDITIONAL">{t("forms.reqConditional")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">{t("forms.propsSensitivity")}</Label>
          <Select value={draft.sensitivity} onValueChange={(v) => upd({ sensitivity: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="STANDARD">{t("forms.sensStandard")}</SelectItem>
              <SelectItem value="OPERATIONAL_SENSITIVE">{t("forms.sensOperational")}</SelectItem>
              <SelectItem value="TEAM_ONLY">{t("forms.sensTeam")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── STUDIO-DND: genişlik (elle ayarlanabilir boyut) ── */}
      <div className="grid gap-1">
        <Label className="text-xs">{t("forms.widthLabel")}</Label>
        <Select
          value={WIDTH_PRESETS.some((p) => p.value === draft.width) ? draft.width : "CUSTOM"}
          disabled={draft.type === "SECTION"}
          onValueChange={(v) => upd({ width: v === "CUSTOM" ? draft.width : v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {WIDTH_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{t(p.labelKey)}</SelectItem>
            ))}
            <SelectItem value="CUSTOM">{t("forms.widthCustom", { w: draft.width })}</SelectItem>
          </SelectContent>
        </Select>
        {draft.type === "SECTION" ? (
          <p className="text-[11px] text-muted-foreground">{t("forms.widthSectionLocked")}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">{t("forms.widthHint")}</p>
        )}
      </div>

      {/* ── FORM-EXP2: adım/sayfa (yalnız adım-adım modda) ── */}
      {enableSteps && (
        <div className="grid gap-1">
          <Label className="text-xs">{t("forms.stepPropLabel")}</Label>
          <Select value={draft.step} onValueChange={(v) => upd({ step: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>{t("forms.stepLabel")} {n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">{t("forms.stepHint")}</p>
        </div>
      )}

      {draft.type === "QA_QUIZ" && (
        <div className="grid gap-2 rounded-lg border bg-emerald-50/40 p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">{t("forms.propsCorrect")}</Label>
              <Select value={draft.correctAnswer || undefined} onValueChange={(v) => upd({ correctAnswer: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder={t("forms.selectOptionPh")} /></SelectTrigger>
                <SelectContent>
                  {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">{t("forms.propsPoints")}</Label>
              <Input type="number" min={1} value={draft.points} onChange={(e) => upd({ points: e.target.value })} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("forms.propsPointsNote")}</p>
        </div>
      )}

      {draft.required === "CONDITIONAL" && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-2.5">
          <div className="grid gap-1">
            <Label className="text-xs">{t("forms.propsCondField")}</Label>
            <Select value={draft.conditionField} onValueChange={(v) => upd({ conditionField: v })}>
              <SelectTrigger><SelectValue placeholder={t("forms.propsCondPick")} /></SelectTrigger>
              <SelectContent>
                {otherFields.map((f) => <SelectItem key={f.id} value={f.label}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">{t("forms.propsCondValue")}</Label>
            <Input value={draft.conditionValue} placeholder={t("forms.propsCondValuePh")} onChange={(e) => upd({ conditionValue: e.target.value })} />
          </div>
        </div>
      )}

      {/* ── MANTIK KAPILARI ── */}
      <Separator />
      <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <WorkflowIcon /> {t("forms.logicTitle")}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t("forms.logicDesc")}</p>
      </div>
      {draft.logicRules.length > 0 && (
        <div className="grid gap-2">
          {draft.logicRules.map((r, i) => (
            <div key={i} className="grid gap-1.5 rounded-lg border bg-muted/30 p-2">
              <div className="flex items-center gap-1.5">
                <Select value={r.field} onValueChange={(v) => updRule(i, { field: v })}>
                  <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder={t("forms.logicSrcPh")} /></SelectTrigger>
                  <SelectContent>
                    {otherFields.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={r.op} onValueChange={(v) => updRule(i, { op: v as LogicRule["op"] })}>
                  <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOGIC_OPS.map((op) => <SelectItem key={op} value={op}>{OP_LABELS[op]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="size-8 shrink-0 text-rose-600 hover:bg-rose-50"
                  aria-label={t("forms.logicRemoveRule")}
                  disabled={busy !== null}
                  onClick={() => upd({ logicRules: draft.logicRules.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              {!["EMPTY", "NOT_EMPTY"].includes(r.op) && (
                <Input className="h-8 text-xs" value={r.value ?? ""}
                  placeholder={t("forms.logicValuePh")}
                  onChange={(e) => updRule(i, { value: e.target.value })} />
              )}
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">{t("forms.logicModeLabel")}</Label>
              <Select value={draft.logicMode} onValueChange={(v) => upd({ logicMode: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">{t("forms.logicModeAny")}</SelectItem>
                  <SelectItem value="ALL">{t("forms.logicModeAll")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">{t("forms.logicActionLabel")}</Label>
              <Select
                value={draft.logicAction}
                onValueChange={(v) => upd({
                  logicAction: v,
                  // FORM-EXP3: GOTO'ya geçildiğinde hedef ön-seçilir (bir sonraki adım)
                  ...(v === "GOTO" && !draft.gotoStep
                    ? { gotoStep: String(Math.min(20, (Number(draft.step) || 1) + 1)) }
                    : {}),
                })}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SHOW">{t("forms.logicShow")}</SelectItem>
                  <SelectItem value="HIDE">{t("forms.logicHide")}</SelectItem>
                  {enableSteps && <SelectItem value="GOTO">{t("forms.logicGoto")}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* FORM-EXP3: dallanma hedefi — koşul sağlanınca gidilecek adım (yalnız GOTO) */}
          {draft.logicAction === "GOTO" && enableSteps && (
            <div className="grid gap-1">
              <Label className="text-xs">{t("forms.logicGotoTarget")}</Label>
              <Select value={draft.gotoStep} onValueChange={(v) => upd({ gotoStep: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("forms.logicGotoTarget")} /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 20 }, (_, i) => i + 1)
                    .filter((n) => n > (Number(draft.step) || 1))
                    .map((n) => <SelectItem key={n} value={String(n)}>{t("forms.stepLabel")} {n}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{t("forms.logicGotoHint")}</p>
            </div>
          )}
        </div>
      )}
      <Button
        size="sm" variant="outline" className="justify-start text-xs"
        disabled={busy !== null || otherFields.length === 0}
        onClick={() => upd({ logicRules: [...draft.logicRules, { field: otherFields[0]?.id ?? "", op: "EQ", value: "" }] })}
      >
        <Plus className="size-3.5" /> {t("forms.logicAddRule")}
      </Button>

      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={busy !== null || !draft.label.trim()}
          onClick={() => onSave({ ...draft, width: draft.type === "SECTION" ? "100" : draft.width })}
        >
          {busy !== null ? <Loader2 className="size-4 animate-spin" /> : <CheckIcon />} {t("forms.saveField")}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>{t("forms.cancelEdit")}</Button>
      </div>
    </div>
  );
}

function WorkflowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 text-teal-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" />
      <path d="M9 6h6a3 3 0 013 3v6" /><circle cx="6" cy="18" r="3" /><path d="M6 15v-3" />
    </svg>
  );
}
function CheckIcon() {
  return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>;
}

// ─── Paylaşım paneli ─────────────────────────────────────────────────────────

export function SharePanel({
  form, busy, slug, onSlugChange, captchaEnabled, hasPublicResults,
  onToggleCaptcha, onToggleResults, onSlugSave,
}: {
  form: { id: string; name: string; type: string };
  busy: string | null;
  slug: string;
  onSlugChange: (v: string) => void;
  captchaEnabled: boolean;
  hasPublicResults: boolean;
  onToggleCaptcha: (v: boolean) => void;
  onToggleResults: (v: boolean) => void;
  onSlugSave: () => void;
}) {
  const [qrData, setQrData] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false); // FORM-EXP3: Web Share API (yalnız istemci)
  const origin = useMemo(() => (typeof window !== "undefined" ? window.location.origin : ""), []);
  const publicRef = slug.trim() || form.id;
  const link = `${origin}/?form=${encodeURIComponent(publicRef)}`;
  const shareText = `${form.name} — ${link}`;
  const embed = `<iframe src="${link}&embed=1" width="100%" height="720" frameborder="0" style="border:0;border-radius:12px" title="${form.name}"></iframe>`;

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* pano izni yok — sessiz */
    }
  };

  const makeQr = async () => {
    try {
      const QR = (await import("qrcode")).default;
      setQrData(await QR.toDataURL(link, { width: 220, margin: 1, color: { dark: "#0f766e", light: "#ffffff" } }));
    } catch {
      setQrData(null);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <Label className="text-xs">{t("forms.slugLabel")}</Label>
        <div className="flex gap-1.5">
          <Input value={slug} placeholder={t("forms.slugPh")} onChange={(e) => onSlugChange(e.target.value)} />
          <Button size="sm" variant="outline" disabled={busy !== null || !slug.trim() || slug === publicRef} onClick={onSlugSave}>
            {t("forms.slugSave")}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("forms.slugNote")}</p>
      </div>

      <div className="grid gap-1">
        <Label className="text-xs">{t("forms.shareLinkLabel")}</Label>
        <div className="flex gap-1.5">
          <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.target.select()} aria-label={t("forms.shareLinkLabel")} />
          <Button size="icon" variant="outline" className="size-9 shrink-0" aria-label={t("forms.copyLink")} onClick={() => copy(link, "link")}>
            <Copy className="size-3.5" />
          </Button>
          <a href={`/?form=${encodeURIComponent(publicRef)}`} target="_blank" rel="noopener noreferrer">
            <Button size="icon" variant="outline" className="size-9 shrink-0" aria-label={t("forms.openExternal")}>
              <ExternalLink className="size-3.5" />
            </Button>
          </a>
        </div>
        {copied === "link" && <p className="text-[11px] text-teal-700">{t("forms.copied")}</p>}
      </div>

      <div className="grid gap-1">
        <Label className="text-xs">{t("forms.embedLabel")}</Label>
        <div className="flex gap-1.5">
          <Textarea readOnly rows={3} value={embed} className="font-mono text-[11px]" onFocus={(e) => e.target.select()} aria-label={t("forms.embedLabel")} />
          <Button size="icon" variant="outline" className="size-9 shrink-0" aria-label={t("forms.copyEmbed")} onClick={() => copy(embed, "embed")}>
            <Copy className="size-3.5" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("forms.embedNote")}</p>
      </div>

      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2.5">
        <QrCode className="size-5 shrink-0 text-teal-700" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">{t("forms.qrTitle")}</p>
          <p className="text-[11px] text-muted-foreground">{t("forms.qrDesc")}</p>
        </div>
        {qrData ? (
          <img src={qrData} alt={t("forms.qrTitle")} className="size-20 rounded border bg-white" />
        ) : (
          <Button size="sm" variant="outline" onClick={makeQr}>{t("forms.qrShow")}</Button>
        )}
      </div>

      {/* FORM-EXP3: platform paylaşım düğmeleri — farklı platformlarda paylaşım */}
      <div className="grid gap-1">
        <Label className="text-xs">{t("forms.sharePlatforms")}</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" aria-label={t("forms.shareWhatsapp")} title={t("forms.shareWhatsapp")}>
            <Button type="button" size="icon" variant="outline" className="size-9" tabIndex={-1}><MessageCircle className="size-4" /></Button>
          </a>
          <a href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(form.name)}`} target="_blank" rel="noopener noreferrer" aria-label={t("forms.shareTelegram")} title={t("forms.shareTelegram")}>
            <Button type="button" size="icon" variant="outline" className="size-9" tabIndex={-1}><Send className="size-4" /></Button>
          </a>
          <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(link)}&text=${encodeURIComponent(form.name)}`} target="_blank" rel="noopener noreferrer" aria-label={t("forms.shareX")} title={t("forms.shareX")}>
            <Button type="button" size="icon" variant="outline" className="size-9" tabIndex={-1}><Twitter className="size-4" /></Button>
          </a>
          <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer" aria-label={t("forms.shareLinkedin")} title={t("forms.shareLinkedin")}>
            <Button type="button" size="icon" variant="outline" className="size-9" tabIndex={-1}><Linkedin className="size-4" /></Button>
          </a>
          <a href={`mailto:?subject=${encodeURIComponent(form.name)}&body=${encodeURIComponent(shareText)}`} aria-label={t("forms.shareEmail")} title={t("forms.shareEmail")}>
            <Button type="button" size="icon" variant="outline" className="size-9" tabIndex={-1}><Mail className="size-4" /></Button>
          </a>
          {canNativeShare && (
            <Button
              type="button" size="icon" variant="outline" className="size-9"
              aria-label={t("forms.shareNative")} title={t("forms.shareNative")}
              onClick={() => { void navigator.share({ title: form.name, url: link }).catch(() => undefined); }}
            >
              <Share2 className="size-4" />
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">{t("forms.sharePlatformsNote")}</p>
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium"><ShieldCheck className="size-4 text-teal-600" /> {t("forms.captchaTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("forms.captchaDesc")}</p>
        </div>
        <Switch checked={captchaEnabled} disabled={busy !== null} aria-label={t("forms.captchaTitle")} onCheckedChange={onToggleCaptcha} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium"><BarChart3 className="size-4 text-teal-600" /> {t("forms.resultsPublicTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("forms.resultsPublicDesc")}</p>
        </div>
        <Switch checked={hasPublicResults} disabled={busy !== null} aria-label={t("forms.resultsPublicTitle")} onCheckedChange={onToggleResults} />
      </div>
    </div>
  );
}
