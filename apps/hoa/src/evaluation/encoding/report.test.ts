import { describe, expect, it } from "vitest"
import { exampleRun } from "./pair.test-data"
import { scoreReport } from "./report"

describe("scoreReport", () => {
  const report = scoreReport({
    runId: "run-1",
    split: "dev",
    promptVersions: { "hoa-provision-encoding": 2 },
    judgeVersion: 1,
    cost: { encoding: 12.5, judge: 3.25 },
    scores: exampleRun()
  })

  it("leads with the bar table", () => {
    expect(report).toContain("Prompts: hoa-provision-encoding v2; judge hoa-eval-encoding-judge v1.")
    expect(report).toContain("Cost: encoding $12.50, judging $3.25.")
    expect(report).toContain("7 of 12 bars cleared.")
    expect(report).toContain("| Rule recall (judge pairs a pipeline rule) | 0.400 | at least 0.900 | no |")
    expect(report).toContain("| Units needing repair | 0.500 | at most 0.150 | no |")
  })

  it("lists what's behind each miss by key", () => {
    expect(report).toContain("## Golden rules without a pipeline rule (3)")
    expect(report).toContain("- guidelines:5.5.2#metal-height: a limit, not a ban")
    expect(report).toContain("- guidelines:5.5.1(ii): the lattice limit is missing")
    expect(report).not.toContain("## Uncovered provisions")
  })
})
