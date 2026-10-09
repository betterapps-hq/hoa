import { describe, expect, it } from "vitest"
import { fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { rulebookVocabulary } from "./documentTypes"
import { planFacts } from "./factPlan"
import type { FactAnswer } from "./factSchema"
import { matchValue, normalizeFacts, partyValues, unitLabels } from "./normalize"

const rulesFile = fenceRulesFile()
const request = fenceRequest()
const vocabulary = rulebookVocabulary(rulesFile)
const plan = planFacts(
  rulesFile,
  [
    "guidelines:5.4.2(i)#colors",
    "guidelines:5.5.1(i)#max-height",
    "guidelines:5.9.1#gate-boards",
    "declaration:4.1/p4#declarant-exempt",
    "declaration:4.2(d)#fee-before-review"
  ],
  request.type
)
const page = "Trex fence in River Birch, six (6) feet tall. Fee $50 paid on Sept. 30. Built by the owners."
const pageTexts = new Map([
  ["file-1", page],
  ["file-2", "A photo of the yard."]
])
const context = {
  plan,
  vocabulary,
  units: unitLabels(rulesFile, vocabulary),
  parties: partyValues(rulesFile, vocabulary),
  entities: request.entities,
  referenceDate: "2026-10-01",
  factConfidence: 0.8,
  pageText: (fileId: string) => pageTexts.get(fileId) ?? null,
  pages: [
    { fileId: "file-1", pageIndex: 1 },
    { fileId: "file-2", pageIndex: 1 }
  ],
  at: "2026-10-01T00:00:00Z"
}
const evidence = (quote: string) => [{ fileId: "file-1", page: 1, quote }]
const answer = (overrides: Partial<FactAnswer>): FactAnswer => ({
  entity: "run-1",
  property: "fence-run.color",
  state: "known",
  stated: "River Birch",
  reading: null,
  evidence: evidence("River Birch"),
  confidence: 0.9,
  ...overrides
})
const normalize = (...answers: FactAnswer[]) => normalizeFacts(answers, context)

describe("normalizeFacts", () => {
  it("matches a stated choice to its value term, even one of another manufacturer", () => {
    const { facts, normalizations } = normalize(answer({}))
    expect(facts[0]).toMatchObject({ state: "known", value: { type: "value", term: "composite-color.river-birch" } })
    expect(normalizations[0]).toMatchObject({ kind: "exact", matchedLabel: "River Birch" })
  })

  it("matches spelling variants fuzzily and keeps an unmatched value as written in an open set", () => {
    const gray = normalize(answer({ stated: "Winchester Gray" }))
    expect(gray.normalizations[0]).toMatchObject({ kind: "exact", matchedLabel: "Winchester Gray" })
    const misspelled = normalize(answer({ stated: "Winchestr Gray" }))
    expect(misspelled.facts[0]).toMatchObject({ value: { term: "composite-color.winchester-grey" } })
    expect(misspelled.normalizations[0]).toMatchObject({ kind: "fuzzy" })
    const purple = normalize(answer({ stated: "Purple" }))
    expect(purple.facts[0]).toMatchObject({ value: { type: "value", term: null, text: "Purple" } })
  })

  it("takes the model's reading of the words when no label matches them", () => {
    const { facts, normalizations } = normalize(
      answer({ stated: "the brown one", reading: "composite-color.river-birch" })
    )
    expect(facts[0]).toMatchObject({ value: { term: "composite-color.river-birch", text: "the brown one" } })
    expect(normalizations[0]).toMatchObject({ kind: "reading", matchedLabel: "River Birch" })
  })

  it("reads quantities, dates and parties with the grammars", () => {
    const { facts } = normalize(
      answer({ property: "fence-run.height", stated: "six (6) feet", evidence: evidence("six (6) feet tall") }),
      answer({
        entity: "request",
        property: "architectural-application.review-fee-paid-on",
        stated: "Sept. 30",
        evidence: evidence("paid on Sept. 30")
      }),
      answer({ entity: "work-1", property: "work.performed-by", stated: "the owners", evidence: evidence("owners") })
    )
    expect(facts.map((fact) => fact.value)).toEqual([
      { type: "quantity", value: 6, unit: "foot" },
      { type: "date", value: "2026-09-30" },
      { type: "value", term: "owner", text: "the owners" }
    ])
  })

  it("reads a party from the model's role, and keeps a role no party term names as written", () => {
    const { facts } = normalize(
      answer({ entity: "work-1", property: "work.performed-by", stated: "Built by the owners.", reading: "owner" }),
      answer({
        entity: "work-2",
        property: "work.performed-by",
        stated: "Built by the owners.",
        reading: "landscaper",
        evidence: evidence("Built by the owners.")
      })
    )
    expect(facts.map((fact) => [fact.state, fact.value])).toEqual([
      ["known", { type: "value", term: "owner", text: "owner" }],
      ["known", { type: "value", term: null, text: "landscaper" }]
    ])
  })

  it("holds uncertain what doesn't parse, isn't on its page, or falls below the confidence threshold", () => {
    const { facts } = normalize(
      answer({ property: "fence-run.height", stated: "tall" }),
      answer({ entity: "run-2", evidence: evidence("Saddle") }),
      answer({ entity: "run-3", confidence: 0.5 })
    )
    expect(facts.map((fact) => [fact.state, fact.candidates.length])).toEqual([
      ["uncertain", 0],
      ["uncertain", 1],
      ["uncertain", 1]
    ])
  })

  it("cites a quote on the page where it is when the answer names another", () => {
    const { facts } = normalize(answer({ evidence: [{ fileId: "file-2", page: 1, quote: "in River Birch" }] }))
    expect(facts[0]).toMatchObject({
      state: "known",
      evidence: [{ fileId: "file-1", page: 1, quote: "in River Birch" }]
    })
  })

  it("makes disagreeing readings of one property conflicting, with both as candidates", () => {
    const { facts } = normalize(answer({}), answer({ stated: "Saddle" }))
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({ state: "conflicting", value: null })
    expect(facts[0]?.candidates).toHaveLength(2)
  })

  it("keeps absent facts absent, when their evidence is found", () => {
    const { facts } = normalize(
      answer({ property: "fence-run.height", state: "absent", stated: null }),
      answer({ entity: "run-2", property: "fence-run.height", state: "absent", stated: null, evidence: [] }),
      answer({ entity: "run-3", property: "fence-run.height", state: "absent", evidence: evidence("No fence at all") })
    )
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({ entity: "run-1", state: "absent", value: null })
  })
})

describe("matchValue", () => {
  it("prefers a verbatim label over a normalized one", () => {
    const values = [
      { key: "a", labels: ["Trex"] },
      { key: "b", labels: ["trex!"] }
    ]
    expect(matchValue("Trex", values)).toMatchObject({ value: { key: "a" }, kind: "exact" })
    expect(matchValue("TREX", values)).toMatchObject({ kind: "normalized" })
  })
})
