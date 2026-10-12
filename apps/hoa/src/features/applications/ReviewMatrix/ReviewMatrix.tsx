import { useMediaQuery } from "@mantine/hooks"
import { useState } from "react"
import { DataTable } from "@/components/DataTable/DataTable"
import { dataTableColumns } from "@/components/DataTable/DataTable.utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { sentenceCase } from "@/lib/text"
import type { Finding, Outcome } from "@/schema/types"
import { cellLabels, findingLabels, outcomeOrder } from "../applicationDisplay"
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
  type MatrixRow,
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
                  <ReviewRuleReference
                    ruleKey={finding.ruleKey}
                    context={context}
                    title={
                      <span className="font-medium">
                        {sentenceCase(context.rules.get(finding.ruleKey)?.title ?? finding.ruleKey)}
                      </span>
                    }
                  />
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

/** A matrix row with the provision group it sits under. */
type GroupedRow = MatrixRow & { group: MatrixGroup }

/** The rule column stays put while the entity columns scroll; each provision's rules sit under its label. */
function MatrixTable({ model, groups, context, onOpen }: LayoutProps) {
  return (
    <DataTable
      data={groups.flatMap((group) => group.rows.map((row) => ({ ...row, group })))}
      columns={matrixColumns({ model, context, onOpen })}
      getRowId={(row) => row.ruleKey}
      label="Rules against each part of the project"
      noun="rules"
      pageSize={null}
      empty="Nothing matches."
      groupOf={(row) => ({ key: row.group.provisionKey ?? "other", title: row.group.title })}
    />
  )
}

const column = dataTableColumns<GroupedRow>()

/** The rule, then a column per entity whose cells open their findings; nothing sorts, since the groups are the order. */
function matrixColumns({ model, context, onOpen }: Omit<LayoutProps, "groups">) {
  return column.columns([
    column.accessor("title", {
      id: "rule",
      header: "Rule",
      enableSorting: false,
      cell: ({ row }) => (
        <ReviewRuleReference
          ruleKey={row.original.ruleKey}
          context={context}
          title={<span className="font-medium">{sentenceCase(row.original.title)}</span>}
        />
      ),
      meta: {
        isRowHeader: true,
        headerClassName: "sticky left-0 z-10 min-w-48 bg-background sm:min-w-64",
        cellClassName: "sticky left-0 z-10 max-w-72 bg-background py-2"
      }
    }),
    ...model.columns.map((entity, index) =>
      column.display({
        id: `entity:${entity.id}`,
        header: () => <EntityHeader entity={entity} context={context} />,
        enableSorting: false,
        cell: ({ row }) => {
          const finding = row.original.cells[index]?.finding
          return finding ? (
            <CellButton finding={finding} context={context} onOpen={onOpen} />
          ) : (
            <span className="px-1 text-xs text-muted-foreground">
              <span aria-hidden>n/a</span>
              <span className="sr-only">{findingLabels["not-applicable"]}</span>
            </span>
          )
        },
        meta: { headerClassName: "max-w-44 align-bottom whitespace-normal", cellClassName: "py-2" }
      })
    )
  ])
}
