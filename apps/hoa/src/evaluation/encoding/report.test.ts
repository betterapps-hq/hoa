import { describe, expect, it } from "vitest"
import { exampleRun } from "./pair.test-data"
import { scoreReport } from "./report"

describe("scoreReport", () => {
  const report = scoreReport({
    runId: "run-1",
    split: "dev",
    promptVersions: { "hoa-provision-encoding": 2 },
    encodingCost: 12.5,
    hasAgentPairs: true,
    scores: exampleRun().scores
  })

  it("leads with the bar table of the scores code computes", () => {
    expect(report).toContain("Prompts: hoa-provision-encoding v2. Encoding cost $12.50.")
    expect(report).toContain("2 pairs (1 by key, 1 from pairs.json)")
    expect(report).toContain("7 of 9 bars computed by code cleared.")
    expect(report).toContain("| Modality agreement on paired rules | 0.500 | at least 0.950 | no |")
    expect(report).toContain("| Units needing repair | 0.500 | at most 0.150 | no |")
  })

  it("lists what's behind each miss by key", () => {
    expect(report).toContain("## Golden rules without a pair (3)")
    expect(report).toContain("- guidelines:5.5.2#metal-height (norm obligation) / guidelines:5.5.2#metal-limit")
    expect(report).not.toContain("## Uncovered provisions")
  })
})
