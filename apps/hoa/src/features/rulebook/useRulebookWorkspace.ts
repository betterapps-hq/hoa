import { createContext, useContext } from "react"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import type { RulebookRecords } from "@/rulebook/assemble"
import type { Coverage, SourceText } from "@/rulebook/coverage"
import type { ApprovalContext, RecordRef } from "@/rulebook/review"
import type * as T from "@/schema/types"
import type { RulebookIssue } from "@/schema/validate"
import type { Vocabulary } from "@/schema/vocabulary"
import type { RuleDraft } from "@/schema/zod"
import type { CitationIndex } from "./rulebookRecords"
import type { ReviewResult } from "./rulebookReview.functions"

/** The pages citations point into, and their text outside any provision, which the coverage tab reads. */
export type RulebookSource = CitationSource & { loadSourceText: () => Promise<SourceText[]> }

/** What an administrator can do to a draft; every action reloads the rulebook when it's done. */
export type RulebookActions = {
  review: (refs: RecordRef[], status: T.Review["status"], note: string | null) => Promise<ReviewResult>
  resolveIssue: (ref: Exclude<RecordRef, { type: "provision" }>, index: number, note: string) => Promise<void>
  saveRule: (rule: RuleDraft) => Promise<RulebookIssue[]>
  answerQuestion: (questionId: T.Id, option: number, text: string | null) => Promise<Omit<ReviewResult, "updated">>
  setNoRule: (
    provisionKey: T.ProvisionKey,
    noRule: { reason: T.NoRule["reason"]; note: string | null } | null
  ) => Promise<void>
  saveSettings: (change: {
    clauses: Partial<T.Settings["clauses"]>
    policy: T.Settings["policy"] | null
  }) => Promise<RulebookIssue[]>
}

/** One rulebook as the rules UX shows it: the draft, editable, or the published one, read-only. */
export type RulebookWorkspaceValue = {
  records: RulebookRecords
  vocabulary: Vocabulary
  citations: CitationIndex
  coverage: Coverage
  /** Problems validation finds, by record key: a rule's, a term's, a provision's, or "settings". */
  issues: Map<string, RulebookIssue[]>
  /** Why records can't be approved; null for a read-only rulebook. */
  approval: ApprovalContext | null
  source: RulebookSource
  actions: RulebookActions | null
  /** Opens a rule's card. */
  openRule: (key: T.RuleKey) => void
  /** Who's reading: an administrator sees how rules are encoded; a member sees what they say and where from. */
  audience: "administrator" | "member"
}

export const RulebookWorkspaceContext = createContext<RulebookWorkspaceValue | null>(null)

/** The rulebook the surrounding workspace shows. */
export function useRulebookWorkspace() {
  const workspace = useContext(RulebookWorkspaceContext)
  if (!workspace) {
    throw new Error("useRulebookWorkspace needs a RulebookWorkspace around it.")
  }
  return workspace
}
