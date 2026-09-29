// ─── MOBİL UYGULAMA (PWA) AYARLARI — Branded App Builder v1 ───
// Sektör karşılığı: Cvent Branded App Builder / EventMobi app designer —
// organizatör uygulama kimliğini, kısayolları, kurulum teşviki ve çevrimdışı
// davranışı buradan yönetir. Saklama: EventPortalConfig.pwaJson (nullable;
// null/eksik = PWA_DEFAULTS). Tüketiciler: /api/portal/manifest (dinamik
// manifest), /api/portal/config (admin CRUD), portal-app (kurulum + şerit),
// tests-mini/pwa-settings (sözleşme), tests/pwa/31-pwa-audit (denetim).
import { z } from "zod";

export const PWA_SHORTCUT_TARGETS = [
  "home",
  "program",
  "speakers",
  "sponsors",
  "map",
  "qa",
  "forms",
  "b2b",
  "game",
  "profile",
] as const;
export type PwaShortcutTarget = (typeof PWA_SHORTCUT_TARGETS)[number];

// Manifest kısayol hedefi → portal hash ekranı (PWA-ADMIN: kısayollar portal içi derin bağdır)
export const PWA_SHORTCUT_HASH: Record<PwaShortcutTarget, string> = {
  home: "home",
  program: "program",
  speakers: "speakers",
  sponsors: "sponsors",
  map: "map",
  qa: "qa",
  forms: "forms",
  b2b: "b2b",
  game: "game",
  profile: "profile",
}; // PORTAL_NAV_SCREENS ile birebir (form hariç — formRef gerekir)

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
// URL politikası: site-içi yol VEYA https — javascript:/data:/protocol-relative YASAK
// (manifest'e enjekte edilen URL'ler XSS/istenmeyen kaynak taşımasın).
const SAFE_URL = /^(https:\/\/[^/\s]+\/\S*|\/[^/\s][^\\]*)$/;

const hexColor = (fallback: string) =>
  z
    .string()
    .max(16)
    .optional()
    .default("")
    .transform((v) => (HEX_COLOR.test((v ?? "").trim()) ? (v ?? "").trim() : fallback));

const safeUrl = (maxLen: number) =>
  z
    .string()
    .max(maxLen)
    .optional()
    .default("")
    .transform((v) => {
      const t = (v ?? "").trim();
      if (!t) return "";
      return SAFE_URL.test(t) ? t.slice(0, maxLen) : "";
    });

const PwaShortcutSchema = z.object({
  label: z.string().trim().min(1).max(24),
  target: z.enum(PWA_SHORTCUT_TARGETS),
});

const PwaScreenshotSchema = z.object({
  src: z.string().trim().min(1).max(2000),
  wide: z.boolean().optional().default(false),
});

export const PwaSettingsSchema = z.object({
  appName: z.string().trim().max(60).optional().default(""),
  shortName: z.string().trim().max(24).optional().default(""),
  description: z.string().trim().max(300).optional().default(""),
  lang: z.enum(["tr", "en"]).optional().default("tr"),
  backgroundColor: hexColor("#ffffff"),
  display: z.enum(["standalone", "minimal-ui", "browser"]).optional().default("standalone"),
  orientation: z.enum(["any", "portrait", "landscape"]).optional().default("portrait"),
  statusBarStyle: z.enum(["default", "black", "black-translucent"]).optional().default("default"),
  iconSrc: safeUrl(2000),
  iconMaskableSrc: safeUrl(2000),
  shortcuts: z.array(PwaShortcutSchema).max(4).optional().default([]),
  screenshots: z.array(PwaScreenshotSchema).max(8).optional().default([]),
  installBanner: z.boolean().optional().default(true),
  installDelaySec: z.number().int().min(0).max(600).optional().default(45),
  installDismissDays: z.number().int().min(1).max(90).optional().default(7),
  iosInstructions: z.boolean().optional().default(true),
  offlineBanner: z.boolean().optional().default(true),
});

export type PwaSettings = z.output<typeof PwaSettingsSchema>;
export type PwaSettingsInput = z.input<typeof PwaSettingsSchema>;

export const PWA_DEFAULTS: PwaSettings = PwaSettingsSchema.parse({});

