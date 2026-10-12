import { describe, expect, it } from "vitest"
import { newJob } from "@/db/jobRepository"
import type { RulebookRecords } from "@/rulebook/assemble"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { describeBuildProblem, rulebookCounts } from "./rulebookView"

const sample = sampleRulesFile()
const approved = { status: "approved" as const, by: "admin", at: "", note: null }
const [first, second] = sample.rules
const cited = sample.provisions.find((provision) => provision.key === first?.citations[0]?.provisionKey)
const withReason = sample.provisions.find((provision) => provision.noRule !== null)
const records: RulebookRecords = {
  ...sample,
  // One provision the first rule cites, one with a reason for having no rule, and one nothing covers.
  provisions: [cited!, withReason!, { ...withReason!, key: "declaration:99", label: "99", noRule: null }],
  rules: [
    { ...first!, review: approved },
    {
      ...second!,
      issues: [{ code: "undefined-term", message: "gazebo isn't a term", related: [], resolution: null }]
    }
  ],
  terms: sample.terms.slice(0, 3),
  questions: []
}

describe("describeBuildProblem", () => {
  const job = newJob({ hoaId: "hoa", kind: "rulebook-build", subjectId: "r", now: "" })
  const failure = { stage: "find-rules", itemId: "declaration:article-4", message: "Bad schema" }

  it("explains a failed build or failed items, and nothing for a clean one", () => {
    expect(describeBuildProblem(null)).toBeNull()
    expect(describeBuildProblem({ ...job, status: "completed" })).toBeNull()
    expect(describeBuildProblem({ ...job, status: "failed" })).toBe("The build failed.")
    expect(describeBuildProblem({ ...job, status: "completed-with-errors", failures: [failure, failure] })).toBe(
      "2 items failed (find-rules): Bad schema"
    )
  })
})

describe("rulebook view", () => {
  it("counts the records and what still needs attention", () => {
    expect(rulebookCounts(records)).toEqual({
      rules: 2,
      terms: 3,
      questions: 0,
      uncovered: 1,
      withIssues: 1,
      approved: 1
    })
  })
})
