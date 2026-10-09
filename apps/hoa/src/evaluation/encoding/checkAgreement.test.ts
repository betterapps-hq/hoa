import { describe, expect, it } from "vitest"
import type { Rule } from "@/schema/types"
import { caseIndexes, checkAgreement, type KeyTranslation, outcomeClass } from "./checkAgreement"
import { golden, goldenRule, renamedRule, renamedTerms } from "./pair.test-data"
import { alignTerms } from "./terms"

const maxHeight = goldenRule("guidelines:5.5.1(i)#max-height")
const reference = { rule: maxHeight, terms: golden.terms, documents: golden.documents }
const same: KeyTranslation = { toPipeline: (key) => key, toReference: (key) => key }

const withLimit = (rule: Rule, inches: number): Rule =>
  rule.kind === "norm"
    ? {
        ...rule,
        check: {
          type: "test",
          test: {
            type: "compare",
            left: { type: "ref", path: ["fence-run.height"] },
            op: "<=",
            right: { type: "quantity", value: inches, unit: "inch" }
          }
        }
      }
    : rule

describe("checkAgreement", () => {
  it("agrees on every case for the same rule", () => {
    const result = checkAgreement({ reference, pipeline: reference, keys: same, settings: golden.settings })
    expect(result?.cases).toBeGreaterThan(10)
    expect(result?.agreeing).toBe(result?.cases)
  })

  it("finds the cases a different limit decides differently", () => {
    const pipeline = { ...reference, rule: withLimit(maxHeight, 78) }
    const result = checkAgreement({ reference, pipeline, keys: same, settings: golden.settings })
    expect(result?.agreeing).toBeLessThan(result?.cases ?? 0)
    expect(result?.examples[0]).toEqual({ reference: "not-met", pipeline: "met" })
  })

  it("translates facts into the pipeline's own keys through the term alignment", () => {
    const renames = { "fence-run": "fence-section", "fence-material": "material" }
    const terms = renamedTerms(renames)
    const matches = alignTerms(golden.terms, terms)
    const toReference = new Map([...matches.values()].map((match) => [match.pipeline, match.golden]))
    const keys: KeyTranslation = {
      toPipeline: (key) => matches.get(key)?.pipeline,
      toReference: (key) => toReference.get(key)
    }
    const pipeline = { rule: renamedRule(maxHeight, renames), terms, documents: golden.documents }
    const result = checkAgreement({ reference, pipeline, keys, settings: golden.settings })
    expect(result?.agreeing).toBe(result?.cases)
  })

  it("marks a pair comparable only when both rules' reads translate", () => {
    const comparable = checkAgreement({ reference, pipeline: reference, keys: same, settings: golden.settings })
    expect(comparable?.isComparable).toBe(true)
    const noHeight: KeyTranslation = {
      toPipeline: (key) => (key === "fence-run.height" ? undefined : key),
      toReference: (key) => key
    }
    const result = checkAgreement({ reference, pipeline: reference, keys: noHeight, settings: golden.settings })
    expect(result?.isComparable).toBe(false)
  })

  it("skips pairs the engine doesn't evaluate on their own", () => {
    const permission = { ...reference, rule: { ...maxHeight, modality: "permission" as const } }
    expect(
      checkAgreement({ reference: permission, pipeline: permission, keys: same, settings: golden.settings })
    ).toBeNull()
  })
})

describe("caseIndexes", () => {
  it("enumerates small spaces, then unsets each probe in turn, then all", () => {
    const cases = caseIndexes([2, 1], "seed")
    expect(cases).toEqual([
      [0, 0],
      [1, 0],
      [-1, 0],
      [1, -1],
      [-1, -1]
    ])
  })

  it("samples large spaces the same way every time", () => {
    const sizes = [5, 5, 5, 5]
    expect(caseIndexes(sizes, "seed")).toEqual(caseIndexes(sizes, "seed"))
    expect(caseIndexes(sizes, "seed").length).toBeGreaterThan(48)
  })
})

describe("outcomeClass", () => {
  it("counts outcomes that ask nothing as one", () => {
    const asked = ["met", "exempt", "not-applicable", "none"] as const
    expect(asked.map((outcome) => outcomeClass(outcome))).toEqual(["clear", "clear", "clear", "clear"])
    expect(outcomeClass("not-met")).toBe("not-met")
  })
})
