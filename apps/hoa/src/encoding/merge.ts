import { normalizeForMatching } from "@/ocr/page"
import { canonicalJson } from "@/rulebook/canonical"
import type { RulebookCoverage } from "@/rulebook/coverage"
import type { GoverningDocument, Provision, RuleKey, Settings } from "@/schema/types"
import { validateRulebook, type JsonPath } from "@/schema/validate"
import type { EncodingDraftContent, QuestionContent, RuleContent, TermContent } from "@/schema/zod"
import { candidateTermPairs, type TermPair } from "./consolidate"
import { mergeLabels, uniqueCitations } from "./records"

// Merge (encoding.md, Merge): every unit's draft into one rulebook, as the hand-run's build-rules-file.ts did. Terms
// merge by key, rules by key (a repeated key gets a suffix), clauses concatenate or must agree, referenced documents
// merge by key. Disagreements become conflicts on the records; the whole set is then verified again.

export type UnitDraft = { unitId: string; draft: EncodingDraftContent }

export type MergeInput = {
  organizationId: string
  documents: readonly GoverningDocument[]
  provisions: readonly Provision[]
  /** The shared vocabulary from the vocabulary stage; units' terms merge into it. */
  vocabulary: readonly TermContent[]
  units: readonly UnitDraft[]
}

export type MergedRulebook = {
  organization: { id: string }
  documents: GoverningDocument[]
  provisions: Provision[]
  terms: TermContent[]
  proposedCore: TermContent[]
  rules: RuleContent[]
  settings: { clauses: Partial<Settings["clauses"]> }
  questions: (QuestionContent & { id: string })[]
}

/** Where a merged record came from: a unit's draft and the record's path in it. */
export type DraftLocation = { unitId: string; path: JsonPath }

/** A disagreement between units, raised as a `conflict` issue on the record. */
export type MergeConflict = { recordKey: string; message: string; related: RuleKey[] }

type Clauses = Partial<Settings["clauses"]>

const proposed = { status: "proposed" as const, by: null, at: null, note: null }

/** Merges a term into the one already holding its key; returns the conflict when they can't be one term. */
function mergeTerm(existing: TermContent, incoming: TermContent) {
  if (existing.kind !== incoming.kind) {
    return `${existing.key} is defined as a ${existing.kind} and as a ${incoming.kind}`
  }
  mergeLabels(existing, incoming.labels)
  existing.citations = uniqueCitations([...existing.citations, ...incoming.citations])
  existing.scopeNote ??= incoming.scopeNote
  existing.context ??= incoming.context
  const isOtherDefinition =
    existing.definition !== null &&
    incoming.definition !== null &&
    normalizeForMatching(existing.definition) !== normalizeForMatching(incoming.definition)
  existing.definition ??= incoming.definition
  return isOtherDefinition ? `${existing.key} has two definitions` : null
}

/** A key no rule has yet: guidelines:5.2#colors-2, -3 and so on (an aspect allows no other suffix). */
function freeKey(key: RuleKey, taken: ReadonlySet<RuleKey>) {
  let n = 2
  while (taken.has(`${key}-${n}`)) {
    n += 1
  }
  return `${key}-${n}`
}

const withoutCitations = (clause: object) => canonicalJson({ ...clause, citations: [] })

function mergeClauses(units: readonly UnitDraft[], conflict: (message: string) => void): Clauses {
  const merged: Clauses = {}
  for (const { unitId, draft } of units) {
    const { precedence, time, cure, liability, deciders, sanctionPreconditions } = draft.clauses
    if (precedence) {
      if (merged.precedence && canonicalJson(merged.precedence.order) !== canonicalJson(precedence.order)) {
        conflict(`unit ${unitId} gives another precedence order`)
      }
      merged.precedence = {
        order: merged.precedence?.order ?? precedence.order,
        citations: uniqueCitations([...(merged.precedence?.citations ?? []), ...precedence.citations])
      }
    }
    if (time) {
      if (merged.time && withoutCitations(merged.time) !== withoutCitations(time)) {
        conflict(`unit ${unitId} gives other time rules`)
      }
      merged.time = merged.time
        ? { ...merged.time, citations: uniqueCitations([...merged.time.citations, ...time.citations]) }
        : time
    }
    if (cure !== undefined && cure !== null) {
      if (merged.cure && withoutCitations(merged.cure) !== withoutCitations(cure)) {
        conflict(`unit ${unitId} gives another default cure period`)
      }
      merged.cure = merged.cure
        ? { ...merged.cure, citations: uniqueCitations([...merged.cure.citations, ...cure.citations]) }
        : cure
    }
    for (const decider of deciders ?? []) {
      const existing = merged.deciders?.find((item) => item.requestType === decider.requestType)
      if (existing && existing.party !== decider.party) {
        conflict(`unit ${unitId} names another decider for ${decider.requestType}`)
      }
      if (existing) {
        existing.citations = uniqueCitations([...existing.citations, ...decider.citations])
      } else {
        merged.deciders = [...(merged.deciders ?? []), decider]
      }
    }
    if (liability) {
      merged.liability = [...(merged.liability ?? []), ...liability]
    }
    if (sanctionPreconditions) {
      merged.sanctionPreconditions = [...(merged.sanctionPreconditions ?? []), ...sanctionPreconditions]
    }
  }
  return merged
}

