import { describe, expect, it } from "vitest"
import { rulebookVocabulary } from "@/review/documentTypes"
import { fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { writerComparison } from "./writerComparison"

const rulesFile = fenceRulesFile()

describe("writerComparison", () => {
  const text = writerComparison(
    "fence-colors",
    {
      request: fenceRequest(),
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
    {
      rulesFile,
      vocabulary: rulebookVocabulary(rulesFile),
      scores: {
        entities: 1,
        facts: 0.9,
        documents: null,
        normalization: null,
        evidence: 1,
        findings: 1,
        recommendation: 1,
        actionItems: 1
      }
    }
  )

  it("puts what the writer read beside what it wrote", () => {
    expect(text).toContain("# Writer of fence-colors")
    expect(text).toContain("Recommendation: approve-with-conditions.")
    expect(text).toContain('"text": "Pick a listed color."')
    expect(text).toContain('"Left side run"')
    expect(text).toContain("## What the writer read: suggestions\n\n```json\nnone\n```")
    expect(text).toContain("## What the writer wrote: assessment\n\n```text\nOne change.\n```")
    expect(text).toContain("## What the writer wrote: feedback\n\n```text\nChoose another color.\n```")
  })

  it("carries the case's scores from code", () => {
    expect(text).toContain("Scores from code: entities 1.00, facts 0.90, documents -,")
  })
})
