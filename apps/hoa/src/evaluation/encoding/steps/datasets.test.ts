import { describe, expect, it } from "vitest"
import { definingProvisions } from "@/encoding/steps/definedTerms"
import { termDraft } from "@/schema/zod"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { buildDatasets } from "./datasets"
import { expectedDefinedTerms, goldenReferences } from "./golden"
import { storedTerm } from "./scores"

// B's expected output (evaluation.md, Encoding step datasets): the terms each document defines, read from the golden
// with the same provisions the step is given.

const term = (value: unknown) => storedTerm(termDraft.parse(value))
const labels = (text: string) => [{ text, role: "preferred" }]
const cites = (...keys: string[]) => keys.map((provisionKey) => ({ provisionKey, highlight: null, region: null }))

describe("B's expected terms", () => {
  const golden = sampleRulesFile()
  const terms = [
    term({
      key: "garden-fixture",
      kind: "thing",
      nature: "object",
      labels: labels("Garden Fixture"),
      citations: cites("rules:9/p2")
    }),
    term({
      key: "gardener",
      kind: "thing",
      nature: "party",
      labels: labels("gardener"),
      citations: cites("rules:9/p2")
    }),
    term({ key: "fee-type", kind: "value-set", complete: false, labels: labels("fee type") }),
    term({
      key: "fee-type.late",
      kind: "value",
      set: "fee-type",
      labels: labels("Late Fee"),
      citations: cites("rules:2")
    }),
    term({ key: "fee-type.annual", kind: "value", set: "fee-type", labels: labels("annual fee") }),
    term({ key: "animal", kind: "thing", nature: "object", labels: labels("animal") }),
    term({
      key: "kept-animal",
      kind: "category",
      of: "animal",
      criteria: { type: "text", text: "kept on a leash" },
      labels: labels("Kept Animal"),
      citations: cites("rules:10")
    })
  ]
  const expected = expectedDefinedTerms(
    { ...golden, terms, proposedCore: [] },
    {
      provisions: new Set(["rules:2", "rules:9/p2", "rules:10"]),
      names: ["Garden Fixtures", "Late Fee", "Kept Animal"]
    }
  )

  it("are the terms named as the document defines them, with a defined value's set and a category's thing", () => {
    expect(expected.map((found) => found.key).toSorted()).toEqual([
      "animal",
      "fee-type",
      "fee-type.late",
      "garden-fixture",
      "kept-animal"
    ])
  })
})

describe("B's dataset", () => {
  const golden = sampleRulesFile()
  const references = goldenReferences(
    golden,
    golden.documents.map((document) => ({ key: document.key, names: [document.title] }))
  )
  const items = buildDatasets({ golden, references, splitOf: () => "dev" })["defined-terms"]

  it("expects of each document only terms citing a provision the step is given as defining", () => {
    for (const item of items) {
      const given = new Set(definingProvisions(item.input.definitions, item.input.candidates))
      const defined = item.expected.terms.filter((found) => found.citations.length > 0 && found.kind !== "property")
      const outside = defined.filter((found) => found.citations.every((citation) => !given.has(citation.provisionKey)))
      expect(outside.map((found) => `${item.id} ${found.key}`)).toEqual([])
    }
  })

  it("has no item for a document that defines nothing", () => {
    expect(items.map((item) => item.id)).not.toContain("defined-terms:guidelines")
  })
})
