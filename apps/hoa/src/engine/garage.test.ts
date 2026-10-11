import { describe, expect, it } from "vitest"
import type { EvaluationRequest, Fact, FactValue, Finding, Outcome, RulesFile } from "@/schema/types"
import { confirmedReview } from "@/tests/fenceSchemaFixture"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import type { Answers } from "./context"
import { type ActionGroup, decide } from "./decide"
import { evaluate } from "./evaluate"

// The expected result for a garage enclosure (application-review.md): the committed sample's Use Restrictions
// (a)(vii) and Declaration Article 4 rules, and the facts of the synthetic packet: an application to convert the
// attached two-car garage into a family room, with a floor plan and an exterior elevation, no plans for a replacement
// garage, and the review fee paid.

function garageRules(): RulesFile {
  const sample = sampleRulesFile()
  const rules = sample.rules.filter(
    (rule) => rule.key.startsWith("use-restrictions:a(vii)#") || rule.key.startsWith("declaration:4.")
  )
  return { ...sample, rules }
}

const system = { by: "system" as const, at: "2026-10-01T00:00:00Z" }
const fact = (entity: string, property: string, value: FactValue): Fact => ({
  entity,
  property,
  state: "known",
  value,
  candidates: [],
  complete: null,
  stated: null,
  evidence: [],
  confidence: 0.95,
  provenance: system
})
const term = (key: string): FactValue => ({ type: "value", term: key, text: key })

type Packet = { space: string; kind: string; isFeePaid: boolean; hasReplacementPlans: boolean }

const baseline: Packet = {
  space: "unfinished-space.garage",
  kind: "work-kind.garage-enclosure",
  isFeePaid: true,
  hasReplacementPlans: false
}

function garageRequest(packet: Packet): EvaluationRequest {
  return {
    organizationId: "org-sample",
    type: "architectural-application",
    governingDate: "2026-10-01",
    evaluationDate: "2026-10-02",
    lot: "lot",
    entities: [
      { id: "request", type: "architectural-application", label: "Garage enclosure application", ref: null },
      { id: "lot", type: "lot", label: "The applicant's Unit", ref: null },
      { id: "community", type: "community", label: "The community", ref: null },
      { id: "work-1", type: "work", label: "Convert the garage into a family room", ref: null },
      { id: "space-1", type: "space-conversion", label: "The attached two-car garage", ref: null }
    ],
    facts: [
      fact("request", "architectural-application.submitted-on", { type: "date", value: "2026-10-01" }),
      fact("request", "architectural-application.review-fee", { type: "quantity", value: 50, unit: "usd" }),
      ...(packet.isFeePaid
        ? [fact("request", "architectural-application.review-fee-paid-on", { type: "date", value: "2026-09-30" })]
        : []),
      fact("work-1", "work.kind", term(packet.kind)),
      fact("work-1", "work.performed-by", term("owner")),
      fact("space-1", "space-conversion.space", term(packet.space))
    ],
    documents: [
      { id: "file-floor-plan", type: "plans", subjects: ["work-1", "space-1"], signedBy: [] },
      { id: "file-elevation", type: "plans", subjects: ["work-1", "space-1"], signedBy: [] }
    ]
  }
}

function garageAnswers(packet: Packet): Answers {
  return {
    documentReviews: [
      confirmedReview(rulesFile, "declaration:4.3(b)#plans", "request"),
      {
        ruleKey: "use-restrictions:a(vii)#replacement-garage-plans",
        entity: "space-1",
        statements: [
          {
            statement: "a replacement garage on the Unit",
            confirmed: packet.hasReplacementPlans ? true : null,
            quote: null
          }
        ]
      }
    ],
    judgments: [
      {
        ruleKey: "declaration:4.3(b)/p2#harmony",
        entity: "work-1",
        answer: "unclear",
        confidence: 0.5,
        rationale: "An elevation alone doesn't show the surrounding homes.",
        evidence: []
      }
    ],
    conditionAnswers: []
  }
}

const rulesFile = garageRules()

function review(changes: Partial<Packet> = {}) {
  const packet = { ...baseline, ...changes }
  const request = garageRequest(packet)
  const findings = evaluate({ rulesFile, request, answers: garageAnswers(packet), evaluatedAt: "2026-10-02T12:00:00Z" })
  return { findings, decision: decide(findings, rulesFile, request.type) }
}

const outcomes = (findings: Finding[]) =>
  Object.fromEntries(findings.map((finding) => [`${finding.ruleKey} ${finding.entity}`, finding.outcome]))

