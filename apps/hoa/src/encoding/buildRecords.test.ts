import { describe, expect, it } from "vitest"
import { ruleDraft } from "@/schema/zod"
import { draftDocuments, draftProvisions, heightRule, vocabulary } from "@/tests/encodingDrafts"
import { draftContent } from "./buildRecords"
import type { ConsolidateOutput, MergeOutput } from "./stepOutputs"

const now = "2026-10-09T12:00:00.000Z"
const rule = ruleDraft.parse(heightRule("rules:1#max-height", "rules:1"))
const rulebook: ConsolidateOutput["rulebook"] = {
  organization: { id: "org-1" },
  documents: draftDocuments,
  provisions: draftProvisions,
  terms: vocabulary,
  proposedCore: [],
  rules: [rule],
  settings: { clauses: { deciders: [] } },
  questions: []
}
const merged: MergeOutput = {
  rulebook,
  conflicts: [{ recordKey: "shed", message: "shed has two definitions", related: [] }],
  coverage: { provisions: 5, uncovered: [] },
  issues: []
}
const consolidated: ConsolidateOutput = {
  rulebook,
  problems: [{ code: "invalid-override", recordKey: "rules:1#max-height", message: "can't take a list" }],
  issues: [{ code: "type-mismatch", message: "isn't a party", recordKey: "settings", path: ["clauses", "deciders"] }],
  calls: [],
  answerProblems: []
}

describe("draftContent", () => {
  it("proposes every record with the problems the build left on it, and settings over the defaults", async () => {
    const content = await draftContent({ merged, consolidated, now, previous: [] })
    expect(content.rules[0]).toMatchObject({
      key: "rules:1#max-height",
      provenance: { by: "extraction", at: now },
      review: { status: "proposed" },
      issues: [{ code: "invariant", message: "can't take a list", related: [], resolution: null }]
    })
    expect(content.terms.find((term) => term.key === "shed")?.issues).toEqual([
      { code: "conflict", message: "shed has two definitions", related: [], resolution: null }
    ])
    expect(content.settings.issues).toEqual([
      { code: "type-mismatch", message: "clauses.deciders: isn't a party", related: [], resolution: null }
    ])
    expect(content.settings.clauses.time.days).toBe("calendar-day")
  })

  it("keeps the review of a record an earlier rulebook has unchanged", async () => {
    const first = await draftContent({ merged, consolidated: { ...consolidated, problems: [] }, now, previous: [] })
    const approved = { status: "approved" as const, by: "admin", at: now, note: null }
    const published = { ...first, rules: first.rules.map((item) => ({ ...item, review: approved })), terms: [] }
    const again = await draftContent({
      merged,
      consolidated: { ...consolidated, problems: [] },
      now,
      previous: [published]
    })
    expect(again.rules[0]?.review).toEqual(approved)
  })
})
