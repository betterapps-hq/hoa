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

  it("keeps a form's own value as itself and a form's description uncertain, never matching either to a value term", () => {
    // The very words of a label, given as a value the administrator added, stay a value of their own.
    const own = normalize(answer({ stated: "River Birch", asWritten: "value" }))
    expect(own.facts[0]).toMatchObject({ state: "known", value: { type: "value", term: null, text: "River Birch" } })
    expect(own.normalizations).toEqual([])
    const description = normalize(answer({ state: "uncertain", stated: "River Birch", asWritten: "description" }))
    expect(description.facts[0]).toMatchObject({
      state: "uncertain",
      value: null,
      stated: "River Birch",
      candidates: [{ type: "text", value: "River Birch" }]
    })
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

  it("takes the model's quantity when its words verify it, a form the grammar can't read included", () => {
    const height = (stated: string, reading: unknown) =>
      normalize(answer({ property: "fence-run.height", stated, reading, evidence: evidence("six (6) feet tall") }))
    const both = height("six (6) feet", { value: 72, unit: "inch" })
    expect(both.facts[0]).toMatchObject({ state: "known", value: { type: "quantity", value: 72, unit: "inch" } })
    expect(both.normalizations[0]).toMatchObject({ kind: "parsed" })
    expect(both.corrections).toEqual([])
    // "6 tall" names no unit, so the grammar reads nothing; the model's 6 feet still verifies.
    const modelOnly = height("6 tall", { value: 6, unit: "foot" })
    expect(modelOnly.facts[0]).toMatchObject({ state: "known", value: { value: 6, unit: "foot" } })
    expect(modelOnly.normalizations[0]).toMatchObject({ kind: "verified" })
  })

  it("records a value the verifier rejects, and the grammar's value standing in its place", () => {
    const { facts, corrections } = normalize(
      answer({ property: "fence-run.height", stated: "six (6) feet", reading: { value: 8, unit: "foot" } })
    )
    expect(facts[0]).toMatchObject({ state: "known", value: { value: 6, unit: "foot" } })
    expect(corrections).toEqual([
      expect.objectContaining({
        kind: "verifier-rejected",
        entity: "run-1",
        property: "fence-run.height",
        problems: ["numeral-disagrees"],
        readings: [
          expect.objectContaining({ by: "model", value: { type: "quantity", value: 8, unit: "foot" } }),
          expect.objectContaining({ by: "grammar", value: { type: "quantity", value: 6, unit: "foot" } })
        ],
        result: { state: "known", value: { type: "quantity", value: 6, unit: "foot" } }
      })
    ])
    const unverified = normalize(
      answer({ property: "fence-run.height", stated: null, reading: { value: 6, unit: "foot" } })
    )
    expect(unverified.facts[0]).toMatchObject({ state: "uncertain", candidates: [{ value: 6, unit: "foot" }] })
    expect(unverified.corrections[0]).toMatchObject({ problems: ["no-quote"], result: { state: "uncertain" } })
  })

  it("rejects a model's unit the words don't name, and takes the grammar's", () => {
    // "6 ft" names feet, so 6 inches doesn't verify: a numeral counts only in a unit the words name.
    const { facts, corrections } = normalize(
      answer({ property: "fence-run.height", stated: "6 ft", reading: { value: 6, unit: "inch" } })
    )
    expect(facts[0]).toMatchObject({ state: "known", value: { value: 6, unit: "foot" } })
    expect(corrections[0]).toMatchObject({ kind: "verifier-rejected", problems: ["numeral-disagrees"] })
  })

  it("takes the model's date when its words verify it", () => {
    const paidOn = (stated: string, reading: string) =>
      normalize(
        answer({
          entity: "request",
          property: "architectural-application.review-fee-paid-on",
          stated,
          reading,
          evidence: evidence("paid on Sept. 30")
        })
      )
    expect(paidOn("Sept. 30", "2026-09-30").facts[0]).toMatchObject({ value: { type: "date", value: "2026-09-30" } })
    expect(paidOn("Sept. 30", "2026-09-03")).toMatchObject({
      facts: [{ value: { type: "date", value: "2026-09-30" } }],
      corrections: [{ kind: "verifier-rejected" }]
    })
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
      { key: "a", labels: ["Acme"], meaning: null },
      { key: "b", labels: ["acme!"], meaning: null }
    ]
    expect(matchValue("Acme", values)).toMatchObject({ value: { key: "a" }, kind: "exact" })
    expect(matchValue("ACME", values)).toMatchObject({ kind: "normalized" })
  })
})
