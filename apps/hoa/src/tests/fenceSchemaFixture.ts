import type { Answers, DocumentReview } from "@/engine/context"
import { storedRule, storedTerm } from "@/schema/exampleRulebook.test-data"
import * as ex from "@/schema/examples.test-data"
import type * as T from "@/schema/types"
import { type RuleDraft, rulesFile, type TermDraft } from "@/schema/zod"
import { sampleDeclarationRulesFile } from "./sampleRulesFile"

// The sample fence application as rules and facts (application-review.md, Expected result for the sample application;
// implementation-plan.md, 2.13): the Design Guidelines' fence rules from the schema examples, completed where the
// examples are partial, with the sample Declaration's Article 4 rules, terms and settings; the five fence entities
// plus the work, the request, the lot and its owners; and the facts and documents of the expected result. It holds
// no packet text, and the guidelines' provisions carry short summaries rather than the document's wording.

type NormDraft = Extract<RuleDraft, { kind: "norm" }>
type DiscretionDraft = Extract<RuleDraft, { kind: "discretion" }>

const SAMPLE = "org-sample"
const system = { by: "system" as const, at: "2026-10-09T00:00:00Z" }
const proposed: T.Review = { status: "proposed", by: null, at: null, note: null }

// ─── Terms ────────────────────────────────────────────────────────────────────────────────────────

const ref = (...path: string[]): T.Operand => ({ type: "ref", path })
const val = (term: string): T.Operand => ({ type: "value", term })
const inches = (value: number): T.Operand => ({ type: "quantity", value, unit: "inch" })
const cite = (...keys: string[]): T.Citation[] =>
  keys.map((provisionKey) => ({ provisionKey, highlight: null, region: null }))
const label = (text: string) => [{ text, role: "preferred" as const }]

const thing = (key: string, nature: "object" | "document", text: string): TermDraft => ({
  key,
  organizationId: SAMPLE,
  kind: "thing",
  nature,
  labels: label(text)
})
const property = (
  key: string,
  valueType: T.ValueType,
  text: string,
  ifUnstated: "unknown" | "absent" = "unknown"
): TermDraft => ({
  key,
  organizationId: SAMPLE,
  kind: "property",
  of: key.slice(0, key.lastIndexOf(".")),
  valueType,
  ifUnstated,
  labels: label(text)
})
const valueSet = (key: string, text: string, complete: boolean): TermDraft => ({
  key,
  organizationId: SAMPLE,
  kind: "value-set",
  complete,
  labels: label(text)
})
const value = (key: string, text: string): TermDraft => ({
  key,
  organizationId: SAMPLE,
  kind: "value",
  set: key.slice(0, key.lastIndexOf(".")),
  labels: label(text)
})
const choice = (set: string): T.ValueType => ({ type: "choice", set })
const height: T.ValueType = { type: "quantity", unit: "inch" }
const yesNo: T.ValueType = { type: "boolean" }

// The examples' fence vocabulary; the sample's own lot, committee and photo terms stand.
const fromExamples = new Set(["lot", "committee", "photo"])
const exampleTerms = ex.organizationTerms.filter(
  (term) =>
    !fromExamples.has(term.key) &&
    /^(fence|gate|return-fence|boundary|neighbor|composite|site-plan)/.test(term.key) &&
    term.key !== "fence-run.installed-on"
)

