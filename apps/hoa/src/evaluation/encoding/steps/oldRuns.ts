import { recordProblems } from "@/encoding/steps/check"
import { kindName, outlineOfRule, statementSummary, type Outline } from "@/encoding/steps/outline"
import {
  collateralChanges,
  outlineOfRecord,
  problemClass,
  problemRecords,
  selectRecords,
  type ProblemRecord
} from "@/encoding/steps/ruleRetry"
import type * as T from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import { ruleDraft, type RuleContent, type TermContent } from "@/schema/zod"
import type { DatasetItem, RuleFindingItem, RuleStructuringItem } from "./datasets"
import type { SavedRun } from "./savedRun"
import type { ConsolidationOutput, FindingOutput, RetryOutput, StructuringOutput } from "./scores"

// What an old pipeline run produced for each dataset item (evaluation.md, Datasets, the v5 column). The old
// pipeline had other steps, so its outputs are mapped: its vocabulary step to B, its encode answers to E's outlines and
// F's structured rules, its repair to F's retry, its consolidation to consolidation. C and C-merge have no
// equivalent.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const listOf = (value: unknown, name: string): unknown[] =>
  isRecord(value) && Array.isArray(value[name]) ? value[name] : []

const mainCitationOf = (rule: unknown) => {
  const [first] = listOf(rule, "citations")
  return isRecord(first) && typeof first.provisionKey === "string" ? first.provisionKey : ""
}

/** The run's final vocabulary: its merged terms, else its vocabulary step's. */
export const runTerms = (run: SavedRun): TermContent[] =>
  run.merge?.rulebook.terms ?? run.vocabulary.flatMap((item) => item.terms)

export const runDocuments = (run: SavedRun): T.GoverningDocument[] => run.merge?.rulebook.documents ?? []

/** Whether the run encoded any of these provisions. */
const covers = (run: SavedRun, keys: ReadonlySet<string>) =>
  run.units.some((unit) => unit.provisions.some((provision) => keys.has(provision.key)))

/** Each rule of the run's encode answers (before any repair), with its section and its index in the answer. */
function encodedRules(run: SavedRun) {
  return [...run.encode].flatMap(([unitId, file]) =>
    listOf(file.answer, "rules").map((raw, index) => ({ unitId, index, raw, provisionKey: mainCitationOf(raw) }))
  )
}

/** A rule as given, as an outline: parsed when it passes Zod, read field by field when it doesn't. */
function outlineOfRaw(unitId: string, raw: unknown, vocabulary: ReturnType<typeof createVocabulary>): Outline {
  const parsed = ruleDraft.safeParse(raw)
  if (parsed.success) {
    return outlineOfRule(parsed.data, unitId, statementSummary(parsed.data, vocabulary))
  }
  const record = isRecord(raw) ? raw : {}
  return outlineOfRecord({ unitId, key: typeof record.key === "string" ? record.key : "", record, problems: [] })
}

/** E's equivalent: for each provision of the item, the run's no-rule reason and its rules main-cited there. */
export function oldFinding(run: SavedRun, item: RuleFindingItem): FindingOutput | null {
  const keys = new Set(item.expected.provisions.map((entry) => entry.key))
  if (!covers(run, keys)) {
    return null
  }
  const vocabulary = createVocabulary(runTerms(run))
  const reasons = new Map<string, T.NoRule["reason"]>()
  for (const file of run.encode.values()) {
    for (const entry of listOf(file.answer, "provisions")) {
      const noRule = isRecord(entry) && isRecord(entry.noRule) ? entry.noRule.reason : null
      if (isRecord(entry) && typeof entry.key === "string" && typeof noRule === "string") {
        reasons.set(entry.key, noRule as T.NoRule["reason"])
      }
    }
  }
  const rules = encodedRules(run).filter((rule) => keys.has(rule.provisionKey))
  return {
    provisions: item.expected.provisions.map((entry) => ({
      key: entry.key,
      noRule: reasons.get(entry.key) ?? null,
      outlines: rules
        .filter((rule) => rule.provisionKey === entry.key)
        .map((rule) => outlineOfRaw(rule.unitId, rule.raw, vocabulary))
    }))
  }
}

