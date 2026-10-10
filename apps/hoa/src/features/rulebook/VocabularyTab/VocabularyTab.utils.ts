import type { SearchSetup } from "@/lib/search"
import { termKeysOf } from "@/rulebook/review"
import type * as T from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"

// The vocabulary tab (encoding.md, UX, Vocabulary): where each term is used, filters by kind and status, and the search the table finds words with.

/** The rules that read each term, rejected rules left out. */
export function termUsage(rules: T.Rule[]) {
  const usage = new Map<T.TermKey, T.RuleKey[]>()
  for (const rule of rules.filter((item) => item.review.status !== "rejected")) {
    for (const key of termKeysOf(rule)) {
      usage.set(key, [...(usage.get(key) ?? []), rule.key])
    }
  }
  return usage
}

export type TermFilters = {
  query: string
  kind: T.Term["kind"] | "all"
  status: T.Review["status"] | "all"
}

/** The terms' search: a label counts most, then the key, then the definition. */
export const termSearchSetup: SearchSetup<T.Term> = {
  id: (term) => term.key,
  fields: {
    labels: { text: (term) => term.labels.map((label) => label.text).join(" "), boost: 3 },
    key: { text: (term) => term.key, boost: 2 },
    definition: { text: (term) => term.definition ?? "" }
  }
}

/** A term as the table lists it: its label and the rules that read it. */
export type TermRow = { term: T.Term; label: string; usedBy: T.RuleKey[] }

/** The terms the filters beside the words keep, by label. */
export function filterTerms(
  terms: T.Term[],
  filters: TermFilters,
  { vocabulary, usage }: { vocabulary: Vocabulary; usage: Map<T.TermKey, T.RuleKey[]> }
): TermRow[] {
  return terms
    .filter(
      (term) =>
        (filters.kind === "all" || term.kind === filters.kind) &&
        (filters.status === "all" || term.review.status === filters.status)
    )
    .map((term) => ({ term, label: vocabulary.label(term.key), usedBy: usage.get(term.key) ?? [] }))
    .toSorted((a, b) => a.label.localeCompare(b.label) || a.term.key.localeCompare(b.term.key))
}