const completedTerms: TermDraft[] = [
  value("fence-location.side", "side"),
  value("boundary.open-space", "open space tract"),
  value("boundary.golf-course", "golf course"),
  value("fence-material.vinyl", "vinyl"),
  property("fence-run.board-orientation", choice("board-orientation"), "board orientation"),
  valueSet("board-orientation", "board orientation", true),
  value("board-orientation.vertical", "vertical"),
  value("board-orientation.horizontal", "horizontal"),
  property("fence-run.style", choice("fence-style"), "style"),
  valueSet("fence-style", "fence style", false),
  value("fence-style.k-style", "K style"),
  property("fence-run.post-color", choice("composite-color"), "post color"),
  property("fence-run.open-view", yesNo, "open metal view"),
  property("fence-run.finish", choice("wood-finish"), "finish"),
  valueSet("wood-finish", "wood finish", true),
  value("wood-finish.solid-stain", "solid stain"),
  value("wood-finish.semi-transparent-stain", "semi-transparent stain"),
  value("wood-finish.transparent-stain", "transparent stain"),
  property("fence-run.arbor-height", height, "arbor height", "absent"),
  property("gate.material", choice("fence-material"), "gate material"),
  property("gate.board-orientation", choice("board-orientation"), "gate board orientation"),
  property("gate.height", height, "gate height"),
  property("gate.arbor-height", height, "gate arbor height", "absent"),
  property("gate.new-opening", yesNo, "new opening in a fence", "absent"),
  thing("application-form", "document", "application form"),
  thing("project-description", "document", "project description"),
  thing("checklist", "document", "application checklist"),
  thing("product-specification", "document", "product specification"),
  // The category of work the guidelines' encoding adds for its fence chapter (encoding.md: one per improvement
  // chapter), which the rulebook offers as an application type.
  {
    key: "fence-work",
    organizationId: SAMPLE,
    kind: "category",
    of: "work",
    criteria: { type: "text", text: "Work that builds, replaces or changes a fence or a gate" },
    labels: label("fence"),
    definition: "building, replacing or changing a fence or a gate",
    citations: cite("guidelines:5")
  },
  {
    key: "plot-plan",
    organizationId: SAMPLE,
    kind: "category",
    of: "plans",
    criteria: { type: "text", text: "a drawing of the Unit showing its boundaries and where the proposed Work goes" },
    labels: label("plot plan")
  }
]

// What the guidelines say a term means, where the examples leave it bare: definitions and scope notes the review's
// models read with the term, each cited to the provision that supports it. Organization knowledge lives here, in the
// rulebook's terms, never in prompts or code.
const refinements: Record<string, Pick<TermDraft, "definition" | "scopeNote" | "citations">> = {
  "fence-location.side": {
    definition: "on or along a side yard boundary of the Unit",
    citations: cite("guidelines:5.5.1(i)")
  },
  "fence-location.return": {
    definition: "running from a side yard boundary to the house, along no boundary line",
    citations: cite("guidelines:5.5.1(i)")
  },
  "fence-run.boundary-with": {
    definition:
      "what lies across the boundary line the fence is on or along: a neighboring Unit or adjacent Common Area",
    scopeNote:
      "A fence that is on or along no boundary line, such as a return fence from a side yard boundary to the house, has none.",
    citations: cite("guidelines:5.6.1", "guidelines:5.5.1(i)")
  },
  "boundary.lot": {
    definition: "a neighboring Unit, across the boundary line that separates the two Units",
    citations: cite("guidelines:5.6.1")
  },
  "fence-run.manufacturer": {
    definition: "the manufacturer of a composite fence's material",
    scopeNote: "Every manufacturer the guidelines list makes composite fencing.",
    citations: cite("guidelines:5.3.2")
  },
  "composite-manufacturer": {
    definition: "a manufacturer of composite fencing",
    citations: cite("guidelines:5.3.2")
  }
}
const refined = (term: TermDraft): TermDraft => ({ ...term, ...refinements[term.key] })

// ─── Rules ────────────────────────────────────────────────────────────────────────────────────────

const fenceBase = {
  requestTypes: ["architectural-application", "violation"],
  effectiveFrom: "2025-11-12",
  kind: "norm" as const,
  domain: "architectural" as const,
  modality: "obligation" as const,
  bearer: ["owner"],
  appliesTo: ["fence-run"]
}
const material = (...materials: string[]): T.Condition =>
  materials.length === 1
    ? { type: "compare", left: ref("fence-run.material"), op: "=", right: val(`fence-material.${materials[0]}`) }
    : { type: "in", left: ref("fence-run.material"), values: materials.map((name) => val(`fence-material.${name}`)) }
