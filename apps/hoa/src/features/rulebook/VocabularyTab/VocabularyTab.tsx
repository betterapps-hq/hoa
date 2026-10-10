import { ChevronDownIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react"
import { useState } from "react"
import { DataTable } from "@/components/DataTable/DataTable"
import { dataTableColumns } from "@/components/DataTable/DataTable.utils"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useSearch } from "@/hooks/useSearch"
import { sentenceCase } from "@/lib/text"
import { cn } from "@/lib/utils"
import { approvalBlockers } from "@/rulebook/review"
import type * as T from "@/schema/types"
import { BulkApprove } from "../BulkApprove/BulkApprove"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { ReviewMenu } from "../ReviewMenu/ReviewMenu"
import { RuleLink } from "../RuleLink/RuleLink"
import { TermChip } from "../TermChip/TermChip"
import { describeTermKind, termKindLabels } from "../TermChip/TermChip.utils"
import { useRulebookWorkspace, type RulebookWorkspaceValue } from "../useRulebookWorkspace"
import { filterTerms, termSearchSetup, termUsage, type TermFilters, type TermRow } from "./VocabularyTab.utils"

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

const column = dataTableColumns<TermRow>()

/** "1 rule", "3 rules". */
const rulesText = (count: number) => `${count} ${count === 1 ? "rule" : "rules"}`

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
  const [openUsage, setOpenUsage] = useState<string | null>(null)
  const usage = termUsage(records.rules)
  const search = useSearch(records.terms, termSearchSetup)
  const filtered = filterTerms(records.terms, filters, { vocabulary, usage })
  const update = (change: Partial<TermFilters>) => setFilters((existing) => ({ ...existing, ...change }))
  const isFiltered = filters.kind !== "all" || filters.query.trim() !== "" || filters.status !== defaultStatus

  const columns = termColumns({
    vocabulary,
    approval,
    openUsage,
    onToggleUsage: (key) => setOpenUsage(openUsage === key ? null : key)
  })

  return (
    <DataTable
      data={filtered}
      columns={actions ? columns : columns.filter((item) => item.id !== "review")}
      getRowId={(row) => row.term.key}
      label="Terms"
      noun="terms"
      search={{ query: filters.query, ids: search.ids }}
      filterKey={[filters.kind, filters.status].join(" ")}
      toolbar={
        <>
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
        </>
      }
      renderSummary={(shown) => (
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
                onClick={() => setFilters({ query: "", kind: "all", status: defaultStatus })}
              >
                Clear filters
              </Button>
            ) : null}
          </p>
          {filters.status === "proposed" ? (
            <BulkApprove refs={shown.map((row) => ({ type: "term" as const, key: row.term.key }))} noun="terms" />
          ) : null}
        </div>
      )}
      empty={
        filters.status === "proposed" && !filters.query && filters.kind === "all"
          ? "Every term is reviewed."
          : "No terms match."
      }
      renderDetail={(row) =>
        openUsage === row.term.key ? (
          <ul className="flex flex-col gap-1.5 border-l pl-3" aria-label={`Rules using ${row.label}`}>
            {row.usedBy.map((key) => (
              <li key={key}>
                <RuleLink ruleKey={key} />
              </li>
            ))}
          </ul>
        ) : null
      }
    />
  )
}

type TermColumnsInput = Pick<RulebookWorkspaceValue, "vocabulary" | "approval"> & {
  /** The term whose rules are shown under it. */
  openUsage: string | null
  onToggleUsage: (key: string) => void
}

/** The terms table's columns: the term and its kind, its definition, the rules that use it, and its review. */
function termColumns({ vocabulary, approval, openUsage, onToggleUsage }: TermColumnsInput) {
  return column.columns([
    column.accessor("label", {
      id: "term",
      header: "Term",
      sortFn: "text",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-0.5">
          <TermChip termKey={row.original.term.key} vocabulary={vocabulary} isStandalone />
          <span className="text-muted-foreground">{describeTermKind(row.original.term, vocabulary)}</span>
        </div>
      ),
      meta: { isRowHeader: true, cellClassName: "min-w-56 max-w-80" }
    }),
    column.accessor((row) => sentenceCase(row.term.definition ?? ""), {
      id: "definition",
      header: "Definition",
      enableSorting: false,
      enableHiding: true,
      meta: { label: "Definition", cellClassName: "min-w-64" }
    }),
    column.accessor((row) => row.usedBy.length, {
      id: "usedBy",
      header: "Used by",
      cell: ({ row }) => {
        const { label, usedBy } = row.original
        const isOpen = openUsage === row.id
        return usedBy.length === 0 ? (
          <span className="text-muted-foreground">No rule</span>
        ) : (
          <Button
            variant="link"
            className="h-auto p-0 text-link"
            aria-expanded={isOpen}
            aria-label={`${sentenceCase(label)}: used by ${rulesText(usedBy.length)}`}
            onClick={() => onToggleUsage(row.id)}
          >
            {rulesText(usedBy.length)}
            <ChevronDownIcon aria-hidden className={cn("transition-transform", isOpen ? "rotate-180" : null)} />
          </Button>
        )
      },
      meta: { cellClassName: "whitespace-nowrap" }
    }),
    column.display({
      id: "review",
      header: () => <span className="sr-only">Review</span>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const { term, label } = row.original
        return (
          <ReviewMenu
            record={{ type: "term", key: term.key }}
            status={term.review.status}
            name={sentenceCase(label)}
            blockers={
              approval && term.review.status === "proposed"
                ? approvalBlockers(approval, { type: "term", key: term.key })
                : []
            }
          />
        )
      },
      meta: { cellClassName: "w-px whitespace-nowrap" }
    })
  ])
}
