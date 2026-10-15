import { describe, expect, it } from "vitest"
import { storedRule } from "@/schema/exampleRulebook.test-data"
import * as ex from "@/schema/examples.test-data"
import type { EvaluationRequest, Finding, RulesFile } from "@/schema/types"
import type { RuleDraft } from "@/schema/zod"
import { date, entity, exampleRequest, examples, fact, quantity, reference, term } from "@/tests/engineContext"
import type { Answers } from "./context"
import { evaluate } from "./evaluate"

const evaluatedAt = "2026-02-03T15:01:00Z"

function findings(
  extra: EvaluationRequest["entities"],
  facts: EvaluationRequest["facts"],
  parts: Partial<EvaluationRequest> = {},
  answers: Partial<Answers> = {},
  rulesFile: RulesFile = examples
) {
  const request = exampleRequest(parts)
  return evaluate({
    rulesFile,
    request: { ...request, entities: [...request.entities, ...extra], facts },
    answers,
    evaluatedAt
  })
}

const of = (all: Finding[], ruleKey: string, entityId: string) =>
  all.find((finding) => finding.ruleKey === ruleKey && finding.entity === entityId)

const composite = fact("run-1", "fence-run.material", term("fence-material.composite"))
const run = (id = "run-1") => entity(id, "fence-run")

