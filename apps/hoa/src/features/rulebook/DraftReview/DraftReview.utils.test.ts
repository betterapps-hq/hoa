import { describe, expect, it } from "vitest"
import { approvedReview, sampleRecords } from "@/tests/rulebookWorkspace"
import { draftTodos } from "./DraftReview.utils"

describe("draftTodos", () => {
  it("puts terms first, then questions, rules, settings, reasons and uncovered provisions", () => {
    const records = sampleRecords()
    const todos = draftTodos(records, { uncovered: ["declaration:3.1(a)"] })
    expect(todos.map((todo) => todo.id)).toEqual(["terms", "questions", "rules", "settings", "reasons", "uncovered"])
    expect(todos[0]).toMatchObject({
      sentence: "1086 terms need your review",
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
