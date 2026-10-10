import invariant from "tiny-invariant"
import { z } from "zod"
import * as D from "@/engine/decimal"
import { toBase, type EngineVocabulary } from "@/engine/vocabulary"
import { coreTerms } from "@/schema/coreTerms"
import type * as T from "@/schema/types"
import type { TermContent } from "@/schema/zod"
import { parseDate } from "@/text/date"
import { matchLabel } from "@/text/match"
import { parseQuantity, type UnitLabels } from "@/text/quantity"
import type { Correction, CorrectionReading } from "./corrections"
import { labelsOf } from "./documentTypes"
import type { FactPlan, PlannedProperty, PlannedValue } from "./factPlan"
import { exactFraction, toEvidence, type FactAnswer } from "./factSchema"
import type { Normalization } from "./reviewModel"
import { checkCount, checkDate, checkQuantity, type ExactQuantity, type ValueProblem } from "./valueCheck"
import { isFound, recited, type PageTexts } from "./verifyEvidence"

// Normalize (application-review.md, Normalize): the model's readings to typed values, checked by code. Quantities,
// counts and dates are the model's values verified generically against the words they were read from, with the
// grammars as fast checks; choices are matched to the property's value terms (exact, normalized, fuzzy), else the
// model's reading; references to entity ids. Then evidence verification (a quote cited on the wrong page is cited
// where it is), conflicts between readings, and the organization's fact confidence threshold. Every value code
// rejects or reads differently is recorded as a correction.

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

type Reading = {
  value: T.FactValue | null
  /** Values read but not accepted, held as the fact's candidates; the value alone when not given. */
  candidates?: T.FactValue[]
  normalization: Omit<Normalization, "entity" | "property"> | null
  /** A value code rejected, or a fast check that read the words differently. */
  check?: {
    kind: Extract<Correction["kind"], "verifier-rejected" | "check-disagrees">
    problems: ValueProblem[]
    readings: { by: "model" | "grammar"; value: T.FactValue }[]
  }
}

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
  // Labels can be phrases the packet never uses (a value term labeled with a phrase from the governing text): the model's reading names the
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

/**
 * A value the model proposed, checked by the generic verifier, with a fast check (a grammar) read from the same words
 * when it has one. The model's value stands when it verifies and the fast check doesn't verify another; a fast check's
 * value stands when the model's doesn't verify; two verified values that differ leave both as candidates. The grammar
 * never gates: a form it can't read leaves the model's verified value standing.
 */
type Proposal<V> = {
  model: V | null
  fast: V | null
  problems: (value: V) => ValueProblem[]
  isSame: (a: V, b: V) => boolean
  toValue: (value: V) => T.FactValue
  label: (value: V) => string | null
}

function verifiedReading<V>(stated: string | null, proposal: Proposal<V>): Reading {
  const { model, fast } = proposal
  const normalization = (kind: "parsed" | "verified" | "none", value: V | null) =>
    stated === null ? null : { stated, matchedLabel: value === null ? null : proposal.label(value), kind, score: null }
  const readings = [
    ...(model === null ? [] : [{ by: "model" as const, value: proposal.toValue(model) }]),
    ...(fast === null ? [] : [{ by: "grammar" as const, value: proposal.toValue(fast) }])
  ]
  const modelProblems = model === null ? [] : proposal.problems(model)
  const isFastVerified = fast !== null && proposal.problems(fast).length === 0
  if (model !== null && modelProblems.length === 0) {
    if (fast !== null && isFastVerified && !proposal.isSame(model, fast)) {
      return {
        value: null,
        candidates: readings.map((reading) => reading.value),
        normalization: normalization("none", null),
        check: { kind: "check-disagrees", problems: [], readings }
      }
    }
    const isParsed = fast !== null && proposal.isSame(model, fast)
    return { value: proposal.toValue(model), normalization: normalization(isParsed ? "parsed" : "verified", model) }
  }
  const check = model === null ? undefined : { kind: "verifier-rejected" as const, problems: modelProblems, readings }
  if (fast !== null && isFastVerified) {
    return { value: proposal.toValue(fast), normalization: normalization("parsed", fast), check }
  }
  return {
    value: null,
    candidates: model === null ? [] : [proposal.toValue(model)],
    normalization: normalization("none", null),
    check
  }
}

const quantityReading = z.object({ value: z.union([z.number(), z.string().regex(exactFraction)]), unit: z.string() })

/** A quantity reading's amount, exactly: a number by its decimal form, or a fraction. */
function exactAmount(value: number | string) {
  if (typeof value === "number") {
    return D.exact(value)
  }
  const [numerator = "0", denominator = "1"] = value.split("/")
  return D.divide(D.exact(numerator), D.exact(denominator))
}