const gateFence = (...materials: string[]): T.Condition => ({
  type: "in",
  left: ref("gate.fence-run", "fence-run.material"),
  values: materials.map((name) => val(`fence-material.${name}`))
})
const atMost = (left: T.Operand, limit: number): T.Check => ({
  type: "test",
  test: { type: "compare", left, op: "<=", right: inches(limit) }
})
const hasLattice: T.Condition = { type: "exists", path: ["fence-run.lattice-height"] }

const guidelineRules: (NormDraft | DiscretionDraft)[] = [
  {
    ...fenceBase,
    key: "guidelines:5.3#materials",
    citations: cite("guidelines:5.3"),
    title: "Wood, composite or open metal fences only",
    statement: "A {{fence-run}} must be wood, composite or open metal view fencing.",
    check: { type: "test", test: material("wood", "composite", "metal") },
    remedy: "redesign"
  },
  {
    ...fenceBase,
    key: "guidelines:5.3#no-vinyl",
    citations: cite("guidelines:5.3"),
    title: "No vinyl fences",
    statement: "A vinyl {{fence-run}} isn't permitted.",
    modality: "prohibition",
    appliesWhen: material("vinyl"),
    remedy: "redesign"
  },
  {
    ...fenceBase,
    key: "guidelines:5.3#open-metal",
    citations: cite("guidelines:5.3", "guidelines:5.2.3"),
    title: "Metal fences are open view",
    statement: "A metal {{fence-run}} must be open metal view fencing.",
    appliesWhen: material("metal"),
    check: {
      type: "test",
      test: { type: "compare", left: ref("fence-run.open-view"), op: "=", right: { type: "boolean", value: true } }
    },
    remedy: "redesign"
  },
  {
    ...fenceBase,
    key: "guidelines:5.2.5#no-horizontal",
    citations: cite("guidelines:5.2.5", "guidelines:5.2.1"),
    title: "No horizontal boards",
    statement: "A {{fence-run}} with horizontal boards isn't permitted.",
    modality: "prohibition",
    appliesWhen: {
      type: "compare",
      left: ref("fence-run.board-orientation"),
      op: "=",
      right: val("board-orientation.horizontal")
    },
    remedy: "change-detail"
  },
  {
    ...fenceBase,
    key: "guidelines:5.2.2#k-style",
    citations: cite("guidelines:5.2.2"),
    title: "Composite fences in K style",
    statement: "A composite {{fence-run}} should be K style.",
    modality: "recommendation",
    appliesWhen: material("composite"),
    check: {
      type: "test",
      test: { type: "compare", left: ref("fence-run.style"), op: "=", right: val("fence-style.k-style") }
    },
    remedy: "change-detail"
  },
  {
    ...fenceBase,
    key: "guidelines:5.2.2#other-styles",
    citations: cite("guidelines:5.2.2"),
    title: "Other composite styles case by case",
    statement: "The {{committee}} may consider other styles of composite {{fence-run}} case by case.",
    kind: "discretion",
    appliesWhen: material("composite"),
    decidedBy: ["committee"],
    overrides: ["guidelines:5.2.2#k-style"]
  },
  {
    ...fenceBase,
    key: "guidelines:5.4.1(i)#stained",
    citations: cite("guidelines:5.4.1(i)", "guidelines:5.4.1(ii)"),
    title: "Wood fences stained, solid or semi-transparent",
    statement: "A wood {{fence-run}} must have a solid or semi-transparent stain {{fence-run.finish}}.",
    appliesWhen: material("wood"),
    check: {
      type: "test",
      test: {
        type: "in",
        left: ref("fence-run.finish"),
        values: [val("wood-finish.solid-stain"), val("wood-finish.semi-transparent-stain")]
      }
    },
    remedy: "change-detail"
  },
  {
    ...fenceBase,
    key: "guidelines:5.4.2(iii)#gate-material",
    citations: cite("guidelines:5.4.2(iii)"),
    title: "Gates match a composite fence's material",
    statement: "A {{gate}} in a composite {{fence-run}} must match the fence's {{fence-run.material}}.",
    appliesTo: ["gate"],
    appliesWhen: gateFence("composite"),
    check: {
      type: "test",
      test: { type: "compare", left: ref("gate.material"), op: "=", right: ref("gate.fence-run", "fence-run.material") }
    },
    remedy: "change-detail"
  },
  {
    ...fenceBase,
    key: "guidelines:5.4.2(iv)#posts",
    citations: cite("guidelines:5.4.2(iv)"),
    title: "Posts match a composite fence's color",
    statement: "A composite {{fence-run}}'s {{fence-run.post-color}} must match its {{fence-run.color}}.",
    appliesWhen: material("composite"),
    check: {
      type: "test",
      test: { type: "compare", left: ref("fence-run.post-color"), op: "=", right: ref("fence-run.color") }
    },
    remedy: "change-detail"
  },
  {
    ...fenceBase,
    key: "guidelines:5.5.1(i)#min-height",
    citations: cite("guidelines:5.5.1(i)"),
    title: "Fences at least 40 inches",
    statement: "A wood or composite {{fence-run}} must have a {{fence-run.height}} of at least 40 inches.",
    appliesWhen: material("wood", "composite"),
    check: { type: "test", test: { type: "compare", left: ref("fence-run.height"), op: ">=", right: inches(40) } },
    remedy: "change-detail"
  },
  {
    ...fenceBase,
    key: "guidelines:5.5.1(ii)#lattice-height",
    citations: cite("guidelines:5.5.1(ii)"),
    title: "Lattice at most 18 inches",
    statement: "A {{fence-run}}'s {{fence-run.lattice-height}} must be at most 18 inches.",
    appliesWhen: hasLattice,
    check: atMost(ref("fence-run.lattice-height"), 18),
    remedy: "change-detail"
  },
  {
    ...fenceBase,
    key: "guidelines:5.5.1(iii)#arbor-total",
    citations: cite("guidelines:5.5.1(iii)"),
    title: "Fence, lattice and arbor at most 96 inches",
    statement:
      "A {{fence-run}} with an arbor must have a {{fence-run.height}}, {{fence-run.lattice-height}} and {{fence-run.arbor-height}} totaling at most 96 inches.",
    appliesWhen: { type: "exists", path: ["fence-run.arbor-height"] },
    check: atMost(
      { type: "sum", of: [ref("fence-run.height"), ref("fence-run.lattice-height"), ref("fence-run.arbor-height")] },
      96
    ),
    remedy: "change-detail"
  },
  {
    ...fenceBase,
    key: "guidelines:5.7.1#golf-course",
    citations: cite("guidelines:5.7.1"),
    title: "Open metal view fences on the golf course",
    statement: "A {{fence-run}} on a boundary with the golf course must be an open metal view fence.",
    appliesWhen: {
      type: "compare",
      left: ref("fence-run.boundary-with"),
      op: "=",
      right: val("boundary.golf-course")
    },
    check: {
      type: "test",
      test: {
        type: "all",
        of: [
          material("metal"),
          { type: "compare", left: ref("fence-run.open-view"), op: "=", right: { type: "boolean", value: true } }
        ]
      }
    },
    remedy: "redesign"
  },
  {
    ...fenceBase,
    key: "guidelines:5.9.1#gate-boards",
    citations: cite("guidelines:5.9.1"),
    title: "Gate boards coordinate with the fence",
    statement: "A {{gate}} on a wood or composite {{fence-run}} must have boards oriented like the fence's.",
    appliesTo: ["gate"],
    appliesWhen: gateFence("wood", "composite"),
    check: {
      type: "test",
      test: {
        type: "compare",
        left: ref("gate.board-orientation"),
        op: "=",
        right: ref("gate.fence-run", "fence-run.board-orientation")
      }
    },
    remedy: "change-detail"
  },
  {
    ...fenceBase,
    key: "guidelines:5.9.2#gate-height",
    citations: cite("guidelines:5.9.2"),
    title: "Gates without an arbor at most 90 inches",
    statement: "A wood or composite {{gate}} without an arbor must have a {{gate.height}} of at most 90 inches.",
    appliesTo: ["gate"],
    appliesWhen: {
      type: "all",
      of: [gateFence("wood", "composite"), { type: "not", of: { type: "exists", path: ["gate.arbor-height"] } }]
    },
    check: atMost(ref("gate.height"), 90),
    remedy: "change-detail"
  },
  {
    ...fenceBase,
    key: "guidelines:5.9.2#gate-height-arbor",
    citations: cite("guidelines:5.9.2"),
    title: "Gates with an arbor at most 96 inches",
    statement: "A wood or composite {{gate}} with an arbor must total at most 96 inches.",
    appliesTo: ["gate"],
    appliesWhen: { type: "all", of: [gateFence("wood", "composite"), { type: "exists", path: ["gate.arbor-height"] }] },
    check: atMost({ type: "sum", of: [ref("gate.height"), ref("gate.arbor-height")] }, 96),
    remedy: "change-detail"
  },
  {
    ...fenceBase,
    key: "guidelines:5.9.5#no-common-area-gates",
    citations: cite("guidelines:5.9.5"),
    title: "No new gates in fences on the Common Area",
    statement: "An {{owner}} must not alter a fence between a {{lot}} and the Common Area to install a {{gate}}.",
    appliesTo: ["gate"],
    modality: "prohibition",
    appliesWhen: {
      type: "all",
      of: [
        { type: "compare", left: ref("gate.new-opening"), op: "=", right: { type: "boolean", value: true } },
        {
          type: "compare",
          left: ref("gate.fence-run", "fence-run.boundary-with"),
          op: "=",
          right: val("boundary.open-space")
        }
      ]
    },
    remedy: "redesign"
  }
]

