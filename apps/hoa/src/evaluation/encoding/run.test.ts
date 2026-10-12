import { describe, expect, it } from "vitest"
import { runCost, validityScores } from "./run"

const call = (costUsd: number | null) => ({
  stage: "find-rules",
  itemId: "unit",
  promptName: "hoa-rule-finding",
  promptVersion: 1,
  modelId: "model",
  inputTokens: 1,
  cachedInputTokens: null,
  cacheWriteTokens: null,
  outputTokens: 1,
  costUsd,
  latencyMs: 1,
  isCached: false
})

describe("validityScores", () => {
  it("gives the shares of units valid after repair and of units repaired", () => {
    const unit = { provisions: 3, problems: 0 }
    const scores = validityScores({
      units: [
        { ...unit, id: "a", isValid: true, repairRounds: 0 },
        { ...unit, id: "b", isValid: true, repairRounds: 2 },
        { ...unit, id: "c", isValid: false, repairRounds: 2 },
        { ...unit, id: "d", isValid: true, repairRounds: 0 }
      ],
      validAfterEncode: 2,
      problemsBefore: 5,
      calls: []
    })
    expect(scores).toMatchObject({ units: 4, validAfterRepair: 0.75, repaired: 0.5, invalid: ["c"] })
  })
})

describe("runCost", () => {
  it("adds up the calls' billed cost", () => {
    expect(
      runCost({ units: [], validAfterEncode: 0, problemsBefore: 0, calls: [call(1.5), call(null), call(0.25)] })
    ).toBe(1.75)
  })
})
