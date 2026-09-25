// F-EXP — Form mantık kapıları (logic gates) ortak değerlendirme motoru.
// Sunucu (public-register) ve istemci (public-form) AYNI kuralları uygular:
// istemci görsellik için, sunucu doğrulama/gizli-alan temizliği için kullanır.
// Bağımlılıksız saf modül — edge/client/server her yerde import edilebilir.

export const LOGIC_OPS = ["EQ", "NEQ", "CONTAINS", "GT", "LT", "EMPTY", "NOT_EMPTY"] as const;
export type LogicOp = (typeof LOGIC_OPS)[number];

export interface LogicRule {
  field: string; // kaynak alan id
  op: LogicOp;
  value?: string; // EQ/NEQ/CONTAINS/GT/LT için referans değer
}

export interface LogicCarrier {
  // F-EXP kuralları
  logicRules?: string | null; // JSON LogicRule[]
  logicMode?: string | null; // ANY|ALL
  logicAction?: string | null; // SHOW|HIDE
  // eski (legacy) tek-koşul alanları — geriye uyumluluk
  conditionField?: string | null; // kaynak alanın ETİKETİ (eski davranış)
  conditionValue?: string | null;
}

/** logicRules JSON'unu güvenle çöz — bozuk/eksik → boş dizi (fail-open gösterim). */
export function parseLogicRules(json?: string | null): LogicRule[] {
  if (!json) return [];
  try {
    const p: unknown = JSON.parse(json);
    if (!Array.isArray(p)) return [];
    return p
      .filter(
        (r): r is LogicRule =>
          typeof r === "object" && r !== null &&
          typeof (r as LogicRule).field === "string" &&
          LOGIC_OPS.includes((r as LogicRule).op),
      )
      .map((r) => ({ field: r.field, op: r.op, value: r.value ?? "" }));
  } catch {
    return [];
  }
}

function compare(actual: string, op: LogicOp, expected: string): boolean {
  const a = (actual ?? "").trim();
  const e = (expected ?? "").trim();
  switch (op) {
    case "EMPTY":
      return a === "";
    case "NOT_EMPTY":
      return a !== "";
    case "EQ":
      return a === e;
    case "NEQ":
      return a !== e && a !== ""; // boş cevap NEQ'i doğru saymaz (cevapsız ≠ farklı)
    case "CONTAINS":
      return a !== "" && e !== "" && a.toLowerCase().includes(e.toLowerCase());
    case "GT":
      return Number.isFinite(Number(a)) && Number.isFinite(Number(e)) && Number(a) > Number(e);
    case "LT":
      return Number.isFinite(Number(a)) && Number.isFinite(Number(e)) && Number(a) < Number(e);
    default:
      return true;
  }
}

/** Tek kuralı değerlendir — answers: {fieldId: cevap} (MULTI_CHOICE JSON dizi olabilir). */
export function evalRule(rule: LogicRule, answers: Record<string, string>): boolean {
  let actual = answers[rule.field] ?? "";
  if (actual.startsWith("[")) {
    try {
      const arr: unknown = JSON.parse(actual);
      if (Array.isArray(arr)) actual = arr.map(String).join("|");
    } catch {
      /* düz metin olarak devam */
    }
  }
  return compare(actual, rule.op, rule.value ?? "");
}

/**
 * Alanın görünür olup olmadığını hesapla.
 * answers: {fieldId: cevap}; labelIndex: etiket→fieldId haritası (legacy koşul alanı için).
 * Kurallar tüm cevapları görür (gizli alanların cevapları da kapı girdisi olabilir) —
 * sıra-bağımlı döngüsel kapılar form tasarım hatasıdır ve fail-open gösterilir.
 */
export function isFieldVisible(
  f: LogicCarrier & { id?: string; label?: string },
  answers: Record<string, string>,
  labelIndex?: Map<string, string>,
): boolean {
  const rules = parseLogicRules(f.logicRules);
  if (rules.length > 0) {
    const mode = f.logicMode === "ALL" ? "ALL" : "ANY";
    const satisfied = mode === "ALL" ? rules.every((r) => evalRule(r, answers)) : rules.some((r) => evalRule(r, answers));
    return f.logicAction === "HIDE" ? !satisfied : satisfied; // varsayılan SHOW
  }
  // legacy: conditionField etiketi + conditionValue eşitliği ( CHECKBOX "true" özel durumu korunur)
  const legacyField = f.conditionField;
  if (!legacyField) return true;
  const srcId = labelIndex?.get(legacyField);
  if (!srcId) return true; // kaynak yoksa göster (fail-open, eski davranış)
  const val = (answers[srcId] ?? "").trim();
  if ((f.conditionValue ?? "") === "true") return val === "true";
  const want = (f.conditionValue ?? "").trim();
  if (want === "") return val !== ""; // boş değer: cevaplandığında göster
  return val === want;
}

/**
 * Sunucu tarafı kapı temizliği — yalnız GÖRÜNÜR alanların cevaplarını döndürür.
 * Botların gizli alanlara değer enjekte etmesi böylece anlamsızlaşır.
 */
export function filterVisibleAnswers<T extends { id: string } & LogicCarrier & { label?: string; type?: string }>(
  fields: T[],
  answers: Record<string, string>,
): Record<string, string> {
  const labelIndex = new Map<string, string>(fields.map((f) => [f.label ?? "", f.id]));
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.type === "SECTION") continue;
    if (!answers[f.id]) continue;
    if (isFieldVisible(f, answers, labelIndex)) out[f.id] = answers[f.id];
  }
  return out;
}
