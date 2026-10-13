import { match, P } from "ts-pattern"
import type * as T from "@/schema/types"
import { createVocabulary, type Vocabulary } from "@/schema/vocabulary"
import { rule as ruleSchema, term as termSchema, type TermContent } from "@/schema/zod"
import type { RulebookRecords } from "./assemble"
import { mapTermKeys, termKeysOf } from "./review"
import {
  isSameValueType,
  keyPart,
  keysNamedBy,
  pickableTerms,
  termRefFields,
  withTermsReplaced,
  type ChangeStamp
} from "./ruleTerms"

// Editing the vocabulary (encoding.md, UX, Terms). A term means the same in every rule that uses it, so a change to
// what it means changes those rules: the approved ones go back to review, and the term with them. A new name alone
// changes no rule, since a statement shows its terms' current names. Merging a term into another has every rule and
// term that used it use the other, and rejects it, since rejecting is how a record is dropped.

/** What an administrator can change about a term from its editor. */
export type TermEdit = {
  key: T.TermKey
  label: string
  /** Other names it's known by. */
  alternatives: string[]
  definition: string | null
  /** The unit a detail holding a quantity is stored in. */
  unit?: T.TermKey
  /** Whether a list allows only its choices. */
  isComplete?: boolean
}

const proposed: T.Review = { status: "proposed", by: null, at: null, note: null }

const personMade = (stamp: ChangeStamp): T.Provenance => ({ by: "person", userId: stamp.by, at: stamp.at })

/** Whether an edit changes what the term means, and not only what it's called. */
export function changesMeaning(term: TermContent, edit: TermEdit) {
  const isNewUnit =
    term.kind === "property" &&
    term.valueType.type === "quantity" &&
    edit.unit !== undefined &&
    edit.unit !== term.valueType.unit
  const isNewCompleteness =
    term.kind === "value-set" && edit.isComplete !== undefined && edit.isComplete !== term.complete
  return (term.definition ?? null) !== edit.definition || isNewUnit || isNewCompleteness
}

/** The approved rules that read a term, which a change to its meaning sends back to review. */
export function approvedRulesUsing(rules: T.Rule[], key: T.TermKey) {
  return rules.filter((rule) => rule.review.status === "approved" && termKeysOf(rule).has(key))
}

/** A rule back to review, its content as it is. */
const backToReview = (rule: T.Rule): T.Rule => ({ ...rule, review: proposed })

function draftTerm(records: RulebookRecords, key: T.TermKey) {
  const term = records.terms.find((item) => item.key === key)
  if (!term) {
    throw new Error("The term isn't in the draft.")
  }
  return term
}

/** The labels after an edit: its name and other names as given, and any others it has as they are. */
function editedLabels(term: T.Term, edit: TermEdit, provenance: T.Provenance): T.Term["labels"] {
  const label = (text: string, role: "preferred" | "alternative") => {
    const same = term.labels.find((item) => item.role === role && item.text === text)
    return same ?? { text, role, plural: null, citation: null, provenance }
  }
  const alternatives = [...new Set(edit.alternatives.map((text) => text.trim()).filter((text) => text !== ""))]
  return [
    label(edit.label.trim(), "preferred"),
    ...alternatives.filter((text) => text !== edit.label.trim()).map((text) => label(text, "alternative")),
    ...term.labels.filter((item) => item.role === "hidden" || item.role === "avoid")
  ]
}

/**
 * Saves an edit of a term. A new name or other names leave its review and its rules as they are; a new meaning sends
 * the term, and the approved rules that read it, back to review.
 */
export function editTerm(records: RulebookRecords, edit: TermEdit, stamp: ChangeStamp) {
  const term = draftTerm(records, edit.key)
  const vocabulary = createVocabulary(records.terms)
  const provenance = personMade(stamp)
  const isNewMeaning = changesMeaning(term, edit)
  const kindChanges = match(term)
    .with({ kind: "property", valueType: { type: "quantity" } }, ({ valueType }) => {
      const unit = edit.unit ?? valueType.unit
      const dimension = (key: T.TermKey) => vocabulary.get(key)
      const [from, to] = [dimension(valueType.unit), dimension(unit)]
      if (from?.kind !== "unit" || to?.kind !== "unit" || from.dimension !== to.dimension) {
        throw new Error("A quantity's unit can only change to another of the same kind.")
      }
      return { valueType: { type: "quantity" as const, unit } }
    })
    .with({ kind: "value-set" }, ({ complete }) => ({ complete: edit.isComplete ?? complete }))
    .otherwise(() => ({}))
  const edited = termSchema.parse({
    ...term,
    ...kindChanges,
    labels: editedLabels(term, edit, provenance),
    definition: edit.definition,
    provenance,
    review: isNewMeaning ? proposed : term.review
  })
  return {
    terms: [edited],
    rules: isNewMeaning ? approvedRulesUsing(records.rules, term.key).map(backToReview) : []
  }
}

