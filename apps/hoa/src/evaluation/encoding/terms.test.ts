import { describe, expect, it } from "vitest"
import { golden, goldenRule, relabeledManufacturer, renamedTerms } from "./pair.test-data"
import { alignTerms, termKeysIn, termRecall } from "./terms"

describe("alignTerms", () => {
  it("matches the same key, else the same kind by label under an aligned parent", () => {
    const pipeline = renamedTerms({ "fence-run": "fence-section", "fence-location": "run-location" })
    const matches = alignTerms(golden.terms, pipeline)
    expect(matches.get("gate")).toMatchObject({ pipeline: "gate", by: "key" })
    expect(matches.get("fence-run")).toMatchObject({ pipeline: "fence-section", by: "label", score: 1 })
    expect(matches.get("fence-run.height")).toMatchObject({ pipeline: "fence-section.height", by: "label" })
    expect(matches.get("fence-location.front")).toMatchObject({ pipeline: "run-location.front", by: "label" })
  })

  it("takes the term judge's pairs of the same kind under the aligned parent", () => {
    const pipeline = relabeledManufacturer()
    expect(alignTerms(golden.terms, pipeline).has("fence-run.manufacturer")).toBe(false)
    expect(
      alignTerms(golden.terms, pipeline, [{ golden: "fence-run.manufacturer", pipeline: "fence-run.brand" }]).get(
        "fence-run.manufacturer"
      )
    ).toMatchObject({ pipeline: "fence-run.brand", by: "judge" })
    expect(
      alignTerms(golden.terms, pipeline, [{ golden: "fence-run.manufacturer", pipeline: "gate" }]).has(
        "fence-run.manufacturer"
      )
    ).toBe(false)
  })

  it("matches each pipeline term once, and leaves a golden term without a match out", () => {
    const pipeline = golden.terms.filter((term) => term.key !== "fence-run.lattice-height")
    const matches = alignTerms(golden.terms, pipeline)
    expect(matches.has("fence-run.lattice-height")).toBe(false)
    const targets = [...matches.values()].map((match) => match.pipeline)
    expect(new Set(targets).size).toBe(targets.length)
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
