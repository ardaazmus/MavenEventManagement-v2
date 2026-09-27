// ============================================================================
// MAVEN EVENT MANAGEMENT — RULE ENGINE & CONDITION EVALUATOR
// Evaluates declarative visibility and validation rules for dynamic forms
// ============================================================================

export interface RuleCondition {
  field: string;
  operator: "equals" | "not_equals" | "in" | "not_in" | "gt" | "lt" | "contains";
  value: unknown;
}

export interface RuleGroup {
  all?: RuleCondition[];
  any?: RuleCondition[];
}

/**
 * Evaluates whether a single condition holds true given the current form data
 */
export function evaluateSingleCondition(condition: RuleCondition, formData: Record<string, unknown>): boolean {
  const actualVal = formData[condition.field];
  const targetVal = condition.value;

  switch (condition.operator) {
    case "equals":
      return String(actualVal ?? "").toLowerCase() === String(targetVal ?? "").toLowerCase();
    case "not_equals":
      return String(actualVal ?? "").toLowerCase() !== String(targetVal ?? "").toLowerCase();
    case "in":
      if (Array.isArray(targetVal)) {
        return targetVal.map((v) => String(v).toLowerCase()).includes(String(actualVal ?? "").toLowerCase());
      }
      return false;
    case "not_in":
      if (Array.isArray(targetVal)) {
        return !targetVal.map((v) => String(v).toLowerCase()).includes(String(actualVal ?? "").toLowerCase());
      }
      return true;
    case "gt":
      return Number(actualVal) > Number(targetVal);
    case "lt":
      return Number(actualVal) < Number(targetVal);
    case "contains":
      return String(actualVal ?? "").toLowerCase().includes(String(targetVal ?? "").toLowerCase());
    default:
      return true;
  }
}

/**
 * Evaluates whether a field should be visible according to visibility rules
 */
export function isFieldVisible(
  rulesJson: string | null | undefined | RuleCondition[] | RuleGroup,
  formData: Record<string, unknown>
): boolean {
  if (!rulesJson) return true;

  let parsedRules: any = rulesJson;
  if (typeof rulesJson === "string") {
    try {
      parsedRules = JSON.parse(rulesJson);
    } catch {
      return true;
    }
  }

  if (Array.isArray(parsedRules)) {
    // Tüm koşullar AND mantığıyla geçerli olmalıdır
    return parsedRules.every((c) => evaluateSingleCondition(c, formData));
  }

  if (typeof parsedRules === "object") {
    if (parsedRules.all && Array.isArray(parsedRules.all)) {
      if (!parsedRules.all.every((c: RuleCondition) => evaluateSingleCondition(c, formData))) {
        return false;
      }
    }
    if (parsedRules.any && Array.isArray(parsedRules.any)) {
      if (!parsedRules.any.some((c: RuleCondition) => evaluateSingleCondition(c, formData))) {
        return false;
      }
    }
    return true;
  }

  return true;
}