/** A new choice in a list, to review; no rule reads it yet. */
export function addChoice(records: RulebookRecords, listKey: T.TermKey, label: string, stamp: ChangeStamp) {
  const vocabulary = createVocabulary(records.terms)
  const list = vocabulary.get(listKey)
  if (list?.kind !== "value-set") {
    throw new Error("Choices are added to a list of choices.")
  }
  const name = label.trim()
  const taken = records.terms.some(
    (term) =>
      term.kind === "value" &&
      term.set === listKey &&
      term.labels.some((item) => item.text.toLocaleLowerCase() === name.toLocaleLowerCase())
  )
  if (taken) {
    throw new Error(`The list already has “${name}”.`)
  }
  const base = `${listKey}.${keyPart(name) || "choice"}`
  let key = base
  for (let count = 2; vocabulary.get(key); count += 1) {
    key = `${base}-${count}`
  }
  const provenance = personMade(stamp)
  return termSchema.parse({
    key,
    organizationId: records.organization.id,
    kind: "value",
    set: listKey,
    broader: [],
    labels: [{ text: name, role: "preferred", plural: null, citation: null, provenance }],
    definition: null,
    scopeNote: null,
    context: null,
    citations: [],
    provenance,
    review: proposed,
    issues: []
  })
}

/** Whether a value anywhere in a structure is the key: the settings name terms in fields of their own. */
function mentions(value: unknown, key: T.TermKey): boolean {
  if (typeof value === "string") {
    return value === key
  }
  if (Array.isArray(value)) {
    return value.some((item) => mentions(item, key))
  }
  return typeof value === "object" && value !== null && Object.values(value).some((item) => mentions(item, key))
}

/**
 * The terms a term can be merged into: the same kind of term in the same place (a thing or kind of the same nature, a
 * detail of the same thing holding the same kind of value, a choice from the same list, a unit of the same
 * dimension). A term others hang off (a thing's details or kinds, a list's choices) isn't merged, since they'd be left
 * without it.
 */
export function mergeCandidates(vocabulary: Vocabulary, terms: TermContent[], from: T.TermKey) {
  const term = vocabulary.get(from)
  const hasDependents = terms.some(
    (item) =>
      ((item.kind === "property" || item.kind === "category") && item.of === from) ||
      (item.kind === "value" && item.set === from)
  )
  if (!term || hasDependents) {
    return []
  }
  const natureOf = (key: T.TermKey) => {
    const thing = vocabulary.get(vocabulary.thingOf(key))
    return thing?.kind === "thing" ? thing.nature : null
  }
  const fits = match(term)
    .returnType<(candidate: TermContent) => boolean>()
    .with(
      { kind: P.union("thing", "category") },
      () => (candidate) =>
        (candidate.kind === "thing" || candidate.kind === "category") && natureOf(candidate.key) === natureOf(from)
    )
    .with(
      { kind: "property" },
      (property) => (candidate) =>
        candidate.kind === "property" &&
        candidate.many === property.many &&
        vocabulary.thingOf(candidate.of) === vocabulary.thingOf(property.of) &&
        isSameValueType(vocabulary, candidate.valueType, property.valueType)
    )
    .with({ kind: "value" }, (value) => (candidate) => candidate.kind === "value" && candidate.set === value.set)
    .with(
      { kind: "unit" },
      (unit) => (candidate) => candidate.kind === "unit" && candidate.dimension === unit.dimension
    )
    .with({ kind: "value-set" }, () => () => false)
    .exhaustive()
  return terms.filter((candidate) => candidate.key !== from && fits(candidate))
}

/**
 * Merges a term into another: every rule and term that used it uses the other, and it's rejected with a note naming
 * the other. The rules that change go back to review, as do the terms, unless they were rejected.
 */
export function mergeTerm(records: RulebookRecords, from: T.TermKey, into: T.TermKey, stamp: ChangeStamp) {
  const term = draftTerm(records, from)
  const vocabulary = createVocabulary(records.terms)
  if (!mergeCandidates(vocabulary, pickableTerms(records.terms), from).some((candidate) => candidate.key === into)) {
    throw new Error("It can't be merged into that term.")
  }
  if (mentions(records.settings.clauses, from)) {
    throw new Error("The settings use it; change them to use the other term first.")
  }
  const mapping = new Map([[from, into]])
  const provenance = personMade(stamp)
  const reviewAfter = (review: T.Review) => (review.status === "rejected" ? review : proposed)
  const rules = records.rules
    .filter((rule) => termKeysOf(rule).has(from))
    .map((rule) =>
      ruleSchema.parse({ ...withTermsReplaced(rule, mapping), provenance, review: reviewAfter(rule.review) })
    )
  const replace = (key: T.TermKey) => mapping.get(key) ?? key
  const terms = records.terms
    .filter((item) => item.key !== from && keysNamedBy(item).includes(from))
    .map((item) =>
      termSchema.parse(mapTermKeys({ ...item, provenance, review: reviewAfter(item.review) }, replace, termRefFields))
    )
  const merged = termSchema.parse({
    ...term,
    provenance,
    review: { status: "rejected", by: stamp.by, at: stamp.at, note: `Merged into “${vocabulary.label(into)}”.` }
  })
  return { rules, terms: [...terms, merged] }
}
