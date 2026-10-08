import type { Component, DocumentStatus, Fact } from "@/review/reviewModel"
import type { DocumentRequirementId } from "@/rules/catalog"
import type { AllowedValue, Check, Condition, Rule } from "@/rules/rule"
import { generateRuleKey } from "@/rules/ruleKey"

// The sample HOA's fence rules (docs/design/rules.md, "Examples from the sample HOA") and the sample application's
// facts (docs/design/review.md, "Expected result for the sample application"), as evaluation fixtures.

type RuleInput = Partial<Omit<Rule, "check" | "appliesWhen">> & {
  id: string
  title: string
  section: string
  check: Check
  appliesWhen?: Condition[]
}

const values = (...names: string[]): AllowedValue[] => names.map((value) => ({ value, aliases: [] }))
const when = (attribute: string, value: string | string[] | boolean): Condition => ({
  type: "fact",
  attribute,
  operator: Array.isArray(value) ? "in" : "equals",
  value
})

export function makeRule({ section, appliesWhen = [], ...input }: RuleInput): Rule {
  const rule: Omit<Rule, "ruleKey"> = {
    rulebookId: "rulebook-1",
    statement: input.title,
    projectTypes: ["fence"],
    appliesTo: "segment",
    topic: "material",
    obligation: "required",
    discretion: "objective",
    isCurable: true,
    exceptions: [],
    modifies: null,
    citations: [
      {
        documentId: "guidelines",
        section,
        pageIndex: 17,
        pageLabel: "17",
        quote: input.title,
        match: { status: "exact", score: 1, touchesLowConfidence: false }
      }
    ],
    issues: [],
    extractedHash: null,
    change: "new",
    provenance: { source: "administrator", userId: "test", createdAt: "2026-10-08T00:00:00.000Z" },
    review: { status: "approved", isEdited: false, reviewedBy: "test", reviewedAt: null, note: null },
    ...input,
    appliesWhen
  }
  return { ...rule, ruleKey: generateRuleKey(rule) }
}

const document = (id: string, title: string, requirement: DocumentRequirementId) =>
  makeRule({
    id,
    title,
    section: "Form",
    appliesTo: "project",
    topic: "documentation",
    check: { type: "required-document", document: requirement, mustState: [] }
  })

const composite = when("segment.material", "composite")

