// ─── PORTAL YAZI TİPİ KATALOGU — Google Fonts entegrasyonu ───────────────────
// Kullanıcı isteği: "Sisteme google fonts eklensin."
// • Sistem yığınları (system/serif/rounded/mono/condensed) + 20 Google Font.
// • Google font anahtarları "gf-" önekiyle: gf-poppins gibi.
// • loadGoogleFont yalnız tarayıcıda çalışır (SSR guard'lı) ve idempotenttir —
//   aynı font için tekrar <link> eklemez. display=swap → FOIT yok.
// Sunucu tarafında (config PUT validasyonu) da import edilebilir: modül seviyesinde
// document erişimi YOKTUR.

export type GoogleFontDef = {
  key: string; // "gf-poppins"
  name: string; // insan-okur ad
  family: string; // CSS family adı ("Plus Jakarta Sans")
  weights: number[]; // yüklenen ağırlıklar
};

// latin-ext destekli, mobil portallar için seçilmiş popüler 20 font
export const GOOGLE_FONTS: GoogleFontDef[] = [
  { key: "gf-inter", name: "Inter", family: "Inter", weights: [400, 500, 600, 700] },
  { key: "gf-poppins", name: "Poppins", family: "Poppins", weights: [400, 500, 600, 700] },
  { key: "gf-montserrat", name: "Montserrat", family: "Montserrat", weights: [400, 500, 600, 700] },
  { key: "gf-roboto", name: "Roboto", family: "Roboto", weights: [400, 500, 700] },
  { key: "gf-opensans", name: "Open Sans", family: "Open Sans", weights: [400, 500, 600, 700] },
  { key: "gf-lato", name: "Lato", family: "Lato", weights: [400, 700] },
  { key: "gf-nunito", name: "Nunito", family: "Nunito", weights: [400, 600, 700] },
  { key: "gf-nunitosans", name: "Nunito Sans", family: "Nunito Sans", weights: [400, 600, 700] },
  { key: "gf-raleway", name: "Raleway", family: "Raleway", weights: [400, 500, 600, 700] },
  { key: "gf-worksans", name: "Work Sans", family: "Work Sans", weights: [400, 500, 600] },
  { key: "gf-manrope", name: "Manrope", family: "Manrope", weights: [400, 500, 600, 700] },
  { key: "gf-dmsans", name: "DM Sans", family: "DM Sans", weights: [400, 500, 700] },
  { key: "gf-jakarta", name: "Plus Jakarta Sans", family: "Plus Jakarta Sans", weights: [400, 500, 600, 700] },
  { key: "gf-sourcesans3", name: "Source Sans 3", family: "Source Sans 3", weights: [400, 600, 700] },
  { key: "gf-rubik", name: "Rubik", family: "Rubik", weights: [400, 500, 600, 700] },
  { key: "gf-quicksand", name: "Quicksand", family: "Quicksand", weights: [400, 500, 600, 700] },
  { key: "gf-barlow", name: "Barlow", family: "Barlow", weights: [400, 500, 600, 700] },
  { key: "gf-mulish", name: "Mulish", family: "Mulish", weights: [400, 600, 700] },
  { key: "gf-figtree", name: "Figtree", family: "Figtree", weights: [400, 500, 600, 700] },
  { key: "gf-sora", name: "Sora", family: "Sora", weights: [400, 600, 700] },
];

const BY_KEY = new Map(GOOGLE_FONTS.map((f) => [f.key, f]));

export function isGoogleFont(key: string | null | undefined): boolean {
  return typeof key === "string" && BY_KEY.has(key);
}

export function googleFontDef(key: string): GoogleFontDef | null {
  return BY_KEY.get(key) ?? null;
}

// Yerleşik sistem yığınları + Google font yığınları — portal-app ve admin ayarları
// aynı kaynağı kullanır (tek gerçek kaynak).
export const SYSTEM_FONT_STACKS: Record<string, string> = {
  system: "inherit",
  serif: "Georgia, 'Times New Roman', serif",
  rounded: "ui-rounded, 'Nunito', 'SF Pro Rounded', system-ui, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  condensed: "'Arial Narrow', 'Roboto Condensed', Arial, sans-serif",
};

export function fontStackFor(key: string | null | undefined): string | undefined {
  if (!key || key === "system") return undefined;
  const gf = BY_KEY.get(key);
  if (gf) return `'${gf.family}', system-ui, -apple-system, sans-serif`;
  return SYSTEM_FONT_STACKS[key];
}

// Google Fonts <link> enjeksiyonu — idempotent, SSR-güvenli
export function loadGoogleFont(key: string | null | undefined): void {
  if (!key || typeof document === "undefined") return;
  const gf = BY_KEY.get(key);
  if (!gf) return;
  const id = `gfont-${gf.key}`;
  if (document.getElementById(id)) return;
  // preconnect — ilk font yüklemesini hızlandırır
  if (!document.getElementById("gfont-preconnect")) {
    const pre = document.createElement("link");
    pre.id = "gfont-preconnect";
    pre.rel = "preconnect";
    pre.href = "https://fonts.gstatic.com";
    pre.crossOrigin = "anonymous";
    document.head.appendChild(pre);
  }
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(gf.family).replace(/%20/g, "+")}:wght@${gf.weights.join(";")}&display=swap`;
  document.head.appendChild(link);
}

// config PUT validasyonu için izinli font anahtarları
export const ALL_FONT_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(SYSTEM_FONT_STACKS),
  ...GOOGLE_FONTS.map((f) => f.key),
]);
