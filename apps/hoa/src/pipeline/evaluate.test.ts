import { describe, expect, it } from "vitest"
import type { Component, Fact } from "@/review/reviewModel"
import { fact, fenceRules, makeRule, sampleComponents, sampleDocuments, sampleFacts } from "@/tests/fenceRulebook"
import { decide } from "./decide"
import { evaluateRules, planQualitativeChecks, qualitativeKey, type EvaluationInput } from "./evaluate"

const settings = { curableOutcome: "approve-with-conditions" as const, retentionDays: 365, draftRetentionDays: 30 }

function input(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    projectType: "fence",
    rules: fenceRules,
    components: sampleComponents,
    facts: sampleFacts,
    conditionAnswers: [],
    documents: sampleDocuments,
    ...overrides
  }
}

function statuses(findings: ReturnType<typeof evaluateRules>) {
  return Object.fromEntries(findings.map((finding) => [finding.id, finding.status]))
}

/** Replaces one fact (matched by attribute and component) or adds it. */
function withFact(facts: readonly Fact[], replacement: Fact) {
  return [
    ...facts.filter(
      (item) => !(item.attribute === replacement.attribute && item.componentId === replacement.componentId)
    ),
    replacement
  ]
}

describe("evaluateRules on the sample application", () => {
  const findings = evaluateRules(input())
  const result = statuses(findings)
  const allSegments = (ruleId: string) =>
    ["segment-1", "segment-2", "segment-3", "segment-4"].map((id) => result[`${ruleId}:${id}`])

  it("matches the expected result in review.md", () => {
    expect(allSegments("materials")).toEqual(["met", "met", "met", "met"])
    expect(allSegments("no-vinyl")).toEqual(["met", "met", "met", "met"])
    expect(allSegments("manufacturers")).toEqual(["met", "met", "met", "met"])
    expect(allSegments("composite-colors")).toEqual(["not-met", "not-met", "not-met", "not-met"])
    expect(allSegments("no-horizontal")).toEqual(["not-met", "not-met", "not-met", "not-met"])
    expect(result["gate-boards:gate-1"]).toBe("not-met")
    expect(result["gate-material:gate-1"]).toBe("met")
    expect(result["gate-color:gate-1"]).toBe("needs-committee")
    expect(allSegments("k-style")).toEqual(["needs-committee", "needs-committee", "needs-committee", "needs-committee"])
    expect(allSegments("posts")).toEqual(["needs-committee", "needs-committee", "needs-committee", "needs-committee"])
    expect(allSegments("max-height")).toEqual(["unclear", "unclear", "unclear", "unclear"])
    expect(allSegments("min-height")).toEqual(["unclear", "unclear", "unclear", "unclear"])
    expect(allSegments("neighbor-approval")).toEqual(["unclear", "unclear", "not-applicable", "not-applicable"])
    expect(allSegments("setback")).toEqual(["not-applicable", "not-applicable", "not-applicable", "needs-committee"])
    expect(result["gate-height:gate-1"]).toBe("needs-committee")
    expect(result["owner-signatures:project"]).toBe("unclear")
    expect(result["checklist:project"]).toBe("unclear")
    for (const id of ["application-form", "project-description", "plot-plan", "photos", "product-specification"]) {
      expect(result[`${id}:project`]).toBe("met")
    }
    for (const id of [
      "metal-open",
      "wood-stain",
      "both-sides",
      "lattice-height",
      "lattice-total",
      "arbor-total",
      "metal-height",
      "sight-lines",
      "golf-course"
    ]) {
      expect(allSegments(id)).toEqual(["not-applicable", "not-applicable", "not-applicable", "not-applicable"])
    }
    expect(result["gate-height-arbor:gate-1"]).toBe("not-applicable")
    expect(result["new-gates:gate-1"]).toBe("not-applicable")
    expect(findings.some((finding) => finding.ruleId === "like-for-like")).toBe(false)
  })

  it("recommends requesting information, listing the changes too", () => {
    const decision = decide(findings, fenceRules, settings)
    expect(decision.recommendation).toBe("request-information")
    expect(decision.missingInformation.map((item) => item.id)).toEqual([
      "provide:max-height",
      "provide:min-height",
      "provide:neighbor-approval",
      "provide:owner-signatures",
      "provide:checklist"
    ])
    expect(decision.changes.map((item) => item.id)).toEqual([
      "change:composite-colors",
      "change:no-horizontal",
      "change:gate-boards"
    ])
    expect(decision.changes[0]?.text).toContain("River Birch isn't listed for Trex")
    expect(decision.committeeDecisions.map((item) => item.id)).toEqual([
      "committee:k-style",
      "committee:gate-color",
      "committee:posts",
      "committee:setback",
      "committee:gate-height"
    ])
  })

  it("explains document findings with their problems", () => {
    const checklist = findings.find((finding) => finding.id === "checklist:project")
    expect(checklist?.documentProblems).toEqual(["unsigned", "contradicts-packet"])
    expect(checklist?.explanation).toBe("The document is incomplete (unsigned, contradicts-packet).")
  })
})

