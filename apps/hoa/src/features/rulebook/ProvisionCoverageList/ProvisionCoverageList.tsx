import { SearchIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { BulkApprove } from "../BulkApprove/BulkApprove"
import { ProvisionCoverageCard } from "../ProvisionCoverageCard/ProvisionCoverageCard"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import { filterProvisions, type CoverageFilter } from "./ProvisionCoverageList.utils"

const pageSize = 50
const filterChoices: { value: CoverageFilter; label: string }[] = [
  { value: "uncovered", label: "Uncovered" },
  { value: "to-review", label: "Reasons to review" },
  { value: "all", label: "All" }
]

/**
 * Every provision of every document as a list (encoding.md, UX, Coverage), searchable and filtered to the uncovered
 * ones or the reasons to review, which can be approved together; uncovered provisions first.
 */
export function ProvisionCoverageList() {
  const { records, coverage, actions } = useRulebookWorkspace()
  const reasonsToReview = records.provisions.filter((provision) => provision.noRule?.review.status === "proposed")
  const [filter, setFilter] = useState<CoverageFilter>(() => {
    if (coverage.uncovered.length > 0) {
      return "uncovered"
    }
    return actions && reasonsToReview.length > 0 ? "to-review" : "all"
  })
  const [query, setQuery] = useState("")
  const [shownCount, setShownCount] = useState(pageSize)
  const shown = filterProvisions(records.provisions, coverage.byProvision, filter, query)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search provisions"
            placeholder="Search labels, headings and text"
            className="pl-8"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setShownCount(pageSize)
            }}
          />
        </div>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Show"
          value={[filter]}
          onValueChange={(value) => {
            const next = filterChoices.find((choice) => choice.value === value[0])
            if (next) {
              setFilter(next.value)
              setShownCount(pageSize)
            }
          }}
        >
          {filterChoices.map((choice) => (
            <ToggleGroupItem key={choice.value} value={choice.value}>
              {choice.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {filter === "to-review" ? (
          <BulkApprove
            refs={shown.map((provision) => ({ type: "provision" as const, key: provision.key }))}
            noun="reasons"
          />
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
          {filter === "uncovered" ? "Every provision is covered." : "No provisions match."}
        </p>
      ) : (
        <ul aria-label="Provisions" className="flex flex-col gap-2">
          {shown.slice(0, shownCount).map((provision) => (
            <li key={provision.key}>
              <ProvisionCoverageCard provision={provision} />
            </li>
          ))}
        </ul>
      )}
      {shown.length > shownCount ? (
        <Button variant="outline" className="w-fit" onClick={() => setShownCount((count) => count + pageSize)}>
          Show {Math.min(pageSize, shown.length - shownCount)} more
        </Button>
      ) : null}
    </div>
  )
}
