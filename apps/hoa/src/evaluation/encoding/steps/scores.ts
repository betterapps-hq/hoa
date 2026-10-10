import { candidateTermPairs } from "@/encoding/consolidate"
import type { Outline } from "@/encoding/steps/outline"
import { kindName } from "@/encoding/steps/outline"
import { coreTerms } from "@/schema/coreTerms"
import type * as T from "@/schema/types"
import type { JsonPath } from "@/schema/validate"
import type { RuleContent, TermContent } from "@/schema/zod"
import { matchLabel } from "@/text/match"
import { labelForms } from "@/text/normalize"
import { checkAgreement } from "../checkAgreement"
import { alignTerms, isCoreKey, type TermMatch } from "../terms"
import type {
  ConsolidationItem,
  DefinedTermsItem,
  RuleFindingItem,
  RuleStructuringItem,
  SharedVocabularyItem,
  VocabularyMergeItem
} from "./datasets"

// Scores code computes for one dataset item: what a step (or the old pipeline's equivalent) produced against the
// item's expected output, and a verdict: correct, partly correct (with what's wrong), wrong or missing. What code can't
// decide (whether a rule is faithful, whether two terms mean the same) is left to the coding agent from the comparison
// files (evaluation.md, Judging by the coding agent).

export type Verdict = "correct" | "partly" | "wrong" | "missing" | "no-equivalent"

export type ItemScore = {
  verdict: Verdict
  /** Shares in [0, 1], counts, or null where nothing was there to measure. */
  metrics: Record<string, number | null>
  /** What's wrong, by key. */
  notes: string[]
}

export const missing = (why: string): ItemScore => ({ verdict: "missing", metrics: {}, notes: [why] })
export const noEquivalent = (why: string): ItemScore => ({ verdict: "no-equivalent", metrics: {}, notes: [why] })

const share = (count: number, of: number) => (of === 0 ? null : count / of)

/** Correct when every share is 1 and every count of faults 0; wrong when the primary share is 0; partly otherwise. */
function verdictOf(metrics: Record<string, number | null>, primary: string, faults: readonly string[]): Verdict {
  const primaryValue = metrics[primary]
  if (primaryValue === 0) {
    return "wrong"
  }
  const shares = Object.entries(metrics).filter(([name]) => !faults.includes(name))
  const perfect =
    shares.every(([, value]) => value === null || value === 1) && faults.every((name) => (metrics[name] ?? 0) === 0)
  return perfect ? "correct" : "partly"
}

/** Translates golden keys to the output's through a term alignment; core keys are shared. */
const translator = (matches: ReadonlyMap<T.TermKey, TermMatch>) => (key: string | null) => {
  if (key === null || isCoreKey(key)) {
    return key
  }
  return matches.get(key)?.pipeline ?? `unmatched:${key}`
}

/** Every string in a condition that looks like a term key with a dot (a property or a value). */
function termLike(value: unknown): string[] {
  return (JSON.stringify(value).match(/"[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+"/g) ?? []).map((text) =>
    text.slice(1, -1)
  )
}

// ─── B. Defined terms ────────────────────────────────────────────────────────────────────────────

export type DefinedTermsOutput = { terms: TermContent[] }

