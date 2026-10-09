import { describe, expect, it } from "vitest"
import { fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { documentAnswers, documentRequirements, documentResults, documentsAnswerSchema } from "./documents"
import { documentTypes, rulebookVocabulary } from "./documentTypes"

const rulesFile = fenceRulesFile()
const request = fenceRequest()
const keys = ["guidelines:5.6.1(i)#neighbor-approval", "guidelines:3.1.5#owner-signatures"]
const rules = rulesFile.rules.filter((rule) => keys.includes(rule.key))
const requirements = documentRequirements(rules, request.entities, rulebookVocabulary(rulesFile))

describe("document requirements and results", () => {
  it("lists each check once per subject entity", () => {
    expect(requirements.map((requirement) => [requirement.id, requirement.ruleKey, requirement.entity])).toEqual([
      ["d1", "guidelines:5.6.1(i)#neighbor-approval", "run-1"],
      ["d2", "guidelines:5.6.1(i)#neighbor-approval", "run-2"],
      ["d3", "guidelines:5.6.1(i)#neighbor-approval", "run-3"],
      ["d4", "guidelines:5.6.1(i)#neighbor-approval", "run-4"],
      ["d5", "guidelines:3.1.5#owner-signatures", "request"]
    ])
  })

  it("turns the reader's answer into documents with signers, and statements per rule and subject", () => {
    const answer = documentsAnswerSchema(requirements).parse({
      documents: [
        {
          requirement: "d1",
          present: true,
          statements: [{ statement: "Approval of the fence's placement.", status: "contradicted", quote: "No" }],
          signers: ["neighbor"],
          evidence: [{ fileId: "file-1", page: 3, quote: null }]
        },
        { requirement: "d5", present: true, statements: [], signers: ["owner-1", "someone"], evidence: [] }
      ]
    })
    const results = documentResults(requirements, answer, new Set(["owner-1", "owner-2"]))
    expect(results[0]?.statements[0]).toEqual({
      statement: "approval of the fence's placement",
      confirmed: false,
      quote: "No"
    })
    expect(results[1]?.present).toBe(false)
    const { documents, reviews } = documentAnswers(results)
    expect(documents).toEqual([
      { id: "file-1", type: "neighbor-approval-form", subjects: ["run-1"], signedBy: [] },
      { id: "document-2", type: "application-form", subjects: ["request"], signedBy: ["owner-1"] }
    ])
    expect(reviews).toHaveLength(5)
  })

  it("tells the models what a category is from its text criteria when it has no definition", () => {
    const plotPlan = rulesFile.rules.filter((rule) => rule.key === "guidelines:3.1.5#plot-plan")
    const [requirement] = documentRequirements(plotPlan, request.entities, rulebookVocabulary(rulesFile))
    const criteria = "a drawing of the Unit showing its boundaries and where the proposed Work goes"
    expect(requirement?.definition).toBe(criteria)
    expect(documentTypes(rulesFile, request.type).find((kind) => kind.key === "plot-plan")?.definition).toBe(criteria)
  })

  it("holds a qualified statement the project has nothing for", () => {
    const sample = sampleRulesFile()
    const plans = sample.rules.filter((rule) => rule.key === "declaration:4.3(b)#plans")
    const planned = documentRequirements(plans, request.entities, rulebookVocabulary(sample))
    const [requirement] = planned
    const [layout, structure] = requirement?.mustState ?? []
    const answer = documentsAnswerSchema(planned).parse({
      documents: [
        {
          requirement: requirement?.id,
          present: true,
          statements: [
            { statement: layout, status: "confirmed", quote: "SITE PLAN" },
            { statement: structure, status: "not-applicable", quote: null }
          ],
          signers: [],
          evidence: []
        }
      ]
    })
    const [result] = documentResults(planned, answer, new Set())
    expect(result?.statements.slice(0, 3).map((statement) => statement.confirmed)).toEqual([true, true, null])
  })
})
