import { describe, expect, it } from "vitest"
import { newJob } from "@/db/jobRepository"
import type { RulebookContent } from "@/db/rulebookContentRepository"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { approvedRuleLines, describeBuildProblem, rulebookCounts, ruleLines } from "./rulebookView"

const sample = sampleRulesFile()
const approved = { status: "approved" as const, by: "admin", at: "", note: null }
const content: RulebookContent = {
  settings: sample.settings,
  coverage: { provisions: 2, uncovered: ["declaration:21.4"] },
  rules: [
    { ...sample.rules[0]!, review: approved },
    {
      ...sample.rules[1]!,
      issues: [{ code: "undefined-term", message: "gazebo isn't a term", related: [], resolution: null }]
    }
  ],
  terms: sample.terms.slice(0, 3),
  questions: []
}

describe("describeBuildProblem", () => {
  const job = newJob({ hoaId: "hoa", kind: "rulebook-build", subjectId: "r", now: "" })
  const failure = { stage: "encode", itemId: "declaration:article-4", message: "Bad schema" }

  it("explains a failed build or failed items, and nothing for a clean one", () => {
    expect(describeBuildProblem(null)).toBeNull()
    expect(describeBuildProblem({ ...job, status: "completed" })).toBeNull()
    expect(describeBuildProblem({ ...job, status: "failed" })).toBe("The build failed.")
    expect(describeBuildProblem({ ...job, status: "completed-with-errors", failures: [failure, failure] })).toBe(
      "2 items failed (encode): Bad schema"
    )
  })
})

describe("rulebook view", () => {
  it("counts the records and what still needs attention", () => {
    expect(rulebookCounts(content)).toEqual({
      rules: 2,
      terms: 3,
      questions: 0,
      uncovered: 1,
      withIssues: 1,
      approved: 1
    })
  })

  it("lists rules by key with their statements in words, and the approved ones for the published view", () => {
    const lines = ruleLines(content)
    expect(lines.map((line) => line.key)).toEqual(content.rules.map((rule) => rule.key).toSorted())
    expect(lines.every((line) => !line.statement.includes("{{"))).toBe(true)
    expect(approvedRuleLines(content).map((line) => line.key)).toEqual([content.rules[0]?.key])
  })
})
