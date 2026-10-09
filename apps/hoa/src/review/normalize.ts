import type { EngineVocabulary } from "@/engine/vocabulary"
import { coreTerms } from "@/schema/coreTerms"
import type * as T from "@/schema/types"
import type { TermContent } from "@/schema/zod"
import { parseDate } from "@/text/date"
import { matchLabel } from "@/text/match"
import { parseQuantity, type UnitLabels } from "@/text/quantity"
import { labelsOf } from "./documentTypes"
import type { FactPlan, PlannedProperty, PlannedValue } from "./factPlan"
import { toEvidence, type FactAnswer } from "./factSchema"
import type { Normalization } from "./reviewModel"
import { isFound, recited, type PageTexts } from "./verifyEvidence"

// Normalize (application-review.md, Normalize): stated values to typed values with no model. Quantities through the
// quantity grammar, choices matched to the property's value terms (exact, normalized, fuzzy), dates through the date
// grammar, references to entity ids. Then evidence verification (a quote cited on the wrong page is cited where it is),
// conflicts between readings, and the organization's fact confidence threshold.

export type NormalizeContext = {
  plan: FactPlan
  vocabulary: EngineVocabulary
  /** The rulebook's unit terms with every label, for the quantity grammar. */
  units: readonly UnitLabels[]
  /** The party terms with every label, for party values. */
  parties: readonly PlannedValue[]
  entities: readonly T.EvaluationRequest["entities"][number][]
  /** The year a date without one is in. */
  referenceDate: T.IsoDate
  factConfidence: number
  pageText: PageTexts
  /** Every page of the packet, in order, where a quote cited on the wrong page is looked for. */
  pages: readonly { fileId: string; pageIndex: number }[]
  at: T.Timestamp
}

type Reading = { value: T.FactValue | null; normalization: Omit<Normalization, "entity" | "property"> | null }

const unread: Reading = { value: null, normalization: null }

type LabelMatch = { value: PlannedValue; label: string; kind: "exact" | "normalized" | "fuzzy"; score: number }

const rank = { exact: 3, normalized: 2, fuzzy: 1 }

