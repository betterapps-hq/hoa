import type { Review } from "@/review/reviewModel"
import { workType } from "@/review/subjects"
import type * as T from "@/schema/types"
import { attentionOutcomes, outcomeOrder } from "../applicationDisplay"
import type { ReportRule } from "../applicationView"
import { rootEntityIds } from "../reviewContext"

// The rule matrix (application-review.md, UX, Rule matrix): every rule the review found something for against every
// entity it found something about. Rows are rules grouped by their main citation's provision; columns are the
// entities subject identification named, then the application itself; a cell is a finding, or null where the rule
// doesn't apply to the entity because its subject is another type.

type Entity = T.EvaluationRequest["entities"][number]

export type MatrixCell = { entity: string; finding: T.Finding | null }

export type MatrixRow = { ruleKey: T.RuleKey; title: string; cells: MatrixCell[] }

export type MatrixGroup = {
  /** The provision the rows' rules cite first; null for rules the rules file couldn't give. */
  provisionKey: T.ProvisionKey | null
  /** "Guidelines 5.4.2(i): Colors" */
  title: string
  rows: MatrixRow[]
}

export type ReviewMatrixModel = { columns: Entity[]; groups: MatrixGroup[] }

const compareKeys = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true })

export function reviewMatrix(
  review: Pick<Review, "request" | "findings">,
  rules: ReadonlyMap<T.RuleKey, Pick<ReportRule, "title" | "citations">>
): ReviewMatrixModel {
  // The application's own columns (the request, the lot, the community) come after the work's parts and the work; the
  // lot and the community only when a rule applies to them.
  const isRoot = (id: string) => rootEntityIds.includes(id)
  const withFindings = new Set(
    review.findings
      .filter(
        (finding) => finding.entity === "request" || !isRoot(finding.entity) || finding.outcome !== "not-applicable"
      )
      .map((finding) => finding.entity)
  )
  const entities = review.request.entities.filter((entity) => withFindings.has(entity.id))
  const columns = [
    ...entities.filter((entity) => !isRoot(entity.id) && entity.type !== workType),
    ...entities.filter((entity) => !isRoot(entity.id) && entity.type === workType),
    ...rootEntityIds.flatMap((id) => entities.filter((entity) => entity.id === id))
  ]
  const citationOf = (ruleKey: T.RuleKey) => rules.get(ruleKey)?.citations[0]
  const byRule = Map.groupBy(review.findings, (finding) => finding.ruleKey)
  const rows = [...byRule].map(([ruleKey, findings]): MatrixRow => ({
    ruleKey,
    title: rules.get(ruleKey)?.title ?? ruleKey,
    cells: columns.map((column) => ({
      entity: column.id,
      finding: findings.find((finding) => finding.entity === column.id) ?? null
    }))
  }))
  const groups = Map.groupBy(rows, (row) => citationOf(row.ruleKey)?.provisionKey ?? null)
  return {
    columns,
    groups: [...groups]
      .map(([provisionKey, grouped]): MatrixGroup => {
        const citation = grouped[0] ? citationOf(grouped[0].ruleKey) : undefined
        return {
          provisionKey,
          title: citation ? [citation.label, citation.heading].filter(Boolean).join(": ") : "Other rules",
          rows: grouped.toSorted((a, b) => compareKeys(a.ruleKey, b.ruleKey))
        }
      })
      .toSorted((a, b) =>
        a.provisionKey === null || b.provisionKey === null
          ? Number(a.provisionKey === null) - Number(b.provisionKey === null)
          : compareKeys(a.provisionKey, b.provisionKey)
      )
  }
}

export type MatrixFilter = {
  /** Hides rows whose findings ask nothing of anyone: met, exempt and not applicable. */
  isAttentionOnly: boolean
  /** Shows only rows with one of these outcomes; empty shows every row. */
  outcomes: readonly T.Outcome[]
}

const rowOutcomes = (row: MatrixRow) => row.cells.flatMap((cell) => (cell.finding ? [cell.finding.outcome] : []))

export function filterMatrix(model: ReviewMatrixModel, filter: MatrixFilter): MatrixGroup[] {
  const keeps = (row: MatrixRow) => {
    const outcomes = rowOutcomes(row)
    return (
      (!filter.isAttentionOnly || outcomes.some((outcome) => attentionOutcomes.has(outcome))) &&
      (filter.outcomes.length === 0 || outcomes.some((outcome) => filter.outcomes.includes(outcome)))
    )
  }
  return model.groups.flatMap((group) => {
    const rows = group.rows.filter(keeps)
    return rows.length > 0 ? [{ ...group, rows }] : []
  })
}

/** How many findings have each outcome, in the order people act on them. */
export function outcomeCounts(model: ReviewMatrixModel) {
  const all = model.groups.flatMap((group) => group.rows.flatMap(rowOutcomes))
  return outcomeOrder.flatMap((outcome) => {
    const count = all.filter((found) => found === outcome).length
    return count > 0 ? [{ outcome, count }] : []
  })
}

/** The narrow-screen layout: one card per entity, listing the findings about it in the shown rows. */
export function entityCards(model: ReviewMatrixModel, groups: readonly MatrixGroup[]) {
  return model.columns.map((entity) => {
    const findings = groups.flatMap((group) =>
      group.rows.flatMap((row) =>
        row.cells.flatMap((cell) => (cell.entity === entity.id && cell.finding ? [cell.finding] : []))
      )
    )
    return {
      entity,
      findings: findings.filter((finding) => finding.outcome !== "not-applicable"),
      notApplicable: findings.filter((finding) => finding.outcome === "not-applicable").length
    }
  })
}
