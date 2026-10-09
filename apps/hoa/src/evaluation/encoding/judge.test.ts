import { describe, expect, it } from "vitest"
import { createVocabulary } from "@/schema/vocabulary"
import { type EncodingJudgeAnswer, judgeGroups, judgeScores, judgeVariables } from "./judge"
import { golden, goldenRule } from "./pair.test-data"

const maxHeight = goldenRule("guidelines:5.5.1(i)#max-height")
const colors = goldenRule("guidelines:5.4.2(i)#colors")
const ours = { ...maxHeight, key: "guidelines:5.5.1(i)#height" }
const extra = { ...maxHeight, key: "guidelines:5.5.1(i)#extra" }

describe("judgeGroups", () => {
  it("groups both sides' rules by main citation, in key order", () => {
    const groups = judgeGroups([maxHeight, colors], [ours, extra])
    expect(groups.map((group) => [group.provisionKey, group.reference.length, group.pipeline.length])).toEqual([
      ["guidelines:5.4.2(i)", 1, 0],
      ["guidelines:5.5.1(i)", 1, 2]
    ])
  })
})

describe("judgeVariables", () => {
  it("gives the judge the provision and each side's rules as sentences and JSON", () => {
    const [group] = judgeGroups([colors], [])
    const provisions = new Map(golden.provisions.map((provision) => [provision.key, provision]))
    const vocabulary = createVocabulary([...golden.terms])
    const variables = judgeVariables(group ?? { provisionKey: "", reference: [], pipeline: [] }, provisions, {
      reference: vocabulary,
      pipeline: vocabulary
    })
    expect(variables.provision).toContain("[guidelines:5.4.2(i)]")
    expect(variables.referenceRules).toMatch(/^\[guidelines:5\.4\.2\(i\)#colors\] .+\n\{/)
    expect(variables.referenceRules).not.toContain("provenance")
    expect(variables.pipelineRules).toBe("none")
  })
})

describe("judgeScores", () => {
  const groups = judgeGroups([maxHeight, colors], [ours, extra])
  const answer = (part: Partial<EncodingJudgeAnswer>): EncodingJudgeAnswer => ({
    pairs: [],
    pipelineRules: [],
    comparison: { verdict: "equal", reason: "" },
    ...part
  })
  const [colorsGroup, heightGroup] = groups

  it("scores recall, precision and pairwise quality from the answers", () => {
    if (!colorsGroup || !heightGroup) {
      throw new Error("Expected two groups")
    }
    const scores = judgeScores([
      {
        group: colorsGroup,
        answer: answer({
          pairs: [{ reference: colors.key, pipeline: null, note: "missing" }],
          comparison: { verdict: "worse", reason: "nothing encoded" }
        })
      },
      {
        group: heightGroup,
        answer: answer({
          pairs: [{ reference: maxHeight.key, pipeline: ours.key, note: "" }],
          pipelineRules: [
            { key: ours.key, faithful: true, reason: "" },
            { key: extra.key, faithful: false, reason: "adds a limit" }
          ],
          comparison: { verdict: "better", reason: "" }
        })
      }
    ])
    expect(scores.recall).toBe(0.5)
    expect(scores.precision).toBe(0.5)
    expect(scores.pairwise).toBe(0.5)
    expect(scores.pairs.map((pair) => [pair.reference.key, pair.pipeline.key])).toEqual([[maxHeight.key, ours.key]])
    expect(scores.misses).toEqual([{ key: colors.key, note: "missing" }])
    expect(scores.unfaithful).toEqual([{ key: extra.key, reason: "adds a limit" }])
    expect(scores.worse).toEqual([{ provisionKey: "guidelines:5.4.2(i)", reason: "nothing encoded" }])
  })

  it("ignores pairs with rules outside the group, and leaves rules the judge skipped out of precision", () => {
    if (!heightGroup) {
      throw new Error("Expected the height group")
    }
    const scores = judgeScores([
      {
        group: heightGroup,
        answer: answer({
          pairs: [{ reference: maxHeight.key, pipeline: "guidelines:9#other", note: "" }],
          pipelineRules: [{ key: ours.key, faithful: true, reason: "" }]
        })
      }
    ])
    expect(scores.recall).toBe(0)
    expect(scores.precision).toBe(1)
    expect(scores.unjudged).toEqual([extra.key])
  })
})
