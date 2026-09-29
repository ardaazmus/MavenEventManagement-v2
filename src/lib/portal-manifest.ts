// ─── PWA MANİFEST ÜRETİCİ — katılımcı portalı "kurulabilir uygulama" kimliği ───
// Tüketiciler:
//   • GET /api/portal/manifest?slug=<edition> — etkinliğe özel ad/renk/başlangıç URL'i
//   • public/manifest.webmanifest — statik yedek (slug bilinmeden açılan yüzey)
// Kurallar (denetim bulgusu PWA-1/PWA-2):
//   • start_url/id HER ZAMAN gerçek portal yüzeyidir: /?portal=<slug>
//   • ikonlar GERÇEK dosyalardır: /portal-icon-192.png + /portal-icon-512.png
//   • theme_color doğrulanmamış girdiden gelmez — hex değilse varsayılan.
// PWA-ADMIN v1: kısayollar + ekran görüntüleri + display/orientation admin
// ayarından gelir (src/lib/pwa-settings.ts'ten `pwa` alanıyla); boşsa sektör-varsayılanları.
// NOT: tests-mini uyumu için bu dosya BAŞKA SRC MODÜLÜ import ETMEZ (node @/ çözemez).
// Kısayol hedef kümesi pwa-settings ile BİREBİR aynı olmalı — parite kilidi:
// tests-mini/pwa-settings.test.mjs → PWA-ADMIN-10.
import type { PwaSettings } from "@/lib/pwa-settings";

export const PORTAL_MANIFEST_DEFAULTS = {
  themeColor: "#0d9488",
  backgroundColor: "#ffffff",
  lang: "tr",
  description: "Profesyonel Kongre ve Etkinlik Katılımcı Portalı",
} as const;

export type PortalManifestInput = {
  editionSlug: string;
  name: string;
  shortName?: string | null;
  description?: string | null;
  themeColor?: string | null;
  backgroundColor?: string | null;
  lang?: string | null;
  pwa?: PwaSettings | null;
};

export type PortalManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
};

export type PortalManifestShortcut = {
  name: string;
  url: string;
  icons: PortalManifestIcon[];
};

export type PortalManifestScreenshot = {
  src: string;
  type: string;
  form_factor: "narrow" | "wide";
};

export type PortalManifest = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  background_color: string;
  theme_color: string;
  lang: string;
  dir: string;
  categories: string[];
  prefer_related_applications: boolean;
  icons: PortalManifestIcon[];
  shortcuts?: PortalManifestShortcut[];
  screenshots?: PortalManifestScreenshot[];
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function safeColor(raw: string | null | undefined, fallback: string): string {
  const v = (raw ?? "").trim();
  return HEX_COLOR.test(v) ? v : fallback;
}

function shortNameFor(name: string, explicit?: string | null): string {
  const e = (explicit ?? "").trim();
  if (e) return e.slice(0, 24);
  // "No-Dig Turkey 2026" → "No-Dig Turkey" (yıl ana ekranda gürültü)
  return name.replace(/\s+\d{4}\s*$/, "").trim().slice(0, 24) || name.slice(0, 24);
}

function orientationFor(raw: string | undefined): string {
  // manifest orientation: açık değerler (spec uyumu)
  if (raw === "landscape") return "landscape-primary";
  if (raw === "any") return "any";
  return "portrait-primary";
}

// pwa-settings.PWA_SHORTCUT_HASH aynası (import'suz — yukarıdaki NOT)
const SHORTCUT_HASH: Record<string, string> = {
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
};

function mimeForImage(src: string): string {
  const s = src.toLowerCase().split("?")[0];
  if (s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
  if (s.endsWith(".webp")) return "image/webp";
  if (s.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

export function buildPortalManifest(input: PortalManifestInput): PortalManifest {
  const startUrl = `/?portal=${encodeURIComponent(input.editionSlug)}`;
  const pwa = input.pwa ?? null;
  const appName = (pwa?.appName ?? "").trim() || `${input.name} — Katılımcı Portalı`;
  const shortName = (pwa?.shortName ?? "").trim() || shortNameFor(input.name, input.shortName);
  const description = (pwa?.description ?? "").trim() || (input.description ?? "").trim() || PORTAL_MANIFEST_DEFAULTS.description;
  const lang = pwa?.lang || (input.lang ?? "").trim() || PORTAL_MANIFEST_DEFAULTS.lang;
  // özel ikon varsa onunla, yoksa GERÇEK varsayılan dosyalarla (PWA-2 korunur)
  const iconAny = (pwa?.iconSrc ?? "").trim();
  const iconMaskable = (pwa?.iconMaskableSrc ?? "").trim() || iconAny;
  const icons: PortalManifestIcon[] = iconAny
    ? [
        { src: iconAny, sizes: "192x192", type: mimeForImage(iconAny), purpose: "any" },
        { src: iconAny, sizes: "512x512", type: mimeForImage(iconAny), purpose: "any" },
      ]
    : [
        { src: "/portal-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/portal-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ];
  icons.push(
    iconMaskable
      ? { src: iconMaskable, sizes: "512x512", type: mimeForImage(iconMaskable), purpose: "maskable" }
      : { src: "/portal-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  );
  const manifest: PortalManifest = {
    id: startUrl,
    name: appName,
    short_name: shortName,
    description,
    start_url: startUrl,
    scope: "/",
    display: pwa?.display || "standalone",
    orientation: orientationFor(pwa?.orientation),
    background_color: safeColor(pwa?.backgroundColor || input.backgroundColor, PORTAL_MANIFEST_DEFAULTS.backgroundColor),
    theme_color: safeColor(input.themeColor, PORTAL_MANIFEST_DEFAULTS.themeColor),
    lang,
    dir: "ltr",
    categories: ["events", "business", "productivity"],
    prefer_related_applications: false,
    icons,
  };
  // kısayollar — portal-içi derin bağlar, her zaman scope içinde (güvenli)
  const shortcuts = (pwa?.shortcuts ?? [])
    .filter((s) => s.label.trim().length > 0)
    .slice(0, 4)
    .map((s) => ({
      name: s.label.trim().slice(0, 24),
      url: `${startUrl}#p=${SHORTCUT_HASH[s.target] ?? "home"}`,
      icons: [{ src: iconAny || "/portal-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }],
    }));
  if (shortcuts.length > 0) manifest.shortcuts = shortcuts;
  // ekran görüntüleri — zengin kurulum arayüzü (Android/Chrome)
  const screenshots = (pwa?.screenshots ?? [])
    .filter((s) => s.src.trim().length > 0)
    .slice(0, 8)
    .map((s) => ({
      src: s.src.trim(),
      type: mimeForImage(s.src),
      form_factor: (s.wide ? "wide" : "narrow") as "narrow" | "wide",
    }));
  if (screenshots.length > 0) manifest.screenshots = screenshots;
  return manifest;
}
