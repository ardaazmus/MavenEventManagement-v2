// Kuruluş (tenant) slug üretimi — sıfır-veri onboarding'i için.
// tests-mini uyumu: BU DOSYA BAŞKA SRC MODÜLÜ import ETMEZ.
const TR_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", i̇: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u",
};

export function slugifyTenant(name: string): string {
  const ascii = (name ?? "").replace(/[\s\S]/g, (ch) => TR_MAP[ch] ?? ch);
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "kurulus";
}

// Kuruluş adı doğrulama — ensure API + mini-test ortak sözleşmesi.
export function validateTenantName(name: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof name !== "string") return { ok: false, error: "Kuruluş adı zorunludur" };
  const value = name.trim().replace(/\s+/g, " ");
  if (value.length < 2) return { ok: false, error: "Kuruluş adı en az 2 karakter olmalı" };
  if (value.length > 80) return { ok: false, error: "Kuruluş adı en fazla 80 karakter olmalı" };
  return { ok: true, value };
}