// 5.5.1(ii) speaks of a fence's lattice component, so the examples' fence-plus-lattice limit applies to runs with one.
const exampleRules: (NormDraft | DiscretionDraft)[] = [
  ex.compositeColors,
  ex.manufacturers,
  ex.otherManufacturers,
  ex.maxHeight,
  { ...ex.fenceAndLattice, appliesWhen: hasLattice },
  ex.metalHeight,
  ex.metalVariations,
  ex.frontSetback,
  ex.neighborApproval,
  ex.sightLines,
  ex.gateColor
]

// What the application packet must hold: a completed application before review (3.1.5), from the packet the
// guidelines publish (3.4.1), with photos recommended (3.4.2).
const packet = (aspect: string, title: string, check: T.Check, extra: Partial<NormDraft> = {}): NormDraft => ({
  key: `guidelines:3.1.5#${aspect}`,
  kind: "norm",
  domain: "architectural",
  title,
  statement: `An {{architectural-application}} must include ${title.toLowerCase()}.`,
  citations: cite("guidelines:3.1.5", "guidelines:3.4.1"),
  requestTypes: ["architectural-application"],
  appliesTo: ["architectural-application"],
  effectiveFrom: "2025-11-12",
  modality: "obligation",
  bearer: ["applicant"],
  check,
  remedy: "change-detail",
  ...extra
})
const documentCheck = (document: string, signedBy: string[] = []): T.Check => ({
  type: "document",
  document,
  per: "request",
  mustState: [],
  signedBy
})

