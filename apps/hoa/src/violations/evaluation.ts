import * as C from "@/engine/calendar"
import { conditionHolds, enforces, evaluateSanctions } from "@/engine/sanctions"
import type * as T from "@/schema/types"
import {
  statedFacts,
  stepDates,
  type FactValue,
  type Violation,
  type ViolationEvent,
  type ViolationPerson
} from "./violation"

// A violation as the engine sees it (docs/design/violations.md, What the documents allow): a `violation` request with
// the dates its history gives, judged as of the day it was observed, evaluated today; and the earlier violations each
// sanction's `occurrences` counts.

/** A violation with what the engine reads of it. */
export type ViolationCase = {
  violation: Pick<Violation, "id" | "unitId" | "observedOn">
  ruleKeys: readonly T.RuleKey[]
  people: readonly ViolationPerson[]
  events: readonly ViolationEvent[]
}

/** An earlier violation, as occurrences count it. */
export type PriorViolation = {
  id: string
  unitId: string
  observedOn: T.IsoDate
  status: Violation["status"]
  ruleKeys: readonly T.RuleKey[]
  ownerIds: readonly string[]
  /** Cured within its time to cure. */
  curedInTime: boolean
}

const system = { by: "system" as const, at: "1970-01-01T00:00:00Z" }

/** The properties the history records, which the board takes steps for rather than states. */
export const recordedProperties: ReadonlySet<T.TermKey> = new Set([
  "violation.observed-on",
  "violation.notice-delivered-on",
  "violation.hearing-requested-on",
  "violation.hearing-held-on",
  "violation.cured-on",
  "violation.occurrence"
])

function dateFact(property: T.TermKey, day: T.IsoDate | null): T.Fact {
  return requestFact(property, day ? { type: "date", value: day } : null)
}

/** A fact about the violation: known with its value, or absent without one. */
function requestFact(property: T.TermKey, value: FactValue | null): T.Fact {
  return {
    entity: "request",
    property,
    state: value ? "known" : "absent",
    value,
    candidates: [],
    complete: null,
    stated: null,
    evidence: [],
    confidence: null,
    provenance: system
  }
}

/** The violation as a `violation` request, evaluated on a day; `overrides` replaces a step's date, as for a notice sent now. */
export function violationRequest(
  organizationId: string,
  violationCase: ViolationCase,
  evaluationDate: T.IsoDate,
  overrides: Partial<ReturnType<typeof stepDates>> = {}
): T.EvaluationRequest {
  const { violation } = violationCase
  const steps = { ...stepDates(violationCase.events), ...overrides }
  return {
    organizationId,
    type: "violation",
    governingDate: violation.observedOn,
    evaluationDate,
    lot: "lot",
    entities: [
      { id: "request", type: "violation", label: "the violation", ref: violation.id },
      { id: "lot", type: "lot", label: "the lot", ref: violation.unitId },
      { id: "community", type: "community", label: "the community", ref: null }
    ],
    facts: [
      dateFact("violation.observed-on", violation.observedOn),
      dateFact("violation.notice-delivered-on", steps.noticeDeliveredOn),
      dateFact("violation.hearing-requested-on", steps.hearingRequestedOn),
      dateFact("violation.hearing-held-on", steps.hearingHeldOn),
      dateFact("violation.cured-on", steps.curedOn),
      ...[...statedFacts(violationCase.events)]
        .filter(([property]) => !recordedProperties.has(property))
        .map(([property, value]) => requestFact(property, value))
    ],
    documents: []
  }
}

/** The first day earlier violations count from, for a period before a day; null when the unit isn't one of time. */
export function countsFrom(day: T.IsoDate, within: T.Amount): T.IsoDate | null {
  const start = C.toDay(day)
  const months: Record<string, number> = { month: 1, quarter: 3, year: 12 }
  const days: Record<string, number> = { "calendar-day": 1, week: 7 }
  const monthly = months[within.unit]
  if (monthly !== undefined) {
    return C.fromDay(C.addMonths(start, -within.value * monthly))
  }
  const daily = days[within.unit]
  return daily === undefined ? null : C.fromDay(start - within.value * daily)
}