/** Every provision key a record cites, wherever the citation sits in it. */
function citedKeys(records: unknown) {
  const keys = new Set<string>()
  JSON.stringify(records, (key, value: unknown) => {
    if (key === "provisionKey" && typeof value === "string") {
      keys.add(value)
    }
    return value
  })
  return keys
}

export const questionId = (n: number) => `question-${n}`

/** Collects terms by key, owned by the organization; a key defined two ways is reported to `conflicts`. */
function termMerger(organizationId: string, conflicts: MergeConflict[]) {
  const terms = new Map<string, TermContent>()
  const add = (term: TermContent) => {
    const owned = { ...structuredClone(term), organizationId }
    const existing = terms.get(term.key)
    const message = existing ? mergeTerm(existing, owned) : null
    if (!existing) {
      terms.set(term.key, owned)
    }
    if (message) {
      conflicts.push({ recordKey: term.key, message, related: [] })
    }
  }
  return { add, terms: () => [...terms.values()] }
}

/** The documents' vocabularies as one (encoding.md, Vocabulary): terms merged by key. */
export function mergeTerms(organizationId: string, terms: readonly TermContent[]) {
  const conflicts: MergeConflict[] = []
  const merger = termMerger(organizationId, conflicts)
  terms.forEach(merger.add)
  return { terms: merger.terms(), conflicts }
}

export function mergeDrafts(input: MergeInput) {
  const conflicts: MergeConflict[] = []
  const sources = new Map<string, DraftLocation[]>()
  const from = (recordKey: string, location: DraftLocation) =>
    sources.set(recordKey, [...(sources.get(recordKey) ?? []), location])
  const terms = termMerger(input.organizationId, conflicts)
  const addTerm = terms.add
  input.vocabulary.forEach(addTerm)

  const rules = new Map<RuleKey, RuleContent>()
  const questions: MergedRulebook["questions"] = []
  const referenced = new Map<string, GoverningDocument>()
  const noRules = new Map<string, NonNullable<EncodingDraftContent["provisions"][number]["noRule"]>>()
  const uploaded = new Set(input.documents.map((document) => document.key))

  for (const { unitId, draft } of input.units) {
    draft.terms.forEach((term, i) => {
      addTerm(term)
      from(term.key, { unitId, path: ["terms", i] })
    })
    draft.rules.forEach((rule, i) => {
      const key = rules.has(rule.key) ? freeKey(rule.key, new Set(rules.keys())) : rule.key
      if (key !== rule.key) {
        const message = `unit ${unitId} gave a second rule the key ${rule.key}`
        conflicts.push(
          { recordKey: rule.key, message, related: [key] },
          { recordKey: key, message, related: [rule.key] }
        )
      }
      rules.set(key, { ...rule, key })
      from(key, { unitId, path: ["rules", i] })
    })
    draft.questions.forEach((question, i) => {
      const id = questionId(questions.length + 1)
      questions.push({ ...question, id })
      from(id, { unitId, path: ["questions", i] })
    })
    if (Object.keys(draft.clauses).length > 0) {
      from("settings", { unitId, path: [] })
    }
    for (const document of draft.referencedDocuments) {
      if (!uploaded.has(document.key) && !referenced.has(document.key)) {
        referenced.set(document.key, { ...document, issuedBy: null, governs: null, edition: null })
      }
    }
    draft.provisions.forEach((provision, i) => {
      from(provision.key, { unitId, path: ["provisions", i] })
      if (provision.noRule) {
        noRules.set(provision.key, provision.noRule)
      }
    })
  }

  const clauses = mergeClauses(input.units, (message) =>
    conflicts.push({ recordKey: "settings", message, related: [] })
  )
  const rulebook: MergedRulebook = {
    organization: { id: input.organizationId },
    documents: [...input.documents, ...referenced.values()],
    provisions: input.provisions.map((provision) => {
      const noRule = noRules.get(provision.key)
      return noRule ? { ...provision, noRule: { ...noRule, review: proposed } } : provision
    }),
    terms: terms.terms(),
    proposedCore: [],
    rules: [...rules.values()],
    settings: { clauses },
    questions
  }
  const cited = citedKeys([rulebook.terms, rulebook.rules, rulebook.settings, rulebook.questions])
  const coverage: RulebookCoverage = {
    provisions: rulebook.provisions.length,
    uncovered: rulebook.provisions
      .filter((provision) => !cited.has(provision.key) && provision.noRule === null)
      .map((provision) => provision.key)
  }
  const termPairs: TermPair[] = candidateTermPairs(rulebook.terms)
  return { rulebook, conflicts, coverage, termPairs, sources, issues: validateRulebook(rulebook) }
}
