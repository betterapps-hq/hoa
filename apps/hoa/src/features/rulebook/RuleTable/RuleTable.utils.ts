import { isBlocking } from "@/rulebook/review"
import type * as T from "@/schema/types"
import type { RulebookIssue } from "@/schema/validate"

// Filtering the rules list (encoding.md, UX, Rules): by review status, kind, domain, request type and words, in the
// documents' order.

export type StatusFilter = T.Review["status"] | "all" | "problems"

export type RuleFilters = {
  query: string
  domain: T.Domain | "all"
  kind: T.Rule["kind"] | "all"
  requestType: T.TermKey | "all"
  status: StatusFilter
}

/** Open stored issues and problems found that block the rule's approval. */
export const problemCount = (rule: T.Rule, found: RulebookIssue[] = []) =>
  rule.issues.filter((issue) => issue.resolution === null && isBlocking(issue.code)).length +
  found.filter((issue) => isBlocking(issue.code)).length

export function filterRules(
  rules: T.Rule[],
  filters: RuleFilters,
  { statementOf, issues }: { statementOf: (rule: T.Rule) => string; issues: Map<string, RulebookIssue[]> }
) {
  const words = filters.query.trim().toLowerCase()
  return rules
    .filter(
      (rule) =>
        (filters.domain === "all" || rule.domain === filters.domain) &&
        (filters.kind === "all" || rule.kind === filters.kind) &&
        (filters.requestType === "all" || rule.requestTypes.includes(filters.requestType)) &&
        (filters.status === "all" ||
          (filters.status === "problems"
            ? problemCount(rule, issues.get(rule.key)) > 0
            : rule.review.status === filters.status)) &&
        (!words || [rule.title, statementOf(rule), rule.key].join(" ").toLowerCase().includes(words))
    )
    .toSorted((a, b) => a.key.localeCompare(b.key, "en", { numeric: true }))
}

/** Every request type the rules run in. */
export const requestTypesOf = (rules: T.Rule[]) => [...new Set(rules.flatMap((rule) => rule.requestTypes))].toSorted()

export const defaultFilters = (status: StatusFilter): RuleFilters => ({
  query: "",
  domain: "all",
  kind: "all",
  requestType: "all",
  status
})

const statusFilters: StatusFilter[] = ["proposed", "approved", "rejected", "all", "problems"]

/** A status filter from a to-do link, or null when it names none. */
export const statusFilterOf = (value: string | null) => statusFilters.find((status) => status === value) ?? null

/** How many of the filters beside the words and status narrow the list. */
export const narrowingCount = (filters: RuleFilters) =>
  [filters.domain, filters.kind, filters.requestType].filter((value) => value !== "all").length