export const fenceRules: Rule[] = [
  makeRule({
    id: "materials",
    title: "Fence materials",
    section: "5.3",
    isCurable: false,
    check: {
      type: "allowed-values",
      attribute: "segment.material",
      values: values("wood", "composite", "metal"),
      otherwise: "not-met"
    }
  }),
  makeRule({
    id: "no-vinyl",
    title: "No vinyl",
    section: "5.3",
    isCurable: false,
    check: { type: "prohibited-values", attribute: "segment.material", values: values("vinyl") }
  }),
  makeRule({
    id: "metal-open",
    title: "Metal fences are open view",
    section: "5.2.3",
    appliesWhen: [when("segment.material", "metal")],
    check: { type: "allowed-values", attribute: "segment.openness", values: values("open"), otherwise: "not-met" }
  }),
  makeRule({
    id: "manufacturers",
    title: "Composite manufacturers",
    section: "5.3.2",
    appliesWhen: [composite],
    check: {
      type: "allowed-values",
      attribute: "segment.manufacturer",
      values: [
        { value: "Trex", aliases: ["TREX"] },
        { value: "Frame It All", aliases: [] },
        { value: "Neoline", aliases: [] }
      ],
      otherwise: "committee"
    }
  }),
  makeRule({
    id: "composite-colors",
    title: "Composite colors",
    section: "5.4.2",
    topic: "color",
    appliesWhen: [composite],
    check: {
      type: "allowed-values-by",
      keyAttribute: "segment.manufacturer",
      attribute: "segment.color",
      table: [
        {
          key: { value: "Trex", aliases: [] },
          values: [
            { value: "Winchester Grey", aliases: ["Winchester Gray"] },
            { value: "Saddle", aliases: [] }
          ]
        },
        { key: { value: "Frame It All", aliases: [] }, values: values("River Birch", "Teak") },
        { key: { value: "Neoline", aliases: [] }, values: values("Honey Oak", "Desert Sage") }
      ],
      unknownKey: "committee"
    }
  }),
  makeRule({
    id: "wood-stain",
    title: "Wood stain colors",
    section: "5.4.1",
    appliesWhen: [when("segment.material", "wood")],
    check: {
      type: "allowed-values-by",
      keyAttribute: "segment.finishManufacturer",
      attribute: "segment.finishColor",
      table: [{ key: { value: "Behr", aliases: [] }, values: values("Cedar", "Drift Gray") }],
      unknownKey: "committee"
    }
  }),
  makeRule({
    id: "both-sides",
    title: "Stained both sides",
    section: "5.4.1",
    appliesWhen: [when("segment.material", "wood")],
    check: {
      type: "allowed-values",
      attribute: "segment.isFinishedBothSides",
      values: values("true"),
      otherwise: "not-met"
    }
  }),
  makeRule({
    id: "no-horizontal",
    title: "No horizontal boards",
    section: "5.2.5",
    topic: "style",
    check: { type: "prohibited-values", attribute: "segment.boardOrientation", values: values("horizontal") }
  }),
  makeRule({
    id: "k-style",
    title: "Composite style",
    section: "5.2.2",
    topic: "style",
    obligation: "recommended",
    appliesWhen: [composite],
    check: { type: "allowed-values", attribute: "segment.style", values: values("K style"), otherwise: "committee" }
  }),
  makeRule({
    id: "gate-color",
    title: "Gate color matches a composite fence",
    section: "5.4.2",
    appliesTo: "gate",
    appliesWhen: [composite],
    check: { type: "matches", attribute: "gate.color", otherAttribute: "segment.color" }
  }),
  makeRule({
    id: "gate-material",
    title: "Gate material matches a composite fence",
    section: "5.4.2",
    appliesTo: "gate",
    appliesWhen: [composite],
    check: { type: "matches", attribute: "gate.material", otherAttribute: "segment.material" }
  }),
  makeRule({
    id: "gate-boards",
    title: "Gate boards coordinate with the fence",
    section: "5.9.1",
    appliesTo: "gate",
    appliesWhen: [when("segment.material", ["wood", "composite"])],
    check: { type: "matches", attribute: "gate.boardOrientation", otherAttribute: "segment.boardOrientation" }
  }),
  makeRule({
    id: "posts",
    title: "Posts match",
    section: "5.4.2",
    check: { type: "matches", attribute: "segment.postColor", otherAttribute: "segment.color" }
  }),
  makeRule({
    id: "max-height",
    title: "Wood and composite height",
    section: "5.5.1",
    topic: "dimension",
    appliesWhen: [
      when("segment.material", ["wood", "composite"]),
      when("segment.location", ["side", "rear", "return"])
    ],
    check: { type: "range", attributes: ["segment.height"], min: null, max: 72 }
  }),
  makeRule({
    id: "min-height",
    title: "Minimum height",
    section: "5.5.1",
    topic: "dimension",
    check: { type: "range", attributes: ["segment.height"], min: 40, max: null }
  }),
  makeRule({
    id: "lattice-height",
    title: "Lattice height",
    section: "5.5.1",
    topic: "dimension",
    appliesWhen: [when("segment.hasLattice", true)],
    check: { type: "range", attributes: ["segment.latticeHeight"], min: null, max: 18 }
  }),
  makeRule({
    id: "lattice-total",
    title: "Fence plus lattice",
    section: "5.5.1",
    topic: "dimension",
    appliesWhen: [when("segment.hasLattice", true)],
    check: { type: "range", attributes: ["segment.height", "segment.latticeHeight"], min: null, max: 90 }
  }),
  makeRule({
    id: "arbor-total",
    title: "Fence, lattice and arbor",
    section: "5.5.1",
    topic: "dimension",
    appliesWhen: [when("segment.hasArbor", true)],
    check: {
      type: "range",
      attributes: ["segment.height", "segment.latticeHeight", "segment.arborHeight"],
      min: null,
      max: 96
    }
  }),
  makeRule({
    id: "metal-height",
    title: "Metal height",
    section: "5.5.2",
    topic: "dimension",
    exceptions: ["Variations may be considered by the Reviewer"],
    appliesWhen: [when("segment.material", "metal")],
    check: { type: "range", attributes: ["segment.height"], min: 48, max: 72 }
  }),
  makeRule({
    id: "neighbor-approval",
    title: "Neighbor approval",
    section: "5.6.1",
    topic: "neighbor",
    appliesWhen: [when("segment.boundaryWith", "unit")],
    check: {
      type: "required-document",
      document: "neighbor-approval",
      mustState: ["approves the placement and height of the fence and the materials"]
    }
  }),
  makeRule({
    id: "sight-lines",
    title: "Driver sight lines",
    section: "5.6.2",
    topic: "placement",
    appliesWhen: [when("segment.location", "front")],
    check: { type: "qualitative", criterion: "Doesn't interfere with a driver's ability to see objects in the roadway" }
  }),
  makeRule({
    id: "setback",
    title: "Front setback",
    section: "5.6.2",
    topic: "placement",
    obligation: "recommended",
    appliesWhen: [when("segment.location", ["front", "return"])],
    check: { type: "range", attributes: ["segment.setbackFromFrontCorner"], min: 5, max: null }
  }),
  makeRule({
    id: "golf-course",
    title: "Golf course runs",
    section: "5.7.1",
    appliesWhen: [when("segment.boundaryWith", "golf-course")],
    check: { type: "allowed-values", attribute: "segment.material", values: values("metal"), otherwise: "not-met" }
  }),
  makeRule({
    id: "gate-height",
    title: "Gate height without an arbor",
    section: "5.9.2",
    topic: "dimension",
    appliesTo: "gate",
    appliesWhen: [when("gate.hasArbor", false)],
    check: { type: "range", attributes: ["gate.height"], min: null, max: 90 }
  }),
  makeRule({
    id: "gate-height-arbor",
    title: "Gate height with an arbor",
    section: "5.9.2",
    topic: "dimension",
    appliesTo: "gate",
    appliesWhen: [when("gate.hasArbor", true)],
    check: { type: "range", attributes: ["gate.height"], min: null, max: 96 }
  }),
  makeRule({
    id: "new-gates",
    title: "No new gates into common area",
    section: "5.9.5",
    appliesTo: "gate",
    appliesWhen: [when("gate.isNewOpening", true)],
    check: { type: "prohibited-values", attribute: "gate.opensTo", values: values("common-area") }
  }),
  document("application-form", "Application form", "application-form"),
  document("project-description", "Project description", "project-description"),
  document("plot-plan", "Plot plan", "plot-plan"),
  document("photos", "Photos", "photos"),
  document("product-specification", "Product specification", "product-specification"),
  document("owner-signatures", "Owner signatures", "owner-signatures"),
  document("checklist", "Checklist", "checklist"),
  makeRule({
    id: "like-for-like",
    title: "Like-for-like replacement still needs approval",
    section: "5.1",
    appliesTo: "project",
    topic: "process",
    check: { type: "informational" }
  }),
  makeRule({
    id: "approval-lapses",
    title: "Approval is withdrawn if work doesn't start within a year",
    section: "CC&R 4.3(b)",
    appliesTo: "project",
    topic: "process",
    check: { type: "informational" }
  })
]

