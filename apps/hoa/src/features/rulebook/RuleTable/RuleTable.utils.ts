import { isBlocking } from "@/rulebook/review"
import type * as T from "@/schema/types"
import type { RulebookIssue } from "@/schema/validate"

// Filtering the rule table (encoding.md, UX, Rules): by domain, kind, request type, review status and words.

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
    .toSorted((a, b) => a.domain.localeCompare(b.domain) || a.key.localeCompare(b.key))
}

/** Every request type the rules run in. */
export const requestTypesOf = (rules: T.Rule[]) => [...new Set(rules.flatMap((rule) => rule.requestTypes))].toSorted()
