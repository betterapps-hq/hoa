import { describe, expect, it } from "vitest"
import { termDraft } from "@/schema/zod"
import { golden, goldenRule, relabeledManufacturer, renamedTerms } from "./pair.test-data"
import { alignTerms, termKeysIn, termRecall, unmatchedTermGroups } from "./terms"

describe("alignTerms", () => {
  it("matches the same key, else the same kind by label under an aligned parent", () => {
    const pipeline = renamedTerms({ "fence-run": "fence-section", "fence-location": "run-location" })
    const matches = alignTerms(golden.terms, pipeline)
    expect(matches.get("gate")).toMatchObject({ pipeline: "gate", by: "key" })
    expect(matches.get("fence-run")).toMatchObject({ pipeline: "fence-section", by: "label", score: 1 })
    expect(matches.get("fence-run.height")).toMatchObject({ pipeline: "fence-section.height", by: "label" })
    expect(matches.get("fence-location.front")).toMatchObject({ pipeline: "run-location.front", by: "label" })
  })

  it("takes the coding agent's pairs of the same kind under the aligned parent", () => {
    const pipeline = relabeledManufacturer()
    expect(alignTerms(golden.terms, pipeline).has("fence-run.manufacturer")).toBe(false)
    expect(
      alignTerms(golden.terms, pipeline, [{ golden: "fence-run.manufacturer", pipeline: "fence-run.brand" }]).get(
        "fence-run.manufacturer"
      )
    ).toMatchObject({ pipeline: "fence-run.brand", by: "agent" })
    expect(
      alignTerms(golden.terms, pipeline, [{ golden: "fence-run.manufacturer", pipeline: "gate" }]).has(
        "fence-run.manufacturer"
      )
    ).toBe(false)
  })

  const draft = (key: string, label: string, of?: string) =>
    termDraft.parse(
      of === undefined
        ? { key, kind: "thing", nature: "object", labels: [{ text: label, role: "preferred" }] }
        : {
            key,
            kind: "property",
            of,
            valueType: { type: "boolean" },
            ifUnstated: "unknown",
            labels: [{ text: label, role: "preferred" }]
          }
    )

  it("reserves every same-key match before matching labels", () => {
    const reference = [draft("fence", "fence panel"), draft("fence-panel", "fence panel")]
    const matches = alignTerms(reference, [draft("fence-panel", "fence panel")])
    expect(matches.get("fence-panel")).toMatchObject({ pipeline: "fence-panel", by: "key" })
    expect(matches.has("fence")).toBe(false)
  })

  it("matches a property only under its thing's match, or the same thing when the thing isn't being aligned", () => {
    const reference = [
      draft("gate", "garden gate"),
      draft("gate.painted", "painted", "gate"),
      draft("porch.painted", "painted", "porch")
    ]
    const pipeline = [draft("fence.painted", "painted", "fence"), draft("porch.coated", "painted", "porch")]
    const matches = alignTerms(reference, pipeline)
    expect(matches.has("gate.painted")).toBe(false)
    expect(matches.get("porch.painted")).toMatchObject({ pipeline: "porch.coated", by: "label" })
  })

  it("matches a value set by its values when the sets are named differently", () => {
    const set = (key: string, label: string) =>
      termDraft.parse({ key, kind: "value-set", complete: false, labels: [{ text: label, role: "preferred" }] })
    const value = (key: string, label: string, of: string) =>
      termDraft.parse({ key, kind: "value", set: of, labels: [{ text: label, role: "preferred" }] })
    const reference = [
      set("fee-type", "fee type"),
      value("fee-type.annual", "Annual Fee", "fee-type"),
      value("fee-type.transfer", "Transfer Fee", "fee-type")
    ]
    const pipeline = [
      set("fee-kind", "fee kind"),
      value("fee-kind.annual-fee", "Annual Fee", "fee-kind"),
      value("fee-kind.transfer-fee", "Transfer Fee", "fee-kind")
    ]
    const matches = alignTerms(reference, pipeline)
    expect(matches.get("fee-type")).toMatchObject({ pipeline: "fee-kind", by: "label" })
    expect(matches.get("fee-type.transfer")).toMatchObject({ pipeline: "fee-kind.transfer-fee" })
    expect(alignTerms(reference, [set("color", "color"), value("color.red", "red", "color")]).has("fee-type")).toBe(
      false
    )
  })

  it("matches each pipeline term once, and leaves a golden term without a match out", () => {
    const pipeline = golden.terms.filter((term) => term.key !== "fence-run.lattice-height")
    const matches = alignTerms(golden.terms, pipeline)
    expect(matches.has("fence-run.lattice-height")).toBe(false)
    const targets = [...matches.values()].map((match) => match.pipeline)
    expect(new Set(targets).size).toBe(targets.length)
  })
})

describe("unmatchedTermGroups", () => {
  const pipeline = relabeledManufacturer()
  const matches = alignTerms(golden.terms, pipeline)
  const keys = new Set(["fence-run.manufacturer"])

  it("offers a property no key or label matches, among its aligned thing's unmatched properties", () => {
    const groups = unmatchedTermGroups(golden.terms, pipeline, matches, keys)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ kind: "property", parent: { golden: "fence-run", pipeline: "fence-run" } })
    expect(groups[0]?.reference.map((term) => term.key)).toEqual(["fence-run.manufacturer"])
    expect(groups[0]?.pipeline.map((term) => term.key)).toEqual(["fence-run.brand"])
  })

  it("leaves out terms outside the split, paired terms and groups with no candidates", () => {
    expect(unmatchedTermGroups(golden.terms, pipeline, matches, new Set(["gate"]))).toEqual([])
    const paired = alignTerms(golden.terms, pipeline, [
      { golden: "fence-run.manufacturer", pipeline: "fence-run.brand" }
    ])
    expect(unmatchedTermGroups(golden.terms, pipeline, paired, keys)).toEqual([])
    const complete = alignTerms(golden.terms, golden.terms)
    expect(unmatchedTermGroups(golden.terms, golden.terms, complete, keys)).toEqual([])
  })
})

describe("termRecall", () => {
  it("counts the golden terms matched, leaving core keys out", () => {
    const matches = alignTerms(
      golden.terms,
      golden.terms.filter((term) => term.key !== "gate")
    )
    const result = termRecall(["gate", "fence-run", "lot"], matches)
    expect(result).toEqual({ recall: 0.5, terms: 2, missing: ["gate"] })
  })
})

describe("termKeysIn", () => {
  it("finds the term keys a rule uses anywhere", () => {
    const keys = new Set(golden.terms.map((term) => term.key))
    const found = termKeysIn(goldenRule("guidelines:5.5.1(i)#max-height"), keys)
    expect([...found].toSorted()).toEqual(
      expect.arrayContaining(["fence-run", "fence-run.height", "fence-run.material", "return-fence"])
    )
  })
})
