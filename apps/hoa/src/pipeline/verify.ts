import type { z } from "zod"
import { normalizeForMatching, type Page } from "@/ocr/page"
import { getAttribute, type ProjectTypeId } from "@/rules/catalog"
import type { Check, Rule } from "@/rules/rule"
import type { citationMatchSchema, ruleIssueSchema } from "@/rules/rule"

type CitationMatch = z.infer<typeof citationMatchSchema>
type RuleIssue = z.infer<typeof ruleIssueSchema>

/** Word similarity a quote needs to count as a fuzzy match (tuned in phase 2). */
export const fuzzyThreshold = 0.9

const plausible: Record<"in" | "ft", { max: number }> = { in: { max: 300 }, ft: { max: 3000 } }

function countWords(words: readonly string[]) {
  const counts = new Map<string, number>()
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  return counts
}

/**
 * Finds a rule's quote on the cited page (docs/design/extraction.md, "5. Verify"). `exact` when the normalized quote
 * appears in the page's normalized text; otherwise the best window of the page's words scores by shared words, which
 * tolerates OCR noise such as dropped periods.
 */
export function matchQuote(
  quote: string,
  page: Pick<Page, "normalizedText" | "text" | "lowConfidenceSpans">
): CitationMatch {
  const normalizedQuote = normalizeForMatching(quote)
  const quoteWords = normalizedQuote.split(" ").filter(Boolean)
  const lowConfidenceWords = new Set(
    page.lowConfidenceSpans.flatMap((span) => normalizeForMatching(page.text.slice(span.start, span.end)).split(" "))
  )
  const touches = (words: readonly string[]) => words.some((word) => lowConfidenceWords.has(word))
  if (quoteWords.length === 0) {
    return { status: "not-found", score: 0, touchesLowConfidence: false }
  }
  if (` ${page.normalizedText} `.includes(` ${normalizedQuote} `)) {
    return { status: "exact", score: 1, touchesLowConfidence: touches(quoteWords) }
  }
  const pageWords = page.normalizedText.split(" ").filter(Boolean)
  const wanted = countWords(quoteWords)
  let best = { score: 0, words: [] as string[] }
  for (const size of [quoteWords.length - 1, quoteWords.length, quoteWords.length + 1, quoteWords.length + 2]) {
    if (size < 1) {
      continue
    }
    for (let start = 0; start + size <= pageWords.length; start += 1) {
      const window = pageWords.slice(start, start + size)
      const available = countWords(window)
      let shared = 0
      for (const [word, count] of wanted) {
        shared += Math.min(count, available.get(word) ?? 0)
      }
      const score = shared / Math.max(quoteWords.length, size)
      if (score > best.score) {
        best = { score, words: window }
      }
    }
  }
  const score = Math.round(best.score * 1000) / 1000
  return score >= fuzzyThreshold
    ? { status: "fuzzy", score, touchesLowConfidence: touches(best.words) }
    : { status: "not-found", score, touchesLowConfidence: false }
}

function checkAttributes(check: Check): string[] {
  switch (check.type) {
    case "allowed-values":
    case "prohibited-values":
    case "required-fact":
      return [check.attribute]
    case "allowed-values-by":
      return [check.keyAttribute, check.attribute]
    case "matches":
      return [check.attribute, check.otherAttribute]
    case "range":
      return check.attributes
    case "required-document":
    case "qualitative":
    case "informational":
      return []
  }
}

const readableScopes: Record<Rule["appliesTo"], readonly string[]> = {
  project: ["project"],
  segment: ["project", "segment"],
  gate: ["project", "segment", "gate"]
}

type CheckedRule = Pick<Rule, "projectTypes" | "appliesTo" | "check"> & {
  appliesWhen: readonly Rule["appliesWhen"][number][] | readonly { type: string; attribute?: string; value?: unknown }[]
}

/** Catalog and sanity checks: known attributes in scope, valid enum values, plausible numbers. */
export function checkRuleAgainstCatalog(rule: CheckedRule): Omit<RuleIssue, "resolution">[] {
  const issues: Omit<RuleIssue, "resolution">[] = []
  const projectType: ProjectTypeId = rule.projectTypes[0] ?? "fence"
  const conditionAttributes = rule.appliesWhen.flatMap((condition) =>
    condition.type === "fact" && typeof condition.attribute === "string" ? [condition.attribute] : []
  )
  for (const key of [...checkAttributes(rule.check), ...conditionAttributes]) {
    const attribute = getAttribute(projectType, key)
    if (!attribute) {
      issues.push({ code: "unknown-attribute", message: `"${key}" isn't in the ${projectType} catalog.` })
    } else if (!readableScopes[rule.appliesTo].includes(attribute.scope)) {
      issues.push({ code: "unknown-attribute", message: `A ${rule.appliesTo} rule can't read "${key}".` })
    }
  }

  const enumValues = (key: string, values: readonly string[]) => {
    const attribute = getAttribute(projectType, key)
    if (attribute?.kind !== "enum" || !attribute.values) {
      return
    }
    const known = new Set(attribute.values)
    for (const value of values) {
      if (!known.has(value.toLowerCase())) {
        issues.push({
          code: "invalid-value",
          message: `"${value}" isn't a value of "${key}" (${attribute.values.join(", ")}).`
        })
      }
    }
  }
  const check = rule.check
  if (check.type === "allowed-values" || check.type === "prohibited-values") {
    enumValues(
      check.attribute,
      check.values.map((value) => value.value)
    )
  }
  for (const condition of rule.appliesWhen) {
    if (condition.type === "fact" && typeof condition.attribute === "string" && condition.value !== undefined) {
      const values = Array.isArray(condition.value) ? condition.value : [condition.value]
      enumValues(
        condition.attribute,
        values.filter((value): value is string => typeof value === "string")
      )
    }
  }

  if (check.type === "range") {
    if (check.min === null && check.max === null) {
      issues.push({ code: "sanity", message: "The range has neither a minimum nor a maximum." })
    }
    if (check.min !== null && check.max !== null && check.min > check.max) {
      issues.push({ code: "sanity", message: `The minimum (${check.min}) is above the maximum (${check.max}).` })
    }
    const unit = getAttribute(projectType, check.attributes[0] ?? "")?.unit
    const limit = unit ? plausible[unit].max : undefined
    for (const bound of [check.min, check.max]) {
      if (limit !== undefined && bound !== null && (bound < 0 || bound > limit)) {
        issues.push({
          code: "sanity",
          message: `${bound} ${unit} isn't a plausible value for ${check.attributes.join(" + ")}.`
        })
      }
    }
  }
  return issues
}
