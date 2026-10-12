import { candidateTermPairs } from "@/encoding/consolidate"
import { citableProvisions, definingProvisions } from "@/encoding/steps/definedTerms"
import type { Outline } from "@/encoding/steps/outline"
import { kindName } from "@/encoding/steps/outline"
import { keySegment } from "@/encoding/steps/termKeys"
import { isStopWord } from "@/lib/search"
import { coreTerms } from "@/schema/coreTerms"
import type * as T from "@/schema/types"
import type { RuleContent, TermContent } from "@/schema/zod"
import { matchLabel } from "@/text/match"
import { labelForms, singularOf } from "@/text/normalize"
import { checkAgreement } from "../checkAgreement"
import { alignTerms, isCoreKey, type TermMatch, type TermPair } from "../terms"
import type {
  ConsolidationItem,
  DefinedTermsItem,
  RuleFindingItem,
  RuleStructuringItem,
  SharedVocabularyItem,
  VocabularyMergeItem
} from "./datasets"

// Scores code computes for one dataset item: what a step produced against the item's expected output, and a verdict:
// correct, partly correct (with what's wrong), wrong or missing. What code can't decide (whether a rule is faithful,
// whether two terms mean the same) is left to the coding agent from the comparison files (evaluation.md, Judging by the
// coding agent).

export type Verdict = "correct" | "partly" | "wrong" | "missing"

export type ItemScore = {
  verdict: Verdict
  /** Shares in [0, 1], counts, or null where nothing was there to measure. */
  metrics: Record<string, number | null>
  /** What's wrong, by key. */
  notes: string[]
}

export const missing = (why: string): ItemScore => ({ verdict: "missing", metrics: {}, notes: [why] })

const share = (count: number, of: number) => (of === 0 ? null : count / of)

/**
 * Correct when every share is 1 and every count of faults 0; wrong when the primary share is 0; partly otherwise.
 * `info` metrics (counts that are neither shares nor faults) don't count.
 */
