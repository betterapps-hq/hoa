import { CircleAlertIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react"
import { useState } from "react"
import { DataTable } from "@/components/DataTable/DataTable"
import { dataTableColumns } from "@/components/DataTable/DataTable.utils"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useSearch } from "@/hooks/useSearch"
import { sentenceCase } from "@/lib/text"
import { approvalBlockers } from "@/rulebook/review"
import { renderStatement } from "@/schema/statement"
import type * as T from "@/schema/types"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { ReviewMenu } from "../ReviewMenu/ReviewMenu"
import { domainLabels, domains, ruleKindLabels, ruleKinds } from "../ruleLabels"
import { RuleLink } from "../RuleLink/RuleLink"
import { useRulebookWorkspace, type RulebookWorkspaceValue } from "../useRulebookWorkspace"
import {
  defaultFilters,
  filterRules,
  narrowingCount,
  problemCount,
  requestTypesOf,
  ruleSearchSetup,
  statusFilterOf,
  type RuleFilters,
  type StatusFilter
} from "./RuleTable.utils"

const statusChoices: { value: StatusFilter; label: string }[] = [
  { value: "proposed", label: "To review" },
  { value: "problems", label: "With problems" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" }
]
const statusPhrases: Record<StatusFilter, string> = {
  proposed: "to review",
  problems: "with problems",
  approved: "approved",
  rejected: "rejected",
  all: ""
}
const domainChoices = [
  { value: "all" as const, label: "All areas" },
  ...domains.map((domain) => ({ value: domain, label: domainLabels[domain] }))
]
const kindChoices = [
  { value: "all" as const, label: "All kinds" },
  ...ruleKinds.map((kind) => ({ value: kind, label: ruleKindLabels[kind] }))
]

const column = dataTableColumns<T.Rule>()

export type RuleTableProps = {
  /** The review status it opens with, such as "proposed" from a to-do link. */
  initialStatus?: string | null
}

/**
 * The rulebook's rules (encoding.md, UX, Rules), in the documents' order, a page at a time: each with its title, which
 * opens it, its main citation and its statement in words; in a draft, its review. Words narrow the table at once; the
 * other filters wait behind "Filters", and the kind and area columns behind "Columns".
 */
export function RuleTable({ initialStatus = null }: RuleTableProps) {
  const { records, vocabulary, issues, approval, actions } = useRulebookWorkspace()
  const isDraft = actions !== null
  const defaultStatus: StatusFilter =
    isDraft && records.rules.some((rule) => rule.review.status === "proposed") ? "proposed" : "all"
  const [filters, setFilters] = useState<RuleFilters>(() =>
    defaultFilters((isDraft ? statusFilterOf(initialStatus) : null) ?? defaultStatus)
  )
  const statementOf = (rule: T.Rule) => renderStatement(rule.statement, (key, plural) => vocabulary.label(key, plural))
  const search = useSearch(records.rules, ruleSearchSetup(statementOf))
  const filtered = filterRules(records.rules, filters, issues)
  const update = (change: Partial<RuleFilters>) => setFilters((existing) => ({ ...existing, ...change }))
  const requestTypeChoices = [
    { value: "all", label: "All request types" },
    ...requestTypesOf(records.rules).map((key) => ({ value: key, label: sentenceCase(vocabulary.label(key, true)) }))
  ]
  const narrowing = narrowingCount(filters)
  const isFiltered = narrowing > 0 || filters.query.trim() !== "" || filters.status !== defaultStatus
  const phrase = statusPhrases[filters.status]

  const columns = ruleColumns({ issues, approval, statementOf })

  return (
    <DataTable
      data={filtered}
      columns={isDraft ? columns : columns.filter((item) => item.id !== "review")}
      getRowId={(rule) => rule.key}
      label="Rules"
      noun="rules"
      search={{ query: filters.query, ids: search.ids }}
      filterKey={[filters.status, filters.kind, filters.domain, filters.requestType].join(" ")}
      initialColumnVisibility={{ kind: false, area: false }}
      toolbar={
        <>
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search rules"
              placeholder="Search the rules"
              className="pl-8"
              value={filters.query}
              onChange={(event) => update({ query: event.target.value })}
            />
          </div>
          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>
              <SlidersHorizontalIcon />
              Filters
              {narrowing > 0 || (isDraft && filters.status !== defaultStatus) ? (
                <span className="sr-only"> (some are set)</span>
              ) : null}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <FieldGroup className="gap-4">
                {isDraft ? (
                  <Field>
                    <FieldLabel htmlFor="rule-filter-status">Review</FieldLabel>
                    <ChoiceSelect
                      id="rule-filter-status"
                      className="w-full"
                      value={filters.status}
                      choices={statusChoices}
                      onChange={(status) => update({ status })}
                    />
                  </Field>
                ) : null}
                <Field>
                  <FieldLabel htmlFor="rule-filter-kind">Kind</FieldLabel>
                  <ChoiceSelect
                    id="rule-filter-kind"
                    className="w-full"
                    value={filters.kind}
                    choices={kindChoices}
                    onChange={(kind) => update({ kind })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rule-filter-domain">Area</FieldLabel>
                  <ChoiceSelect
                    id="rule-filter-domain"
                    className="w-full"
                    value={filters.domain}
                    choices={domainChoices}
                    onChange={(domain) => update({ domain })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rule-filter-request">Request type</FieldLabel>
                  <ChoiceSelect
                    id="rule-filter-request"
                    className="w-full"
                    value={filters.requestType}
                    choices={requestTypeChoices}
                    onChange={(requestType) => update({ requestType })}
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
            {shown.length === records.rules.length
              ? `${records.rules.length} rules${phrase ? `, all ${phrase}` : ""}`
              : `${shown.length} of ${records.rules.length} rules${phrase ? ` ${phrase}` : ""}`}
            {isFiltered ? (
              <Button
                variant="link"
                size="sm"
                className="ml-2 h-auto p-0 text-link"
                onClick={() => setFilters(defaultFilters(defaultStatus))}
              >
                Clear filters
              </Button>
            ) : null}
          </p>
        </div>
      )}
      empty={
        filters.status === "proposed" && !filters.query && narrowing === 0
          ? "Every rule is reviewed."
          : "No rules match."
      }
    />
  )
}

type RuleColumnsInput = Pick<RulebookWorkspaceValue, "issues" | "approval"> & { statementOf: (rule: T.Rule) => string }

/** The rules table's columns: the rule, its kind and area (hidden until asked for), and its review. */
function ruleColumns({ issues, approval, statementOf }: RuleColumnsInput) {
  return column.columns([
    column.accessor("title", {
      id: "rule",
      header: "Rule",
      sortFn: "text",
      cell: ({ row }) => {
        const rule = row.original
        const problems = problemCount(rule, issues.get(rule.key))
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <RuleLink ruleKey={rule.key} />
            <p className="line-clamp-2 text-muted-foreground">{statementOf(rule)}</p>
            {problems > 0 ? (
              <p className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <CircleAlertIcon className="size-4" aria-hidden />
                {problems === 1 ? "A problem to fix" : `${problems} problems to fix`}
              </p>
            ) : null}
          </div>
        )
      },
      meta: { isRowHeader: true, cellClassName: "min-w-64 w-full" }
    }),
    column.accessor((rule) => ruleKindLabels[rule.kind], {
      id: "kind",
      header: "Kind",
      enableHiding: true,
      meta: { label: "Kind", cellClassName: "whitespace-nowrap text-muted-foreground" }
    }),
    column.accessor((rule) => domainLabels[rule.domain], {
      id: "area",
      header: "Area",
      enableHiding: true,
      meta: { label: "Area", cellClassName: "whitespace-nowrap text-muted-foreground" }
    }),
    column.display({
      id: "review",
      header: () => <span className="sr-only">Review</span>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const rule = row.original
        return (
          <ReviewMenu
            record={{ type: "rule", key: rule.key }}
            status={rule.review.status}
            name={sentenceCase(rule.title)}
            blockers={
              approval && rule.review.status === "proposed"
                ? approvalBlockers(approval, { type: "rule", key: rule.key })
                : []
            }
          />
        )
      },
      meta: { cellClassName: "w-px whitespace-nowrap" }
    })
  ])
}