export function scoreDefinedTerms(item: DefinedTermsItem, output: DefinedTermsOutput | null): ItemScore {
  if (output === null) {
    return missing("no terms")
  }
  const expected = item.expected.terms
  const matches = alignTerms(expected, output.terms)
  const recall = (keep: (term: TermContent) => boolean) => {
    const wanted = expected.filter(keep)
    return share(
      wanted.filter(
        (term) => matches.has(term.key) && output.terms.some((o) => o.key === matches.get(term.key)?.pipeline)
      ).length,
      wanted.length
    )
  }
  const isThing = (term: TermContent) => term.kind === "thing" && !isCoreKey(term.key)
  const matched = new Set([...matches.values()].map((match) => match.pipeline))
  const offered = output.terms.filter((term) => term.kind === "thing" || term.kind === "category")
  // A new thing or category whose label is a core term's: the core term should have been refined instead.
  const coreLabels = new Set(coreTerms.flatMap((term) => term.labels.flatMap(labelForms)))
  const coreDuplicates = offered.filter(
    (term) =>
      !isCoreKey(term.key) && term.labels.some((label) => labelForms(label).some((form) => coreLabels.has(form)))
  )
  // A category whose criteria read a term neither the answer nor the core has.
  const known = new Set([...coreTerms.map((term) => term.key), ...output.terms.map((term) => term.key)])
  const unresolved = output.terms.flatMap((term) =>
    term.kind === "category"
      ? [...new Set(termLike(term.criteria))].filter((key) => !known.has(key)).map((key) => `${term.key} reads ${key}`)
      : []
  )
  const metrics = {
    "thing-recall": recall(isThing),
    "category-recall": recall((term) => term.kind === "category"),
    "refinement-recall": recall((term) => isCoreKey(term.key)),
    "criteria-property-recall": recall((term) => term.kind === "property"),
    "criteria-value-recall": recall((term) => term.kind === "value-set" || term.kind === "value"),
    "extra-things": offered.filter((term) => !matched.has(term.key)).length,
    "core-duplicates": coreDuplicates.length,
    "unresolved-criteria": unresolved.length
  }
  const notes = [
    ...expected
      .filter((term) => !output.terms.some((o) => o.key === matches.get(term.key)?.pipeline))
      .map((term) => `missing ${term.kind} ${term.key}`),
    ...offered.filter((term) => !matched.has(term.key)).map((term) => `not in the golden: ${term.kind} ${term.key}`),
    ...coreDuplicates.map((term) => `${term.key} has a core term's label`),
    ...unresolved.map((text) => `criteria: ${text} (undeclared)`)
  ]
  return {
    verdict: verdictOf(metrics, "thing-recall", ["extra-things", "core-duplicates", "unresolved-criteria"]),
    metrics,
    notes
  }
}

// ─── E. Find the rules ───────────────────────────────────────────────────────────────────────────

/** E's output for a section: each provision's no-rule reason and the outlines main-cited there. */
export type FindingOutput = {
  provisions: {
    key: string
    noRule: RuleFindingItem["expected"]["provisions"][number]["noRule"]
    outlines: Outline[]
  }[]
}

type Pair = { expected: Outline; output: Outline }

/** Pairs expected and output outlines of one provision: the same key, then the same kind, then in order. */
function pairOutlines(expected: readonly Outline[], output: readonly Outline[]) {
  const pairs: Pair[] = []
  const left = [...expected]
  const right = [...output]
  const take = (match: (a: Outline, b: Outline) => boolean) => {
    for (const a of left.slice()) {
      const index = right.findIndex((b) => match(a, b))
      const b = right[index]
      if (b) {
        pairs.push({ expected: a, output: b })
        left.splice(left.indexOf(a), 1)
        right.splice(index, 1)
      }
    }
  }
  take((a, b) => a.key === b.key)
  take((a, b) => kindName(a) === kindName(b))
  take(() => true)
  return { pairs, unpairedExpected: left, unpairedOutput: right }
}

