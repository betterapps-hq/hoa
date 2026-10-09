import { SearchIcon, SlidersHorizontalIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { approvalBlockers } from "@/rulebook/review"
import type * as T from "@/schema/types"
import { BulkApprove } from "../BulkApprove/BulkApprove"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { clampPage, ListPager, pageOf } from "../ListPager/ListPager"
import { ReviewControls } from "../ReviewControls/ReviewControls"
import { RuleLink } from "../RuleLink/RuleLink"
import { TermChip } from "../TermChip/TermChip"
import { describeTermKind, termKindLabels } from "../TermChip/TermChip.utils"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import { filterTerms, termUsage, type TermFilters } from "./VocabularyTab.utils"

const pageSize = 25
const kinds: T.Term["kind"][] = ["thing", "category", "property", "value", "value-set", "unit"]
const kindChoices = [
  { value: "all" as const, label: "All kinds" },
  ...kinds.map((kind) => ({ value: kind, label: termKindLabels[kind] }))
]
const statusChoices: { value: TermFilters["status"]; label: string }[] = [
  { value: "proposed", label: "To review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" }
]

/**
 * The organization's terms (encoding.md, UX, Terms): each with its kind, definition and the rules that use it, a page
 * at a time; in a draft, its review. Approving a term is separate from approving rules; a rule waits for the terms it
 * reads.
 */
export function VocabularyTab() {
  const { records, vocabulary, approval, actions } = useRulebookWorkspace()
  const defaultStatus: TermFilters["status"] =
    actions && records.terms.some((term) => term.review.status === "proposed") ? "proposed" : "all"
  const [filters, setFilters] = useState<TermFilters>({ query: "", kind: "all", status: defaultStatus })
  const [page, setPage] = useState(0)
  const [openUsage, setOpenUsage] = useState<string | null>(null)
  const usage = termUsage(records.rules)
  const shown = filterTerms(records.terms, filters, vocabulary)
  const current = clampPage(shown.length, page, pageSize)
  const update = (change: Partial<TermFilters>) => {
    setFilters((existing) => ({ ...existing, ...change }))
    setPage(0)
  }
  const isFiltered = filters.kind !== "all" || filters.query.trim() !== "" || filters.status !== defaultStatus

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search terms"
            placeholder="Search the terms"
            className="pl-8"
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
          />
        </div>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" />}>
            <SlidersHorizontalIcon />
            Filters
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <FieldGroup className="gap-4">
              {actions ? (
                <Field>
                  <FieldLabel htmlFor="term-filter-status">Review</FieldLabel>
                  <ChoiceSelect
                    id="term-filter-status"
                    className="w-full"
                    value={filters.status}
                    choices={statusChoices}
                    onChange={(status) => update({ status })}
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="term-filter-kind">Kind</FieldLabel>
                <ChoiceSelect
                  id="term-filter-kind"
                  className="w-full"
                  value={filters.kind}
                  choices={kindChoices}
                  onChange={(kind) => update({ kind })}
                />
              </Field>
            </FieldGroup>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {shown.length === records.terms.length
            ? `${records.terms.length} terms`
            : `${shown.length} of ${records.terms.length} terms${filters.status === "proposed" ? ", to review" : ""}`}
          {isFiltered ? (
            <Button
              variant="link"
              size="sm"
              className="ml-2 h-auto p-0 text-link"
              onClick={() => {
                setFilters({ query: "", kind: "all", status: defaultStatus })
                setPage(0)
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </p>
        {filters.status === "proposed" ? (
          <BulkApprove refs={shown.map((term) => ({ type: "term" as const, key: term.key }))} noun="terms" />
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
          {filters.status === "proposed" && !filters.query && filters.kind === "all"
            ? "Every term is reviewed."
            : "No terms match."}
        </p>
      ) : (
        <ul aria-label="Terms" className="@container flex flex-col divide-y rounded-lg border">
          {pageOf(shown, current, pageSize).map((term) => {
            const users = usage.get(term.key) ?? []
            const label = vocabulary.label(term.key)
            return (
              <li key={term.key} className="flex flex-col gap-2 px-4 py-3 @xl:flex-row @xl:items-start @xl:gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <TermChip termKey={term.key} vocabulary={vocabulary} />
                    <span className="text-sm text-muted-foreground">{describeTermKind(term, vocabulary)}</span>
                  </span>
                  {term.definition ? <p>{term.definition}</p> : null}
                  <span>
                    <Button
                      variant="link"
                      className="h-auto p-0 text-sm text-link"
                      aria-expanded={openUsage === term.key}
                      aria-label={`${label}: used by ${users.length} ${users.length === 1 ? "rule" : "rules"}`}
                      disabled={users.length === 0}
                      onClick={() => setOpenUsage(openUsage === term.key ? null : term.key)}
                    >
                      {users.length === 0
                        ? "Used by no rule"
                        : `Used by ${users.length} ${users.length === 1 ? "rule" : "rules"}`}
                    </Button>
                  </span>
                  {openUsage === term.key ? (
                    <ul className="flex flex-col gap-1.5 border-l pl-3" aria-label={`Rules using ${label}`}>
                      {users.map((key) => (
                        <li key={key}>
                          <RuleLink ruleKey={key} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {actions ? (
                  <ReviewControls
                    isCompact
                    className="shrink-0"
                    record={{ type: "term", key: term.key }}
                    status={term.review.status}
                    name={label}
                    blockers={
                      approval && term.review.status === "proposed"
                        ? approvalBlockers(approval, { type: "term", key: term.key })
                        : []
                    }
                  />
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      <ListPager total={shown.length} page={current} pageSize={pageSize} onPageChange={setPage} noun="terms" />
    </div>
  )
}
