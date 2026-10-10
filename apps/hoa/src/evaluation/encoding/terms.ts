import { compareCodeUnits } from "@/rulebook/canonical"
import { coreTerms } from "@/schema/coreTerms"
import type { TermKey } from "@/schema/types"
import type { TermContent } from "@/schema/zod"
import { matchLabel } from "@/text/match"

// Term alignment (implementation-plan.md, Evaluation round 1): which pipeline term is each golden term, matched by key,
// else by the coding agent's pairing (pairs.json in the run folder, pairs.ts), else by label, and term recall. The
// check-agreement scorer translates facts between the two vocabularies with the same alignment.

export type TermMatch = { golden: TermKey; pipeline: TermKey; by: "key" | "agent" | "label"; score: number }

/** A golden term and the pipeline term the coding agent found to mean the same. */
export type TermPair = { golden: TermKey; pipeline: TermKey }

const coreKeys = new Set(coreTerms.map((term) => term.key))

/** Whether a key names a core term, which every vocabulary shares under the same key. */
export const isCoreKey = (key: TermKey) => coreKeys.has(key)

/** The term a property or value belongs to, which must align for the two to be the same term. */
export function parentOf(term: TermContent) {
  if (term.kind === "property" || term.kind === "category") {
    return term.of
  }
  return term.kind === "value" ? term.set : null
}

// Things, value sets and units first, so properties, categories and values can require their parents to align.
const order = (term: TermContent) => (parentOf(term) === null ? 0 : 1)

function labelScore(golden: TermContent, pipeline: TermContent) {
  let best = 0
  for (const label of golden.labels) {
    for (const candidate of pipeline.labels) {
      best = Math.max(best, matchLabel(label.text, candidate)?.score ?? 0)
    }
  }
  return best
}

/**
 * Aligns golden terms with pipeline terms one to one: the same key and kind (every one reserved before any other
 * match), else the coding agent's pair, else the best label match; a pair and a label match must be of the same kind,
 * with a parent (a property's thing, a value's set) that is the golden parent's match. A parent that isn't among the
 * golden terms aligned (a thing the golden list only refers to) must be the same key. Core terms align with themselves.
 */
export function alignTerms(
  golden: readonly TermContent[],
  pipeline: readonly TermContent[],
  paired: readonly TermPair[] = []
) {
  const pipelineByKey = new Map(pipeline.map((term) => [term.key, term]))
  const goldenKeys = new Set(golden.map((term) => term.key))
  const pairedByGolden = new Map(paired.map((pair) => [pair.golden, pair.pipeline]))
  const matches = new Map<TermKey, TermMatch>()
  const taken = new Set<TermKey>()
  const aligned = (key: TermKey) => (isCoreKey(key) || !goldenKeys.has(key) ? key : matches.get(key)?.pipeline)

  for (const term of golden) {
    const same = pipelineByKey.get(term.key)
    if ((same && same.kind === term.kind) || (!same && isCoreKey(term.key))) {
      matches.set(term.key, { golden: term.key, pipeline: term.key, by: "key", score: 1 })
      taken.add(term.key)
    }
  }
  for (const term of golden.toSorted((a, b) => order(a) - order(b))) {
    if (matches.has(term.key)) {
      continue
    }
    const parent = parentOf(term)
    const wantedParent = parent === null ? null : aligned(parent)
    const fits = (candidate: TermContent) =>
      candidate.kind === term.kind &&
      !taken.has(candidate.key) &&
      wantedParent !== undefined &&
      (wantedParent === null || parentOf(candidate) === wantedParent)
    const pick = pipelineByKey.get(pairedByGolden.get(term.key) ?? "")
    if (pick && fits(pick)) {
      matches.set(term.key, { golden: term.key, pipeline: pick.key, by: "agent", score: 1 })
      taken.add(pick.key)
      continue
    }
    let best: TermMatch | null = null
    for (const candidate of pipeline) {
      if (!fits(candidate)) {
        continue
      }
      const score = labelScore(term, candidate)
      if (score > (best?.score ?? 0)) {
        best = { golden: term.key, pipeline: candidate.key, by: "label", score }
      }
    }
    if (best) {
      matches.set(term.key, best)
      taken.add(best.pipeline)
    }
  }
  return matches
}

/** Golden terms of one kind with no match, and the unmatched pipeline terms of that kind they may be. */
export type UnmatchedTermGroup = {
  kind: TermContent["kind"]
  /** For properties, categories and values: the golden parent and the pipeline term it aligns with. */
  parent: { golden: TermKey; pipeline: TermKey } | null
  reference: TermContent[]
  pipeline: TermContent[]
}

/**
 * The terms left for the coding agent to pair by meaning: golden terms among `keys` (and their parents) that `matches`
 * leaves without a match, grouped by kind and, for a property, category or value, by its aligned parent, each with the
 * unmatched pipeline terms that could be it. A term whose parent has no match waits until the parent is paired; a group
 * with no candidates is left out.
 */
export function unmatchedTermGroups(
  golden: readonly TermContent[],
  pipeline: readonly TermContent[],
  matches: ReadonlyMap<TermKey, TermMatch>,
  keys: ReadonlySet<TermKey>
): UnmatchedTermGroup[] {
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
  const aligned = (key: TermKey) => (isCoreKey(key) ? key : matches.get(key)?.pipeline)
  const groups = new Map<string, UnmatchedTermGroup>()
  for (const term of golden) {
    if (!wanted.has(term.key) || matches.has(term.key)) {
      continue
    }
    const parent = parentOf(term)
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

/** The share of golden terms (core keys left out: every vocabulary has them) the alignment matched. */
export function termRecall(goldenKeys: readonly TermKey[], matches: ReadonlyMap<TermKey, TermMatch>) {
  const keys = goldenKeys.filter((key) => !isCoreKey(key))
  const missing = keys.filter((key) => !matches.has(key))
  return { recall: keys.length === 0 ? 1 : (keys.length - missing.length) / keys.length, terms: keys.length, missing }
}

/** Every string anywhere in a value that is one of the given term keys. */
export function termKeysIn(value: unknown, keys: ReadonlySet<TermKey>) {
  const found = new Set<TermKey>()
  const visit = (item: unknown) => {
    if (typeof item === "string") {
      if (keys.has(item)) {
        found.add(item)
      }
    } else if (Array.isArray(item)) {
      item.forEach(visit)
    } else if (typeof item === "object" && item !== null) {
      Object.values(item).forEach(visit)
    }
  }
  visit(value)
  return found
}
