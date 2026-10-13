import { match } from "ts-pattern"
import type * as T from "@/schema/types"
import * as C from "./calendar"
import * as D from "./decimal"
import type { Value } from "./values"
import { type EngineVocabulary, type PropertyTerm, toBase } from "./vocabulary"

// What evaluating one request needs: the vocabulary, the request's entities and facts indexed, the organization's
// calendar, and what the review pipeline found in documents, judgments and text conditions.

/** A document check's statements as the document reader found them, per rule and subject. */
export type DocumentReview = { ruleKey: T.RuleKey; entity: string; statements: T.Finding["statements"] }

/** A model's answer to a judgment check for one subject. */
export type Judgment = { ruleKey: T.RuleKey; entity: string } & NonNullable<T.Finding["judgment"]>

/** Whether a text condition holds for an entity; null when it couldn't be told. */
export type ConditionAnswer = { entity: string; text: string; holds: boolean | null }

export type Answers = {
  documentReviews: DocumentReview[]
  judgments: Judgment[]
  conditionAnswers: ConditionAnswer[]
}

export type Entity = T.EvaluationRequest["entities"][number]
export type Input = T.Finding["inputs"][number]

/** The thing a path starts from: an entity, or an item of a many-valued list that isn't one. */
export type Item = { type: "entity"; id: string } | { type: "value"; value: Value }
export type Scope = { subject: Item }

/** A property's value for one entity: stated, derived or what silence means. */
export type Resolved =
  | { state: "known"; value: Value }
  | { state: "absent" }
  // partial: a range a derivation narrowed the value to; isUnstated: no fact at all, rather than an unclear one
  | { state: "unknown"; isUnstated: boolean; partial: Value | null }

export type Context = {
  vocabulary: EngineVocabulary
  request: T.EvaluationRequest
  settings: T.Settings
  flow: T.RequestType["flow"] | null
  governingDay: number
  evaluationDay: number
  entities: Map<string, Entity>
  facts: (entity: string, property: T.TermKey) => T.Fact[]
  rootId: (root: T.Root) => string
  shift: C.Shift
  holidays: C.HolidayCalendar
  answers: Answers
  derive: (context: Context, entity: string, property: PropertyTerm) => Resolved
  /** Every fact read while evaluating one finding, in order. */
  reads: Input[]
  /** Derived properties being computed, so a cycle is unknown rather than endless. */
  deriving: Set<string>
}

export type ContextOptions = {
  vocabulary: EngineVocabulary
  request: T.EvaluationRequest
  settings: T.Settings
  answers: Answers
  derive: Context["derive"]
}

export function createContext({ vocabulary, request, settings, answers, derive }: ContextOptions): Context {
  const entities = new Map(request.entities.map((entity) => [entity.id, entity]))
  const facts = new Map<string, T.Fact[]>()
  for (const fact of request.facts) {
    const key = `${fact.entity} ${fact.property}`
    facts.set(key, [...(facts.get(key) ?? []), fact])
  }
  const firstOfType = (type: T.TermKey) => request.entities.find((entity) => entity.type === type)?.id
  const roots: Record<Exclude<T.Root, "subject">, string> = {
    request: firstOfType(request.type) ?? "request",
    lot: request.lot ?? firstOfType("lot") ?? "lot",
    community: firstOfType("community") ?? "community"
  }
  const holidays = C.holidayCalendar(settings.clauses.time.holidays)

  const shift: C.Shift = (day, amount, unitKey) => {
    const unit = vocabulary.unit(unitKey)
    if (!unit) {
      return undefined
    }
    const whole = (value: D.Exact) => Number(D.floor(value))
    // Elapsed time converts through its base unit (the second); a date moves by whole days of it.
    const dayInBase = toBase(vocabulary, D.integer(1), "calendar-day")?.value
    return match(unit.dimension)
      .with("business-time", () => C.addBusinessDays(day, amount, holidays))
      .with("calendar-period", () =>
        C.addMonths(day, whole(toBase(vocabulary, D.exact(amount), unitKey)?.value ?? D.zero))
      )
      .with("elapsed-time", () => {
        const elapsed = toBase(vocabulary, D.exact(amount), unitKey)?.value
        return elapsed && dayInBase ? day + whole(D.divide(elapsed, dayInBase)) : undefined
      })
      .otherwise(() => undefined)
  }

  return {
    vocabulary,
    request,
    settings,
    flow: vocabulary.requestOf(request.type)?.flow ?? null,
    governingDay: C.toDay(request.governingDate),
    evaluationDay: C.toDay(request.evaluationDate),
    entities,
    facts: (entity, property) => facts.get(`${entity} ${property}`) ?? [],
    rootId: (root) => (root === "subject" ? "" : roots[root]),
    shift,
    holidays,
    answers,
    derive,
    reads: [],
    deriving: new Set()
  }
}

/** A stated value as evaluation reads it; undefined when its unit isn't one. */
export function valueOfFact(context: Context, value: T.FactValue): Value | undefined {
  return match(value)
    .returnType<Value | undefined>()
    .with({ type: "quantity" }, (quantity) => {
      const base = toBase(context.vocabulary, D.exact(quantity.value), quantity.unit)
      return base && { type: "number", range: { min: base.value, max: base.value }, dimension: base.dimension }
    })
    .with({ type: "number" }, (number) => {
      const exact = D.exact(number.value)
      return { type: "number", range: { min: exact, max: exact }, dimension: null }
    })
    .with({ type: "boolean" }, (boolean) => boolean)
    .with({ type: "value" }, ({ term, text }) => ({ type: "term", term, text }))
    .with({ type: "date" }, (date) => {
      const day = D.integer(C.toDay(date.value))
      return { type: "date", range: { min: day, max: day } }
    })
    .with({ type: "date-time" }, (dateTime) => {
      const minutes = D.integer(C.localMinutes(dateTime.value, context.settings.clauses.time.zone))
      return { type: "instant", range: { min: minutes, max: minutes } }
    })
    .with({ type: "time" }, (time) => ({ type: "time", minutes: C.minutesOf(time.value) }))
    .with({ type: "schedule" }, (schedule) => ({ type: "schedule", schedule }))
    .with({ type: "text" }, (text) => ({ type: "text", text: text.value }))
    .with({ type: "entity" }, (entity) => ({ type: "entity", id: entity.entity }))
    .exhaustive()
}
