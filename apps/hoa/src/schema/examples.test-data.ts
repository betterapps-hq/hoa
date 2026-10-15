import type {
  Citation,
  EvaluationRequest,
  Finding,
  GoverningDocument,
  Operand,
  Provision,
  Settings,
  ValueType
} from "./types"
import type { QuestionDraft, RuleDraft, TermDraft } from "./zod"

// The schema's checked examples (docs/design/schema-examples.md is rendered from them). Rules and terms are drafts:
// bookkeeping is left out and the draft schemas fill it. They reference the core terms in coreTerms.ts.

type NormDraft = Extract<RuleDraft, { kind: "norm" }>
type DiscretionDraft = Extract<RuleDraft, { kind: "discretion" }>
type SanctionDraft = Extract<RuleDraft, { kind: "sanction" }>
type LimitDraft = Extract<RuleDraft, { kind: "limit" }>
type Nature = Extract<TermDraft, { kind: "thing" }>["nature"]

const ref = (...path: string[]): Operand => ({ type: "ref", path })
const req = (...path: string[]): Operand => ({ type: "ref", from: "request", path })
const inches = (value: number): Operand => ({ type: "quantity", value, unit: "inch" })
const usd = (value: number): Operand => ({ type: "quantity", value, unit: "usd" })
const val = (term: string): Operand => ({ type: "value", term })
const cite = (provisionKey: string): Citation[] => [{ provisionKey, highlight: null, region: null }]
const pref = (text: string) => ({ text, role: "preferred" as const })
const alt = (text: string) => ({ text, role: "alternative" as const })
const SAMPLE = "org-sample"

const thing = (key: string, nature: Nature, label: string): TermDraft => ({
  key,
  organizationId: SAMPLE,
  kind: "thing",
  nature,
  request: null,
  labels: [pref(label)]
})
const prop = (key: string, valueType: ValueType, label: string): TermDraft => ({
  key,
  organizationId: SAMPLE,
  kind: "property",
  of: key.slice(0, key.lastIndexOf(".")),
  valueType,
  many: false,
  ifUnstated: "unknown",
  derived: null,
  labels: [pref(label)]
})
const valueSet = (key: string, label: string, complete: boolean): TermDraft => ({
  key,
  organizationId: SAMPLE,
  kind: "value-set",
  complete,
  labels: [pref(label)]
})
const value = (key: string, label: string): TermDraft => ({
  key,
  organizationId: SAMPLE,
  kind: "value",
  set: key.slice(0, key.lastIndexOf(".")),
  broader: [],
  labels: [pref(label)]
})
const quantity = (unit: string): ValueType => ({ type: "quantity", unit })
const choice = (set: string): ValueType => ({ type: "choice", set })
const date: ValueType = { type: "date" }
const dateTime: ValueType = { type: "date-time" }

// ─── The sample organization's terms ──────────────────────────────────────────────────────────────