const evidence = [{ source: "description" as const, quote: "From the packet" }]

export function fact(
  attribute: string,
  componentId: string | null,
  value: Fact["value"],
  status: Fact["status"] = "stated",
  valueMatch: Fact["valueMatch"] = typeof value === "string" ? "canonical" : null
): Fact {
  return {
    attribute,
    componentId,
    value,
    rawValue: value === null ? null : String(value),
    valueMatch,
    status,
    evidence
  }
}

const missing = (attribute: string, componentId: string | null) =>
  fact(attribute, componentId, null, "not-provided", null)

export const sampleComponents: Component[] = [
  { id: "segment-1", kind: "segment", label: "Left side run" },
  { id: "segment-2", kind: "segment", label: "Right side run" },
  { id: "segment-3", kind: "segment", label: "Rear run" },
  { id: "segment-4", kind: "segment", label: "Return to the garage" },
  { id: "gate-1", kind: "gate", label: "Gate" }
]

function segmentFacts(id: string, location: string, boundaryWith: string): Fact[] {
  return [
    fact("segment.location", id, location, "inferred"),
    fact("segment.boundaryWith", id, boundaryWith, "inferred"),
    fact("segment.material", id, "composite"),
    fact("segment.manufacturer", id, "Trex"),
    fact("segment.color", id, "River Birch"),
    fact("segment.boardOrientation", id, "horizontal", "inferred"),
    fact("segment.hasLattice", id, false, "inferred"),
    fact("segment.hasArbor", id, false, "inferred"),
    missing("segment.height", id),
    missing("segment.style", id),
    missing("segment.postColor", id),
    missing("segment.setbackFromFrontCorner", id)
  ]
}

export const sampleFacts: Fact[] = [
  ...segmentFacts("segment-1", "side", "unit"),
  ...segmentFacts("segment-2", "side", "unit"),
  ...segmentFacts("segment-3", "rear", "open-space"),
  ...segmentFacts("segment-4", "return", "none"),
  fact("gate.segmentId", "gate-1", "segment-4", "inferred", null),
  fact("gate.material", "gate-1", "composite", "inferred"),
  fact("gate.boardOrientation", "gate-1", "vertical", "inferred"),
  fact("gate.hasArbor", "gate-1", false, "inferred"),
  fact("gate.isNewOpening", "gate-1", false, "inferred"),
  fact("gate.opensTo", "gate-1", "own-lot", "inferred"),
  missing("gate.height", "gate-1"),
  missing("gate.color", "gate-1"),
  fact("project.replacesExisting", null, true),
  fact("project.ownersOfRecord", null, 2, "conflicting")
]

const status = (
  requirement: DocumentRequirementId,
  state: DocumentStatus["status"],
  problems: DocumentStatus["problems"] = [],
  componentId: string | null = null
): DocumentStatus => ({ requirement, componentId, status: state, problems, signers: [], evidence: [] })

export const sampleDocuments: DocumentStatus[] = [
  status("application-form", "present"),
  status("project-description", "present"),
  status("plot-plan", "present"),
  status("photos", "present"),
  status("product-specification", "present"),
  status("owner-signatures", "incomplete", ["missing-signer"]),
  status("checklist", "incomplete", ["unsigned", "contradicts-packet"]),
  status("neighbor-approval", "missing", [], "segment-1"),
  status("neighbor-approval", "missing", [], "segment-2")
]
