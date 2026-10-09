import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import type { RulebookRecords } from "@/rulebook/assemble"
import { approvalContext, coverageOf } from "@/rulebook/review"
import type * as T from "@/schema/types"
import type { RulebookIssue } from "@/schema/validate"
import { createVocabulary } from "@/schema/vocabulary"
import { citationIndex } from "../rulebookRecords"
import type { RulebookActions, RulebookWorkspaceValue } from "../useRulebookWorkspace"

const noIssues = new Map<string, RulebookIssue[]>()

/** Everything the rules UX reads about a rulebook; a draft (with actions) is checked for what blocks approval. */
export function workspaceOf(
  records: RulebookRecords,
  {
    source,
    actions,
    openRule
  }: { source: CitationSource; actions: RulebookActions | null; openRule: (key: T.RuleKey) => void }
): RulebookWorkspaceValue {
  const approval = actions ? approvalContext(records) : null
  return {
    records,
    vocabulary: approval?.vocabulary ?? createVocabulary(records.terms),
    citations: citationIndex(records),
    coverage: coverageOf(records),
    issues: approval?.issues ?? noIssues,
    approval,
    source,
    actions,
    openRule
  }
}

/** How much each tab asks of a reviewer: records to review, uncovered provisions, open questions. */
export function workToDo(workspace: RulebookWorkspaceValue) {
  const { records, coverage, actions } = workspace
  const toReview = (items: { review: T.Review }[]) => items.filter((item) => item.review.status === "proposed").length
  if (!actions) {
    return { rules: 0, vocabulary: 0, coverage: 0, questions: 0, settings: 0 }
  }
  return {
    rules: toReview(records.rules),
    vocabulary: toReview(records.terms),
    coverage:
      coverage.uncovered.length +
      records.provisions.filter((provision) => provision.noRule?.review.status === "proposed").length,
    questions: records.questions.filter((question) => question.answer === null).length,
    settings: records.settings.review.status === "proposed" ? 1 : 0
  }
}