export const organizationTerms: TermDraft[] = [
  {
    key: "lot",
    organizationId: SAMPLE,
    kind: "thing",
    nature: "object",
    request: null,
    labels: [pref("Unit"), alt("lot"), alt("home site")]
  },
  {
    key: "committee",
    organizationId: SAMPLE,
    kind: "thing",
    nature: "party",
    request: null,
    labels: [pref("Reviewer"), alt("architectural review committee"), alt("ARC")]
  },
  {
    key: "fence-run",
    organizationId: SAMPLE,
    kind: "thing",
    nature: "object",
    request: null,
    labels: [pref("fence run"), alt("fence segment"), alt("run of fence")],
    definition: "a continuous stretch of fence of one material and height between two corners or ends"
  },
  thing("gate", "object", "gate"),
  {
    key: "fence-run.height",
    organizationId: SAMPLE,
    kind: "property",
    of: "fence-run",
    valueType: { type: "quantity", unit: "inch" },
    many: false,
    ifUnstated: "unknown",
    derived: null,
    labels: [pref("height"), alt("fence height")],
    definition: "vertical distance from finished grade to the top of the boards",
    scopeNote: "Excludes lattice and arbors, which have heights of their own."
  },
  {
    key: "fence-run.lattice-height",
    organizationId: SAMPLE,
    kind: "property",
    of: "fence-run",
    valueType: { type: "quantity", unit: "inch" },
    many: false,
    ifUnstated: "absent",
    derived: null,
    labels: [pref("lattice height")]
  },
  prop("fence-run.location", choice("fence-location"), "location"),
  valueSet("fence-location", "fence location", true),
  value("fence-location.front", "front"),
  value("fence-location.rear", "rear"),
  value("fence-location.return", "return"),
  {
    key: "return-fence",
    organizationId: SAMPLE,
    kind: "category",
    of: "fence-run",
    criteria: { type: "compare", left: ref("fence-run.location"), op: "=", right: val("fence-location.return") },
    labels: [pref("return fence")],
    definition: "a fence run that runs from a side yard boundary to the house"
  },
  prop("fence-run.boundary-with", choice("boundary"), "boundary with"),
  valueSet("boundary", "boundary", true),
  value("boundary.lot", "another Unit"),
  {
    key: "boundary-fence",
    organizationId: SAMPLE,
    kind: "category",
    of: "fence-run",
    criteria: { type: "exists", path: ["fence-run.boundary-with"] },
    labels: [pref("boundary fence")]
  },
  {
    key: "neighbor",
    organizationId: SAMPLE,
    kind: "category",
    of: "owner",
    criteria: { type: "text", text: "owns a lot that shares a boundary with the applicant's lot" },
    labels: [pref("neighbor"), alt("adjacent owner")],
    context: "the owner next door, not any resident"
  },
  prop("fence-run.material", choice("fence-material"), "material"),
  valueSet("fence-material", "fence material", false),
  value("fence-material.wood", "wood"),
  value("fence-material.composite", "composite"),
  value("fence-material.metal", "metal"),
  prop("fence-run.manufacturer", choice("composite-manufacturer"), "manufacturer"),
  valueSet("composite-manufacturer", "composite manufacturer", false),
  {
    key: "composite-manufacturer.trex",
    organizationId: SAMPLE,
    kind: "value",
    set: "composite-manufacturer",
    broader: [],
    labels: [pref("Trex"), alt("TREX")]
  },
  {
    key: "composite-manufacturer.frame-it-all",
    organizationId: SAMPLE,
    kind: "value",
    set: "composite-manufacturer",
    broader: [],
    labels: [pref("Frame It All"), alt("FRAME IT ALL"), alt("Frame-It-All")]
  },
  {
    key: "composite-manufacturer.neoline",
    organizationId: SAMPLE,
    kind: "value",
    set: "composite-manufacturer",
    broader: [],
    labels: [pref("Neoline"), alt("NEOLINE")]
  },
  prop("fence-run.color", choice("composite-color"), "color"),
  valueSet("composite-color", "composite color", false),
  {
    key: "composite-color.winchester-grey",
    organizationId: SAMPLE,
    kind: "value",
    set: "composite-color",
    broader: [],
    labels: [pref("Winchester Grey"), alt("Winchester Gray"), { text: "Winchster Grey", role: "hidden" }]
  },
  value("composite-color.saddle", "Saddle"),
  value("composite-color.river-birch", "River Birch"),
  value("composite-color.teak", "Teak"),
  value("composite-color.honey-oak", "Honey Oak"),
  value("composite-color.desert-sage", "Desert Sage"),
  prop("fence-run.setback-from-front-corner", quantity("foot"), "setback from the front corner"),
  prop("fence-run.installed-on", date, "installed on"),
  prop("gate.fence-run", { type: "reference", to: "fence-run" }, "fence run"),
  prop("gate.color", choice("composite-color"), "gate color"),
  thing("neighbor-approval-form", "document", "neighbor approval form"),
  thing("site-plan", "document", "site plan"),
  thing("photo", "document", "photo"),
  thing("inspection-report", "document", "inspection report"),
  thing("solar-device", "object", "solar energy device"),
  prop("solar-device.mounting", choice("mounting"), "mounting"),
  valueSet("mounting", "mounting", true),
  value("mounting.roof", "roof"),
  thing("vehicle", "object", "vehicle"),
  prop("vehicle.class", choice("vehicle-class"), "class"),
  valueSet("vehicle-class", "vehicle class", false),
  value("vehicle-class.commercial", "commercial vehicle"),
  thing("parking", "event", "parking"),
  prop("parking.vehicle", { type: "reference", to: "vehicle" }, "vehicle"),
  prop("parking.location", choice("parking-location"), "location"),
  valueSet("parking-location", "parking location", true),
  value("parking-location.street", "street"),
  prop("parking.start", dateTime, "start"),
  prop("parking.end", dateTime, "end"),
  thing("curbside-placement", "event", "time at the curb"),
  prop("curbside-placement.start", dateTime, "put out"),
  prop("curbside-placement.end", dateTime, "taken in"),
  prop("community.trash-pickup", { type: "schedule" }, "trash pickup"),
  thing("pet", "object", "pet"),
  {
    key: "lot.pets",
    organizationId: SAMPLE,
    kind: "property",
    of: "lot",
    valueType: { type: "reference", to: "pet" },
    many: true,
    ifUnstated: "unknown",
    derived: null,
    labels: [pref("pets")]
  },
  prop("pet.species", choice("species"), "species"),
  valueSet("species", "species", false),
  value("species.dog", "dog"),
  value("species.cat", "cat"),
  prop("violation.notice-mailed-on", date, "notice mailed on"),
  {
    key: "violation.notice-deemed-delivered-on",
    organizationId: SAMPLE,
    kind: "property",
    of: "violation",
    valueType: { type: "date" },
    many: false,
    ifUnstated: "unknown",
    derived: [
      {
        when: null,
        value: { type: "shift", of: req("violation.notice-mailed-on"), by: { value: 3, unit: "calendar-day" } },
        citations: []
      }
    ],
    labels: [pref("notice deemed delivered on")]
  },
  prop("violation.cost-of-work", quantity("usd"), "cost of the work")
]

// ─── Sources ─────────────────────────────────────────────────────────────────────────────────────

export const guidelines: GoverningDocument = {
  key: "guidelines",
  kind: "design-guidelines",
  title: "Residential Design Guidelines",
  issuedBy: "board",
  governs: null,
  edition: {
    label: "Board approved 2025-11-12",
    adoptedOn: "2025-11-12",
    adoptedBy: null,
    effectiveFrom: "2025-11-12",
    basis: "original",
    files: [
      { fileId: "file-0007", sha256: "9f2c4e1a7b3d5f60812a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d", pages: 48 }
    ],
    recording: null
  }
}

export const byLaws: GoverningDocument = {
  key: "by-laws",
  kind: "bylaws",
  title: "By-Laws",
  issuedBy: "board",
  governs: null,
  edition: null
}

export const provision542: Omit<Provision, "anchors"> = {
  key: "guidelines:5.4.2(i)",
  kind: "point",
  num: { printed: "(i)", normalized: "i", source: "printed" },
  label: "5.4.2(i)",
  heading: "Composite Fence Colors",
  parentLabel: "5.4.2",
  intro: null,
  text: "The composite fence colors shall be limited to those available through the following Manufacturers: a) TREX: Winchester Grey and Saddle b) FRAME IT ALL: River Birch and Teak c) NEOLINE: Honey Oak and Desert Sage",
  wrapUp: null,
  noRule: null
}

// ─── Rules ────────────────────────────────────────────────────────────────────────────────────────

const ARCHITECTURAL = ["architectural-application", "violation"]
const ruleBase = {
  requestTypes: ARCHITECTURAL,
  appliesWhen: null,
  scope: null,
  authority: null,
  effectiveFrom: "2025-11-12"
}
const normBase = {
  ...ruleBase,
  beneficiary: null,
  decidedBy: [],
  overrides: [],
  noExceptions: null,
  cure: null,
  recurs: null
}
const composite = {
  type: "compare" as const,
  left: ref("fence-run.material"),
  op: "=" as const,
  right: val("fence-material.composite")
}
const listedManufacturers = [
  val("composite-manufacturer.trex"),
  val("composite-manufacturer.frame-it-all"),
  val("composite-manufacturer.neoline")
]