/** A rule's kind as F's union names it, from a rule as given. */
const kindOfRaw = (unitId: string, raw: unknown, vocabulary: ReturnType<typeof createVocabulary>) =>
  kindName(outlineOfRaw(unitId, raw, vocabulary))

/**
 * F's equivalent: for each golden rule of the batch, the run's encoded rule with the same key, else one main-cited at
 * the same provision (of the same kind first), with its validity and the problems verify found on it before repair.
 * The output carries the golden key, so scores pair them.
 */
export function oldStructuring(run: SavedRun, item: RuleStructuringItem): StructuringOutput | null {
  const keys = new Set(item.input.outlines.map((outline) => outline.provisionKey))
  if (!covers(run, keys)) {
    return null
  }
  const vocabulary = createVocabulary(runTerms(run))
  const pool = encodedRules(run).filter((rule) => keys.has(rule.provisionKey))
  const taken = new Set<(typeof pool)[number]>()
  const pick = (outline: Outline) => {
    const candidates = pool.filter((rule) => !taken.has(rule) && rule.provisionKey === outline.provisionKey)
    const keyOf = (raw: unknown) => (isRecord(raw) ? raw.key : null)
    const found =
      candidates.find((rule) => keyOf(rule.raw) === outline.key) ??
      candidates.find((rule) => kindOfRaw(rule.unitId, rule.raw, vocabulary) === kindName(outline)) ??
      candidates[0]
    if (found) {
      taken.add(found)
    }
    return found
  }
  const rules = item.input.outlines.flatMap((outline) => {
    const found = pick(outline)
    if (!found) {
      return []
    }
    const parsed = ruleDraft.safeParse(found.raw)
    const state = run.verified.get(found.unitId)
    const problems = (state?.problems ?? [])
      .filter((problem) => problem.path[0] === "rules" && problem.path[1] === found.index)
      .map((problem) => ({ code: problemClass(problem) }))
    return [
      { key: outline.key, rule: parsed.success ? { ...parsed.data, key: outline.key } : null, raw: found.raw, problems }
    ]
  })
  return { rules, terms: runTerms(run), documents: runDocuments(run) }
}

export type RetryItem = DatasetItem<
  { record: ProblemRecord; vocabulary: TermContent[]; provisions: T.Provision[] },
  { rule: RuleContent | null }
>

/**
 * F retry's items: the rules a saved run's verify found problems in, stratified by class (`quota`), each with the
 * provisions it cites and the vocabulary it may use; the expected rule is the golden one with the same key, if any.
 */
export function retryItems(
  run: SavedRun,
  quota: ReadonlyMap<string, number>,
  goldenRules: readonly T.Rule[]
): RetryItem[] {
  const records = selectRecords(problemRecords([...run.verified.values()]), quota)
  const terms = runTerms(run)
  const byKey = new Map(goldenRules.map((rule) => [rule.key, rule]))
  return records.map((record) => {
    const outline = outlineOfRecord(record)
    const unit = run.units.find((item) => item.id === record.unitId)
    const cited = new Set([outline.provisionKey, ...outline.citations])
    const {
      provenance: _provenance,
      review: _review,
      issues: _issues,
      ...rule
    } = byKey.get(record.key) ?? {
      provenance: null,
      review: null,
      issues: null
    }
    return {
      id: `rule-retry:${run.runId}:${record.key}`,
      step: "rule-retry",
      tags: {
        document: outline.provisionKey.slice(0, outline.provisionKey.indexOf(":")),
        split: run.info.split,
        topics: [outline.domain],
        features: [...new Set(record.problems.map((problem) => problem.class))]
      },
      input: {
        record,
        vocabulary: [...new Map([...(unit?.terms ?? []), ...terms].map((term) => [term.key, term])).values()],
        provisions: run.provisions.filter((provision) => cited.has(provision.key))
      },
      expected: { rule: "key" in rule ? ruleDraft.parse(rule) : null }
    }
  })
}

