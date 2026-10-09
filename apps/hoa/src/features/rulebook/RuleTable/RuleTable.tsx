import { CircleAlertIcon, SearchIcon } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { renderStatement } from "@/schema/statement"
import type * as T from "@/schema/types"
import { BulkApprove } from "../BulkApprove/BulkApprove"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { domainLabels, domains, reviewLabels, ruleKindLabels, ruleKinds } from "../ruleLabels"
import { RuleLink } from "../RuleLink/RuleLink"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import { filterRules, problemCount, requestTypesOf, type RuleFilters, type StatusFilter } from "./RuleTable.utils"

const pageSize = 50

const statusChoices: { value: StatusFilter; label: string }[] = [
  { value: "proposed", label: "To review" },
  { value: "problems", label: "With problems" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" }
]

const domainChoices = [
  { value: "all" as const, label: "All domains" },
  ...domains.map((domain) => ({ value: domain, label: domainLabels[domain] }))
]
const kindChoices = [
  { value: "all" as const, label: "All kinds" },
  ...ruleKinds.map((kind) => ({ value: kind, label: ruleKindLabels[kind] }))
]

/**
 * The rulebook's rules by domain (encoding.md, UX, Rules), filtered by domain, kind, request type and, in a draft,
 * review status. Each row shows the title, which opens the rule, its main citation and its statement in words.
 */
export function RuleTable() {
  const { records, vocabulary, issues, actions } = useRulebookWorkspace()
  const isDraft = actions !== null
  const [filters, setFilters] = useState<RuleFilters>(() => ({
    query: "",
    domain: "all",
    kind: "all",
    requestType: "all",
    status: isDraft && records.rules.some((rule) => rule.review.status === "proposed") ? "proposed" : "all"
  }))
  const [shownCount, setShownCount] = useState(pageSize)
  const statementOf = (rule: T.Rule) => renderStatement(rule.statement, (key, plural) => vocabulary.label(key, plural))
  const shown = filterRules(records.rules, filters, { statementOf, issues })
  const update = (change: Partial<RuleFilters>) => {
    setFilters((current) => ({ ...current, ...change }))
    setShownCount(pageSize)
  }
  const requestTypeChoices = [
    { value: "all", label: "All request types" },
    ...requestTypesOf(records.rules).map((key) => ({ value: key, label: vocabulary.label(key, true) }))
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search rules"
            placeholder="Search titles, statements and keys"
            className="pl-8"
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
          />
        </div>
        <ChoiceSelect
          label="Domain"
          value={filters.domain}
          choices={domainChoices}
          onChange={(domain) => update({ domain })}
        />
        <ChoiceSelect label="Kind" value={filters.kind} choices={kindChoices} onChange={(kind) => update({ kind })} />
        <ChoiceSelect
          label="Request type"
          value={filters.requestType}
          choices={requestTypeChoices}
          onChange={(requestType) => update({ requestType })}
        />
      </div>
      {isDraft ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Review status"
            className="flex-wrap"
            value={[filters.status]}
            onValueChange={(value) => {
              const status = statusChoices.find((choice) => choice.value === value[0])
              if (status) {
                update({ status: status.value })
              }
            }}
          >
            {statusChoices.map((choice) => (
              <ToggleGroupItem key={choice.value} value={choice.value}>
                {choice.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {filters.status === "proposed" ? (
            <BulkApprove refs={shown.map((rule) => ({ type: "rule" as const, key: rule.key }))} noun="rules" />
          ) : null}
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing {Math.min(shown.length, shownCount)} of {shown.length} matching rules, {records.rules.length} in all
      </p>
      <div className="rounded-lg border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead className="hidden w-36 md:table-cell">Domain</TableHead>
              {isDraft ? <TableHead className="hidden w-36 sm:table-cell">Status</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center whitespace-normal text-muted-foreground">
                  No rules match.
                </TableCell>
              </TableRow>
            ) : (
              shown.slice(0, shownCount).map((rule) => {
                const problems = problemCount(rule, issues.get(rule.key))
                const status = (
                  <span className="flex items-center gap-1.5">
                    <Badge variant={rule.review.status === "rejected" ? "destructive" : "outline"}>
                      {reviewLabels[rule.review.status]}
                    </Badge>
                    {problems > 0 ? (
                      <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                        <CircleAlertIcon className="size-4" aria-hidden />
                        <span className="sr-only">Problems:</span>
                        {problems}
                      </span>
                    ) : null}
                  </span>
                )
                return (
                  <TableRow key={rule.key}>
                    <TableCell className="align-top whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <RuleLink ruleKey={rule.key} />
                        <p className="line-clamp-2 text-muted-foreground">{statementOf(rule)}</p>
                        {isDraft ? <div className="sm:hidden">{status}</div> : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden align-top md:table-cell">{domainLabels[rule.domain]}</TableCell>
                    {isDraft ? <TableCell className="hidden align-top sm:table-cell">{status}</TableCell> : null}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      {shown.length > shownCount ? (
        <Button variant="outline" className="w-fit" onClick={() => setShownCount((count) => count + pageSize)}>
          Show {Math.min(pageSize, shown.length - shownCount)} more
        </Button>
      ) : null}
    </div>
  )
}