export const compositeColors: NormDraft = {
  ...normBase,
  citations: cite("guidelines:5.4.2(i)"),
  key: "guidelines:5.4.2(i)#colors",
  kind: "norm",
  domain: "architectural",
  title: "Composite colors by manufacturer",
  statement:
    "A composite {{fence-run}} must use a {{fence-run.color}} its {{fence-run.manufacturer}} offers on this list: Trex in Winchester Grey or Saddle, Frame It All in River Birch or Teak, Neoline in Honey Oak or Desert Sage.",
  appliesTo: ["fence-run"],
  appliesWhen: composite,
  modality: "obligation",
  bearer: ["owner"],
  check: {
    type: "table",
    inputs: [ref("fence-run.manufacturer"), ref("fence-run.color")],
    rows: [
      {
        when: [
          { type: "in", values: [val("composite-manufacturer.trex")] },
          { type: "in", values: [val("composite-color.winchester-grey"), val("composite-color.saddle")] }
        ],
        result: "met",
        citation: null
      },
      {
        when: [
          { type: "in", values: [val("composite-manufacturer.frame-it-all")] },
          { type: "in", values: [val("composite-color.river-birch"), val("composite-color.teak")] }
        ],
        result: "met",
        citation: null
      },
      {
        when: [
          { type: "in", values: [val("composite-manufacturer.neoline")] },
          { type: "in", values: [val("composite-color.honey-oak"), val("composite-color.desert-sage")] }
        ],
        result: "met",
        citation: null
      }
    ],
    otherwise: "not-met"
  },
  remedy: "change-detail"
}

export const manufacturers: NormDraft = {
  ...normBase,
  citations: cite("guidelines:5.3.2"),
  key: "guidelines:5.3.2#manufacturers",
  kind: "norm",
  domain: "architectural",
  title: "Composite manufacturers",
  statement: "A composite {{fence-run}} must come from Trex, Frame It All or Neoline.",
  appliesTo: ["fence-run"],
  appliesWhen: composite,
  modality: "obligation",
  bearer: ["owner"],
  check: { type: "test", test: { type: "in", left: ref("fence-run.manufacturer"), values: listedManufacturers } },
  remedy: "change-detail"
}

export const otherManufacturers: DiscretionDraft = {
  ...ruleBase,
  citations: cite("guidelines:5.3.2"),
  key: "guidelines:5.3.2#other-manufacturers",
  kind: "discretion",
  domain: "architectural",
  title: "Other composite manufacturers case by case",
  statement:
    "The {{committee}} may consider a composite {{fence-run}} from another {{fence-run.manufacturer}} case by case.",
  appliesTo: ["fence-run"],
  appliesWhen: {
    type: "all",
    of: [
      composite,
      { type: "not", of: { type: "in", left: ref("fence-run.manufacturer"), values: listedManufacturers } }
    ]
  },
  decidedBy: ["committee"],
  overrides: ["guidelines:5.4.2(i)#colors", "guidelines:5.3.2#manufacturers"]
}

export const maxHeight: NormDraft = {
  ...normBase,
  citations: cite("guidelines:5.5.1(i)"),
  key: "guidelines:5.5.1(i)#max-height",
  kind: "norm",
  domain: "architectural",
  title: "Boundary and return fences at most 72 inches",
  statement:
    "A wood or composite {{fence-run}} on a {{lot}} boundary, or a {{return-fence}}, must have a {{fence-run.height}} of at most 72 inches, not counting lattice or an arbor.",
  appliesTo: ["fence-run"],
  appliesWhen: {
    type: "all",
    of: [
      {
        type: "in",
        left: ref("fence-run.material"),
        values: [val("fence-material.wood"), val("fence-material.composite")]
      },
      {
        type: "any",
        of: [
          { type: "is-a", path: [], category: "boundary-fence" },
          { type: "is-a", path: [], category: "return-fence" }
        ]
      }
    ]
  },
  modality: "obligation",
  bearer: ["owner"],
  check: { type: "test", test: { type: "compare", left: ref("fence-run.height"), op: "<=", right: inches(72) } },
  remedy: "change-detail"
}

// The other reading of 5.5.1(i), proposed alongside maxHeight until the administrator answers the question.
const maxHeightAll: NormDraft = {
  ...maxHeight,
  key: "guidelines:5.5.1(i)#max-height-all",
  title: "Wood and composite fences at most 72 inches",
  statement:
    "A wood or composite {{fence-run}} must have a {{fence-run.height}} of at most 72 inches, not counting lattice or an arbor.",
  appliesWhen: {
    type: "in",
    left: ref("fence-run.material"),
    values: [val("fence-material.wood"), val("fence-material.composite")]
  }
}

export const maxHeightAmended: Pick<NormDraft, "key" | "effectiveFrom" | "check"> = {
  key: "guidelines:5.5.1(i)#max-height",
  effectiveFrom: "2026-04-02",
  check: { type: "test", test: { type: "compare", left: ref("fence-run.height"), op: "<=", right: inches(78) } }
}

export const fenceAndLattice: NormDraft = {
  ...normBase,
  citations: cite("guidelines:5.5.1(ii)"),
  key: "guidelines:5.5.1(ii)#fence-and-lattice",
  kind: "norm",
  domain: "architectural",
  title: "Fence plus lattice at most 90 inches",
  statement: "A {{fence-run}}'s {{fence-run.height}} plus its {{fence-run.lattice-height}} must be at most 90 inches.",
  appliesTo: ["fence-run"],
  modality: "obligation",
  bearer: ["owner"],
  check: {
    type: "test",
    test: {
      type: "compare",
      left: { type: "sum", of: [ref("fence-run.height"), ref("fence-run.lattice-height")] },
      op: "<=",
      right: inches(90)
    }
  },
  remedy: "change-detail"
}

export const metalHeight: NormDraft = {
  ...normBase,
  citations: cite("guidelines:5.5.2"),
  key: "guidelines:5.5.2#metal-height",
  kind: "norm",
  domain: "architectural",
  title: "Metal fences 48 to 72 inches",
  statement: "A metal {{fence-run}} must have a {{fence-run.height}} of at least 48 and at most 72 inches.",
  appliesTo: ["fence-run"],
  appliesWhen: { type: "compare", left: ref("fence-run.material"), op: "=", right: val("fence-material.metal") },
  modality: "obligation",
  bearer: ["owner"],
  check: {
    type: "test",
    test: {
      type: "between",
      left: ref("fence-run.height"),
      min: inches(48),
      max: inches(72),
      includeMin: true,
      includeMax: true
    }
  },
  remedy: "change-detail"
}