/**
 * Which occurrence this violation is for a sanction, as its `occurrences` says: the earlier violations within its
 * period, of the same rule or any rule it enforces, on the same lot or by the same owner, leaving out those cured in
 * time unless they count, plus this one. Dismissed violations never count.
 */
export function occurrenceCounter(
  rulesFile: T.RulesFile,
  current: ViolationCase,
  priors: readonly PriorViolation[]
): (sanction: T.SanctionRule, enforced: T.RuleKey) => number | null {
  const rules = new Map(rulesFile.rules.map((rule) => [rule.key, rule]))
  const owners = new Set(current.people.filter((person) => person.party === "owner").map((person) => person.personId))
  return (sanction, enforced) => {
    const spec = sanction.sanction.occurrences
    if (!spec) {
      return null
    }
    const from = countsFrom(current.violation.observedOn, spec.within)
    const breaks = (prior: PriorViolation) =>
      spec.counts === "same-rule"
        ? prior.ruleKeys.includes(enforced)
        : prior.ruleKeys.some((key) => {
            const rule = rules.get(key)
            return rule !== undefined && enforces(sanction, rule)
          })
    const isSamePlace = (prior: PriorViolation) =>
      spec.per === "lot" ? prior.unitId === current.violation.unitId : prior.ownerIds.some((id) => owners.has(id))
    const earlier = priors.filter(
      (prior) =>
        prior.id !== current.violation.id &&
        prior.status !== "dismissed" &&
        prior.observedOn < current.violation.observedOn &&
        (from === null || prior.observedOn >= from) &&
        breaks(prior) &&
        isSamePlace(prior) &&
        (spec.includesCured || !prior.curedInTime)
    )
    return earlier.length + 1
  }
}

/** What the documents allow for a violation today: its rules' cure periods, and the sanctions that enforce them. */
export function evaluateViolation(
  rulesFile: T.RulesFile,
  violationCase: ViolationCase,
  priors: readonly PriorViolation[],
  evaluationDate: T.IsoDate,
  overrides: Partial<ReturnType<typeof stepDates>> = {}
) {
  return evaluateSanctions({
    rulesFile,
    request: violationRequest(rulesFile.organization.id, violationCase, evaluationDate, overrides),
    broken: [...violationCase.ruleKeys],
    occurrenceOf: occurrenceCounter(rulesFile, violationCase, priors)
  })
}

/** The steps the board takes that the documents' procedures can turn on, in the order they're taken. */
export const procedureSteps = ["notice", "hearing"] as const
export type ProcedureStep = (typeof procedureSteps)[number]

const stepOverrides = (step: ProcedureStep, day: T.IsoDate): Partial<ReturnType<typeof stepDates>> =>
  step === "notice" ? { noticeDeliveredOn: day } : { hearingHeldOn: day }

// Every set of steps, fewest first.
const stepSets: ProcedureStep[][] = [[], ["notice"], ["hearing"], ["notice", "hearing"]]

/**
 * The fewest of the board's steps that would meet a procedure the documents require, taken today: none when it's met
 * already; null when no steps would, as when it turns on something else, such as an emergency.
 */
export function stepsToMeet(
  rulesFile: T.RulesFile,
  violationCase: ViolationCase,
  evaluationDate: T.IsoDate,
  condition: T.Condition
): ProcedureStep[] | null {
  const steps = stepDates(violationCase.events)
  const taken = (step: ProcedureStep) => (step === "notice" ? steps.noticeDeliveredOn : steps.hearingHeldOn) !== null
  const meets = (set: readonly ProcedureStep[]) => {
    const overrides = Object.assign({}, ...set.map((step) => stepOverrides(step, evaluationDate)))
    const request = violationRequest(rulesFile.organization.id, violationCase, evaluationDate, overrides)
    return conditionHolds(rulesFile, request, condition) === true
  }
  return stepSets.find((set) => !set.some(taken) && meets(set)) ?? null
}
