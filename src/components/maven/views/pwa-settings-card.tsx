"use client";
// ─── MOBİL UYGULAMA (PWA) — Branded App Builder kartı (PWA-ADMIN v1) ───
// Sektör karşılığı: Cvent Branded App Builder / EventMobi app designer —
// organizatör uygulama kimliği, kısayollar, ekran görüntüleri, kurulum
// teşviki ve çevrimdışı davranışı yönetir + canlı manifest önizleme ve
// kurulabilirlik kontrol listesi görür. Taslak portal-settings'e aittir
// (value/onChange); kayıt mevcut Kaydet akışından geçer.
import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/maven/bits";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  PWA_SHORTCUT_TARGETS,
  pwaInstallabilityChecklist,
  type PwaSettings,
  type PwaShortcutTarget,
} from "@/lib/pwa-settings";
import { buildPortalManifest } from "@/lib/portal-manifest";

type Props = {
  value: PwaSettings;
  onChange: (v: PwaSettings) => void;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  editionName: string;
  portalSlug: string | null;
  themeColor: string;
};

const clampInt = (n: number, lo: number, hi: number) =>
  Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : lo;

export function PwaSettingsCard({ value, onChange, enabled, onEnabledChange, editionName, portalSlug, themeColor }: Props) {
  const { t } = useLang();
  const [swOk, setSwOk] = useState<boolean | null>(null);

  // canlı SW denetimi — /sw.js erişilebilir mi? (kurulabilirlik önkoşulu)
  useEffect(() => {
    let live = true;
    fetch("/sw.js", { method: "HEAD" })
      .then((r) => { if (live) setSwOk(r.ok); })
      .catch(() => { if (live) setSwOk(false); });
    return () => { live = false; };
  }, []);

  const patch = <K extends keyof PwaSettings>(k: K, v: PwaSettings[K]) => onChange({ ...value, [k]: v });

  const targetLabel = (target: PwaShortcutTarget): string => {
    switch (target) {
      case "home": return t("portalApp.nav.home");
      case "program": return t("portalApp.nav.program");
      case "speakers": return t("portalApp.speakers.title");
      case "sponsors": return t("portalApp.nav.sponsors");
      case "map": return t("portalApp.nav.map");
      case "qa": return t("portalApp.qa.title");
      case "forms": return t("portalApp.forms.title");
      case "b2b": return t("portalApp.b2b.title");
      case "profile": return t("portalApp.profile.title");
      default: return target;
    }
  };

  const checklist = useMemo(
    () => pwaInstallabilityChecklist({ settings: value, editionName, themeColor, swReachable: swOk === true }),
    [value, editionName, themeColor, swOk],
  );
  const manifestPreview = useMemo(
    () => (portalSlug ? JSON.stringify(buildPortalManifest({ editionSlug: portalSlug, name: editionName, themeColor, pwa: value }), null, 2) : null),
    [portalSlug, editionName, themeColor, value],
  );
  const passCount = checklist.filter((c) => c.pass).length;

  return (
    <SectionCard title={t("portalSettings.pwa.title")} desc={t("portalSettings.pwa.desc")}>
      <div className="space-y-5">
        {/* 0 — ana anahtar (eski tek-switch buraya taşındı — davranış aynı) */}
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
          <div>
            <Label className="text-xs">PWA</Label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("portalSettings.content.pwaHint")}</p>
          </div>
          <Switch checked={enabled} onCheckedChange={onEnabledChange} aria-label="PWA" />
        </div>

        {/* 1 — uygulama kimliği */}
        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-xs font-semibold">{t("portalSettings.pwa.identity")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="pwa-appname">{t("portalSettings.pwa.appName")}</Label>
              <Input id="pwa-appname" value={value.appName} maxLength={60} placeholder={editionName}
                onChange={(e) => patch("appName", e.target.value)} className="text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="pwa-shortname">
                {t("portalSettings.pwa.shortName")} <span className="text-muted-foreground">({value.shortName.length}/24)</span>
              </Label>
              <Input id="pwa-shortname" value={value.shortName} maxLength={24}
                onChange={(e) => patch("shortName", e.target.value)} className="text-xs" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="pwa-desc">{t("portalSettings.pwa.description")}</Label>
            <Textarea id="pwa-desc" value={value.description} maxLength={300} rows={2}
              onChange={(e) => patch("description", e.target.value)} className="text-xs" />
          </div>
          <div className="w-44 space-y-1.5">
            <Label className="text-xs">{t("portalSettings.pwa.lang")}</Label>
            <Select value={value.lang} onValueChange={(v) => patch("lang", v as "tr" | "en")}>
              <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tr">Türkçe</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </fieldset>

        {/* 2 — görünüm */}
        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-xs font-semibold">{t("portalSettings.pwa.appearance")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="pwa-bg">{t("portalSettings.pwa.backgroundColor")}</Label>
              <div className="flex items-center gap-2">
                <input id="pwa-bg" type="color" value={/^#[0-9a-fA-F]{6}$/.test(value.backgroundColor) ? value.backgroundColor : "#ffffff"}
                  onChange={(e) => patch("backgroundColor", e.target.value)} className="size-8 cursor-pointer rounded border" aria-label={t("portalSettings.pwa.backgroundColor")} />
                <Input value={value.backgroundColor} maxLength={7} onChange={(e) => patch("backgroundColor", e.target.value)}
                  className="w-24 font-mono text-xs" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("portalSettings.pwa.statusBar")}</Label>
              <Select value={value.statusBarStyle} onValueChange={(v) => patch("statusBarStyle", v as PwaSettings["statusBarStyle"])}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t("portalSettings.pwa.statusDefault")}</SelectItem>
                  <SelectItem value="black">{t("portalSettings.pwa.statusBlack")}</SelectItem>
                  <SelectItem value="black-translucent">{t("portalSettings.pwa.statusTranslucent")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("portalSettings.pwa.display")}</Label>
              <Select value={value.display} onValueChange={(v) => patch("display", v as PwaSettings["display"])}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standalone">standalone</SelectItem>
                  <SelectItem value="minimal-ui">minimal-ui</SelectItem>
                  <SelectItem value="browser">browser</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("portalSettings.pwa.orientation")}</Label>
              <Select value={value.orientation} onValueChange={(v) => patch("orientation", v as PwaSettings["orientation"])}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">{t("portalSettings.pwa.orientPortrait")}</SelectItem>
                  <SelectItem value="landscape">{t("portalSettings.pwa.orientLandscape")}</SelectItem>
                  <SelectItem value="any">{t("portalSettings.pwa.orientAny")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("portalSettings.pwa.themeNote")}</p>
        </fieldset>

        {/* 3 — ikonlar */}
        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-xs font-semibold">{t("portalSettings.pwa.icons")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="pwa-icon">{t("portalSettings.pwa.iconSrc")}</Label>
              <div className="flex items-center gap-2">
                {value.iconSrc ? (
                   
                  <img src={value.iconSrc} alt="" className="size-9 shrink-0 rounded-lg border object-contain" />
                ) : null}
                <Input id="pwa-icon" value={value.iconSrc} placeholder="/portal-icon-512.png"
                  onChange={(e) => patch("iconSrc", e.target.value)} className="font-mono text-xs" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="pwa-icon-mask">{t("portalSettings.pwa.iconMaskableSrc")}</Label>
              <div className="flex items-center gap-2">
                {value.iconMaskableSrc ? (
                   
                  <img src={value.iconMaskableSrc} alt="" className="size-9 shrink-0 rounded-full border object-cover" />
                ) : null}
                <Input id="pwa-icon-mask" value={value.iconMaskableSrc} placeholder={t("portalSettings.pwa.iconMaskablePh")}
                  onChange={(e) => patch("iconMaskableSrc", e.target.value)} className="font-mono text-xs" />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("portalSettings.pwa.iconsNote")}</p>
        </fieldset>

        {/* 4 — kısayollar (en fazla 4) */}
        <fieldset className="space-y-2 rounded-lg border p-3">
          <legend className="px-1 text-xs font-semibold">{t("portalSettings.pwa.shortcuts")} ({value.shortcuts.length}/4)</legend>
          {value.shortcuts.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={s.label} maxLength={24} placeholder={t("portalSettings.pwa.shortcutLabel")}
                onChange={(e) => patch("shortcuts", value.shortcuts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                className="text-xs" aria-label={`${t("portalSettings.pwa.shortcutLabel")} ${i + 1}`} />
              <Select value={s.target} onValueChange={(v) => patch("shortcuts", value.shortcuts.map((x, j) => (j === i ? { ...x, target: v as PwaShortcutTarget } : x)))}>
                <SelectTrigger className="w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PWA_SHORTCUT_TARGETS.map((k) => (
                    <SelectItem key={k} value={k}>{targetLabel(k)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => patch("shortcuts", value.shortcuts.filter((_, j) => j !== i))}
                aria-label={t("portalSettings.pwa.remove")}>
                <Icons.Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" disabled={value.shortcuts.length >= 4}
            onClick={() => patch("shortcuts", [...value.shortcuts, { label: "", target: "program" as PwaShortcutTarget }])}>
            <Icons.Plus className="size-3.5" /> {t("portalSettings.pwa.addShortcut")}
          </Button>
        </fieldset>

        {/* 5 — ekran görüntüleri (zengin kurulum arayüzü) */}
        <fieldset className="space-y-2 rounded-lg border p-3">
          <legend className="px-1 text-xs font-semibold">{t("portalSettings.pwa.screenshots")} ({value.screenshots.length}/8)</legend>
          {value.screenshots.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={s.src} placeholder="https://…/ekran.png"
                onChange={(e) => patch("screenshots", value.screenshots.map((x, j) => (j === i ? { ...x, src: e.target.value } : x)))}
                className="font-mono text-xs" aria-label={`${t("portalSettings.pwa.screenshots")} ${i + 1}`} />
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox checked={s.wide} onCheckedChange={(v) => patch("screenshots", value.screenshots.map((x, j) => (j === i ? { ...x, wide: Boolean(v) } : x)))} />
                {t("portalSettings.pwa.wide")}
              </label>
              <Button variant="ghost" size="icon" onClick={() => patch("screenshots", value.screenshots.filter((_, j) => j !== i))}
                aria-label={t("portalSettings.pwa.remove")}>
                <Icons.Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" disabled={value.screenshots.length >= 8}
            onClick={() => patch("screenshots", [...value.screenshots, { src: "", wide: false }])}>
            <Icons.Plus className="size-3.5" /> {t("portalSettings.pwa.addScreenshot")}
          </Button>
        </fieldset>

        {/* 6 — kurulum teşviki + 7 — çevrimdışı */}
        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-xs font-semibold">{t("portalSettings.pwa.promotion")}</legend>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs">{t("portalSettings.pwa.installBanner")}</Label>
            <Switch checked={value.installBanner} onCheckedChange={(v) => patch("installBanner", v)} aria-label={t("portalSettings.pwa.installBanner")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="pwa-delay">{t("portalSettings.pwa.installDelaySec")}</Label>
              <Input id="pwa-delay" type="number" min={0} max={600} value={value.installDelaySec}
                onChange={(e) => patch("installDelaySec", clampInt(Number(e.target.value), 0, 600))} className="text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="pwa-dismiss">{t("portalSettings.pwa.installDismissDays")}</Label>
              <Input id="pwa-dismiss" type="number" min={1} max={90} value={value.installDismissDays}
                onChange={(e) => patch("installDismissDays", clampInt(Number(e.target.value), 1, 90))} className="text-xs" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs">{t("portalSettings.pwa.iosInstructions")}</Label>
            <Switch checked={value.iosInstructions} onCheckedChange={(v) => patch("iosInstructions", v)} aria-label={t("portalSettings.pwa.iosInstructions")} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-xs">{t("portalSettings.pwa.offlineBanner")}</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t("portalSettings.pwa.offlineBannerHint")}</p>
            </div>
            <Switch checked={value.offlineBanner} onCheckedChange={(v) => patch("offlineBanner", v)} aria-label={t("portalSettings.pwa.offlineBanner")} />
          </div>
        </fieldset>

        {/* 8 — canlı önizleme: kontrol listesi + manifest */}
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs font-semibold">
            {t("portalSettings.pwa.checklist")} — <span className={cn(passCount === checklist.length ? "text-emerald-600" : "text-amber-600")}>{passCount}/{checklist.length}</span>
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {checklist.map((c) => (
              <li key={c.key} className="flex items-start gap-1.5 text-[11px]">
                {c.pass ? (
                  <Icons.CheckCircle2 className="mt-px size-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <Icons.XCircle className="mt-px size-3.5 shrink-0 text-red-500" />
                )}
                <span className="font-mono font-semibold">{c.key}</span>
                <span className="truncate text-muted-foreground">{c.detail}</span>
              </li>
            ))}
          </ul>
          {manifestPreview ? (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium text-muted-foreground">{t("portalSettings.pwa.viewManifest")}</summary>
              <pre className="mt-1 max-h-56 overflow-auto rounded bg-muted/60 p-2 font-mono text-[10px] leading-relaxed">{manifestPreview}</pre>
              <a href={`/api/portal/manifest?slug=${encodeURIComponent(portalSlug ?? "")}`} target="_blank" rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] underline decoration-dotted">
                <Icons.ExternalLink className="size-3" /> {t("portalSettings.pwa.openManifest")}
              </a>
            </details>
          ) : (
            <p className="text-[11px] text-muted-foreground">{t("portalSettings.pwa.noSlug")}</p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