export const metalVariations: DiscretionDraft = {
  ...ruleBase,
  citations: cite("guidelines:5.5.2"),
  key: "guidelines:5.5.2#variations",
  kind: "discretion",
  domain: "architectural",
  title: "Metal height variations considered",
  statement: "The {{committee}} may consider variations from the metal fence heights.",
  appliesTo: ["fence-run"],
  appliesWhen: { type: "compare", left: ref("fence-run.material"), op: "=", right: val("fence-material.metal") },
  decidedBy: ["committee"],
  overrides: ["guidelines:5.5.2#metal-height"]
}

export const frontSetback: NormDraft = {
  ...normBase,
  citations: cite("guidelines:5.6.2(ii)"),
  key: "guidelines:5.6.2(ii)#setback",
  kind: "norm",
  domain: "architectural",
  title: "Front fences set back 5 feet",
  statement: "A front or return {{fence-run}} should be set back at least 5 feet from the front corner of the house.",
  appliesTo: ["fence-run"],
  appliesWhen: {
    type: "in",
    left: ref("fence-run.location"),
    values: [val("fence-location.front"), val("fence-location.return")]
  },
  modality: "recommendation",
  bearer: ["owner"],
  check: {
    type: "test",
    test: {
      type: "compare",
      left: ref("fence-run.setback-from-front-corner"),
      op: ">=",
      right: { type: "quantity", value: 5, unit: "foot" }
    }
  },
  remedy: "change-detail"
}

export const neighborApproval: NormDraft = {
  ...normBase,
  citations: cite("guidelines:5.6.1(i)"),
  key: "guidelines:5.6.1(i)#neighbor-approval",
  kind: "norm",
  domain: "architectural",
  title: "Neighbor approval for shared boundaries",
  statement:
    "A {{fence-run}} on a boundary with another {{lot}} needs the {{neighbor}}'s signed approval of its placement, height and materials.",
  appliesTo: ["fence-run"],
  appliesWhen: { type: "compare", left: ref("fence-run.boundary-with"), op: "=", right: val("boundary.lot") },
  modality: "obligation",
  bearer: ["applicant"],
  beneficiary: "neighbor",
  check: {
    type: "document",
    document: "neighbor-approval-form",
    per: "subject",
    mustState: [
      "approval of the fence's placement",
      "approval of its height",
      "approval of its materials",
      "who maintains it"
    ],
    signedBy: ["neighbor"]
  },
  remedy: "redesign"
}

export const sightLines: NormDraft = {
  ...normBase,
  citations: cite("guidelines:5.6.2(i)"),
  key: "guidelines:5.6.2(i)#sight-lines",
  kind: "norm",
  domain: "architectural",
  title: "Front fences keep drivers' view clear",
  statement: "A front {{fence-run}} must not interfere with a driver's ability to see objects in the roadway.",
  appliesTo: ["fence-run"],
  appliesWhen: { type: "compare", left: ref("fence-run.location"), op: "=", right: val("fence-location.front") },
  modality: "obligation",
  bearer: ["owner"],
  decidedBy: ["committee"],
  check: {
    type: "judgment",
    question: "Does the fence leave a driver a clear view of objects in the roadway?",
    evidence: ["site-plan", "photo"]
  },
  remedy: "redesign"
}

export const gateColor: NormDraft = {
  ...normBase,
  citations: cite("guidelines:5.4.2(iii)"),
  key: "guidelines:5.4.2(iii)#gate-color",
  kind: "norm",
  domain: "architectural",
  title: "Gates match a composite fence's color",
  statement: "A {{gate}} in a composite {{fence-run}} must match the fence's {{fence-run.color}}.",
  appliesTo: ["gate"],
  appliesWhen: {
    type: "compare",
    left: ref("gate.fence-run", "fence-run.material"),
    op: "=",
    right: val("fence-material.composite")
  },
  modality: "obligation",
  bearer: ["owner"],
  check: {
    type: "test",
    test: { type: "compare", left: ref("gate.color"), op: "=", right: ref("gate.fence-run", "fence-run.color") }
  },
  remedy: "change-detail"
}

export const committeeResponse: NormDraft = {
  ...normBase,
  citations: cite("declaration:4.3(a)"),
  key: "declaration:4.3(a)#response-time",
  kind: "norm",
  domain: "architectural",
  title: "Committee decides within 30 days",
  statement:
    "The {{committee}} must decide an {{architectural-application}} within 30 days after it's submitted, or it is deemed approved.",
  requestTypes: ["architectural-application"],
  appliesTo: ["architectural-application"],
  modality: "obligation",
  bearer: ["committee"],
  beneficiary: "applicant",
  check: {
    type: "deadline",
    act: req("architectural-application.decided-on"),
    anchor: req("architectural-application.submitted-on"),
    earliest: null,
    latest: { value: 30, unit: "calendar-day", at: null },
    onMiss: [
      {
        type: "deems",
        target: { from: "request", path: ["architectural-application.decision"] },
        value: val("decision-status.approved")
      }
    ]
  },
  remedy: null
}

export const grandfathered: NormDraft = {
  ...normBase,
  citations: cite("guidelines:1.4"),
  key: "guidelines:1.4#existing-fences",
  kind: "norm",
  domain: "architectural",
  title: "Existing fences may remain until replaced",
  statement:
    "A {{fence-run}} installed before November 12, 2025 with the {{committee}}'s approval may remain until it's replaced.",
  appliesTo: ["fence-run"],
  appliesWhen: {
    type: "all",
    of: [
      { type: "compare", left: ref("fence-run.installed-on"), op: "<", right: { type: "date", value: "2025-11-12" } },
      { type: "approved", path: [], by: ["committee"], needs: "all", prior: false, written: false }
    ]
  },
  modality: "permission",
  bearer: ["owner"],
  overrides: {
    documents: ["guidelines"],
    provisions: [],
    adoptedAfter: { path: ["fence-run.installed-on"] },
    except: []
  },
  check: null,
  remedy: null
}