// DB'den okuma — ASLA fırlatmaz: bozuk JSON/eksik alan → varsayılanlarla birleşir.
export function parsePwaSettings(raw: string | null | undefined): PwaSettings {
  if (!raw) return { ...PWA_DEFAULTS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...PWA_DEFAULTS };
    const res = PwaSettingsSchema.safeParse(parsed);
    return res.success ? res.data : { ...PWA_DEFAULTS, ...(sanitizePartial(parsed) ?? {}) };
  } catch {
    return { ...PWA_DEFAULTS };
  }
}

// Kısmi-bozuk kayıtta kurtarılabilen alanları ayıkla (tam varsayılan yerine).
function sanitizePartial(parsed: unknown): Partial<PwaSettings> | null {
  if (!parsed || typeof parsed !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    const field = (PwaSettingsSchema.shape as Record<string, z.ZodTypeAny>)[k];
    if (!field) continue;
    const r = field.safeParse(v);
    if (r.success) out[k] = r.data;
  }
  return out as Partial<PwaSettings>;
}

// API PUT gövdesi doğrulama — katı: geçersizse 400 (hata listesiyle).
export function validatePwaSettingsInput(input: unknown):
  | { ok: true; value: PwaSettings }
  | { ok: false; issues: string[] } {
  const res = PwaSettingsSchema.safeParse(input ?? {});
  if (res.success) return { ok: true, value: res.data };
  return {
    ok: false,
    issues: res.error.issues.map((i) => `${i.path.join(".") || "pwa"}: ${i.message}`),
  };
}

export function serializePwaSettings(value: PwaSettings): string {
  return JSON.stringify(value);
}

// iOS kurulumları beforeinstallprompt üretmez — PWA_INSTALL analitiği eksik
// sayılır. Telafi: standalone başlatmada BİR KEZ ateşlenir (bayrak-boğma).
// storage enjekte edilir (node-test uyumu).
export function consumeStandaloneInstallFlag(
  slug: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined,
): boolean {
  if (!storage) return false;
  try {
    const k = `maven.pwa.installed.${slug}`;
    if (storage.getItem(k)) return false;
    storage.setItem(k, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

// ─── Kurulabilirlik kontrol listesi (admin kartı + E2E denetimi AYNI mantık) ───
export type PwaCheckItem = { key: string; pass: boolean; detail: string };

export function pwaInstallabilityChecklist(args: {
  settings: PwaSettings;
  editionName: string;
  themeColor: string | null | undefined;
  swReachable: boolean;
  iconCheck?: { any192: boolean; any512: boolean; maskable: boolean };
}): PwaCheckItem[] {
  const { settings, editionName, themeColor, swReachable } = args;
  const icons = args.iconCheck ?? { any192: true, any512: true, maskable: true };
  const name = settings.appName.trim() || `${editionName} — Katılımcı Portalı`;
  const short = settings.shortName.trim() || editionName.replace(/\s+\d{4}\s*$/, "").trim().slice(0, 24);
  const theme = (themeColor ?? "").trim();
  return [
    { key: "name", pass: name.length >= 2, detail: name.slice(0, 40) || "—" },
    { key: "short_name", pass: short.length >= 1 && short.length <= 24, detail: short || "—" },
    { key: "start_url", pass: true, detail: "/?portal=<slug> (otomatik)" },
    { key: "display", pass: settings.display === "standalone" || settings.display === "minimal-ui", detail: settings.display },
    { key: "icon-192", pass: icons.any192, detail: settings.iconSrc || "/portal-icon-192.png (varsayılan)" },
    { key: "icon-512", pass: icons.any512, detail: settings.iconSrc || "/portal-icon-512.png (varsayılan)" },
    { key: "maskable", pass: icons.maskable, detail: settings.iconMaskableSrc || settings.iconSrc || "/portal-icon-512.png (varsayılan)" },
    // tema her zaman GEÇERLİ hex yayar (yedek #0d9488) — satır bilgi amaçlı, asla kırmızı değil
    { key: "theme_color", pass: true, detail: HEX_COLOR.test(theme) ? theme : `${theme || "—"} → #0d9488 yedeği` },
    { key: "service-worker", pass: swReachable, detail: swReachable ? "/sw.js erişilebilir" : "/sw.js erişilemiyor" },
  ];
}
