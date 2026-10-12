import type * as T from "@/schema/types"
import { readingOf, type Correction } from "./corrections"
import type { EntityGroup } from "./factPlan"
import { sameValue } from "./normalize"
import { citedFile, type Packet, type PageRef } from "./packet"

// The verification pass (application-review.md, Evaluate): a fact read from the packet that alone decides a finding
// (held unsure, the finding's outcome would change) is read a second time, independently, alone, on the pages it cites.
// It stands when that reading confirms its value confidently (the first reading's evidence already verified, so the
// confirmation's own quote needn't). Otherwise the dispute escalates once to a stronger model, reading the whole
// packet: the fact stands, or takes the value the second reading gave, when the escalation confirms it; with no
// agreement it stays conflicting or uncertain, never a silent wrong value. Every dispute is recorded as a correction.

const keyOf = (item: { entity: string; property: string }) => `${item.entity} ${item.property}`
const findingKey = (finding: T.Finding) => `${finding.ruleKey} ${finding.entity}`

/** The fact as a reading below the threshold: its value only a candidate. */
const unsure = (fact: T.Fact): T.Fact => ({
  ...fact,
  state: "uncertain",
  value: null,
  candidates: fact.value ? [fact.value] : []
})

/** The known facts read from the packet that alone decide a finding: held unsure, its outcome would change. */
export function decidingFacts(
  findings: readonly T.Finding[],
  facts: readonly T.Fact[],
  evaluateFacts: (facts: T.Fact[]) => T.Finding[]
): T.Fact[] {
  const outcomes = new Map(findings.map((finding) => [findingKey(finding), finding.outcome]))
  const inputs = new Set(findings.flatMap((finding) => finding.inputs.map(keyOf)))
  const isRead = (fact: T.Fact) =>
    fact.state === "known" && fact.value !== null && fact.provenance.by === "extraction" && inputs.has(keyOf(fact))
  return facts.filter(
    (fact) =>
      isRead(fact) &&
      evaluateFacts(facts.map((other) => (other === fact ? unsure(other) : other))).some((finding) => {
        const outcome = outcomes.get(findingKey(finding))
        return outcome !== undefined && outcome !== finding.outcome
      })
  )
}

/** The focused call for one fact: its entity and property alone. */
export const verificationGroup = (fact: T.Fact): EntityGroup => ({
  id: `${fact.entity}:${fact.property}:verify`,
  entities: [fact.entity],
  properties: [fact.property],
  conditions: []
})

/** The escalation's call for one disputed fact. */
export const escalationGroup = (fact: T.Fact): EntityGroup => ({
  ...verificationGroup(fact),
  id: `${fact.entity}:${fact.property}:escalate`
})

/** The pages a fact's evidence cites; a citation without a page covers its whole file. */
export const citedPages =
  (fact: T.Fact, packet: Packet) =>
  (page: PageRef): boolean =>
    fact.evidence.some(
      (evidence) =>
        citedFile(packet, evidence.fileId)?.id === page.fileId && (evidence.page ?? page.pageIndex) === page.pageIndex
    )

/** Whether two facts are about the same entity and property. */
export const isSameFact = (a: T.Fact, b: T.Fact) => keyOf(a) === keyOf(b)

/** The value a reading names: its value, or the one value it holds unsure; null when it names none or several. */
function valueOf(reading: T.Fact) {
  if (reading.value) {
    return reading.value
  }
  const [candidate, ...others] = reading.candidates
  return candidate !== undefined && others.every((other) => sameValue(other, candidate)) ? candidate : null
}

/** The value a reading gives confidently: known, or held only because its own quote didn't verify. */
const confidentValue = (reading: T.Fact, threshold: number) =>
  reading.state === "known" || (reading.state === "uncertain" && (reading.confidence ?? 0) >= threshold)
    ? valueOf(reading)
    : null

/** Whether one of the readings names this value. */
const names = (readings: readonly T.Fact[], value: T.FactValue, valueIn: (reading: T.Fact) => T.FactValue | null) =>
  readings.some((reading) => {
    const read = valueIn(reading)
    return read !== null && sameValue(read, value)
  })
/** The fact held after readings that didn't confirm it: conflicting when they read another value or none, else uncertain. */
function held(fact: T.Fact, value: T.FactValue, readings: readonly T.Fact[]): T.Fact {
  const others = readings
    .flatMap((reading) => (reading.value ? [reading.value] : reading.candidates))
    .filter(
      (other, index, all) => !sameValue(other, value) && all.findIndex((item) => sameValue(item, other)) === index
    )
  const evidence = [...fact.evidence, ...readings.flatMap((reading) => reading.evidence)]
  return others.length > 0 || readings.some((reading) => reading.state === "absent")
    ? { ...fact, state: "conflicting", value: null, candidates: [value, ...others], evidence }
    : { ...unsure(fact), evidence }
}

/**
 * Whether the second readings confirm the fact, so it needs no escalation: one names the same value, however sure it
 * is of it (the first reading was sure, and its quote verified). A reading of another value, or of none, disputes it.
 */
export function isConfirmed(fact: T.Fact, second: readonly T.Fact[]) {
  return fact.value === null || names(second, fact.value, valueOf)
}

/** One fact's verification: the fact as it stands after its readings, and the dispute's record when there was one. */
export type Settlement = { fact: T.Fact; correction: Correction | null }

/**
 * The fact after its second reading and, when that didn't confirm it, the escalation's (null when the escalation
 * couldn't run). The escalation settles a dispute by confirming, confidently, a value one of the readings gave.
 */
export function settle(
  fact: T.Fact,
  readings: { second: readonly T.Fact[]; escalation: readonly T.Fact[] | null },
  context: { threshold: number; at: T.Timestamp; secondModelId: string | null; escalationModelId: string | null }
): Settlement {
  const { value } = fact
  const { second, escalation } = readings
  if (!value || isConfirmed(fact, second)) {
    return { fact, correction: null }
  }
  const evidenceOf = (items: readonly T.Fact[]) => items.flatMap((item) => item.evidence)
  const settled = (): T.Fact => {
    if (escalation === null) {
      return held(fact, value, second)
    }
    const isSure = (reading: T.Fact) => confidentValue(reading, context.threshold)
    if (names(escalation, value, isSure)) {
      return { ...fact, evidence: [...fact.evidence, ...evidenceOf(escalation)] }
    }
    const agreed = second.map(valueOf).find((read) => read !== null && names(escalation, read, isSure))
    return agreed
      ? {
          ...fact,
          state: "known",
          value: agreed,
          candidates: [],
          stated: null,
          confidence: Math.max(...escalation.map((reading) => reading.confidence ?? 0)),
          evidence: [...evidenceOf(second), ...evidenceOf(escalation)]
        }
      : held(fact, value, [...second, ...escalation])
  }
  const result = settled()
  return {
    fact: result,
    correction: {
      kind: escalation === null ? "second-reading-disagrees" : "escalated",
      entity: fact.entity,
      property: fact.property,
      stated: fact.stated,
      problems: [],
      readings: [
        readingOf(fact, "model", null),
        ...second.map((reading) => readingOf(reading, "second-reading", context.secondModelId)),
        ...(escalation ?? []).map((reading) => readingOf(reading, "escalation", context.escalationModelId))
      ],
      result: { state: result.state, value: result.value },
      at: context.at
    }
  }
}
