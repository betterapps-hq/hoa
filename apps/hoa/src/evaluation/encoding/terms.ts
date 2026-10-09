import { coreTerms } from "@/schema/coreTerms"
import type { TermKey } from "@/schema/types"
import type { TermContent } from "@/schema/zod"
import { matchLabel } from "@/text/match"

// Term alignment (implementation-plan.md, Evaluation round 1): which pipeline term is each golden term, matched by key
// or else by label, and term recall. The check-agreement scorer translates facts between the two vocabularies with the
// same alignment.

export type TermMatch = { golden: TermKey; pipeline: TermKey; by: "key" | "label"; score: number }

const coreKeys = new Set(coreTerms.map((term) => term.key))

/** Whether a key names a core term, which every vocabulary shares under the same key. */
export const isCoreKey = (key: TermKey) => coreKeys.has(key)

/** The term a property or value belongs to, which must align for the two to be the same term. */
function parentOf(term: TermContent) {
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
 * Aligns golden terms with pipeline terms one to one: the same key and kind, else the best label match of the same kind
 * whose parent (a property's thing, a value's set) is the golden parent's match. Core terms align with themselves.
 */
export function alignTerms(golden: readonly TermContent[], pipeline: readonly TermContent[]) {
  const pipelineByKey = new Map(pipeline.map((term) => [term.key, term]))
  const matches = new Map<TermKey, TermMatch>()
  const taken = new Set<TermKey>()
  const aligned = (key: TermKey) => (isCoreKey(key) ? key : matches.get(key)?.pipeline)

  for (const term of golden.toSorted((a, b) => order(a) - order(b))) {
    const same = pipelineByKey.get(term.key)
    if ((same && same.kind === term.kind) || (!same && isCoreKey(term.key))) {
      matches.set(term.key, { golden: term.key, pipeline: term.key, by: "key", score: 1 })
      taken.add(term.key)
      continue
    }
    const parent = parentOf(term)
    const wantedParent = parent === null ? null : aligned(parent)
    let best: TermMatch | null = null
    for (const candidate of pipeline) {
      if (candidate.kind !== term.kind || taken.has(candidate.key)) {
        continue
      }
      if (wantedParent !== undefined && wantedParent !== null && parentOf(candidate) !== wantedParent) {
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
