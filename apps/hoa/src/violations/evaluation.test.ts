import { describe, expect, it } from "vitest"
import * as ex from "@/schema/examples.test-data"
import { examples } from "@/tests/engineContext"
import {
  countsFrom,
  evaluateViolation,
  type PriorViolation,
  stepsToMeet,
  type ViolationCase,
  violationRequest
} from "./evaluation"
import { statedFacts, type ViolationEvent } from "./violation"

// The examples' fine schedule counts violations of the same rule by the same owner within 12 months, leaving out those
// cured in time: $100 for a first, $200 after.

const vehicleStorage = ex.eitherApproval.key

const event = (kind: ViolationEvent["kind"], occurredOn: string, details: unknown = null): ViolationEvent => ({
  id: `${kind}-${occurredOn}`,
  violationId: "violation-2",
  kind,
  occurredOn,
  note: null,
  details,
  recordedBy: "user-sam",
  createdAt: `${occurredOn}T12:00:00.000Z`
})

const current: ViolationCase = {
  violation: { id: "violation-2", unitId: "unit-12", observedOn: "2026-03-01" },
  ruleKeys: [vehicleStorage],
  people: [{ personId: "person-pat", party: "owner" }],
  events: [event("reported", "2026-03-01"), event("notice", "2026-03-02", { delivery: "email", to: ["Pat"] })]
}

const prior = (overrides: Partial<PriorViolation> = {}): PriorViolation => ({
  id: "violation-1",
  unitId: "unit-12",
  observedOn: "2025-09-15",
  status: "closed",
  ruleKeys: [vehicleStorage],
  ownerIds: ["person-pat"],
  curedInTime: false,
  ...overrides
})

const fineOf = (priors: PriorViolation[]) =>
  evaluateViolation(examples, current, priors, "2026-03-13").sanctions.find(
    (result) => result.ruleKey === ex.fineSchedule.key
  )

describe("which occurrence a violation is", () => {
  it("is a first without earlier violations", () => {
    expect(fineOf([])).toMatchObject({ outcome: "available", occurrence: 1, amount: { each: 10_000 } })
  })

  it("is a second after the same owner broke the same rule within 12 months", () => {
    expect(fineOf([prior()])).toMatchObject({ occurrence: 2, amount: { each: 20_000 } })
  })

  it("leaves out violations cured in time, dismissed, older than 12 months, by another owner or of another rule", () => {
    const leftOut = [
      prior({ curedInTime: true }),
      prior({ status: "dismissed" }),
      prior({ observedOn: "2025-02-28" }),
      prior({ ownerIds: ["person-casey"], unitId: "unit-14" }),
      prior({ ruleKeys: [ex.trashContainers.key] })
    ]
    expect(fineOf(leftOut)?.occurrence).toBe(1)
  })
})

describe("the request the engine reads", () => {
  it("states every step that hasn't happened as absent, so the engine knows it didn't", () => {
    const request = violationRequest("org-sample", current, "2026-03-13")
    const states = Object.fromEntries(request.facts.map((fact) => [fact.property, fact.state]))
    expect(states).toEqual({
      "violation.observed-on": "known",
      "violation.notice-delivered-on": "known",
      "violation.hearing-requested-on": "absent",
      "violation.hearing-held-on": "absent",
      "violation.cured-on": "absent"
    })
  })

  it("counts earlier violations from the same day months or days before", () => {
    expect(countsFrom("2026-03-31", { value: 1, unit: "month" })).toBe("2026-02-28")
    expect(countsFrom("2026-03-01", { value: 12, unit: "month" })).toBe("2025-03-01")
    expect(countsFrom("2026-03-01", { value: 2, unit: "week" })).toBe("2026-02-15")
    expect(countsFrom("2026-03-01", { value: 1, unit: "business-day" })).toBeNull()
  })
})

describe("the board's steps a procedure needs", () => {
  const [precondition] = examples.settings.clauses.sanctionPreconditions
  const needs = (events: readonly ViolationEvent[], condition = precondition?.condition) =>
    condition ? stepsToMeet(examples, { ...current, events }, "2026-03-13", condition) : undefined

  it("asks for the notice first, then the hearing once one is asked for", () => {
    expect(needs([event("reported", "2026-03-01")])).toEqual(["notice"])
    expect(needs([...current.events, event("hearing-requested", "2026-03-05", { personId: null })])).toEqual([
      "hearing"
    ])
    expect(needs(current.events)).toEqual([])
  })

  it("can't be met by steps when it turns on something else", () => {
    expect(needs(current.events, { type: "exists", from: "request", path: ["violation.cost-of-work"] })).toBeNull()
  })
})

describe("facts the board states", () => {
  const cost = (value: number | null, occurredOn: string) =>
    event("fact", occurredOn, {
      property: "violation.cost-of-work",
      value: value === null ? null : { type: "quantity", value, unit: "usd" }
    })

  it("keeps the latest answer for each, and drops one taken back", () => {
    expect(statedFacts([cost(480, "2026-03-05"), cost(500, "2026-03-06")]).get("violation.cost-of-work")).toEqual({
      type: "quantity",
      value: 500,
      unit: "usd"
    })
    expect(statedFacts([cost(480, "2026-03-05"), cost(null, "2026-03-06")]).size).toBe(0)
  })

  it("gives the engine what it asked for, and never a step's date in place of the history", () => {
    const landscaping: ViolationCase = { ...current, ruleKeys: [ex.maintainLandscaping.key] }
    const selfHelpOf = (events: readonly ViolationEvent[]) =>
      evaluateViolation(examples, { ...landscaping, events }, [], "2026-03-20")
    const before = selfHelpOf(current.events)
    expect(before.reads).toContainEqual({ entity: "request", property: "violation.cost-of-work", state: "unknown" })
    const after = selfHelpOf([...current.events, cost(480, "2026-03-05")])
    expect(after.sanctions.find((sanction) => sanction.ruleKey === ex.selfHelp.key)?.amount).toMatchObject({
      type: "fixed",
      total: 48_000
    })
    const stated = event("fact", "2026-03-05", {
      property: "violation.hearing-held-on",
      value: { type: "date", value: "2026-03-05" }
    })
    const request = violationRequest("org-sample", { ...current, events: [...current.events, stated] }, "2026-03-13")
    expect(request.facts.filter((fact) => fact.property === "violation.hearing-held-on")).toMatchObject([
      { state: "absent" }
    ])
  })
})
