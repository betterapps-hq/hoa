import { describe, expect, it } from "vitest"
import { golden, relabeledManufacturer } from "./pair.test-data"
import { judgedTermPairs, termJudgeGroups, termJudgeVariables } from "./termJudge"
import { alignTerms } from "./terms"

describe("termJudgeGroups", () => {
  const pipeline = relabeledManufacturer()
  const matches = alignTerms(golden.terms, pipeline)
  const keys = new Set(["fence-run.manufacturer"])

  it("asks about a property no key or label matches, among its aligned thing's unmatched properties", () => {
    expect(termJudgeGroups(golden.terms, pipeline, matches, keys, "parents")).toEqual([])
    const groups = termJudgeGroups(golden.terms, pipeline, matches, keys, "members")
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ kind: "property", parent: { golden: "fence-run", pipeline: "fence-run" } })
    expect(groups[0]?.reference.map((term) => term.key)).toEqual(["fence-run.manufacturer"])
    expect(groups[0]?.pipeline.map((term) => term.key)).toEqual(["fence-run.brand"])
  })

  it("leaves out terms outside the split and groups with no candidates", () => {
    expect(termJudgeGroups(golden.terms, pipeline, matches, new Set(["gate"]), "members")).toEqual([])
    const complete = alignTerms(golden.terms, golden.terms)
    expect(termJudgeGroups(golden.terms, golden.terms, complete, keys, "members")).toEqual([])
  })

  it("shows the judge both sides' terms with their keys", () => {
    const [group] = termJudgeGroups(golden.terms, pipeline, matches, keys, "members")
    if (!group) {
      throw new Error("No group")
    }
    const variables = termJudgeVariables(group)
    expect(variables.parent).toContain("fence-run")
    expect(variables.referenceTerms).toMatch(/^\[fence-run\.manufacturer\] /)
    expect(variables.pipelineTerms).toContain("trade name of the maker")
  })
})

describe("judgedTermPairs", () => {
  it("keeps pairs naming a term of each side, each pipeline term once", () => {
    const pipeline = relabeledManufacturer()
    const [group] = termJudgeGroups(
      golden.terms,
      pipeline,
      alignTerms(golden.terms, pipeline),
      new Set(["fence-run.manufacturer"]),
      "members"
    )
    if (!group) {
      throw new Error("No group")
    }
    const pairs = judgedTermPairs(group, {
      pairs: [
        { reference: "fence-run.manufacturer", pipeline: "fence-run.brand", reason: "the same maker" },
        { reference: "fence-run.manufacturer", pipeline: "gate", reason: "not a candidate" },
        { reference: "gate.width", pipeline: "fence-run.brand", reason: "not asked about" }
      ]
    })
    expect(pairs).toEqual([{ golden: "fence-run.manufacturer", pipeline: "fence-run.brand" }])
  })
})
