import type * as T from "@/schema/types"
import { type CheckAgreement, checkAgreement, type KeyTranslation, type Side } from "./checkAgreement"
import { type AgentPairs, pairRules, type RulePair } from "./pairs"
import { compareProvisions, coverageScores } from "./provisions"
import { type RunDraft, type RunInfo, runDocuments, runProvisions, validityScores } from "./run"
import { alignTerms, isCoreKey, type TermMatch, termKeysIn, termRecall } from "./terms"

// Evaluation round 1's scores that code computes for one run against the golden encoding, and the bars each must clear
// (implementation-plan.md, Evaluation round 1). Rule recall, rule precision and pairwise quality are judged by the
// coding agent from the run's comparison files (compare.ts), not here; the pairs it records in pairs.json feed the
// modality, check agreement and term recall scores.

export type Bar = { name: string; label: string; min?: number; max?: number }

export const bars = [
  { name: "provision-keys", label: "Provision keys match the golden", min: 0.98 },
  { name: "provision-text", label: "Provision text similarity", min: 0.97 },
  { name: "coverage", label: "Coverage: every provision cited or given a reason", min: 1 },
  { name: "no-rule-reasons", label: "No-rule reasons agreeing with the golden", min: 0.85 },
  { name: "modality", label: "Modality agreement on paired rules", min: 0.95 },
  { name: "check-agreement", label: "Check agreement on paired rules (engine)", min: 0.85 },
  { name: "term-recall", label: "Term recall", min: 0.85 },
  { name: "units-valid", label: "Units Zod-valid after repair", min: 1 },
  { name: "units-repaired", label: "Units needing repair", max: 0.15 }
] as const satisfies readonly Bar[]

export type BarName = (typeof bars)[number]["name"]
export type Measure = Bar & { value: number; passed: boolean }

export const passes = (bar: Bar, value: number) =>
  (bar.min === undefined || value >= bar.min - 1e-9) && (bar.max === undefined || value <= bar.max + 1e-9)

/** A rule's kind with its modality, which paired rules must share. */
const modalityOf = (rule: T.Rule) =>
  rule.kind === "norm" || rule.kind === "sanction" ? `${rule.kind} ${rule.modality}` : rule.kind

function keyTranslation(matches: ReadonlyMap<T.TermKey, TermMatch>): KeyTranslation {
  const toReference = new Map([...matches.values()].map((match) => [match.pipeline, match.golden]))
  return {
    toPipeline: (key) => matches.get(key)?.pipeline ?? (isCoreKey(key) ? key : undefined),
    toReference: (key) => toReference.get(key) ?? (isCoreKey(key) ? key : undefined)
  }
}

export type ScoreInput = {
  golden: T.RulesFile
  draft: RunDraft
  report: RunInfo["report"]
  /** Whether a provision key belongs to the run's split. */
  inSplit: (key: T.ProvisionKey) => boolean
  /** The coding agent's pairs from the run folder's pairs.json (pairs.ts); none before it has judged. */
  pairs: AgentPairs
}

const mainCitation = (rule: T.Rule) => rule.citations[0]?.provisionKey ?? ""

/** The golden rules of a split: those whose main citation is in it. */
export const splitRules = (golden: T.RulesFile, inSplit: (key: T.ProvisionKey) => boolean) =>
  golden.rules.filter((rule) => inSplit(mainCitation(rule)))

/** The golden terms and proposed core terms, which the pipeline's vocabulary is aligned with. */
export const goldenTermsOf = (golden: T.RulesFile) => [...golden.terms, ...golden.proposedCore]

/** The golden terms term recall counts on a split: those its provisions cite or its golden rules use. */
export function splitTermKeys(golden: T.RulesFile, inSplit: (key: T.ProvisionKey) => boolean) {
  const goldenTerms = goldenTermsOf(golden)
  const goldenKeys = new Set(goldenTerms.map((term) => term.key))
  return new Set([
    ...goldenTerms
      .filter((term) => term.citations.some((citation) => inSplit(citation.provisionKey)))
      .map((term) => term.key),
    ...termKeysIn(splitRules(golden, inSplit), goldenKeys)
  ])
}

/** Every score of a run, the measures against their bars, and the details behind each miss. */
export function scoreRun({ golden, draft, report, inSplit, pairs }: ScoreInput) {
  const goldenProvisions = golden.provisions.filter((provision) => inSplit(provision.key))
  const ourProvisions = runProvisions(draft).filter((provision) => inSplit(provision.key))
  const structure = compareProvisions(goldenProvisions, ourProvisions)
  const coverage = coverageScores(goldenProvisions, ourProvisions, draft.coverage)
  const rules = pairRules(splitRules(golden, inSplit), draft.rules, pairs.rules)

  const goldenTerms = goldenTermsOf(golden)
  const matches = alignTerms(goldenTerms, draft.terms, pairs.terms)
  const termKeys = [...splitTermKeys(golden, inSplit)].toSorted()
  const terms = {
    ...termRecall(termKeys, matches),
    byAgent: termKeys.filter((key) => matches.get(key)?.by === "agent").length
  }

  const modalityMisses = rules.pairs.filter((pair) => modalityOf(pair.reference) !== modalityOf(pair.pipeline))
  const keys = keyTranslation(matches)
  const sides = (pair: RulePair): { reference: Side; pipeline: Side } => ({
    reference: { rule: pair.reference, terms: goldenTerms, documents: golden.documents },
    pipeline: { rule: pair.pipeline, terms: draft.terms, documents: runDocuments(draft) }
  })
  const checks = rules.pairs
    .map((pair) => checkAgreement({ ...sides(pair), keys, settings: golden.settings }))
    .filter((result): result is CheckAgreement => result !== null)
  // Only pairs whose reads translate both ways compare checks; the others compare vocabularies (checkAgreement.ts).
  const comparable = checks.filter((check) => check.isComparable)
  const checkShare =
    comparable.length === 0
      ? 1
      : comparable.reduce((sum, check) => sum + check.agreeing / check.cases, 0) / comparable.length

  const validity = validityScores(report)
  const values: Record<BarName, number> = {
    "provision-keys": structure.keyMatch,
    "provision-text": structure.similarity,
    coverage: coverage.coverage,
    "no-rule-reasons": coverage.reasonAgreement,
    modality: rules.pairs.length === 0 ? 1 : (rules.pairs.length - modalityMisses.length) / rules.pairs.length,
    "check-agreement": checkShare,
    "term-recall": terms.recall,
    "units-valid": validity.validAfterRepair,
    "units-repaired": validity.repaired
  }
  const measures: Measure[] = bars.map((bar) => ({
    ...bar,
    value: values[bar.name],
    passed: passes(bar, values[bar.name])
  }))
  return {
    measures,
    details: {
      structure: { missing: structure.missing, extra: structure.extra, matched: structure.matched.length },
      coverage,
      rules: {
        pairs: rules.pairs.map((pair) => ({ reference: pair.reference.key, pipeline: pair.pipeline.key, by: pair.by })),
        unpairedReference: rules.unpairedReference,
        unpairedPipeline: rules.unpairedPipeline,
        counts: { reference: rules.pairs.length + rules.unpairedReference.length, pipeline: draft.rules.length }
      },
      modalityMisses: modalityMisses.map((pair) => ({
        reference: pair.reference.key,
        pipeline: pair.pipeline.key,
        golden: modalityOf(pair.reference),
        ours: modalityOf(pair.pipeline)
      })),
      checks: checks.toSorted((a, b) => a.agreeing / a.cases - b.agreeing / b.cases),
      terms,
      validity
    }
  }
}
export type RunScores = ReturnType<typeof scoreRun>
