import { z } from "zod"
import type { PromptVariables } from "@/ai/prompts"
import { compareCodeUnits } from "@/rulebook/canonical"
import { coreTerms } from "@/schema/coreTerms"
import type { GoverningDocument, Provision, TermKey } from "@/schema/types"
import { condition, decimal, derivation, dimension, ruleKey, termDraft, termKey, type TermContent } from "@/schema/zod"
import { coreRequestTypes, estimateTokens, type EncodingUnit } from "../plan"
import { coreTermsText, documentLine, provisionBlock, termLines } from "../promptVariables"
import { mergeLabels } from "../records"
import { recordProblems, repeatedKeys, type StepProblem } from "./check"
import {
  addServes,
  labelsDraft,
  labelsOf,
  newKey,
  propertyFields,
  propertyTerm,
  segment,
  thingNature,
  valueSetTerms,
  valueTerms,
  type Serves
} from "./drafts"
import { kindName, vocabularyLine, type Outline } from "./outline"
import { none, type stepPrompts } from "./prompts"

// C. The shared vocabulary (hoa-vocabulary-group, prompt drafts v2): one call per group of sections builds every
// property, value set, value, unit and missing thing the group's outlines read, from E's outlines and reads and the
// provisions they cite, and says for every term it adds or reuses which outlines it serves. Code composes the keys,
// checks the group, and merges exact keys across groups; near-duplicates and collisions go to C-merge
// (vocabularyMerge.ts), which freezes the vocabulary.

/** Provision text a group of sections holds at most, in estimated tokens (the drafts' ~15k). */
export const groupTokenBudget = 15_000

export type VocabularyGroup = { id: string; documentKey: string; units: EncodingUnit[] }

/** Packs sections, in order and within one document, into groups of at most `budget` tokens of provision text. */
export function vocabularyGroups(units: readonly EncodingUnit[], budget = groupTokenBudget): VocabularyGroup[] {
  const size = (unit: EncodingUnit) =>
    unit.provisions.reduce((sum, provision) => sum + estimateTokens(provisionBlock(provision)), 0)
  const groups: { group: VocabularyGroup; tokens: number }[] = []
  for (const unit of units) {
    const last = groups.at(-1)
    if (last && last.group.documentKey === unit.documentKey && last.tokens + size(unit) <= budget) {
      last.group.units.push(unit)
      last.tokens += size(unit)
    } else {
      groups.push({ group: { id: unit.id, documentKey: unit.documentKey, units: [unit] }, tokens: size(unit) })
    }
  }
  return groups.map(({ group }) => group)
}

/** hoa-vocabulary-group's variables for one group; the build-wide ones are the same for every group. */
export function sharedVocabularyVariables(input: {
  outlines: readonly Outline[]
  /** Every provision, in document order: the group's outlines' citations are taken from it. */
  provisions: readonly Provision[]
  definedTerms: readonly TermContent[]
  /** Only from a reviewed or published rulebook. */
  previous: readonly TermContent[]
  documents: readonly Pick<GoverningDocument, "key" | "kind" | "title" | "edition">[]
  problems?: string
}): PromptVariables<typeof stepPrompts.sharedVocabulary> {
  const cited = new Set(input.outlines.flatMap((outline) => [outline.provisionKey, ...outline.citations]))
  return {
    coreTerms: coreTermsText(),
    requestTypes: termLines(coreRequestTypes().filter((term) => term.kind === "thing")),
    definedTerms: none(termLines(input.definedTerms)),
    previousVocabulary: none(termLines(input.previous)),
    documents: input.documents.map(documentLine).join("\n"),
    outlines: input.outlines.map(vocabularyLine).join("\n"),
    provisions: input.provisions
      .filter((provision) => cited.has(provision.key))
      .map(provisionBlock)
      .join("\n\n"),
    problems: input.problems ?? "none"
  }
}

const serves = { servesOutlines: z.array(ruleKey).min(1) }
const valueDraft = z.object({ name: segment, ...labelsDraft, broader: z.array(segment) })

/** C's answer: one fixed format; code checks that every outline served is one of the group's. */
export const sharedVocabularyAnswer = z.object({
  reused: z.array(z.object({ key: termKey, alternatives: z.array(z.string().min(1)), ...serves })),
  things: z.array(
    z.object({ key: newKey, nature: thingNature, ...labelsDraft, definition: z.string().nullable(), ...serves })
  ),
  categories: z.array(
    z.object({
      key: newKey,
      of: termKey,
      ...labelsDraft,
      definition: z.string().nullable(),
      criteria: condition,
      ...serves
    })
  ),
  properties: z.array(z.object({ ...propertyFields, derived: z.array(derivation).nullable(), ...serves })),
  valueSets: z.array(
    z.object({ name: segment, ...labelsDraft, complete: z.boolean(), values: z.array(valueDraft).min(1), ...serves })
  ),
  addValues: z.array(z.object({ set: termKey, values: z.array(valueDraft).min(1), ...serves })),
  units: z.array(z.object({ name: segment, ...labelsDraft, dimension, perBase: decimal.nullable(), ...serves })),
  notes: z.array(z.string())
})
export type SharedVocabularyAnswer = z.output<typeof sharedVocabularyAnswer>

