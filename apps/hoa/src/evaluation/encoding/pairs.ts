import { z } from "zod"
import type * as T from "@/schema/types"

// Which pipeline rule and term is each golden one (implementation-plan.md, Evaluation round 1). Code pairs what shares a
// key. The rest is paired by meaning by the coding agent, which reads the run's comparison files and records its pairs
// in the run folder's pairs.json (evaluation.md, Judging by the coding agent); the scorer reads them back. No model is
// called.

export const agentPairs = z.object({
  rules: z
    .array(z.object({ reference: z.string(), pipeline: z.string() }))
    .default([])
    .describe("A golden rule and the pipeline rule stating the same requirement."),
  terms: z
    .array(z.object({ golden: z.string(), pipeline: z.string() }))
    .default([])
    .describe("A golden term and the pipeline term that means the same.")
})
export type AgentPairs = z.infer<typeof agentPairs>

export type RulePair = { reference: T.Rule; pipeline: T.Rule; by: "key" | "agent" }

/**
 * Pairs golden rules with pipeline rules: the same key, else the agent's pair. A golden rule has at most one pair; an
 * agent's pair naming a rule on neither side, or a golden rule already paired, is ignored.
 */
export function pairRules(
  reference: readonly T.Rule[],
  pipeline: readonly T.Rule[],
  agent: readonly AgentPairs["rules"][number][]
) {
  const pipelineByKey = new Map(pipeline.map((rule) => [rule.key, rule]))
  const agentByReference = new Map(agent.map((pair) => [pair.reference, pair.pipeline]))
  const pairs = reference.flatMap((rule): RulePair[] => {
    const same = pipelineByKey.get(rule.key)
    if (same) {
      return [{ reference: rule, pipeline: same, by: "key" }]
    }
    const pick = pipelineByKey.get(agentByReference.get(rule.key) ?? "")
    return pick ? [{ reference: rule, pipeline: pick, by: "agent" }] : []
  })
  const pairedReference = new Set(pairs.map((pair) => pair.reference.key))
  const pairedPipeline = new Set(pairs.map((pair) => pair.pipeline.key))
  return {
    pairs,
    unpairedReference: reference.filter((rule) => !pairedReference.has(rule.key)).map((rule) => rule.key),
    unpairedPipeline: pipeline.filter((rule) => !pairedPipeline.has(rule.key)).map((rule) => rule.key)
  }
}
