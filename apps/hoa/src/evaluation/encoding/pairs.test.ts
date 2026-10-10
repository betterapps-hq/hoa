import { describe, expect, it } from "vitest"
import { goldenRule } from "./pair.test-data"
import { agentPairs, pairRules } from "./pairs"

const maxHeight = goldenRule("guidelines:5.5.1(i)#max-height")
const colors = goldenRule("guidelines:5.4.2(i)#colors")
const ours = { ...colors, key: "guidelines:5.4.2(i)#listed-colors" }

describe("pairRules", () => {
  it("pairs by key first, then by the agent's pairs", () => {
    const result = pairRules(
      [maxHeight, colors],
      [maxHeight, ours],
      [
        { reference: maxHeight.key, pipeline: ours.key },
        { reference: colors.key, pipeline: ours.key }
      ]
    )
    expect(result.pairs.map((pair) => [pair.reference.key, pair.pipeline.key, pair.by])).toEqual([
      [maxHeight.key, maxHeight.key, "key"],
      [colors.key, ours.key, "agent"]
    ])
    expect(result.unpairedReference).toEqual([])
    expect(result.unpairedPipeline).toEqual([])
  })

  it("ignores an agent's pair naming a rule the pipeline doesn't have", () => {
    const result = pairRules([colors], [ours], [{ reference: colors.key, pipeline: "guidelines:9#other" }])
    expect(result.pairs).toEqual([])
    expect(result.unpairedReference).toEqual([colors.key])
    expect(result.unpairedPipeline).toEqual([ours.key])
  })
})

describe("agentPairs", () => {
  it("reads a pairs file with either list left out", () => {
    expect(agentPairs.parse({ rules: [{ reference: "a", pipeline: "b" }] })).toEqual({
      rules: [{ reference: "a", pipeline: "b" }],
      terms: []
    })
  })
})
