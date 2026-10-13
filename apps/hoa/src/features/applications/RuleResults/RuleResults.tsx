import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"
import { DataTable } from "@/components/DataTable/DataTable"
import { dataTableColumns } from "@/components/DataTable/DataTable.utils"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Finding, Outcome } from "@/schema/types"
import { cellLabels, outcomeOrder } from "../applicationDisplay"
import { EntityHeader } from "../EntityHeader/EntityHeader"
import { OutcomeChip } from "../OutcomeChip/OutcomeChip"
import { entityLabel, entityOf, ruleName, type ReviewContext } from "../reviewContext"
import { InlineRuleReference } from "../ReviewRuleReference/ReviewRuleReference"
import { resultCounts, ruleResults, type RuleResult } from "./RuleResults.utils"

export type RuleResultsProps = {
  context: ReviewContext
  /** Opens a result's finding, with what the review read for it. */
  onOpen: (finding: Finding) => void
}

const isOutcome = (value: unknown): value is Outcome => outcomeOrder.some((outcome) => outcome === value)

const column = dataTableColumns<RuleResult>()

/** The rule as its linked name, the part of the project it read, and the result, which opens the finding. */
function resultColumns(context: ReviewContext, onOpen: RuleResultsProps["onOpen"]) {
  return column.columns([
    column.accessor("title", {
      id: "rule",
      header: "Rule",
      cell: ({ row }) => (
        <span className="font-medium">
          <InlineRuleReference ruleKey={row.original.ruleKey} context={context} isStandalone />
        </span>
      ),
      meta: { isRowHeader: true, cellClassName: "py-2.5 whitespace-normal" }
    }),
    column.accessor((result) => entityLabel(context, result.finding.entity), {
      id: "part",
      header: "Part of the project",
      cell: ({ row }) => {
        const entity = entityOf(context, row.original.finding.entity)
        return entity ? <EntityHeader entity={entity} context={context} /> : row.original.finding.entity
      },
      meta: { cellClassName: "py-2.5 whitespace-normal" }
    }),
    column.accessor((result) => outcomeOrder.indexOf(result.finding.outcome), {
      id: "result",
      header: "Result",
      cell: ({ row }) => {
        const { finding } = row.original
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-1 py-0.5"
            aria-label={`${ruleName(context.rules, finding.ruleKey)}, ${entityLabel(context, finding.entity)}: ${cellLabels[finding.outcome]}`}
            onClick={() => onOpen(finding)}
          >
            <OutcomeChip outcome={finding.outcome} />
          </Button>
        )
      },
      meta: { cellClassName: "py-2.5" }
    })
  ])
}

/**
 * How each rule was checked: a row for each check that applies, the rule against the part of the project it read and
 * the result, worst first, filtered by result. The rules that apply to nothing in the project wait below, on demand.
 */
export function RuleResults({ context, onOpen }: RuleResultsProps) {
  const [outcomes, setOutcomes] = useState<Outcome[]>([])
  const { results, notApplying } = ruleResults(context.review, context.rules)
  const shown = outcomes.length === 0 ? results : results.filter((result) => outcomes.includes(result.finding.outcome))
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        Each rule the review checked, against the part of the project it read. Open a result to see what it read.
      </p>
      <DataTable
        data={shown}
        columns={resultColumns(context, onOpen)}
        getRowId={(result) => result.id}
        label="How each rule was checked"
        noun="results"
        pageSize={null}
        filterKey={outcomes.join(" ")}
        empty="Nothing matches."
        toolbar={
          <ToggleGroup
            multiple
            variant="outline"
            size="sm"
            aria-label="Show results"
            className="flex-wrap"
            value={outcomes}
            onValueChange={(value) => setOutcomes(value.filter(isOutcome))}
          >
            {resultCounts(results).map(({ outcome, count }) => (
              <ToggleGroupItem key={outcome} value={outcome}>
                {cellLabels[outcome]} <span className="text-muted-foreground">{count}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />
      {notApplying.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger
            render={<Button variant="ghost" size="sm" className="group/more -ml-2 text-muted-foreground" />}
          >
            {notApplying.length === 1
              ? "1 rule doesn’t apply to this project"
              : `${notApplying.length} rules don’t apply to this project`}
            <ChevronDownIcon className="transition-transform group-aria-expanded/more:rotate-180" aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="flex flex-col gap-1.5 pt-2 pl-1" aria-label="Rules that don’t apply">
              {notApplying.map((ruleKey) => (
                <li key={ruleKey}>
                  <InlineRuleReference ruleKey={ruleKey} context={context} isStandalone />
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}
