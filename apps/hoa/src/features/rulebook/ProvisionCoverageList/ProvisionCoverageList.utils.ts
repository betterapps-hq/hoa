import type { Search, SearchSetup } from "@/lib/search"
import { isCited, type ProvisionCoverage } from "@/rulebook/coverage"
import type * as T from "@/schema/types"
import { citationLabel } from "../rulebookRecords"

// The coverage tab's provision list (encoding.md, UX, Coverage): every provision in order, uncovered ones first; with
// words, best match first.

export type CoverageFilter = "uncovered" | "to-review" | "all"

const coverageFilters: CoverageFilter[] = ["uncovered", "to-review", "all"]

/** A filter from a to-do link, or null when it names none. */
export const filterOf = (value: string | null) => coverageFilters.find((filter) => filter === value) ?? null

/** The provisions' search: the label counts most, then the heading, then the text. */
export const provisionSearchSetup: SearchSetup<T.Provision> = {
  id: (provision) => provision.key,
  fields: {
    label: { text: (provision) => citationLabel(provision.key), boost: 3 },
    heading: { text: (provision) => provision.heading ?? "", boost: 2 },
    text: { text: (provision) => provision.text }
  }
}

export function filterProvisions(
  provisions: T.Provision[],
  byProvision: Map<T.ProvisionKey, ProvisionCoverage>,
  filter: CoverageFilter,
  { query, search }: { query: string; search: Search<T.Provision> }
) {
  const isUncovered = (provision: T.Provision) => provision.noRule === null && !isCited(byProvision.get(provision.key))
  const matches = provisions.filter(
    (provision) =>
      filter === "all" ||
      (filter === "uncovered" ? isUncovered(provision) : provision.noRule?.review.status === "proposed")
  )
  // Uncovered first, each group in document order.
  return search.rank([...matches.filter(isUncovered), ...matches.filter((provision) => !isUncovered(provision))], query)
}
