import { describe, expect, it } from "vitest"
import type { Finding, Outcome } from "@/schema/types"
import { validateRulebook } from "@/schema/validate"
import { fenceAnswers, fenceRequest, fenceRulesFile, runs } from "@/tests/fenceSchemaFixture"
import { type ActionGroup, decide } from "./decide"
import { evaluate } from "./evaluate"

// The expected result for the sample application (application-review.md), from the fence fixture. Where a row of the
// spec's table can't come out of the rules as encoded, the comment says why and which reading this test keeps.

const rulesFile = fenceRulesFile()
const request = fenceRequest()
const findings = evaluate({ rulesFile, request, answers: fenceAnswers(), evaluatedAt: "2026-09-10T12:00:00Z" })
const decision = decide(findings, rulesFile, request.type)

const everyRun = (outcome: Outcome) => Object.fromEntries(runs.map((run) => [run, outcome]))
const notApplicable = everyRun("not-applicable")

const expected: Record<string, Record<string, Outcome>> = {
  "guidelines:5.3#materials": everyRun("met"),
  // The table says met. Vinyl is the schema's example of a prohibition of the subject itself, which has no check and
  // doesn't apply to a composite run.
  "guidelines:5.3#no-vinyl": notApplicable,
  "guidelines:5.3#open-metal": notApplicable,
  "guidelines:5.2.5#no-horizontal": everyRun("not-met"),
  // The table says committee while the style isn't stated. Unknown is missing information for anything but a
  // judgment; the case-by-case clause decides only a style that fails, which then goes to the committee rather than
  // being advisory.
  "guidelines:5.2.2#k-style": everyRun("missing-information"),
  "guidelines:5.4.1(i)#stained": notApplicable,
  "guidelines:5.4.2(iii)#gate-material": { "gate-1": "met" },
  // The table says committee for the post color, the gate's color and height and the return run's setback, none of
  // them stated. Each is a test of a stated value, so each is missing information.
  "guidelines:5.4.2(iv)#posts": everyRun("missing-information"),
  "guidelines:5.5.1(i)#min-height": everyRun("missing-information"),
  "guidelines:5.5.1(ii)#lattice-height": notApplicable,
  "guidelines:5.5.1(iii)#arbor-total": notApplicable,
  "guidelines:5.7.1#golf-course": notApplicable,
  "guidelines:5.9.1#gate-boards": { "gate-1": "not-met" },
  "guidelines:5.9.2#gate-height": { "gate-1": "missing-information" },
  "guidelines:5.9.2#gate-height-arbor": { "gate-1": "not-applicable" },
  "guidelines:5.9.5#no-common-area-gates": { "gate-1": "not-applicable" },
  "guidelines:5.4.2(i)#colors": everyRun("not-met"),
  "guidelines:5.3.2#manufacturers": everyRun("met"),
  "guidelines:5.5.1(i)#max-height": everyRun("missing-information"),
  "guidelines:5.5.1(ii)#fence-and-lattice": notApplicable,
  "guidelines:5.5.2#metal-height": notApplicable,
  "guidelines:5.6.2(ii)#setback": { ...notApplicable, "run-4": "missing-information" },
  "guidelines:5.6.1(i)#neighbor-approval": {
    "run-1": "missing-information",
    "run-2": "missing-information",
    "run-3": "not-applicable",
    "run-4": "not-applicable"
  },
  "guidelines:5.6.2(i)#sight-lines": notApplicable,
  "guidelines:5.4.2(iii)#gate-color": { "gate-1": "missing-information" },
  "guidelines:3.1.5#application-form": { request: "met" },
  "guidelines:3.1.5#owner-signatures": { request: "missing-information" },
  "guidelines:3.1.5#project-description": { request: "met" },
  "guidelines:3.1.5#plot-plan": { request: "met" },
  "guidelines:3.1.5#product-specification": { request: "met" },
  "guidelines:3.1.5#checklist": { request: "missing-information" },
  "guidelines:3.4.2#photos": { request: "met" },
  "declaration:4.1/p1#approval-required": { "work-1": "committee" },
  "declaration:4.2(d)#fee-before-review": { request: "missing-information" },
  "declaration:4.3(b)#plans": { request: "met" },
  "declaration:4.3(b)#additional-information": { request: "not-applicable" },
  "declaration:4.3(b)/p2#harmony": { "work-1": "committee" },
  // Not in the table: the committee's own duties, which never count against the applicant.
  "declaration:4.2(d)#reasonable-fees": { request: "committee" },
  "declaration:4.3(b)/p3#written-response": { request: "pending" },
  "declaration:4.3(b)/p6#notify-declarant": { request: "missing-information" },
  "declaration:4.3(b)/p6#veto-window": { request: "not-applicable" },
  "declaration:4.5#declarant-consent": { "work-1": "not-applicable" },
  "declaration:4.5#board-consent": { "work-1": "not-applicable" }
}

