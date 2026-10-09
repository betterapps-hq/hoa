import { z } from "zod"
import type { pipelinePrompts } from "@/ai/pipelinePrompts"
import type { PromptVariables } from "@/ai/prompts"
import { canonicalJson, compareCodeUnits } from "@/rulebook/canonical"
import type { TermKey } from "@/schema/types"
import type { TermContent } from "@/schema/zod"
import { isCoreKey, parentOf, type TermMatch, type TermPair } from "./terms"

// The term judge (implementation-plan.md, Evaluation round 1, term recall): golden terms that match no pipeline term by
// key or label are paired by meaning, with hoa-eval-term-judge. The things, value sets and units come first, one call
// per kind; then the properties, categories and values of each aligned parent, one call per parent and kind, so a pair
// always shares its parent's alignment.

export const termJudgeAnswer = z.object({
  pairs: z
    .array(
      z.object({
        reference: z.string().describe("A reference term's key."),
        pipeline: z
          .string()
          .nullable()
          .describe("The key of the pipeline term that means the same, or null when none does."),
        reason: z.string()
      })
    )
    .describe("One entry for every reference term.")
})
export type TermJudgeAnswer = z.infer<typeof termJudgeAnswer>

export type TermJudgePhase = "parents" | "members"

/** Golden terms of one kind with no match, and the pipeline terms of that kind they may be. */
export type TermJudgeGroup = {
  kind: TermContent["kind"]
  /** For members: the golden parent and the pipeline term it aligns with. */
  parent: { golden: TermKey; pipeline: TermKey } | null
  reference: TermContent[]
  pipeline: TermContent[]
}

/**
 * The groups to judge in a phase: golden terms among `keys` (and, for parents, the parents of those) that `matches`
 * leaves without a match, each with the unmatched pipeline terms of its kind, under the aligned parent for members.
 */
export function termJudgeGroups(
  golden: readonly TermContent[],
  pipeline: readonly TermContent[],
  matches: ReadonlyMap<TermKey, TermMatch>,
  keys: ReadonlySet<TermKey>,
  phase: TermJudgePhase
): TermJudgeGroup[] {
  const goldenByKey = new Map(golden.map((term) => [term.key, term]))
  const wanted = new Set([
    ...keys,
    ...[...keys].flatMap((key) => {
      const term = goldenByKey.get(key)
      const parent = term ? parentOf(term) : null
      return parent === null ? [] : [parent]
    })
  ])
  const taken = new Set([...matches.values()].map((match) => match.pipeline))
  const isParentPhase = phase === "parents"
  const aligned = (key: TermKey) => (isCoreKey(key) ? key : matches.get(key)?.pipeline)
  const groups = new Map<string, TermJudgeGroup>()
  for (const term of golden) {
    const parent = parentOf(term)
    if (!wanted.has(term.key) || matches.has(term.key) || (parent === null) !== isParentPhase) {
      continue
    }
    const alignedParent = parent === null ? null : aligned(parent)
    if (alignedParent === undefined) {
      continue
    }
    const id = `${term.kind}:${parent ?? ""}`
    const group = groups.get(id) ?? {
      kind: term.kind,
      parent: parent !== null && alignedParent !== null ? { golden: parent, pipeline: alignedParent } : null,
      reference: [],
      pipeline: pipeline.filter(
        (candidate) =>
          candidate.kind === term.kind && !taken.has(candidate.key) && parentOf(candidate) === alignedParent
      )
    }
    group.reference.push(term)
    groups.set(id, group)
  }
  return [...groups.values()]
    .filter((group) => group.pipeline.length > 0)
    .toSorted((a, b) => compareCodeUnits(`${a.kind}:${a.parent?.golden ?? ""}`, `${b.kind}:${b.parent?.golden ?? ""}`))
}

/** A term as the judge reads it: its key, then its content without bookkeeping. */
function termText(term: TermContent) {
  const { key, organizationId: _organizationId, ...content } = term
  return `[${key}] ${canonicalJson(content)}`
}

/** hoa-eval-term-judge's variables for one group. */
export function termJudgeVariables(group: TermJudgeGroup): PromptVariables<typeof pipelinePrompts.termJudge> {
  const parent = group.parent
    ? `The reference's ${group.kind} terms of ${group.parent.golden}, and the pipeline's of ${group.parent.pipeline}, which is the same term.`
    : `Every ${group.kind} term either side has that the other doesn't share by key.`
  return {
    parent,
    referenceTerms: group.reference.map(termText).join("\n"),
    pipelineTerms: group.pipeline.map(termText).join("\n")
  }
}

/** The judge's pairs that name a term of each side of the group, each pipeline term at most once. */
export function judgedTermPairs(group: TermJudgeGroup, answer: TermJudgeAnswer): TermPair[] {
  const references = new Set(group.reference.map((term) => term.key))
  const candidates = new Set(group.pipeline.map((term) => term.key))
  const used = new Set<TermKey>()
  const pairs: TermPair[] = []
  for (const pair of answer.pairs) {
    const { reference, pipeline } = pair
    if (pipeline === null || !references.has(reference) || !candidates.has(pipeline) || used.has(pipeline)) {
      continue
    }
    if (pairs.some((found) => found.golden === reference)) {
      continue
    }
    used.add(pipeline)
    pairs.push({ golden: reference, pipeline })
  }
  return pairs
}