const packetRules: NormDraft[] = [
  packet("application-form", "An application form", documentCheck("application-form")),
  packet("owner-signatures", "Every owner's signature", documentCheck("application-form", ["owner"])),
  packet("project-description", "A project description", documentCheck("project-description")),
  packet("plot-plan", "A plot plan", documentCheck("plot-plan")),
  packet("product-specification", "A product specification", documentCheck("product-specification")),
  packet("checklist", "A checklist signed by every owner", documentCheck("checklist", ["owner"])),
  packet("photos", "Photos", documentCheck("photo"), {
    key: "guidelines:3.4.2#photos",
    citations: cite("guidelines:3.4.2"),
    statement: "An {{architectural-application}} should include photos.",
    modality: "recommendation"
  })
]

// ─── Provisions ───────────────────────────────────────────────────────────────────────────────────

// Short summaries standing in for the guidelines' text, which isn't committed yet (implementation-plan.md, 8.11).
const guidelineSummaries: Record<string, string> = {
  "3.1.5": "Applications are reviewed within 30 days of receipt and must be complete before review.",
  "3.4.1": "The current Design Review Committee application packet is available from the Association.",
  "3.4.2": "Owners are responsible for the accuracy of their plans; photos are recommended.",
  "5": "Fences: their design, materials, colors, heights, placement and gates.",
  "5.2.1": "Wood fences and gates have vertical boards; horizontal boards aren't permitted.",
  "5.2.2": "Composite fences should be K style; other styles are considered case by case.",
  "5.2.3": "Metal fences and gates are 2-rail or 3-rail open metal view fencing.",
  "5.2.5": "Horizontal style fences aren't permitted.",
  "5.3": "Only wood, composite and open metal view fencing; no other materials, including vinyl.",
  "5.3.2": "Composite fences from Trex, Frame It All or Neoline; others case by case.",
  "5.4.1(i)": "Wood fences are stained.",
  "5.4.1(ii)": "Wood fence stains are solid or semi-transparent.",
  "5.4.2(i)": ex.provision542.text,
  "5.4.2(iii)": "Lattice, arbors and gates on a composite fence match its material and color.",
  "5.4.2(iv)": "Fence posts match the fence color.",
  "5.5.1(i)": "Boundary and return fences at most 72 inches; any fence at least 40 inches.",
  "5.5.1(ii)": "Lattice at most 18 inches, and fence plus lattice at most 90 inches.",
  "5.5.1(iii)": "Fence, lattice and arbor together at most 96 inches.",
  "5.5.2": "Metal boundary fences between 4 and 6 feet; the Reviewer may consider variations.",
  "5.6.1":
    "Boundary fences go on, or along and within, the boundary line between neighboring Units or a Unit and Common Area.",
  "5.6.1(i)": "Boundary fences between Units need the neighboring owner's approval in the packet.",
  "5.6.2(i)": "Front yard fences must not block a driver's view of the roadway.",
  "5.6.2(ii)": "Front and return fences should be at least 5 feet behind the house's front corner.",
  "5.7.1": "Fences on the golf course boundary are open metal view fences.",
  "5.9.1": "Gates on wood and composite fences coordinate with the adjacent fence.",
  "5.9.2": "Wood or composite gates at most 90 inches, or 96 with an arbor.",
  "5.9.5": "Fences between Units and Common Areas aren't altered to install a gate."
}