/** One group's answer as terms (new ones, and known ones that gained wordings), with the outlines each serves. */
export function sharedVocabularyTerms(answer: SharedVocabularyAnswer, known: readonly TermContent[]) {
  const served: Serves = new Map()
  const knownByKey = new Map([...coreTerms, ...known].map((term) => [term.key, term as TermContent]))
  const terms: TermContent[] = []
  const add = (term: TermContent, outlines: readonly string[]) => {
    terms.push(term)
    addServes(served, term.key, outlines)
  }
  const unknown: TermKey[] = []
  for (const item of answer.reused) {
    const term = knownByKey.get(item.key)
    if (!term) {
      unknown.push(item.key)
      continue
    }
    addServes(served, item.key, item.servesOutlines)
    if (item.alternatives.length > 0) {
      const refined = termDraft.parse(structuredClone(term))
      mergeLabels(
        refined,
        item.alternatives.map((text) => ({ text, role: "alternative" as const, plural: null, citation: null }))
      )
      terms.push(refined)
    }
  }
  for (const thing of answer.things) {
    const term = termDraft.parse({
      key: thing.key,
      kind: "thing",
      nature: thing.nature,
      request: null,
      labels: labelsOf(thing),
      definition: thing.definition
    })
    add(term, thing.servesOutlines)
  }
  for (const category of answer.categories) {
    const term = termDraft.parse({
      key: category.key,
      kind: "category",
      of: category.of,
      criteria: category.criteria,
      labels: labelsOf(category),
      definition: category.definition
    })
    add(term, category.servesOutlines)
  }
  for (const property of answer.properties) {
    add(propertyTerm(property), property.servesOutlines)
  }
  for (const set of answer.valueSets) {
    valueSetTerms(set, set.values).forEach((term) => add(term, set.servesOutlines))
  }
  for (const item of answer.addValues) {
    if (!knownByKey.has(item.set) && !answer.valueSets.some((set) => set.name === item.set)) {
      unknown.push(item.set)
    }
    valueTerms(item.set, item.values).forEach((term) => add(term, item.servesOutlines))
  }
  for (const unit of answer.units) {
    const term = termDraft.parse({
      key: unit.name,
      kind: "unit",
      dimension: unit.dimension,
      perBase: unit.perBase,
      labels: labelsOf(unit)
    })
    add(term, unit.servesOutlines)
  }
  return { terms, serves: served, unknown }
}

export type GroupVocabulary = {
  groupId: string
  terms: TermContent[]
  serves: Serves
  /** The group's outlines, which servesOutlines must name and which must be served. */
  outlines: readonly Outline[]
  /** Reused keys and sets that aren't known. */
  unknown: readonly TermKey[]
}

/** A term's kind and value type: two terms with one key must agree on it to be one term. */
export const signatureOf = (term: TermContent) =>
  term.kind === "property" ? `property ${JSON.stringify(term.valueType)}` : term.kind

/** Outlines whose checks read facts, so some term must serve them (judged rules, prohibitions and the like needn't). */
const readsFacts = (outline: Outline) => ["obligation", "recommendation", "requirement"].includes(kindName(outline))

/**
 * C's check of one group (prompt drafts v2, the C check): keys compose and are unique, every reference resolves (core,
 * defined, previous, this group or another group of the round), no key has two kinds or value types within the group,
 * every outline served is one of the group's, and every outline that reads facts is served.
 */
export function checkSharedVocabulary(groups: readonly GroupVocabulary[], known: readonly TermContent[]) {
  const problems = new Map<string, StepProblem[]>()
  const report = (groupId: string, problem: Omit<StepProblem, "path">) =>
    problems.set(groupId, [...(problems.get(groupId) ?? []), { ...problem, path: [] }])
  const all = new Map<TermKey, TermContent>()
  for (const term of [...known, ...groups.flatMap((group) => group.terms)]) {
    if (!all.has(term.key)) {
      all.set(term.key, term)
    }
  }
  for (const group of groups) {
    const outlineKeys = new Set(group.outlines.map((outline) => outline.key))
    for (const [key, served] of group.serves) {
      for (const outline of served.filter((item) => !outlineKeys.has(item))) {
        report(group.groupId, {
          recordKey: key,
          code: "unknown-outline",
          message: `${key} serves ${outline}, which isn't an outline of the group`
        })
      }
    }
    const servedOutlines = new Set([...group.serves.values()].flat())
    for (const outline of group.outlines.filter((item) => readsFacts(item) && !servedOutlines.has(item.key))) {
      report(group.groupId, {
        recordKey: outline.key,
        code: "unserved-outline",
        message: `no term serves ${outline.key}`
      })
    }
    for (const key of group.unknown) {
      report(group.groupId, {
        recordKey: key,
        code: "undefined-term",
        message: `${key} isn't a core, defined or previous term`
      })
    }
    for (const key of repeatedKeys(group.terms.map((term) => term.key))) {
      const signatures = new Set(group.terms.filter((term) => term.key === key).map(signatureOf))
      const message =
        signatures.size > 1 ? `${key} is returned with two kinds or value types` : `${key} is returned twice`
      report(group.groupId, { recordKey: key, code: signatures.size > 1 ? "conflict" : "duplicate-key", message })
    }
    const own = new Set(group.terms.map((term) => term.key))
    const vocabulary = [...all.values()].filter((term) => !own.has(term.key)).concat(uniqueByKey(group.terms))
    for (const problem of recordProblems({ terms: vocabulary, about: own })) {
      report(group.groupId, problem)
    }
  }
  return problems
}

const uniqueByKey = (terms: readonly TermContent[]) => [...new Map(terms.map((term) => [term.key, term])).values()]

/** Each outline with the term keys that serve it, once the vocabulary is frozen. */
export const withReadKeys = (outlines: readonly Outline[], served: Serves): Outline[] =>
  outlines.map((outline) => ({
    ...outline,
    readKeys: [...served]
      .filter(([, items]) => items.includes(outline.key))
      .map(([key]) => key)
      .toSorted(compareCodeUnits)
  }))
