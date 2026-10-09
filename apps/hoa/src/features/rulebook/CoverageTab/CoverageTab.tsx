import { CheckIcon, SearchIcon } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type * as T from "@/schema/types"
import { attempt, reviewRecord } from "../attempt"
import { BulkApprove } from "../BulkApprove/BulkApprove"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { ProvisionReference } from "../ProvisionReference/ProvisionReference"
import { citedProvision } from "../rulebookRecords"
import { noRuleReasonLabels, reviewLabels } from "../ruleLabels"
import { RuleLink } from "../RuleLink/RuleLink"
import { TermChip } from "../TermChip/TermChip"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import { filterProvisions, isCited, type CoverageFilter } from "./CoverageTab.utils"

const pageSize = 50
const reasons: T.NoRule["reason"][] = ["heading", "recital", "reserved", "explanatory", "duplicate", "not-evaluated"]
const reasonChoices = reasons.map((reason) => ({ value: reason, label: noRuleReasonLabels[reason] }))
const filterChoices: { value: CoverageFilter; label: string }[] = [
  { value: "uncovered", label: "Uncovered" },
  { value: "to-review", label: "Reasons to review" },
  { value: "all", label: "All" }
]

/**
 * Every provision of every document (encoding.md, UX, Coverage), with the rules, terms and settings citing it, or its
 * reason for having no rule; uncovered provisions first, and in a draft a reason can be given or approved.
 */
export function CoverageTab() {
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
      <p className="text-sm text-muted-foreground">
        {records.provisions.length} provisions: {coverage.uncovered.length} uncovered
        {actions ? `, ${reasonsToReview.length} reasons for having no rule to review` : ""}.
      </p>
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
        <ul className="flex flex-col gap-2">
          {shown.slice(0, shownCount).map((provision) => (
            <li key={provision.key}>
              <ProvisionCoverageItem provision={provision} />
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

/** One provision: what covers it, or its reason for having no rule, and in a draft a way to give or change one. */
function ProvisionCoverageItem({ provision }: { provision: T.Provision }) {
  const { coverage, citations, vocabulary, source, actions } = useRulebookWorkspace()
  const [isEditing, setIsEditing] = useState(false)
  const [reason, setReason] = useState<T.NoRule["reason"]>(provision.noRule?.reason ?? "explanatory")
  const [note, setNote] = useState(provision.noRule?.note ?? "")
  const [isBusy, setIsBusy] = useState(false)
  const cited = coverage.byProvision.get(provision.key)
  const reference = citedProvision(citations, { provisionKey: provision.key, highlight: null, region: null })
  const isUncovered = provision.noRule === null && !isCited(cited)
  const fieldId = `reason-${provision.key.replaceAll(/\W+/g, "-")}`

  const setNoRule = async (noRule: { reason: T.NoRule["reason"]; note: string | null } | null) => {
    if (!actions) {
      return
    }
    setIsBusy(true)
    const done = await attempt(async () => {
      await actions.setNoRule(provision.key, noRule)
      return true
    }, "The reason wasn't saved.")
    setIsBusy(false)
    if (done) {
      setIsEditing(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <ProvisionReference citation={reference} source={source} />
        {provision.heading ? <span className="font-medium">{provision.heading}</span> : null}
        {isUncovered ? <Badge variant="destructive">Uncovered</Badge> : null}
      </div>
      <p className="line-clamp-3 text-muted-foreground">{provision.text}</p>
      {cited && isCited(cited) ? (
        <div className="flex flex-col gap-1.5">
          {cited.rules.length > 0 ? (
            <ul className="flex flex-col gap-1" aria-label={`Rules citing ${reference.label}`}>
              {cited.rules.map((key) => (
                <li key={key}>
                  <RuleLink ruleKey={key} />
                </li>
              ))}
            </ul>
          ) : null}
          {cited.terms.length > 0 ? (
            <p className="flex flex-wrap gap-x-2">
              <span className="text-muted-foreground">Defines</span>
              {cited.terms.map((key) => (
                <TermChip key={key} termKey={key} vocabulary={vocabulary} />
              ))}
            </p>
          ) : null}
          {cited.settings ? <p className="text-muted-foreground">The settings cite it.</p> : null}
          {cited.questions.length > 0 ? <p className="text-muted-foreground">A question cites it.</p> : null}
        </div>
      ) : null}
      {provision.noRule ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>No rule: {noRuleReasonLabels[provision.noRule.reason]}</span>
          <Badge variant="outline">{reviewLabels[provision.noRule.review.status]}</Badge>
          {provision.noRule.note ? <span className="text-muted-foreground">{provision.noRule.note}</span> : null}
        </div>
      ) : null}
      {actions && !isEditing ? (
        <div className="flex flex-wrap gap-2">
          {provision.noRule?.review.status === "proposed" ? (
            <Button
              size="sm"
              disabled={isBusy}
              onClick={() => {
                setIsBusy(true)
                void reviewRecord(actions, { type: "provision", key: provision.key }, "approved").finally(() =>
                  setIsBusy(false)
                )
              }}
            >
              <CheckIcon />
              Approve the reason
            </Button>
          ) : null}
          {provision.noRule || isUncovered ? (
            <Button size="sm" variant="outline" disabled={isBusy} onClick={() => setIsEditing(true)}>
              {provision.noRule ? "Change the reason" : "Give a reason for having no rule"}
            </Button>
          ) : null}
          {provision.noRule ? (
            <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => void setNoRule(null)}>
              Remove the reason
            </Button>
          ) : null}
        </div>
      ) : null}
      {isEditing ? (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={fieldId}>Reason</FieldLabel>
              <ChoiceSelect id={fieldId} value={reason} choices={reasonChoices} onChange={setReason} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-note`}>Note</FieldLabel>
              <Input id={`${fieldId}-note`} value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={isBusy} onClick={() => void setNoRule({ reason, note: note.trim() || null })}>
              Save the reason
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
