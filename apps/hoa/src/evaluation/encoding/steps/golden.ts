import { findTermCandidates, type TermCandidate } from "@/encoding/definedTerms"
import { planUnits, type EncodingUnit } from "@/encoding/plan"
import { analyzeReferences, citedProvisions, type KnownDocument } from "@/encoding/references"
import { keysIn } from "@/encoding/steps/drafts"
import { outlineOfRule, statementSummary, type Outline, type Read } from "@/encoding/steps/outline"
import { compareCodeUnits } from "@/rulebook/canonical"
import { coreTerms } from "@/schema/coreTerms"
import type * as T from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import type { RuleContent, TermContent } from "@/schema/zod"
import { labelForms } from "@/text/normalize"

// Golden inputs (evaluation.md, Running one step): each step's input built from the golden encoding
// (samples/*/rules.json), so a step can be measured against perfect upstream input. Its provisions are the structure,
// its terms the vocabulary, its rules the outlines; code plans its sections as the build does.

/** A golden rule without its bookkeeping, as drafts are. */
export function ruleContent(rule: T.Rule): RuleContent {
  const { provenance: _provenance, review: _review, issues: _issues, ...content } = rule
  return content
}

/** A golden term without its bookkeeping, labels included. */
export function termContent(term: T.Term): TermContent {
  const { provenance: _provenance, review: _review, issues: _issues, labels, ...content } = term
  return { ...content, labels: labels.map(({ provenance: _labelProvenance, ...label }) => label) }
}

export const goldenTerms = (golden: T.RulesFile) => [...golden.terms, ...golden.proposedCore].map(termContent)

const documentOf = (key: string) => key.slice(0, Math.max(0, key.indexOf(":")))

/** The golden's provisions by document, in order. */
export function goldenDocuments(golden: T.RulesFile) {
  const byDocument = new Map<string, T.Provision[]>()
  for (const provision of golden.provisions) {
    const key = documentOf(provision.key)
    byDocument.set(key, [...(byDocument.get(key) ?? []), provision])
  }
  return [...byDocument].map(([key, provisions]) => ({ key, provisions }))
}

/** The provisions each golden provision refers to, found by the build's reference grammar. */
export function goldenReferences(golden: T.RulesFile, known: readonly KnownDocument[]) {
  const { references } = analyzeReferences(goldenDocuments(golden), known)
  return new Map([...references].map(([key, found]) => [key, citedProvisions(found, key)]))
}

/** The golden's sections, planned as the build plans them, with the golden vocabulary as the slice's source. */
export function goldenSections(
  golden: T.RulesFile,
  references: ReadonlyMap<T.ProvisionKey, readonly T.ProvisionKey[]>
) {
  return planUnits({ documents: goldenDocuments(golden), references, vocabulary: goldenTerms(golden) })
}

/** The section each provision belongs to. */
export function sectionOf(sections: readonly EncodingUnit[]) {
  const map = new Map(sections.flatMap((unit) => unit.provisions.map((provision) => [provision.key, unit.id] as const)))
  return (key: T.ProvisionKey) => map.get(key)
}

const coreKeys = new Set(coreTerms.map((term) => term.key))

/** The terms a rule reads: every term key in it but its statement and bookkeeping. */
export function termsRead(rule: RuleContent, terms: ReadonlyMap<string, TermContent>) {
  const { statement: _statement, title: _title, citations: _citations, key: _key, ...structure } = rule
  return [...keysIn(structure, new Set(terms.keys()))].toSorted(compareCodeUnits)
}

/** What a read term is, in plain words: what it's about (its thing, or its set) and the fact. */
function readOf(key: string, vocabulary: ReturnType<typeof createVocabulary>): Read | null {
  const term = vocabulary.get(key)
  if (term?.kind === "property") {
    return { about: vocabulary.label(term.of), fact: vocabulary.label(key) }
  }
  if (term?.kind === "value") {
    return { about: vocabulary.label(term.set), fact: `is ${vocabulary.label(key)}` }
  }
  return null
}

/**
 * The golden rules as outlines (E's answer at its best): each with its section, its statement as its summary, its
 * reads in plain words (the properties and values it tests) and the term keys they are (what C serves).
 */