export function scoreFinding(
  item: RuleFindingItem,
  output: FindingOutput | null,
  matches: ReadonlyMap<T.TermKey, TermMatch>,
  /** The golden terms: a subject or party the output gives as a label matches the golden term with that label. */
  goldenTerms: readonly TermContent[] = []
): ItemScore {
  if (output === null || output.provisions.length === 0) {
    return missing("no outline or reason for the section's provisions")
  }
  const translate = translator(matches)
  const byKey = new Map(goldenTerms.map((term) => [term.key, term]))
  /** The same subject or party: the translated key, or a label of the golden term. */
  const same = (golden: string | null, given: string | null) =>
    translate(golden) === given ||
    (golden !== null &&
      given !== null &&
      (byKey.get(golden)?.labels ?? []).some((label) => matchLabel(given, label)?.kind === "exact"))
  const entries = new Map(output.provisions.map((entry) => [entry.key, entry]))
  // A provision is covered by a reason, or by an outline citing it (as its main provision or in support).
  const cited = new Set(
    output.provisions.flatMap((entry) =>
      entry.outlines.flatMap((outline) => [outline.provisionKey, ...outline.citations])
    )
  )
  const notes: string[] = []
  const pairs: Pair[] = []
  let expectedCount = 0
  let outputCount = 0
  let covered = 0
  let reasons = 0
  let reasonsAgreeing = 0
  for (const entry of item.expected.provisions) {
    const found = entries.get(entry.key)
    if (found?.noRule || cited.has(entry.key) || entry.coveredOutside) {
      covered += 1
    } else {
      notes.push(`${entry.key}: no outline or reason`)
    }
    if (entry.noRule !== null && entry.outlines.length === 0) {
      reasons += 1
      if (found?.noRule === entry.noRule) {
        reasonsAgreeing += 1
      } else {
        notes.push(
          `${entry.key}: reason ${found?.noRule ?? (found?.outlines.length ? "rules" : "none")}, golden ${entry.noRule}`
        )
      }
    }
    const paired = pairOutlines(entry.outlines, found?.outlines ?? [])
    expectedCount += entry.outlines.length
    outputCount += found?.outlines.length ?? 0
    pairs.push(...paired.pairs)
    notes.push(
      ...paired.unpairedExpected.map((outline) => `golden ${outline.key} (${kindName(outline)}) has no outline`)
    )
    notes.push(...paired.unpairedOutput.map((outline) => `${outline.key} (${kindName(outline)}) has no golden rule`))
  }
  const agreeing = (same: (pair: Pair) => boolean, what: string) => {
    const misses = pairs.filter((pair) => !same(pair))
    notes.push(...misses.map((pair) => `${pair.output.key}: ${what} differs from golden ${pair.expected.key}`))
    return share(pairs.length - misses.length, pairs.length)
  }
  const metrics = {
    coverage: share(covered, item.expected.provisions.length),
    "rule-recall": share(pairs.length, expectedCount),
    "rule-precision": share(pairs.length, outputCount),
    "kind-agreement": agreeing((pair) => kindName(pair.expected) === kindName(pair.output), "kind"),
    "bearer-agreement": agreeing((pair) => same(pair.expected.bearer, pair.output.bearer), "bearer"),
    "subject-agreement": agreeing((pair) => same(pair.expected.appliesTo, pair.output.appliesTo), "subject"),
    "request-type-agreement": agreeing(
      (pair) => [...pair.expected.requestTypes].sort().join() === [...pair.output.requestTypes].sort().join(),
      "request types"
    ),
    "no-rule-reasons": share(reasonsAgreeing, reasons)
  }
  return { verdict: verdictOf(metrics, "rule-recall", []), metrics, notes }
}

// ─── C. Shared vocabulary ────────────────────────────────────────────────────────────────────────

export type VocabularyOutput = { terms: TermContent[] }

export function scoreVocabulary(item: SharedVocabularyItem, output: VocabularyOutput | null): ItemScore {
  if (output === null) {
    return missing("no vocabulary")
  }
  const matches = alignTerms(item.expected.terms, output.terms)
  const recall = (kinds: readonly string[]) => {
    const wanted = item.expected.terms.filter((term) => kinds.includes(term.kind))
    return share(wanted.filter((term) => matches.has(term.key)).length, wanted.length)
  }
  const duplicates = candidateTermPairs(output.terms).filter((pair) => pair.score >= 1)
  const metrics = {
    "property-recall": recall(["property"]),
    "value-recall": recall(["value-set", "value"]),
    "thing-recall": recall(["thing", "category"]),
    duplicates: duplicates.length
  }
  const notes = [
    ...item.expected.terms.filter((term) => !matches.has(term.key)).map((term) => `missing ${term.kind} ${term.key}`),
    ...duplicates.map((pair) => `${pair.keys[0]} and ${pair.keys[1]} share a label`)
  ]
  return { verdict: verdictOf(metrics, "property-recall", ["duplicates"]), metrics, notes }
}

