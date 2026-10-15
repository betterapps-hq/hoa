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
  labeledPropertyFields,
  labelsDraft,
  labelsOf,
  propertyTerm,
  reference,
  thingNature,
  valueSetTerm,
  valueTerm,
  type Serves
} from "./drafts"
import { kindName, vocabularyLine, type Outline } from "./outline"
import { none, type stepPrompts } from "./prompts"
import { subjectKey } from "./ruleFinding"
import { termKeyBuilder } from "./termKeys"

// C. The shared vocabulary (hoa-vocabulary-group, prompt drafts v2): one call per group of sections builds every
// property, value set, value, unit and missing thing the group's outlines read, from E's outlines and reads and the
// provisions they cite, and says for every term it adds or reuses which outlines it serves. The model writes no new
// term key: code builds each from the term's preferred label (termKeys.ts) and resolves references by label or key,
// checks the group, and merges exact keys across groups (one label, kind and scope give one key in every group);
// near-duplicates and collisions go to C-merge (vocabularyMerge.ts), which freezes the vocabulary.

/** Provision text a group of sections holds at most, in estimated tokens (the drafts' ~15k). */
export const groupTokenBudget = 15_000

/**
 * Outlines a group holds at most. The answer grows with the outlines it serves (about 450 output tokens each), so a
 * group of many short rules would run past the output limit: 50 keeps an answer near 25k tokens.
 */
export const groupOutlineBudget = 50

export type VocabularyGroup = { id: string; documentKey: string; units: EncodingUnit[] }

/**
 * Packs sections, in order and within one document, into groups of at most `budget` tokens of provision text and at
 * most `outlineBudget` outlines (a section with more stays a group of its own).
 */
