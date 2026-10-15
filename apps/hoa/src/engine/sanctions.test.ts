import { describe, expect, it } from "vitest"
import * as ex from "@/schema/examples.test-data"
import type * as T from "@/schema/types"
import { date, entity, examples, exampleRequest, fact, quantity } from "@/tests/engineContext"
import { sampleDeclarationRulesFile } from "@/tests/sampleRulesFile"
import { evaluateSanctions } from "./sanctions"

// The schema's enforcement examples: the Rules' fine schedule ($100, then $200 within 12 months, $25 a day while it
// continues, up to $1,000) under a $500 statutory cap, after notice, the 10-day default cure and a hearing if asked;
// self-help for landscaping with its own 15-day cure; and a late fee 15 days after an assessment's due date.

const vehicleStorage = ex.eitherApproval.key
const fines = ex.fineSchedule.key

const absent = (property: string) => fact("request", property, null, "absent")

function violation(evaluationDate: string, ...facts: T.Fact[]) {
  const stated = new Set(facts.map((stated) => stated.property))
  const silent = [
    "violation.notice-delivered-on",
    "violation.cured-on",
    "violation.hearing-requested-on",
    "violation.hearing-held-on"
  ]
    .filter((property) => !stated.has(property))
    .map(absent)
  return exampleRequest({
    type: "violation",
    organizationId: "org-sample",
    governingDate: "2026-03-01",
    evaluationDate,
    entities: [entity("request", "violation"), entity("lot", "lot"), entity("community", "community")],
    facts: [fact("request", "violation.observed-on", date("2026-03-01")), ...silent, ...facts]
  })
}

const noticed = fact("request", "violation.notice-delivered-on", date("2026-03-02"))

const sanctionsOf = (request: T.EvaluationRequest, broken = [vehicleStorage], occurrence: number | null = 1) =>
  evaluateSanctions({ rulesFile: examples, request, broken, occurrenceOf: () => occurrence })

const fineOf = (request: T.EvaluationRequest, occurrence: number | null = 1) => {
  const found = sanctionsOf(request, [vehicleStorage], occurrence).sanctions.find((result) => result.ruleKey === fines)
  if (!found) {
    throw new Error("the fine schedule doesn't enforce vehicle storage")
  }
  return found
}

describe("a fine for storing a vehicle outside a garage without approval", () => {
  it("waits for the notice that starts the time to cure", () => {
    const { cures } = sanctionsOf(violation("2026-03-05"))
    expect(cures[0]).toMatchObject({ status: "not-started" })
    expect(fineOf(violation("2026-03-05"))).toMatchObject({ outcome: "pending", availableOn: null })
  })

  it("is pending through the default 10 days to cure after notice", () => {
    const { cures } = sanctionsOf(violation("2026-03-05", noticed))
    expect(cures[0]).toMatchObject({ status: "running", startsOn: "2026-03-02", endsOn: "2026-03-12" })
    expect(fineOf(violation("2026-03-05", noticed))).toMatchObject({ outcome: "pending", availableOn: "2026-03-13" })
  })

  it("is available once the time to cure has passed, adding $25 a day from its end", () => {
    const fine = fineOf(violation("2026-03-20", noticed))
    expect(fine).toMatchObject({ outcome: "available", modality: "permission", against: ["owner"] })
    expect(fine.amount).toEqual({
      type: "fixed",
      each: 10_000,
      repeats: { every: { value: 1, unit: "calendar-day" }, each: 2500, periods: 8 },
      total: 30_000,
      cappedBy: null
    })
  })

  it("charges the second amount for a second violation", () => {
    expect(fineOf(violation("2026-03-13", noticed), 2).amount).toMatchObject({ each: 20_000, total: 22_500 })
  })

  it("stops at the $500 the statute allows, below its own $1,000 cap", () => {
    expect(fineOf(violation("2026-05-30", noticed)).amount).toMatchObject({
      total: 50_000,
      cappedBy: ex.fineLimit.key
    })
    expect(fineOf(violation("2026-05-30", noticed)).limitedBy).toEqual([ex.fineLimit.key])
  })

  it("can't be imposed once cured within the time to cure", () => {
    const cured = fact("request", "violation.cured-on", date("2026-03-10"))
    expect(sanctionsOf(violation("2026-03-20", noticed, cured)).cures[0]).toMatchObject({ status: "cured" })
    expect(fineOf(violation("2026-03-20", noticed, cured)).outcome).toBe("not-applicable")
  })

  it("stops adding daily amounts on the day a late cure happens", () => {
    const cured = fact("request", "violation.cured-on", date("2026-03-15"))
    expect(fineOf(violation("2026-03-20", noticed, cured)).amount).toMatchObject({ total: 17_500 })
  })

  it("waits for a hearing the owner asked for", () => {
    const asked = fact("request", "violation.hearing-requested-on", date("2026-03-04"))
    const fine = fineOf(violation("2026-03-20", noticed, asked))
    expect(fine.outcome).toBe("pending")
    expect(fine.reason).toMatch(/^First: /)
    const held = fact("request", "violation.hearing-held-on", date("2026-03-18"))
    expect(fineOf(violation("2026-03-20", noticed, asked, held)).outcome).toBe("available")
  })

  it("needs the notice date when it isn't known whether notice was given", () => {
    const unstated = violation("2026-03-20")
    const request = {
      ...unstated,
      facts: unstated.facts.filter((stated) => stated.property !== "violation.notice-delivered-on")
    }
    expect(fineOf(request)).toMatchObject({ outcome: "missing-information", needs: ["notice delivered on"] })
  })

  it("can't say the amount without knowing which occurrence it is", () => {
    expect(fineOf(violation("2026-03-20", noticed), null).amount).toEqual({
      type: "unknown",
      needs: ["occurrence"]
    })
  })
})

