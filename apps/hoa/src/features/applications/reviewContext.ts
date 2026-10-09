import type { ApplicationFile } from "@/applications/application"
import type { ActionItem, Review } from "@/review/reviewModel"
import type * as T from "@/schema/types"
import { createVocabulary, type Vocabulary } from "@/schema/vocabulary"
import type { CitationSource } from "../documents/DocumentViewer/DocumentViewer"
import type { EntityEvidence } from "./applications.functions"
import type { ReportRule } from "./applicationView"

// Everything the review screens read besides their own props: the review, its rules and terms, the packet's files,
// and who is reading. Built once per page from the application view.

export type ReviewAudience = "homeowner" | "committee"

export type ReviewContext = {
  review: Review
  rules: ReadonlyMap<T.RuleKey, ReportRule>
  vocabulary: Vocabulary
  files: readonly ApplicationFile[]
  /** What identification read to name each entity. */
  entityEvidence: ReadonlyMap<string, readonly T.Evidence[]>
  /** The committee reads the assessment and the rules behind its decisions; the homeowner reads the feedback. */
  audience: ReviewAudience
  /** The governing documents' pages, for showing a citation where it is. */
  source?: CitationSource
  /** A packet photo's URL, for thumbnails. */
  loadImage?: (fileId: string) => Promise<string>
}

export type ReviewContextInput = Omit<ReviewContext, "rules" | "vocabulary" | "entityEvidence"> & {
  rules: readonly ReportRule[]
  terms: readonly T.Term[]
  entityEvidence: readonly EntityEvidence[]
}

export function createReviewContext({ rules, terms, entityEvidence, ...rest }: ReviewContextInput): ReviewContext {
  return {
    ...rest,
    rules: new Map(rules.map((rule) => [rule.key, rule])),
    vocabulary: createVocabulary([...terms]),
    entityEvidence: new Map(entityEvidence.map((item) => [item.entity, item.evidence]))
  }
}

/** The entities every request has: the application itself, the lot and the community. */
export const rootEntityIds: readonly string[] = ["request", "lot", "community"]

export const entityOf = (context: Pick<ReviewContext, "review">, id: string) =>
  context.review.request.entities.find((entity) => entity.id === id)

/** An entity the review identified, by its label. */
export const entityLabel = (context: Pick<ReviewContext, "review">, id: string) => entityOf(context, id)?.label ?? id

/** The file a piece of evidence cites; models may name a file by its id or its name. */
export const evidenceFile = (context: Pick<ReviewContext, "files">, fileId: string) =>
  context.files.find((file) => file.id === fileId || file.fileName === fileId)

/** The outcome whose findings each action list gathers. */
export const actionOutcomes = {
  changes: "not-met",
  missingInformation: "missing-information",
  committeeDecisions: "committee",
  suggestions: "advisory"
} as const satisfies Record<string, T.Outcome>

export type ActionListKey = keyof typeof actionOutcomes

const actionListKeys: readonly ActionListKey[] = ["changes", "missingInformation", "committeeDecisions", "suggestions"]

/** The element id of an action item, so a finding can link to it. */
export const actionItemId = (item: Pick<ActionItem, "id">) => `action-${item.id}`

/** The action item that covers a finding, with the list it's in. */
export function actionItemFor(review: Review, finding: Pick<T.Finding, "ruleKey" | "entity" | "outcome">) {
  const key = actionListKeys.find((found) => actionOutcomes[found] === finding.outcome)
  const item = key
    ? review[key].find((found) => found.ruleKey === finding.ruleKey && found.entities.includes(finding.entity))
    : undefined
  return key && item ? { item, key } : null
}

/** The findings an action item gathers, one per entity it covers. */
export function itemFindings(review: Review, key: ActionListKey, item: ActionItem) {
  return item.entities.flatMap((entity) => {
    const finding = review.findings.find(
      (found) => found.ruleKey === item.ruleKey && found.entity === entity && found.outcome === actionOutcomes[key]
    )
    return finding ? [finding] : []
  })
}