describe("evaluating a request (schema.md, Evaluating a request)", () => {
  it("gives the schema's example findings", () => {
    const all = evaluate({ rulesFile: examples, request: { organizationId: "org-sample", ...ex.request }, evaluatedAt })
    for (const expected of ex.findings) {
      expect(of(all, expected.ruleKey, expected.entity)).toEqual({ ...expected, reason: expect.any(String) })
    }
  })

  it("isn't met, with the rule's remedy, when a stated fact fails the check", () => {
    const facts = [
      composite,
      fact("run-1", "fence-run.boundary-with", term("boundary.lot")),
      fact("run-1", "fence-run.height", quantity(80))
    ]
    expect(of(findings([run()], facts), ex.maxHeight.key, "run-1")).toMatchObject({
      outcome: "not-met",
      remedy: "change-detail",
      reason: "Doesn't meet: Boundary and return fences at most 72 inches."
    })
    expect(
      of(
        findings([run()], [...facts.slice(0, 2), fact("run-1", "fence-run.height", quantity(6, "foot"))]),
        ex.maxHeight.key,
        "run-1"
      )
    ).toMatchObject({
      outcome: "met",
      remedy: null
    })
  })

  it("is advisory when a recommendation isn't followed", () => {
    const facts = [
      fact("run-1", "fence-run.location", term("fence-location.return")),
      fact("run-1", "fence-run.setback-from-front-corner", quantity(3, "foot"))
    ]
    expect(of(findings([run()], facts), ex.frontSetback.key, "run-1")).toMatchObject({
      outcome: "advisory",
      remedy: null
    })
  })

  it("goes to the committee for a judgment it can't make, and for an approval it's about to decide", () => {
    const front = findings([run()], [fact("run-1", "fence-run.location", term("fence-location.front"))])
    expect(of(front, ex.sightLines.key, "run-1")).toMatchObject({
      outcome: "committee",
      remedy: null,
      reason: "The Reviewer decides: Does the fence leave a driver a clear view of objects in the roadway?"
    })
    expect(of(findings([entity("work-1", "work")], []), ex.priorApproval.key, "work-1")).toMatchObject({
      outcome: "committee",
      reason: "Awaits the decision of the Reviewer."
    })
  })

  it("leaves the committee's own deadline pending", () => {
    const submitted = [fact("request", "architectural-application.submitted-on", date("2026-02-03"))]
    expect(of(findings([], submitted), ex.committeeResponse.key, "request")).toMatchObject({ outcome: "pending" })
  })

  it("exempts what a statutory permission protects, and needs the fact that decides whether it does", () => {
    const panel = entity("panel-1", "solar-device")
    const roof = fact("panel-1", "solar-device.mounting", term("mounting.roof"))
    expect(of(findings([panel], [roof], { type: "violation" }), ex.noSolar.key, "panel-1")).toMatchObject({
      outcome: "exempt",
      modifiedBy: [{ ruleKey: ex.solarLaw.key, effect: "exempt" }],
      inputs: [{ entity: "panel-1", property: "solar-device.mounting", state: "known" }]
    })
    expect(of(findings([panel], [], { type: "violation" }), ex.noSolar.key, "panel-1")).toMatchObject({
      outcome: "missing-information",
      remedy: "provide-information",
      reason: `Needs what decides whether Solar devices can't be prohibited (${ex.solarLaw.key}) applies.`,
      inputs: [{ entity: "panel-1", property: "solar-device.mounting", state: "unknown" }]
    })
    expect(
      of(
        findings([panel], [fact("panel-1", "solar-device.mounting", term("mounting.pole"))], { type: "violation" }),
        ex.noSolar.key,
        "panel-1"
      )
    ).toMatchObject({
      outcome: "not-met",
      remedy: "redesign"
    })
  })

  it("isn't applicable where a variance displaces the rule", () => {
    const all = findings(
      [entity("run-1", "fence-run", "improvement-0193")],
      [composite, fact("run-1", "fence-run.height", quantity(80))],
      {
        entities: [entity("request", "architectural-application"), entity("lot", "lot", "lot-42")]
      }
    )
    expect(of(all, ex.maxHeight.key, "run-1")).toMatchObject({
      outcome: "not-applicable",
      modifiedBy: [{ ruleKey: ex.variance.key, effect: "displaced" }]
    })
    expect(of(all, ex.variance.key, "run-1")).toMatchObject({ outcome: "met" })
  })

  it("decides a requirement on the act itself, with no remedy", () => {
    const meeting = (present: number) =>
      findings(
        [],
        [
          fact("request", "meeting.voting-power-present", { type: "number", value: present }),
          fact("community", "community.total-voting-power", { type: "number", value: 100 })
        ],
        {
          type: "meeting"
        }
      )
    expect(of(meeting(5), ex.quorum.key, "request")).toMatchObject({ outcome: "not-met", remedy: null })
    expect(of(meeting(10), ex.quorum.key, "request")).toMatchObject({ outcome: "met" })
  })

  it("considers only rules in the request's type in force on its governing date", () => {
    const later: RulesFile = {
      ...examples,
      rules: examples.rules.map((rule) =>
        rule.key === ex.maxHeight.key ? { ...rule, effectiveFrom: "2026-04-02" } : rule
      )
    }
    const all = findings([run()], [composite], {}, {}, later)
    expect(of(all, ex.maxHeight.key, "run-1")).toBeUndefined()
    expect(of(all, "guidelines:5.5.1(i)#max-height-all", "run-1")).toBeDefined()
    expect(all.some((finding) => finding.ruleKey === ex.petLimit.key)).toBe(false)
  })

  it("doesn't apply a document's rules to a lot it doesn't govern", () => {
    const phase: RulesFile = {
      ...examples,
      documents: examples.documents.map((document) =>
        document.key === "guidelines" ? { ...document, governs: { type: "exists", path: ["lot.pets"] } } : document
      )
    }
    const all = findings([run()], [composite, fact("lot", "lot.pets", null, "absent")], {}, {}, phase)
    expect(of(all, ex.maxHeight.key, "run-1")).toMatchObject({
      outcome: "not-applicable",
      reason: "Doesn't apply here."
    })
  })

  it("decides a rule across an unsettled reference only when every thing it could name gives the same outcome", () => {
    const gate = entity("gate-1", "gate")
    const runs = (secondColor: string) => [
      ...["run-1", "run-2"].map((id) => fact(id, "fence-run.material", term("fence-material.composite"))),
      fact("run-1", "fence-run.color", term("composite-color.saddle")),
      fact("run-2", "fence-run.color", term(secondColor))
    ]
    const onRun = (state: "uncertain" | "conflicting") => ({
      ...fact("gate-1", "gate.fence-run", null, state),
      candidates: state === "uncertain" ? [reference("run-1")] : [reference("run-1"), reference("run-2")]
    })
    const gateColor = (secondColor: string, state: "uncertain" | "conflicting") =>
      of(
        findings(
          [gate, run("run-1"), run("run-2")],
          [fact("gate-1", "gate.color", term("composite-color.saddle")), onRun(state), ...runs(secondColor)]
        ),
        ex.gateColor.key,
        "gate-1"
      )

    expect(gateColor("composite-color.saddle", "uncertain")).toMatchObject({
      outcome: "met",
      reason: "Meets: Gates match a composite fence's color. This holds whichever fence run it is."
    })
    expect(gateColor("composite-color.saddle", "uncertain")?.inputs).toEqual(
      expect.arrayContaining([
        { entity: "gate-1", property: "gate.fence-run", state: "uncertain" },
        { entity: "run-2", property: "fence-run.color", state: "known" }
      ])
    )
    expect(gateColor("composite-color.saddle", "conflicting")).toMatchObject({ outcome: "met" })
    expect(gateColor("composite-color.teak", "conflicting")).toMatchObject({
      outcome: "missing-information",
      reason: "Needs fence run."
    })
  })

  it("evaluates a category's subjects by its criteria, and a rule with no subject of its own on the subjects of the rules it overrides", () => {
    const returnHeight: RuleDraft = {
      ...ex.maxHeight,
      key: "guidelines:5.5.1(i)#return-height",
      appliesTo: ["return-fence"],
      appliesWhen: null
    }
    const stricter: RuleDraft = {
      ...ex.variance,
      key: "guidelines:5.5.1(i)#stricter",
      citations: [{ provisionKey: "guidelines:5.5.1(i)", highlight: null, region: null }],
      scope: null,
      authority: null,
      effectiveFrom: "2025-11-12",
      appliesTo: [],
      overrides: { documents: ["guidelines"], provisions: [], adoptedAfter: null, except: [] }
    }
    const file: RulesFile = { ...examples, rules: [storedRule(returnHeight), storedRule(stricter)] }
    const tall = (id: string, location: string | null) => [
      fact(id, "fence-run.height", quantity(80)),
      ...(location ? [fact(id, "fence-run.location", term(`fence-location.${location}`))] : [])
    ]
    const all = findings(
      [run("run-1"), run("run-2"), run("run-3")],
      [...tall("run-1", "return"), ...tall("run-2", "rear"), ...tall("run-3", null)],
      {},
      {},
      file
    )
    expect(all.map(({ ruleKey, entity: subject, outcome }) => `${ruleKey} ${subject} ${outcome}`)).toEqual([
      "guidelines:5.5.1(i)#return-height run-1 not-applicable",
      "guidelines:5.5.1(i)#return-height run-3 not-applicable",
      "guidelines:5.5.1(i)#stricter run-1 met",
      "guidelines:5.5.1(i)#stricter run-3 met"
    ])
    const alone = findings(
      [run("run-1"), run("run-3")],
      [...tall("run-1", "return"), ...tall("run-3", null)],
      {},
      {},
      { ...examples, rules: [storedRule(returnHeight)] }
    )
    expect(of(alone, returnHeight.key, "run-1")).toMatchObject({ outcome: "not-met" })
    expect(of(alone, returnHeight.key, "run-3")).toMatchObject({
      outcome: "missing-information",
      reason: "Needs location."
    })
  })
})