describe("evaluateRules semantics", () => {
  const gate: Component[] = [
    { id: "segment-1", kind: "segment", label: "Run" },
    { id: "gate-1", kind: "gate", label: "Gate" }
  ]

  it("height-checks a gate without an arbor (the arborless gate)", () => {
    const facts = [fact("gate.hasArbor", "gate-1", false, "inferred"), fact("gate.height", "gate-1", 100)]
    const result = statuses(evaluateRules(input({ components: gate, facts, documents: [] })))
    expect(result["gate-height:gate-1"]).toBe("not-met")
    expect(result["gate-height-arbor:gate-1"]).toBe("not-applicable")
  })

  it("counts an absent lattice as 0 when an arbor is added", () => {
    const facts = [
      fact("segment.hasArbor", "segment-1", true),
      fact("segment.hasLattice", "segment-1", false, "inferred"),
      fact("segment.height", "segment-1", 72),
      fact("segment.arborHeight", "segment-1", 30)
    ]
    const findings = evaluateRules(input({ components: gate, facts, documents: [] }))
    const arbor = findings.find((finding) => finding.id === "arbor-total:segment-1")
    expect(arbor?.status).toBe("not-met")
    expect(arbor?.explanation).toContain("102 in, above the maximum of 96")
  })

  it("treats an attribute of an absent feature as not applicable", () => {
    const rule = makeRule({
      id: "lattice-only",
      title: "Lattice",
      section: "x",
      check: { type: "range", attributes: ["segment.latticeHeight"], min: null, max: 18 }
    })
    const facts = [fact("segment.hasLattice", "segment-1", false)]
    expect(evaluateRules(input({ rules: [rule], components: gate, facts }))[0]?.status).toBe("not-applicable")
  })

  it("makes a conflicting fact unclear", () => {
    const rule = makeRule({
      id: "owners",
      title: "Owners",
      section: "x",
      appliesTo: "project",
      check: { type: "required-fact", attribute: "project.ownersOfRecord" }
    })
    const findings = evaluateRules(
      input({ rules: [rule], facts: [fact("project.ownersOfRecord", null, 2, "conflicting")] })
    )
    expect(findings[0]).toMatchObject({
      status: "unclear",
      explanation: "The packet gives conflicting values for Owners of record."
    })
  })

  it("asks for a required fact that's missing", () => {
    const rule = makeRule({
      id: "owners",
      title: "Owners",
      section: "x",
      appliesTo: "project",
      check: { type: "required-fact", attribute: "project.ownersOfRecord" }
    })
    expect(evaluateRules(input({ rules: [rule], facts: [] }))[0]?.status).toBe("unclear")
    expect(evaluateRules(input({ rules: [rule], facts: [fact("project.ownersOfRecord", null, 2)] }))[0]?.status).toBe(
      "met"
    )
  })

  it("matches listed values through aliases and asks about uncertain ones", () => {
    const grey = withFact(sampleFacts, fact("segment.color", "segment-1", "winchester gray"))
    expect(statuses(evaluateRules(input({ facts: grey })))["composite-colors:segment-1"]).toBe("met")

    const uncertain = withFact(sampleFacts, fact("segment.color", "segment-1", "Birch-ish", "stated", "uncertain"))
    expect(statuses(evaluateRules(input({ facts: uncertain })))["composite-colors:segment-1"]).toBe("unclear")
  })

  it("leaves an unlisted manufacturer to the committee", () => {
    const facts = withFact(sampleFacts, fact("segment.manufacturer", "segment-1", "Fiberon", "stated", "unlisted"))
    const result = statuses(evaluateRules(input({ facts })))
    expect(result["manufacturers:segment-1"]).toBe("needs-committee")
    expect(result["composite-colors:segment-1"]).toBe("needs-committee")
  })

  it("treats an unlisted value as outside a prohibited list", () => {
    const facts = withFact(
      sampleFacts,
      fact("segment.boardOrientation", "segment-1", "horizontal", "stated", "unlisted")
    )
    expect(statuses(evaluateRules(input({ facts })))["no-horizontal:segment-1"]).toBe("met")
  })

  it("makes a condition on a missing required fact unclear, and on an optional one a committee decision", () => {
    const withoutMaterial = sampleFacts.filter(
      (item) => !(item.attribute === "segment.material" && item.componentId === "segment-1")
    )
    expect(statuses(evaluateRules(input({ facts: withoutMaterial })))["manufacturers:segment-1"]).toBe("unclear")

    const rule = makeRule({
      id: "styled",
      title: "Styled",
      section: "x",
      appliesWhen: [{ type: "fact", attribute: "segment.style", operator: "exists", value: null }],
      check: { type: "required-fact", attribute: "segment.color" }
    })
    expect(evaluateRules(input({ rules: [rule] }))[0]?.status).toBe("needs-committee")
  })

  it("supports not-in conditions", () => {
    const rule = makeRule({
      id: "not-wood",
      title: "Not wood",
      section: "x",
      appliesWhen: [{ type: "fact", attribute: "segment.material", operator: "not-in", value: ["wood"] }],
      check: { type: "required-fact", attribute: "segment.color" }
    })
    expect(evaluateRules(input({ rules: [rule] }))[0]?.status).toBe("met")
  })

  it("decides text conditions from the model's answers, per component", () => {
    const rule = makeRule({
      id: "visible",
      title: "Visible from the street",
      section: "x",
      appliesWhen: [{ type: "text", id: "visible:c0", description: "The run is visible from the street" }],
      check: { type: "required-fact", attribute: "segment.color" }
    })
    const answers = [
      { conditionId: "visible:c0", componentId: "segment-1", answer: "true" as const, evidence: [] },
      { conditionId: "visible:c0", componentId: "segment-2", answer: "false" as const, evidence: [] },
      { conditionId: "visible:c0", componentId: null, answer: "unknown" as const, evidence: [] }
    ]
    const result = statuses(evaluateRules(input({ rules: [rule], conditionAnswers: answers })))
    expect(result["visible:segment-1"]).toBe("met")
    expect(result["visible:segment-2"]).toBe("not-applicable")
    expect(result["visible:segment-3"]).toBe("needs-committee")
  })

  it("turns a model's not-met or failed qualitative check into a committee decision", () => {
    const facts = withFact(sampleFacts, fact("segment.location", "segment-1", "front"))
    const planned = planQualitativeChecks(input({ facts }))
    expect(planned.map(({ rule, componentId }) => `${rule.id}:${componentId}`)).toEqual(["sight-lines:segment-1"])

    const met = new Map([
      [
        qualitativeKey("sight-lines", "segment-1"),
        { status: "met" as const, explanation: "Clear sight lines.", evidence: [] }
      ]
    ])
    const metFinding = evaluateRules(input({ facts, qualitative: met })).find(
      (finding) => finding.id === "sight-lines:segment-1"
    )
    expect(metFinding).toMatchObject({ status: "met", decidedBy: "model" })

    const blocked = new Map([
      [
        qualitativeKey("sight-lines", "segment-1"),
        { status: "not-met" as const, explanation: "Blocks the view.", evidence: [] }
      ]
    ])
    expect(
      evaluateRules(input({ facts, qualitative: blocked })).find((finding) => finding.id === "sight-lines:segment-1")
        ?.status
    ).toBe("needs-committee")

    const failed = evaluateRules(input({ facts })).find((finding) => finding.id === "sight-lines:segment-1")
    expect(failed?.explanation).toBe("Automatic check failed; the committee should judge it.")
  })

  it("leaves a failure to the committee when the rule has exceptions", () => {
    const facts = [fact("segment.material", "segment-1", "metal"), fact("segment.height", "segment-1", 80)]
    const metal = evaluateRules(input({ components: gate, facts, documents: [] })).find(
      (finding) => finding.id === "metal-height:segment-1"
    )
    expect(metal?.status).toBe("needs-committee")
    expect(metal?.explanation).toContain("exceptions may apply")
  })

  it("reports a value that isn't a number", () => {
    const facts = [fact("segment.height", "segment-1", "tall")]
    expect(statuses(evaluateRules(input({ components: gate, facts, documents: [] })))["min-height:segment-1"]).toBe(
      "unclear"
    )
  })
})

describe("decide", () => {
  const compliant = (status: "met" | "not-met", ruleId: string) => ({
    id: `${ruleId}:segment-1`,
    ruleId,
    componentId: "segment-1",
    status,
    explanation: "x",
    evidence: [],
    documentProblems: [],
    decidedBy: "code" as const
  })

  it("approves when every rule is met", () => {
    expect(decide([compliant("met", "materials")], fenceRules, settings).recommendation).toBe("approve")
  })

  it("approves with conditions when every unmet rule is curable", () => {
    expect(decide([compliant("not-met", "composite-colors")], fenceRules, settings).recommendation).toBe(
      "approve-with-conditions"
    )
  })

  it("rejects when an unmet rule isn't curable, or when the HOA prefers it", () => {
    expect(decide([compliant("not-met", "no-vinyl")], fenceRules, settings).recommendation).toBe("reject")
    expect(
      decide([compliant("not-met", "composite-colors")], fenceRules, { ...settings, curableOutcome: "reject" })
        .recommendation
    ).toBe("reject")
  })
})