export const variance: NormDraft = {
  ...normBase,
  citations: cite("decision-2026-0142:1"),
  key: "decision-2026-0142:1#rear-height",
  kind: "norm",
  domain: "architectural",
  title: "Variance: 84-inch rear fence on Unit 42",
  statement: "The approved rear {{fence-run}} on {{lot}} 42 may be up to 84 inches tall.",
  appliesTo: ["fence-run"],
  scope: { lotId: "lot-42", subjectId: "improvement-0193" },
  authority: { provisionKey: "declaration:4.5", highlight: null, region: null },
  effectiveFrom: "2026-05-01",
  modality: "obligation",
  bearer: ["owner"],
  overrides: ["guidelines:5.5.1(i)#max-height"],
  check: { type: "test", test: { type: "compare", left: ref("fence-run.height"), op: "<=", right: inches(84) } },
  remedy: "change-detail"
}

export const noSolar: NormDraft = {
  ...normBase,
  citations: cite("guidelines:8.2"),
  key: "guidelines:8.2#no-solar",
  kind: "norm",
  domain: "architectural",
  title: "No solar panels",
  statement: "A {{lot}} must not have a {{solar-device}}.",
  appliesTo: ["solar-device"],
  modality: "prohibition",
  bearer: ["owner"],
  check: null,
  remedy: "redesign"
}

export const solarLaw: NormDraft = {
  ...normBase,
  citations: cite("property-code:202.010"),
  key: "property-code:202.010#solar",
  kind: "norm",
  domain: "architectural",
  title: "Solar devices can't be prohibited",
  statement:
    "An {{organization}} may not prohibit an {{owner}} from installing a {{solar-device}} on the owner's roof.",
  appliesTo: ["solar-device"],
  appliesWhen: { type: "compare", left: ref("solar-device.mounting"), op: "=", right: val("mounting.roof") },
  modality: "permission",
  bearer: ["owner"],
  overrides: ["guidelines:8.2#no-solar"],
  check: null,
  remedy: null
}

export const overnightParking: NormDraft = {
  ...normBase,
  citations: cite("rules:3.2"),
  key: "rules:3.2#commercial-overnight",
  kind: "norm",
  domain: "use",
  title: "No commercial vehicles on the street overnight",
  statement: "A commercial {{vehicle}} must not be parked on the street between 2:00 and 5:00 a.m.",
  requestTypes: ["violation"],
  appliesTo: ["parking"],
  appliesWhen: {
    type: "all",
    of: [
      {
        type: "compare",
        left: ref("parking.vehicle", "vehicle.class"),
        op: "=",
        right: val("vehicle-class.commercial")
      },
      { type: "compare", left: ref("parking.location"), op: "=", right: val("parking-location.street") }
    ]
  },
  modality: "obligation",
  bearer: ["occupant"],
  check: {
    type: "test",
    test: {
      type: "not",
      of: {
        type: "during",
        start: ref("parking.start"),
        end: ref("parking.end"),
        window: { type: "daily", from: "02:00", to: "05:00" },
        match: "overlaps"
      }
    }
  },
  remedy: null
}

export const trashContainers: NormDraft = {
  ...normBase,
  citations: cite("rules:5.1"),
  key: "rules:5.1#trash-out",
  kind: "norm",
  domain: "use",
  title: "Trash containers out only around pickup",
  statement:
    "A trash container may be at the curb only from 6:00 p.m. the day before pickup until 9:00 p.m. on pickup day.",
  requestTypes: ["violation"],
  appliesTo: ["curbside-placement"],
  modality: "obligation",
  bearer: ["occupant"],
  check: {
    type: "test",
    test: {
      type: "during",
      start: ref("curbside-placement.start"),
      end: ref("curbside-placement.end"),
      window: {
        type: "recurring",
        schedule: { type: "ref", from: "community", path: ["community.trash-pickup"] },
        from: { value: -1, unit: "calendar-day", at: "18:00" },
        to: { value: 0, unit: "calendar-day", at: "21:00" }
      },
      match: "within"
    }
  },
  remedy: null
}

export const petLimit: NormDraft = {
  ...normBase,
  citations: cite("declaration:8.4"),
  key: "declaration:8.4#pet-limit",
  kind: "norm",
  domain: "use",
  title: "At most three dogs and cats",
  statement: "A {{lot}} may have at most three dogs and cats in total.",
  requestTypes: ["violation"],
  appliesTo: ["lot"],
  modality: "obligation",
  bearer: ["owner"],
  check: {
    type: "test",
    test: {
      type: "compare",
      left: {
        type: "count",
        path: ["lot.pets"],
        where: { type: "in", left: ref("pet.species"), values: [val("species.dog"), val("species.cat")] }
      },
      op: "<=",
      right: { type: "number", value: 3 }
    }
  },
  remedy: null
}

export const minimumLease: NormDraft = {
  ...normBase,
  citations: cite("declaration:9.2"),
  key: "declaration:9.2#minimum-term",
  kind: "norm",
  domain: "use",
  title: "Leases at least 12 months",
  statement: "A lease must have a {{lease-registration.term}} of at least 12 months.",
  requestTypes: ["lease-registration"],
  appliesTo: ["lease-registration"],
  modality: "obligation",
  bearer: ["owner"],
  check: {
    type: "test",
    test: {
      type: "compare",
      left: ref("lease-registration.term"),
      op: ">=",
      right: { type: "quantity", value: 12, unit: "month" }
    }
  },
  remedy: null
}

export const rentalCap: NormDraft = {
  ...normBase,
  citations: cite("declaration:9.3"),
  key: "declaration:9.3#rental-cap",
  kind: "norm",
  domain: "use",
  title: "At most 20 percent of lots leased",
  statement: "No more than 20 percent of {{lot:plural}} may be leased at one time.",
  requestTypes: ["lease-registration"],
  appliesTo: ["lease-registration"],
  modality: "obligation",
  bearer: ["owner"],
  check: {
    type: "test",
    test: {
      type: "compare",
      left: {
        type: "quotient",
        of: [
          {
            type: "sum",
            of: [
              { type: "ref", from: "community", path: ["community.leased-lots"] },
              { type: "number", value: 1 }
            ]
          },
          { type: "ref", from: "community", path: ["community.lot-count"] }
        ]
      },
      op: "<=",
      right: { type: "fraction", numerator: 1, denominator: 5 }
    }
  },
  remedy: null
}

