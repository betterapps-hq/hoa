import type * as T from "@/schema/types"
import { createVocabulary, type Vocabulary } from "@/schema/vocabulary"
import type { TermContent } from "@/schema/zod"
import * as D from "./decimal"

// The vocabulary as evaluation reads it: properties, broader values, parties and units (schema.md, Vocabulary).

export type PropertyTerm = Extract<TermContent, { kind: "property" }>
type CategoryTerm = Extract<TermContent, { kind: "category" }>

export type Unit = { dimension: T.Dimension; perBase: D.Exact | null } // null: converts to nothing

export type EngineVocabulary = Vocabulary & {
  property: (key: T.TermKey) => PropertyTerm | undefined
  category: (key: T.TermKey) => CategoryTerm | undefined
  unit: (key: T.TermKey) => Unit | undefined
  /**
   * Whether a stated term falls under a listed one: the same value or one of its broader values, the same party or a
   * category of it (schema.md, Expressions 8; Parties as values).
   */
  isUnder: (term: T.TermKey, listed: T.TermKey) => boolean
}

export function createEngineVocabulary(terms: TermContent[]): EngineVocabulary {
  const vocabulary = createVocabulary(terms)
  const units = new Map<T.TermKey, Unit>()

  function broaderOf(key: T.TermKey, seen = new Set<T.TermKey>()): Set<T.TermKey> {
    const found = vocabulary.get(key)
    if (found?.kind !== "value" || seen.has(key)) {
      return seen
    }
    seen.add(key)
    found.broader.forEach((broader) => broaderOf(broader, seen))
    return seen
  }

  return {
    ...vocabulary,
    property: (key) => {
      const found = vocabulary.get(key)
      return found?.kind === "property" ? found : undefined
    },
    category: (key) => {
      const found = vocabulary.get(key)
      return found?.kind === "category" ? found : undefined
    },
    unit: (key) => {
      const cached = units.get(key)
      if (cached) {
        return cached
      }
      const found = vocabulary.get(key)
      if (found?.kind !== "unit") {
        return undefined
      }
      const unit = { dimension: found.dimension, perBase: found.perBase === null ? null : D.exact(found.perBase) }
      units.set(key, unit)
      return unit
    },
    isUnder: (term, listed) =>
      term === listed || broaderOf(term).has(listed) || (vocabulary.isParty(term) && vocabulary.isKindOf(term, listed))
  }
}

/** An amount in its dimension's base unit; a unit that doesn't convert counts as its own base. */
export function toBase(vocabulary: EngineVocabulary, value: D.Exact, unitKey: T.TermKey) {
  const unit = vocabulary.unit(unitKey)
  if (!unit) {
    return undefined
  }
  return { value: unit.perBase ? D.multiply(value, unit.perBase) : value, dimension: unit.dimension }
}
