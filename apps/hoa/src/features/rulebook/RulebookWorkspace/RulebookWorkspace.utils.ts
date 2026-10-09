import type { RulebookRecords } from "@/rulebook/assemble"
import { coverageOf } from "@/rulebook/coverage"
import { approvalContext } from "@/rulebook/review"
import type * as T from "@/schema/types"
import type { RulebookIssue } from "@/schema/validate"
import { createVocabulary } from "@/schema/vocabulary"
import { citationIndex } from "../rulebookRecords"
import type { RulebookActions, RulebookSource, RulebookWorkspaceValue } from "../useRulebookWorkspace"

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
  return {
    records,
    vocabulary: approval?.vocabulary ?? createVocabulary(records.terms),
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