export const assessmentDue: NormDraft = {
  ...normBase,
  citations: cite("declaration:6.4"),
  key: "declaration:6.4#annual-due",
  kind: "norm",
  domain: "financial",
  title: "Annual assessment due January 1",
  statement: "Each {{owner}} must pay the annual {{assessment}} by January 1.",
  requestTypes: ["assessment"],
  appliesTo: ["assessment"],
  modality: "obligation",
  bearer: ["owner"],
  check: {
    type: "deadline",
    act: ref("assessment.paid-on"),
    anchor: ref("assessment.due-on"),
    earliest: null,
    latest: { value: 0, unit: "calendar-day", at: null },
    onMiss: []
  },
  remedy: null,
  cure: {
    value: 15,
    unit: "calendar-day",
    after: { path: ["assessment.due-on"] },
    curedBy: { path: ["assessment.paid-on"] }
  }
}

export const lateFee: SanctionDraft = {
  ...ruleBase,
  citations: cite("declaration:6.6"),
  key: "declaration:6.6#late-fee",
  kind: "sanction",
  domain: "financial",
  title: "Late fee after 15 days",
  statement:
    "If an {{assessment}} is unpaid 15 days after it's due, the {{organization}} charges the greater of $25 and 10 percent of the unpaid amount.",
  requestTypes: ["assessment"],
  appliesTo: ["assessment"],
  modality: "obligation",
  enforces: { rules: ["declaration:6.4#annual-due"], documents: [], except: [] },
  against: ["owner"],
  imposedBy: ["organization"],
  sanction: {
    type: "late-fee",
    amounts: [
      {
        type: "greatest",
        of: [
          usd(25),
          {
            type: "product",
            of: [{ type: "fraction", numerator: 1, denominator: 10 }, ref("assessment.unpaid-balance")]
          }
        ]
      }
    ],
    after: null,
    occurrences: null,
    repeats: null,
    cap: null,
    suspends: [],
    lasts: null
  }
}

export const fineSchedule: SanctionDraft = {
  ...ruleBase,
  citations: cite("rules:12.1"),
  key: "rules:12.1#fines",
  kind: "sanction",
  domain: "enforcement",
  title: "Fines for violations of the Rules",
  statement:
    "After notice, the time to cure, and a hearing if the owner asks for one, the {{board}} may fine $100 for a first violation, $200 for a second within 12 months, and $25 a day while a violation continues, up to $1,000.",
  requestTypes: ["violation"],
  appliesTo: ["violation"],
  modality: "permission",
  enforces: { rules: [], documents: ["rules"], except: [] },
  against: ["owner"],
  imposedBy: ["board"],
  sanction: {
    type: "fine",
    amounts: [usd(100), usd(200)],
    after: null,
    occurrences: { within: { value: 12, unit: "month" }, counts: "same-rule", per: "owner", includesCured: false },
    repeats: { every: { value: 1, unit: "calendar-day" }, amount: usd(25), from: null },
    cap: usd(1000),
    suspends: [],
    lasts: null
  }
}

export const fineLimit: LimitDraft = {
  ...ruleBase,
  citations: cite("property-code:209.006"),
  key: "property-code:209.006#fine-cap",
  kind: "limit",
  domain: "enforcement",
  title: "Fines capped at $500 per violation",
  statement: "Fines for one violation may not total more than $500.",
  requestTypes: ["violation"],
  appliesTo: ["violation"],
  limits: ["rules:12.1#fines"],
  forbids: false,
  maxAmount: null,
  maxTotal: usd(500)
}

export const maintainLandscaping: NormDraft = {
  ...normBase,
  citations: cite("declaration:7.1"),
  key: "declaration:7.1#landscaping",
  kind: "norm",
  domain: "maintenance",
  title: "Keep landscaping maintained",
  statement: "Each {{owner}} must keep the {{lot}}'s landscaping neat, trimmed and free of weeds.",
  requestTypes: ["violation"],
  appliesTo: ["lot"],
  modality: "obligation",
  bearer: ["owner"],
  decidedBy: ["board"],
  check: {
    type: "judgment",
    question: "Is the lot's landscaping neat, trimmed and free of weeds?",
    evidence: ["photo", "inspection-report"]
  },
  remedy: null,
  cure: {
    value: 15,
    unit: "calendar-day",
    after: { from: "request", path: ["violation.notice-delivered-on"] },
    curedBy: { from: "request", path: ["violation.cured-on"] }
  }
}

export const selfHelp: SanctionDraft = {
  ...ruleBase,
  citations: cite("declaration:7.3"),
  key: "declaration:7.3#self-help",
  kind: "sanction",
  domain: "enforcement",
  title: "Organization may maintain and charge the owner",
  statement:
    "If an {{owner}} doesn't cure a maintenance violation in time, the {{organization}} may do the work and charge its cost to the {{owner}}.",
  requestTypes: ["violation"],
  appliesTo: ["violation"],
  appliesWhen: { type: "exists", from: "request", path: ["violation.notice-delivered-on"] },
  modality: "permission",
  enforces: { rules: ["declaration:7.1#landscaping"], documents: [], except: [] },
  against: ["owner"],
  imposedBy: ["organization"],
  sanction: {
    type: "self-help",
    amounts: [req("violation.cost-of-work")],
    after: null,
    occurrences: null,
    repeats: null,
    cap: null,
    suspends: [],
    lasts: null
  }
}

export const meetingNotice: NormDraft = {
  ...normBase,
  citations: cite("bylaws:3.4"),
  key: "bylaws:3.4#notice",
  kind: "norm",
  domain: "governance",
  title: "Meeting notice 10 to 60 days ahead",
  statement: "The {{board}} must send notice of a members' {{meeting}} at least 10 and no more than 60 days before it.",
  requestTypes: ["meeting"],
  appliesTo: ["meeting"],
  modality: "obligation",
  bearer: ["board"],
  beneficiary: "members",
  check: {
    type: "deadline",
    act: req("meeting.notice-sent-on"),
    anchor: req("meeting.starts-at"),
    earliest: { value: -60, unit: "calendar-day", at: null },
    latest: { value: -10, unit: "calendar-day", at: null },
    onMiss: []
  },
  remedy: null
}

