import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { vi } from "vitest"
import { workspaceOf } from "@/features/rulebook/RulebookWorkspace/RulebookWorkspace.utils"
import {
  RulebookWorkspaceContext,
  type RulebookActions,
  type RulebookSource
} from "@/features/rulebook/useRulebookWorkspace"
import type { RulebookRecords } from "@/rulebook/assemble"
import type * as T from "@/schema/types"
import { sampleRulesFile } from "./sampleRulesFile"

// The sample rulebook as the rules UX's component tests see it: records, a workspace around them, and actions that
// record their calls.

/** The sample rules file as a draft's records: every record proposed. */
export function sampleRecords(): RulebookRecords {
  const { proposedCore, ...file } = sampleRulesFile()
  return { ...file, terms: [...file.terms, ...proposedCore] }
}

export const approvedReview: T.Review = { status: "approved", by: "admin", at: "2026-10-09T00:00:00Z", note: null }

/** The sample with every term approved, so a rule's approval waits only on what a test sets up. */
export function sampleWithTermsApproved(): RulebookRecords {
  const records = sampleRecords()
  return { ...records, terms: records.terms.map((term) => ({ ...term, review: approvedReview })) }
}

export function ruleIn(records: RulebookRecords, key: string) {
  const rule = records.rules.find((item) => item.key === key)
  if (!rule) {
    throw new Error(`The sample has no rule ${key}.`)
  }
  return rule
}

export function mockActions(): RulebookActions {
  return {
    review: vi.fn<RulebookActions["review"]>(async () => ({ updated: 1, skipped: [] })),
    resolveIssue: vi.fn<RulebookActions["resolveIssue"]>(async () => undefined),
    saveRule: vi.fn<RulebookActions["saveRule"]>(async () => []),
    changeRuleTerm: vi.fn<RulebookActions["changeRuleTerm"]>(async () => []),
    saveTerm: vi.fn<RulebookActions["saveTerm"]>(async () => undefined),
    addChoice: vi.fn<RulebookActions["addChoice"]>(async () => undefined),
    mergeTerm: vi.fn<RulebookActions["mergeTerm"]>(async () => undefined),
    answerQuestion: vi.fn<RulebookActions["answerQuestion"]>(async () => ({ skipped: [] })),
    setNoRule: vi.fn<RulebookActions["setNoRule"]>(async () => undefined),
    saveSettings: vi.fn<RulebookActions["saveSettings"]>(async () => [])
  }
}

export const noPages: RulebookSource = {
  documents: [],
  loadPage: async () => {
    throw new Error("No pages in this test.")
  },
  loadSourceText: async () => []
}

/** Renders inside a workspace over the records: a draft with actions, or read-only with null. */
export function renderInWorkspace(
  ui: ReactNode,
  {
    records = sampleRecords(),
    actions = mockActions(),
    source = noPages
  }: { records?: RulebookRecords; actions?: RulebookActions | null; source?: RulebookSource } = {}
) {
  const openRule = vi.fn<(key: string) => void>()
  const workspace = workspaceOf(records, { source, actions, openRule })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RulebookWorkspaceContext.Provider value={workspace}>{ui}</RulebookWorkspaceContext.Provider>
    </QueryClientProvider>
  )
  return { user: userEvent.setup(), workspace, actions, openRule }
}
