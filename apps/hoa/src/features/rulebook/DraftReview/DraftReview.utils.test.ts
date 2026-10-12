import { describe, expect, it } from "vitest"
import { approvedReview, sampleRecords } from "@/tests/rulebookWorkspace"
import { draftTodos, skippedParts } from "./DraftReview.utils"

describe("draftTodos", () => {
  it("puts terms first, then questions, rules, settings, reasons and uncovered provisions", () => {
    const records = sampleRecords()
    const todos = draftTodos(records, { uncovered: ["declaration:3.1(a)"] })
    expect(todos.map((todo) => todo.id)).toEqual(["terms", "questions", "rules", "settings", "reasons", "uncovered"])
    expect(todos[0]).toMatchObject({
      sentence: "1096 terms need your review",
      action: "Review terms",
      view: { tab: "terms", filter: "proposed" }
    })
    expect(todos.at(-1)).toMatchObject({
      sentence: "1 provision has no rule and no reason",
      view: { tab: "coverage", filter: "uncovered" }
    })
  })

  it("leaves nothing to do once everything is decided, and flags approved rules with open problems", () => {
    const records = sampleRecords()
    const [first, ...rest] = records.rules
    const decided = {
      ...records,
      terms: records.terms.map((term) => ({ ...term, review: approvedReview })),
      rules: [
        {
          ...first!,
          review: approvedReview,
          issues: [{ code: "conflict" as const, message: "Conflicts", related: [], resolution: null }]
        },
        ...rest.map((rule) => ({ ...rule, review: approvedReview }))
      ],
      settings: { ...records.settings, review: approvedReview },
      questions: records.questions.map((question) => ({
        ...question,
        answer: { option: 0, text: null, by: "admin", at: "2026-10-09T00:00:00Z" }
      })),
      provisions: records.provisions.map((provision) =>
        provision.noRule ? { ...provision, noRule: { ...provision.noRule, review: approvedReview } } : provision
      )
    }
    expect(draftTodos(decided, { uncovered: [] }).map((todo) => todo.label)).toEqual([
      "Fix the problems on 1 approved rule"
    ])
  })
})

describe("skippedParts", () => {
  it("says in a few words where the build skipped something, one line per place, linked to it", () => {
    const records = sampleRecords()
    const [provision] = records.provisions
    const [document] = records.documents
    const key = provision!.key
    const failures = [
      { stage: "structure-rules", itemId: `${key}#height`, message: "zod: imposedBy" },
      { stage: "structure-rules", itemId: `${key}#fine`, message: "zod: against" },
      { stage: "structure-rules", itemId: `${key}#height:retry-1`, message: "timed out" },
      { stage: "find-rules", itemId: key, message: "no answer" },
      { stage: "defined-terms", itemId: document!.key, message: "no answer" },
      { stage: "consolidate", itemId: "rulebook", message: "no answer" }
    ]
    const parts = skippedParts(failures, records)
    expect(parts.map((part) => [part.place?.label ?? null, part.text])).toEqual([
      [expect.any(String), "2 rules not drafted"],
      [expect.any(String), "some rules not drafted"],
      [expect.any(String), "not read for rules"],
      [document!.title, "defined terms not read"],
      [null, "Rules not checked for conflicts"]
    ])
    // Each place opens in the documents: a section at itself, a document at its start.
    expect(parts[0]?.place?.href).toMatch(new RegExp(`\\?provision=${encodeURIComponent(key)}$`))
    expect(parts[3]?.place?.href).toBe(`/documents/${encodeURIComponent(document!.key)}`)
  })
})