export function vocabularyGroups(
  units: readonly EncodingUnit[],
  outlinesOf: (unit: EncodingUnit) => number = () => 0,
  budget = groupTokenBudget,
  outlineBudget = groupOutlineBudget
): VocabularyGroup[] {
  const size = (unit: EncodingUnit) =>
    unit.provisions.reduce((sum, provision) => sum + estimateTokens(provisionBlock(provision)), 0)
  const groups: { group: VocabularyGroup; tokens: number; outlines: number }[] = []
  for (const unit of units) {
    const last = groups.at(-1)
    if (
      last &&
      last.group.documentKey === unit.documentKey &&
      last.tokens + size(unit) <= budget &&
      last.outlines + outlinesOf(unit) <= outlineBudget
    ) {
      last.group.units.push(unit)
      last.tokens += size(unit)
      last.outlines += outlinesOf(unit)
    } else {
      groups.push({
        group: { id: unit.id, documentKey: unit.documentKey, units: [unit] },
        tokens: size(unit),
        outlines: outlinesOf(unit)
      })
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
/** A value; `broader` names other values of its set by label. */
const valueDraft = z.object({ ...labelsDraft, broader: z.array(reference) })

/** C's answer: one fixed format; code builds new keys and checks that every outline served is one of the group's. */
export const sharedVocabularyAnswer = z.object({
  /** Known terms (core, defined, previous) by their keys. */
  reused: z.array(z.object({ key: termKey, alternatives: z.array(z.string().min(1)), ...serves })),
  things: z.array(z.object({ nature: thingNature, ...labelsDraft, definition: z.string().nullable(), ...serves })),
  categories: z.array(
    z.object({ of: reference, ...labelsDraft, definition: z.string().nullable(), criteria: condition, ...serves })
  ),
  properties: z.array(z.object({ ...labeledPropertyFields, derived: z.array(derivation).nullable(), ...serves })),
  valueSets: z.array(
    z.object({ ...labelsDraft, complete: z.boolean(), values: z.array(valueDraft).min(1), ...serves })
  ),
  /** Values added to a known set or one of this answer's, named by label or key. */
  addValues: z.array(z.object({ set: reference, values: z.array(valueDraft).min(1), ...serves })),
  units: z.array(z.object({ ...labelsDraft, dimension, perBase: decimal.nullable(), ...serves })),
  notes: z.array(z.string())
})
export type SharedVocabularyAnswer = z.output<typeof sharedVocabularyAnswer>

type ValueDraft = z.output<typeof valueDraft>

/**
 * One group's answer as terms (new ones, and known ones that gained wordings), with the outlines each serves and the
 * problems building them: new keys built from preferred labels (things, categories, value sets and units, then values
 * and properties under them), references resolved by label or key, a reused key that isn't known reported.
 */
export function sharedVocabularyTerms(answer: SharedVocabularyAnswer, known: readonly TermContent[]) {
  const served: Serves = new Map()
  const knownByKey = new Map([...coreTerms, ...known].map((term) => [term.key, term as TermContent]))
  const keys = termKeyBuilder(known)
  const terms: TermContent[] = []
  const add = (term: TermContent, outlines: readonly string[]) => {
    terms.push(term)
    addServes(served, term.key, outlines)
  }
  for (const item of answer.reused) {
    const term = knownByKey.get(item.key)
    if (!term) {
      keys.problems.push({
        recordKey: item.key,
        code: "undefined-term",
        message: `${item.key} isn't a core, defined or previous term`,
        path: ["reused"]
      })
      continue
    }
    keys.addLabels(item.key, item.alternatives)
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
  const thingKeys = answer.things.map((thing) => keys.build(thing, null, "thing"))
  const categoryKeys = answer.categories.map((category) => keys.build(category, null, "category"))
  const setKeys = answer.valueSets.map((set) => keys.build(set, null, "value set"))
  const unitKeys = answer.units.map((unit) => keys.build(unit, null, "unit"))
  const valuesOf = (setKey: TermKey | null, values: readonly ValueDraft[]) =>
    values.map((value) => (setKey === null ? null : keys.build(value, setKey, "value")))
  const valueKeys = answer.valueSets.map((set, index) => valuesOf(setKeys[index] ?? null, set.values))
  const addedSets = answer.addValues.map((item) => keys.named(item.set, item.set, "set"))
  const addedKeys = answer.addValues.map((item, index) => valuesOf(addedSets[index] ?? null, item.values))
  const propertyKeys = answer.properties.map((property) => {
    const of = keys.named(property.of, property.preferred.text, "of")
    return of === null ? null : { of, key: keys.build(property, of, "property") }
  })
  /** A value's terms: its broader values are siblings named by label or key. */
  const valueTerms = (setKey: TermKey, values: readonly ValueDraft[], built: readonly (TermKey | null)[]) =>
    values.flatMap((value, index) => {
      const key = built[index]
      const broader = value.broader.flatMap((text) => {
        // A sibling named by its full key is already under the set.
        const sibling = text.startsWith(`${setKey}.`) ? text : `${setKey}.${text}`
        const found = keys.named(sibling, key ?? setKey, "broader")
        return found === null ? [] : [found]
      })
      return key ? [valueTerm(value, key, setKey, broader)] : []
    })
  answer.things.forEach((thing, index) => {
    const key = thingKeys[index]
    if (key) {
      const term = termDraft.parse({
        key,
        kind: "thing",
        nature: thing.nature,
        request: null,
        labels: labelsOf(thing),
        definition: thing.definition
      })
      add(term, thing.servesOutlines)
    }
  })
  answer.categories.forEach((category, index) => {
    const key = categoryKeys[index]
    const of = key ? keys.named(category.of, key, "of") : null
    if (key && of) {
      const term = termDraft.parse({
        key,
        kind: "category",
        of,
        criteria: keys.rewrite(category.criteria),
        labels: labelsOf(category),
        definition: category.definition
      })
      add(term, category.servesOutlines)
    }
  })
  answer.properties.forEach((property, index) => {
    const built = propertyKeys[index]
    if (built?.key) {
      const draft = {
        ...property,
        valueType: keys.rewrite(property.valueType),
        derived: keys.rewrite(property.derived)
      }
      add(propertyTerm(draft, built.key, built.of), property.servesOutlines)
    }
  })
  answer.valueSets.forEach((set, index) => {
    const setKey = setKeys[index]
    if (setKey) {
      add(valueSetTerm(set, setKey), set.servesOutlines)
      valueTerms(setKey, set.values, valueKeys[index] ?? []).forEach((term) => add(term, set.servesOutlines))
    }
  })
  answer.addValues.forEach((item, index) => {
    const setKey = addedSets[index]
    if (setKey) {
      valueTerms(setKey, item.values, addedKeys[index] ?? []).forEach((term) => add(term, item.servesOutlines))
    }
  })
  answer.units.forEach((unit, index) => {
    const key = unitKeys[index]
    if (key) {
      const term = termDraft.parse({
        key,
        kind: "unit",
        dimension: unit.dimension,
        perBase: unit.perBase,
        labels: labelsOf(unit)
      })
      add(term, unit.servesOutlines)
    }
  })
  return { terms, serves: served, problems: keys.problems }
}

export type GroupVocabulary = {
  groupId: string
  terms: TermContent[]
  serves: Serves
  /** The group's outlines, which servesOutlines must name and which must be served. */
  outlines: readonly Outline[]
  /** What building the group's terms found: key collisions, unresolved references, reused keys that aren't known. */
  problems: readonly StepProblem[]
}

/**
 * A term's kind and value type: two terms with one key must agree on it to be one term. Which parties a party property
 * allows narrows its values, not its type: one fact, whose allowed parties widen when the terms merge.
 */
export const signatureOf = (term: TermContent) => {
  if (term.kind !== "property") {
    return term.kind
  }
  return `property ${JSON.stringify(term.valueType.type === "party" ? { type: "party" } : term.valueType)}`
}

/** A merged party property's allowed parties: every party either allows, or any party when either allows any. */
export function widenedParties(kept: TermContent, other: TermContent) {
  if (kept.kind !== "property" || other.kind !== "property") {
    return
  }
  if (kept.valueType.type !== "party" || other.valueType.type !== "party") {
    return
  }
  const { among } = kept.valueType
  const added = other.valueType.among
  kept.valueType = {
    type: "party",
    among: among === null || added === null ? null : [...new Set([...among, ...added])].toSorted(compareCodeUnits)
  }
}

/** Outlines whose checks read facts, so some term must serve them (judged rules, prohibitions and the like needn't). */
const readsFacts = (outline: Outline) => ["obligation", "recommendation", "requirement"].includes(kindName(outline))

/**
 * C's check of one group (prompt drafts v2, the C check): keys build and are unique, every reference resolves (core,
 * defined, previous, this group or another group of the round), every outline's subject and parties are terms, no key has two kinds or value types within the group,
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
    // A subject or party E gave as a label must be a term now (C adds the things E found no term for), or F's rules
    // can't name it: a sanction's imposer and the parties it's against too.
    const named = [...all.values()]
    for (const outline of group.outlines) {
      const parties = outline.sanction ? [...outline.sanction.imposedBy, ...outline.sanction.against] : []
      for (const text of [...outline.appliesTo, ...outline.bearer, ...outline.decidedBy, ...parties]) {
        if (subjectKey(text, named) === null) {
          report(group.groupId, {
            recordKey: outline.key,
            code: "unresolved-subject",
            message: `${outline.key} is about "${text}", which no term of the vocabulary is: add it as a thing or category`
          })
        }
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
    for (const { recordKey, code, message } of group.problems) {
      report(group.groupId, { recordKey, code, message })
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
