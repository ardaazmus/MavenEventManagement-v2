// ─── P15: Tema tercihleri, kiracı varsayılanı ve kontrast bekçisi ─────────────
// P15.1: system/light/dark üçlüsü; P15.2: kullanıcı tercihi (çerez) kiracı
// varsayılanından (Tenant.themeDefault) ayrı çözülür; P15.3: marka rengi WCAG
// kontrast eşiğini sağlamadan kaydedilemez; P15.4: portal yüzeyi daima açık
// tema kullanır (PortalThemeGuard), yönetici yüzeyi kullanıcı tercihine uyar.
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.

export const THEME_COOKIE = "maven-theme";
export const THEME_CHOICES = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type ResolvedTheme = "light" | "dark";

export function sanitizeThemeChoice(raw: unknown): ThemeChoice | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return (THEME_CHOICES as readonly string[]).includes(v) ? (v as ThemeChoice) : null;
}

export interface ResolveThemeInput {
  user?: unknown;
  tenantDefault?: unknown;
  os?: ResolvedTheme;
}

export function resolveTheme(input: ResolveThemeInput): { resolved: ResolvedTheme; source: "user" | "tenant" | "os" } {
  const os = input.os === "dark" ? "dark" : "light";
  const user = sanitizeThemeChoice(input.user);
  if (user === "light" || user === "dark") return { resolved: user, source: "user" };
  const tenant = sanitizeThemeChoice(input.tenantDefault);
  if (user === null && (tenant === "light" || tenant === "dark")) {
    return { resolved: tenant, source: "tenant" };
  }
  return { resolved: os, source: "os" };
}

// ── WCAG 2.x göreli parlaklık + kontrast oranı ──────────────────────────────

export function parseHexColor(raw: string): [number, number, number] | null {
  const m = raw.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const n = parseInt(hex, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(rgb: [number, number, number]): number {
  return 0.2126 * channelLuminance(rgb[0]) + 0.7152 * channelLuminance(rgb[1]) + 0.0722 * channelLuminance(rgb[2]);
}

export function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export interface BrandCheck {
  ok: boolean;
  primary: string;
  onWhite: number;
  onBlack: number;
  bestForeground: "#ffffff" | "#000000";
  bestRatio: number;
  required: number;
}

// Marka rengi birincil düğmelerin zemini olarak beyaz metin taşır (bg-primary /
// text-primary-foreground). Düğmeler WCAG'de arayüz bileşenidir → eşik 3.0.
// (Not: "beyaz YA DA siyah 4.5" kapısı matematiksel olarak boştur — ikisinin
// çarpımı 21 olduğundan en iyi taraf daima ≥4.58 çıkar; o yüzden kapı beyaz
// metne sabitlenir, bestForeground metin kullanımı için raporlanır.)
export function checkBrandPrimary(primary: string, required = 3.0): BrandCheck | null {
  const rgb = parseHexColor(primary);
  if (!rgb) return null;
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  const onWhite = contrastRatio(white, rgb);
  const onBlack = contrastRatio(black, rgb);
  const bestForeground = onWhite >= onBlack ? "#ffffff" : "#000000";
  const bestRatio = Math.max(onWhite, onBlack);
  return { ok: onWhite >= required, primary, onWhite, onBlack, bestForeground, bestRatio, required };
}

export interface TenantThemePatch {
  themeDefault?: unknown;
  brandPrimary?: unknown;
}

export interface TenantThemeValid {
  themeDefault: ThemeChoice;
  brandPrimary: string | null;
  brandForeground: "#ffffff" | "#000000" | null;
}

export class ThemeValidationError extends Error {
  status = 422;
  details: Record<string, unknown>;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ThemeValidationError";
    this.details = details;
  }
}

export function validateTenantThemePatch(patch: TenantThemePatch): TenantThemeValid {
  const themeDefault = sanitizeThemeChoice(patch.themeDefault ?? "system") ?? "system";
  let brandPrimary: string | null = null;
  let brandForeground: "#ffffff" | "#000000" | null = null;
  if (patch.brandPrimary !== undefined && patch.brandPrimary !== null && String(patch.brandPrimary).trim() !== "") {
    const raw = String(patch.brandPrimary).trim();
    const check = checkBrandPrimary(raw);
    if (!check) {
      throw new ThemeValidationError("Marka rengi #rgb ya da #rrggbb olmalı", { brandPrimary: raw });
    }
    if (!check.ok) {
      throw new ThemeValidationError(
        `Marka rengi kontrast eşiğini sağlamıyor (en iyi ${check.bestRatio.toFixed(2)} < ${check.required})`,
        { brandPrimary: raw, onWhite: +check.onWhite.toFixed(2), onBlack: +check.onBlack.toFixed(2), required: check.required },
      );
    }
    brandPrimary = raw;
    brandForeground = check.bestForeground;
  }
  return { themeDefault, brandPrimary, brandForeground };
}
