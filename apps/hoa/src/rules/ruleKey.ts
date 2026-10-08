import type { Check, Condition, Rule } from "./rule"

type KeyedRule = Pick<Rule, "projectTypes" | "appliesTo" | "check" | "title"> & {
  appliesWhen: readonly (Condition | Omit<Extract<Condition, { type: "text" }>, "id">)[]
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function subject(check: Check, title: string) {
  switch (check.type) {
    case "allowed-values":
    case "prohibited-values":
    case "required-fact":
      return check.attribute
    case "allowed-values-by":
      return `${check.keyAttribute}>${check.attribute}`
    case "matches":
      return [check.attribute, check.otherAttribute].toSorted().join("=")
    case "range":
      return check.attributes.toSorted().join("+")
    case "required-document":
      return check.document
    case "qualitative":
    case "informational":
      return slugify(title)
  }
}

function conditionKey(condition: KeyedRule["appliesWhen"][number]) {
  if (condition.type === "text") {
    return slugify(condition.description)
  }
  const value = Array.isArray(condition.value)
    ? condition.value
        .map((item) => item.toLowerCase())
        .toSorted()
        .join("|")
    : String(condition.value ?? "").toLowerCase()
  return `${condition.attribute} ${condition.operator} ${value}`.trim()
}

/**
 * A rule's stable identity across rulebook versions (docs/design/rules.md, "Rule keys"). Generated once, when the
 * rule is first saved, and never changed afterwards.
 */
export function generateRuleKey(rule: KeyedRule): string {
  return [
    rule.projectTypes.toSorted().join("+"),
    rule.appliesTo,
    rule.check.type,
    subject(rule.check, rule.title),
    rule.appliesWhen.map(conditionKey).toSorted().join("&")
  ].join(":")
}

/**
 * Gives every rule a unique key within its rulebook. A rule whose key is already taken gets its first citation's
 * section as a suffix, which stays the same from build to build.
 */
export function assignUniqueKeys<T extends { key: string; section: string }>(rules: readonly T[]) {
  const seen = new Set<string>()
  return rules.map((rule) => {
    let key = rule.key
    const isDuplicate = seen.has(key)
    if (isDuplicate) {
      key = `${rule.key}#${rule.section}`
      for (let counter = 2; seen.has(key); counter += 1) {
        key = `${rule.key}#${rule.section}-${counter}`
      }
    }
    seen.add(key)
    return { ...rule, key, isDuplicate }
  })
}
