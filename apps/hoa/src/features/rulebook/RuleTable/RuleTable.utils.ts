import type { Search, SearchSetup } from "@/lib/search"
import { isBlocking } from "@/rulebook/review"
import type * as T from "@/schema/types"
import type { RulebookIssue } from "@/schema/validate"
import { citationLabel } from "../rulebookRecords"

// Filtering the rules list (encoding.md, UX, Rules): by review status, kind, domain and request type in the documents'
// order, and by words, best match first.

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

/** The rules' search: a title counts most, then the citations' labels, then the statement in words. */
export const ruleSearchSetup = (statementOf: (rule: T.Rule) => string): SearchSetup<T.Rule> => ({
  id: (rule) => rule.key,
  fields: {
    title: { text: (rule) => rule.title, boost: 3 },
    citations: {
      text: (rule) => rule.citations.map((citation) => citationLabel(citation.provisionKey)).join(" "),
      boost: 2
    },
    statement: { text: statementOf }
  }
})

export function filterRules(
  rules: T.Rule[],
  filters: RuleFilters,
  { search, issues }: { search: Search<T.Rule>; issues: Map<string, RulebookIssue[]> }
) {
  const matches = rules
    .filter(
      (rule) =>
        (filters.domain === "all" || rule.domain === filters.domain) &&
        (filters.kind === "all" || rule.kind === filters.kind) &&
        (filters.requestType === "all" || rule.requestTypes.includes(filters.requestType)) &&
        (filters.status === "all" ||
          (filters.status === "problems"
            ? problemCount(rule, issues.get(rule.key)) > 0
            : rule.review.status === filters.status))
    )
    .toSorted((a, b) => a.key.localeCompare(b.key, "en", { numeric: true }))
  return search.rank(matches, filters.query)
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
