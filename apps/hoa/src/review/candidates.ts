import type * as T from "@/schema/types"
import { definitionOf, labelsOf, rulebookVocabulary, rulesInRequestType } from "./documentTypes"

// The candidate entity types for subject identification (application-review.md, Subjects): every thing a rule in the
// request type applies to (a category counts as its thing, listed with it), the things those can reference (a gate
// references its fence run), and the parties whose signatures a document check needs. The request, the lot and the
// community aren't candidates: code adds them.

export type CandidateType = {
  key: T.TermKey
  labels: string[]
  definition: string | null
  /** Its kinds (the rulebook's categories of it), which tell the model what to split apart and what each one is. */
  categories: { key: T.TermKey; labels: string[]; definition: string | null }[]
  /** Its reference properties: what it can refer to. */
  references: { property: T.TermKey; labels: string[]; to: T.TermKey | null }[]
  /** A party whose people sign documents: each one named in the packet is an entity. */
  isSigner: boolean
}

/** The things code adds to every request: the request itself, its lot and the community. */
export const rootTypes = (requestType: T.TermKey) => [requestType, "lot", "community"]

export function candidateTypes(rulesFile: T.RulesFile, requestType: T.TermKey): CandidateType[] {
  const vocabulary = rulebookVocabulary(rulesFile)
  const terms = [...rulesFile.proposedCore, ...rulesFile.terms]
  const rules = rulesInRequestType(rulesFile, requestType)
  const roots = new Set(rootTypes(requestType))
  const subjects = rules.flatMap((rule) => (rule.appliesTo ? [rule.appliesTo] : []))
  const signers = new Set(
    rules.flatMap((rule) => (rule.kind === "norm" && rule.check?.type === "document" ? rule.check.signedBy : []))
  )
  const referencesOf = (thing: T.TermKey) =>
    terms.filter(
      (term): term is Extract<T.Term, { kind: "property" }> =>
        term.kind === "property" &&
        vocabulary.thingOf(term.of) === thing &&
        term.valueType.type === "reference" &&
        term.derived === null
    )

  const things = new Set<T.TermKey>()
  const queue = [...subjects.map((key) => vocabulary.thingOf(key)), ...signers]
  for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
    if (things.has(key) || roots.has(key) || vocabulary.get(key)?.kind !== "thing") {
      continue
    }
    things.add(key)
    for (const reference of referencesOf(key)) {
      if (reference.valueType.type === "reference" && reference.valueType.to) {
        queue.push(vocabulary.thingOf(reference.valueType.to))
      }
    }
  }

  return [...things].map((key) => ({
    key,
    labels: labelsOf(vocabulary, key),
    definition: definitionOf(vocabulary, key),
    categories: terms
      .filter((term) => term.kind === "category" && vocabulary.thingOf(term.key) === key)
      .map((term) => ({
        key: term.key,
        labels: labelsOf(vocabulary, term.key),
        definition: definitionOf(vocabulary, term.key)
      })),
    references: referencesOf(key).map((property) => ({
      property: property.key,
      labels: labelsOf(vocabulary, property.key),
      to: property.valueType.type === "reference" ? property.valueType.to : null
    })),
    isSigner: signers.has(key) && vocabulary.isParty(key)
  }))
}