export const quorum: NormDraft = {
  ...normBase,
  citations: cite("bylaws:3.7"),
  key: "bylaws:3.7#quorum",
  kind: "norm",
  domain: "governance",
  title: "Quorum is 10 percent of the votes",
  statement:
    "A members' {{meeting}} needs members holding at least 10 percent of the total votes present, in person or by proxy.",
  requestTypes: ["meeting"],
  appliesTo: ["meeting"],
  modality: "requirement",
  bearer: [],
  check: {
    type: "test",
    test: {
      type: "compare",
      left: {
        type: "quotient",
        of: [
          req("meeting.voting-power-present"),
          { type: "ref", from: "community", path: ["community.total-voting-power"] }
        ]
      },
      op: ">=",
      right: { type: "fraction", numerator: 1, denominator: 10 }
    }
  },
  remedy: null
}

export const amendmentVote: NormDraft = {
  ...normBase,
  citations: cite("declaration:14.2"),
  key: "declaration:14.2#amendment-vote",
  kind: "norm",
  domain: "governance",
  title: "Declaration amendments need 67 percent of all votes",
  statement:
    "An amendment to the Declaration needs the approval of {{owner:plural}} holding at least 67 percent of the total votes, not just of the votes cast.",
  requestTypes: ["meeting"],
  appliesTo: ["vote"],
  appliesWhen: {
    type: "compare",
    left: ref("vote.subject"),
    op: "=",
    right: val("vote-subject.declaration-amendment")
  },
  modality: "requirement",
  bearer: [],
  check: {
    type: "test",
    test: {
      type: "compare",
      left: {
        type: "quotient",
        of: [ref("vote.in-favor"), { type: "ref", from: "community", path: ["community.total-voting-power"] }]
      },
      op: ">=",
      right: { type: "fraction", numerator: 67, denominator: 100 }
    }
  },
  remedy: null
}

export const recordsRequest: NormDraft = {
  ...normBase,
  citations: cite("property-code:209.005"),
  key: "property-code:209.005#records-response",
  kind: "norm",
  domain: "governance",
  title: "Records produced within 10 business days",
  statement: "The {{organization}} must produce requested records within 10 business days after a written request.",
  requestTypes: ["records-request"],
  appliesTo: ["records-request"],
  modality: "obligation",
  bearer: ["organization"],
  beneficiary: "owner",
  check: {
    type: "deadline",
    act: req("records-request.produced-on"),
    anchor: req("records-request.received-on"),
    earliest: null,
    latest: { value: 10, unit: "business-day", at: null },
    onMiss: []
  },
  remedy: null
}

export const candidateOwnership: NormDraft = {
  ...normBase,
  citations: cite("bylaws:4.1"),
  key: "bylaws:4.1#candidate-ownership",
  kind: "norm",
  domain: "governance",
  title: "Board candidates own a lot for 12 months",
  statement: "A {{board}} candidate must have owned a {{lot}} for at least 12 months when the {{nomination}} is filed.",
  requestTypes: ["nomination"],
  appliesTo: ["nomination"],
  modality: "requirement",
  bearer: [],
  check: {
    type: "test",
    test: {
      type: "compare",
      left: { type: "shift", of: ref("nomination.ownership-start"), by: { value: 12, unit: "month" } },
      op: "<=",
      right: { type: "governing-date" }
    }
  },
  remedy: null
}

export const priorApproval: NormDraft = {
  ...normBase,
  citations: cite("declaration:4.1"),
  key: "declaration:4.1#prior-approval",
  kind: "norm",
  domain: "architectural",
  title: "Work needs the committee's prior written approval",
  statement: "No {{work}} may start on a {{lot}} without the {{committee}}'s prior written approval.",
  appliesTo: ["work"],
  modality: "obligation",
  bearer: ["owner"],
  check: { type: "approval", by: ["committee"], needs: "all", prior: true, written: true },
  remedy: "redesign"
}

export const eitherApproval: NormDraft = {
  ...normBase,
  citations: cite("rules:4"),
  requestTypes: ["violation"],
  key: "rules:4#vehicle-storage",
  kind: "norm",
  domain: "use",
  title: "Vehicles stored outside a garage need the board's or the committee's approval",
  statement:
    "A {{vehicle}} may be stored outside a garage only with the {{board}}'s or the {{committee}}'s written approval.",
  appliesTo: ["vehicle"],
  modality: "obligation",
  bearer: ["owner"],
  check: { type: "approval", by: ["board", "committee"], needs: "any", prior: false, written: true },
  remedy: null
}

export const annualMeeting: NormDraft = {
  ...normBase,
  citations: cite("bylaws:3.2"),
  key: "bylaws:3.2#annual-meeting",
  kind: "norm",
  domain: "governance",
  title: "An annual meeting each year",
  statement: "The {{board}} must hold an annual meeting of the {{members}} each year.",
  requestTypes: ["compliance-period"],
  appliesTo: ["compliance-period"],
  modality: "obligation",
  bearer: ["board"],
  recurs: { type: "ref", from: "community", path: ["community.annual-meeting"] },
  check: {
    type: "deadline",
    act: req("compliance-period.completed-on"),
    anchor: req("compliance-period.scheduled-on"),
    earliest: null,
    latest: { value: 1, unit: "year", at: null },
    onMiss: []
  },
  remedy: null
}

export const exampleRules: RuleDraft[] = [
  compositeColors,
  manufacturers,
  otherManufacturers,
  maxHeight,
  maxHeightAll,
  fenceAndLattice,
  metalHeight,
  metalVariations,
  frontSetback,
  neighborApproval,
  sightLines,
  gateColor,
  committeeResponse,
  grandfathered,
  variance,
  noSolar,
  solarLaw,
  overnightParking,
  trashContainers,
  petLimit,
  minimumLease,
  rentalCap,
  assessmentDue,
  lateFee,
  fineSchedule,
  fineLimit,
  maintainLandscaping,
  selfHelp,
  meetingNotice,
  quorum,
  amendmentVote,
  recordsRequest,
  candidateOwnership,
  priorApproval,
  eitherApproval,
  annualMeeting
]

// ─── Settings, a question, and an evaluation ──────────────────────────────────────────────────────