function readQuantity(answer: FactAnswer, property: PlannedProperty, context: NormalizeContext): Reading {
  const { vocabulary } = context
  invariant(property.valueType.type === "quantity", "a quantity property")
  const expectedUnit = property.valueType.unit
  const reading = quantityReading.safeParse(answer.reading)
  const parsed = answer.stated === null ? null : parseQuantity(answer.stated, context.units)
  const units = context.units.map((unit) => unit.unit)
  const inBase = (quantity: ExactQuantity) => toBase(vocabulary, quantity.value, quantity.unit)
  return verifiedReading<ExactQuantity>(answer.stated, {
    model: reading.success ? { value: exactAmount(reading.data.value), unit: reading.data.unit } : null,
    fast: parsed?.type === "single" ? { value: D.exact(parsed.value), unit: parsed.unit } : null,
    problems: (quantity) => checkQuantity(answer.stated, quantity, expectedUnit, { vocabulary, units }),
    isSame: (a, b) => {
      const [first, second] = [inBase(a), inBase(b)]
      return (
        first !== undefined &&
        second !== undefined &&
        first.dimension === second.dimension &&
        D.compare(first.value, second.value) === 0
      )
    },
    toValue: (quantity) => ({ type: "quantity", value: D.toNumber(quantity.value), unit: quantity.unit }),
    label: (quantity) => vocabulary.label(quantity.unit)
  })
}

const isIsoDate = (value: unknown): value is T.IsoDate =>
  isString(value) && isoDate.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)

function readDate(answer: FactAnswer, context: NormalizeContext): Reading {
  return verifiedReading<T.IsoDate>(answer.stated, {
    model: isIsoDate(answer.reading) ? answer.reading : null,
    fast: answer.stated === null ? null : parseDate(answer.stated, context.referenceDate),
    problems: (date) => checkDate(answer.stated, date),
    isSame: (a, b) => a === b,
    toValue: (date) => ({ type: "date", value: date }),
    label: (date) => date
  })
}

/** A count: the model's number, checked against any numerals its words write. Counts record no normalization. */
function readCount(answer: FactAnswer): Reading {
  const { reading } = answer
  const count = typeof reading === "number" && Number.isInteger(reading) && reading >= 0 ? reading : null
  const verified = verifiedReading<number>(answer.stated, {
    model: count,
    fast: null,
    problems: (value) => checkCount(answer.stated, value),
    isSame: (a, b) => a === b,
    toValue: (value) => ({ type: "number", value }),
    label: () => null
  })
  return { ...verified, normalization: null }
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
      // A value the administrator added to the form's choices is its own: never matched, however close, to the
      // rulebook's, so a rule listing values doesn't take it for one of them.
      if (answer.asWritten === "value") {
        return { value: answer.stated ? { type: "value", term: null, text: answer.stated } : null, normalization: null }
      }
      return readChoice(answer, property.values ?? [], property.isComplete === true)
    case "party":
      return readParty(answer, context.parties)
    case "date":
      return readDate(answer, context)
    case "boolean":
      return { value: typeof reading === "boolean" ? { type: "boolean", value: reading } : null, normalization: null }
    case "count":
      return readCount(answer)
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
    return { fact, normalization: null, correction: null }
  }
  // A description in the homeowner's words ("Other") is no value a rule can test: it stays uncertain, the words its
  // only reading, so the rules that read it go to the committee with them.
  if (answer.asWritten === "description") {
    const words: T.FactValue[] = answer.stated ? [{ type: "text", value: answer.stated }] : []
    const fact: T.Fact = { ...base, state: "uncertain", value: null, candidates: words }
    return { fact, normalization: null, correction: null }
  }
  const { value, candidates, normalization, check } = readValue(answer, property, context)
  const isVerified = evidence.some((item) => isFound(item, context.pageText))
  const isReliable =
    answer.state === "known" && value !== null && isVerified && answer.confidence >= context.factConfidence
  const fact: T.Fact = isReliable
    ? { ...base, state: "known", value, candidates: [] }
    : {
        ...base,
        state: answer.state === "conflicting" ? "conflicting" : "uncertain",
        value: null,
        candidates: value ? [value] : (candidates ?? [])
      }
  const correction: Correction | null = check
    ? {
        kind: check.kind,
        entity: answer.entity,
        property: property.key,
        stated: answer.stated,
        problems: check.problems,
        readings: check.readings.map(({ by, value: read }): CorrectionReading =>
          by === "model"
            ? { by, modelId: null, state: answer.state, value: read, confidence: answer.confidence, evidence }
            : { by, modelId: null, state: null, value: read, confidence: null, evidence: [] }
        ),
        result: { state: fact.state, value: fact.value },
        at: context.at
      }
    : null
  return {
    fact,
    normalization: normalization ? { entity: answer.entity, property: property.key, ...normalization } : null,
    correction
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
    normalizations: normalized.flatMap((item) => (item.normalization ? [item.normalization] : [])),
    corrections: normalized.flatMap((item) => (item.correction ? [item.correction] : []))
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
      ? [{ key: term.key, labels: labelsOf(vocabulary, term.key), meaning: null }]
      : []
  )
}
