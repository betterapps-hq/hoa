// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { Review } from "@/schema/types"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { rulebookChanges, type ComparedRulebook } from "./changes"

const sample = sampleRulesFile()
const rejected: Review = { status: "rejected", by: "admin", at: "2026-10-09T00:00:00Z", note: null }
const [first, second, third, fourth] = sample.rules
const [term, otherTerm] = sample.terms
if (!first || !second || !third || !fourth || !term || !otherTerm) {
  throw new Error("The sample has four rules and two terms")
}
const uploads = [
  { id: "declaration-1", title: "Declaration" },
  { id: "declaration-2", title: "Declaration, restated" },
  { id: "guidelines-1", title: "Design Guidelines" }
]
const published: ComparedRulebook = {
  rules: [first, second, third, { ...fourth, review: rejected }],
  terms: [term, otherTerm],
  settings: sample.settings,
  sourceDocumentIds: ["declaration-1", "guidelines-1"]
}

describe("rulebookChanges", () => {
  it("lists records added, changed and removed, and the documents swapped", async () => {
    const draft: ComparedRulebook = {
      rules: [
        { ...first, review: rejected },
        { ...second, statement: `${second.statement} Amended.` }
      ],
      terms: [term, { ...otherTerm, key: "new-term" }],
      settings: { ...sample.settings, review: rejected },
      sourceDocumentIds: ["declaration-2", "guidelines-1"]
    }
    const changes = await rulebookChanges(draft, published, uploads)
    expect(changes).toEqual({
      isFirst: false,
      rules: { added: [], changed: [second.key], removed: [third] },
      terms: { added: ["new-term"], changed: [], removed: [otherTerm] },
      settingsChanged: false,
      documents: {
        added: [{ id: "declaration-2", title: "Declaration, restated" }],
        removed: [{ id: "declaration-1", title: "Declaration" }]
      }
    })
    const { time } = sample.settings.clauses
    const clauses = { ...sample.settings.clauses, time: { ...time, rollForward: !time.rollForward } }
    const edited = { ...draft, settings: { ...sample.settings, clauses } }
    expect((await rulebookChanges(edited, published, uploads)).settingsChanged).toBe(true)
  })

  it("treats a first draft as wholly added", async () => {
    const changes = await rulebookChanges(published, null, uploads)
    expect(changes.isFirst).toBe(true)
    expect(changes.rules.added).toHaveLength(4)
    expect(changes.rules.removed).toEqual([])
    expect(changes.settingsChanged).toBe(true)
    expect(changes.documents.added.map((document) => document.title)).toEqual(["Declaration", "Design Guidelines"])
  })
})
