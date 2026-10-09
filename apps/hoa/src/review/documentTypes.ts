import { genericDocumentKinds, type DocumentKind } from "@/documents/applicationDocumentKinds"
import { createEngineVocabulary, type EngineVocabulary } from "@/engine/vocabulary"
import type * as T from "@/schema/types"

// The document types page classification chooses from (application-review.md, Classify): every document thing, or
// category of one, that a document check in the request type names, with its labels and definition, then the generic
// kinds the rulebook doesn't define itself.

/** The rulebook's vocabulary: its own terms, the core terms it proposes, and the portal's core terms. */
export const rulebookVocabulary = (rulesFile: T.RulesFile) =>
  createEngineVocabulary([...rulesFile.proposedCore, ...rulesFile.terms])

/** Every label of a term, preferred first; avoided labels left out. */
export function labelsOf(vocabulary: EngineVocabulary, key: T.TermKey) {
  const labels = vocabulary.get(key)?.labels ?? []
  return [
    ...labels.filter((label) => label.role === "preferred"),
    ...labels.filter((label) => label.role === "alternative" || label.role === "hidden")
  ].map((label) => label.text)
}

/**
 * What a term is, for the models: its definition, or for a category without one, its criteria when they're text (a
 * plot plan: "a drawing of the Unit showing its boundaries and where the proposed Work goes").
 */
export function definitionOf(vocabulary: EngineVocabulary, key: T.TermKey) {
  const term = vocabulary.get(key)
  if (term?.definition) {
    return term.definition
  }
  return term?.kind === "category" && term.criteria.type === "text" ? term.criteria.text : null
}

/** Rules a request of this type considers, of the kinds an application evaluates. */
export function rulesInRequestType(rulesFile: T.RulesFile, requestType: T.TermKey) {
  return rulesFile.rules.filter(
    (rule): rule is T.NormRule | T.DiscretionRule =>
      (rule.kind === "norm" || rule.kind === "discretion") && rule.requestTypes.includes(requestType)
  )
}

export function documentTypes(rulesFile: T.RulesFile, requestType: T.TermKey): DocumentKind[] {
  const vocabulary = rulebookVocabulary(rulesFile)
  const named = new Set(
    rulesInRequestType(rulesFile, requestType).flatMap((rule) =>
      rule.kind === "norm" && rule.check?.type === "document" ? [rule.check.document] : []
    )
  )
  // A category of a named document counts too: a plot plan is a kind of plans.
  const categories = [...rulesFile.proposedCore, ...rulesFile.terms].filter(
    (term) => term.kind === "category" && [...named].some((key) => vocabulary.isKindOf(term.key, key))
  )
  const fromRulebook = [...named, ...categories.map((term) => term.key)].map((key) => ({
    key,
    labels: labelsOf(vocabulary, key),
    definition: definitionOf(vocabulary, key) ?? ""
  }))
  const keys = new Set(fromRulebook.map((kind) => kind.key))
  return [...fromRulebook, ...genericDocumentKinds.filter((kind) => !keys.has(kind.key))]
}