export function goldenOutlines(golden: T.RulesFile, sections: readonly EncodingUnit[]) {
  const terms = goldenTerms(golden)
  const vocabulary = createVocabulary(terms)
  const byKey = new Map([...coreTerms.map((term) => termContent(term)), ...terms].map((term) => [term.key, term]))
  const section = sectionOf(sections)
  const outlines = golden.rules.map((rule): Outline => {
    const content = ruleContent(rule)
    const read = termsRead(content, byKey).filter((key) => {
      const kind = byKey.get(key)?.kind
      return kind === "property" || kind === "value"
    })
    return {
      ...outlineOfRule(
        content,
        section(content.citations[0]?.provisionKey ?? "") ?? "",
        statementSummary(content, vocabulary)
      ),
      reads: read.flatMap((key) => readOf(key, vocabulary) ?? []),
      readKeys: read
    }
  })
  return outlines
}

/**
 * Golden outlines' parties and subjects as E hands them to C (`keyedOutline`): the key where the core or a given term
 * has it, else the golden term's preferred label, for C to add, as E leaves a label no term has yet. A golden key C
 * isn't given would read as a term that exists.
 */
export function outlinesAsFound(
  outlines: readonly Outline[],
  golden: T.RulesFile,
  given: ReadonlySet<string>
): Outline[] {
  const vocabulary = createVocabulary(goldenTerms(golden))
  const named = (key: string) => (coreKeys.has(key) || given.has(key) ? key : vocabulary.label(key))
  const name = (key: string | null) => (key === null ? null : named(key))
  return outlines.map((outline) => ({
    ...outline,
    bearer: name(outline.bearer),
    appliesTo: name(outline.appliesTo),
    decidedBy: name(outline.decidedBy),
    sanction: outline.sanction
      ? {
          ...outline.sanction,
          imposedBy: named(outline.sanction.imposedBy),
          against: outline.sanction.against.map(named)
        }
      : null
  }))
}

/**
 * B's golden input for one document: the candidates code finds, and every provision that defines a term in full: the
 * definitions, and each provision a candidate is defined in. A definition outside a definitions article (a qualifying
 * resident in a use section, a list of permitted kinds) then reaches the model whole, not as a one-sentence sample.
 */
export function goldenDefinitions(provisions: readonly T.Provision[]) {
  const candidates = findTermCandidates(provisions)
  const defining = new Set(candidates.flatMap((candidate) => candidate.definedIn))
  const definitions = provisions.filter((provision) => provision.kind === "definition" || defining.has(provision.key))
  return { definitions, candidates }
}

/** What a document defines terms with: the provisions that define them and the names they're defined under. */
export type DefiningText = {
  /** The definitions and the provisions candidates are defined in (`definingProvisions`). */
  provisions: ReadonlySet<T.ProvisionKey>
  /** The candidates' phrases and the definitions' headings. */
  names: readonly string[]
}

/** The names a document's terms are defined under: its candidates' phrases and its definitions' headings. */
export const definedNamesOf = (definitions: readonly T.Provision[], candidates: readonly TermCandidate[]) => [
  ...candidates.map((candidate) => candidate.phrase),
  ...definitions.flatMap((provision) => (provision.heading ? [provision.heading] : []))
]

/**
 * B's expected output for one document: the golden terms it defines, and the properties, value sets and values their
 * criteria read. A term is defined there when it cites one of the defining provisions and one of its labels is a name
 * the document defines (a term only mentioned in a definition isn't defined by it): a thing (not a request type), a
 * category, a refinement of a core term, or a property or value (a defined type modeled as a value), with its set.
 * The things those categories and properties are of, and their quantities' units, come too, so the answer's
 * references resolve.
 */
