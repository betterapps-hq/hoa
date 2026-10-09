import { describe, expect, it } from "vitest"
import { exampleRun } from "./pair.test-data"
import { bars, passes } from "./score"

describe("scoreRun", () => {
  const { measures, details } = exampleRun()
  const value = (name: string) => measures.find((measure) => measure.name === name)?.value

  it("scores every bar of evaluation round 1", () => {
    expect(measures.map((measure) => measure.name)).toEqual(bars.map((bar) => bar.name))
    expect(value("provision-keys")).toBe(1)
    expect(value("provision-text")).toBe(1)
    expect(value("coverage")).toBe(1)
    expect(value("rule-recall")).toBe(0.4)
    expect(value("rule-precision")).toBe(0.5)
    expect(value("pairwise")).toBeCloseTo(2 / 3)
    expect(value("modality")).toBe(0.5)
    expect(value("term-recall")).toBe(1)
    expect(value("units-valid")).toBe(1)
    expect(value("units-repaired")).toBe(0.5)
  })

  it("evaluates each paired rule pair with the engine", () => {
    expect(details.checks.map((check) => check.reference)).toEqual(
      expect.arrayContaining(["guidelines:5.5.1(i)#max-height", "guidelines:5.5.2#metal-height"])
    )
    expect(value("check-agreement")).toBe(1)
  })

  it("keeps what's behind each miss", () => {
    expect(details.judge.misses.map((miss) => miss.key)).toEqual([
      "guidelines:5.5.1(i)#max-height-all",
      "guidelines:5.5.1(ii)#fence-and-lattice",
      "guidelines:5.5.2#variations"
    ])
    expect(details.modalityMisses).toEqual([
      {
        reference: "guidelines:5.5.2#metal-height",
        pipeline: "guidelines:5.5.2#metal-height",
        golden: "norm obligation",
        ours: "norm prohibition"
      }
    ])
    expect(details.validity.repairedUnits).toEqual(["guidelines:5.5.2"])
  })

  it("marks a measure passed only within its bar", () => {
    const failed = measures.filter((measure) => !measure.passed).map((measure) => measure.name)
    expect(failed).toEqual(["rule-recall", "rule-precision", "modality", "pairwise", "units-repaired"])
    expect(passes({ name: "x", label: "x", max: 0.15 }, 0.15)).toBe(true)
  })
})
