import type { RulebookRecords } from "@/rulebook/assemble"
import { coverageOf, type Coverage } from "@/rulebook/coverage"
import { approvalContext, isBlocking } from "@/rulebook/review"
import { pickableTerms } from "@/rulebook/ruleTerms"
import { mergeTargets } from "@/rulebook/termEdits"
import type * as T from "@/schema/types"
import type { RulebookIssue } from "@/schema/validate"
import { createVocabulary } from "@/schema/vocabulary"
import { citationIndex } from "../rulebookRecords"
import type { RulebookActions, RulebookSource, RulebookWorkspaceValue } from "../useRulebookWorkspace"
import { termSubjects, termUsage } from "../VocabularyTab/VocabularyTab.utils"

const noIssues = new Map<string, RulebookIssue[]>()

export type WorkspaceTab = "changes" | "rules" | "terms" | "coverage" | "questions" | "settings"

/**
 * The tab shown and the filter it opens with, such as rules "to review" from a to-do item; `request` counts the
 * requests, so asking for the same view again starts it afresh.
 */
export type WorkspaceView = { tab: WorkspaceTab; filter: string | null; request: number }

/** The tabs a reader has: a homeowner the rules and their terms; an administrator everything there's something in. */
export function workspaceTabs(
  records: Pick<RulebookRecords, "questions">,
  { audience, hasChanges }: { audience: "administrator" | "member"; hasChanges: boolean }
): WorkspaceTab[] {
  if (audience === "member") {
    return ["rules", "terms"]
  }
  return [
    ...(hasChanges ? (["changes"] as const) : []),
    "rules",
    "terms",
    "coverage",
    ...(records.questions.length > 0 ? (["questions"] as const) : []),
    "settings"
  ]
}

const isProposed = (record: { review: T.Review }) => record.review.status === "proposed"

/**
 * What's left to decide in each tab of a draft (encoding.md, UX, Draft review), so the tabs are its to-do list: rules
 * to review and approved rules with open problems, terms to review, provisions with a reason to review or nothing
 * covering them, questions to answer, and the settings.
 */
export function tabWork(records: RulebookRecords, coverage: Pick<Coverage, "uncovered">): Record<WorkspaceTab, number> {
  const withProblems = records.rules.filter(
    (rule) =>
      rule.review.status === "approved" &&
      rule.issues.some((issue) => issue.resolution === null && isBlocking(issue.code))
  )
  const reasons = records.provisions.filter((provision) => provision.noRule?.review.status === "proposed")
  return {
    changes: 0,
    rules: records.rules.filter(isProposed).length + withProblems.length,
    terms: records.terms.filter(isProposed).length,
    coverage: reasons.length + coverage.uncovered.length,
    questions: records.questions.filter((question) => question.answer === null).length,
    settings: isProposed(records.settings) ? 1 : 0
  }
}

/** Everything the rules UX reads about a rulebook; a draft (with actions) is checked for what blocks approval. */
export function workspaceOf(
  records: RulebookRecords,
  {
    source,
    actions,
    openRule,
    audience = "administrator"
  }: {
    source: RulebookSource
    actions: RulebookActions | null
    openRule: (key: T.RuleKey) => void
    audience?: RulebookWorkspaceValue["audience"]
  }
): RulebookWorkspaceValue {
  const approval = actions ? approvalContext(records) : null
  const vocabulary = approval?.vocabulary ?? createVocabulary(records.terms)
  const usage = termUsage(records.rules)
  return {
    records,
    vocabulary,
    mergeTargets: mergeTargets(vocabulary, pickableTerms(records.terms)),
    termUsage: usage,
    termSubjects: termSubjects(records.terms, { vocabulary, usage }),
    citations: citationIndex(records),
    coverage: coverageOf(records),
    issues: approval?.issues ?? noIssues,
    approval,
    source,
    actions,
    openRule,
    audience
  }
}
