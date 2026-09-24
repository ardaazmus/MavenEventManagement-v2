// ─── F6: Para birim migrasyonu — tüm para alanları MINOR UNIT (kuruş) Int ────
// Kural: DB'de para = kuruş (1 TRY = 100 kuruş); Float ASLA kullanılmaz (yuvarlama hatası yok).
// Giriş (kullanıcı TRY) → toMinor; çıkış (UI/Excel) → fromMinor / fmtMoney.
// Kabul edilen maliyet: kuruş-altı değerler yok (finansal sistemler için standart).

export const toMinor = (amountMajor: number): number => Math.round(amountMajor * 100);

export const fromMinor = (minor: number): number => Math.round(minor) / 100;

// ₺1.234,56 biçimi
export function fmtMoney(minor: number, currency = "TRY"): string {
  const major = fromMinor(minor);
  const formatted = major.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "TRY" ? `₺${formatted}` : `${formatted} ${currency}`;
}

// ₺1.235 biçimi (kuruşsuz listeler için)
export function fmtMoneyInt(minor: number, currency = "TRY"): string {
  const major = Math.round(fromMinor(minor));
  const formatted = major.toLocaleString("tr-TR");
  return currency === "TRY" ? `₺${formatted}` : `${formatted} ${currency}`;
}

// form input (TRY major) → minor
export function parseMoneyInput(input: string | number | null | undefined): number {
  const n = typeof input === "number" ? input : parseFloat((input ?? "").replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(n)) return 0;
  return toMinor(n);
}
