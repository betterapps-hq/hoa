import type { SearchSetup } from "@/lib/search"
import { coreTerms } from "@/schema/coreTerms"
import type * as T from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"
import type { TermContent } from "@/schema/zod"

// The terms a picker offers: the organization's terms that aren't rejected, and the core terms they don't refine.

export type TermOption = { key: T.TermKey; label: string; hint: string }

/** The vocabulary and the terms a picker can offer, which every editor reads. */
export type TermCatalog = { vocabulary: Vocabulary; terms: TermContent[] }

export function pickableTerms(terms: T.Term[]): TermContent[] {
  const live = terms.filter((term) => term.review.status !== "rejected")
  const refined = new Set(live.map((term) => term.key))
  return [...coreTerms.filter((term) => !refined.has(term.key)), ...live]
}

export function termOptions({ terms, vocabulary }: TermCatalog, include: (term: TermContent) => boolean) {
  return terms
    .filter(include)
    .map((term): TermOption => ({ key: term.key, label: vocabulary.label(term.key), hint: term.key }))
    .toSorted((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key))
}

/** A picker's search: the label counts more than the key. */
export const termOptionSearchSetup: SearchSetup<TermOption> = {
  id: (option) => option.key,
  fields: { label: { text: (option) => option.label, boost: 2 }, key: { text: (option) => option.hint } }
}

/** Which terms fit a field. */
export const termFilters = {
  parties: (vocabulary: Vocabulary) => (term: TermContent) => vocabulary.isParty(term.key),
  requestTypes: (term: TermContent) => term.kind === "thing" && term.request !== null,
  subjects: (term: TermContent) => term.kind === "thing" || term.kind === "category",
  categories: (term: TermContent) => term.kind === "category",
  /** The properties a subject has: its thing's, and its categories'. Any property without a subject. */
  propertiesOf: (vocabulary: Vocabulary, subject: T.TermKey | null) => (term: TermContent) =>
    term.kind === "property" && (subject === null || vocabulary.isKindOf(subject, term.of)),
  valuesOf: (set: T.TermKey | null) => (term: TermContent) =>
    term.kind === "value" && (set === null || term.set === set),
  units: (dimension: T.Dimension | null) => (term: TermContent) =>
    term.kind === "unit" && (dimension === null || term.dimension === dimension),
  documents: (vocabulary: Vocabulary) => (term: TermContent) => {
    const thing = vocabulary.get(vocabulary.thingOf(term.key))
    return (term.kind === "thing" || term.kind === "category") && thing?.kind === "thing" && thing.nature === "document"
  }
}