const guidelineProvision = (provisionLabel: string, text: string): T.Provision => ({
  key: `guidelines:${provisionLabel}`,
  kind: provisionLabel.includes("(") ? "point" : "section",
  num: null,
  label: provisionLabel,
  heading: null,
  parentLabel: null,
  intro: null,
  text,
  wrapUp: null,
  anchors: [],
  noRule: null
})

// ─── The rules file ───────────────────────────────────────────────────────────────────────────────

function citedProvisions(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => citedProvisions(item, found))
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (key === "provisionKey" && typeof item === "string") {
        found.add(item)
      } else {
        citedProvisions(item, found)
      }
    }
  }
  return found
}

/** The fence fixture's rules file, parsed with rulesFile: a fresh copy each call. */
export function fenceRulesFile(): T.RulesFile {
  const sample = sampleDeclarationRulesFile()
  const rules = [
    ...sample.rules.filter((rule) => rule.key.startsWith("declaration:4.")),
    ...[...guidelineRules, ...exampleRules, ...packetRules].map(storedRule)
  ]
  const sampleKeys = new Set(sample.terms.map((term) => term.key))
  const terms = [
    ...sample.terms,
    ...[...exampleTerms, ...completedTerms]
      .filter((term) => !sampleKeys.has(term.key))
      .map((term) => storedTerm(refined(term)))
  ]
  // Applications don't reach the liability and sanction clauses, whose exceptions name rules outside the fixture.
  const settings = {
    ...sample.settings,
    clauses: { ...sample.settings.clauses, liability: [], sanctionPreconditions: [] }
  }

  // The sample's provisions the records cite, with their ancestors so selectors reach them; the ancestors nothing
  // cites are headings here.
  const cited = citedProvisions([rules, terms, sample.proposedCore, settings])
  const byKey = new Map(sample.provisions.map((provision) => [provision.key, provision]))
  const needed = new Map<string, T.Provision>()
  const selected = rules.flatMap((rule) =>
    (rule.kind === "norm" || rule.kind === "discretion") && !Array.isArray(rule.overrides)
      ? rule.overrides.provisions
      : []
  )
  for (const key of [...cited, ...selected]) {
    for (let current = byKey.get(key); current && !needed.has(current.key);) {
      needed.set(current.key, current)
      const documentKey = current.key.slice(0, current.key.indexOf(":"))
      current = current.parentLabel === null ? undefined : byKey.get(`${documentKey}:${current.parentLabel}`)
    }
  }
  const provisions = [
    ...[...needed.values()].map((provision) =>
      cited.has(provision.key) || provision.noRule
        ? provision
        : { ...provision, noRule: { reason: "heading" as const, note: null, review: proposed } }
    ),
    ...Object.entries(guidelineSummaries).map(([provisionLabel, text]) => guidelineProvision(provisionLabel, text))
  ]

  return rulesFile.parse({
    organization: sample.organization,
    documents: sample.documents.map((document) => (document.key === "guidelines" ? ex.guidelines : document)),
    provisions,
    terms,
    proposedCore: sample.proposedCore,
    rules,
    settings,
    questions: []
  })
}

