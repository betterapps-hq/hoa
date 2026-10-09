import { termKeysOf } from "@/rulebook/review"
import type * as T from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"

// The vocabulary tab (encoding.md, UX, Vocabulary): where each term is used, and filters by kind and status.

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

export function filterTerms(terms: T.Term[], filters: TermFilters, vocabulary: Vocabulary) {
  const words = filters.query.trim().toLowerCase()
  return terms
    .filter(
      (term) =>
        (filters.kind === "all" || term.kind === filters.kind) &&
        (filters.status === "all" || term.review.status === filters.status) &&
        (!words ||
          [term.key, term.definition ?? "", ...term.labels.map((label) => label.text)]
            .join(" ")
            .toLowerCase()
            .includes(words))
    )
    .toSorted((a, b) => vocabulary.label(a.key).localeCompare(vocabulary.label(b.key)) || a.key.localeCompare(b.key))
}