/** The retry outcome of a rule: fixed or not, and what changed outside its problems. */
export function retryOutcome(input: {
  record: ProblemRecord
  after: unknown
  terms: readonly TermContent[]
  rules: readonly RuleContent[]
  provisions: readonly T.Provision[]
  documents: readonly T.GoverningDocument[]
}): RetryOutput {
  const parsed = ruleDraft.safeParse(input.after)
  const remaining = parsed.success
    ? recordProblems({
        terms: input.terms,
        rules: [...input.rules.filter((rule) => rule.key !== parsed.data.key), parsed.data],
        provisions: input.provisions,
        documents: input.documents,
        about: new Set([parsed.data.key])
      })
        .filter((problem) => problem.code !== "undefined-rule")
        .map((problem) => `${problem.code}: ${problem.message}`)
    : (parsed.error?.issues ?? []).map((issue) => `zod: ${issue.message}`)
  const changes = collateralChanges(
    input.record.record,
    input.after,
    input.record.problems.map((problem) => problem.path)
  )
  return {
    fixed: parsed.success && remaining.length === 0,
    remaining,
    collateral: changes.collateral,
    wordingChanged: changes.wordingChanged
  }
}

/** The old repair's outcome for a recorded rule: its first repair of the rule's section, if any. */
export function oldRetry(run: SavedRun, item: RetryItem): RetryOutput | null {
  const { record } = item.input
  const repair = run.repairs.get(`${record.unitId}:1`)
  if (!repair?.state) {
    return null
  }
  const after = listOf(repair.state.answer, "rules").find((rule) => isRecord(rule) && rule.key === record.key)
  if (after === undefined) {
    return { fixed: false, remaining: ["the repair dropped the rule"], collateral: [], wordingChanged: false }
  }
  const index = listOf(repair.state.answer, "rules").indexOf(after)
  const remaining = repair.state.problems
    .filter((problem) => problem.path[0] === "rules" && problem.path[1] === index)
    .map((problem) => problemClass(problem))
    .filter((kind) => kind !== "coverage" && kind !== "undefined-rule")
  const changes = collateralChanges(
    record.record,
    after,
    record.problems.map((problem) => problem.path)
  )
  return {
    fixed: ruleDraft.safeParse(after).success && remaining.length === 0,
    remaining,
    collateral: changes.collateral,
    wordingChanged: changes.wordingChanged
  }
}

/** Consolidation's equivalent: the overrides the run's consolidation added, and those code refused. */
export function oldConsolidation(run: SavedRun, split: string): ConsolidationOutput | null {
  if (!run.merge || !run.consolidate || run.info.split !== split) {
    return null
  }
  const before = new Map(run.merge.rulebook.rules.map((rule) => [rule.key, rule]))
  const overrides = run.consolidate.rulebook.rules.flatMap((rule) => {
    if ((rule.kind !== "norm" && rule.kind !== "discretion") || !Array.isArray(rule.overrides)) {
      return []
    }
    const previous = before.get(rule.key)
    const had =
      previous && (previous.kind === "norm" || previous.kind === "discretion") && Array.isArray(previous.overrides)
        ? previous.overrides
        : []
    return rule.overrides.filter((target) => !had.includes(target)).map((target) => ({ rule: rule.key, target }))
  })
  const invalid = run.consolidate.problems.filter(
    (problem) => problem.code === "invalid-override" || problem.code === "override-not-allowed"
  ).length
  return { overrides, invalid }
}

/**
 * B's equivalent: the run's vocabulary-step terms that cite the document; missing when the run didn't read the
 * document or had no vocabulary step.
 */
export function oldDefinedTerms(run: SavedRun, documentKey: string) {
  const read = run.provisions.some((provision) => provision.key.startsWith(`${documentKey}:`))
  if (!read || run.vocabulary.length === 0) {
    return null
  }
  const terms = run.vocabulary
    .flatMap((file) => file.terms)
    .filter((term) => term.citations.some((citation) => citation.provisionKey.startsWith(`${documentKey}:`)))
  return { terms }
}