const byRule = (all: Finding[]) => {
  const outcomes: Record<string, Record<string, Outcome>> = {}
  for (const finding of all) {
    outcomes[finding.ruleKey] = { ...outcomes[finding.ruleKey], [finding.entity]: finding.outcome }
  }
  return outcomes
}

const finding = (ruleKey: string, entity: string) =>
  findings.find((found) => found.ruleKey === ruleKey && found.entity === entity)

const groups = (items: ActionGroup[]) =>
  items.map(({ ruleKey, entities }) => ({ ruleKey, entities })).toSorted((a, b) => a.ruleKey.localeCompare(b.ruleKey))

describe("the fence fixture", () => {
  it("validates with rulesFile and validateRulebook", () => {
    expect(validateRulebook(rulesFile)).toEqual([])
  })
})

describe("the sample application's expected result", () => {
  it("gives every outcome per rule and entity", () => {
    expect(byRule(findings)).toEqual(expected)
  })

  it("explains the outcomes that need the applicant", () => {
    expect(finding("guidelines:5.4.2(i)#colors", "run-1")).toMatchObject({
      remedy: "change-detail",
      inputs: [
        { entity: "run-1", property: "fence-run.material", state: "known" },
        { entity: "run-1", property: "fence-run.manufacturer", state: "known" },
        { entity: "run-1", property: "fence-run.color", state: "known" }
      ]
    })
    expect(finding("guidelines:5.6.1(i)#neighbor-approval", "run-1")).toMatchObject({
      remedy: "provide-document",
      reason: "Needs neighbor approval form."
    })
    expect(finding("guidelines:3.1.5#owner-signatures", "request")).toMatchObject({
      remedy: "provide-document",
      reason: "Needs a signature from the Owner."
    })
    expect(finding("guidelines:5.5.1(i)#max-height", "run-4")).toMatchObject({
      remedy: "provide-information",
      reason: "Needs height."
    })
    expect(finding("declaration:4.3(b)/p2#harmony", "work-1")?.judgment).toMatchObject({ answer: "unclear" })
    expect(finding("declaration:4.3(b)#plans", "request")?.statements).toHaveLength(9)
  })

  it("recommends requesting information", () => {
    expect(decision.recommendation).toBe("request-information")
  })

  it("lists what to change, grouped by rule with the entities they cover", () => {
    expect(groups(decision.changes)).toEqual([
      { ruleKey: "guidelines:5.2.5#no-horizontal", entities: runs },
      { ruleKey: "guidelines:5.4.2(i)#colors", entities: runs },
      { ruleKey: "guidelines:5.9.1#gate-boards", entities: ["gate-1"] }
    ])
  })

  it("lists what to provide, including the facts the table had sent to the committee", () => {
    expect(groups(decision.missingInformation)).toEqual([
      { ruleKey: "declaration:4.2(d)#fee-before-review", entities: ["request"] },
      { ruleKey: "guidelines:3.1.5#checklist", entities: ["request"] },
      { ruleKey: "guidelines:3.1.5#owner-signatures", entities: ["request"] },
      { ruleKey: "guidelines:5.2.2#k-style", entities: runs },
      { ruleKey: "guidelines:5.4.2(iii)#gate-color", entities: ["gate-1"] },
      { ruleKey: "guidelines:5.4.2(iv)#posts", entities: runs },
      { ruleKey: "guidelines:5.5.1(i)#max-height", entities: runs },
      { ruleKey: "guidelines:5.5.1(i)#min-height", entities: runs },
      { ruleKey: "guidelines:5.6.1(i)#neighbor-approval", entities: ["run-1", "run-2"] },
      { ruleKey: "guidelines:5.6.2(ii)#setback", entities: ["run-4"] },
      { ruleKey: "guidelines:5.9.2#gate-height", entities: ["gate-1"] }
    ])
  })

  it("leaves harmony to the committee, and shows the prior-approval rule without counting it", () => {
    expect(groups(decision.committeeDecisions)).toEqual([
      { ruleKey: "declaration:4.3(b)/p2#harmony", entities: ["work-1"] }
    ])
    expect(decision.suggestions).toEqual([])
  })
})
