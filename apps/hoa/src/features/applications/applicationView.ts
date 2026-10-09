import { match } from "ts-pattern"
import { definitionOf, rulebookVocabulary } from "@/review/documentTypes"
import type { Review } from "@/review/reviewModel"
import { projectKinds } from "@/review/reviewRules"
import { parseStatement } from "@/schema/statement"
import type * as T from "@/schema/types"
import { citationIndex, referencedRule } from "../rulebook/rulebookRecords"
import type { ReferencedRule } from "../rulebook/RuleReference/RuleReference"
import { sentenceCase } from "./applicationDisplay"

// What the application pages read from a rules file (application-review.md, UX): the rules a review considered with
// their cited provisions, the terms its screens name, and the project kinds a homeowner picks from. Everything comes
// from the review's own rules file, so the text can't drift from what the review read.

/** A rule as the review screens show it: a rule reference plus its statement with term links. */
export type ReportRule = ReferencedRule & { statement: string }

/** The selected rules with their citations, each with its provision's text, lead-ins and wrap-ups. */
export function reportRules(rulesFile: T.RulesFile, selected: readonly T.RuleKey[]): ReportRule[] {
  const keys = new Set(selected)
  const index = citationIndex(rulesFile)
  return rulesFile.rules
    .filter((rule) => keys.has(rule.key))
    .map((rule) => ({ ...referencedRule(index, rule), statement: rule.statement }))
}

const valueTypeTerms = (valueType: T.ValueType): T.TermKey[] =>
  match(valueType)
    .with({ type: "choice" }, ({ set }) => [set])
    .with({ type: "quantity" }, ({ unit }) => [unit])
    .with({ type: "reference" }, ({ to }) => (to ? [to] : []))
    .with({ type: "party" }, ({ among }) => among ?? [])
    .otherwise(() => [])

/** The terms a term's description names: its thing, its value set, its unit, what it refers to. */
const termsNamedBy = (term: T.Term): T.TermKey[] =>
  match(term)
    .with({ kind: "category" }, ({ of }) => [of])
    .with({ kind: "value" }, ({ set }) => [set])
    .with({ kind: "property" }, ({ of, valueType }) => [of, ...valueTypeTerms(valueType)])
    .otherwise(() => [])

function factTerms(fact: T.Fact): T.TermKey[] {
  return [fact.value, ...fact.candidates].flatMap((value) => {
    if (value?.type === "value" && value.term) {
      return [value.term]
    }
    return value?.type === "quantity" ? [value.unit] : []
  })
}

/**
 * The rulebook's own terms the review screens name: the rules' statements, the entities' types, the facts' properties
 * and values, and the document types, with the terms their descriptions name. Core terms ship with the portal.
 */
export function reviewTerms(rulesFile: T.RulesFile, review: Review, rules: readonly ReportRule[]): T.Term[] {
  const byKey = new Map([...rulesFile.proposedCore, ...rulesFile.terms].map((term) => [term.key, term]))
  const wanted = [
    ...rules.flatMap((rule) =>
      parseStatement(rule.statement).flatMap((part) => (part.type === "term" ? [part.key] : []))
    ),
    ...review.request.entities.map((entity) => entity.type),
    ...review.request.facts.flatMap((fact) => [fact.property, ...factTerms(fact)]),
    ...review.findings.flatMap((finding) => finding.inputs.map((input) => input.property)),
    ...review.documents.map((document) => document.documentType)
  ]
  const found = new Map<T.TermKey, T.Term>()
  for (let key = wanted.pop(); key !== undefined; key = wanted.pop()) {
    const term = byKey.get(key)
    if (term && !found.has(key)) {
      found.set(key, term)
      wanted.push(...termsNamedBy(term))
    }
  }
  return [...found.values()]
}

/** A project kind the homeowner can pick: a category of work the rulebook defines. */
export type ProjectKindOption = { key: T.TermKey; label: string; description: string | null }

/** The rulebook's project kinds in sentence case, each with what the rulebook says it is. */
export function projectKindOptions(rulesFile: T.RulesFile): ProjectKindOption[] {
  const vocabulary = rulebookVocabulary(rulesFile)
  return projectKinds(rulesFile).map((kind) => ({
    key: kind.key,
    label: sentenceCase(kind.label),
    description: definitionOf(vocabulary, kind.key)
  }))
}
