// ─── PWA MANİFEST ÜRETİCİ — katılımcı portalı "kurulabilir uygulama" kimliği ───
// Tüketiciler:
//   • GET /api/portal/manifest?slug=<edition> — etkinliğe özel ad/renk/başlangıç URL'i
//   • public/manifest.webmanifest — statik yedek (slug bilinmeden açılan yüzey)
// Kurallar (denetim bulgusu PWA-1/PWA-2):
//   • start_url/id HER ZAMAN gerçek portal yüzeyidir: /?portal=<slug>
//   • ikonlar GERÇEK dosyalardır: /portal-icon-192.png + /portal-icon-512.png
//   • theme_color doğrulanmamış girdiden gelmez — hex değilse varsayılan.

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
};

export type PortalManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
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

export function buildPortalManifest(input: PortalManifestInput): PortalManifest {
  const startUrl = `/?portal=${encodeURIComponent(input.editionSlug)}`;
  return {
    id: startUrl,
    name: `${input.name} — Katılımcı Portalı`,
    short_name: shortNameFor(input.name, input.shortName),
    description: (input.description ?? "").trim() || PORTAL_MANIFEST_DEFAULTS.description,
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: safeColor(input.backgroundColor, PORTAL_MANIFEST_DEFAULTS.backgroundColor),
    theme_color: safeColor(input.themeColor, PORTAL_MANIFEST_DEFAULTS.themeColor),
    lang: (input.lang ?? "").trim() || PORTAL_MANIFEST_DEFAULTS.lang,
    dir: "ltr",
    categories: ["events", "business", "productivity"],
    prefer_related_applications: false,
    icons: [
      { src: "/portal-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/portal-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/portal-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