const ruleKeys = (groups: ActionGroup[]) => groups.map((group) => group.ruleKey)

const expected: Record<string, Outcome> = {
  "use-restrictions:a(vii)#replacement-garage-plans space-1": "missing-information",
  "use-restrictions:a(vii)#reviewer-garage-enclosure space-1": "committee",
  "use-restrictions:a(vii)#no-conversion space-1": "not-applicable",
  "declaration:4.1/p1#approval-required work-1": "committee",
  "declaration:4.3(b)#plans request": "met",
  "declaration:4.3(b)#additional-information request": "not-applicable",
  "declaration:4.3(b)/p2#harmony work-1": "committee",
  "declaration:4.2(d)#fee-before-review request": "met",
  "declaration:4.3(b)/p3#written-response request": "pending",
  // Not in the table: the Declarant's notice and veto, and variance consents, none of which this packet reaches.
  "declaration:4.3(b)/p6#notify-declarant request": "missing-information",
  "declaration:4.3(b)/p6#veto-window request": "not-applicable",
  "declaration:4.5#declarant-consent work-1": "not-applicable",
  "declaration:4.5#board-consent work-1": "not-applicable"
}

describe("the garage enclosure's expected result", () => {
  const { findings, decision } = review()

  it("gives every outcome per rule and entity", () => {
    expect(outcomes(findings)).toEqual(expected)
  })

  it("asks for plans for a replacement garage as a document", () => {
    const finding = findings.find((found) => found.ruleKey === "use-restrictions:a(vii)#replacement-garage-plans")
    expect(finding).toMatchObject({
      remedy: "provide-document",
      statements: [{ statement: "a replacement garage on the Unit", confirmed: null, quote: null }]
    })
  })

  it("governs the enclosure by the Reviewer rule instead of the Board's prohibition", () => {
    const finding = findings.find((found) => found.ruleKey === "use-restrictions:a(vii)#no-conversion")
    expect(finding?.modifiedBy).toEqual([
      { ruleKey: "use-restrictions:a(vii)#reviewer-garage-enclosure", effect: "displaced" }
    ])
  })

  it("recommends requesting the replacement garage plans, with harmony for the committee", () => {
    expect(decision.recommendation).toBe("request-information")
    expect(ruleKeys(decision.missingInformation)).toEqual(["use-restrictions:a(vii)#replacement-garage-plans"])
    expect(ruleKeys(decision.committeeDecisions)).toEqual(["declaration:4.3(b)/p2#harmony"])
    expect(decision.changes).toEqual([])
  })
})

describe("the garage enclosure's variants", () => {
  it("refers to the committee for harmony once the replacement garage plans are in", () => {
    const { findings, decision } = review({ hasReplacementPlans: true })
    expect(outcomes(findings)["use-restrictions:a(vii)#replacement-garage-plans space-1"]).toBe("met")
    expect(decision.recommendation).toBe("refer-to-committee")
    expect(ruleKeys(decision.committeeDecisions)).toEqual(["declaration:4.3(b)/p2#harmony"])
  })

  it("counts the Board's authorization for converting an attic, and refers to the committee", () => {
    // An attic conversion remodels the interior, which needs no Article 4 approval; Exhibit C still needs the Board.
    const { findings, decision } = review({ space: "unfinished-space.attic", kind: "work-kind.interior" })
    expect(outcomes(findings)).toMatchObject({
      "use-restrictions:a(vii)#no-conversion space-1": "committee",
      "use-restrictions:a(vii)#reviewer-garage-enclosure space-1": "not-applicable",
      "use-restrictions:a(vii)#replacement-garage-plans space-1": "not-applicable",
      "declaration:4.1/p1#approval-required work-1": "exempt"
    })
    expect(decision.recommendation).toBe("refer-to-committee")
    expect(ruleKeys(decision.committeeDecisions)).toEqual([
      "use-restrictions:a(vii)#no-conversion",
      "declaration:4.3(b)/p2#harmony"
    ])
  })

  it("requests information when the packet doesn't show the fee paid", () => {
    const { findings, decision } = review({ isFeePaid: false })
    expect(outcomes(findings)["declaration:4.2(d)#fee-before-review request"]).toBe("missing-information")
    expect(decision.recommendation).toBe("request-information")
    expect(ruleKeys(decision.missingInformation)).toEqual([
      "use-restrictions:a(vii)#replacement-garage-plans",
      "declaration:4.2(d)#fee-before-review"
    ])
  })
})