// ─── The request ──────────────────────────────────────────────────────────────────────────────────

const extracted = { by: "extraction" as const, at: "2026-09-05T10:00:00Z" }

const fact = (
  entity: string,
  propertyKey: string,
  factValue: T.FactValue | null,
  state: T.Fact["state"] = "known"
): T.Fact => ({
  entity,
  property: propertyKey,
  state,
  value: factValue,
  candidates: [],
  complete: null,
  stated: null,
  evidence: [],
  confidence: state === "known" ? 0.95 : null,
  provenance: extracted
})
const term = (key: string, text: string): T.FactValue => ({ type: "value", term: key, text })

export const runs = ["run-1", "run-2", "run-3", "run-4"]

function runFacts(id: string, location: string, boundaryWith: string | null): T.Fact[] {
  return [
    fact(id, "fence-run.location", term(`fence-location.${location}`, location)),
    boundaryWith
      ? fact(id, "fence-run.boundary-with", term(`boundary.${boundaryWith}`, boundaryWith))
      : fact(id, "fence-run.boundary-with", null, "absent"),
    fact(id, "fence-run.material", term("fence-material.composite", "composite")),
    fact(id, "fence-run.manufacturer", term("composite-manufacturer.trex", "Trex")),
    fact(id, "fence-run.color", term("composite-color.river-birch", "River Birch")),
    fact(id, "fence-run.board-orientation", term("board-orientation.horizontal", "horizontal")),
    fact(id, "fence-run.lattice-height", null, "absent"),
    fact(id, "fence-run.arbor-height", null, "absent")
  ]
}