export function expectedDefinedTerms(golden: T.RulesFile, defining: DefiningText) {
  const terms = goldenTerms(golden)
  const names = new Set(defining.names.flatMap((name) => labelForms({ text: name })))
  const isNamed = (term: TermContent) => term.labels.some((label) => labelForms(label).some((form) => names.has(form)))
  const defines = (term: TermContent) =>
    term.citations.some((citation) => defining.provisions.has(citation.provisionKey)) && isNamed(term)
  const defined = terms.filter(
    (term) =>
      defines(term) &&
      ((term.kind === "thing" && term.nature !== "request") ||
        term.kind === "category" ||
        term.kind === "property" ||
        term.kind === "value" ||
        coreKeys.has(term.key))
  )
  const byKey = new Map(terms.map((term) => [term.key, term]))
  // A term of a request type (a category of disputes, say) is left out: B declares no request types and isn't told the
  // organization's, so it can't define one.
  const ofRequest = (term: TermContent): boolean => {
    const owner = term.kind === "category" || term.kind === "property" ? byKey.get(term.of) : undefined
    return owner !== undefined && ((owner.kind === "thing" && owner.nature === "request") || ofRequest(owner))
  }
  const chosen = defined.filter((term) => !ofRequest(term))
  const read = new Set([
    ...chosen.flatMap((term) => (term.kind === "category" ? [...keysIn(term.criteria, new Set(byKey.keys()))] : [])),
    ...chosen.map((term) => term.key)
  ])
  const properties = terms.filter((term) => term.kind === "property" && read.has(term.key))
  const sets = new Set([
    ...properties.flatMap((term) =>
      term.kind === "property" && term.valueType.type === "choice" ? [term.valueType.set] : []
    ),
    ...terms.flatMap((term) => (term.kind === "value" && read.has(term.key) ? [term.set] : []))
  ])
  const units = new Set(
    properties.flatMap((term) =>
      term.kind === "property" && term.valueType.type === "quantity" ? [term.valueType.unit] : []
    )
  )
  const valueTerms = terms.filter(
    (term) =>
      (term.kind === "value-set" && sets.has(term.key)) ||
      (term.kind === "value" && read.has(term.key)) ||
      (term.kind === "unit" && units.has(term.key))
  )
  // The things the categories and properties are of, so every reference resolves within the answer or the core.
  const owners: TermContent[] = []
  const pending = [...chosen, ...properties].flatMap((term) =>
    term.kind === "category" || term.kind === "property" ? [term.of] : []
  )
  for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
    const owner = byKey.get(key)
    if (owner && !coreKeys.has(key) && !owners.includes(owner)) {
      owners.push(owner)
      if (owner.kind === "category") {
        pending.push(owner.of)
      }
    }
  }
  return [...new Map([...chosen, ...owners, ...properties, ...valueTerms].map((term) => [term.key, term])).values()]
}

/**
 * The golden terms a set of outlines reads, with the things, sets and units they depend on (C's expected output), less
 * the terms C is given (B's defined terms).
 */
export function expectedVocabulary(
  golden: T.RulesFile,
  outlines: readonly Outline[],
  given: ReadonlySet<string> = new Set()
) {
  const terms = goldenTerms(golden)
  const byKey = new Map(terms.map((term) => [term.key, term]))
  const read = new Set(outlines.flatMap((outline) => outline.readKeys))
  const chosen = new Map<string, TermContent>()
  const serves = new Map<string, string[]>()
  const add = (key: string, outline: string) => {
    const term = byKey.get(key)
    if (!term || coreKeys.has(key)) {
      return
    }
    if (!given.has(key)) {
      chosen.set(key, term)
    }
    serves.set(key, [...new Set([...(serves.get(key) ?? []), outline])])
    if (term.kind === "property") {
      add(term.of, outline)
      if (term.valueType.type === "choice") {
        add(term.valueType.set, outline)
      }
      if (term.valueType.type === "quantity") {
        add(term.valueType.unit, outline)
      }
    }
    if (term.kind === "value") {
      add(term.set, outline)
    }
  }
  for (const outline of outlines) {
    for (const key of outline.readKeys) {
      add(key, outline.key)
    }
    for (const subject of [outline.appliesTo, outline.bearer]) {
      if (subject && byKey.has(subject)) {
        add(subject, outline.key)
      }
    }
  }
  return {
    terms: [...chosen.values()].filter((term) => read.has(term.key) || term.kind !== "value"),
    serves
  }
}
