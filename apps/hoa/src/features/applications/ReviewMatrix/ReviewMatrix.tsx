import { useMediaQuery } from "@mantine/hooks"
import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Finding, Outcome } from "@/schema/types"
import { cellLabels, findingLabels, outcomeOrder, sentenceCase } from "../applicationDisplay"
import { EntityHeader } from "../EntityHeader/EntityHeader"
import { OutcomeChip } from "../OutcomeChip/OutcomeChip"
import { entityLabel, type ReviewContext } from "../reviewContext"
import { ReviewRuleReference } from "../ReviewRuleReference/ReviewRuleReference"
import {
  entityCards,
  filterMatrix,
  outcomeCounts,
  reviewMatrix,
  type MatrixGroup,
  type ReviewMatrixModel
} from "./ReviewMatrix.utils"

export type ReviewMatrixProps = {
  context: ReviewContext
  /** Opens a cell's finding, with what the review read for it. */
  onOpen: (finding: Finding) => void
}

/** An outcome in words: "n/a" said in full. */
const outcomeName = (outcome: Outcome) => (outcome === "not-applicable" ? findingLabels[outcome] : cellLabels[outcome])

type CellButtonProps = {
  finding: Finding
  context: ReviewContext
  onOpen: (finding: Finding) => void
}

/** A finding's chip; activating it opens the finding. */
function CellButton({ finding, context, onOpen }: CellButtonProps) {
  const title = context.rules.get(finding.ruleKey)?.title ?? finding.ruleKey
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto px-1 py-0.5"
      aria-label={`${title}, ${entityLabel(context, finding.entity)}: ${outcomeName(finding.outcome)}`}
      onClick={() => onOpen(finding)}
    >
      <OutcomeChip outcome={finding.outcome} />
    </Button>
  )
}

const isOutcome = (value: unknown): value is Outcome => outcomeOrder.some((outcome) => outcome === value)

/**
 * The whole review at a glance: every rule against every part of the project, each cell a finding's outcome that
 * opens the finding. Below 480 pixels it becomes one card per entity.
 */
export function ReviewMatrix({ context, onOpen }: ReviewMatrixProps) {
  const [isAttentionOnly, setIsAttentionOnly] = useState(false)
  const [outcomes, setOutcomes] = useState<Outcome[]>([])
  const isNarrow = useMediaQuery("(max-width: 479px)")
  const model = reviewMatrix(context.review, context.rules)
  const groups = filterMatrix(model, { isAttentionOnly, outcomes })
  const counts = outcomeCounts(model)
  const layout = isNarrow ? (
    <MatrixCards model={model} groups={groups} context={context} onOpen={onOpen} />
  ) : (
    <MatrixTable model={model} groups={groups} context={context} onOpen={onOpen} />
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        Every rule the review checked against each part of the project. Open a result to see what it read.
      </p>
      <div className="flex flex-col gap-3">
        <Field orientation="horizontal">
          <Checkbox
            id="matrix-attention"
            checked={isAttentionOnly}
            onCheckedChange={(checked) => setIsAttentionOnly(checked === true)}
          />
          <FieldLabel htmlFor="matrix-attention" className="font-normal">
            Only what needs attention
          </FieldLabel>
        </Field>
        <ToggleGroup
          multiple
          variant="outline"
          size="sm"
          aria-label="Show results"
          className="flex-wrap"
          value={outcomes}
          onValueChange={(value) => setOutcomes(value.filter(isOutcome))}
        >
          {counts.map(({ outcome, count }) => (
            <ToggleGroupItem key={outcome} value={outcome}>
              {outcomeName(outcome)} <span className="text-muted-foreground">{count}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {groups.length === 0 ? (
        <p className="rounded-lg border py-6 text-center text-sm text-muted-foreground">Nothing matches.</p>
      ) : (
        layout
      )}
    </div>
  )
}

type RuleGroupProps = { title: string; columnCount: number; children: ReactNode }

/** A provision's rules under its label. */
function RuleGroup({ title, columnCount, children }: RuleGroupProps) {
  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableHead
          scope="rowgroup"
          colSpan={columnCount + 1}
          className="border-b bg-muted/50 text-xs font-semibold text-muted-foreground"
        >
          {/* The cell spans every column, so its label is what stays in view while the columns scroll. */}
          <span className="sticky left-2 inline-block">{title}</span>
        </TableHead>
      </TableRow>
      {children}
    </>
  )
}

type LayoutProps = {
  model: ReviewMatrixModel
  groups: MatrixGroup[]
  context: ReviewContext
  onOpen: (finding: Finding) => void
}

/** Below 480 pixels: one card per entity, listing the rules with findings about it. */
function MatrixCards({ model, groups, context, onOpen }: LayoutProps) {
  return (
    <ul className="flex flex-col gap-3">
      {entityCards(model, groups).map(({ entity, findings, notApplicable }) => (
        <li key={entity.id} className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex flex-col items-start">
            <EntityHeader entity={entity} context={context} />
            <span className="text-xs text-muted-foreground">{sentenceCase(context.vocabulary.label(entity.type))}</span>
          </div>
          {findings.length > 0 ? (
            <ul className="flex flex-col divide-y">
              {findings.map((finding) => (
                <li key={finding.ruleKey} className="flex items-start justify-between gap-2 py-2 text-sm">
                  <ReviewRuleReference ruleKey={finding.ruleKey} context={context} />
                  <CellButton finding={finding} context={context} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          ) : null}
          {notApplicable > 0 ? (
            <p className="text-xs text-muted-foreground">
              {notApplicable === 1 ? "1 rule doesn't apply" : `${notApplicable} rules don't apply`}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** The rule column stays put while the entity columns scroll. */
function MatrixTable({ model, groups, context, onOpen }: LayoutProps) {
  return (
    <Table className="border-separate border-spacing-0">
      <caption className="sr-only">Rules against each part of the project</caption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="sticky left-0 z-10 min-w-48 border-b bg-background sm:min-w-64">Rule</TableHead>
          {model.columns.map((entity) => (
            <TableHead key={entity.id} className="max-w-44 border-b align-bottom whitespace-normal">
              <EntityHeader entity={entity} context={context} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <RuleGroup key={group.provisionKey ?? "other"} title={group.title} columnCount={model.columns.length}>
            {group.rows.map((row) => (
              <TableRow key={row.ruleKey}>
                <TableHead
                  scope="row"
                  className="sticky left-0 z-10 h-auto max-w-72 border-b bg-background py-2 align-top font-normal whitespace-normal"
                >
                  <ReviewRuleReference ruleKey={row.ruleKey} context={context} />
                </TableHead>
                {row.cells.map((cell) => (
                  <TableCell key={cell.entity} className="border-b">
                    {cell.finding ? (
                      <CellButton finding={cell.finding} context={context} onOpen={onOpen} />
                    ) : (
                      <span className="px-1 text-xs text-muted-foreground">
                        <span aria-hidden>n/a</span>
                        <span className="sr-only">{findingLabels["not-applicable"]}</span>
                      </span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </RuleGroup>
        ))}
      </TableBody>
    </Table>
  )
}