export const settings: Omit<Settings, "review" | "issues"> = {
  clauses: {
    precedence: {
      order: [
        ["federal-law"],
        ["state-law"],
        ["county-ordinance", "city-ordinance"],
        ["declaration", "supplemental-declaration", "plat"],
        ["articles"],
        ["bylaws"],
        ["rules", "policy", "resolution", "design-guidelines"],
        ["minutes"]
      ],
      citations: []
    },
    time: { days: "calendar-day", rollForward: true, holidays: "us-federal", zone: "America/Chicago", citations: [] },
    liability: [
      { actor: "tenant", liable: "owner", appliesWhen: null, until: null, except: [], citations: [] },
      { actor: "guest", liable: "owner", appliesWhen: null, until: null, except: [], citations: [] }
    ],
    cure: {
      value: 10,
      unit: "calendar-day",
      after: { from: "request", path: ["violation.notice-delivered-on"] },
      curedBy: { from: "request", path: ["violation.cured-on"] },
      citations: []
    },
    deciders: [{ requestType: "architectural-application", party: "committee", citations: [] }],
    sanctionPreconditions: [
      {
        requestTypes: ["violation"],
        except: ["declaration:7.3#self-help"],
        condition: {
          type: "all",
          of: [
            { type: "exists", from: "request", path: ["violation.notice-delivered-on"] },
            {
              type: "any",
              of: [
                { type: "exists", from: "request", path: ["violation.hearing-held-on"] },
                { type: "not", of: { type: "exists", from: "request", path: ["violation.hearing-requested-on"] } }
              ]
            }
          ]
        },
        citations: []
      }
    ]
  },
  policy: {
    decisionPolicy: { "change-detail": "approve-with-conditions", redesign: "deny", none: "deny" },
    thresholds: { factConfidence: 0.8, judgmentConfidence: 0.8 }
  }
}

export const interpretation: QuestionDraft = {
  kind: "interpretation",
  question: "Does the 72-inch limit in 5.5.1(i) apply to front fences, or only to boundary and return fences?",
  citations: [],
  about: { rules: ["guidelines:5.5.1(i)#max-height", "guidelines:5.5.1(i)#max-height-all"], terms: [] },
  options: [
    { label: "Only boundary and return fences", keeps: ["guidelines:5.5.1(i)#max-height"] },
    { label: "Every wood or composite fence", keeps: ["guidelines:5.5.1(i)#max-height-all"] }
  ],
  answer: null
}

const extracted = { by: "extraction" as const, at: "2026-02-03T15:00:00Z" }
const fact = (
  entity: string,
  property: string,
  term: string | null,
  text: string,
  quote: string,
  page: number
): EvaluationRequest["facts"][number] => ({
  entity,
  property,
  state: "known",
  value: { type: "value", term, text },
  candidates: [],
  complete: null,
  stated: text,
  evidence: [{ fileId: "file-1", page, quote, region: null }],
  confidence: 0.95,
  provenance: extracted
})

export const request: Omit<EvaluationRequest, "organizationId"> = {
  type: "architectural-application",
  governingDate: "2026-02-03",
  evaluationDate: "2026-02-03",
  lot: "lot",
  entities: [
    { id: "request", type: "architectural-application", label: "Fence application", ref: "app-0311" },
    { id: "lot", type: "lot", label: "Unit 42", ref: "lot-42" },
    { id: "run-1", type: "fence-run", label: "Rear run", ref: null },
    { id: "run-2", type: "fence-run", label: "Side run", ref: null }
  ],
  facts: [
    fact(
      "run-1",
      "fence-run.material",
      "fence-material.composite",
      "composite",
      "Trex Transcend composite, River Birch",
      3
    ),
    fact(
      "run-1",
      "fence-run.manufacturer",
      "composite-manufacturer.trex",
      "Trex",
      "Trex Transcend composite, River Birch",
      3
    ),
    fact(
      "run-1",
      "fence-run.color",
      "composite-color.river-birch",
      "River Birch",
      "Trex Transcend composite, River Birch",
      3
    ),
    fact("run-1", "fence-run.location", "fence-location.rear", "rear", "rear property line", 2),
    fact("run-2", "fence-run.material", "fence-material.composite", "composite", "Fiberon Horizon composite", 4),
    fact("run-2", "fence-run.manufacturer", null, "Fiberon", "Fiberon Horizon composite", 4)
  ],
  documents: []
}

const findingBase = {
  modifiedBy: [],
  judgment: null,
  statements: [],
  effects: [],
  sanction: null,
  asOf: "2026-02-03",
  evaluatedAt: "2026-02-03T15:01:00Z"
}

export const findings: Finding[] = [
  {
    ...findingBase,
    ruleKey: "guidelines:5.4.2(i)#colors",
    entity: "run-1",
    outcome: "not-met",
    remedy: "change-detail",
    reason: "River Birch is a Frame It All color; Trex offers Winchester Grey or Saddle.",
    inputs: [
      { entity: "run-1", property: "fence-run.material", state: "known" },
      { entity: "run-1", property: "fence-run.manufacturer", state: "known" },
      { entity: "run-1", property: "fence-run.color", state: "known" }
    ]
  },
  {
    ...findingBase,
    ruleKey: "guidelines:5.4.2(i)#colors",
    entity: "run-2",
    outcome: "committee",
    remedy: null,
    reason: "Fiberon isn't a listed manufacturer; the committee considers other manufacturers case by case.",
    inputs: [
      { entity: "run-2", property: "fence-run.material", state: "known" },
      { entity: "run-2", property: "fence-run.manufacturer", state: "known" },
      { entity: "run-2", property: "fence-run.color", state: "unknown" }
    ],
    modifiedBy: [{ ruleKey: "guidelines:5.3.2#other-manufacturers", effect: "decided-by" }]
  },
  {
    ...findingBase,
    ruleKey: "guidelines:5.5.1(i)#max-height",
    entity: "run-1",
    outcome: "missing-information",
    remedy: "provide-information",
    reason: "The application doesn't say whether the rear run is on a boundary, or how tall it is.",
    inputs: [
      { entity: "run-1", property: "fence-run.material", state: "known" },
      { entity: "run-1", property: "fence-run.boundary-with", state: "unknown" },
      { entity: "run-1", property: "fence-run.location", state: "known" },
      { entity: "run-1", property: "fence-run.height", state: "unknown" }
    ]
  }
]
