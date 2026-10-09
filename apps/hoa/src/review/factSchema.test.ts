import { describe, expect, it } from "vitest"
import { fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { rulebookVocabulary } from "./documentTypes"
import { planFacts } from "./factPlan"
import { everyEntity, expandShared, factsAnswerSchema } from "./factSchema"

const rulesFile = fenceRulesFile()
const request = fenceRequest()
const vocabulary = rulebookVocabulary(rulesFile)
const plan = planFacts(rulesFile, ["guidelines:5.4.2(i)#colors", "guidelines:5.5.1(i)#max-height"], request.type)
const group = {
  entities: ["run-1", "run-2"],
  properties: plan.properties.map((property) => property.key),
  conditions: []
}
const schema = factsAnswerSchema(plan, group, {
  entities: request.entities,
  vocabulary,
  units: [
    { key: "inch", dimension: "length" },
    { key: "foot", dimension: "length" }
  ]
})
const fact = (overrides: Record<string, unknown>) => ({
  entity: "run-1",
  property: "fence-run.color",
  state: "known",
  stated: "River Birch",
  reading: "composite-color.river-birch",
  evidence: [],
  confidence: 0.9,
  ...overrides
})

describe("factsAnswerSchema", () => {
  it("accepts planned properties with readings of their types", () => {
    const answer = {
      facts: [fact({}), fact({ property: "fence-run.height", stated: "6'", reading: { value: 6, unit: "foot" } })]
    }
    expect(schema.parse(answer).facts).toHaveLength(2)
  })

  it("rejects an unplanned property and an entity outside the group", () => {
    expect(schema.safeParse({ facts: [fact({ property: "fence-run.style" })] }).success).toBe(false)
    expect(schema.safeParse({ facts: [fact({ entity: "gate-1" })] }).success).toBe(false)
  })

  it("drops a reading that doesn't fit its type, keeping the stated value for normalization", () => {
    const usd = fact({ property: "fence-run.height", stated: "6'", reading: { value: 6, unit: "usd" } })
    const answer = schema.parse({ facts: [fact({ reading: "River Birch" }), usd] })
    expect(answer.facts.map((item) => [item.stated, item.reading])).toEqual([
      ["River Birch", null],
      ["6'", null]
    ])
  })

  it("takes one answer for a value every entity of the type shares, expanded to each without its own", () => {
    const answer = schema.parse({
      facts: [
        fact({ entity: everyEntity }),
        fact({ entity: "run-2", reading: "composite-color.saddle", stated: "Saddle" })
      ]
    })
    const expanded = expandShared(answer, plan, group, { entities: request.entities, vocabulary })
    expect(expanded.facts.map((item) => [item.entity, item.reading])).toEqual([
      ["run-2", "composite-color.saddle"],
      ["run-1", "composite-color.river-birch"]
    ])
  })
})
