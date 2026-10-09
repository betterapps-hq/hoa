import { describe, expect, it } from "vitest"
import { rulebookVocabulary } from "@/review/documentTypes"
import { fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { reviewJudgeVariables, writerScore } from "./judge"

const rulesFile = fenceRulesFile()
const request = fenceRequest()

describe("reviewJudgeVariables", () => {
  it("gives the judge the writer's inputs with the writer's phrasing and writing", () => {
    const variables = reviewJudgeVariables(
      {
        request,
        selected: ["guidelines:5.4.2(i)#colors"],
        findings: [],
        recommendation: "approve-with-conditions",
        changes: [
          { id: "change-1", ruleKey: "guidelines:5.4.2(i)#colors", entities: ["run-1"], text: "Pick a listed color." }
        ],
        missingInformation: [],
        committeeDecisions: [],
        suggestions: [],
        assessment: "One change.",
        feedback: "Choose another color."
      },
      rulesFile,
      rulebookVocabulary(rulesFile)
    )
    expect(variables.recommendation).toBe("approve-with-conditions")
    expect(JSON.parse(variables.actionItems)).toEqual([
      expect.objectContaining({ id: "change-1", text: "Pick a listed color.", things: ["Left side run"] })
    ])
    expect(JSON.parse(variables.writing)).toEqual({ assessment: "One change.", feedback: "Choose another color." })
  })
})

describe("writerScore", () => {
  it("is the share of parts both faithful and clear", () => {
    const part = (faithful: boolean, clear: boolean) => ({ part: "assessment", faithful, clear, reason: "" })
    expect(writerScore({ parts: [part(true, true), part(true, false), part(false, true), part(true, true)] })).toBe(0.5)
    expect(writerScore({ parts: [] })).toBeNull()
  })
})