// ─── C-merge ─────────────────────────────────────────────────────────────────────────────────────

export type MergeOutput = {
  merges: { keep: string; merge: string[] }[]
  renames: { key: string; origin: string }[]
}

export function scoreMerge(item: VocabularyMergeItem, output: MergeOutput | null): ItemScore {
  if (output === null) {
    return missing("no answer")
  }
  const pairKey = (a: string, b: string) => [a, b].sort().join(" ")
  const expected = new Set(item.expected.merges.flatMap((merge) => merge.merge.map((key) => pairKey(merge.keep, key))))
  const given = output.merges.flatMap((merge) => merge.merge.map((key) => pairKey(merge.keep, key)))
  const right = given.filter((pair) => expected.has(pair))
  const distinct = new Set(item.expected.distinct)
  const wrongMerges = given.filter((pair) => pair.split(" ").every((key) => distinct.has(key)))
  const renameKey = (rename: { key: string; origin: string }) => `${rename.key} (${rename.origin})`
  const wanted = new Set(item.expected.renames.map(renameKey))
  const renamed = output.renames.map(renameKey).filter((rename) => wanted.has(rename))
  const metrics = {
    "merge-recall": share(new Set(right).size, expected.size),
    "merge-precision": share(right.length, given.length),
    "collisions-renamed": share(new Set(renamed).size, wanted.size),
    "lookalikes-merged": wrongMerges.length
  }
  const notes = [
    ...[...expected].filter((pair) => !right.includes(pair)).map((pair) => `not merged: ${pair}`),
    ...wrongMerges.map((pair) => `lookalikes merged: ${pair}`),
    ...[...wanted].filter((rename) => !renamed.includes(rename)).map((rename) => `not renamed: ${rename}`)
  ]
  return { verdict: verdictOf(metrics, "merge-recall", ["lookalikes-merged"]), metrics, notes }
}

// ─── F. Structure the rules ──────────────────────────────────────────────────────────────────────

/** One structured rule: the Zod-parsed rule (null when it fails), the problems code found, and the rule as given. */
export type StructuredOutput = { key: string; rule: RuleContent | null; raw: unknown; problems: { code: string }[] }
export type StructuringOutput = { rules: StructuredOutput[]; terms: TermContent[]; documents: T.GoverningDocument[] }

const stored = (rule: RuleContent): T.Rule => ({
  ...rule,
  provenance: { by: "system", at: "2026-01-01T00:00:00Z" },
  review: { status: "proposed", by: null, at: null, note: null },
  issues: []
})

const storedTerm = (term: TermContent): T.Term => ({
  ...term,
  labels: term.labels.map((label) => ({ ...label, provenance: { by: "system", at: "2026-01-01T00:00:00Z" } })),
  provenance: { by: "system", at: "2026-01-01T00:00:00Z" },
  review: { status: "proposed", by: null, at: null, note: null },
  issues: []
})

const ruleKind = (rule: RuleContent) =>
  rule.kind === "norm" ? `${rule.modality}${rule.check?.type === "judgment" ? "-judged" : ""}` : rule.kind