describe("self-help for unkempt landscaping", () => {
  const landscaping = ex.maintainLandscaping.key
  const selfHelp = (request: T.EvaluationRequest) =>
    sanctionsOf(request, [landscaping]).sanctions.find((result) => result.ruleKey === ex.selfHelp.key)

  it("uses the rule's own 15 days to cure, not the default", () => {
    const { cures } = sanctionsOf(violation("2026-03-05", noticed), [landscaping])
    expect(cures[0]).toMatchObject({ status: "running", endsOn: "2026-03-17" })
  })

  it("needs no hearing, and charges the cost of the work once it's known", () => {
    const asked = fact("request", "violation.hearing-requested-on", date("2026-03-04"))
    expect(selfHelp(violation("2026-03-20", noticed, asked))).toMatchObject({
      outcome: "available",
      amount: { type: "unknown", needs: ["cost of the work"] }
    })
    const cost = fact("request", "violation.cost-of-work", quantity(480, "usd"))
    expect(selfHelp(violation("2026-03-20", noticed, cost))?.amount).toMatchObject({ type: "fixed", total: 48_000 })
  })
})

describe("a late fee on an unpaid assessment", () => {
  const assessment = (evaluationDate: string, ...facts: T.Fact[]) =>
    exampleRequest({
      type: "assessment",
      governingDate: "2026-01-01",
      evaluationDate,
      entities: [entity("request", "assessment"), entity("lot", "lot"), entity("community", "community")],
      facts: [
        fact("request", "assessment.due-on", date("2026-01-01")),
        fact("request", "assessment.unpaid-balance", quantity(300, "usd")),
        ...facts
      ]
    })
  const lateFee = (request: T.EvaluationRequest) =>
    evaluateSanctions({ rulesFile: examples, request, broken: [ex.assessmentDue.key] }).sanctions.find(
      (result) => result.ruleKey === ex.lateFee.key
    )
  const unpaid = fact("request", "assessment.paid-on", null, "absent")

  it("is pending for the 15 days the rule allows", () => {
    expect(lateFee(assessment("2026-01-10", unpaid))).toMatchObject({ outcome: "pending", availableOn: "2026-01-17" })
  })

  it("is the greater of $25 and 10 percent of what's unpaid once they pass", () => {
    expect(lateFee(assessment("2026-01-20", unpaid))).toMatchObject({
      outcome: "available",
      modality: "obligation",
      amount: { type: "fixed", each: 3000, total: 3000 }
    })
  })

  it("isn't charged when paid within the 15 days", () => {
    const paid = fact("request", "assessment.paid-on", date("2026-01-12"))
    expect(lateFee(assessment("2026-01-20", paid))?.outcome).toBe("not-applicable")
  })
})

describe("the sample declaration's enforcement", () => {
  const rulesFile = sampleDeclarationRulesFile()
  const occupancy = "declaration:3.1(a)(v)#notify-board"
  const fineFor = (request: T.EvaluationRequest) =>
    evaluateSanctions({ rulesFile, request, broken: [occupancy], occurrenceOf: () => 1 }).sanctions.find(
      (result) => result.ruleKey === "declaration:7.4(a)(i)#fine"
    )

  it("leaves the fine's amount to the board, once notice is delivered", () => {
    expect(fineFor(violation("2026-04-20"))).toMatchObject({ outcome: "pending" })
    expect(fineFor(violation("2026-04-20", noticed))).toMatchObject({
      outcome: "available",
      imposedBy: "board",
      amount: { type: "set-by-imposer", maxEach: null, maxTotal: null }
    })
  })

  it("reaches the occupant who did it, and the owner who answers for them", () => {
    expect(fineFor(violation("2026-04-20", noticed))?.against).toEqual(
      expect.arrayContaining(["owner", "occupant", "tenant", "guest"])
    )
  })
})
