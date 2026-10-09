import { z } from "zod"
import type { pipelinePrompts } from "@/ai/pipelinePrompts"
import type { PromptVariables } from "@/ai/prompts"
import { provisionBlock } from "@/encoding/promptVariables"
import { canonicalJson, compareCodeUnits } from "@/rulebook/canonical"
import { describeRule } from "@/schema/describe"
import type { Provision, ProvisionKey, Rule, RuleKey } from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"

// The encoding judge (implementation-plan.md, Evaluation round 1): one hoa-eval-encoding-judge call per provision that
// is the main citation of a rule on either side. It pairs the golden (reference) rules with the pipeline's, says
// whether each pipeline rule is faithful to the text, and compares the two encodings of the provision. Code turns the
// answers into rule recall, rule precision and pairwise quality.

export const encodingJudgeAnswer = z.object({
  pairs: z
    .array(
      z.object({
        reference: z.string().describe("A reference rule's key."),
        pipeline: z.string().nullable().describe("The key of the pipeline rule stating the same requirement, or null."),
        note: z.string()
      })
    )
    .describe("One entry for every reference rule."),
  pipelineRules: z
    .array(z.object({ key: z.string(), faithful: z.boolean(), reason: z.string() }))
    .describe("One entry for every pipeline rule."),
  comparison: z.object({ verdict: z.enum(["better", "equal", "worse"]), reason: z.string() })
})
export type EncodingJudgeAnswer = z.infer<typeof encodingJudgeAnswer>

/** The rules whose main citation is one provision, on each side. */
export type JudgeGroup = { provisionKey: ProvisionKey; reference: Rule[]; pipeline: Rule[] }

const mainCitation = (rule: Rule) => rule.citations[0]?.provisionKey ?? ""

/** Groups both sides' rules by main citation, in key order. */
export function judgeGroups(reference: readonly Rule[], pipeline: readonly Rule[]): JudgeGroup[] {
  const groups = new Map<ProvisionKey, JudgeGroup>()
  const groupOf = (provisionKey: ProvisionKey) => {
    const found = groups.get(provisionKey) ?? { provisionKey, reference: [], pipeline: [] }
    groups.set(provisionKey, found)
    return found
  }
  reference.forEach((rule) => groupOf(mainCitation(rule)).reference.push(rule))
  pipeline.forEach((rule) => groupOf(mainCitation(rule)).pipeline.push(rule))
  return [...groups.values()].toSorted((a, b) => compareCodeUnits(a.provisionKey, b.provisionKey))
}

/** A rule as the judge reads it: key, sentence and JSON without bookkeeping. */
function ruleText(rule: Rule, vocabulary: Vocabulary) {
  const { provenance: _provenance, review: _review, issues: _issues, effectiveFrom: _effectiveFrom, ...content } = rule
  return `[${rule.key}] ${describeRule(rule, vocabulary)}\n${canonicalJson(content)}`
}

/** The lead-ins and wrap-ups of a provision's ancestors, outermost first. */
function ancestorsText(provision: Provision, byKey: ReadonlyMap<ProvisionKey, Provision>) {
  const documentKey = provision.key.slice(0, provision.key.indexOf(":"))
  const lines: string[] = []
  const seen = new Set<string>()
  for (
    let parent = provision.parentLabel ? byKey.get(`${documentKey}:${provision.parentLabel}`) : undefined;
    parent && !seen.has(parent.key);
    parent = parent.parentLabel ? byKey.get(`${documentKey}:${parent.parentLabel}`) : undefined
  ) {
    seen.add(parent.key)
    const parts = [parent.intro ? `intro: ${parent.intro}` : "", parent.wrapUp ? `wrap-up: ${parent.wrapUp}` : ""]
    lines.unshift([`[${parent.key}]${parent.heading ? ` ${parent.heading}` : ""}`, ...parts.filter(Boolean)].join("\n"))
  }
  return lines
}

/**
 * hoa-eval-encoding-judge's variables for one group: the main provision with its ancestors' lead-ins and the other
 * provisions the group's rules cite, then each side's rules.
 */
export function judgeVariables(
  group: JudgeGroup,
  provisions: ReadonlyMap<ProvisionKey, Provision>,
  vocabularies: { reference: Vocabulary; pipeline: Vocabulary }
): PromptVariables<typeof pipelinePrompts.encodingJudge> {
  const main = provisions.get(group.provisionKey)
  const cited = new Set(
    [...group.reference, ...group.pipeline].flatMap((rule) => rule.citations.map((citation) => citation.provisionKey))
  )
  cited.delete(group.provisionKey)
  const others = [...cited].toSorted(compareCodeUnits).flatMap((key) => {
    const found = provisions.get(key)
    return found ? [`Also cited:\n${provisionBlock(found)}`] : []
  })
  const provision = main
    ? [...ancestorsText(main, provisions), provisionBlock(main), ...others].join("\n\n")
    : [`[${group.provisionKey}] (not found)`, ...others].join("\n\n")
  const rulesText = (rules: readonly Rule[], vocabulary: Vocabulary) =>
    rules.map((rule) => ruleText(rule, vocabulary)).join("\n\n") || "none"
  return {
    provision,
    referenceRules: rulesText(group.reference, vocabularies.reference),
    pipelineRules: rulesText(group.pipeline, vocabularies.pipeline)
  }
}

export type RulePair = { reference: Rule; pipeline: Rule }

/** Recall, precision and pairwise quality from the judge's answers, with the misses behind each. */
export function judgeScores(judged: readonly { group: JudgeGroup; answer: EncodingJudgeAnswer }[]) {
  const pairs: RulePair[] = []
  const misses: { key: RuleKey; note: string }[] = []
  const unfaithful: { key: RuleKey; reason: string }[] = []
  const unjudged: RuleKey[] = []
  const worse: { provisionKey: ProvisionKey; reason: string }[] = []
  let references = 0
  let faithful = 0
  let judgedRules = 0
  let betterOrEqual = 0

  for (const { group, answer } of judged) {
    const pipelineByKey = new Map(group.pipeline.map((rule) => [rule.key, rule]))
    for (const reference of group.reference) {
      references += 1
      const entries = answer.pairs.filter((pair) => pair.reference === reference.key)
      const paired = entries
        .map((entry) => (entry.pipeline ? pipelineByKey.get(entry.pipeline) : undefined))
        .find(Boolean)
      if (paired) {
        pairs.push({ reference, pipeline: paired })
      } else {
        misses.push({ key: reference.key, note: entries.map((entry) => entry.note).join(" ") })
      }
    }
    for (const rule of group.pipeline) {
      const verdict = answer.pipelineRules.find((entry) => entry.key === rule.key)
      if (!verdict) {
        unjudged.push(rule.key)
        continue
      }
      judgedRules += 1
      if (verdict.faithful) {
        faithful += 1
      } else {
        unfaithful.push({ key: rule.key, reason: verdict.reason })
      }
    }
    if (answer.comparison.verdict === "worse") {
      worse.push({ provisionKey: group.provisionKey, reason: answer.comparison.reason })
    } else {
      betterOrEqual += 1
    }
  }
  const share = (count: number, of: number) => (of === 0 ? 1 : count / of)
  return {
    recall: share(references - misses.length, references),
    precision: share(faithful, judgedRules),
    pairwise: share(betterOrEqual, judged.length),
    pairs,
    misses,
    unfaithful,
    unjudged,
    worse,
    counts: { references, judgedRules, provisions: judged.length }
  }
}
