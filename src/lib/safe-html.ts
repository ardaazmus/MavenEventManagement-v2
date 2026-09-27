// P4 (yeni-fazlar 16): önizleme HTML'i için izin-listeli temizleyici (istemci-tarafı, saf).
// Amaç: editör şablonlarının ÖNİZLEME yüzeyinde saklı-XSS vektörlerini kapatmak.
// Kapsam (pragmatik izin-liste):
//  • <script>/<iframe>/<object>/<embed>/<link>/<meta>/<style> blokları TAMAMEN kaldırılır
//  • tüm özniteliklerden on* olay işleyicileri düşürülür
//  • href/src aksiyonlarında javascript:/data: (svg+xml dahil) URI şemaları reddedilir
// Not: tam WYSIWYG izin-listesi gerekirse DOMPurify benzeri bağımlılık ayrı değişiklik
// talebidir; bu yüzey önizleme panosu olduğu için yukarıdaki vektörler yeterli sınır kurar.
const STRIP_BLOCKS = /<\s*(script|iframe|object|embed|link|meta|style)\b[\s\S]*?(?:<\/\s*\1\s*>|$)/gi;
const TAG_NAME = /<(\/?)(\w+)/g;
const ATTRS = /(\s[a-zA-Z-]+)(\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+))?/g;

function cleanAttrs(tag: string): string {
  return tag.replace(ATTRS, (full, name: string, eq, _dq, _sq, _ns) => {
    const lower = name.toLowerCase();
    if (lower.startsWith("on")) return ""; // olay işleyicileri yok
    const attrName = lower.trim();
    if (attrName === "href" || attrName === "src" || attrName === "xlink:href") {
      const value = (eq ?? "").trim().replace(/^=\s*/, "").replace(/^["']|["']$/g, "");
      const decoded = value.replace(/&#x?([0-9a-f]+);?/gi, "").trim().toLowerCase();
      if (decoded.startsWith("javascript:") || decoded.startsWith("vbscript:") || decoded.startsWith("data:")) return "";
    }
    return full;
  });
}

export function sanitizePreviewHtml(html: string): string {
  return String(html ?? "")
    .replace(STRIP_BLOCKS, "")
    .replace(TAG_NAME, (_m, slash: string, name: string) => `<${slash}${name.toLowerCase() === "script" ? "" : name}`)
    .replace(/<(?:(?!<)(?:[^>"']|"[^"]*"|'[^']*')*)>/g, (tag) => cleanAttrs(tag));
}