/** The value whose label best matches a stated text: verbatim, then normalized, then the best fuzzy score. */
export function matchValue(text: string, values: readonly PlannedValue[]): LabelMatch | null {
  let best: LabelMatch | null = null
  for (const value of values) {
    for (const label of value.labels) {
      const match =
        text.trim() === label.trim() ? { kind: "exact" as const, score: 1 } : matchLabel(text, { text: label })
      if (!match) {
        continue
      }
      const kind: LabelMatch["kind"] =
        match.kind === "exact" && text.trim() !== label.trim() ? "normalized" : match.kind
      const candidate = { value, label, kind, score: match.score }
      if (!best || rank[kind] > rank[best.kind] || (kind === best.kind && match.score > best.score)) {
        best = candidate
      }
    }
  }
  return best
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/
const isString = (value: unknown): value is string => typeof value === "string"

function readChoice(answer: FactAnswer, values: readonly PlannedValue[], isComplete: boolean): Reading {
  const fromReading = values.find((value) => value.key === answer.reading)
  const text = answer.stated ?? fromReading?.labels[0] ?? null
  if (text === null) {
    return unread
  }
  const matched = matchValue(text, values)
  if (matched) {
    return {
      value: { type: "value", term: matched.value.key, text },
      normalization: { stated: text, matchedLabel: matched.label, kind: matched.kind, score: matched.score }
    }
  }
  // Labels can be phrases the packet never uses ("enclosing a garage as living space"): the model's reading names the
  // allowed value it took the stated words for, and stands when no label matches them.
  if (fromReading) {
    return {
      value: { type: "value", term: fromReading.key, text },
      normalization: { stated: text, matchedLabel: fromReading.labels[0] ?? null, kind: "reading", score: null }
    }
  }
  const normalization = { stated: text, matchedLabel: null, kind: "none" as const, score: null }
  // A value no term matches stands as written in an open set; in a complete one it's invalid.
  return { value: isComplete ? null : { type: "value", term: null, text }, normalization }
}

function readQuantity(answer: FactAnswer, property: PlannedProperty, context: NormalizeContext): Reading {
  if (answer.stated === null) {
    return unread
  }
  const parsed = parseQuantity(answer.stated, context.units)
  const unit = property.valueType.type === "quantity" ? property.valueType.unit : null
  const dimension = unit ? context.vocabulary.unit(unit)?.dimension : undefined
  const isSameDimension = parsed !== null && context.vocabulary.unit(parsed.unit)?.dimension === dimension
  const normalization = { stated: answer.stated, matchedLabel: null, score: null }
  if (parsed?.type !== "single" || !isSameDimension) {
    return { value: null, normalization: { ...normalization, kind: "none" } }
  }
  return {
    value: { type: "quantity", value: parsed.value, unit: parsed.unit },
    normalization: { ...normalization, matchedLabel: context.vocabulary.label(parsed.unit), kind: "parsed" }
  }
}

function readDate(answer: FactAnswer, context: NormalizeContext): Reading {
  const text = answer.stated ?? (isString(answer.reading) ? answer.reading : null)
  if (text === null) {
    return unread
  }
  const value = parseDate(text, context.referenceDate)
  return {
    value: value ? { type: "date", value } : null,
    normalization: { stated: text, matchedLabel: value, kind: value ? "parsed" : "none", score: null }
  }
}

/**
 * A party: the model's reading (a role, never a name) when it gives one, else the stated words, matched to the party
 * terms. A role no party term names (a landscaper) stands as written: it's known, and it isn't any party the rules list.
 */
function readParty(answer: FactAnswer, parties: readonly PlannedValue[]): Reading {
  const text = isString(answer.reading) ? answer.reading : answer.stated
  if (text === null) {
    return unread
  }
  const matched = matchValue(text, parties)
  return matched
    ? {
        value: { type: "value", term: matched.value.key, text },
        normalization: { stated: text, matchedLabel: matched.label, kind: matched.kind, score: matched.score }
      }
    : {
        value: { type: "value", term: null, text },
        normalization: { stated: text, matchedLabel: null, kind: "none", score: null }
      }
}

function readValue(answer: FactAnswer, property: PlannedProperty, context: NormalizeContext): Reading {
  const { reading } = answer
  const { valueType } = property
  switch (valueType.type) {
    case "quantity":
      return readQuantity(answer, property, context)
    case "choice":
      return readChoice(answer, property.values ?? [], property.isComplete === true)
    case "party":
      return readParty(answer, context.parties)
    case "date":
      return readDate(answer, context)
    case "boolean":
      return { value: typeof reading === "boolean" ? { type: "boolean", value: reading } : null, normalization: null }
    case "count":
      return { value: typeof reading === "number" ? { type: "number", value: reading } : null, normalization: null }
    case "reference":
      return {
        value:
          isString(reading) && context.entities.some((entity) => entity.id === reading)
            ? { type: "entity", entity: reading }
            : null,
        normalization: null
      }
    case "date-time":
      return {
        value:
          isString(reading) && isoDate.test(reading.slice(0, 10))
            ? { type: "date-time", value: `${reading}:00Z` }
            : null,
        normalization: null
      }
    case "time-of-day":
      return {
        value: isString(reading) && /^([01]\d|2[0-3]):[0-5]\d$/.test(reading) ? { type: "time", value: reading } : null,
        normalization: null
      }
    case "text": {
      const text = answer.stated ?? (isString(reading) ? reading : null)
      return { value: text === null ? null : { type: "text", value: text }, normalization: null }
    }
    case "schedule":
      return unread
  }
}

/** Two readings agree when they name the same term, or the same value. */
export function sameValue(a: T.FactValue, b: T.FactValue) {
  if (a.type === "value" && b.type === "value") {
    return a.term !== null || b.term !== null ? a.term === b.term : a.text.toLowerCase() === b.text.toLowerCase()
  }
  return JSON.stringify(a) === JSON.stringify(b)
}

const uniqueValues = (values: readonly T.FactValue[]) =>
  values.filter((value, index) => values.findIndex((other) => sameValue(other, value)) === index)

/** One answer as a fact: typed, its evidence checked, and held uncertain when it can't be relied on. */
/** An answer's evidence, each quote cited where it is. */
const evidenceOf = (answer: FactAnswer, context: NormalizeContext) =>
  answer.evidence.map((item) => recited(toEvidence(item), context.pageText, context.pages))

function toFact(answer: FactAnswer, property: PlannedProperty, context: NormalizeContext) {
  const evidence = evidenceOf(answer, context)
  const provenance = { by: "extraction" as const, at: context.at }
  const base = {
    entity: answer.entity,
    property: property.key,
    complete: null,
    stated: answer.stated,
    evidence,
    confidence: answer.confidence,
    provenance
  }
  if (answer.state === "absent") {
    const fact: T.Fact = { ...base, state: "absent", value: null, candidates: [] }
    return { fact, normalization: null }
  }
  const { value, normalization } = readValue(answer, property, context)
  const isVerified = evidence.some((item) => isFound(item, context.pageText))
  const isReliable =
    answer.state === "known" && value !== null && isVerified && answer.confidence >= context.factConfidence
  const fact: T.Fact = isReliable
    ? { ...base, state: "known", value, candidates: [] }
    : {
        ...base,
        state: answer.state === "conflicting" ? "conflicting" : "uncertain",
        value: null,
        candidates: value ? [value] : []
      }
  return {
    fact,
    normalization: normalization ? { entity: answer.entity, property: property.key, ...normalization } : null
  }
}

/** Facts on one entity's single-valued property merged: agreeing readings into one, disagreeing ones conflicting. */
function merge(first: T.Fact, rest: readonly T.Fact[]): T.Fact {
  if (rest.length === 0) {
    return first
  }
  const facts = [first, ...rest]
  const evidence = facts.flatMap((fact) => fact.evidence)
  const readings = uniqueValues(facts.flatMap((fact) => (fact.value ? [fact.value] : fact.candidates)))
  const isAbsent = facts.every((fact) => fact.state === "absent")
  if (isAbsent) {
    return { ...first, evidence }
  }
  if (readings.length > 1 || facts.some((fact) => fact.state === "conflicting")) {
    return { ...first, state: "conflicting", value: null, candidates: readings, evidence, stated: null }
  }
  const best = facts.find((fact) => fact.state === "known") ?? first
  return { ...best, evidence }
}

export function normalizeFacts(answers: readonly FactAnswer[], context: NormalizeContext) {
  const properties = new Map(context.plan.properties.map((property) => [property.key, property]))
  // "None" stands only on evidence found where it says: an absent answer with nothing behind it is a guess, and no
  // answer means unknown.
  const isGrounded = (answer: FactAnswer) =>
    answer.state !== "absent" || evidenceOf(answer, context).some((item) => isFound(item, context.pageText))
  const normalized = answers.filter(isGrounded).flatMap((answer) => {
    const property = properties.get(answer.property)
    return property ? [{ ...toFact(answer, property, context), many: property.many }] : []
  })
  const singles = Map.groupBy(
    normalized.filter((item) => !item.many),
    (item) => `${item.fact.entity} ${item.fact.property}`
  )
  return {
    facts: [
      ...[...singles.values()].flatMap(([first, ...rest]) =>
        first
          ? [
              merge(
                first.fact,
                rest.map((item) => item.fact)
              )
            ]
          : []
      ),
      ...normalized.filter((item) => item.many).map((item) => item.fact)
    ],
    normalizations: normalized.flatMap((item) => (item.normalization ? [item.normalization] : []))
  }
}

/** Every term the rulebook can use: the portal's core terms, then the file's own. */
export function allTerms(rulesFile: T.RulesFile): TermContent[] {
  return [...coreTerms, ...rulesFile.proposedCore, ...rulesFile.terms]
}

/** The unit terms as the quantity grammar reads them. */
export function unitLabels(rulesFile: T.RulesFile, vocabulary: EngineVocabulary): UnitLabels[] {
  return allTerms(rulesFile).flatMap((term) =>
    term.kind === "unit" && vocabulary.get(term.key) === term
      ? [{ unit: term.key, labels: [term.key, ...labelsOf(vocabulary, term.key)], perBase: term.perBase }]
      : []
  )
}

/** The party terms with their labels, for party values. */
export function partyValues(rulesFile: T.RulesFile, vocabulary: EngineVocabulary): PlannedValue[] {
  return allTerms(rulesFile).flatMap((term) =>
    term.kind === "thing" && term.nature === "party" && vocabulary.get(term.key) === term
      ? [{ key: term.key, labels: labelsOf(vocabulary, term.key) }]
      : []
  )
}