/** The sample application, submitted 2026-09-04, as the review pipeline would hand it to the engine. */
export function fenceRequest(): T.EvaluationRequest {
  return {
    organizationId: SAMPLE,
    type: "architectural-application",
    governingDate: "2026-09-04",
    evaluationDate: "2026-09-10",
    lot: "lot",
    entities: [
      { id: "request", type: "architectural-application", label: "Fence application", ref: null },
      { id: "lot", type: "lot", label: "The applicant's Unit", ref: null },
      { id: "community", type: "community", label: "The community", ref: null },
      { id: "work-1", type: "work", label: "Replace the fence", ref: null },
      { id: "run-1", type: "fence-run", label: "Left side run", ref: null },
      { id: "run-2", type: "fence-run", label: "Right side run", ref: null },
      { id: "run-3", type: "fence-run", label: "Rear run, along the permanent open space tract", ref: null },
      {
        id: "run-4",
        type: "fence-run",
        label: "Short run from the left side line to the garage's front corner",
        ref: null
      },
      { id: "gate-1", type: "gate", label: "Gate on the return run", ref: null },
      { id: "owner-1", type: "owner", label: "The owner on the form and the appendix", ref: null },
      { id: "owner-2", type: "owner", label: "The second owner, named in the appendix", ref: null }
    ],
    facts: [
      ...runFacts("run-1", "side", "lot"),
      ...runFacts("run-2", "side", "lot"),
      ...runFacts("run-3", "rear", "open-space"),
      ...runFacts("run-4", "return", null),
      fact("gate-1", "gate.fence-run", { type: "entity", entity: "run-4" }),
      fact("gate-1", "gate.material", term("fence-material.composite", "composite")),
      fact("gate-1", "gate.board-orientation", term("board-orientation.vertical", "vertical")),
      fact("gate-1", "gate.arbor-height", null, "absent"),
      fact("gate-1", "gate.new-opening", { type: "boolean", value: false }),
      fact("work-1", "work.kind", term("work-kind.new-structure", "replace the fence")),
      fact("work-1", "work.performed-by", term("owner", "the owners")),
      // The submission date and the Reviewer's fee policy come from the portal, not the packet.
      {
        ...fact("request", "architectural-application.submitted-on", { type: "date", value: "2026-09-04" }),
        provenance: system
      },
      {
        ...fact("request", "architectural-application.review-fee", { type: "quantity", value: 50, unit: "usd" }),
        provenance: system
      }
    ],
    documents: [
      { id: "file-form", type: "application-form", subjects: ["request"], signedBy: ["owner-1"] },
      { id: "file-appendix", type: "project-description", subjects: ["request"], signedBy: [] },
      { id: "file-checklist", type: "checklist", subjects: ["request"], signedBy: [] },
      { id: "file-plot-plan", type: "plot-plan", subjects: ["request", ...runs, "gate-1"], signedBy: [] },
      { id: "file-photos", type: "photo", subjects: ["request", ...runs, "gate-1"], signedBy: [] },
      { id: "file-specification", type: "product-specification", subjects: ["request"], signedBy: [] }
    ]
  }
}

/** A document reader's review confirming every statement a rule's document check needs. */
export function confirmedReview(file: T.RulesFile, ruleKey: string, entity: string): DocumentReview {
  const rule = file.rules.find((found) => found.key === ruleKey)
  const check = rule?.kind === "norm" ? rule.check : null
  const mustState = check?.type === "document" ? check.mustState : []
  return { ruleKey, entity, statements: mustState.map((statement) => ({ statement, confirmed: true, quote: null })) }
}
/** The document reader confirmed the plans; the model couldn't judge harmony confidently from the photos. */
export function fenceAnswers(): Answers {
  return {
    documentReviews: [confirmedReview(sampleDeclarationRulesFile(), "declaration:4.3(b)#plans", "request")],

    judgments: [
      {
        ruleKey: "declaration:4.3(b)/p2#harmony",
        entity: "work-1",
        answer: "unclear",
        confidence: 0.55,
        rationale: "The photos show the fence, but not enough of the neighboring homes to judge harmony.",
        evidence: []
      }
    ],
    conditionAnswers: []
  }
}
