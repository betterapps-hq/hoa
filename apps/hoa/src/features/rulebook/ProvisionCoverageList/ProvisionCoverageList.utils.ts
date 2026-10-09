import { isCited, type ProvisionCoverage } from "@/rulebook/coverage"
import type * as T from "@/schema/types"

// The coverage tab's provision list (encoding.md, UX, Coverage): every provision in order, uncovered ones first.

export type CoverageFilter = "uncovered" | "to-review" | "all"

const coverageFilters: CoverageFilter[] = ["uncovered", "to-review", "all"]

/** A filter from a to-do link, or null when it names none. */
export const filterOf = (value: string | null) => coverageFilters.find((filter) => filter === value) ?? null

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
