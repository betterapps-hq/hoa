import { describe, expect, it } from "vitest"
import { approvedReview, sampleRecords } from "@/tests/rulebookWorkspace"
import { tabWork } from "./RulebookWorkspace.utils"

describe("tabWork", () => {
  it("says what each tab has left to decide, so the tabs are the review's to-do list", () => {
    const records = sampleRecords()
    const reasons = records.provisions.filter((provision) => provision.noRule?.review.status === "proposed").length
    expect(tabWork(records, { uncovered: ["declaration:3.1(a)"] })).toEqual({
      changes: 0,
      rules: records.rules.length,
      terms: records.terms.length,
      coverage: reasons + 1,
      questions: records.questions.length,
      settings: 1
    })
  })

  it("counts an approved rule with open problems as left to fix", () => {
    const records = sampleRecords()
    const [first, ...rest] = records.rules
    const problem = { code: "conflict" as const, message: "Conflicts", related: [], resolution: null }
    const rules = [
      { ...first!, review: approvedReview, issues: [problem] },
      ...rest.map((rule) => ({ ...rule, review: approvedReview }))
    ]
    expect(tabWork({ ...records, rules }, { uncovered: [] }).rules).toBe(1)
  })
})
