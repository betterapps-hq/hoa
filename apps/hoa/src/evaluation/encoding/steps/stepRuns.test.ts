import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { z } from "zod"
import { clippedInput, repeatSpread, spreadText } from "./report"
import { confirmedGaps, judgedTermPairs, readJudgments, readStepRun, stepItemFile } from "./stepRuns"

// A step run's folder read back for --rescore, and what its comparison files show of an item's input.

const folder = mkdtempSync(join(tmpdir(), "step-run-"))
afterAll(() => rmSync(folder, { recursive: true, force: true }))

const write = (path: string, value: unknown) => {
  mkdirSync(join(folder, path, ".."), { recursive: true })
  writeFileSync(join(folder, path), JSON.stringify(value))
}

const call = {
  stage: "term-extraction",
  itemId: "defined-terms:rules",
  promptName: "hoa-defined-terms",
  promptVersion: 1,
  modelId: "mock",
  inputTokens: 10,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 5,
  costUsd: 0.01,
  latencyMs: 100,
  isCached: false
}
write("run.json", {
  runId: "run-1",
  stage: "defined-terms",
  from: "the golden dataset",
  promptVersions: { "hoa-defined-terms": 1 },
  repeats: 2,
  calls: [call, { ...call, itemId: "defined-terms:other" }],
  problems: [{ itemId: "defined-terms:rules", code: "invariant", message: "organizationId must be check" }]
})
write(`outputs/1/${stepItemFile("defined-terms:rules")}.json`, { terms: [{ key: "shed" }] })
write(`outputs/2/${stepItemFile("defined-terms:rules")}.json`, null)

describe("readStepRun", () => {
  it("reads each repeat's outputs, with the run's calls and problems on the first", () => {
    const { info, runs } = readStepRun(folder, ["defined-terms:rules", "defined-terms:other"], (value) =>
      z.object({ terms: z.array(z.object({ key: z.string() })) }).parse(value)
    )
    expect(info).toMatchObject({ runId: "run-1", stage: "defined-terms", repeats: 2 })
    expect(runs).toHaveLength(2)
    expect(runs[0]?.outputs.get("defined-terms:rules")).toEqual({ terms: [{ key: "shed" }] })
    expect(runs[0]?.outputs.get("defined-terms:other")).toBeNull()
    expect(runs[1]?.outputs.get("defined-terms:rules")).toBeNull()
    expect(runs.map((run) => [run.calls.length, run.problems.length])).toEqual([
      [2, 1],
      [0, 0]
    ])
  })
})

describe("clippedInput", () => {
  it("shows an input whole, or says where it was cut", () => {
    expect(clippedInput("short", 10)).toBe("short")
    expect(clippedInput("a".repeat(25), 10)).toBe(`${"a".repeat(10)}\n[cut: 15 of 25 characters not shown]`)
  })
})

describe("repeats and judgments", () => {
  it("gives each metric's mean, min and max across repeats, leaving out repeats that didn't measure it", () => {
    const spreads = repeatSpread([{ recall: 0.5, extra: 2 }, { recall: 0.25, extra: null }, { recall: 0.75 }])
    expect(spreads).toEqual({ extra: { mean: 2, min: 2, max: 2 }, recall: { mean: 0.5, min: 0.25, max: 0.75 } })
    expect(spreadText(spreads.recall ?? { mean: 0, min: 0, max: 0 })).toBe("0.500 (0.250–0.750)")
  })

  it("reads the golden gaps the coding agent confirmed, and none when a run has no judgments", () => {
    expect(readJudgments(folder)).toEqual({ goldenGaps: [], termPairs: [] })
    write("judgments.json", {
      goldenGaps: [
        { item: "defined-terms:rules", label: "Garden Plot", confirmed: true, why: "1.4 defines it" },
        { item: "defined-terms:rules", label: "Gate", confirmed: false, why: "only used" }
      ]
    })
    expect(confirmedGaps(readJudgments(folder), "defined-terms:rules")).toEqual(["Garden Plot"])
  })

  it("reads the term pairs judged for one item", () => {
    write("judgments.json", {
      termPairs: [
        { item: "shared-vocabulary:a", golden: "deck.height", pipeline: "deck.height-above-ground", why: "same" },
        { item: "shared-vocabulary:b", golden: "gate.color", pipeline: "gate.finish", why: "same" }
      ]
    })
    expect(judgedTermPairs(readJudgments(folder), "shared-vocabulary:a")).toEqual([
      { golden: "deck.height", pipeline: "deck.height-above-ground" }
    ])
  })
})
