import type { ProvisionCoverage } from "@/rulebook/review"
import type * as T from "@/schema/types"

// The coverage tab (encoding.md, UX, Coverage): every provision in order, uncovered ones first.

export type CoverageFilter = "uncovered" | "to-review" | "all"

export const isCited = (coverage: ProvisionCoverage | undefined) =>
  coverage !== undefined &&
  (coverage.rules.length > 0 || coverage.terms.length > 0 || coverage.settings || coverage.questions.length > 0)

export function filterProvisions(
  provisions: T.Provision[],
  byProvision: Map<T.ProvisionKey, ProvisionCoverage>,
  filter: CoverageFilter,
  query: string
) {
  const words = query.trim().toLowerCase()
  const isUncovered = (provision: T.Provision) => provision.noRule === null && !isCited(byProvision.get(provision.key))
  const matches = provisions.filter(
    (provision) =>
      (filter === "all" ||
        (filter === "uncovered" ? isUncovered(provision) : provision.noRule?.review.status === "proposed")) &&
      (!words || [provision.key, provision.heading ?? "", provision.text].join(" ").toLowerCase().includes(words))
  )
  // Uncovered first, each group in document order.
  return [...matches.filter(isUncovered), ...matches.filter((provision) => !isUncovered(provision))]
}
