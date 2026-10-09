import { CheckIcon, SearchIcon, XIcon } from "lucide-react"
import { Fragment, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type * as T from "@/schema/types"
import { reviewRecord } from "../attempt"
import { BulkApprove } from "../BulkApprove/BulkApprove"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { reviewLabels } from "../ruleLabels"
import { RuleLink } from "../RuleLink/RuleLink"
import { TermChip } from "../TermChip/TermChip"
import { describeTermKind, termKindLabels } from "../TermChip/TermChip.utils"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import { filterTerms, termUsage, type TermFilters } from "./VocabularyTab.utils"

const pageSize = 50
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
 * The organization's terms (encoding.md, UX, Vocabulary): labels, kind, definition, where each is used and its review.
 * Approving a term is separate from approving rules; a rule waits for the terms it reads.
 */
export function VocabularyTab() {
  const { records, vocabulary, actions } = useRulebookWorkspace()
  const [filters, setFilters] = useState<TermFilters>(() => ({
    query: "",
    kind: "all",
    status: actions && records.terms.some((term) => term.review.status === "proposed") ? "proposed" : "all"
  }))
  const [shownCount, setShownCount] = useState(pageSize)
  const [openUsage, setOpenUsage] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const usage = termUsage(records.rules)
  const shown = filterTerms(records.terms, filters, vocabulary)
  const update = (change: Partial<TermFilters>) => {
    setFilters((current) => ({ ...current, ...change }))
    setShownCount(pageSize)
  }
  const review = async (key: string, status: T.Review["status"]) => {
    if (!actions) {
      return
    }
    setBusyKey(key)
    await reviewRecord(actions, { type: "term", key }, status)
    setBusyKey(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search terms"
            placeholder="Search labels, definitions and keys"
            className="pl-8"
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
          />
        </div>
        <ChoiceSelect label="Kind" value={filters.kind} choices={kindChoices} onChange={(kind) => update({ kind })} />
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Review status"
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
            <BulkApprove refs={shown.map((term) => ({ type: "term" as const, key: term.key }))} noun="terms" />
          ) : null}
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing {Math.min(shown.length, shownCount)} of {shown.length} matching terms, {records.terms.length} in all
      </p>
      <div className="rounded-lg border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>Term</TableHead>
              <TableHead className="hidden w-28 sm:table-cell">Used by</TableHead>
              {actions ? <TableHead className="w-28 sm:w-48">Review</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center whitespace-normal text-muted-foreground">
                  No terms match.
                </TableCell>
              </TableRow>
            ) : null}
            {shown.slice(0, shownCount).map((term) => {
              const users = usage.get(term.key) ?? []
              const label = vocabulary.label(term.key)
              const usedBy = (
                <Button
                  variant="link"
                  className="h-auto p-0 text-link"
                  aria-expanded={openUsage === term.key}
                  aria-label={`${label}: used by ${users.length} ${users.length === 1 ? "rule" : "rules"}`}
                  disabled={users.length === 0}
                  onClick={() => setOpenUsage(openUsage === term.key ? null : term.key)}
                >
                  {users.length} {users.length === 1 ? "rule" : "rules"}
                </Button>
              )
              return (
                <Fragment key={term.key}>
                  <TableRow>
                    <TableCell className="align-top whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <TermChip termKey={term.key} vocabulary={vocabulary} />
                          <code className="text-xs break-all text-muted-foreground">{term.key}</code>
                        </span>
                        <span className="text-muted-foreground">{describeTermKind(term, vocabulary)}</span>
                        {term.definition ? <span>{term.definition}</span> : null}
                        <span className="sm:hidden">Used by {usedBy}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden align-top sm:table-cell">{usedBy}</TableCell>
                    {actions ? (
                      <TableCell className="align-top whitespace-normal">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={term.review.status === "rejected" ? "destructive" : "outline"}>
                            {reviewLabels[term.review.status]}
                          </Badge>
                          {term.review.status === "approved" ? null : (
                            <Button
                              size="icon-sm"
                              variant="outline"
                              aria-label={`Approve ${label}`}
                              disabled={busyKey === term.key}
                              onClick={() => void review(term.key, "approved")}
                            >
                              <CheckIcon />
                            </Button>
                          )}
                          {term.review.status === "rejected" ? null : (
                            <Button
                              size="icon-sm"
                              variant="outline"
                              aria-label={`Reject ${label}`}
                              disabled={busyKey === term.key}
                              onClick={() => void review(term.key, "rejected")}
                            >
                              <XIcon />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                  {openUsage === term.key ? (
                    <TableRow>
                      <TableCell colSpan={3} className="bg-muted/30 whitespace-normal">
                        <ul className="flex flex-col gap-1.5" aria-label={`Rules using ${label}`}>
                          {users.map((key) => (
                            <li key={key}>
                              <RuleLink ruleKey={key} />
                            </li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              )
            })}
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