export function scoreStructuring(
  item: RuleStructuringItem,
  output: StructuringOutput | null,
  golden: { terms: readonly T.Term[]; documents: readonly T.GoverningDocument[]; settings: T.Settings },
  matches: ReadonlyMap<T.TermKey, TermMatch>
): ItemScore {
  if (output === null || output.rules.length === 0) {
    return missing("no structured rules")
  }
  const byKey = new Map(output.rules.map((rule) => [rule.key, rule]))
  const notes: string[] = []
  const pairs = item.expected.rules.flatMap((expected) => {
    const found = byKey.get(expected.key)
    if (!found) {
      notes.push(`${expected.key}: not structured`)
      return []
    }
    return [{ expected, found }]
  })
  const valid = pairs.filter((pair) => pair.found.rule !== null)
  const clean = valid.filter((pair) => pair.found.problems.length === 0)
  notes.push(
    ...pairs.filter((pair) => pair.found.rule === null).map((pair) => `${pair.expected.key}: fails Zod`),
    ...valid
      .filter((pair) => pair.found.problems.length > 0)
      .map((pair) => `${pair.expected.key}: ${pair.found.problems.map((problem) => problem.code).join(", ")}`)
  )
  const kinds = valid.filter(
    (pair) => pair.found.rule !== null && ruleKind(pair.found.rule) === ruleKind(pair.expected)
  )
  const keys = {
    toPipeline: (key: string) => (isCoreKey(key) ? key : matches.get(key)?.pipeline),
    toReference: (key: string) => {
      if (isCoreKey(key)) {
        return key
      }
      return [...matches.values()].find((match) => match.pipeline === key)?.golden
    }
  }
  const agreements = valid.flatMap((pair) => {
    if (pair.found.rule === null) {
      return []
    }
    const result = checkAgreement({
      reference: { rule: stored(pair.expected), terms: golden.terms, documents: golden.documents },
      pipeline: { rule: stored(pair.found.rule), terms: output.terms.map(storedTerm), documents: output.documents },
      keys,
      settings: golden.settings
    })
    if (result?.isComparable && result.agreeing < result.cases) {
      notes.push(`${pair.expected.key}: checks agree in ${result.agreeing} of ${result.cases} cases`)
    }
    return result?.isComparable ? [result.agreeing / result.cases] : []
  })
  const metrics = {
    structured: share(pairs.length, item.expected.rules.length),
    "valid-before-repair": share(valid.length, pairs.length),
    "without-problems": share(clean.length, pairs.length),
    "kind-agreement": share(kinds.length, valid.length),
    "check-agreement":
      agreements.length === 0 ? null : agreements.reduce((sum, value) => sum + value, 0) / agreements.length,
    problems: output.rules.reduce((sum, rule) => sum + rule.problems.length, 0)
  }
  return { verdict: verdictOf(metrics, "valid-before-repair", ["problems"]), metrics, notes }
}

// ─── F's retry ───────────────────────────────────────────────────────────────────────────────────

export type RetryOutput = { fixed: boolean; remaining: string[]; collateral: JsonPath[]; wordingChanged: boolean }

export function scoreRetry(output: RetryOutput | null): ItemScore {
  if (output === null) {
    return missing("not retried")
  }
  const metrics = { fixed: output.fixed ? 1 : 0, "collateral-changes": output.collateral.length }
  const notes = [
    ...output.remaining.map((problem) => `still: ${problem}`),
    ...output.collateral.map((path) => `changed outside the problems: ${path.join(".")}`)
  ]
  return { verdict: verdictOf(metrics, "fixed", ["collateral-changes"]), metrics, notes }
}

// ─── Consolidation ───────────────────────────────────────────────────────────────────────────────

export type ConsolidationOutput = { overrides: { rule: string; target: string }[]; invalid: number }

export function scoreConsolidation(item: ConsolidationItem, output: ConsolidationOutput | null): ItemScore {
  if (output === null) {
    return missing("no consolidation")
  }
  const pairKey = (pair: { rule: string; target: string }) => `${pair.rule} > ${pair.target}`
  const expected = new Set(item.expected.overrides.map(pairKey))
  const given = output.overrides.map(pairKey)
  const right = given.filter((pair) => expected.has(pair))
  const metrics = {
    "override-recall": share(new Set(right).size, expected.size),
    "override-precision": share(right.length, given.length),
    "invalid-overrides": output.invalid
  }
  const notes = [
    ...[...expected].filter((pair) => !right.includes(pair)).map((pair) => `not restored: ${pair}`),
    ...given.filter((pair) => !expected.has(pair)).map((pair) => `not in the golden: ${pair}`)
  ]
  return { verdict: verdictOf(metrics, "override-recall", ["invalid-overrides"]), metrics, notes }
}

/** The golden-to-output alignment of terms, for translating subjects and reads. */
export const termAlignment = (golden: readonly TermContent[], output: readonly TermContent[]) =>
  alignTerms(golden, output)

export { storedTerm }