function verdictOf(
  metrics: Record<string, number | null>,
  primary: string,
  faults: readonly string[],
  info: readonly string[] = []
): Verdict {
  const primaryValue = metrics[primary]
  if (primaryValue === 0) {
    return "wrong"
  }
  const shares = Object.entries(metrics).filter(([name]) => !faults.includes(name) && !info.includes(name))
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

const preferredText = (term: TermContent) =>
  (term.labels.find((label) => label.role === "preferred") ?? term.labels[0])?.text ?? term.key

/** A term's preferred label as code keys it (lowercase, singular, hyphenated). */
const preferredForm = (term: TermContent) => keySegment(preferredText(term))

const citedIn = (term: TermContent) => new Set(term.citations.map((citation) => citation.provisionKey))
const isDefinedThing = (term: TermContent) =>
  (term.kind === "thing" || term.kind === "category") && !isCoreKey(term.key)

/** The best label match between two terms' labels, either way round. */
function labelScore(a: TermContent, b: TermContent) {
  let best = 0
  for (const left of a.labels) {
    for (const right of b.labels) {
      best = Math.max(best, matchLabel(left.text, right)?.score ?? 0, matchLabel(right.text, left)?.score ?? 0)
    }
  }
  return best
}

/**
 * Golden things and categories paired one to one with output terms of the same kind whose labels match (exactly or
 * fuzzily) and whose citations share a provision: the best label match first, then the most shared citations. A golden
 * term citing none of the provisions the step could cite (a thing a category is of, defined elsewhere) needs an exact
 * label match instead. Keys play no part, so a key code built from a label is never penalized for its spelling.
 */
export function labelCitationPairs(
  golden: readonly TermContent[],
  output: readonly TermContent[],
  citable: ReadonlySet<string>
): TermPair[] {
  const options = golden.filter(isDefinedThing).flatMap((left) =>
    output.flatMap((right) => {
      if (right.kind !== left.kind || !isDefinedThing(right)) {
        return []
      }
      const cited = citedIn(right)
      const shared = left.citations.filter((citation) => cited.has(citation.provisionKey)).length
      const score = labelScore(left, right)
      const uncitable = !left.citations.some((citation) => citable.has(citation.provisionKey))
      return score > 0 && (shared > 0 || (uncitable && score === 1))
        ? [{ golden: left.key, pipeline: right.key, score, shared }]
        : []
    })
  )
  const pairs: TermPair[] = []
  const used = new Set<string>()
  for (const option of options.toSorted((a, b) => b.score - a.score || b.shared - a.shared)) {
    if (!used.has(`golden ${option.golden}`) && !used.has(`output ${option.pipeline}`)) {
      pairs.push({ golden: option.golden, pipeline: option.pipeline })
      used.add(`golden ${option.golden}`)
      used.add(`output ${option.pipeline}`)
    }
  }
  return pairs
}

/**
 * B's scores. Things and categories match the golden by labels and citations (`labelCitationPairs`), the terms under
 * them by label within their matched parent. A thing or category the golden lacks that cites a provision the step was
 * given as defining is a golden-gap candidate for the coding agent; `confirmedGaps` (preferred labels the agent
 * confirmed in the run's judgments.json) are counted as golden gaps rather than extra things.
 */
export function scoreDefinedTerms(
  item: DefinedTermsItem,
  output: DefinedTermsOutput | null,
  confirmedGaps: readonly string[] = []
): ItemScore {
  if (output === null) {
    return missing("no terms")
  }
  const expected = item.expected.terms
  const citable = new Set(citableProvisions(item.input.definitions, item.input.candidates))
  const matches = alignTerms(expected, output.terms, labelCitationPairs(expected, output.terms, citable), {
    pairedOnly: isDefinedThing
  })
  const recall = (keep: (term: TermContent) => boolean) => {
    const wanted = expected.filter(keep)
    return share(
      wanted.filter(
        (term) => matches.has(term.key) && output.terms.some((o) => o.key === matches.get(term.key)?.pipeline)
      ).length,
      wanted.length
    )
  }
  const defining = new Set(definingProvisions(item.input.definitions, item.input.candidates))
  // A thing the document defines cites a provision the step was given; a thing the golden adds only so a category or
  // property has something to be of ("a thing on the outside of a Unit") isn't one the step could find.
  const isThing = (term: TermContent) =>
    term.kind === "thing" &&
    !isCoreKey(term.key) &&
    term.citations.some((citation) => defining.has(citation.provisionKey))
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
  const confirmed = new Set(confirmedGaps.map((label) => keySegment(label)))
  const unmatched = offered.filter((term) => !matched.has(term.key))
  // A returned term the golden has under the other kind (a thing for a category, or the reverse): a kind miss, not a gap.
  const otherKind = new Map(
    unmatched.flatMap((term) => {
      const cited = citedIn(term)
      const golden = expected.find(
        (other) =>
          isDefinedThing(other) &&
          other.kind !== term.kind &&
          labelScore(other, term) > 0 &&
          other.citations.some((citation) => cited.has(citation.provisionKey))
      )
      return golden ? [[term, golden] as const] : []
    })
  )
  const gapCandidates = unmatched.filter(
    (term) =>
      !coreDuplicates.includes(term) &&
      !otherKind.has(term) &&
      term.citations.some((citation) => defining.has(citation.provisionKey))
  )
  const gaps = gapCandidates.filter((term) => confirmed.has(preferredForm(term)))
  const extras = unmatched.filter((term) => !gaps.includes(term))
  const metrics = {
    "thing-recall": recall(isThing),
    "category-recall": recall((term) => term.kind === "category"),
    "refinement-recall": recall((term) => isCoreKey(term.key)),
    "criteria-property-recall": recall((term) => term.kind === "property"),
    "criteria-value-recall": recall((term) => term.kind === "value-set" || term.kind === "value"),
    "extra-things": extras.length,
    "golden-gaps": gaps.length,
    "core-duplicates": coreDuplicates.length,
    "unresolved-criteria": unresolved.length
  }
  const defined = (term: TermContent) =>
    term.citations.filter((citation) => defining.has(citation.provisionKey)).map((citation) => citation.provisionKey)
  const notes = [
    ...expected
      .filter((term) => !output.terms.some((o) => o.key === matches.get(term.key)?.pipeline))
      .map((term) => `missing ${term.kind} ${term.key} "${preferredText(term)}"`),
    ...extras.map((term) => {
      const golden = otherKind.get(term)
      return golden
        ? `kind differs: ${term.kind} ${term.key} "${preferredText(term)}" is the golden ${golden.kind} ${golden.key}`
        : `not in the golden: ${term.kind} ${term.key} "${preferredText(term)}"`
    }),
    ...gapCandidates
      .filter((term) => !gaps.includes(term))
      .map(
        (term) =>
          `golden-gap candidate: ${term.kind} "${preferredText(term)}" cites ${defined(term).join(", ")}; confirm it in judgments.json if that text defines it`
      ),
    ...gaps.map((term) => `golden gap (judged): ${term.kind} "${preferredText(term)}"`),
    ...coreDuplicates.map((term) => `${term.key} has a core term's label`),
    ...unresolved.map((text) => `criteria: ${text} (undeclared)`)
  ]
  return {
    verdict: verdictOf(
      metrics,
      "thing-recall",
      ["extra-things", "core-duplicates", "unresolved-criteria"],
      ["golden-gaps"]
    ),
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

// Words a rule summary needs whatever it says, so they don't make two summaries alike.
const summaryFiller = new Set(["must", "may", "not", "no", "only", "if", "its", "their", "that", "this", "any", "each"])

/** A summary's content words, singular, without stop words and modal filler. */
function summaryWords(summary: string) {
  return new Set(
    summary
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 1 && !isStopWord(word) && !summaryFiller.has(word))
      .map(singularOf)
  )
}

/** The share of a's summary words that b's summary also has. */
function containment(a: Outline, b: Outline) {
  const words = summaryWords(a.summary)
  const other = summaryWords(b.summary)
  return words.size === 0 ? 0 : [...words].filter((word) => other.has(word)).length / words.size
}

/** How alike two summaries are: the smaller share of either's words that the other has. */
const likeness = (a: Outline, b: Outline) => Math.min(containment(a, b), containment(b, a))

/** An output outline whose summary this much inside an expected rule's is part of that rule, split finer. */
const partShare = 0.7

/** Whether a provision is under another: "rules:4.2(a)" and "rules:4.2/p2" are under "rules:4.2". */
const under = (key: string, parent: string) => key.startsWith(parent) && /^[(/]/.test(key.slice(parent.length))

/** Whether two outlines' provisions are related: one under the other, or one outline citing the other's provision. */
const related = (a: Outline, b: Outline) =>
  under(a.provisionKey, b.provisionKey) ||
  under(b.provisionKey, a.provisionKey) ||
  a.citations.includes(b.provisionKey) ||
  b.citations.includes(a.provisionKey)

/**
 * Pairs expected and output outlines of one provision: the same key, then the most alike summaries, then the same
 * kind, then in order. An unpaired output outline whose summary lies inside an expected rule's is a part of that rule:
 * rules split finer than the golden's (one per requirement a reviewer could find unmet) aren't extras.
 */
function pairOutlines(expected: readonly Outline[], output: readonly Outline[]) {
  const pairs: Pair[] = []
  const left = [...expected]
  const right = [...output]
  const pair = (a: Outline, b: Outline) => {
    pairs.push({ expected: a, output: b })
    left.splice(left.indexOf(a), 1)
    right.splice(right.indexOf(b), 1)
  }
  const take = (match: (a: Outline, b: Outline) => boolean) => {
    for (const a of left.slice()) {
      const b = right.find((candidate) => match(a, candidate))
      if (b) {
        pair(a, b)
      }
    }
  }
  take((a, b) => a.key === b.key)
  const alike = left
    .flatMap((a) => right.map((b) => ({ a, b, score: likeness(a, b) })))
    .filter((option) => option.score >= 0.5)
    .toSorted((x, y) => y.score - x.score)
  for (const { a, b } of alike) {
    if (left.includes(a) && right.includes(b)) {
      pair(a, b)
    }
  }
  const parts: Pair[] = []
  for (const b of right.slice()) {
    const whole = expected
      .map((a) => ({ a, share: containment(b, a) }))
      .filter((option) => option.share >= partShare)
      .toSorted((x, y) => y.share - x.share)[0]
    if (whole) {
      parts.push({ expected: whole.a, output: b })
      right.splice(right.indexOf(b), 1)
    }
  }
  // A rule split into parts is found, though no one outline is all of it.
  for (const a of left.slice()) {
    if (parts.some((part) => part.expected === a)) {
      left.splice(left.indexOf(a), 1)
    }
  }
  take((a, b) => kindName(a) === kindName(b))
  take(() => true)
  return { pairs, parts, unpairedExpected: left, unpairedOutput: right }
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
  const unpairedExpected: Outline[] = []
  const unpairedOutput: Outline[] = []
  let partCount = 0
  let splitCount = 0
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
    partCount += paired.parts.length
    splitCount += new Set(
      paired.parts.map((part) => part.expected).filter((rule) => !paired.pairs.some((p) => p.expected === rule))
    ).size
    unpairedExpected.push(...paired.unpairedExpected)
    unpairedOutput.push(...paired.unpairedOutput)
  }
  // A part can sit on a related provision: a list item under the golden's lead-in, or a provision either one cites.
  const allExpected = item.expected.provisions.flatMap((entry) => entry.outlines)
  for (const b of unpairedOutput.slice()) {
    const whole = allExpected
      .filter((a) => related(a, b))
      .map((a) => ({ a, share: containment(b, a) }))
      .filter((option) => option.share >= partShare)
      .toSorted((x, y) => y.share - x.share)[0]
    if (whole) {
      partCount += 1
      unpairedOutput.splice(unpairedOutput.indexOf(b), 1)
      if (unpairedExpected.includes(whole.a)) {
        splitCount += 1
        unpairedExpected.splice(unpairedExpected.indexOf(whole.a), 1)
      }
    }
  }
  // An ambiguous passage's readings are alternatives: finding one reading's rules doesn't miss the others'.
  const missed = new Set(unpairedExpected.map((outline) => outline.key))
  for (const options of item.expected.readings ?? []) {
    const chosen = options.find((keys) => keys.some((key) => !missed.has(key)))
    for (const key of options.flat()) {
      if (chosen && !chosen.includes(key) && missed.has(key)) {
        missed.delete(key)
        expectedCount -= 1
        unpairedExpected.splice(
          unpairedExpected.findIndex((outline) => outline.key === key),
          1
        )
      }
    }
  }
  notes.push(...unpairedExpected.map((outline) => `golden ${outline.key} (${kindName(outline)}) has no outline`))
  notes.push(...unpairedOutput.map((outline) => `${outline.key} (${kindName(outline)}) has no golden rule`))
  const agreeing = (same: (pair: Pair) => boolean, what: string) => {
    const misses = pairs.filter((pair) => !same(pair))
    notes.push(...misses.map((pair) => `${pair.output.key}: ${what} differs from golden ${pair.expected.key}`))
    return share(pairs.length - misses.length, pairs.length)
  }
  const metrics = {
    coverage: share(covered, item.expected.provisions.length),
    "rule-recall": share(pairs.length + splitCount, expectedCount),
    "rule-precision": share(pairs.length + partCount, outputCount),
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

/** C's terms against the golden's, with the pairs the coding agent judged the same under another name. */
export function scoreVocabulary(
  item: SharedVocabularyItem,
  output: VocabularyOutput | null,
  paired: readonly TermPair[] = []
): ItemScore {
  if (output === null) {
    return missing("no vocabulary")
  }
  const matches = alignTerms(item.expected.terms, output.terms, paired)
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
