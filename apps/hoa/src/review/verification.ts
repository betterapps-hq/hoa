import type * as T from "@/schema/types"
import type { EntityGroup } from "./factPlan"
import { sameValue } from "./normalize"
import { citedFile, type Packet, type PageRef } from "./packet"

// The verification pass (implementation-plan.md, E2.4): a fact read from the packet that alone decides a not-met
// finding (held unsure, the finding would no longer be not met) is read again, alone, on the pages it cites. It stands
// only when that reading confirms its value confidently (the first reading's evidence already verified, so the
// confirmation's own quote needn't); a reading of another value leaves it conflicting, and anything else uncertain.

const keyOf = (item: { entity: string; property: string }) => `${item.entity} ${item.property}`
const findingKey = (finding: T.Finding) => `${finding.ruleKey} ${finding.entity}`

/** The fact as a reading below the threshold: its value only a candidate. */
const unsure = (fact: T.Fact): T.Fact => ({
  ...fact,
  state: "uncertain",
  value: null,
  candidates: fact.value ? [fact.value] : []
})

/** The known facts read from the packet that alone decide a not-met finding. */
export function decidingFacts(
  findings: readonly T.Finding[],
  facts: readonly T.Fact[],
  evaluateFacts: (facts: T.Fact[]) => T.Finding[]
): T.Fact[] {
  const notMet = findings.filter((finding) => finding.outcome === "not-met")
  const notMetKeys = new Set(notMet.map(findingKey))
  const inputs = new Set(notMet.flatMap((finding) => finding.inputs.map(keyOf)))
  const isRead = (fact: T.Fact) =>
    fact.state === "known" && fact.value !== null && fact.provenance.by === "extraction" && inputs.has(keyOf(fact))
  return facts.filter(
    (fact) =>
      isRead(fact) &&
      evaluateFacts(facts.map((other) => (other === fact ? unsure(other) : other))).some(
        (finding) => notMetKeys.has(findingKey(finding)) && finding.outcome !== "not-met"
      )
  )
}

/** The focused call for one fact: its entity and property alone. */
export const verificationGroup = (fact: T.Fact): EntityGroup => ({
  id: `${fact.entity}:${fact.property}:verify`,
  entities: [fact.entity],
  properties: [fact.property],
  conditions: []
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

/** The fact after its verification readings, normalized. */
export function verified(fact: T.Fact, readings: readonly T.Fact[], threshold: number): T.Fact {
  const { value } = fact
  if (!value) {
    return fact
  }
  const confirms = (reading: T.Fact) =>
    reading.state === "known"
      ? reading.value !== null && sameValue(reading.value, value)
      : reading.state === "uncertain" &&
        (reading.confidence ?? 0) >= threshold &&
        reading.candidates.length > 0 &&
        reading.candidates.every((candidate) => sameValue(candidate, value))
  if (readings.some(confirms)) {
    return fact
  }
  const others = readings
    .flatMap((reading) => (reading.value ? [reading.value] : reading.candidates))
    .filter((other) => !sameValue(other, value))
  const evidence = [...fact.evidence, ...readings.flatMap((reading) => reading.evidence)]
  return others.length > 0 || readings.some((reading) => reading.state === "absent")
    ? { ...fact, state: "conflicting", value: null, candidates: [value, ...others], evidence }
    : { ...unsure(fact), evidence }
}
